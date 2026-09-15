// Package httpapi is the chi router + oapi-codegen strict server for the CampusLive contract.
package httpapi

import (
	"context"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"campuslive/api/internal/domain"
	"campuslive/api/internal/engine"
	"campuslive/api/internal/realtime"
	"campuslive/api/internal/service"
)

// Deps are everything the handlers need.
type Deps struct {
	Board       *service.Board
	Broker      *realtime.Broker
	Log         *slog.Logger
	AdminAPIKey string
	CORSOrigins []string
	Version     string
}

// Server implements StrictServerInterface.
type Server struct {
	deps Deps
}

var _ StrictServerInterface = (*Server)(nil)

// NewRouter wires middlewares, the generated routes and the SSE endpoint.
func NewRouter(d Deps) http.Handler {
	if d.Log == nil {
		d.Log = slog.Default()
	}
	s := &Server{deps: d}
	r := chi.NewRouter()
	r.Use(middleware.RealIP)
	r.Use(requestLogger(d.Log))
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   d.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "X-Api-Key", "If-None-Match", "Last-Event-ID"},
		ExposedHeaders:   []string{"ETag"},
		AllowCredentials: false,
		MaxAge:           300,
	}))
	r.Use(etagMiddleware)
	r.Use(timeoutExceptSSE(60 * time.Second))

	strict := NewStrictHandlerWithOptions(s, []StrictMiddlewareFunc{s.adminAuth}, StrictHTTPServerOptions{
		RequestErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
			writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		},
		ResponseErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
			if errors.Is(err, errUnauthorized) {
				writeError(w, http.StatusUnauthorized, "unauthorized", "missing or wrong X-Api-Key")
				return
			}
			d.Log.Error("response error", "path", r.URL.Path, "err", err)
			writeError(w, http.StatusInternalServerError, "internal", "internal error")
		},
	})
	HandlerWithOptions(strict, ChiServerOptions{
		BaseRouter: r,
		ErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
			writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		},
	})
	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "not_found", "route not found")
	})
	return r
}

// ---------------------------------------------------------------- middlewares

func requestLogger(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/v1/events") {
				next.ServeHTTP(w, r)
				return
			}
			start := time.Now()
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)
			log.Info("http", "method", r.Method, "path", r.URL.Path, "status", ww.Status(), "ms", time.Since(start).Milliseconds())
		})
	}
}

// timeoutExceptSSE applies a request timeout to everything but the long-lived event stream.
func timeoutExceptSSE(d time.Duration) func(http.Handler) http.Handler {
	timeout := middleware.Timeout(d)
	return func(next http.Handler) http.Handler {
		withTimeout := timeout(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/v1/events") {
				next.ServeHTTP(w, r)
				return
			}
			withTimeout.ServeHTTP(w, r)
		})
	}
}

// adminAuth guards /api/v1/admin/* with X-Api-Key.
func (s *Server) adminAuth(f StrictHandlerFunc, operationID string) StrictHandlerFunc {
	switch operationID {
	case "CreateOverride", "DeleteOverride", "CreateAnnouncement":
	default:
		return f
	}
	return func(ctx context.Context, w http.ResponseWriter, r *http.Request, request interface{}) (interface{}, error) {
		key := r.Header.Get("X-Api-Key")
		if key == "" || subtle.ConstantTimeCompare([]byte(key), []byte(s.deps.AdminAPIKey)) != 1 {
			return nil, errUnauthorized
		}
		return f(ctx, w, r, request)
	}
}

var errUnauthorized = errors.New("unauthorized")

// etagMiddleware turns a matching If-None-Match into a 304 for GET responses that carry an ETag.
func etagMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		inm := r.Header.Get("If-None-Match")
		if r.Method != http.MethodGet || inm == "" || strings.HasPrefix(r.URL.Path, "/api/v1/events") {
			next.ServeHTTP(w, r)
			return
		}
		ew := &etagWriter{ResponseWriter: w, inm: inm}
		next.ServeHTTP(ew, r)
		ew.finish()
	})
}

type etagWriter struct {
	http.ResponseWriter
	inm     string
	status  int
	decided bool
	skip    bool
	buf     []byte
}

func (e *etagWriter) WriteHeader(status int) {
	e.status = status
	if status == http.StatusOK && e.Header().Get("ETag") != "" && e.Header().Get("ETag") == e.inm {
		e.skip = true
		e.decided = true
		e.Header().Del("Content-Length")
		e.ResponseWriter.WriteHeader(http.StatusNotModified)
		return
	}
	e.decided = true
	e.ResponseWriter.WriteHeader(status)
}

func (e *etagWriter) Write(b []byte) (int, error) {
	if !e.decided {
		e.WriteHeader(http.StatusOK)
	}
	if e.skip {
		return len(b), nil
	}
	return e.ResponseWriter.Write(b)
}

func (e *etagWriter) Flush() {
	if f, ok := e.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (e *etagWriter) finish() {
	if !e.decided {
		e.ResponseWriter.WriteHeader(http.StatusOK)
	}
}

// ---------------------------------------------------------------- errors

func writeError(w http.ResponseWriter, status int, code, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Error{Error: struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}{Code: code, Message: msg}})
}

func apiErr(code, msg string) Error {
	return Error{Error: struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}{Code: code, Message: msg}}
}

func notFound(msg string) NotFoundJSONResponse { return NotFoundJSONResponse(apiErr("not_found", msg)) }
func badRequest(msg string) BadRequestJSONResponse {
	return BadRequestJSONResponse(apiErr("bad_request", msg))
}

// ---------------------------------------------------------------- system

func (s *Server) Healthz(ctx context.Context, _ HealthzRequestObject) (HealthzResponseObject, error) {
	return Healthz200JSONResponse{Status: Ok, Checks: &map[string]string{"version": s.deps.Version}}, nil
}

func (s *Server) Readyz(ctx context.Context, _ ReadyzRequestObject) (ReadyzResponseObject, error) {
	if err := s.deps.Board.Ready(ctx); err != nil {
		return Readyz503JSONResponse{Status: Down, Checks: &map[string]string{"error": err.Error()}}, nil
	}
	return Readyz200JSONResponse{Status: Ok, Checks: &map[string]string{"db": "ok", "snapshot": "ok"}}, nil
}

func (s *Server) GetTime(ctx context.Context, _ GetTimeRequestObject) (GetTimeResponseObject, error) {
	info, err := s.deps.Board.Time(ctx)
	if err != nil {
		return nil, err
	}
	return GetTime200JSONResponse{Now: info.Now, Mode: ClockMode(info.Mode), Timezone: info.Timezone, LocalDate: toDate(info.LocalDate), WeekNumber: info.WeekNumber, Parity: Parity(info.Parity)}, nil
}

// ---------------------------------------------------------------- buildings

func (s *Server) ListBuildings(ctx context.Context, _ ListBuildingsRequestObject) (ListBuildingsResponseObject, error) {
	codes, err := s.deps.Board.BuildingCodes(ctx)
	if err != nil {
		return nil, err
	}
	out := make(ListBuildings200JSONResponse, 0, len(codes))
	for _, code := range codes {
		b, floors, _, err := s.deps.Board.Map(ctx, code)
		if err != nil {
			return nil, err
		}
		out = append(out, Building{Code: b.Code, Name: b.Name, Timezone: b.Timezone, Floors: len(floors)})
	}
	return out, nil
}

func (s *Server) GetBuildingMap(ctx context.Context, req GetBuildingMapRequestObject) (GetBuildingMapResponseObject, error) {
	b, floors, rooms, err := s.deps.Board.Map(ctx, req.Code)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			return GetBuildingMap404JSONResponse{notFound("building not found")}, nil
		}
		return nil, err
	}
	body := BuildingMap{Building: b.Code, Name: b.Name, Timezone: b.Timezone, ViewBox: []float32{0, 0, 1600, 1000}, Floors: make([]MapFloor, 0, len(floors))}
	// viewBox comes from the geometry: take the union of room bboxes' origin (0,0) and the map extent
	var maxX, maxY float32
	for _, f := range floors {
		mf := MapFloor{Number: f.Number, PlanKey: f.PlanKey, Name: f.Name, Rooms: []MapRoom{}}
		for _, r := range rooms {
			if r.Floor != f.Number {
				continue
			}
			mr := toMapRoom(r)
			if r.Area != nil {
				a := float32(*r.Area)
				mr.Area = &a
			}
			mf.Rooms = append(mf.Rooms, mr)
			if x := mr.Bbox.X + mr.Bbox.W; x > maxX {
				maxX = x
			}
			if y := mr.Bbox.Y + mr.Bbox.H; y > maxY {
				maxY = y
			}
		}
		body.Floors = append(body.Floors, mf)
	}
	if maxX > 0 && maxY > 0 {
		body.ViewBox = []float32{0, 0, ceil50(maxX), ceil50(maxY)}
	}
	raw, _ := json.Marshal(body)
	sum := sha1.Sum(raw)
	etag := `"` + hex.EncodeToString(sum[:8]) + `"`
	return GetBuildingMap200JSONResponse{Body: body, Headers: GetBuildingMap200ResponseHeaders{ETag: &etag}}, nil
}

func ceil50(v float32) float32 {
	n := int(v)
	if n%50 != 0 {
		n += 50 - n%50
	}
	return float32(n)
}

// ---------------------------------------------------------------- schedule

func (s *Server) GetBoard(ctx context.Context, req GetBoardRequestObject) (GetBoardResponseObject, error) {
	var snap service.Snapshot
	var err error
	if req.Params.At == nil && req.Params.Date == nil {
		snap, err = s.deps.Board.Current(ctx, req.Code)
	} else {
		at := s.deps.Board.Clock().Now()
		if req.Params.At != nil {
			at = *req.Params.At
		}
		var date *domain.Date
		if req.Params.Date != nil {
			d := fromDate(*req.Params.Date)
			date = &d
		}
		snap, err = s.deps.Board.SnapshotAt(ctx, req.Code, at, date)
	}
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			return GetBoard404JSONResponse{notFound("building not found")}, nil
		}
		return nil, err
	}
	return GetBoard200JSONResponse{Body: ToSnapshot(snap), Headers: GetBoard200ResponseHeaders{ETag: &snap.ETag}}, nil
}

func (s *Server) GetTimeline(ctx context.Context, req GetTimelineRequestObject) (GetTimelineResponseObject, error) {
	b, err := s.deps.Board.Building(ctx, req.Code)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			return GetTimeline404JSONResponse{notFound("building not found")}, nil
		}
		return nil, err
	}
	now := s.deps.Board.Clock().Now()
	d := domain.DateIn(now, b.Loc)
	if req.Params.Date != nil {
		d = fromDate(*req.Params.Date)
	}
	sessions, _, err := s.deps.Board.Timeline(ctx, req.Code, d)
	if err != nil {
		return nil, err
	}
	slots, loc, err := s.deps.Board.Slots(ctx, req.Code, d)
	if err != nil {
		return nil, err
	}
	out := DayTimeline{Building: b.Code, Date: toDate(d), At: now.UTC(), Slots: make([]TimeSlot, 0, len(slots)), Sessions: make([]SessionView, 0, len(sessions))}
	for _, sl := range slots {
		out.Slots = append(out.Slots, TimeSlot{Idx: sl.Idx, StartsAt: d.At(sl.StartMin, loc).UTC(), EndsAt: d.At(sl.EndMin, loc).UTC()})
	}
	cfg := s.deps.Board.Thresholds()
	for _, ss := range sessions {
		ss.Phase = engine.PhaseAt(ss, now, cfg)
		out.Sessions = append(out.Sessions, toSession(ss))
	}
	return GetTimeline200JSONResponse(out), nil
}

func (s *Server) daySchedule(ctx context.Context, kind DayScheduleSubjectKind, id, label string, sessions []domain.Session, d domain.Date) DaySchedule {
	now := s.deps.Board.Clock().Now()
	cfg := s.deps.Board.Thresholds()
	out := DaySchedule{Date: toDate(d), At: now.UTC(), Sessions: make([]SessionView, 0, len(sessions))}
	out.Subject.Kind = kind
	out.Subject.Id = id
	out.Subject.Label = label
	for _, ss := range sessions {
		ss.Phase = engine.PhaseAt(ss, now, cfg)
		out.Sessions = append(out.Sessions, toSession(ss))
	}
	return out
}

func (s *Server) dateParam(ctx context.Context, p *openapi_types.Date) (domain.Date, error) {
	if p != nil {
		return fromDate(*p), nil
	}
	info, err := s.deps.Board.Time(ctx)
	if err != nil {
		return domain.Date{}, err
	}
	return info.LocalDate, nil
}

func (s *Server) GetRoomDay(ctx context.Context, req GetRoomDayRequestObject) (GetRoomDayResponseObject, error) {
	d, err := s.dateParam(ctx, req.Params.Date)
	if err != nil {
		return nil, err
	}
	room, sessions, err := s.deps.Board.RoomDay(ctx, req.Code, d)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			return GetRoomDay404JSONResponse{notFound("room not found")}, nil
		}
		return nil, err
	}
	return GetRoomDay200JSONResponse(s.daySchedule(ctx, Room, room.Code, room.Name, sessions, d)), nil
}

func (s *Server) GetTeacherDay(ctx context.Context, req GetTeacherDayRequestObject) (GetTeacherDayResponseObject, error) {
	d, err := s.dateParam(ctx, req.Params.Date)
	if err != nil {
		return nil, err
	}
	t, sessions, err := s.deps.Board.TeacherDay(ctx, req.Id.String(), d)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			return GetTeacherDay404JSONResponse{notFound("teacher not found")}, nil
		}
		return nil, err
	}
	return GetTeacherDay200JSONResponse(s.daySchedule(ctx, Teacher, t.ID, t.ShortName, sessions, d)), nil
}

func (s *Server) GetGroupDay(ctx context.Context, req GetGroupDayRequestObject) (GetGroupDayResponseObject, error) {
	d, err := s.dateParam(ctx, req.Params.Date)
	if err != nil {
		return nil, err
	}
	g, sessions, err := s.deps.Board.GroupDay(ctx, req.Code, d)
	if err != nil {
		if errors.Is(err, service.ErrNotFound) {
			return GetGroupDay404JSONResponse{notFound("group not found")}, nil
		}
		return nil, err
	}
	return GetGroupDay200JSONResponse(s.daySchedule(ctx, Group, g.Code, g.Code, sessions, d)), nil
}

// ---------------------------------------------------------------- search

func (s *Server) Search(ctx context.Context, req SearchRequestObject) (SearchResponseObject, error) {
	q := strings.TrimSpace(req.Params.Q)
	if q == "" {
		return Search400JSONResponse{badRequest("q is required")}, nil
	}
	if len([]rune(q)) > 64 {
		q = string([]rune(q)[:64])
	}
	hit, err := s.deps.Board.Search(ctx, q)
	if err != nil {
		return nil, err
	}
	out := SearchResult{Q: q, Teachers: []SearchTeacher{}, Groups: []SearchGroup{}, Rooms: []SearchRoom{}, Courses: []SearchCourse{}}
	for _, t := range hit.Teachers {
		out.Teachers = append(out.Teachers, SearchTeacher{Id: mustUUID(t.ID), ShortName: t.ShortName, FullName: t.FullName, Department: t.Department})
	}
	for _, g := range hit.Groups {
		out.Groups = append(out.Groups, SearchGroup{Code: g.Code, Program: g.Program, CourseYear: g.CourseYear})
	}
	for _, r := range hit.Rooms {
		out.Rooms = append(out.Rooms, SearchRoom{Code: r.Code, Name: r.Name, Floor: r.Floor, Type: RoomType(r.Type)})
	}
	for _, c := range hit.Courses {
		out.Courses = append(out.Courses, SearchCourse{Code: c.Code, Title: c.Title, Department: c.Department})
	}
	return Search200JSONResponse(out), nil
}

// ---------------------------------------------------------------- realtime

type sseResponse struct {
	ctx      context.Context
	broker   *realtime.Broker
	building string
}

func (r sseResponse) VisitEventsResponse(w http.ResponseWriter) error {
	return r.broker.ServeSSE(r.ctx, w, r.building)
}

func (s *Server) Events(ctx context.Context, req EventsRequestObject) (EventsResponseObject, error) {
	if _, err := s.deps.Board.Building(ctx, req.Params.Building); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			return Events404JSONResponse{notFound("building not found")}, nil
		}
		return nil, err
	}
	if !s.deps.Broker.HasSnapshot(req.Params.Building) {
		// first subscriber before the scheduler published: publish the current snapshot ourselves
		snap, err := s.deps.Board.Current(ctx, req.Params.Building)
		if err == nil {
			if data, err := EncodeSnapshot(snap); err == nil {
				s.deps.Broker.Publish(req.Params.Building, realtime.Event{Name: "snapshot", Data: data})
			}
		}
	}
	return sseResponse{ctx: ctx, broker: s.deps.Broker, building: req.Params.Building}, nil
}

// ---------------------------------------------------------------- admin

func (s *Server) CreateOverride(ctx context.Context, req CreateOverrideRequestObject) (CreateOverrideResponseObject, error) {
	if req.Body == nil {
		return CreateOverride400JSONResponse{badRequest("body required")}, nil
	}
	b := req.Body
	in := service.OverrideInput{
		Kind: domain.OverrideKind(b.Kind), Date: fromDate(b.Date), NewRoomCode: b.NewRoomCode, DelayMinutes: b.DelayMinutes,
		CourseCode: b.CourseCode, RoomCode: b.RoomCode, SlotIdx: b.SlotIdx, Note: b.Note,
	}
	if b.LessonId != nil {
		id := b.LessonId.String()
		in.LessonID = &id
	}
	if b.NewTeacherId != nil {
		id := b.NewTeacherId.String()
		in.NewTeacherID = &id
	}
	if b.TeacherId != nil {
		id := b.TeacherId.String()
		in.TeacherID = &id
	}
	if b.Groups != nil {
		in.Groups = *b.Groups
	}
	o, err := s.deps.Board.CreateOverride(ctx, in)
	if err != nil {
		var ve service.ValidationError
		if errors.As(err, &ve) {
			return CreateOverride400JSONResponse{badRequest(ve.Msg)}, nil
		}
		if errors.Is(err, service.ErrNotFound) {
			return CreateOverride404JSONResponse{notFound("not found")}, nil
		}
		return nil, err
	}
	out := toOverride(o)
	out.NewRoomCode = b.NewRoomCode
	return CreateOverride201JSONResponse(out), nil
}

func (s *Server) DeleteOverride(ctx context.Context, req DeleteOverrideRequestObject) (DeleteOverrideResponseObject, error) {
	if err := s.deps.Board.DeleteOverride(ctx, req.Id.String()); err != nil {
		if errors.Is(err, service.ErrNotFound) {
			return DeleteOverride404JSONResponse{notFound("override not found")}, nil
		}
		return nil, err
	}
	return DeleteOverride204Response{}, nil
}

func (s *Server) CreateAnnouncement(ctx context.Context, req CreateAnnouncementRequestObject) (CreateAnnouncementResponseObject, error) {
	if req.Body == nil || strings.TrimSpace(req.Body.Text) == "" {
		return CreateAnnouncement400JSONResponse{badRequest("text required")}, nil
	}
	sev := domain.SeverityInfo
	if req.Body.Severity != nil {
		sev = domain.Severity(*req.Body.Severity)
	}
	dur := 30 * time.Minute
	if req.Body.DurationMinutes != nil {
		dur = time.Duration(*req.Body.DurationMinutes) * time.Minute
	}
	codes, err := s.deps.Board.BuildingCodes(ctx)
	if err != nil {
		return nil, err
	}
	if len(codes) == 0 {
		return CreateAnnouncement400JSONResponse{badRequest("no buildings")}, nil
	}
	a, err := s.deps.Board.CreateAnnouncement(ctx, codes[0], strings.TrimSpace(req.Body.Text), sev, dur)
	if err != nil {
		return nil, err
	}
	out := toAnnouncement(a)
	if data, err := json.Marshal(out); err == nil {
		s.deps.Broker.Publish(codes[0], realtime.Event{Name: "announcement", Data: data})
	}
	return CreateAnnouncement201JSONResponse(out), nil
}
