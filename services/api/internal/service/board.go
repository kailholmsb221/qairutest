// Package service holds the use-cases between httpapi and engine/repo:
// an in-memory catalogue + snapshot cache per building, invalidated by overrides and the scheduler.
package service

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"

	"campuslive/api/internal/clock"
	"campuslive/api/internal/domain"
	"campuslive/api/internal/engine"
	"campuslive/api/internal/repo"
)

// ErrNotFound mirrors repo.ErrNotFound for the HTTP layer.
var ErrNotFound = repo.ErrNotFound

// Snapshot is the engine snapshot plus the announcements visible at that instant.
type Snapshot struct {
	domain.Snapshot
	Announcements []domain.Announcement
	ETag          string
}

type catalogCache struct {
	building  domain.Building
	floors    []domain.Floor
	rooms     []domain.Room // all rooms, sorted by floor/code
	semesters []domain.Semester
	teachers  map[string]domain.Teacher
	courses   map[string]domain.Course
	groups    map[string]domain.Group
	slots     map[string]domain.TimeSlot
	slotList  []domain.TimeSlot
	lessons   map[string][]domain.Lesson // by semester id
	roomMap   map[string]domain.Room
	loadedAt  time.Time
}

type liveCache struct {
	snapshot Snapshot
	builtAt  time.Time
}

// Board is the per-building read model.
type Board struct {
	repo  *repo.Repo
	clock clock.Clock
	cfg   engine.Thresholds

	mu       sync.RWMutex
	catalogs map[string]*catalogCache
	live     map[string]*liveCache

	invalidateMu sync.Mutex
	invalidate   map[string]chan struct{}
}

// NewBoard creates the read model.
func NewBoard(r *repo.Repo, clk clock.Clock, cfg engine.Thresholds) *Board {
	return &Board{repo: r, clock: clk, cfg: cfg, catalogs: map[string]*catalogCache{}, live: map[string]*liveCache{}, invalidate: map[string]chan struct{}{}}
}

// Clock exposes the service clock.
func (b *Board) Clock() clock.Clock { return b.clock }

// Thresholds exposes the engine thresholds.
func (b *Board) Thresholds() engine.Thresholds { return b.cfg }

// Invalidated returns a channel that receives a tick whenever the building's data changed
// (admin override, announcement) — the scheduler rebuilds immediately.
func (b *Board) Invalidated(code string) <-chan struct{} { return b.invalidateChan(code) }

func (b *Board) invalidateChan(code string) chan struct{} {
	b.invalidateMu.Lock()
	defer b.invalidateMu.Unlock()
	ch, ok := b.invalidate[code]
	if !ok {
		ch = make(chan struct{}, 1)
		b.invalidate[code] = ch
	}
	return ch
}

// Invalidate drops the cached snapshot and pokes the scheduler.
func (b *Board) Invalidate(code string) {
	b.mu.Lock()
	delete(b.live, code)
	b.mu.Unlock()
	select {
	case b.invalidateChan(code) <- struct{}{}:
	default:
	}
}

// ReloadCatalog drops the cached catalogue (after a seed run).
func (b *Board) ReloadCatalog(code string) {
	b.mu.Lock()
	delete(b.catalogs, code)
	delete(b.live, code)
	b.mu.Unlock()
}

// BuildingCodes lists the codes of all buildings.
func (b *Board) BuildingCodes(ctx context.Context) ([]string, error) {
	bs, _, err := b.repo.Buildings(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(bs))
	for _, x := range bs {
		out = append(out, x.Code)
	}
	return out, nil
}

func (b *Board) catalog(ctx context.Context, code string) (*catalogCache, error) {
	b.mu.RLock()
	c, ok := b.catalogs[code]
	b.mu.RUnlock()
	if ok {
		return c, nil
	}
	c, err := b.loadCatalog(ctx, code)
	if err != nil {
		return nil, err
	}
	b.mu.Lock()
	b.catalogs[code] = c
	b.mu.Unlock()
	return c, nil
}

func (b *Board) loadCatalog(ctx context.Context, code string) (*catalogCache, error) {
	building, err := b.repo.BuildingByCode(ctx, code)
	if err != nil {
		return nil, err
	}
	floors, err := b.repo.Floors(ctx, building.ID)
	if err != nil {
		return nil, err
	}
	rooms, err := b.repo.Rooms(ctx, building.ID)
	if err != nil {
		return nil, err
	}
	teachers, err := b.repo.Teachers(ctx)
	if err != nil {
		return nil, err
	}
	courses, err := b.repo.Courses(ctx)
	if err != nil {
		return nil, err
	}
	groups, err := b.repo.Groups(ctx)
	if err != nil {
		return nil, err
	}
	slots, err := b.repo.TimeSlots(ctx, building.ID)
	if err != nil {
		return nil, err
	}
	semesters, err := b.repo.Semesters(ctx)
	if err != nil {
		return nil, err
	}
	c := &catalogCache{
		building: building, floors: floors, rooms: rooms, semesters: semesters,
		teachers: map[string]domain.Teacher{}, courses: map[string]domain.Course{}, groups: map[string]domain.Group{},
		slots: map[string]domain.TimeSlot{}, slotList: slots, lessons: map[string][]domain.Lesson{}, roomMap: map[string]domain.Room{},
		loadedAt: b.clock.Now(),
	}
	for _, t := range teachers {
		c.teachers[t.ID] = t
	}
	for _, x := range courses {
		c.courses[x.ID] = x
	}
	for _, g := range groups {
		c.groups[g.ID] = g
	}
	for _, s := range slots {
		c.slots[s.ID] = s
	}
	for _, r := range rooms {
		c.roomMap[r.ID] = r
	}
	for _, s := range semesters {
		ls, err := b.repo.Lessons(ctx, s.ID)
		if err != nil {
			return nil, err
		}
		c.lessons[s.ID] = ls
	}
	return c, nil
}

// semesterFor picks the semester containing d; when none does, the closest one (its lessons will not
// materialise anyway, but week info and slots stay meaningful).
func (c *catalogCache) semesterFor(d domain.Date) domain.Semester {
	var best domain.Semester
	bestDist := -1
	for _, s := range c.semesters {
		if s.Contains(d) {
			return s
		}
		dist := d.DaysSince(s.StartsOn)
		if dist < 0 {
			dist = -dist
		}
		if bestDist < 0 || dist < bestDist {
			best, bestDist = s, dist
		}
	}
	return best
}

func (c *catalogCache) domainCatalog(d domain.Date) domain.Catalog {
	return domain.Catalog{
		Building: c.building,
		Semester: c.semesterFor(d),
		Rooms:    c.roomMap,
		Teachers: c.teachers,
		Courses:  c.courses,
		Groups:   c.groups,
		Slots:    c.slots,
	}
}

// Building returns the cached building.
func (b *Board) Building(ctx context.Context, code string) (domain.Building, error) {
	c, err := b.catalog(ctx, code)
	if err != nil {
		return domain.Building{}, err
	}
	return c.building, nil
}

// Map returns floors and rooms of a building (for /map).
func (b *Board) Map(ctx context.Context, code string) (domain.Building, []domain.Floor, []domain.Room, error) {
	c, err := b.catalog(ctx, code)
	if err != nil {
		return domain.Building{}, nil, nil, err
	}
	return c.building, c.floors, c.rooms, nil
}

// Slots returns the building's time slots as absolute instants on a date.
func (b *Board) Slots(ctx context.Context, code string, d domain.Date) ([]domain.TimeSlot, *time.Location, error) {
	c, err := b.catalog(ctx, code)
	if err != nil {
		return nil, nil, err
	}
	return c.slotList, c.building.Loc, nil
}

// Timeline materialises the sessions of a local date.
func (b *Board) Timeline(ctx context.Context, code string, d domain.Date) ([]domain.Session, domain.Building, error) {
	c, err := b.catalog(ctx, code)
	if err != nil {
		return nil, domain.Building{}, err
	}
	overrides, err := b.repo.OverridesByDate(ctx, d)
	if err != nil {
		return nil, domain.Building{}, err
	}
	cat := c.domainCatalog(d)
	sessions := engine.BuildDayTimeline(cat, d, c.lessons[cat.Semester.ID], overrides)
	return sessions, c.building, nil
}

// SnapshotAt computes a snapshot for an arbitrary instant (time-travel, SSR). date overrides the
// local date of at (rarely needed).
func (b *Board) SnapshotAt(ctx context.Context, code string, at time.Time, date *domain.Date) (Snapshot, error) {
	c, err := b.catalog(ctx, code)
	if err != nil {
		return Snapshot{}, err
	}
	d := domain.DateIn(at, c.building.Loc)
	if date != nil {
		d = *date
	}
	sessions, _, err := b.Timeline(ctx, code, d)
	if err != nil {
		return Snapshot{}, err
	}
	snap := engine.ComputeSnapshot(c.domainCatalog(d), sessions, at, b.cfg)
	if date != nil {
		snap.Date = d
	}
	ann, err := b.repo.ActiveAnnouncements(ctx, c.building.ID, at)
	if err != nil {
		return Snapshot{}, err
	}
	out := Snapshot{Snapshot: snap, Announcements: ann}
	out.ETag = etagOf(out)
	return out, nil
}

// Current returns the cached live snapshot, building it when absent.
func (b *Board) Current(ctx context.Context, code string) (Snapshot, error) {
	b.mu.RLock()
	lc, ok := b.live[code]
	b.mu.RUnlock()
	if ok {
		return lc.snapshot, nil
	}
	return b.Rebuild(ctx, code)
}

// Rebuild recomputes the live snapshot at clock.Now() and caches it.
func (b *Board) Rebuild(ctx context.Context, code string) (Snapshot, error) {
	now := b.clock.Now()
	snap, err := b.SnapshotAt(ctx, code, now, nil)
	if err != nil {
		return Snapshot{}, err
	}
	b.mu.Lock()
	b.live[code] = &liveCache{snapshot: snap, builtAt: now}
	b.mu.Unlock()
	return snap, nil
}

// NextWakeup tells the scheduler how long to sleep after a rebuild: until the next engine
// transition or the next local midnight (date change), capped at max.
func (b *Board) NextWakeup(snap Snapshot, loc *time.Location, max time.Duration) time.Duration {
	now := b.clock.Now()
	wait := max
	if snap.NextTransitionAt != nil {
		if d := snap.NextTransitionAt.Sub(now); d < wait {
			wait = d
		}
	}
	if loc != nil {
		midnight := domain.DateIn(now, loc).AddDays(1).Midnight(loc)
		if d := midnight.Sub(now); d < wait {
			wait = d
		}
	}
	if wait < 250*time.Millisecond {
		wait = 250 * time.Millisecond
	}
	return wait
}

// ---------------------------------------------------------------- day views

// RoomDay lists the sessions of a room on a date.
func (b *Board) RoomDay(ctx context.Context, roomCode string, d domain.Date) (domain.Room, []domain.Session, error) {
	room, buildingID, err := b.repo.RoomByCode(ctx, roomCode)
	if err != nil {
		return domain.Room{}, nil, err
	}
	code, err := b.buildingCodeByID(ctx, buildingID)
	if err != nil {
		return domain.Room{}, nil, err
	}
	sessions, _, err := b.Timeline(ctx, code, d)
	if err != nil {
		return domain.Room{}, nil, err
	}
	var out []domain.Session
	for _, s := range sessions {
		if s.Room.ID == room.ID || (s.MovedFrom != nil && s.MovedFrom.ID == room.ID) {
			out = append(out, s)
		}
	}
	return room, out, nil
}

// TeacherDay lists the sessions of a teacher on a date across all buildings.
func (b *Board) TeacherDay(ctx context.Context, teacherID string, d domain.Date) (domain.Teacher, []domain.Session, error) {
	t, err := b.repo.Teacher(ctx, teacherID)
	if err != nil {
		return domain.Teacher{}, nil, err
	}
	sessions, err := b.allSessions(ctx, d)
	if err != nil {
		return domain.Teacher{}, nil, err
	}
	var out []domain.Session
	for _, s := range sessions {
		if s.Teacher.ID == t.ID {
			out = append(out, s)
		}
	}
	return t, out, nil
}

// GroupDay lists the sessions of a student group on a date.
func (b *Board) GroupDay(ctx context.Context, groupCode string, d domain.Date) (domain.Group, []domain.Session, error) {
	g, err := b.repo.GroupByCode(ctx, groupCode)
	if err != nil {
		return domain.Group{}, nil, err
	}
	sessions, err := b.allSessions(ctx, d)
	if err != nil {
		return domain.Group{}, nil, err
	}
	var out []domain.Session
	for _, s := range sessions {
		for _, code := range s.Groups {
			if code == g.Code {
				out = append(out, s)
				break
			}
		}
	}
	return g, out, nil
}

func (b *Board) allSessions(ctx context.Context, d domain.Date) ([]domain.Session, error) {
	codes, err := b.BuildingCodes(ctx)
	if err != nil {
		return nil, err
	}
	var out []domain.Session
	for _, code := range codes {
		ss, _, err := b.Timeline(ctx, code, d)
		if err != nil {
			return nil, err
		}
		out = append(out, ss...)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].StartAt.Before(out[j].StartAt) })
	return out, nil
}

func (b *Board) buildingCodeByID(ctx context.Context, id string) (string, error) {
	bs, _, err := b.repo.Buildings(ctx)
	if err != nil {
		return "", err
	}
	for _, x := range bs {
		if x.ID == id {
			return x.Code, nil
		}
	}
	return "", ErrNotFound
}

// ---------------------------------------------------------------- admin

// OverrideInput is the validated admin request.
type OverrideInput struct {
	Kind         domain.OverrideKind
	Date         domain.Date
	LessonID     *string
	NewRoomCode  *string
	NewTeacherID *string
	DelayMinutes *int
	CourseCode   *string
	RoomCode     *string
	TeacherID    *string
	SlotIdx      *int
	Groups       []string
	Note         *string
}

// ValidationError is a 400.
type ValidationError struct{ Msg string }

func (e ValidationError) Error() string { return e.Msg }

// CreateOverride validates, stores and invalidates.
func (b *Board) CreateOverride(ctx context.Context, in OverrideInput) (domain.Override, error) {
	o := domain.Override{Kind: in.Kind, Date: in.Date, Note: in.Note}
	var buildingCode string
	switch in.Kind {
	case domain.OverrideCancel, domain.OverrideMove, domain.OverrideDelay, domain.OverrideReassignTeacher:
		if in.LessonID == nil || *in.LessonID == "" {
			return domain.Override{}, ValidationError{"lessonId is required"}
		}
		lesson, err := b.repo.Lesson(ctx, *in.LessonID)
		if err != nil {
			if errors.Is(err, repo.ErrNotFound) {
				return domain.Override{}, ValidationError{"lesson not found"}
			}
			return domain.Override{}, err
		}
		o.LessonID = &lesson.ID
		buildingCode, err = b.buildingOfRoomID(ctx, lesson.RoomID)
		if err != nil {
			return domain.Override{}, err
		}
	}
	switch in.Kind {
	case domain.OverrideMove:
		if in.NewRoomCode == nil {
			return domain.Override{}, ValidationError{"newRoomCode is required for move"}
		}
		room, _, err := b.repo.RoomByCode(ctx, *in.NewRoomCode)
		if err != nil {
			return domain.Override{}, ValidationError{"newRoomCode not found"}
		}
		if !room.Schedulable {
			return domain.Override{}, ValidationError{"target room is not schedulable"}
		}
		o.NewRoomID = &room.ID
	case domain.OverrideDelay:
		if in.DelayMinutes == nil || *in.DelayMinutes <= 0 || *in.DelayMinutes > 180 {
			return domain.Override{}, ValidationError{"delayMinutes must be 1..180"}
		}
		o.DelayMinutes = in.DelayMinutes
	case domain.OverrideReassignTeacher:
		if in.NewTeacherID == nil {
			return domain.Override{}, ValidationError{"newTeacherId is required"}
		}
		if _, err := b.repo.Teacher(ctx, *in.NewTeacherID); err != nil {
			return domain.Override{}, ValidationError{"newTeacherId not found"}
		}
		o.NewTeacherID = in.NewTeacherID
	case domain.OverrideExtra:
		if in.CourseCode == nil || in.RoomCode == nil || in.TeacherID == nil || in.SlotIdx == nil {
			return domain.Override{}, ValidationError{"extra needs courseCode, roomCode, teacherId and slotIdx"}
		}
		course, err := b.repo.CourseByCode(ctx, *in.CourseCode)
		if err != nil {
			return domain.Override{}, ValidationError{"courseCode not found"}
		}
		room, buildingID, err := b.repo.RoomByCode(ctx, *in.RoomCode)
		if err != nil {
			return domain.Override{}, ValidationError{"roomCode not found"}
		}
		if _, err := b.repo.Teacher(ctx, *in.TeacherID); err != nil {
			return domain.Override{}, ValidationError{"teacherId not found"}
		}
		buildingCode, err = b.buildingCodeByID(ctx, buildingID)
		if err != nil {
			return domain.Override{}, err
		}
		c, err := b.catalog(ctx, buildingCode)
		if err != nil {
			return domain.Override{}, err
		}
		var slotID string
		for _, s := range c.slotList {
			if s.Idx == *in.SlotIdx {
				slotID = s.ID
			}
		}
		if slotID == "" {
			return domain.Override{}, ValidationError{"slotIdx not found"}
		}
		for _, code := range in.Groups {
			g, err := b.repo.GroupByCode(ctx, code)
			if err != nil {
				return domain.Override{}, ValidationError{fmt.Sprintf("group %s not found", code)}
			}
			o.GroupIDs = append(o.GroupIDs, g.ID)
		}
		o.CourseID, o.RoomID, o.TeacherID, o.SlotID = &course.ID, &room.ID, in.TeacherID, &slotID
	case domain.OverrideCancel:
	default:
		return domain.Override{}, ValidationError{"unknown kind"}
	}
	stored, err := b.repo.InsertOverride(ctx, o)
	if err != nil {
		return domain.Override{}, err
	}
	b.Invalidate(buildingCode)
	return stored, nil
}

// DeleteOverride removes an override and invalidates the building.
func (b *Board) DeleteOverride(ctx context.Context, id string) error {
	o, err := b.repo.Override(ctx, id)
	if err != nil {
		return err
	}
	if err := b.repo.DeleteOverride(ctx, id); err != nil {
		return err
	}
	code := ""
	switch {
	case o.LessonID != nil:
		if l, err := b.repo.Lesson(ctx, *o.LessonID); err == nil {
			code, _ = b.buildingOfRoomID(ctx, l.RoomID)
		}
	case o.RoomID != nil:
		code, _ = b.buildingOfRoomID(ctx, *o.RoomID)
	}
	if code == "" {
		codes, _ := b.BuildingCodes(ctx)
		for _, c := range codes {
			b.Invalidate(c)
		}
		return nil
	}
	b.Invalidate(code)
	return nil
}

func (b *Board) buildingOfRoomID(ctx context.Context, roomID string) (string, error) {
	codes, err := b.BuildingCodes(ctx)
	if err != nil {
		return "", err
	}
	for _, code := range codes {
		c, err := b.catalog(ctx, code)
		if err != nil {
			return "", err
		}
		if _, ok := c.roomMap[roomID]; ok {
			return code, nil
		}
	}
	return "", ErrNotFound
}

// CreateAnnouncement stores a ticker line and invalidates the building.
func (b *Board) CreateAnnouncement(ctx context.Context, code, text string, severity domain.Severity, duration time.Duration) (domain.Announcement, error) {
	c, err := b.catalog(ctx, code)
	if err != nil {
		return domain.Announcement{}, err
	}
	now := b.clock.Now().UTC()
	a, err := b.repo.InsertAnnouncement(ctx, c.building.ID, domain.Announcement{Text: text, Severity: severity, StartsAt: now, EndsAt: now.Add(duration)})
	if err != nil {
		return domain.Announcement{}, err
	}
	b.Invalidate(code)
	return a, nil
}

// TimeInfo describes the clock for /api/v1/time.
type TimeInfo struct {
	Now        time.Time
	Mode       clock.Mode
	Timezone   string
	LocalDate  domain.Date
	WeekNumber int
	Parity     domain.Parity
}

// Time returns the server time for the first building (the demo has one).
func (b *Board) Time(ctx context.Context) (TimeInfo, error) {
	now := b.clock.Now().UTC()
	info := TimeInfo{Now: now, Mode: b.clock.Mode(), Timezone: "UTC", LocalDate: domain.DateOf(now), Parity: domain.ParityOdd}
	codes, err := b.BuildingCodes(ctx)
	if err != nil || len(codes) == 0 {
		return info, err
	}
	c, err := b.catalog(ctx, codes[0])
	if err != nil {
		return info, err
	}
	info.Timezone = c.building.Timezone
	info.LocalDate = domain.DateIn(now, c.building.Loc)
	info.WeekNumber, info.Parity = engine.WeekInfo(c.semesterFor(info.LocalDate), info.LocalDate)
	return info, nil
}

// Search runs the unified search.
func (b *Board) Search(ctx context.Context, q string) (repo.SearchHit, error) {
	return b.repo.Search(ctx, q)
}

// Ready reports whether the database answers and a snapshot can be built.
func (b *Board) Ready(ctx context.Context) error {
	if err := b.repo.Ping(ctx); err != nil {
		return err
	}
	codes, err := b.BuildingCodes(ctx)
	if err != nil {
		return err
	}
	if len(codes) == 0 {
		return errors.New("no buildings seeded")
	}
	_, err = b.Current(ctx, codes[0])
	return err
}

func etagOf(s Snapshot) string {
	raw, _ := json.Marshal(struct {
		At   time.Time
		Now  []domain.Session
		Next []domain.Session
		Ann  []domain.Announcement
		R    []domain.RoomState
	}{s.At, s.Now, s.Next, s.Announcements, s.Rooms})
	sum := sha1.Sum(raw)
	return `"` + hex.EncodeToString(sum[:8]) + `"`
}
