// Command api runs the CampusLive HTTP + SSE service.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"campuslive/api/internal/clock"
	"campuslive/api/internal/config"
	"campuslive/api/internal/engine"
	"campuslive/api/internal/httpapi"
	"campuslive/api/internal/realtime"
	"campuslive/api/internal/repo"
	"campuslive/api/internal/scheduler"
	"campuslive/api/internal/seed"
	"campuslive/api/internal/service"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	level := slog.LevelInfo
	switch strings.ToLower(cfg.LogLevel) {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	}
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level}))
	slog.SetDefault(log)

	clk, err := clock.FromConfig(cfg.ClockMode, cfg.ClockFixedAt, cfg.ClockOffset)
	if err != nil {
		return err
	}
	log.Info("clock", "mode", clk.Mode(), "now", clk.Now().UTC().Format(time.RFC3339))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if cfg.MigrateOnStart {
		if err := repo.Migrate(ctx, cfg.DatabaseURL); err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
	}
	r, err := repo.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer r.Close()

	if cfg.SeedOnStart {
		n, err := r.Queries().CountBuildings(ctx)
		if err != nil {
			return err
		}
		if n == 0 {
			rep, err := seed.Run(ctx, r, cfg.MapPath, clk, seed.DefaultOptions())
			if err != nil {
				return fmt.Errorf("seed: %w", err)
			}
			log.Info("seeded", "rooms", rep.Rooms, "lessons", rep.Lessons, "overrides", rep.Overrides, "semester", rep.Semester)
		}
	}

	thresholds := engine.Thresholds{SoonWindow: cfg.SoonWindow, EndingWindow: cfg.EndingWindow, NextHorizon: cfg.NextHorizon}
	board := service.NewBoard(r, clk, thresholds)
	broker := realtime.New(realtime.Options{Heartbeat: 25 * time.Second, ClientBuffer: 16, Now: clk.Now})

	codes, err := board.BuildingCodes(ctx)
	if err != nil {
		return err
	}
	var wg sync.WaitGroup
	for _, code := range codes {
		s := &scheduler.Scheduler{Board: board, Broker: broker, Log: log, Encode: httpapi.EncodeSnapshot, MaxSleep: 5 * time.Minute}
		wg.Add(1)
		go func(code string) {
			defer wg.Done()
			s.Run(ctx, code)
		}(code)
	}

	handler := httpapi.NewRouter(httpapi.Deps{Board: board, Broker: broker, Log: log, AdminAPIKey: cfg.AdminAPIKey, CORSOrigins: cfg.CORSOrigins, Version: cfg.Version})
	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		// no WriteTimeout: SSE connections are long-lived
	}
	errCh := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", srv.Addr, "buildings", codes)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
	case err := <-errCh:
		return err
	}
	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	stop() // cancel schedulers + SSE contexts
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Warn("shutdown", "err", err)
	}
	wg.Wait()
	return nil
}
