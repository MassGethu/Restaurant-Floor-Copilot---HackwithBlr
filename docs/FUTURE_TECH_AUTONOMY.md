# Future Tech: autonomous restaurant service

Implemented on 18 November 2026. The operating model is **human on the loop**: the system makes routine operational decisions; the manager handles exceptions and can pause or take over.

The prepared local demo is running at [Service overview](http://127.0.0.1:5174/autonomy), using `backend/data/futuretech-autonomy-demo` and its own Hindsight bank. Recorded footage is paused, a demo pair has an automatic allocation, and a nine-person party demonstrates the exception queue. The original shift database was not used for this demo. [Prepared desktop view](verification/futuretech-ready-desktop.png)

## Reassignment and QR update

- Guests scan the printable sign at `/welcome` to open `/check-in`. Settings includes **Print guest check-in QR**. The sign detects the laptop’s LAN address, lets you override it with a hosted address, and prevents printing a localhost-only code. Guests using the local address must share the restaurant Wi-Fi. Reprint if the laptop’s address changes.
- The frontend now proxies API and WebSocket requests to the local backend through the same origin, so a phone does not try to call its own `127.0.0.1`. Vite listens on the local network; the backend can remain bound to loopback. A hosted deployment needs the equivalent `/api` reverse proxy.
- Unacknowledged jobs move after **45 seconds** by default, configurable in Settings. The controller tries a different available staff member with the matching role and spare workload capacity, recording who already missed the job to avoid repeated bouncing.
- Staff can mark themselves unavailable or available on Staff jobs. Unavailability transfers their open, acknowledged or in-progress jobs. The replacement receives an open job and must check the current physical state before continuing. Returning available explicitly makes that person eligible to retry missed work.
- Staffing exceptions appear only when no eligible available person can take failed/reassigned work. Ordinary capacity queues wait; after the existing task timeout, an unstaffed queue also escalates. Acknowledged or in-progress work is not escalated merely because it is old; it receives high priority. Physical problems reported by staff still appear immediately.
- Every staff task update includes its assignment revision and owner. A stale staff screen cannot complete or acknowledge a task after it moved to somebody else.
- Verification: **245 backend tests**, **18 frontend tests**, production build, QR decoding, and guest registration through the decoded LAN URL. The LAN check also caught and fixed an HTTP secure-context issue in request-ID generation. [Printable sign screenshot](verification/guest-qr-welcome.png), [LAN guest check-in](verification/qr-lan-check-in.png).

## What changed

| Stage | Previous workflow | Current workflow |
| --- | --- | --- |
| Arrival | Host enters every party | Guests use `/check-in`; the host remains a fallback |
| Table choice | Manager approves a recommendation | Controller allocates an eligible table and logs its policy |
| Guest guidance | Informal staff coordination | A seating job is dispatched to a host, or a waiter when no host is configured |
| Arrival evidence | Allocation treated as a seat event | Ticket clearly says assigned; vision or a staff report confirms arrival |
| Departure | Manager confirms each empty table | Sustained vacancy after prior presence closes the dining session |
| Cleaning | Manager creates/assigns/monitors work | Controller creates and assigns work; cleaner reports physical completion |
| Next seating | Another manager approval | Cleaning completion makes the next allocation possible automatically |
| Service visit | Suggested task awaits assignment | Check-in and assistance tasks are dispatched by role and workload |
| Problem | Manager watches every step | Deduplicated exception, acknowledgement, intervention note and automatic recovery |
| Learning | Manually entered lessons | Lessons remain available; automatic events and task outcomes are recorded with provenance |

## Decisions made

- **Keep the camera, FastAPI, React and SQLite foundation.** The existing allocation rules, queue protection, replay clock, stale-action checks and memory provenance remain useful. This is a working control loop rather than a new presentation layer.
- **Run decisions on the server.** The controller wakes every second independently of the dashboard. Physical task reporting and manager actions share the operations lock with automatic actions, so competing requests cannot double-allocate a party or table.
- **Use bounded autonomy.** A table needs a recorded clean check, fresh confirmed absence, sufficient capacity, and a matching staff role before an automatic allocation. Blocks and active manual holds are respected. A new service starts with staff opening checks rather than assuming empty means clean.
- **Distinguish allocation from arrival.** A table reservation creates guidance work and stays reserved if guests never arrive. The system escalates after 90 scenario seconds by default; it does not silently release that reservation as a departure.
- **Require continuous departure evidence.** The default is 12 additional seconds of confirmed vacancy after the occupancy model's own threshold, and only after prior presence. Reconnects and process restarts reset evidence continuity. A short detection gap does not close the party.
- **Keep physical confirmation with the worker doing the job.** The cleaner reports a clean, empty table. The manager does not approve it. An in-progress cleaner can appear on camera without cancelling the opening check; completion still requires an empty table or an in-person check in staff mode.
- **Queue ordinary workload without alert fatigue.** Staff receive up to three active jobs by default. Additional jobs wait; unavailable or unresponsive assignees trigger reassignment; exhausted staffing options become exceptions. Staff can report a specific problem immediately without waiting for a timer.
- **Use real recalled memory, with a fallback.** Matching retained preferences trigger a nonblocking recall window of up to eight seconds. Only facts actually returned by Hindsight, still valid for the layout and service context, can change the allocation. Cached preference evidence expires after 60 seconds. Missing or slow memory falls back to the rules. Hosted reasoning remains available for advice and comparisons; it is not a dependency of the control loop.
- **Preserve the first-time space check.** Recalled active extra-chair checks can be used automatically when standard allocations leave the table free. Unknown space, inadequate capacity and combined tables require judgment. An exceptional manager seating action can dispatch guidance while other automatic service continues.
- **Record observations without claiming success.** Allocation is not arrival; a staff completion report is not independently observed cleaning; a lifecycle event does not prove a causal improvement. Experience records retain these qualifications. Automatic operational records omit guest names and staff free-text notes.
- **Keep manual operation available.** Pause is temporary takeover; disabling automation restores the existing individual seating controls. Camera failure holds automatic seating, while dispatch and existing work continue. Staff mode supports direct checks during recovery.

## Manager, staff and guest views

- `/autonomy` is the default landing view: operating state, exception count, allocation count, team workload and recorded decisions. Exceptions can be acknowledged and rechecked; acknowledgement does not complete a task or manufacture evidence.
- `/staff` is the job board, filtered by team member. Staff can acknowledge, start, complete, report a problem and mark a reported problem resolved. Assignment and priority tools remain under Settings → Roster & assignments.
- `/check-in` is a separate guest page. Check-in requests are idempotent, a browser reload restores the ticket, and retries preserve the original request. Its status responses contain only the current guest's ticket, not the floor's guest list or staff data.
- `/floor` is the live inspection view. In automatic operation, routine approval controls are replaced with service status. Table interventions and applicable extra-chair exception cards remain available.
- `/settings` includes departure, task timeout, arrival timeout, workload and manual-operation controls. `/supervisor` retains lessons, shift context, optional reasoning and handover.

## Live demo

Run from the repository root after installing dependencies and preparing the controlled footage:

```sh
./run_all.sh --video controlled-floor-demo
```

1. Open `/floor`, expand Camera and start the controlled replay. Pause it during its initial empty interval, before 12 seconds.
2. Open `/staff`. Select Cleaner 1 and report Table 1 and Table 2's opening clean checks complete. These are **staged physical-work reports** for the demo.
3. On `/check-in`, register a party of two. Its ticket updates to Table 1 automatically. In another tab, register a party of four, or add it from the Floor. The system assigns Table 2 and dispatches guidance.
4. Add a party of nine to show a capacity exception. On `/autonomy`, acknowledge it and record an intervention note. No routine approval is required for the other parties.
5. Resume footage. Presence appears at Table 1 around 15 seconds and Table 2 around 28 seconds. Table 1's short 40–42 second gap must not close the session.
6. After Table 1 becomes persistently vacant, its departure closes and a cleaning task arrives automatically. Pause once this happens. Complete that staged cleaner task; any suitable waiting party is then allocated automatically.
7. In Staff jobs, report a cleaning-supplies problem to demonstrate immediate exception handling. Resolve it and watch the exception close on the next controller cycle.

The footage is a labelled stock montage, not a real restaurant trial. All physical staff reports in this walkthrough are staged. Vision outputs come from the real YOLO pipeline. Replay time freezes on pause, including replay-based deadlines; real live service uses the persisted wall clock.

For a repeatable isolated rehearsal, without touching existing shift data:

```sh
.venv/bin/python scripts/rehearse_autonomy.py
```

This starts a temporary backend with two configured tables, real inference and no memory credentials. It checks opening dispatch, two automatic allocations, real arrivals, short-gap tolerance, automatic departure, cleaning dispatch and automatic seating after completion. It makes **zero seating or departure approval calls**. [Recorded result](verification/futuretech-autonomy-rehearsal.json)

The browser workflow can be replayed against an isolated local demo on ports 8001/5174:

```sh
playwright-cli -s=futuretech open http://127.0.0.1:5174/autonomy
playwright-cli -s=futuretech run-code --filename=scripts/verify_autonomy_browser.js
```

That browser script **resets its target replay**. Use a disposable demo database. It verifies problem reporting, manager acknowledgement, cleaner completion, guest allocation, ticket reload, pause/resume and overflow at five viewport widths. [Browser report](verification/futuretech-browser-report.json)

## Verification and limits

The implementation includes tests for the full lifecycle, repeated and concurrent ticks, no-show reservations, camera outages, per-table stale evidence, pause/staff mode, blocks, workload limits, overdue work, exception recovery, restart persistence, short gaps, cleaner presence, remembered chairs, actual-recall requirements, invalidated lessons, bounded memory fallback and guest/API contracts. A separate integration test lets the background worker dispatch and allocate with no browser or snapshot requests.

Screenshots: [manager overview](verification/futuretech-autonomy-browser.png), [staff problem exception](verification/futuretech-exception-browser.png), [guest assignment](verification/futuretech-guest-browser.png), [mobile overview](verification/futuretech-mobile-browser.png).

Verification passed **240 backend tests**, **17 frontend tests**, the production frontend build, nine real-inference rehearsal checks and seven browser workflow/responsiveness checks.

Two additional browser fault-injection checks passed: losing the response after the server committed a check-in, and losing the request before it reached the server. Reload/retry recovered one ticket in both cases without duplicating the party. [Recovery evidence](verification/futuretech-checkin-recovery.json)

A deterministic four-hour operational simulation also passed 2,880 controller cycles with 225 generated parties, 187 completed dining sessions, 407 completed staff tasks and two staged camera outages. It checked unique allocations, capacity, party/table consistency, role matching, incident deduplication and the bounded decision log. These are synthetic load/invariant checks, not measured restaurant results. [Simulation report](verification/futuretech-soak.json)

```sh
.venv/bin/python scripts/soak_autonomy.py
```

The real-inference rehearsal uses no live Hindsight or Groq call. A separate **real Hindsight Cloud verification** retained a synthetic rush-hour correction, recalled its actual fact ID, and let the controller execute T3 instead of baseline T2 with zero manager approvals. Disputing that lesson stopped it influencing the next allocation. This exercises real memory against structured synthetic floor data, separately from vision; it does not establish restaurant business impact. [Live memory evidence](verification/futuretech-live-memory.json)

To reproduce that isolated live-service check using configured credentials:

```sh
.venv/bin/python scripts/verify_autonomy_memory.py
```

It creates a separate synthetic memory bank and never changes the restaurant's current shift. The older hosted-model advice evaluation remains historical evidence for the advisory version; the new controller does not require a hosted reasoning call to execute the recalled operating preference.

This remains a local, trusted-workspace prototype. Staff selection is a convenience filter rather than authentication; manager/staff APIs retain the original trusted-desk access model. A public multi-user deployment needs identity and role enforcement. The guest page provides a scoped response, but does not make the entire API private. No payments, POS integration, robotic cleaning, SMS delivery, customer identity recognition or automatic table joining was added.

The visual skill's landing-page checker was also run. Its hero-screen, marketing-call-to-action and section-composition requirements do not fit an operational dashboard; those were not used to turn the workspace into a marketing page. Applicable contrast findings were corrected, and the actual browser workflow and five-width overflow checks passed. The generic landing-page gate is not reported as passing.
