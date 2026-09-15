// Package realtime is a small Server-Sent Events broker: one hub per building,
// full snapshots on every change, heartbeats to keep proxies happy.
package realtime

import (
	"bufio"
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// Event is one SSE message.
type Event struct {
	Name string
	Data []byte
}

// Options tune the broker.
type Options struct {
	// Heartbeat interval (25 s by default) — proxies drop idle connections around 30–60 s.
	Heartbeat time.Duration
	// ClientBuffer is the per-client queue; a client that falls this far behind is dropped
	// (it reconnects and receives the latest full snapshot, so nothing is lost).
	ClientBuffer int
	// Now is used for heartbeat payloads (the service clock, not time.Now).
	Now func() time.Time
}

type client struct {
	ch   chan Event
	done chan struct{}
}

type hub struct {
	mu      sync.RWMutex
	clients map[*client]struct{}
	last    *Event // last snapshot, replayed to new subscribers
}

// Broker owns one hub per building.
type Broker struct {
	opts Options
	mu   sync.Mutex
	hubs map[string]*hub
}

// New creates a broker.
func New(opts Options) *Broker {
	if opts.Heartbeat <= 0 {
		opts.Heartbeat = 25 * time.Second
	}
	if opts.ClientBuffer <= 0 {
		opts.ClientBuffer = 16
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	return &Broker{opts: opts, hubs: map[string]*hub{}}
}

func (b *Broker) hub(building string) *hub {
	b.mu.Lock()
	defer b.mu.Unlock()
	h, ok := b.hubs[building]
	if !ok {
		h = &hub{clients: map[*client]struct{}{}}
		b.hubs[building] = h
	}
	return h
}

// Publish fans an event out to every subscriber of the building. Snapshots are remembered
// so that a new subscriber immediately gets the current state.
func (b *Broker) Publish(building string, ev Event) {
	h := b.hub(building)
	h.mu.Lock()
	if ev.Name == "snapshot" {
		e := ev
		h.last = &e
	}
	var slow []*client
	for c := range h.clients {
		select {
		case c.ch <- ev:
		default:
			slow = append(slow, c)
		}
	}
	for _, c := range slow {
		delete(h.clients, c)
		close(c.done)
	}
	h.mu.Unlock()
}

// Subscribe registers a client and returns its channel plus an unsubscribe function.
// The last snapshot (if any) is queued first.
func (b *Broker) Subscribe(building string) (<-chan Event, <-chan struct{}, func()) {
	h := b.hub(building)
	c := &client{ch: make(chan Event, b.opts.ClientBuffer), done: make(chan struct{})}
	h.mu.Lock()
	h.clients[c] = struct{}{}
	if h.last != nil {
		c.ch <- *h.last
	}
	h.mu.Unlock()
	var once sync.Once
	unsub := func() {
		once.Do(func() {
			h.mu.Lock()
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.done)
			}
			h.mu.Unlock()
		})
	}
	return c.ch, c.done, unsub
}

// ClientCount reports the subscribers of a building (metrics, tests).
func (b *Broker) ClientCount(building string) int {
	h := b.hub(building)
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// HasSnapshot reports whether a snapshot has been published for the building.
func (b *Broker) HasSnapshot(building string) bool {
	h := b.hub(building)
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.last != nil
}

// ServeSSE streams events for a building until the client goes away or ctx is cancelled.
func (b *Broker) ServeSSE(ctx context.Context, w http.ResponseWriter, building string) error {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return fmt.Errorf("streaming unsupported")
	}
	h := w.Header()
	h.Set("Content-Type", "text/event-stream; charset=utf-8")
	h.Set("Cache-Control", "no-cache, no-transform")
	h.Set("Connection", "keep-alive")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	events, dropped, unsub := b.Subscribe(building)
	defer unsub()

	bw := bufio.NewWriter(w)
	write := func(ev Event) error {
		if _, err := fmt.Fprintf(bw, "event: %s\ndata: %s\n\n", ev.Name, ev.Data); err != nil {
			return err
		}
		if err := bw.Flush(); err != nil {
			return err
		}
		flusher.Flush()
		return nil
	}
	// retry hint for EventSource reconnects
	if _, err := fmt.Fprintf(bw, "retry: 2000\n\n"); err != nil {
		return err
	}
	_ = bw.Flush()
	flusher.Flush()

	ticker := time.NewTicker(b.opts.Heartbeat)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-dropped:
			return nil
		case ev := <-events:
			if err := write(ev); err != nil {
				return nil
			}
		case <-ticker.C:
			data := fmt.Sprintf(`{"at":%q}`, b.opts.Now().UTC().Format(time.RFC3339))
			if err := write(Event{Name: "heartbeat", Data: []byte(data)}); err != nil {
				return nil
			}
		}
	}
}
