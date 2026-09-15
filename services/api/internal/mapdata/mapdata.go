// Package mapdata reads packages/map-data/building-a.json — the single source of room identity.
package mapdata

import (
	"encoding/json"
	"fmt"
	"os"
)

// Building mirrors building-a.json.
type Building struct {
	Building string    `json:"building"`
	Name     string    `json:"name"`
	Timezone string    `json:"timezone"`
	ViewBox  []float64 `json:"viewBox"`
	Floors   []Floor   `json:"floors"`
}

// Floor is one storey with its rooms.
type Floor struct {
	Number  int    `json:"number"`
	PlanKey string `json:"planKey"`
	Name    string `json:"name"`
	Rooms   []Room `json:"rooms"`
}

// Room is the identity + geometry of one space.
type Room struct {
	ID          string   `json:"id"`
	Code        string   `json:"code"`
	Name        string   `json:"name"`
	MapLabel    string   `json:"mapLabel"`
	Type        string   `json:"type"`
	MapType     string   `json:"mapType"`
	Wing        string   `json:"wing"`
	Schedulable bool     `json:"schedulable"`
	Capacity    *int     `json:"capacity"`
	Area        *float64 `json:"area"`
	BBox        BBox     `json:"bbox"`
	Label       Point    `json:"label"`
	Path        string   `json:"path"`
}

type BBox struct{ X, Y, W, H float64 }
type Point struct{ X, Y float64 }

// Load reads and validates the file.
func Load(path string) (Building, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Building{}, fmt.Errorf("read map %s: %w", path, err)
	}
	var b Building
	if err := json.Unmarshal(raw, &b); err != nil {
		return Building{}, fmt.Errorf("parse map %s: %w", path, err)
	}
	if b.Building == "" || len(b.Floors) == 0 {
		return Building{}, fmt.Errorf("map %s: empty building", path)
	}
	seen := map[string]bool{}
	for _, f := range b.Floors {
		for _, r := range f.Rooms {
			if r.Code == "" || r.Path == "" {
				return Building{}, fmt.Errorf("map %s: room %q without code/path", path, r.ID)
			}
			if seen[r.Code] {
				return Building{}, fmt.Errorf("map %s: duplicate room code %q", path, r.Code)
			}
			seen[r.Code] = true
		}
	}
	return b, nil
}
