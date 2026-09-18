package httpapi

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"campuslive/api/internal/domain"
	"campuslive/api/internal/service"
)

// The HTTP layer is the only place that knows both the domain and the generated contract types.

func toDate(d domain.Date) openapi_types.Date {
	return openapi_types.Date{Time: time.Date(d.Year, d.Month, d.Day, 0, 0, 0, 0, time.UTC)}
}

func fromDate(d openapi_types.Date) domain.Date { return domain.DateOf(d.Time) }

func uuidPtr(s *string) *openapi_types.UUID {
	if s == nil {
		return nil
	}
	u, err := uuid.Parse(*s)
	if err != nil {
		return nil
	}
	return &u
}

func mustUUID(s string) openapi_types.UUID {
	u, _ := uuid.Parse(s)
	return u
}

func toTeacher(t domain.Teacher) TeacherRef {
	return TeacherRef{Id: mustUUID(t.ID), ShortName: t.ShortName, FullName: t.FullName, Department: t.Department}
}

func toSession(s domain.Session) SessionView {
	v := SessionView{
		SessionId:   s.ID,
		LessonId:    uuidPtr(s.LessonID),
		CourseCode:  s.Course.Code,
		CourseTitle: s.Course.Title,
		LessonType:  LessonType(s.Type),
		Teacher:     toTeacher(s.Teacher),
		Groups:      append([]string{}, s.Groups...),
		RoomCode:    s.Room.Code,
		RoomName:    s.Room.Name,
		Floor:       s.Room.Floor,
		StartAt:     s.StartAt.UTC(),
		EndAt:       s.EndAt.UTC(),
		Status:      SessionStatus(s.Status),
		Phase:       Phase(s.Phase),
		Conflict:    s.Conflict,
		Note:        s.Note,
	}
	if s.MovedFrom != nil {
		code := s.MovedFrom.Code
		v.MovedFrom = &code
	}
	if s.DelayMinutes != nil {
		d := *s.DelayMinutes
		v.DelayMinutes = &d
	}
	return v
}

func toSessions(ss []domain.Session) []SessionView {
	out := make([]SessionView, 0, len(ss))
	for _, s := range ss {
		out = append(out, toSession(s))
	}
	return out
}

func sessionPtr(s *domain.Session) *SessionView {
	if s == nil {
		return nil
	}
	v := toSession(*s)
	return &v
}

func toRoomState(r domain.RoomState) RoomLiveState {
	return RoomLiveState{
		RoomId:    r.Room.MapID,
		RoomCode:  r.Room.Code,
		RoomName:  r.Room.Name,
		Floor:     r.Room.Floor,
		Phase:     RoomPhase(r.Phase),
		Conflict:  r.Conflict,
		Current:   sessionPtr(r.Current),
		Next:      sessionPtr(r.Next),
		FreeUntil: r.FreeUntil,
	}
}

func hhmm(min int) string { return fmt.Sprintf("%02d:%02d", min/60, min%60) }

func toLesson(v service.LessonView) Lesson {
	groups := v.Groups
	if groups == nil {
		groups = []string{}
	}
	return Lesson{
		Id: mustUUID(v.Lesson.ID), SemesterId: mustUUID(v.Lesson.SemesterID),
		CourseCode: v.Course.Code, CourseTitle: v.Course.Title, Teacher: toTeacher(v.Teacher),
		RoomCode: v.Room.Code, RoomName: v.Room.Name, Floor: v.Room.Floor,
		SlotIdx: v.Slot.Idx, StartsAt: hhmm(v.Slot.StartMin), EndsAt: hhmm(v.Slot.EndMin),
		Weekday: v.Lesson.Weekday, Parity: WeekParity(v.Lesson.Parity), Type: LessonType(v.Lesson.Type), Groups: groups,
	}
}

func toAdminCatalog(c service.AdminCatalog) AdminCatalog {
	out := AdminCatalog{
		Building: c.Building.Code, CurrentSemesterId: mustUUID(c.Current.ID),
		Semesters: make([]CatalogSemester, 0, len(c.Semesters)), Slots: make([]CatalogSlot, 0, len(c.Slots)),
		Rooms: make([]CatalogRoom, 0, len(c.Rooms)), Teachers: make([]TeacherRef, 0, len(c.Teachers)),
		Courses: make([]CatalogCourse, 0, len(c.Courses)), Groups: make([]CatalogGroup, 0, len(c.Groups)),
	}
	for _, s := range c.Semesters {
		out.Semesters = append(out.Semesters, CatalogSemester{Id: mustUUID(s.ID), Name: s.Name, StartsOn: toDate(s.StartsOn), EndsOn: toDate(s.EndsOn)})
	}
	for _, s := range c.Slots {
		out.Slots = append(out.Slots, CatalogSlot{Idx: s.Idx, StartsAt: hhmm(s.StartMin), EndsAt: hhmm(s.EndMin)})
	}
	for _, r := range c.Rooms {
		out.Rooms = append(out.Rooms, CatalogRoom{Code: r.Code, Name: r.Name, Floor: r.Floor, Capacity: r.Capacity})
	}
	for _, t := range c.Teachers {
		out.Teachers = append(out.Teachers, toTeacher(t))
	}
	for _, x := range c.Courses {
		out.Courses = append(out.Courses, CatalogCourse{Code: x.Code, Title: x.Title, Department: x.Department})
	}
	for _, g := range c.Groups {
		out.Groups = append(out.Groups, CatalogGroup{Code: g.Code, Program: g.Program, CourseYear: g.CourseYear})
	}
	return out
}

func toAnnouncement(a domain.Announcement) Announcement {
	return Announcement{Id: mustUUID(a.ID), Text: a.Text, Severity: Severity(a.Severity), StartsAt: a.StartsAt.UTC(), EndsAt: a.EndsAt.UTC()}
}

// ToSnapshot maps a service snapshot to the wire type.
func ToSnapshot(s service.Snapshot) Snapshot {
	out := Snapshot{
		Building:         s.Building,
		At:               s.At.UTC(),
		Date:             toDate(s.Date),
		NextTransitionAt: s.NextTransitionAt,
		Stats:            SnapshotStats{RoomsTotal: s.Stats.RoomsTotal, RoomsBusy: s.Stats.RoomsBusy, SessionsToday: s.Stats.SessionsToday, SessionsDone: s.Stats.SessionsDone},
		Rooms:            make([]RoomLiveState, 0, len(s.Rooms)),
		Now:              toSessions(s.Now),
		Next:             toSessions(s.Next),
		Announcements:    make([]Announcement, 0, len(s.Announcements)),
	}
	for _, r := range s.Rooms {
		out.Rooms = append(out.Rooms, toRoomState(r))
	}
	for _, a := range s.Announcements {
		out.Announcements = append(out.Announcements, toAnnouncement(a))
	}
	return out
}

// EncodeSnapshot is what the scheduler broadcasts over SSE.
func EncodeSnapshot(s service.Snapshot) ([]byte, error) { return json.Marshal(ToSnapshot(s)) }

func toMapRoom(r domain.Room) MapRoom {
	return MapRoom{
		Id: r.MapID, Code: r.Code, Name: r.Name, MapLabel: r.MapLabel, Type: RoomType(r.Type), MapType: r.MapType,
		Wing: Wing(r.Wing), Floor: r.Floor, Schedulable: r.Schedulable, Capacity: r.Capacity,
		Bbox:  BBox{X: float32(r.Geometry.BBox.X), Y: float32(r.Geometry.BBox.Y), W: float32(r.Geometry.BBox.W), H: float32(r.Geometry.BBox.H)},
		Label: Point{X: float32(r.Geometry.Label.X), Y: float32(r.Geometry.Label.Y)},
		Path:  r.Geometry.Path,
	}
}

func toOverride(o domain.Override) Override {
	out := Override{Id: mustUUID(o.ID), Kind: OverrideKind(o.Kind), Date: toDate(o.Date), LessonId: uuidPtr(o.LessonID), NewTeacherId: uuidPtr(o.NewTeacherID), DelayMinutes: o.DelayMinutes, Note: o.Note, CreatedAt: o.CreatedAt.UTC()}
	return out
}
