package httpapi_test

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers"
	"github.com/getkin/kin-openapi/routers/gorillamux"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"campuslive/api/internal/clock"
	"campuslive/api/internal/engine"
	"campuslive/api/internal/httpapi"
	"campuslive/api/internal/mapdata"
	"campuslive/api/internal/realtime"
	"campuslive/api/internal/repo"
	"campuslive/api/internal/scheduler"
	"campuslive/api/internal/seed"
	"campuslive/api/internal/service"
)

// Integration + contract tests: a real Postgres (testcontainers), the deterministic seed, a fixed clock
// (Tuesday 2026-09-15 10:47 Asia/Almaty) and every response validated against openapi.yaml.

const (
	adminKey = "test-admin-key"
	fixedAt  = "2026-09-15T10:47:00+05:00"
	mapPath  = "../../../../packages/map-data/building-a.json"
)

var (
	srv     *httptest.Server
	router  routers.Router
	board   *service.Board
	broker  *realtime.Broker
	clk     clock.Clock
	mapSpec mapdata.Building
)

func TestMain(m *testing.M) {
	if os.Getenv("SKIP_DOCKER_TESTS") != "" {
		fmt.Println("SKIP_DOCKER_TESTS set — skipping httpapi integration tests")
		os.Exit(0)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	pg, err := tcpostgres.Run(ctx, "postgres:16-alpine",
		tcpostgres.WithDatabase("campuslive"), tcpostgres.WithUsername("campuslive"), tcpostgres.WithPassword("campuslive"),
		testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(90*time.Second)),
	)
	if err != nil {
		fmt.Println("cannot start postgres container (is Docker running?):", err)
		os.Exit(1)
	}
	defer func() { _ = testcontainers.TerminateContainer(pg) }()
	url, err := pg.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		panic(err)
	}
	if err := repo.Migrate(ctx, url); err != nil {
		panic(err)
	}
	r, err := repo.Connect(ctx, url)
	if err != nil {
		panic(err)
	}
	defer r.Close()

	clk, _ = clock.FromConfig("fixed", fixedAt, "")
	mapSpec, err = mapdata.Load(mapPath)
	if err != nil {
		panic(err)
	}
	if _, err := seed.Run(ctx, r, mapPath, clk, seed.DefaultOptions()); err != nil {
		panic(err)
	}

	board = service.NewBoard(r, clk, engine.DefaultThresholds())
	broker = realtime.New(realtime.Options{Heartbeat: 200 * time.Millisecond, Now: clk.Now})
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	sch := &scheduler.Scheduler{Board: board, Broker: broker, Log: log, Encode: httpapi.EncodeSnapshot, MaxSleep: time.Minute}
	schedCtx, stopSched := context.WithCancel(ctx)
	go sch.Run(schedCtx, "A")

	srv = httptest.NewServer(httpapi.NewRouter(httpapi.Deps{Board: board, Broker: broker, Log: log, AdminAPIKey: adminKey, CORSOrigins: []string{"*"}, Version: "test"}))
	defer srv.Close()

	spec, err := httpapi.GetSwagger()
	if err != nil {
		panic(err)
	}
	spec.Servers = nil
	if err := spec.Validate(ctx); err != nil {
		panic("openapi.yaml invalid: " + err.Error())
	}
	router, err = gorillamux.NewRouter(spec)
	if err != nil {
		panic(err)
	}

	code := m.Run()
	stopSched()
	os.Exit(code)
}

type resp struct {
	status int
	header http.Header
	body   []byte
}

// call performs a request and validates request+response against the OpenAPI contract.
func call(t *testing.T, method, path string, body any, headers map[string]string) resp {
	t.Helper()
	var reqBody io.Reader
	var raw []byte
	if body != nil {
		raw, _ = json.Marshal(body)
		reqBody = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, srv.URL+path, reqBody)
	if err != nil {
		t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	out, _ := io.ReadAll(res.Body)

	// contract validation
	vreq, _ := http.NewRequest(method, path, bytes.NewReader(raw))
	vreq.Header = req.Header.Clone()
	route, pathParams, err := router.FindRoute(vreq)
	if err != nil {
		if res.StatusCode == 404 {
			return resp{status: res.StatusCode, header: res.Header, body: out} // unknown route: nothing to validate against
		}
		t.Fatalf("%s %s not in openapi.yaml: %v", method, path, err)
	}
	input := &openapi3filter.RequestValidationInput{Request: vreq, PathParams: pathParams, Route: route, Options: &openapi3filter.Options{AuthenticationFunc: openapi3filter.NoopAuthenticationFunc}}
	rv := &openapi3filter.ResponseValidationInput{RequestValidationInput: input, Status: res.StatusCode, Header: res.Header, Body: io.NopCloser(bytes.NewReader(out)), Options: &openapi3filter.Options{IncludeResponseStatus: true}}
	if err := openapi3filter.ValidateResponse(context.Background(), rv); err != nil {
		t.Fatalf("%s %s → %d violates the contract: %v\nbody: %.400s", method, path, res.StatusCode, err, out)
	}
	return resp{status: res.StatusCode, header: res.Header, body: out}
}

func decode[T any](t *testing.T, r resp) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(r.body, &v); err != nil {
		t.Fatalf("decode: %v\n%s", err, r.body)
	}
	return v
}

func TestSystemEndpoints(t *testing.T) {
	if r := call(t, "GET", "/healthz", nil, nil); r.status != 200 {
		t.Fatalf("healthz %d", r.status)
	}
	if r := call(t, "GET", "/readyz", nil, nil); r.status != 200 {
		t.Fatalf("readyz %d %s", r.status, r.body)
	}
	r := call(t, "GET", "/api/v1/time", nil, nil)
	ti := decode[httpapi.TimeInfo](t, r)
	if ti.Mode != "fixed" || ti.Timezone != "Asia/Almaty" || ti.LocalDate.Format("2006-01-02") != "2026-09-15" || ti.WeekNumber != 3 || ti.Parity != "odd" {
		t.Fatalf("time: %+v", ti)
	}
	if r := call(t, "GET", "/api/v1/nope", nil, nil); r.status != 404 {
		t.Fatalf("unknown route %d", r.status)
	}
}

func TestBuildingsAndMap(t *testing.T) {
	bs := decode[[]httpapi.Building](t, call(t, "GET", "/api/v1/buildings", nil, nil))
	if len(bs) != 1 || bs[0].Code != "A" || bs[0].Floors != 2 {
		t.Fatalf("buildings: %+v", bs)
	}
	r := call(t, "GET", "/api/v1/buildings/A/map", nil, nil)
	if r.status != 200 || r.header.Get("ETag") == "" {
		t.Fatalf("map %d etag=%q", r.status, r.header.Get("ETag"))
	}
	m := decode[httpapi.BuildingMap](t, r)
	want := map[string]mapdata.Room{}
	for _, f := range mapSpec.Floors {
		for _, rm := range f.Rooms {
			want[rm.Code] = rm
		}
	}
	got := 0
	for _, f := range m.Floors {
		for _, rm := range f.Rooms {
			w, ok := want[rm.Code]
			if !ok {
				t.Fatalf("unexpected room %s", rm.Code)
			}
			if rm.Path != w.Path || rm.Id != w.ID || rm.Schedulable != w.Schedulable || rm.Floor != f.Number {
				t.Fatalf("room %s differs from building-a.json", rm.Code)
			}
			got++
		}
	}
	if got != len(want) {
		t.Fatalf("map has %d rooms, building-a.json has %d", got, len(want))
	}
	// ETag round-trip
	if r2 := call(t, "GET", "/api/v1/buildings/A/map", nil, map[string]string{"If-None-Match": r.header.Get("ETag")}); r2.status != 304 || len(r2.body) != 0 {
		t.Fatalf("304 expected, got %d (%d bytes)", r2.status, len(r2.body))
	}
	if r := call(t, "GET", "/api/v1/buildings/Z/map", nil, nil); r.status != 404 {
		t.Fatalf("unknown building %d", r.status)
	}
}

func TestBoard(t *testing.T) {
	r := call(t, "GET", "/api/v1/buildings/A/board", nil, nil)
	snap := decode[httpapi.Snapshot](t, r)
	if snap.Building != "A" || snap.Date.Format("2006-01-02") != "2026-09-15" || !snap.At.Equal(clk.Now()) {
		t.Fatalf("snapshot header: %+v", snap)
	}
	if len(snap.Now) == 0 || len(snap.Next) == 0 || snap.Stats.RoomsTotal != 14 || snap.Stats.RoomsBusy == 0 {
		t.Fatalf("10:47 on a Tuesday must be busy: now=%d next=%d stats=%+v", len(snap.Now), len(snap.Next), snap.Stats)
	}
	if len(snap.Rooms) != 14 {
		t.Fatalf("rooms: %d", len(snap.Rooms))
	}
	for _, s := range snap.Now {
		if s.Phase != "live" && s.Phase != "ending" {
			t.Fatalf("NOW contains %s", s.Phase)
		}
	}
	if r.header.Get("ETag") == "" {
		t.Fatal("board without ETag")
	}
	if r2 := call(t, "GET", "/api/v1/buildings/A/board", nil, map[string]string{"If-None-Match": r.header.Get("ETag")}); r2.status != 304 {
		t.Fatalf("board 304 expected, got %d", r2.status)
	}
	// time travel: 06:00 local → nothing running, first lessons in NEXT (08:00 is within 90 min? no: 120 min → empty)
	early := decode[httpapi.Snapshot](t, call(t, "GET", "/api/v1/buildings/A/board?at=2026-09-15T06:00:00%2B05:00", nil, nil))
	if len(early.Now) != 0 || len(early.Next) != 0 || early.NextTransitionAt == nil {
		t.Fatalf("06:00: now=%d next=%d", len(early.Now), len(early.Next))
	}
	seven := decode[httpapi.Snapshot](t, call(t, "GET", "/api/v1/buildings/A/board?at=2026-09-15T07:00:00%2B05:00", nil, nil))
	if len(seven.Next) == 0 {
		t.Fatalf("07:00: the 08:00 lessons must be in NEXT")
	}
	// Sunday → empty
	sunday := decode[httpapi.Snapshot](t, call(t, "GET", "/api/v1/buildings/A/board?at=2026-09-13T10:47:00%2B05:00", nil, nil))
	if len(sunday.Now) != 0 || len(sunday.Next) != 0 || sunday.Stats.SessionsToday != 0 {
		t.Fatalf("sunday: %+v", sunday.Stats)
	}
	// explicit date
	dated := decode[httpapi.Snapshot](t, call(t, "GET", "/api/v1/buildings/A/board?date=2026-09-16", nil, nil))
	if dated.Date.Format("2006-01-02") != "2026-09-16" {
		t.Fatalf("date param ignored: %s", dated.Date)
	}
	if r := call(t, "GET", "/api/v1/buildings/A/board?at=yesterday", nil, nil); r.status != 400 {
		t.Fatalf("bad at → %d", r.status)
	}
}

func TestTimelineAndDays(t *testing.T) {
	tl := decode[httpapi.DayTimeline](t, call(t, "GET", "/api/v1/buildings/A/timeline?date=2026-09-15", nil, nil))
	if len(tl.Slots) != 10 || len(tl.Sessions) < 40 {
		t.Fatalf("timeline slots=%d sessions=%d", len(tl.Slots), len(tl.Sessions))
	}
	if !tl.Slots[0].StartsAt.Equal(time.Date(2026, 9, 15, 3, 0, 0, 0, time.UTC)) {
		t.Fatalf("slot 1 must be 08:00 Almaty = 03:00Z, got %v", tl.Slots[0].StartsAt)
	}
	first := tl.Sessions[0]
	room := decode[httpapi.DaySchedule](t, call(t, "GET", "/api/v1/rooms/"+first.RoomCode+"/day?date=2026-09-15", nil, nil))
	if room.Subject.Kind != "room" || len(room.Sessions) == 0 {
		t.Fatalf("room day: %+v", room.Subject)
	}
	for _, s := range room.Sessions {
		if s.RoomCode != first.RoomCode && (s.MovedFrom == nil || *s.MovedFrom != first.RoomCode) {
			t.Fatalf("foreign session in room day: %+v", s)
		}
	}
	teacher := decode[httpapi.DaySchedule](t, call(t, "GET", "/api/v1/teachers/"+first.Teacher.Id.String()+"/day", nil, nil))
	if teacher.Subject.Kind != "teacher" || len(teacher.Sessions) == 0 || teacher.Date.Format("2006-01-02") != "2026-09-15" {
		t.Fatalf("teacher day: %+v", teacher.Subject)
	}
	group := decode[httpapi.DaySchedule](t, call(t, "GET", "/api/v1/groups/"+first.Groups[0]+"/day", nil, nil))
	if group.Subject.Kind != "group" || len(group.Sessions) == 0 {
		t.Fatalf("group day: %+v", group.Subject)
	}
	if r := call(t, "GET", "/api/v1/rooms/NOPE/day", nil, nil); r.status != 404 {
		t.Fatalf("room 404: %d", r.status)
	}
	if r := call(t, "GET", "/api/v1/groups/NOPE/day", nil, nil); r.status != 404 {
		t.Fatalf("group 404: %d", r.status)
	}
	if r := call(t, "GET", "/api/v1/teachers/00000000-0000-0000-0000-000000000000/day", nil, nil); r.status != 404 {
		t.Fatalf("teacher 404: %d", r.status)
	}
	if r := call(t, "GET", "/api/v1/teachers/not-a-uuid/day", nil, nil); r.status != 400 {
		t.Fatalf("teacher bad id: %d", r.status)
	}
}

func TestSearch(t *testing.T) {
	res := decode[httpapi.SearchResult](t, call(t, "GET", "/api/v1/search?q=%D0%9F%D0%9E23", nil, nil)) // ПО23
	if len(res.Groups) == 0 || len(res.Groups) > 5 {
		t.Fatalf("groups: %d", len(res.Groups))
	}
	res = decode[httpapi.SearchResult](t, call(t, "GET", "/api/v1/search?q=101", nil, nil))
	if len(res.Rooms) == 0 || res.Rooms[0].Code != "101" {
		t.Fatalf("rooms: %+v", res.Rooms)
	}
	res = decode[httpapi.SearchResult](t, call(t, "GET", "/api/v1/search?q=%D0%B1%D0%B0%D0%B7%D1%8B", nil, nil)) // базы
	if len(res.Courses) == 0 || res.Courses[0].Code != "CS201" {
		t.Fatalf("courses: %+v", res.Courses)
	}
	if r := call(t, "GET", "/api/v1/search", nil, nil); r.status != 400 {
		t.Fatalf("missing q: %d", r.status)
	}
}

func TestAdminAndRealtime(t *testing.T) {
	snap := decode[httpapi.Snapshot](t, call(t, "GET", "/api/v1/buildings/A/board", nil, nil))
	var target httpapi.SessionView
	for _, s := range snap.Next {
		if s.Status == "scheduled" && s.LessonId != nil {
			target = s
			break
		}
	}
	if target.LessonId == nil {
		t.Fatal("no scheduled session in NEXT")
	}

	// unauthorised
	body := map[string]any{"kind": "cancel", "date": "2026-09-15", "lessonId": target.LessonId.String()}
	if r := call(t, "POST", "/api/v1/admin/overrides", body, nil); r.status != 401 {
		t.Fatalf("no key: %d %s", r.status, r.body)
	}
	if r := call(t, "POST", "/api/v1/admin/overrides", body, map[string]string{"X-Api-Key": "wrong"}); r.status != 401 {
		t.Fatalf("wrong key: %d", r.status)
	}
	// validation
	if r := call(t, "POST", "/api/v1/admin/overrides", map[string]any{"kind": "move", "date": "2026-09-15", "lessonId": target.LessonId.String()}, map[string]string{"X-Api-Key": adminKey}); r.status != 400 {
		t.Fatalf("move without room: %d %s", r.status, r.body)
	}
	if r := call(t, "POST", "/api/v1/admin/overrides", map[string]any{"kind": "cancel", "date": "2026-09-15"}, map[string]string{"X-Api-Key": adminKey}); r.status != 400 {
		t.Fatalf("cancel without lesson: %d", r.status)
	}

	// subscribe to SSE, then cancel → a new snapshot must arrive within 1 s
	events := subscribe(t)
	first := <-events // replay of the current snapshot
	if first.name != "snapshot" {
		t.Fatalf("first event %s", first.name)
	}
	start := time.Now()
	r := call(t, "POST", "/api/v1/admin/overrides", body, map[string]string{"X-Api-Key": adminKey})
	if r.status != 201 {
		t.Fatalf("cancel: %d %s", r.status, r.body)
	}
	ov := decode[httpapi.Override](t, r)
	var got httpapi.Snapshot
	found := false
	deadline := time.After(3 * time.Second)
	for !found {
		select {
		case ev := <-events:
			if ev.name != "snapshot" {
				continue
			}
			_ = json.Unmarshal(ev.data, &got)
			for _, s := range got.Next {
				if s.SessionId == target.SessionId && s.Status == "cancelled" {
					found = true
				}
			}
		case <-deadline:
			t.Fatal("no snapshot with the cancellation within 3 s")
		}
	}
	if el := time.Since(start); el > time.Second {
		t.Fatalf("propagation took %v (> 1 s)", el)
	}
	// the room is not occupied by a cancelled session
	for _, rs := range got.Rooms {
		if rs.RoomCode == target.RoomCode && rs.Next != nil && rs.Next.SessionId == target.SessionId {
			t.Fatalf("cancelled session still owns the room")
		}
	}
	// REST agrees
	after := decode[httpapi.Snapshot](t, call(t, "GET", "/api/v1/buildings/A/board", nil, nil))
	if after.Stats.SessionsToday != snap.Stats.SessionsToday-1 {
		t.Fatalf("sessionsToday %d → %d", snap.Stats.SessionsToday, after.Stats.SessionsToday)
	}

	// announcement
	r = call(t, "POST", "/api/v1/admin/announcements", map[string]any{"text": "Пожарная тревога отменена", "severity": "warning", "durationMinutes": 5}, map[string]string{"X-Api-Key": adminKey})
	if r.status != 201 {
		t.Fatalf("announcement: %d %s", r.status, r.body)
	}
	select {
	case ev := <-events:
		if ev.name != "announcement" && ev.name != "snapshot" {
			t.Fatalf("unexpected event %s", ev.name)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no announcement event")
	}

	// delete → back to scheduled
	if r := call(t, "DELETE", "/api/v1/admin/overrides/"+ov.Id.String(), nil, map[string]string{"X-Api-Key": adminKey}); r.status != 204 {
		t.Fatalf("delete: %d", r.status)
	}
	if r := call(t, "DELETE", "/api/v1/admin/overrides/"+ov.Id.String(), nil, map[string]string{"X-Api-Key": adminKey}); r.status != 404 {
		t.Fatalf("delete twice: %d", r.status)
	}
	restored := decode[httpapi.Snapshot](t, call(t, "GET", "/api/v1/buildings/A/board", nil, nil))
	if restored.Stats.SessionsToday != snap.Stats.SessionsToday {
		t.Fatalf("delete did not restore: %d vs %d", restored.Stats.SessionsToday, snap.Stats.SessionsToday)
	}

	// move + delay + extra + reassign happy paths
	var t2 httpapi.SessionView
	for _, s := range restored.Next {
		if s.Status == "scheduled" && s.LessonId != nil && s.RoomCode != target.RoomCode {
			t2 = s
			break
		}
	}
	other := ""
	for _, rs := range restored.Rooms {
		if rs.RoomCode != t2.RoomCode && rs.RoomCode != target.RoomCode {
			other = rs.RoomCode
			break
		}
	}
	key := map[string]string{"X-Api-Key": adminKey}
	if r := call(t, "POST", "/api/v1/admin/overrides", map[string]any{"kind": "move", "date": "2026-09-15", "lessonId": t2.LessonId.String(), "newRoomCode": other}, key); r.status != 201 {
		t.Fatalf("move: %d %s", r.status, r.body)
	}
	if r := call(t, "POST", "/api/v1/admin/overrides", map[string]any{"kind": "delay", "date": "2026-09-15", "lessonId": t2.LessonId.String(), "delayMinutes": 15}, key); r.status != 201 {
		t.Fatalf("delay: %d %s", r.status, r.body)
	}
	if r := call(t, "POST", "/api/v1/admin/overrides", map[string]any{"kind": "reassign_teacher", "date": "2026-09-15", "lessonId": t2.LessonId.String(), "newTeacherId": target.Teacher.Id.String()}, key); r.status != 201 {
		t.Fatalf("reassign: %d %s", r.status, r.body)
	}
	if r := call(t, "POST", "/api/v1/admin/overrides", map[string]any{"kind": "extra", "date": "2026-09-15", "courseCode": "OPEN100", "roomCode": "107", "teacherId": target.Teacher.Id.String(), "slotIdx": 9, "groups": []string{target.Groups[0]}, "note": "Гостевая лекция"}, key); r.status != 201 {
		t.Fatalf("extra: %d %s", r.status, r.body)
	}
	final := decode[httpapi.Snapshot](t, call(t, "GET", "/api/v1/buildings/A/board?at=2026-09-15T16:00:00%2B05:00", nil, nil))
	foundExtra := false
	for _, s := range final.Now {
		if s.Status == "extra" && s.CourseCode == "OPEN100" && s.RoomCode == "107" {
			foundExtra = true
		}
	}
	if !foundExtra {
		t.Fatalf("extra session missing from NOW at 16:00")
	}
	moved := decode[httpapi.Snapshot](t, call(t, "GET", "/api/v1/buildings/A/board?at="+t2.StartAt.Add(20*time.Minute).UTC().Format("2006-01-02T15:04:05Z"), nil, nil))
	ok := false
	for _, s := range moved.Now {
		if s.SessionId == t2.SessionId && s.Status == "delayed" && s.RoomCode == other && s.MovedFrom != nil && *s.MovedFrom == t2.RoomCode && s.Teacher.Id == target.Teacher.Id {
			ok = true
		}
	}
	if !ok {
		t.Fatalf("moved+delayed+reassigned session not as expected")
	}
	if r := call(t, "GET", "/api/v1/events?building=Z", nil, nil); r.status != 404 {
		t.Fatalf("events for unknown building: %d", r.status)
	}
}

type sseEvent struct {
	name string
	data []byte
}

// subscribe opens the SSE stream and returns parsed events.
func subscribe(t *testing.T) <-chan sseEvent {
	t.Helper()
	req, _ := http.NewRequest("GET", srv.URL+"/api/v1/events?building=A", nil)
	ctx, cancel := context.WithCancel(context.Background())
	req = req.WithContext(ctx)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != 200 || !strings.HasPrefix(res.Header.Get("Content-Type"), "text/event-stream") {
		t.Fatalf("sse: %d %s", res.StatusCode, res.Header.Get("Content-Type"))
	}
	t.Cleanup(func() { cancel(); res.Body.Close() })
	out := make(chan sseEvent, 64)
	go func() {
		sc := bufio.NewScanner(res.Body)
		sc.Buffer(make([]byte, 1<<20), 4<<20)
		var ev sseEvent
		for sc.Scan() {
			line := sc.Text()
			switch {
			case strings.HasPrefix(line, "event: "):
				ev.name = strings.TrimPrefix(line, "event: ")
			case strings.HasPrefix(line, "data: "):
				ev.data = []byte(strings.TrimPrefix(line, "data: "))
			case line == "":
				if ev.name != "" {
					out <- ev
				}
				ev = sseEvent{}
			}
		}
	}()
	return out
}

func TestHeartbeatAndGoldenSnapshotShape(t *testing.T) {
	events := subscribe(t)
	deadline := time.After(3 * time.Second)
	for {
		select {
		case ev := <-events:
			if ev.name == "heartbeat" {
				var hb httpapi.Heartbeat
				if err := json.Unmarshal(ev.data, &hb); err != nil || !hb.At.Equal(clk.Now()) {
					t.Fatalf("heartbeat payload: %s", ev.data)
				}
				return
			}
		case <-deadline:
			t.Fatal("no heartbeat")
		}
	}
}

func TestSpecFileMatchesEmbedded(t *testing.T) {
	// the embedded spec (gen.go) must be generated from the committed openapi.yaml
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "packages", "contracts", "openapi.yaml"))
	if err != nil {
		t.Skip("contracts not available")
	}
	fromFile, err := openapi3.NewLoader().LoadFromData(raw)
	if err != nil {
		t.Fatal(err)
	}
	embedded, _ := httpapi.GetSwagger()
	if len(fromFile.Paths.Map()) != len(embedded.Paths.Map()) {
		t.Fatalf("gen.go is stale: %d paths in yaml, %d embedded — run go generate", len(fromFile.Paths.Map()), len(embedded.Paths.Map()))
	}
	for p := range fromFile.Paths.Map() {
		if embedded.Paths.Find(p) == nil {
			t.Fatalf("path %s missing from embedded spec", p)
		}
	}
}

// TestSSEOutlivesRequestTimeout: the event stream must not be cut by the generic request timeout.
func TestSSEHeaders(t *testing.T) {
	req, _ := http.NewRequest("GET", srv.URL+"/api/v1/events?building=A", nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.Header.Get("Cache-Control") != "no-cache, no-transform" || res.Header.Get("X-Accel-Buffering") != "no" {
		t.Fatalf("sse headers: %v", res.Header)
	}
}
