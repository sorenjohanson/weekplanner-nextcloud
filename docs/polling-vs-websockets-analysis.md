# Polling vs WebSockets Analysis

## Current Implementation: HTTP Long Polling

The app uses a **custom long-polling mechanism** for real-time synchronization between browser tabs or devices.

### How It Works

**Backend** (`lib/Controller/WeekController.php:81-112`):
- `GET /week/{year}/{week}/poll?since={timestamp}` endpoint
- Holds the HTTP connection open for up to **30 seconds**
- Polls the database every **1 second** checking if `updated_at > since`
- Returns immediately when a change is detected, otherwise returns `{changed: false}` after timeout
- Calls `session_write_close()` to avoid blocking other requests from the same session

**Frontend** (`src/App.vue:396-420`):
- Recursive `longPoll()` function that re-invokes itself after each response
- Uses `AbortController` to cancel in-flight requests when switching weeks
- 35-second axios timeout (slightly above the 30s server hold)
- On error: waits 5 seconds before retrying
- Skips applying remote data while a local save is in progress or the user is editing

**Saves** (`src/App.vue:180-202`):
- Debounced at 300ms via `setTimeout`
- `PUT /week/{year}/{week}` writes JSON and sets `updated_at = time()`

### Strengths of Current Approach

1. **Zero infrastructure dependencies** - works on any Nextcloud install with no extra services
2. **Simple to reason about** - one HTTP endpoint, one recursive JS function
3. **Session-aware** - `session_write_close()` prevents PHP session lock contention
4. **Conflict-safe in practice** - skips remote updates while the user is actively editing
5. **Graceful degradation** - on error, falls back to 5s retry; no permanent failure mode
6. **Firewall-friendly** - uses standard HTTP GET, works behind any proxy/CDN

### Weaknesses of Current Approach

1. **Database polling at 1 Hz** - the `poll()` endpoint queries the DB every second per connected client. With N concurrent clients viewing the same week, that's N queries/second even when nothing changes.
2. **Held PHP processes** - each long-poll request occupies a PHP-FPM worker for up to 30 seconds. On shared hosting with limited workers (e.g. 5-10), this can starve other requests.
3. **Latency up to 1 second** - changes are detected on the next DB poll cycle, adding 0-1s latency on top of network time.
4. **No custom-columns polling** - only week data is polled; custom columns have no real-time sync at all.
5. **Last-write-wins** - no conflict resolution; concurrent edits from two tabs can silently overwrite each other.

---

## Alternative 1: Nextcloud `notify_push` Integration

The [`notify_push`](https://github.com/nextcloud/notify_push) app is Nextcloud's official solution for push notifications. It runs a Rust-based daemon that maintains WebSocket connections to clients and dispatches events via Redis.

### How It Would Work

**Backend (PHP):**
```php
// In WeekController::put(), after saving:
$queue = \OC::$server->get(\OCA\NotifyPush\IQueue::class);
$queue->push('notify_custom', [
    'user'    => $userId,
    'message' => 'weekplanner_update',
    'body'    => ['year' => $year, 'week' => $week, 'updatedAt' => $now],
]);
```

**Frontend (JS):**
```js
import { listen } from '@nextcloud/notify_push'

listen('weekplanner_update', (_type, body) => {
    if (body.year === currentYear.value && body.week === currentWeek.value) {
        loadWeek() // re-fetch full data
    }
})
```

The `poll()` endpoint and `longPoll()` function would be removed entirely.

### Pros

| Aspect | Benefit |
|---|---|
| **No DB polling** | Eliminates 1 query/second/client; push is event-driven |
| **No held PHP workers** | The Rust daemon handles WebSocket connections, not PHP-FPM |
| **Lower latency** | Sub-100ms delivery after the PUT completes |
| **Battle-tested** | Used by Nextcloud's own file sync, Talk, and other first-party apps |
| **Simple integration** | ~10 lines of PHP + ~5 lines of JS; well-documented API |
| **Scalable** | The Rust daemon handles thousands of concurrent connections efficiently |

### Cons

| Aspect | Drawback |
|---|---|
| **Requires `notify_push` installed** | Not available on all Nextcloud instances; admin must install and configure it |
| **Requires Redis** | `notify_push` depends on a running Redis server |
| **Reverse proxy config** | WebSocket upgrade (`/push/ws`) must be correctly proxied; common source of setup issues |
| **Graceful fallback needed** | App must detect whether `notify_push` is available and fall back to polling if not |
| **No direct WebSocket control** | Cannot use raw WebSocket features (binary frames, bidirectional messaging); limited to notify_push's event model |

---

## Alternative 2: Raw WebSockets (Custom Implementation)

Build a standalone WebSocket server (Node.js or PHP with Ratchet/Swoole) that the app connects to directly.

### Pros

- Full control over the protocol (binary data, bidirectional messaging, custom auth)
- Could implement operational transforms or CRDT-based conflict resolution

### Cons

- **Massive infrastructure burden** - requires running a separate long-lived process alongside Nextcloud
- **Authentication** - must replicate or proxy Nextcloud session/token validation
- **Not idiomatic** - Nextcloud apps don't ship standalone daemons; admin deployment is complex
- **Duplicates `notify_push`** - reimplements what the existing Nextcloud ecosystem already provides
- **Maintenance overhead** - two runtime environments to keep in sync

**Verdict: Not recommended.** The complexity is disproportionate to the problem. If WebSockets are desired, `notify_push` is the correct path within the Nextcloud ecosystem.

---

## Alternative 3: Server-Sent Events (SSE)

Replace the long-poll loop with an SSE stream (`text/event-stream`) that the server keeps open and writes to when data changes.

### Pros

- Native browser API (`EventSource`), auto-reconnects
- Slightly less overhead than repeated HTTP long-poll requests (single connection)
- No extra infrastructure

### Cons

- **Still holds a PHP worker** - same problem as long polling; the PHP process must stay alive to stream events
- **Still polls the DB** - without a pub/sub layer, the PHP loop still checks the DB periodically
- **Marginal improvement** - eliminates HTTP connection teardown/setup overhead but doesn't solve the core issues
- **HTTP/2 multiplexing** - modern browsers already reuse connections, reducing the reconnect cost of long polling

**Verdict: Marginal improvement over current approach.** SSE solves the wrong problem - the bottleneck is held PHP workers and DB polling, not connection overhead.

---

## Recommendation

### Short Term: Keep Long Polling, Optimize It

The current approach is pragmatic and works reliably. Two improvements would reduce its footprint:

1. **Increase the DB poll interval from 1s to 2-3s** - halves/thirds the query rate with minimal latency impact for a personal planner app.
2. **Add polling for custom columns** - currently only week data is synced in real time.

### Medium Term: Add `notify_push` Support with Fallback

The ideal architecture is:

```
if notify_push available:
    use event-driven push (zero DB polling, zero held workers)
else:
    fall back to current long polling
```

**Implementation steps:**
1. Add `@nextcloud/notify_push` as an optional frontend dependency
2. In `WeekController::put()` and `CustomColumnsController::put()`, dispatch a push event via `IQueue` (wrapped in a try/catch so it's a no-op if `notify_push` isn't installed)
3. In `App.vue`, check for `notify_push` capability and use `listen()` if available; otherwise start `longPoll()` as today
4. Remove the `poll()` endpoint once the fallback is no longer needed (or keep it for backwards compatibility)

This gives the best of both worlds: optimal performance where `notify_push` is available, and universal compatibility where it isn't.

### Not Recommended

- **Raw WebSockets** - too much infrastructure for the problem
- **SSE** - doesn't solve the actual bottleneck (held PHP workers + DB polling)
