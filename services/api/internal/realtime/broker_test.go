package realtime

import (
	"bufio"
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSubscribeReceivesLastSnapshotAndEvents(t *testing.T) {
	t.Parallel()
	b := New(Options{})
	b.Publish("A", Event{Name: "snapshot", Data: []byte(`{"v":1}`)})
	ch, _, unsub := b.Subscribe("A")
	defer unsub()
	select {
	case ev := <-ch:
		if ev.Name != "snapshot" || string(ev.Data) != `{"v":1}` {
			t.Fatalf("got %+v", ev)
		}
	case <-time.After(time.Second):
		t.Fatal("no replayed snapshot")
	}
	b.Publish("A", Event{Name: "announcement", Data: []byte(`{}`)})
	b.Publish("B", Event{Name: "snapshot", Data: []byte(`other building`)})
	select {
	case ev := <-ch:
		if ev.Name != "announcement" {
			t.Fatalf("got %+v", ev)
		}
	case <-time.After(time.Second):
		t.Fatal("no event")
	}
	select {
	case ev := <-ch:
		t.Fatalf("cross-building leak: %+v", ev)
	case <-time.After(50 * time.Millisecond):
	}
	if b.ClientCount("A") != 1 || b.ClientCount("B") != 0 || !b.HasSnapshot("A") || b.HasSnapshot("C") {
		t.Fatal("counts")
	}
	unsub()
	unsub() // idempotent
	if b.ClientCount("A") != 0 {
		t.Fatal("unsubscribe")
	}
}

func TestSlowClientIsDropped(t *testing.T) {
	t.Parallel()
	b := New(Options{ClientBuffer: 2})
	_, dropped, unsub := b.Subscribe("A")
	defer unsub()
	for i := 0; i < 3; i++ {
		b.Publish("A", Event{Name: "snapshot", Data: []byte("x")})
	}
	select {
	case <-dropped:
	case <-time.After(time.Second):
		t.Fatal("slow client not dropped")
	}
	if b.ClientCount("A") != 0 {
		t.Fatal("dropped client still registered")
	}
}

func TestServeSSEWritesEventsAndHeartbeats(t *testing.T) {
	t.Parallel()
	fixed := time.Date(2026, 9, 8, 5, 47, 0, 0, time.UTC)
	b := New(Options{Heartbeat: 30 * time.Millisecond, Now: func() time.Time { return fixed }})
	b.Publish("A", Event{Name: "snapshot", Data: []byte(`{"building":"A"}`)})

	rec := httptest.NewRecorder()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- b.ServeSSE(ctx, rec, "A") }()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if strings.Contains(rec.Body.String(), "event: heartbeat") {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	b.Publish("A", Event{Name: "announcement", Data: []byte(`{"text":"hi"}`)})
	time.Sleep(50 * time.Millisecond)
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	body := rec.Body.String()
	if rec.Header().Get("Content-Type") != "text/event-stream; charset=utf-8" {
		t.Fatalf("content type %q", rec.Header().Get("Content-Type"))
	}
	if !strings.HasPrefix(body, "retry: 2000\n\n") {
		t.Fatalf("retry hint missing: %q", body[:min(len(body), 40)])
	}
	for _, want := range []string{"event: snapshot\ndata: {\"building\":\"A\"}\n\n", "event: heartbeat\ndata: {\"at\":\"2026-09-08T05:47:00Z\"}\n\n", "event: announcement\ndata: {\"text\":\"hi\"}\n\n"} {
		if !strings.Contains(body, want) {
			t.Fatalf("missing %q in\n%s", want, body)
		}
	}
	// every frame is well-formed: "event: x" followed by "data: ..." and a blank line
	sc := bufio.NewScanner(strings.NewReader(body))
	for sc.Scan() {
		line := sc.Text()
		if strings.HasPrefix(line, "event: ") {
			if !sc.Scan() || !strings.HasPrefix(sc.Text(), "data: ") {
				t.Fatalf("event without data line")
			}
		}
	}
}
