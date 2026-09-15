// Package seed generates the deterministic demo data set (seed 42) from building-a.json.
//
// It is one implementation of schedule.Source: a real timetable importer would produce
// the same lessons / session_overrides tables from an Excel file or an LMS API.
package seed

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"campuslive/api/internal/clock"
	"campuslive/api/internal/domain"
	"campuslive/api/internal/mapdata"
	"campuslive/api/internal/repo"
	"campuslive/api/internal/repo/db"
)

// Options control the generator.
type Options struct {
	Seed      int64
	Occupancy float64 // share of room×slot cells on weekdays that get a lesson (0.7)
	// OverrideDays: overrides (2 cancellations, 1 move, 1 delay per weekday) are generated for
	// today-7 … today+OverrideDays so the board always shows "interesting" statuses.
	OverrideDays int
}

// DefaultOptions are the architecture's demo numbers.
func DefaultOptions() Options { return Options{Seed: 42, Occupancy: 0.70, OverrideDays: 21} }

// Report summarises what was written.
type Report struct {
	Rooms, Schedulable, Teachers, Groups, Courses, Slots, Lessons, Overrides int
	Semester                                                                 string
}

// Run truncates the database and writes the full demo data set.
func Run(ctx context.Context, r *repo.Repo, mapPath string, clk clock.Clock, opts Options) (Report, error) {
	b, err := mapdata.Load(mapPath)
	if err != nil {
		return Report{}, err
	}
	var rep Report
	err = r.WithTx(ctx, func(q *db.Queries) error {
		var e error
		rep, e = generate(ctx, q, b, clk, opts)
		return e
	})
	return rep, err
}

type roomRef struct {
	id       string
	code     string
	typ      string
	capacity int
	tag      string // theme: "film", "ai", "it", "sport", ""
}

func generate(ctx context.Context, q *db.Queries, b mapdata.Building, clk clock.Clock, opts Options) (Report, error) {
	rng := rand.New(rand.NewSource(opts.Seed))
	var rep Report
	if err := q.TruncateAll(ctx); err != nil {
		return rep, err
	}
	loc, err := time.LoadLocation(b.Timezone)
	if err != nil {
		return rep, err
	}
	buildingID, err := q.InsertBuilding(ctx, db.InsertBuildingParams{Code: b.Building, Name: b.Name, Timezone: b.Timezone})
	if err != nil {
		return rep, err
	}

	// ---- floors + rooms
	var schedulable []roomRef
	for _, f := range b.Floors {
		floorID, err := q.InsertFloor(ctx, db.InsertFloorParams{BuildingID: buildingID, Number: int32(f.Number), PlanKey: f.PlanKey, Name: f.Name})
		if err != nil {
			return rep, err
		}
		for _, rm := range f.Rooms {
			geom, _ := json.Marshal(map[string]any{
				"path":  rm.Path,
				"label": map[string]float64{"x": rm.Label.X, "y": rm.Label.Y},
				"bbox":  map[string]float64{"x": rm.BBox.X, "y": rm.BBox.Y, "w": rm.BBox.W, "h": rm.BBox.H},
			})
			var cap *int32
			if rm.Capacity != nil {
				c := int32(*rm.Capacity)
				cap = &c
			}
			id, err := q.InsertRoom(ctx, db.InsertRoomParams{
				FloorID: floorID, MapID: rm.ID, Code: rm.Code, Name: rm.Name, MapLabel: rm.MapLabel,
				Type: db.RoomType(rm.Type), MapType: rm.MapType, Wing: db.Wing(rm.Wing), Schedulable: rm.Schedulable,
				Capacity: cap, Area: rm.Area, Geometry: geom,
			})
			if err != nil {
				return rep, fmt.Errorf("room %s: %w", rm.Code, err)
			}
			rep.Rooms++
			if rm.Schedulable {
				c := 20
				if rm.Capacity != nil {
					c = *rm.Capacity
				}
				schedulable = append(schedulable, roomRef{id: id, code: rm.Code, typ: rm.Type, capacity: c, tag: themeOf(rm)})
			}
		}
	}
	rep.Schedulable = len(schedulable)
	if len(schedulable) == 0 {
		return rep, fmt.Errorf("no schedulable rooms in %s", b.Building)
	}

	// ---- teachers
	teacherIDs := make([]string, 0, len(teacherNames))
	teacherDept := map[string]string{}
	for i, n := range teacherNames {
		dept := departments[i%len(departments)]
		id, err := q.InsertTeacher(ctx, db.InsertTeacherParams{FullName: n.full, ShortName: n.short, Department: &dept})
		if err != nil {
			return rep, err
		}
		teacherIDs = append(teacherIDs, id)
		teacherDept[id] = dept
	}
	rep.Teachers = len(teacherIDs)

	// ---- semester containing today (building local date)
	today := domain.DateIn(clk.Now(), loc)
	sem := semesterFor(today)

	// ---- groups
	type groupRef struct{ id, code, program string }
	var groups []groupRef
	for _, p := range programs {
		for i := 1; i <= p.count; i++ {
			code := fmt.Sprintf("%s%s%02d", p.prefix, p.year, i)
			year := int16(today.Year - 2000 - atoi(p.year) + 1)
			if year < 1 {
				year = 1
			}
			id, err := q.InsertGroup(ctx, db.InsertGroupParams{Code: code, Program: &p.name, CourseYear: &year})
			if err != nil {
				return rep, err
			}
			groups = append(groups, groupRef{id: id, code: code, program: p.prefix})
		}
	}
	rep.Groups = len(groups)

	// ---- courses
	type courseRef struct {
		id, code, tag string
		lecture       bool
		lab           bool
	}
	var courses []courseRef
	for _, c := range courseList {
		dept := c.dept
		id, err := q.InsertCourse(ctx, db.InsertCourseParams{Code: c.code, Title: c.title, Department: &dept})
		if err != nil {
			return rep, err
		}
		courses = append(courses, courseRef{id: id, code: c.code, tag: c.tag, lecture: c.lecture, lab: c.lab})
	}
	rep.Courses = len(courses)

	semID, err := q.InsertSemester(ctx, db.InsertSemesterParams{Name: sem.Name, StartsOn: pgDate(sem.StartsOn), EndsOn: pgDate(sem.EndsOn), Week1Parity: string(sem.Week1Parity)})
	if err != nil {
		return rep, err
	}
	rep.Semester = sem.Name

	// ---- slots: 10 × 50 min with 10-min breaks, 08:00–17:50
	slotIDs := make([]string, 0, 10)
	for i := 0; i < 10; i++ {
		start := (8 + i) * 60
		id, err := q.InsertTimeSlot(ctx, db.InsertTimeSlotParams{
			BuildingID: buildingID, Idx: int16(i + 1),
			StartsAt: pgtype.Time{Microseconds: int64(start) * 60_000_000, Valid: true},
			EndsAt:   pgtype.Time{Microseconds: int64(start+50) * 60_000_000, Valid: true},
		})
		if err != nil {
			return rep, err
		}
		slotIDs = append(slotIDs, id)
	}
	rep.Slots = len(slotIDs)

	// ---- lessons: fill weekday × slot × room cells with ~occupancy, respecting teacher/group availability
	type cell struct{ weekday, slot int }
	teacherBusy := map[string]map[cell]bool{}
	groupBusy := map[string]map[cell]bool{}
	busy := func(m map[string]map[cell]bool, id string, c cell) bool { return m[id] != nil && m[id][c] }
	mark := func(m map[string]map[cell]bool, id string, c cell) {
		if m[id] == nil {
			m[id] = map[cell]bool{}
		}
		m[id][c] = true
	}
	// each teacher gets a stable subject area: courses of matching tag first
	teacherCourses := map[string][]courseRef{}
	for i, tid := range teacherIDs {
		tag := courseTagForDept(teacherDept[tid])
		var mine []courseRef
		for _, c := range courses {
			if c.tag == tag {
				mine = append(mine, c)
			}
		}
		if len(mine) == 0 {
			mine = courses
		}
		// two or three courses per teacher, rotated so that courses are shared by several teachers
		n := 2 + i%2
		start := (i * 3) % len(mine)
		for k := 0; k < n; k++ {
			teacherCourses[tid] = append(teacherCourses[tid], mine[(start+k)%len(mine)])
		}
	}
	groupsForTag := func(tag string, n int, c cell) []groupRef {
		var pool []groupRef
		for _, g := range groups {
			if programTag(g.program) == tag && !busy(groupBusy, g.id, c) {
				pool = append(pool, g)
			}
		}
		if len(pool) == 0 {
			for _, g := range groups {
				if !busy(groupBusy, g.id, c) {
					pool = append(pool, g)
				}
			}
		}
		rng.Shuffle(len(pool), func(i, j int) { pool[i], pool[j] = pool[j], pool[i] })
		if len(pool) > n {
			pool = pool[:n]
		}
		return pool
	}

	lessonIDs := make([]string, 0, 512)
	lessonRoom := map[string]roomRef{}
	lessonCell := map[string]cell{}
	for weekday := 1; weekday <= 5; weekday++ {
		for slot := 0; slot < len(slotIDs); slot++ {
			c := cell{weekday, slot}
			// late slots are emptier, lunch slot (13:00) too
			occ := opts.Occupancy
			switch {
			case slot >= 8:
				occ *= 0.45
			case slot == 5:
				occ *= 0.6
			}
			for _, room := range schedulable {
				if rng.Float64() > occ {
					continue
				}
				// pick a teacher who is free and has a course fitting the room
				var chosenT string
				var chosenC courseRef
				for try := 0; try < 12; try++ {
					tid := teacherIDs[rng.Intn(len(teacherIDs))]
					if busy(teacherBusy, tid, c) {
						continue
					}
					cs := teacherCourses[tid]
					cr := cs[rng.Intn(len(cs))]
					if !fits(room, cr.tag, cr.lab) {
						continue
					}
					chosenT, chosenC = tid, cr
					break
				}
				if chosenT == "" {
					continue
				}
				ltype, ngroups := lessonShape(room, chosenC.lecture, chosenC.lab, rng)
				gs := groupsForTag(courseTagForRoom(room, chosenC.tag), ngroups, c)
				if len(gs) == 0 {
					continue
				}
				parity := db.WeekParityAll
				if rng.Float64() < 0.2 {
					if rng.Intn(2) == 0 {
						parity = db.WeekParityOdd
					} else {
						parity = db.WeekParityEven
					}
				}
				id, err := q.InsertLesson(ctx, db.InsertLessonParams{
					SemesterID: semID, CourseID: chosenC.id, TeacherID: chosenT, RoomID: room.id, SlotID: slotIDs[slot],
					Weekday: int16(weekday), Parity: parity, Type: ltype,
				})
				if err != nil {
					return rep, err
				}
				for _, g := range gs {
					if err := q.InsertLessonGroup(ctx, db.InsertLessonGroupParams{LessonID: id, GroupID: g.id}); err != nil {
						return rep, err
					}
					mark(groupBusy, g.id, c)
				}
				mark(teacherBusy, chosenT, c)
				lessonIDs = append(lessonIDs, id)
				lessonRoom[id] = room
				lessonCell[id] = c
			}
		}
	}

	// weekly "Открытая лекция" in the big hall (Wednesday, slot 4)
	if hall := largestLecture(schedulable); hall != nil {
		c := cell{3, 3}
		var open courseRef
		for _, cr := range courses {
			if cr.code == "OPEN100" {
				open = cr
			}
		}
		tid := teacherIDs[0]
		for _, t := range teacherIDs {
			if !busy(teacherBusy, t, c) {
				tid = t
				break
			}
		}
		id, err := q.InsertLesson(ctx, db.InsertLessonParams{SemesterID: semID, CourseID: open.id, TeacherID: tid, RoomID: hall.id, SlotID: slotIDs[3], Weekday: 3, Parity: db.WeekParityAll, Type: db.LessonTypeLecture})
		if err != nil {
			return rep, err
		}
		gs := groupsForTag("it", 4, c)
		for _, g := range gs {
			if err := q.InsertLessonGroup(ctx, db.InsertLessonGroupParams{LessonID: id, GroupID: g.id}); err != nil {
				return rep, err
			}
		}
		lessonIDs = append(lessonIDs, id)
		lessonRoom[id] = *hall
		lessonCell[id] = c
	}
	rep.Lessons = len(lessonIDs)

	// ---- overrides: per weekday in the window, 2 cancellations, 1 move, 1 delay
	for d := today.AddDays(-7); !d.After(today.AddDays(opts.OverrideDays)); d = d.AddDays(1) {
		wd := d.Weekday()
		if wd > 5 || !sem.Contains(d) {
			continue
		}
		var candidates []string
		for _, id := range lessonIDs {
			if lessonCell[id].weekday == wd {
				candidates = append(candidates, id)
			}
		}
		if len(candidates) < 6 {
			continue
		}
		rng.Shuffle(len(candidates), func(i, j int) { candidates[i], candidates[j] = candidates[j], candidates[i] })
		date := pgDate(d)
		note1, note2 := "Преподаватель на конференции", "Отмена по техническим причинам"
		for i, note := range []string{note1, note2} {
			lid := candidates[i]
			if _, err := q.InsertOverride(ctx, db.InsertOverrideParams{LessonID: &lid, Date: date, Kind: db.OverrideKindCancel, GroupIds: []string{}, Note: &note}); err != nil {
				return rep, err
			}
			rep.Overrides++
		}
		// move: to a free room of the same kind in that cell
		{
			lid := candidates[2]
			from := lessonRoom[lid]
			c := lessonCell[lid]
			var target *roomRef
			for _, rr := range schedulable {
				if rr.id == from.id || rr.typ != from.typ {
					continue
				}
				taken := false
				for _, other := range lessonIDs {
					if lessonRoom[other].id == rr.id && lessonCell[other] == c {
						taken = true
						break
					}
				}
				if !taken {
					t := rr
					target = &t
					break
				}
			}
			if target != nil {
				note := "Перенос: ремонт проектора"
				if _, err := q.InsertOverride(ctx, db.InsertOverrideParams{LessonID: &lid, Date: date, Kind: db.OverrideKindMove, NewRoomID: &target.id, GroupIds: []string{}, Note: &note}); err != nil {
					return rep, err
				}
				rep.Overrides++
			}
		}
		// delay
		{
			lid := candidates[3]
			delay := int32(15)
			note := "Задержка: преподаватель в пути"
			if _, err := q.InsertOverride(ctx, db.InsertOverrideParams{LessonID: &lid, Date: date, Kind: db.OverrideKindDelay, DelayMinutes: &delay, GroupIds: []string{}, Note: &note}); err != nil {
				return rep, err
			}
			rep.Overrides++
		}
	}

	// ---- a standing announcement
	now := clk.Now().UTC()
	if _, err := q.InsertAnnouncement(ctx, db.InsertAnnouncementParams{
		BuildingID: buildingID, Text: "Добро пожаловать в CampusLive — живое расписание корпуса A", Severity: "info",
		StartsAt: pgtype.Timestamptz{Time: now.Add(-time.Hour), Valid: true}, EndsAt: pgtype.Timestamptz{Time: now.Add(24 * 365 * time.Hour), Valid: true},
	}); err != nil {
		return rep, err
	}
	return rep, nil
}

// ---------------------------------------------------------------- helpers

func pgDate(d domain.Date) pgtype.Date {
	return pgtype.Date{Time: time.Date(d.Year, d.Month, d.Day, 0, 0, 0, 0, time.UTC), Valid: true}
}

func atoi(s string) int {
	n := 0
	for _, ch := range s {
		n = n*10 + int(ch-'0')
	}
	return n
}

// semesterFor returns the academic semester that contains d.
func semesterFor(d domain.Date) domain.Semester {
	if d.Month >= time.September || d.Month == time.January {
		year := d.Year
		if d.Month == time.January {
			year--
		}
		return domain.Semester{Name: fmt.Sprintf("Осень %d", year), StartsOn: domain.Date{Year: year, Month: time.September, Day: 1}, EndsOn: domain.Date{Year: year + 1, Month: time.January, Day: 31}, Week1Parity: domain.ParityOdd}
	}
	return domain.Semester{Name: fmt.Sprintf("Весна %d", d.Year), StartsOn: domain.Date{Year: d.Year, Month: time.February, Day: 1}, EndsOn: domain.Date{Year: d.Year, Month: time.August, Day: 31}, Week1Parity: domain.ParityOdd}
}

func themeOf(r mapdata.Room) string {
	n := strings.ToLower(r.Name + " " + r.Code)
	switch {
	case strings.Contains(n, "ai"):
		return "ai"
	case strings.Contains(n, "павильон"):
		return "film"
	case strings.Contains(n, "информатик"), strings.Contains(n, "лаборатор"):
		return "it"
	}
	return ""
}

// fits: labs only in lab rooms, themed rooms only get their theme.
func fits(room roomRef, tag string, lab bool) bool {
	if room.tag != "" {
		return tag == room.tag || (room.tag == "it" && tag == "ai")
	}
	if lab {
		return room.typ == "lab"
	}
	return true
}

func lessonShape(room roomRef, lecture, lab bool, rng *rand.Rand) (db.LessonType, int) {
	switch {
	case room.typ == "lecture" || (lecture && room.capacity >= 60):
		return db.LessonTypeLecture, 2 + rng.Intn(3) // 2–4 groups
	case lab || room.typ == "lab":
		return db.LessonTypeLab, 1
	default:
		return db.LessonTypePractice, 1
	}
}

func largestLecture(rooms []roomRef) *roomRef {
	var best *roomRef
	for i := range rooms {
		r := &rooms[i]
		if r.typ == "lecture" && (best == nil || r.capacity > best.capacity) {
			best = r
		}
	}
	return best
}

func programTag(prefix string) string {
	switch prefix {
	case "МК", "РЖ":
		return "film"
	case "ФК":
		return "sport"
	case "БДА":
		return "ai"
	}
	return "it"
}

func courseTagForDept(dept string) string {
	switch dept {
	case "Кафедра медиа и кино":
		return "film"
	case "Кафедра спорта высших достижений":
		return "sport"
	case "Кафедра Data Science и ИИ":
		return "ai"
	case "Кафедра общих дисциплин":
		return "general"
	}
	return "it"
}

func courseTagForRoom(room roomRef, courseTag string) string {
	if room.tag != "" {
		return room.tag
	}
	if courseTag == "general" {
		return "it"
	}
	return courseTag
}

// ---------------------------------------------------------------- catalogue data (invented)

type name struct{ full, short string }

var teacherNames = func() []name {
	firsts := []struct{ first, patronymic string }{
		{"Дамир", "Болатович"}, {"Айгерим", "Нурлановна"}, {"Ерлан", "Серикович"}, {"Мария", "Сергеевна"},
		{"Асель", "Кайратовна"}, {"Алексей", "Владимирович"}, {"Нурсултан", "Бауыржанович"}, {"Динара", "Маратовна"},
		{"Тимур", "Асхатович"}, {"Ольга", "Игоревна"}, {"Бекзат", "Ержанович"}, {"Жанна", "Тлеубековна"},
		{"Сергей", "Павлович"}, {"Айдана", "Сакеновна"}, {"Руслан", "Талгатович"}, {"Елена", "Викторовна"},
		{"Даурен", "Кенжебекович"}, {"Камила", "Ринатовна"}, {"Игорь", "Анатольевич"}, {"Сауле", "Амангельдиевна"},
	}
	lasts := []string{"Ахметов", "Сейткали", "Жумабек", "Иванова", "Нурланова", "Петров", "Байжанов", "Оспанова", "Касымов", "Смирнова",
		"Ерланулы", "Абдрахманова", "Ковалёв", "Сарсенбаева", "Токтаров", "Морозова", "Мусин", "Абишева", "Лебедев", "Дюсенова"}
	var out []name
	for i := 0; i < 40; i++ {
		f := firsts[i%len(firsts)]
		l := lasts[(i*7+i/20)%len(lasts)]
		if i >= 20 {
			l = lasts[(i*3+5)%len(lasts)]
		}
		// female surnames get the feminine form when the first name is female
		female := strings.HasSuffix(f.patronymic, "на")
		if female && (strings.HasSuffix(l, "ов") || strings.HasSuffix(l, "ев") || strings.HasSuffix(l, "ин")) {
			l += "а"
		}
		if !female && strings.HasSuffix(l, "ова") {
			l = strings.TrimSuffix(l, "а")
		}
		if !female && strings.HasSuffix(l, "ева") {
			l = strings.TrimSuffix(l, "а")
		}
		short := fmt.Sprintf("%s %s.%s.", l, string([]rune(f.first)[:1]), string([]rune(f.patronymic)[:1]))
		out = append(out, name{full: fmt.Sprintf("%s %s %s", l, f.first, f.patronymic), short: short})
	}
	// guarantee uniqueness of short names
	seen := map[string]int{}
	for i := range out {
		seen[out[i].short]++
		if seen[out[i].short] > 1 {
			out[i].short = fmt.Sprintf("%s (%d)", out[i].short, seen[out[i].short])
		}
	}
	return out
}()

var departments = []string{
	"Кафедра программной инженерии", "Кафедра Data Science и ИИ", "Кафедра медиа и кино", "Кафедра кибербезопасности",
	"Кафедра спорта высших достижений", "Кафедра общих дисциплин", "Кафедра информационных систем",
}

var programs = []struct {
	prefix, year, name string
	count              int
}{
	{"ПО", "23", "Программная инженерия", 5},
	{"ИС", "23", "Информационные системы", 4},
	{"ВТ", "24", "Вычислительная техника", 4},
	{"БДА", "24", "Большие данные и аналитика", 3},
	{"КБ", "24", "Кибербезопасность", 3},
	{"МК", "24", "Медиакоммуникации", 4},
	{"РЖ", "25", "Режиссура кино и ТВ", 3},
	{"ФК", "25", "Физическая культура и спорт", 4},
}

var courseList = []struct {
	code, title, dept, tag string
	lecture, lab           bool
}{
	{"CS101", "Введение в программирование", "Кафедра программной инженерии", "it", true, true},
	{"CS102", "Алгоритмы и структуры данных", "Кафедра программной инженерии", "it", true, true},
	{"CS201", "Базы данных", "Кафедра программной инженерии", "it", true, true},
	{"CS202", "Операционные системы", "Кафедра программной инженерии", "it", true, true},
	{"CS203", "Компьютерные сети", "Кафедра информационных систем", "it", true, true},
	{"CS301", "Веб-разработка", "Кафедра программной инженерии", "it", false, true},
	{"CS302", "Мобильная разработка", "Кафедра программной инженерии", "it", false, true},
	{"CS303", "Архитектура ПО", "Кафедра программной инженерии", "it", true, false},
	{"CS304", "Тестирование и QA", "Кафедра программной инженерии", "it", false, true},
	{"CS305", "DevOps и облачные технологии", "Кафедра информационных систем", "it", false, true},
	{"CS306", "Проектирование интерфейсов", "Кафедра информационных систем", "it", false, false},
	{"CS401", "Дипломное проектирование", "Кафедра программной инженерии", "it", false, false},
	{"IS201", "Моделирование бизнес-процессов", "Кафедра информационных систем", "it", true, false},
	{"IS202", "ERP-системы", "Кафедра информационных систем", "it", false, true},
	{"IS301", "Управление IT-проектами", "Кафедра информационных систем", "it", true, false},
	{"SEC201", "Основы кибербезопасности", "Кафедра кибербезопасности", "it", true, true},
	{"SEC202", "Криптография", "Кафедра кибербезопасности", "it", true, false},
	{"SEC301", "Тестирование на проникновение", "Кафедра кибербезопасности", "it", false, true},
	{"SEC302", "Безопасность сетей", "Кафедра кибербезопасности", "it", false, true},
	{"DS201", "Машинное обучение", "Кафедра Data Science и ИИ", "ai", true, true},
	{"DS202", "Анализ данных на Python", "Кафедра Data Science и ИИ", "ai", false, true},
	{"DS301", "Глубокое обучение", "Кафедра Data Science и ИИ", "ai", true, true},
	{"DS302", "Компьютерное зрение", "Кафедра Data Science и ИИ", "ai", false, true},
	{"DS303", "Обработка естественного языка", "Кафедра Data Science и ИИ", "ai", false, true},
	{"DS304", "Большие данные и Spark", "Кафедра Data Science и ИИ", "ai", true, true},
	{"DS305", "Генеративные модели", "Кафедра Data Science и ИИ", "ai", false, true},
	{"MA101", "Математический анализ", "Кафедра общих дисциплин", "general", true, false},
	{"MA102", "Линейная алгебра", "Кафедра общих дисциплин", "general", true, false},
	{"MA201", "Дискретная математика", "Кафедра общих дисциплин", "general", true, false},
	{"MA202", "Теория вероятностей", "Кафедра общих дисциплин", "general", true, false},
	{"PH101", "Физика", "Кафедра общих дисциплин", "general", true, false},
	{"EN101", "Английский язык", "Кафедра общих дисциплин", "general", false, false},
	{"EN201", "Профессиональный английский", "Кафедра общих дисциплин", "general", false, false},
	{"KZ101", "Казахский язык", "Кафедра общих дисциплин", "general", false, false},
	{"HI101", "История Казахстана", "Кафедра общих дисциплин", "general", true, false},
	{"EC201", "Экономика и предпринимательство", "Кафедра общих дисциплин", "general", true, false},
	{"FM101", "Основы режиссуры", "Кафедра медиа и кино", "film", true, false},
	{"FM102", "Операторское мастерство", "Кафедра медиа и кино", "film", false, true},
	{"FM201", "Монтаж и постпродакшн", "Кафедра медиа и кино", "film", false, true},
	{"FM202", "Сценарное мастерство", "Кафедра медиа и кино", "film", false, false},
	{"FM203", "Продюсирование", "Кафедра медиа и кино", "film", true, false},
	{"FM301", "Съёмочный практикум", "Кафедра медиа и кино", "film", false, true},
	{"FM302", "Звукорежиссура", "Кафедра медиа и кино", "film", false, true},
	{"MK201", "Медиакоммуникации и PR", "Кафедра медиа и кино", "film", true, false},
	{"MK202", "Цифровой контент и соцсети", "Кафедра медиа и кино", "film", false, false},
	{"SP101", "Теория и методика спорта", "Кафедра спорта высших достижений", "sport", true, false},
	{"SP201", "Спортивная физиология", "Кафедра спорта высших достижений", "sport", true, false},
	{"SP202", "Спортивная аналитика", "Кафедра спорта высших достижений", "sport", false, true},
	{"SP301", "Менеджмент в спорте", "Кафедра спорта высших достижений", "sport", true, false},
	{"OPEN100", "Открытая лекция", "Кафедра общих дисциплин", "general", true, false},
}

// ensure the list stays deterministic if edited
var _ = sort.Strings
