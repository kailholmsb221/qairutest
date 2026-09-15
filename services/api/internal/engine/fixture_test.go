package engine

import (
	"time"

	"campuslive/api/internal/domain"
)

// Test fixture: a tiny building with three schedulable rooms, one Tuesday (2026-09-08, week 2 = even).
var almaty = mustLoad("Asia/Almaty")

func mustLoad(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		panic(err)
	}
	return loc
}

const (
	roomA = "room-101"
	roomB = "room-102"
	roomC = "room-201"
	roomX = "room-svc" // not schedulable

	teacherA = "t-akhmetov"
	teacherB = "t-ivanova"

	courseDB  = "c-db"
	courseMA  = "c-math"
	groupPO1  = "g-po2301"
	groupPO2  = "g-po2302"
	slot1     = "slot-1" // 08:00–08:50
	slot2     = "slot-2" // 09:00–09:50
	slot3     = "slot-3" // 10:00–10:50
	slot4     = "slot-4" // 11:00–11:50
	slot5     = "slot-5" // 12:00–12:50
	semesterA = "sem-2026a"
)

func fixtureCatalog() domain.Catalog {
	sem := domain.Semester{
		ID:          semesterA,
		Name:        "Осень 2026",
		StartsOn:    domain.Date{Year: 2026, Month: 9, Day: 1},
		EndsOn:      domain.Date{Year: 2026, Month: 12, Day: 20},
		Week1Parity: domain.ParityOdd,
	}
	cap := func(n int) *int { return &n }
	return domain.Catalog{
		Building: domain.Building{ID: "b-a", Code: "A", Name: "Главный учебный корпус", Timezone: "Asia/Almaty", Loc: almaty},
		Semester: sem,
		Rooms: map[string]domain.Room{
			roomA: {ID: roomA, MapID: "f1-class20a", Code: "101", Name: "Учебный класс на 20 уч.", Floor: 1, Type: domain.RoomSeminar, Wing: domain.WingEast, Schedulable: true, Capacity: cap(20)},
			roomB: {ID: roomB, MapID: "f1-class20b", Code: "102", Name: "Учебный класс на 20 уч.", Floor: 1, Type: domain.RoomSeminar, Wing: domain.WingEast, Schedulable: true, Capacity: cap(20)},
			roomC: {ID: roomC, MapID: "f2-201", Code: "201", Name: "Аудитория", Floor: 2, Type: domain.RoomSeminar, Wing: domain.WingWest, Schedulable: true, Capacity: cap(30)},
			roomX: {ID: roomX, MapID: "f1-corr-l", Code: "f1-corr-l", Name: "Коридор", Floor: 1, Type: domain.RoomService, Wing: domain.WingWest, Schedulable: false},
		},
		Teachers: map[string]domain.Teacher{
			teacherA: {ID: teacherA, FullName: "Ахметов Дамир Болатович", ShortName: "Ахметов Д.Б."},
			teacherB: {ID: teacherB, FullName: "Иванова Мария Сергеевна", ShortName: "Иванова М.С."},
		},
		Courses: map[string]domain.Course{
			courseDB: {ID: courseDB, Code: "CS201", Title: "Базы данных"},
			courseMA: {ID: courseMA, Code: "MA101", Title: "Математический анализ"},
		},
		Groups: map[string]domain.Group{
			groupPO1: {ID: groupPO1, Code: "ПО2301"},
			groupPO2: {ID: groupPO2, Code: "ПО2302"},
		},
		Slots: map[string]domain.TimeSlot{
			slot1: {ID: slot1, Idx: 1, StartMin: 8 * 60, EndMin: 8*60 + 50},
			slot2: {ID: slot2, Idx: 2, StartMin: 9 * 60, EndMin: 9*60 + 50},
			slot3: {ID: slot3, Idx: 3, StartMin: 10 * 60, EndMin: 10*60 + 50},
			slot4: {ID: slot4, Idx: 4, StartMin: 11 * 60, EndMin: 11*60 + 50},
			slot5: {ID: slot5, Idx: 5, StartMin: 12 * 60, EndMin: 12*60 + 50},
		},
	}
}

// Tuesday lessons (weekday 2). Week 2 of the semester is even.
func fixtureLessons() []domain.Lesson {
	return []domain.Lesson{
		{ID: "l-1", SemesterID: semesterA, CourseID: courseDB, TeacherID: teacherA, RoomID: roomA, SlotID: slot1, Weekday: 2, Parity: domain.WeekAll, Type: domain.LessonLecture, GroupIDs: []string{groupPO1, groupPO2}},
		{ID: "l-2", SemesterID: semesterA, CourseID: courseMA, TeacherID: teacherB, RoomID: roomB, SlotID: slot2, Weekday: 2, Parity: domain.WeekAll, Type: domain.LessonPractice, GroupIDs: []string{groupPO1}},
		{ID: "l-3", SemesterID: semesterA, CourseID: courseDB, TeacherID: teacherA, RoomID: roomA, SlotID: slot3, Weekday: 2, Parity: domain.WeekEven, Type: domain.LessonPractice, GroupIDs: []string{groupPO2}},
		{ID: "l-4", SemesterID: semesterA, CourseID: courseMA, TeacherID: teacherB, RoomID: roomC, SlotID: slot3, Weekday: 2, Parity: domain.WeekOdd, Type: domain.LessonPractice, GroupIDs: []string{groupPO1}}, // odd week only → absent on Sep 8
		{ID: "l-5", SemesterID: semesterA, CourseID: courseMA, TeacherID: teacherB, RoomID: roomC, SlotID: slot4, Weekday: 2, Parity: domain.WeekAll, Type: domain.LessonLab, GroupIDs: []string{groupPO2}},
		{ID: "l-6", SemesterID: semesterA, CourseID: courseDB, TeacherID: teacherA, RoomID: roomB, SlotID: slot5, Weekday: 3, Parity: domain.WeekAll, Type: domain.LessonPractice, GroupIDs: []string{groupPO1}}, // Wednesday
		{ID: "l-7", SemesterID: semesterA, CourseID: courseDB, TeacherID: teacherA, RoomID: "room-missing", SlotID: slot5, Weekday: 2, Parity: domain.WeekAll, Type: domain.LessonPractice},                      // dangling room
	}
}

var sep8 = domain.Date{Year: 2026, Month: 9, Day: 8}

// local builds an Almaty instant on Sep 8 2026.
func local(h, m int) time.Time { return time.Date(2026, 9, 8, h, m, 0, 0, almaty).UTC() }

func localOn(d domain.Date, h, m int) time.Time {
	return time.Date(d.Year, d.Month, d.Day, h, m, 0, 0, almaty).UTC()
}

func sptr(s string) *string { return &s }
func iptr(i int) *int       { return &i }

func find(sessions []domain.Session, id string) *domain.Session {
	for i := range sessions {
		if sessions[i].ID == id {
			return &sessions[i]
		}
	}
	return nil
}

func room(snap domain.Snapshot, code string) *domain.RoomState {
	for i := range snap.Rooms {
		if snap.Rooms[i].Room.Code == code {
			return &snap.Rooms[i]
		}
	}
	return nil
}

func ids(sessions []domain.Session) []string {
	out := make([]string, 0, len(sessions))
	for _, s := range sessions {
		out = append(out, s.ID)
	}
	return out
}
