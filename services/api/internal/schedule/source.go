// Package schedule defines how timetable data gets into the database.
//
// The engine, API and web app only ever see lessons / session_overrides, so replacing the
// demo generator with a real importer (xlsx from the dean's office, an LMS API) is a matter
// of adding another Source implementation. Room mapping is by rooms.code.
package schedule

import (
	"context"
	"time"

	"campuslive/api/internal/clock"
	"campuslive/api/internal/repo"
	"campuslive/api/internal/seed"
)

// SyncReport summarises a synchronisation run.
type SyncReport struct {
	Lessons   int
	Overrides int
	Note      string
}

// Source synchronises lesson templates and overrides for a period into the database.
type Source interface {
	Sync(ctx context.Context, from, to time.Time) (SyncReport, error)
}

// SeedSource is the deterministic mock generator (v1).
type SeedSource struct {
	Repo    *repo.Repo
	MapPath string
	Clock   clock.Clock
	Options seed.Options
}

// Sync regenerates the whole demo data set; from/to are ignored because the generator
// always produces a full semester around "today".
func (s SeedSource) Sync(ctx context.Context, _, _ time.Time) (SyncReport, error) {
	rep, err := seed.Run(ctx, s.Repo, s.MapPath, s.Clock, s.Options)
	if err != nil {
		return SyncReport{}, err
	}
	return SyncReport{Lessons: rep.Lessons, Overrides: rep.Overrides, Note: "seed " + rep.Semester}, nil
}
