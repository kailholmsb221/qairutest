// Package clock is the only place in the service that may call time.Now().
// Everything else receives a Clock through its constructor, which makes
// snapshots, e2e tests and screenshots deterministic (CLOCK_MODE=fixed|offset).
package clock

import (
	"fmt"
	"time"
)

// Clock is the service-wide source of "now".
type Clock interface {
	Now() time.Time
	Mode() Mode
}

// Mode names the clock implementation for /api/v1/time.
type Mode string

const (
	ModeReal   Mode = "real"
	ModeFixed  Mode = "fixed"
	ModeOffset Mode = "offset"
)

// Real returns the wall clock.
type Real struct{}

func (Real) Now() time.Time { return time.Now() }
func (Real) Mode() Mode     { return ModeReal }

// Fixed always returns the same instant.
type Fixed struct{ At time.Time }

func (f Fixed) Now() time.Time { return f.At }
func (Fixed) Mode() Mode       { return ModeFixed }

// Offset returns wall time shifted by a constant duration.
type Offset struct{ Delta time.Duration }

func (o Offset) Now() time.Time { return time.Now().Add(o.Delta) }
func (Offset) Mode() Mode       { return ModeOffset }

// FromConfig builds a Clock from CLOCK_MODE / CLOCK_FIXED_AT / CLOCK_OFFSET values.
func FromConfig(mode, fixedAt, offset string) (Clock, error) {
	switch Mode(mode) {
	case "", ModeReal:
		return Real{}, nil
	case ModeFixed:
		at, err := time.Parse(time.RFC3339, fixedAt)
		if err != nil {
			return nil, fmt.Errorf("CLOCK_FIXED_AT: %w", err)
		}
		return Fixed{At: at}, nil
	case ModeOffset:
		d, err := time.ParseDuration(offset)
		if err != nil {
			return nil, fmt.Errorf("CLOCK_OFFSET: %w", err)
		}
		return Offset{Delta: d}, nil
	default:
		return nil, fmt.Errorf("CLOCK_MODE: unknown mode %q", mode)
	}
}

// OffsetTo computes the CLOCK_OFFSET that makes "now" equal to target at the moment of the call.
// Used by the demo scripts ("now is Tuesday 10:47").
func OffsetTo(target time.Time) time.Duration { return target.Sub(time.Now()) }
