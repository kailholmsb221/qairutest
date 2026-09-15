// Package scheduler sleeps until the next phase boundary, rebuilds the snapshot and broadcasts it.
//
//	loop:
//	  snap := board.Rebuild(building)
//	  broker.Publish(building, "snapshot", snap)
//	  wait := min(snap.NextTransitionAt - now, next local midnight - now, MaxSleep)
//	  select { <-time.After(wait) | <-board.Invalidated(building) | <-ctx.Done() }
package scheduler

import (
	"context"
	"log/slog"
	"time"

	"campuslive/api/internal/realtime"
	"campuslive/api/internal/service"
)

// Scheduler drives one building.
type Scheduler struct {
	Board  *service.Board
	Broker *realtime.Broker
	Log    *slog.Logger
	// Encode turns a snapshot into the wire JSON (the HTTP layer owns the DTO mapping).
	Encode func(service.Snapshot) ([]byte, error)
	// MaxSleep caps the wait between rebuilds (safety net; 5 min by default).
	MaxSleep time.Duration
	// Rebuilt, when set, is called after every broadcast (tests, metrics).
	Rebuilt func(service.Snapshot)
}

// Run blocks until ctx is done.
func (s *Scheduler) Run(ctx context.Context, building string) {
	if s.MaxSleep <= 0 {
		s.MaxSleep = 5 * time.Minute
	}
	log := s.Log
	if log == nil {
		log = slog.Default()
	}
	invalidated := s.Board.Invalidated(building)
	backoff := time.Second
	for {
		snap, err := s.Board.Rebuild(ctx, building)
		var wait time.Duration
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Error("scheduler: rebuild failed", "building", building, "err", err)
			wait = backoff
			if backoff < 30*time.Second {
				backoff *= 2
			}
		} else {
			backoff = time.Second
			data, err := s.Encode(snap)
			if err != nil {
				log.Error("scheduler: encode failed", "err", err)
			} else {
				s.Broker.Publish(building, realtime.Event{Name: "snapshot", Data: data})
			}
			if s.Rebuilt != nil {
				s.Rebuilt(snap)
			}
			b, _ := s.Board.Building(ctx, building)
			wait = s.Board.NextWakeup(snap, b.Loc, s.MaxSleep)
			log.Debug("scheduler: snapshot", "building", building, "now", len(snap.Now), "next", len(snap.Next), "sleep", wait.Round(time.Second))
		}
		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-invalidated:
			timer.Stop()
		case <-timer.C:
		}
	}
}
