// Package domain holds the pure types shared by the engine, the repository and the HTTP layer.
// No I/O, no framework imports.
package domain

import (
	"fmt"
	"time"
)

// Date is a calendar date in the building's local time zone.
type Date struct {
	Year  int
	Month time.Month
	Day   int
}

// ParseDate parses YYYY-MM-DD.
func ParseDate(s string) (Date, error) {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return Date{}, fmt.Errorf("date %q: %w", s, err)
	}
	return DateOf(t), nil
}

// DateOf takes the calendar date of t in t's own location.
func DateOf(t time.Time) Date {
	y, m, d := t.Date()
	return Date{Year: y, Month: m, Day: d}
}

// DateIn takes the calendar date of the instant t as seen in loc.
func DateIn(t time.Time, loc *time.Location) Date { return DateOf(t.In(loc)) }

func (d Date) String() string { return fmt.Sprintf("%04d-%02d-%02d", d.Year, d.Month, d.Day) }

// Midnight is the start of the day in loc.
func (d Date) Midnight(loc *time.Location) time.Time {
	return time.Date(d.Year, d.Month, d.Day, 0, 0, 0, 0, loc)
}

// At builds the instant of local time-of-day (minutes since midnight) on this date in loc.
func (d Date) At(minutes int, loc *time.Location) time.Time {
	return time.Date(d.Year, d.Month, d.Day, 0, minutes, 0, 0, loc)
}

// AddDays returns the date n days later.
func (d Date) AddDays(n int) Date {
	return DateOf(time.Date(d.Year, d.Month, d.Day+n, 0, 0, 0, 0, time.UTC))
}

// Weekday is ISO-like: Monday=1 … Sunday=7.
func (d Date) Weekday() int {
	wd := int(time.Date(d.Year, d.Month, d.Day, 0, 0, 0, 0, time.UTC).Weekday())
	if wd == 0 {
		return 7
	}
	return wd
}

// DaysSince returns d - o in days.
func (d Date) DaysSince(o Date) int {
	a := time.Date(d.Year, d.Month, d.Day, 0, 0, 0, 0, time.UTC)
	b := time.Date(o.Year, o.Month, o.Day, 0, 0, 0, 0, time.UTC)
	return int(a.Sub(b).Hours() / 24)
}

func (d Date) Before(o Date) bool { return d.DaysSince(o) < 0 }
func (d Date) After(o Date) bool  { return d.DaysSince(o) > 0 }
func (d Date) Equal(o Date) bool  { return d == o }

// ---------------------------------------------------------------- catalogue

type Building struct {
	ID       string
	Code     string
	Name     string
	Timezone string
	Loc      *time.Location
}

type Floor struct {
	ID      string
	Number  int
	PlanKey string
	Name    string
}

type RoomType string

const (
	RoomLecture   RoomType = "lecture"
	RoomSeminar   RoomType = "seminar"
	RoomLab       RoomType = "lab"
	RoomCoworking RoomType = "coworking"
	RoomAdmin     RoomType = "admin"
	RoomService   RoomType = "service"
	RoomVoid      RoomType = "void"
)

type Wing string

const (
	WingWest Wing = "west"
	WingEast Wing = "east"
	WingCore Wing = "core"
)

type BBox struct{ X, Y, W, H float64 }
type Point struct{ X, Y float64 }

type Geometry struct {
	Path  string `json:"path"`
	Label Point  `json:"label"`
	BBox  BBox   `json:"bbox"`
}

type Room struct {
	ID          string
	MapID       string
	Code        string
	Name        string
	MapLabel    string
	Floor       int
	Type        RoomType
	MapType     string
	Wing        Wing
	Schedulable bool
	Capacity    *int
	Area        *float64
	Geometry    Geometry
}

type Teacher struct {
	ID         string
	FullName   string
	ShortName  string
	Department *string
}

type Group struct {
	ID         string
	Code       string
	Program    *string
	CourseYear *int
}

type Course struct {
	ID         string
	Code       string
	Title      string
	Department *string
}

type Parity string

const (
	ParityOdd  Parity = "odd"
	ParityEven Parity = "even"
)

// Flip returns the other parity.
func (p Parity) Flip() Parity {
	if p == ParityOdd {
		return ParityEven
	}
	return ParityOdd
}

type Semester struct {
	ID          string
	Name        string
	StartsOn    Date
	EndsOn      Date
	Week1Parity Parity
}

// Contains reports whether d lies inside the semester (inclusive).
func (s Semester) Contains(d Date) bool { return !d.Before(s.StartsOn) && !d.After(s.EndsOn) }

// TimeSlot is a lesson slot in local time-of-day (minutes since midnight).
type TimeSlot struct {
	ID       string
	Idx      int
	StartMin int
	EndMin   int
}

type LessonType string

const (
	LessonLecture  LessonType = "lecture"
	LessonPractice LessonType = "practice"
	LessonLab      LessonType = "lab"
)

type WeekParity string

const (
	WeekAll  WeekParity = "all"
	WeekOdd  WeekParity = "odd"
	WeekEven WeekParity = "even"
)

// Lesson is a recurring template; a concrete day is materialised by the engine.
type Lesson struct {
	ID         string
	SemesterID string
	CourseID   string
	TeacherID  string
	RoomID     string
	SlotID     string
	Weekday    int // 1 = Monday
	Parity     WeekParity
	Type       LessonType
	GroupIDs   []string
}

type OverrideKind string

const (
	OverrideCancel          OverrideKind = "cancel"
	OverrideMove            OverrideKind = "move"
	OverrideDelay           OverrideKind = "delay"
	OverrideReassignTeacher OverrideKind = "reassign_teacher"
	OverrideExtra           OverrideKind = "extra"
)

// Override is a point change on a specific date.
type Override struct {
	ID           string
	LessonID     *string
	Date         Date
	Kind         OverrideKind
	NewRoomID    *string
	NewTeacherID *string
	DelayMinutes *int
	// extra
	CourseID  *string
	SlotID    *string
	RoomID    *string
	TeacherID *string
	GroupIDs  []string
	Note      *string
	CreatedAt time.Time
}

type Severity string

const (
	SeverityInfo    Severity = "info"
	SeverityWarning Severity = "warning"
	SeverityAlert   Severity = "alert"
)

type Announcement struct {
	ID       string
	Text     string
	Severity Severity
	StartsAt time.Time
	EndsAt   time.Time
}

// ---------------------------------------------------------------- computed

type SessionStatus string

const (
	StatusScheduled SessionStatus = "scheduled"
	StatusCancelled SessionStatus = "cancelled"
	StatusMoved     SessionStatus = "moved"
	StatusDelayed   SessionStatus = "delayed"
	StatusExtra     SessionStatus = "extra"
)

type Phase string

const (
	PhaseUpcoming  Phase = "upcoming"
	PhaseSoon      Phase = "soon"
	PhaseLive      Phase = "live"
	PhaseEnding    Phase = "ending"
	PhaseDone      Phase = "done"
	PhaseCancelled Phase = "cancelled"
)

type RoomPhase string

const (
	RoomFree   RoomPhase = "free"
	RoomSoon   RoomPhase = "soon"
	RoomLive   RoomPhase = "live"
	RoomEnding RoomPhase = "ending"
)

// Session is a concrete lesson on a concrete date with absolute timestamps. Never stored.
type Session struct {
	ID           string // "{lessonId}:{date}" or "x:{overrideId}"
	LessonID     *string
	Course       Course
	Teacher      Teacher
	Room         Room
	Groups       []string // group codes
	Type         LessonType
	StartAt      time.Time
	EndAt        time.Time
	Status       SessionStatus
	MovedFrom    *Room
	DelayMinutes *int
	Note         *string
	Conflict     bool
	Phase        Phase // filled by ComputeSnapshot / PhaseAt
}

// RoomState is the live state of one schedulable room.
type RoomState struct {
	Room      Room
	Phase     RoomPhase
	Current   *Session
	Next      *Session
	FreeUntil *time.Time
	Conflict  bool
}

type Stats struct {
	RoomsTotal    int
	RoomsBusy     int
	SessionsToday int
	SessionsDone  int
}

// Snapshot is what the board shows at instant At.
type Snapshot struct {
	Building         string
	At               time.Time
	Date             Date
	NextTransitionAt *time.Time
	Stats            Stats
	Rooms            []RoomState
	Now              []Session
	Next             []Session
}

// Catalog is everything the engine needs besides lessons and overrides.
type Catalog struct {
	Building Building
	Semester Semester
	Rooms    map[string]Room
	Teachers map[string]Teacher
	Courses  map[string]Course
	Groups   map[string]Group
	Slots    map[string]TimeSlot
}
