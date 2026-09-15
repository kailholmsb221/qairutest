package httpapi

import (
	"encoding/json"
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
