// Package engine computes the "now / next" state of a building.
//
// It is the ONLY place where session phases and room statuses are decided.
// The package has no I/O: it takes already-loaded data plus an instant and
// returns a Snapshot, which makes it trivially testable with table-driven
// tests and golden fixtures.
package engine

import (
	"sort"
	"strconv"
	"time"

	"campuslive/api/internal/domain"
)

// Thresholds configure the phase windows.
type Thresholds struct {
	// SoonWindow: a session is "soon" this long before it starts.
	SoonWindow time.Duration
	// EndingWindow: a session is "ending" this long before it ends.
	EndingWindow time.Duration
	// NextHorizon: how far ahead the NEXT list looks.
	NextHorizon time.Duration
}

// DefaultThresholds are the values from the architecture document.
func DefaultThresholds() Thresholds {
	return Thresholds{SoonWindow: 10 * time.Minute, EndingWindow: 5 * time.Minute, NextHorizon: 90 * time.Minute}
}

// WeekInfo returns the 1-based week number of date inside the semester and its parity.
// Weeks are Monday-aligned; outside the semester the week is 0 and parity is the first week's parity.
func WeekInfo(sem domain.Semester, date domain.Date) (int, domain.Parity) {
	if !sem.Contains(date) {
		return 0, sem.Week1Parity
	}
	monday := sem.StartsOn.AddDays(-(sem.StartsOn.Weekday() - 1))
	week := date.DaysSince(monday)/7 + 1
	parity := sem.Week1Parity
	if week%2 == 0 {
		parity = parity.Flip()
	}
	return week, parity
}

// BuildDayTimeline materialises every session of one local date from lesson templates and overrides.
// Sessions are sorted by start time, then room code, then id. Conflicts are flagged, never dropped.
func BuildDayTimeline(cat domain.Catalog, date domain.Date, lessons []domain.Lesson, overrides []domain.Override) []domain.Session {
	loc := cat.Building.Loc
	if loc == nil {
		loc = time.UTC
	}
	weekday := date.Weekday()
	_, parity := WeekInfo(cat.Semester, date)
	inSemester := cat.Semester.Contains(date)

	byLesson := map[string][]domain.Override{}
	var extras []domain.Override
	for _, o := range overrides {
		if !o.Date.Equal(date) {
			continue
		}
		if o.Kind == domain.OverrideExtra {
			extras = append(extras, o)
			continue
		}
		if o.LessonID != nil {
			byLesson[*o.LessonID] = append(byLesson[*o.LessonID], o)
		}
	}

	var out []domain.Session
	if inSemester {
		for _, l := range lessons {
			if l.Weekday != weekday {
				continue
			}
			if l.Parity != domain.WeekAll && string(l.Parity) != string(parity) {
				continue
			}
			room, okR := cat.Rooms[l.RoomID]
			course, okC := cat.Courses[l.CourseID]
			teacher, okT := cat.Teachers[l.TeacherID]
			slot, okS := cat.Slots[l.SlotID]
			if !okR || !okC || !okT || !okS {
				continue // data error: dangling reference — never crash the board
			}
			s := domain.Session{
				ID:       l.ID + ":" + date.String(),
				LessonID: ptr(l.ID),
				Course:   course,
				Teacher:  teacher,
				Room:     room,
				Groups:   groupCodes(cat, l.GroupIDs),
				Type:     l.Type,
				StartAt:  date.At(slot.StartMin, loc).UTC(),
				EndAt:    date.At(slot.EndMin, loc).UTC(),
				Status:   domain.StatusScheduled,
			}
			ovs := byLesson[l.ID]
			sort.SliceStable(ovs, func(i, j int) bool { return ovs[i].CreatedAt.Before(ovs[j].CreatedAt) })
			for _, o := range ovs {
				applyOverride(cat, &s, o)
			}
			out = append(out, s)
		}
	}

	for _, o := range extras {
		if o.RoomID == nil || o.CourseID == nil || o.TeacherID == nil || o.SlotID == nil {
			continue
		}
		room, okR := cat.Rooms[*o.RoomID]
		course, okC := cat.Courses[*o.CourseID]
		teacher, okT := cat.Teachers[*o.TeacherID]
		slot, okS := cat.Slots[*o.SlotID]
		if !okR || !okC || !okT || !okS {
			continue
		}
		out = append(out, domain.Session{
			ID:      "x:" + o.ID,
			Course:  course,
			Teacher: teacher,
			Room:    room,
			Groups:  groupCodes(cat, o.GroupIDs),
			Type:    domain.LessonPractice,
			StartAt: date.At(slot.StartMin, loc).UTC(),
			EndAt:   date.At(slot.EndMin, loc).UTC(),
			Status:  domain.StatusExtra,
			Note:    o.Note,
		})
	}

	markConflicts(out)
	sortSessions(out, func(a, b *domain.Session) bool {
		if !a.StartAt.Equal(b.StartAt) {
			return a.StartAt.Before(b.StartAt)
		}
		if a.Room.Code != b.Room.Code {
			return a.Room.Code < b.Room.Code
		}
		return a.ID < b.ID
	})
	return out
}

func applyOverride(cat domain.Catalog, s *domain.Session, o domain.Override) {
	switch o.Kind {
	case domain.OverrideCancel:
		s.Status = domain.StatusCancelled
	case domain.OverrideMove:
		if o.NewRoomID == nil {
			return
		}
		room, ok := cat.Rooms[*o.NewRoomID]
		if !ok {
			return
		}
		if s.MovedFrom == nil {
			orig := s.Room
			s.MovedFrom = &orig
		}
		s.Room = room
		if s.Status != domain.StatusCancelled {
			s.Status = domain.StatusMoved
		}
	case domain.OverrideDelay:
		if o.DelayMinutes == nil || *o.DelayMinutes <= 0 {
			return
		}
		d := time.Duration(*o.DelayMinutes) * time.Minute
		s.StartAt = s.StartAt.Add(d)
		s.EndAt = s.EndAt.Add(d)
		total := *o.DelayMinutes
		if s.DelayMinutes != nil {
			total += *s.DelayMinutes
		}
		s.DelayMinutes = &total
		if s.Status != domain.StatusCancelled {
			s.Status = domain.StatusDelayed
		}
	case domain.OverrideReassignTeacher:
		if o.NewTeacherID == nil {
			return
		}
		if t, ok := cat.Teachers[*o.NewTeacherID]; ok {
			s.Teacher = t
		}
	}
	if o.Note != nil && *o.Note != "" {
		s.Note = o.Note
	}
}

func groupCodes(cat domain.Catalog, ids []string) []string {
	codes := make([]string, 0, len(ids))
	for _, id := range ids {
		if g, ok := cat.Groups[id]; ok {
			codes = append(codes, g.Code)
		}
	}
	sort.Strings(codes)
	return codes
}

// markConflicts flags every pair of non-cancelled sessions that overlap in the same room.
func markConflicts(sessions []domain.Session) {
	byRoom := map[string][]int{}
	for i, s := range sessions {
		if s.Status == domain.StatusCancelled {
			continue
		}
		byRoom[s.Room.ID] = append(byRoom[s.Room.ID], i)
	}
	for _, idx := range byRoom {
		for a := 0; a < len(idx); a++ {
			for b := a + 1; b < len(idx); b++ {
				sa, sb := &sessions[idx[a]], &sessions[idx[b]]
				if sa.StartAt.Before(sb.EndAt) && sb.StartAt.Before(sa.EndAt) {
					sa.Conflict = true
					sb.Conflict = true
				}
			}
		}
	}
}

// PhaseAt classifies a session relative to now.
func PhaseAt(s domain.Session, now time.Time, cfg Thresholds) domain.Phase {
	if s.Status == domain.StatusCancelled {
		return domain.PhaseCancelled
	}
	switch {
	case now.Before(s.StartAt.Add(-cfg.SoonWindow)):
		return domain.PhaseUpcoming
	case now.Before(s.StartAt):
		return domain.PhaseSoon
	case now.Before(s.EndAt.Add(-cfg.EndingWindow)):
		return domain.PhaseLive
	case now.Before(s.EndAt):
		return domain.PhaseEnding
	default:
		return domain.PhaseDone
	}
}

// ComputeSnapshot derives the board and every room's state at instant now.
// sessions must come from BuildDayTimeline for the date of `now` in the building's time zone.
func ComputeSnapshot(cat domain.Catalog, sessions []domain.Session, now time.Time, cfg Thresholds) domain.Snapshot {
	loc := cat.Building.Loc
	if loc == nil {
		loc = time.UTC
	}
	now = now.UTC()
	phased := make([]domain.Session, len(sessions))
	copy(phased, sessions)
	for i := range phased {
		phased[i].Phase = PhaseAt(phased[i], now, cfg)
	}

	snap := domain.Snapshot{
		Building: cat.Building.Code,
		At:       now,
		Date:     domain.DateIn(now, loc),
		Now:      []domain.Session{},
		Next:     []domain.Session{},
		Rooms:    []domain.RoomState{},
	}

	horizon := now.Add(cfg.NextHorizon)
	for _, s := range phased {
		switch s.Phase {
		case domain.PhaseLive, domain.PhaseEnding:
			snap.Now = append(snap.Now, s)
		case domain.PhaseSoon, domain.PhaseUpcoming:
			if !s.StartAt.After(horizon) {
				snap.Next = append(snap.Next, s)
			}
		case domain.PhaseCancelled:
			if !s.StartAt.After(horizon) && s.EndAt.After(now) {
				snap.Next = append(snap.Next, s)
			}
		}
	}
	sortSessions(snap.Now, func(a, b *domain.Session) bool {
		if !a.EndAt.Equal(b.EndAt) {
			return a.EndAt.Before(b.EndAt)
		}
		if !a.StartAt.Equal(b.StartAt) {
			return a.StartAt.Before(b.StartAt)
		}
		return a.Room.Code < b.Room.Code
	})
	sortSessions(snap.Next, func(a, b *domain.Session) bool {
		if !a.StartAt.Equal(b.StartAt) {
			return a.StartAt.Before(b.StartAt)
		}
		return a.Room.Code < b.Room.Code
	})

	// rooms
	byRoom := map[string][]domain.Session{}
	for _, s := range phased {
		if s.Phase == domain.PhaseCancelled {
			continue
		}
		byRoom[s.Room.ID] = append(byRoom[s.Room.ID], s)
	}
	rooms := make([]domain.Room, 0, len(cat.Rooms))
	for _, r := range cat.Rooms {
		if r.Schedulable {
			rooms = append(rooms, r)
		}
	}
	sort.Slice(rooms, func(i, j int) bool {
		if rooms[i].Floor != rooms[j].Floor {
			return rooms[i].Floor < rooms[j].Floor
		}
		return lessCode(rooms[i].Code, rooms[j].Code)
	})
	for _, r := range rooms {
		snap.Rooms = append(snap.Rooms, roomState(r, byRoom[r.ID], now))
	}

	// stats
	snap.Stats.RoomsTotal = len(rooms)
	for _, rs := range snap.Rooms {
		if rs.Phase == domain.RoomLive || rs.Phase == domain.RoomEnding {
			snap.Stats.RoomsBusy++
		}
	}
	for _, s := range phased {
		if s.Phase == domain.PhaseCancelled {
			continue
		}
		snap.Stats.SessionsToday++
		if s.Phase == domain.PhaseDone {
			snap.Stats.SessionsDone++
		}
	}
	snap.NextTransitionAt = NextTransition(phased, now, cfg)
	return snap
}

func roomState(r domain.Room, sessions []domain.Session, now time.Time) domain.RoomState {
	st := domain.RoomState{Room: r, Phase: domain.RoomFree}
	var owner *domain.Session
	var soon *domain.Session
	var upcoming *domain.Session
	for i := range sessions {
		s := &sessions[i]
		switch s.Phase {
		case domain.PhaseLive, domain.PhaseEnding:
			if owner == nil || s.StartAt.Before(owner.StartAt) || (s.StartAt.Equal(owner.StartAt) && s.ID < owner.ID) {
				owner = s
			}
		case domain.PhaseSoon:
			if soon == nil || s.StartAt.Before(soon.StartAt) {
				soon = s
			}
		case domain.PhaseUpcoming:
			if upcoming == nil || s.StartAt.Before(upcoming.StartAt) {
				upcoming = s
			}
		}
	}
	switch {
	case owner != nil:
		cur := *owner
		st.Current = &cur
		st.Conflict = owner.Conflict
		if owner.Phase == domain.PhaseEnding {
			st.Phase = domain.RoomEnding
		} else {
			st.Phase = domain.RoomLive
		}
		if soon != nil {
			n := *soon
			st.Next = &n
		} else if upcoming != nil {
			n := *upcoming
			st.Next = &n
		}
	case soon != nil:
		n := *soon
		st.Phase = domain.RoomSoon
		st.Next = &n
		st.Conflict = soon.Conflict
		t := soon.StartAt
		st.FreeUntil = &t
	case upcoming != nil:
		n := *upcoming
		st.Next = &n
		t := upcoming.StartAt
		st.FreeUntil = &t
	}
	_ = now
	return st
}

// NextTransition is the earliest instant after now at which the snapshot would change:
// a session enters the NEXT window, becomes soon, starts, starts ending, or ends.
func NextTransition(sessions []domain.Session, now time.Time, cfg Thresholds) *time.Time {
	var best *time.Time
	consider := func(t time.Time) {
		if !t.After(now) {
			return
		}
		if best == nil || t.Before(*best) {
			tt := t
			best = &tt
		}
	}
	for _, s := range sessions {
		consider(s.StartAt.Add(-cfg.NextHorizon))
		consider(s.EndAt)
		if s.Status == domain.StatusCancelled {
			continue
		}
		consider(s.StartAt.Add(-cfg.SoonWindow))
		consider(s.StartAt)
		consider(s.EndAt.Add(-cfg.EndingWindow))
	}
	return best
}

// ---------------------------------------------------------------- helpers

func ptr[T any](v T) *T { return &v }

func sortSessions(s []domain.Session, less func(a, b *domain.Session) bool) {
	sort.SliceStable(s, func(i, j int) bool { return less(&s[i], &s[j]) })
}

// lessCode orders room codes numerically when both are numbers ("100" < "1000"), lexically otherwise.
func lessCode(a, b string) bool {
	na, errA := strconv.Atoi(a)
	nb, errB := strconv.Atoi(b)
	if errA == nil && errB == nil {
		return na < nb
	}
	if errA == nil {
		return true
	}
	if errB == nil {
		return false
	}
	return a < b
}
