// Package repo is the persistence layer: pgx + sqlc-generated queries, mapped to domain types.
package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"campuslive/api/internal/domain"
	"campuslive/api/internal/repo/db"
	"campuslive/api/migrations"
)

// ErrNotFound is returned when an entity does not exist.
var ErrNotFound = errors.New("not found")

// Repo wraps a connection pool.
type Repo struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

// Connect opens the pool and pings the database.
func Connect(ctx context.Context, url string) (*Repo, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	cfg.MaxConns = 8
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return &Repo{pool: pool, q: db.New(pool)}, nil
}

// Close releases the pool.
func (r *Repo) Close() { r.pool.Close() }

// Ping checks connectivity (readyz).
func (r *Repo) Ping(ctx context.Context) error { return r.pool.Ping(ctx) }

// Queries exposes the generated queries (seed).
func (r *Repo) Queries() *db.Queries { return r.q }

// WithTx runs fn inside a transaction.
func (r *Repo) WithTx(ctx context.Context, fn func(q *db.Queries) error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(r.q.WithTx(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Migrate applies goose migrations embedded in the binary.
func Migrate(ctx context.Context, url string) error {
	goose.SetBaseFS(migrations.FS)
	goose.SetLogger(goose.NopLogger())
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	cfg, err := pgx.ParseConfig(url)
	if err != nil {
		return err
	}
	sqlDB := stdlib.OpenDB(*cfg)
	defer sqlDB.Close()
	return goose.UpContext(ctx, sqlDB, ".")
}

// ---------------------------------------------------------------- reads

// Buildings lists all buildings with their floor count.
func (r *Repo) Buildings(ctx context.Context) ([]domain.Building, []int, error) {
	rows, err := r.q.ListBuildings(ctx)
	if err != nil {
		return nil, nil, err
	}
	out := make([]domain.Building, 0, len(rows))
	floors := make([]int, 0, len(rows))
	for _, b := range rows {
		bd, err := toBuilding(b.ID, b.Code, b.Name, b.Timezone)
		if err != nil {
			return nil, nil, err
		}
		out = append(out, bd)
		floors = append(floors, int(b.Floors))
	}
	return out, floors, nil
}

// BuildingByCode returns one building.
func (r *Repo) BuildingByCode(ctx context.Context, code string) (domain.Building, error) {
	b, err := r.q.GetBuildingByCode(ctx, code)
	if err != nil {
		return domain.Building{}, wrapNotFound(err)
	}
	return toBuilding(b.ID, b.Code, b.Name, b.Timezone)
}

func toBuilding(id, code, name, tz string) (domain.Building, error) {
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return domain.Building{}, fmt.Errorf("building %s: timezone %q: %w", code, tz, err)
	}
	return domain.Building{ID: id, Code: code, Name: name, Timezone: tz, Loc: loc}, nil
}

// Floors lists the floors of a building.
func (r *Repo) Floors(ctx context.Context, buildingID string) ([]domain.Floor, error) {
	rows, err := r.q.ListFloors(ctx, buildingID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Floor, 0, len(rows))
	for _, f := range rows {
		out = append(out, domain.Floor{ID: f.ID, Number: int(f.Number), PlanKey: f.PlanKey, Name: f.Name})
	}
	return out, nil
}

// Rooms lists every room of a building.
func (r *Repo) Rooms(ctx context.Context, buildingID string) ([]domain.Room, error) {
	rows, err := r.q.ListRoomsByBuilding(ctx, buildingID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Room, 0, len(rows))
	for _, row := range rows {
		room, err := toRoom(row.ID, row.MapID, row.Code, row.Name, row.MapLabel, int(row.Floor), string(row.Type), row.MapType, string(row.Wing), row.Schedulable, row.Capacity, row.Area, row.Geometry)
		if err != nil {
			return nil, err
		}
		out = append(out, room)
	}
	return out, nil
}

// RoomByCode returns one room and its building id.
func (r *Repo) RoomByCode(ctx context.Context, code string) (domain.Room, string, error) {
	row, err := r.q.GetRoomByCode(ctx, code)
	if err != nil {
		return domain.Room{}, "", wrapNotFound(err)
	}
	room, err := toRoom(row.ID, row.MapID, row.Code, row.Name, row.MapLabel, int(row.Floor), string(row.Type), row.MapType, string(row.Wing), row.Schedulable, row.Capacity, row.Area, row.Geometry)
	return room, row.BuildingID, err
}

func toRoom(id, mapID, code, name, mapLabel string, floor int, typ, mapType, wing string, schedulable bool, capacity *int32, area *float64, geometry []byte) (domain.Room, error) {
	var g domain.Geometry
	if len(geometry) > 0 {
		if err := json.Unmarshal(geometry, &g); err != nil {
			return domain.Room{}, fmt.Errorf("room %s geometry: %w", code, err)
		}
	}
	var cap *int
	if capacity != nil {
		c := int(*capacity)
		cap = &c
	}
	return domain.Room{
		ID: id, MapID: mapID, Code: code, Name: name, MapLabel: mapLabel, Floor: floor,
		Type: domain.RoomType(typ), MapType: mapType, Wing: domain.Wing(wing), Schedulable: schedulable,
		Capacity: cap, Area: area, Geometry: g,
	}, nil
}

// Teachers lists all teachers.
func (r *Repo) Teachers(ctx context.Context) ([]domain.Teacher, error) {
	rows, err := r.q.ListTeachers(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Teacher, 0, len(rows))
	for _, t := range rows {
		out = append(out, domain.Teacher{ID: t.ID, FullName: t.FullName, ShortName: t.ShortName, Department: t.Department})
	}
	return out, nil
}

// Teacher returns one teacher.
func (r *Repo) Teacher(ctx context.Context, id string) (domain.Teacher, error) {
	t, err := r.q.GetTeacher(ctx, id)
	if err != nil {
		return domain.Teacher{}, wrapNotFound(err)
	}
	return domain.Teacher{ID: t.ID, FullName: t.FullName, ShortName: t.ShortName, Department: t.Department}, nil
}

// Groups lists all student groups.
func (r *Repo) Groups(ctx context.Context) ([]domain.Group, error) {
	rows, err := r.q.ListGroups(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Group, 0, len(rows))
	for _, g := range rows {
		out = append(out, toGroup(g.ID, g.Code, g.Program, g.CourseYear))
	}
	return out, nil
}

// GroupByCode returns one group.
func (r *Repo) GroupByCode(ctx context.Context, code string) (domain.Group, error) {
	g, err := r.q.GetGroupByCode(ctx, code)
	if err != nil {
		return domain.Group{}, wrapNotFound(err)
	}
	return toGroup(g.ID, g.Code, g.Program, g.CourseYear), nil
}

func toGroup(id, code string, program *string, year *int16) domain.Group {
	var y *int
	if year != nil {
		v := int(*year)
		y = &v
	}
	return domain.Group{ID: id, Code: code, Program: program, CourseYear: y}
}

// Courses lists all courses.
func (r *Repo) Courses(ctx context.Context) ([]domain.Course, error) {
	rows, err := r.q.ListCourses(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Course, 0, len(rows))
	for _, c := range rows {
		out = append(out, domain.Course{ID: c.ID, Code: c.Code, Title: c.Title, Department: c.Department})
	}
	return out, nil
}

// CourseByCode returns one course.
func (r *Repo) CourseByCode(ctx context.Context, code string) (domain.Course, error) {
	c, err := r.q.GetCourseByCode(ctx, code)
	if err != nil {
		return domain.Course{}, wrapNotFound(err)
	}
	return domain.Course{ID: c.ID, Code: c.Code, Title: c.Title, Department: c.Department}, nil
}

// Semesters lists all semesters ordered by start.
func (r *Repo) Semesters(ctx context.Context) ([]domain.Semester, error) {
	rows, err := r.q.ListSemesters(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Semester, 0, len(rows))
	for _, s := range rows {
		out = append(out, domain.Semester{ID: s.ID, Name: s.Name, StartsOn: domain.DateOf(s.StartsOn.Time), EndsOn: domain.DateOf(s.EndsOn.Time), Week1Parity: domain.Parity(s.Week1Parity)})
	}
	return out, nil
}

// TimeSlots lists the slots of a building.
func (r *Repo) TimeSlots(ctx context.Context, buildingID string) ([]domain.TimeSlot, error) {
	rows, err := r.q.ListTimeSlots(ctx, buildingID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.TimeSlot, 0, len(rows))
	for _, s := range rows {
		out = append(out, domain.TimeSlot{ID: s.ID, Idx: int(s.Idx), StartMin: int(s.StartsAt.Microseconds / 60_000_000), EndMin: int(s.EndsAt.Microseconds / 60_000_000)})
	}
	return out, nil
}

// Lessons lists all lesson templates of a semester.
func (r *Repo) Lessons(ctx context.Context, semesterID string) ([]domain.Lesson, error) {
	rows, err := r.q.ListLessonsBySemester(ctx, semesterID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Lesson, 0, len(rows))
	for _, l := range rows {
		out = append(out, domain.Lesson{ID: l.ID, SemesterID: l.SemesterID, CourseID: l.CourseID, TeacherID: l.TeacherID, RoomID: l.RoomID, SlotID: l.SlotID, Weekday: int(l.Weekday), Parity: domain.WeekParity(l.Parity), Type: domain.LessonType(l.Type), GroupIDs: l.GroupIds})
	}
	return out, nil
}

// Lesson returns one lesson template.
func (r *Repo) Lesson(ctx context.Context, id string) (domain.Lesson, error) {
	l, err := r.q.GetLesson(ctx, id)
	if err != nil {
		return domain.Lesson{}, wrapNotFound(err)
	}
	return domain.Lesson{ID: l.ID, SemesterID: l.SemesterID, CourseID: l.CourseID, TeacherID: l.TeacherID, RoomID: l.RoomID, SlotID: l.SlotID, Weekday: int(l.Weekday), Parity: domain.WeekParity(l.Parity), Type: domain.LessonType(l.Type), GroupIDs: l.GroupIds}, nil
}

// OverridesByDate lists the overrides of a date.
func (r *Repo) OverridesByDate(ctx context.Context, d domain.Date) ([]domain.Override, error) {
	rows, err := r.q.ListOverridesByDate(ctx, toPgDate(d))
	if err != nil {
		return nil, err
	}
	out := make([]domain.Override, 0, len(rows))
	for _, o := range rows {
		out = append(out, toOverride(o))
	}
	return out, nil
}

// Override returns one override.
func (r *Repo) Override(ctx context.Context, id string) (domain.Override, error) {
	o, err := r.q.GetOverride(ctx, id)
	if err != nil {
		return domain.Override{}, wrapNotFound(err)
	}
	return toOverride(o), nil
}

// InsertOverride stores a new override.
func (r *Repo) InsertOverride(ctx context.Context, o domain.Override) (domain.Override, error) {
	var delay *int32
	if o.DelayMinutes != nil {
		d := int32(*o.DelayMinutes)
		delay = &d
	}
	groups := o.GroupIDs
	if groups == nil {
		groups = []string{}
	}
	row, err := r.q.InsertOverride(ctx, db.InsertOverrideParams{
		LessonID: o.LessonID, Date: toPgDate(o.Date), Kind: db.OverrideKind(o.Kind),
		NewRoomID: o.NewRoomID, NewTeacherID: o.NewTeacherID, DelayMinutes: delay,
		CourseID: o.CourseID, SlotID: o.SlotID, RoomID: o.RoomID, TeacherID: o.TeacherID, GroupIds: groups, Note: o.Note,
	})
	if err != nil {
		return domain.Override{}, err
	}
	return toOverride(row), nil
}

// DeleteOverride removes an override; ErrNotFound when it does not exist.
func (r *Repo) DeleteOverride(ctx context.Context, id string) error {
	n, err := r.q.DeleteOverride(ctx, id)
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// InsertLesson stores a weekly lesson template with its groups in one transaction.
func (r *Repo) InsertLesson(ctx context.Context, l domain.Lesson) (domain.Lesson, error) {
	var id string
	err := r.WithTx(ctx, func(q *db.Queries) error {
		var err error
		id, err = q.InsertLesson(ctx, db.InsertLessonParams{
			SemesterID: l.SemesterID, CourseID: l.CourseID, TeacherID: l.TeacherID, RoomID: l.RoomID, SlotID: l.SlotID,
			Weekday: int16(l.Weekday), Parity: db.WeekParity(l.Parity), Type: db.LessonType(l.Type),
		})
		if err != nil {
			return err
		}
		for _, g := range l.GroupIDs {
			if err := q.InsertLessonGroup(ctx, db.InsertLessonGroupParams{LessonID: id, GroupID: g}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return domain.Lesson{}, err
	}
	return r.Lesson(ctx, id)
}

// DeleteLesson removes a lesson template (its groups and overrides cascade); ErrNotFound when absent.
func (r *Repo) DeleteLesson(ctx context.Context, id string) error {
	n, err := r.q.DeleteLesson(ctx, id)
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func toOverride(o db.SessionOverride) domain.Override {
	var delay *int
	if o.DelayMinutes != nil {
		d := int(*o.DelayMinutes)
		delay = &d
	}
	return domain.Override{
		ID: o.ID, LessonID: o.LessonID, Date: domain.DateOf(o.Date.Time), Kind: domain.OverrideKind(o.Kind),
		NewRoomID: o.NewRoomID, NewTeacherID: o.NewTeacherID, DelayMinutes: delay,
		CourseID: o.CourseID, SlotID: o.SlotID, RoomID: o.RoomID, TeacherID: o.TeacherID, GroupIDs: o.GroupIds, Note: o.Note,
		CreatedAt: o.CreatedAt.Time,
	}
}

// ActiveAnnouncements lists announcements visible at instant at.
func (r *Repo) ActiveAnnouncements(ctx context.Context, buildingID string, at time.Time) ([]domain.Announcement, error) {
	rows, err := r.q.ListActiveAnnouncements(ctx, db.ListActiveAnnouncementsParams{BuildingID: buildingID, StartsAt: pgtype.Timestamptz{Time: at, Valid: true}})
	if err != nil {
		return nil, err
	}
	out := make([]domain.Announcement, 0, len(rows))
	for _, a := range rows {
		out = append(out, domain.Announcement{ID: a.ID, Text: a.Text, Severity: domain.Severity(a.Severity), StartsAt: a.StartsAt.Time, EndsAt: a.EndsAt.Time})
	}
	return out, nil
}

// InsertAnnouncement stores a ticker line.
func (r *Repo) InsertAnnouncement(ctx context.Context, buildingID string, a domain.Announcement) (domain.Announcement, error) {
	row, err := r.q.InsertAnnouncement(ctx, db.InsertAnnouncementParams{
		BuildingID: buildingID, Text: a.Text, Severity: string(a.Severity),
		StartsAt: pgtype.Timestamptz{Time: a.StartsAt, Valid: true}, EndsAt: pgtype.Timestamptz{Time: a.EndsAt, Valid: true},
	})
	if err != nil {
		return domain.Announcement{}, err
	}
	return domain.Announcement{ID: row.ID, Text: row.Text, Severity: domain.Severity(row.Severity), StartsAt: row.StartsAt.Time, EndsAt: row.EndsAt.Time}, nil
}

// SearchHit bundles the four search result lists.
type SearchHit struct {
	Teachers []domain.Teacher
	Groups   []domain.Group
	Rooms    []domain.Room
	Courses  []domain.Course
}

// Search runs the four ILIKE searches.
func (r *Repo) Search(ctx context.Context, q string) (SearchHit, error) {
	var hit SearchHit
	ts, err := r.q.SearchTeachers(ctx, q)
	if err != nil {
		return hit, err
	}
	for _, t := range ts {
		hit.Teachers = append(hit.Teachers, domain.Teacher{ID: t.ID, FullName: t.FullName, ShortName: t.ShortName, Department: t.Department})
	}
	gs, err := r.q.SearchGroups(ctx, q)
	if err != nil {
		return hit, err
	}
	for _, g := range gs {
		hit.Groups = append(hit.Groups, toGroup(g.ID, g.Code, g.Program, g.CourseYear))
	}
	rs, err := r.q.SearchRooms(ctx, q)
	if err != nil {
		return hit, err
	}
	for _, rm := range rs {
		hit.Rooms = append(hit.Rooms, domain.Room{ID: rm.ID, Code: rm.Code, Name: rm.Name, Floor: int(rm.Floor), Type: domain.RoomType(rm.Type)})
	}
	cs, err := r.q.SearchCourses(ctx, q)
	if err != nil {
		return hit, err
	}
	for _, c := range cs {
		hit.Courses = append(hit.Courses, domain.Course{ID: c.ID, Code: c.Code, Title: c.Title, Department: c.Department})
	}
	return hit, nil
}

// ---------------------------------------------------------------- helpers

func toPgDate(d domain.Date) pgtype.Date {
	return pgtype.Date{Time: time.Date(d.Year, d.Month, d.Day, 0, 0, 0, 0, time.UTC), Valid: true}
}

func wrapNotFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}
