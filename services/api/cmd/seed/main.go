// Command seed migrates the database and (re)generates the deterministic demo data set.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"

	"campuslive/api/internal/clock"
	"campuslive/api/internal/config"
	"campuslive/api/internal/repo"
	"campuslive/api/internal/seed"
)

func main() {
	opts := seed.DefaultOptions()
	flag.Int64Var(&opts.Seed, "seed", opts.Seed, "random seed")
	flag.Float64Var(&opts.Occupancy, "occupancy", opts.Occupancy, "share of weekday room×slot cells with a lesson")
	flag.IntVar(&opts.OverrideDays, "override-days", opts.OverrideDays, "generate overrides for today .. today+N")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		fail(err)
	}
	clk, err := clock.FromConfig(cfg.ClockMode, cfg.ClockFixedAt, cfg.ClockOffset)
	if err != nil {
		fail(err)
	}
	ctx := context.Background()
	if err := repo.Migrate(ctx, cfg.DatabaseURL); err != nil {
		fail(fmt.Errorf("migrate: %w", err))
	}
	r, err := repo.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		fail(err)
	}
	defer r.Close()
	rep, err := seed.Run(ctx, r, cfg.MapPath, clk, opts)
	if err != nil {
		fail(fmt.Errorf("seed: %w", err))
	}
	fmt.Printf("✔ seed %s: rooms %d (schedulable %d), teachers %d, groups %d, courses %d, slots %d, lessons %d, overrides %d\n",
		rep.Semester, rep.Rooms, rep.Schedulable, rep.Teachers, rep.Groups, rep.Courses, rep.Slots, rep.Lessons, rep.Overrides)
}

func fail(err error) {
	slog.Error("seed failed", "err", err)
	os.Exit(1)
}
