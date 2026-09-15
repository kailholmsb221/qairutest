package clock

import (
	"testing"
	"time"
)

func TestFromConfig(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name          string
		mode, at, off string
		wantMode      Mode
		wantErr       bool
	}{
		{"default real", "", "", "", ModeReal, false},
		{"real", "real", "", "", ModeReal, false},
		{"fixed", "fixed", "2026-09-08T10:47:00+05:00", "", ModeFixed, false},
		{"fixed bad", "fixed", "yesterday", "", "", true},
		{"offset", "offset", "", "-3h20m", ModeOffset, false},
		{"offset bad", "offset", "", "soon", "", true},
		{"unknown", "quantum", "", "", "", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			clk, err := FromConfig(c.mode, c.at, c.off)
			if c.wantErr {
				if err == nil {
					t.Fatalf("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if clk.Mode() != c.wantMode {
				t.Fatalf("mode = %s, want %s", clk.Mode(), c.wantMode)
			}
		})
	}
}

func TestFixedAndOffset(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 9, 8, 5, 47, 0, 0, time.UTC)
	if got := (Fixed{At: at}).Now(); !got.Equal(at) {
		t.Fatalf("fixed: %v", got)
	}
	o := Offset{Delta: -2 * time.Hour}
	if d := time.Since(o.Now()); d < 2*time.Hour-time.Second || d > 2*time.Hour+time.Second {
		t.Fatalf("offset drift: %v", d)
	}
	if d := OffsetTo(time.Now().Add(90 * time.Minute)); d < 89*time.Minute || d > 91*time.Minute {
		t.Fatalf("OffsetTo: %v", d)
	}
}
