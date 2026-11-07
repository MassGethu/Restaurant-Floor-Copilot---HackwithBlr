# Restaurant Floor Copilot — project guide

Restaurant Floor Copilot is a host and shift supervisor desk for a walk-in restaurant. The floor view brings together what the camera sees, what staff have confirmed, which parties are waiting, and what can safely happen next. The Supervisor uses Hindsight to recall what staff learned on earlier shifts, including when an intervention did or did not help.

## Try the busy shift

From the project root, run:

```sh
.venv/bin/python scripts/rehearse_busy_shift.py --manual
```

This opens a fresh practice desk on a separate loopback port. The launcher prints its URL and a command to simulate a camera outage. It uses a temporary database and configuration, the staged demo clip, and real YOLO inference. Hindsight and Groq are disabled in this copy. Press Ctrl+C to close the practice servers and discard the scratch state. If the clip or dependencies are missing, follow [local setup guide](SETUP.md).

1. On **Floor overview**, scroll to **Visual observation**. Select `controlled-floor-demo.mp4`, click **Start replay**, wait for the camera to be ready, and pause early in the vacant interval. Confirm Tables 1 and 2 empty and clean. Block Table 3 from walk-in seating and leave Table 4 unverified.
2. In the **Waiting room**, add a party of two and accept its seating decision for Table 1. Add a party of four and seat it at Table 2. Add a second pair and a party of six; both should wait. Open **Staff tasks** and request a service visit for Table 2, such as a water refill. Return to the floor and resume the replay.
3. At about 15 and 28 seconds of footage, t he detector sees the first two tables occupied. The brief blank at 40–42 seconds should leave Table 1 seated. At about 71 seconds **Table turnover** asks for a departure check. Pause, then click **Confirm departed** to simulate the host verifying that the guests left. A cleaning task now exists. Assign it to a cleaner in **Staff tasks**.
4. In a second terminal, run the outage command printed by the launcher. The floor loses fresh camera observations and suspends camera seating. Click **Use staff checks**. The queue and tasks remain; the service clock keeps running.
5. At Table 1, use **Confirm empty and clean** to represent checking the table in person. The staff check is valid for 60 seconds. Approve seating the next pair. The party of six should still be waiting.
6. Click **Reconnect source** and wait for fresh observations, then **Resume camera assistance**. Reconnecting the file reopens the clip from its beginning; it keeps the current parties and tasks. Pause the practice clip when ready. **Restart replay** is a different action: it starts a new scenario, and is blocked during active service if open work would be abandoned.
7. Open **Supervisor → Start the next shift** and enter a label. Use **Shift handover → Prepare current-work brief**. It should report the remaining party of six and the outstanding Table 2 service visit. The incoming shift must re-confirm temporary conditions.

For the automatic version, run:

```sh
.venv/bin/python scripts/rehearse_busy_shift.py
```

Add `--report /path/to/result.json` to save measured checkpoints. The exercise normally takes a little over a minute after the model loads. The recorded run is in [busy-shift-rehearsal.json](verification/busy-shift-rehearsal.json).

To try real memory separately, open [the configured Supervisor](http://127.0.0.1:5174/supervisor) and click **Recall past lessons** under **Shift handover**. On the existing Local profile this reads the Docker bank and shows source excerpts alongside current work, without a hosted generation request. **Ask supervisor** does call the configured action model, and **Compare identical inputs with memory removed** runs a second reasoning pass. You can inspect the saved comparison below without spending credits.

## Feature inventory

| Where | Features | How they work |
| --- | --- | --- |
| **Floor overview** | Camera health and mode, waiting room, next seat, table status, turnover, open work, recent events | The host can work the queue and confirm a table without opening the video. Floor events identify their source. Desktop and compact navigation link directly to tasks, arrival review, Supervisor and camera controls. |
| **Waiting room** | Add a party, record size, cancel, see elapsed wait and estimated range | SQLite records arrivals, seats and departures. Retrying the same add from the desk uses a session-bound request ID. A transport retry does not create another party. |
| **Seating decision** | Best feasible party/table, rationale, alternatives, decline or approve | The allocator checks capacity, table readiness, competing allocations and policy. Fairness, balanced and throughput presets are configurable. Overdue feasible parties receive protection. An alternative shows unused seats, other parties the queue can still seat and displaced-party effects. The server checks the current decision again on approval. |
| **Table status and turnover** | Occupied, ready, needs verification, cleaning required; block/unblock; mark still seated or departed; confirm empty and clean | Stable observations inform table state. Short visual gaps do not close a seating. Sustained absence prompts a check. A staff-confirmed departure ends the seated party and opens cleaning; the table can seat again only after staff confirm readiness. A table blocked for walk-ins is excluded. |
| **Camera outage and recovery** | Camera health, fallback to staff checks, reconnect, explicit return to camera assistance | Missing or stale inference stops camera-assisted seating. In staff mode a checked, empty and clean table is eligible for up to 60 seconds, subject to conflict with fresh observations and the usual allocator checks. The wall clock tracks service after staff mode starts. Reconnect preserves operational state; staff resume camera assistance only when inference is fresh. |
| **Staff tasks** | Cleaning and service requests, timed check-ins, priority, role-filtered roster, assignment, acknowledgement, start, complete; open-task notices and optional sound | Staff or turnover create the underlying work; a configured interval can prompt a waiter check-in. Cleaning requires the cleaner role for assignment and a readiness confirmation to close. Service tasks are assigned to waiters. Manual priority persists as normal or high; the floor also ranks dirty tables by how much waiting demand each can serve, then time dirty. |
| **Arrivals** | Entrance candidates, review, register or dismiss | Track crossings in a calibrated entrance region suggest an arrival. A host decides whether it is a real party and enters the party size. The camera does not create bookings or infer group membership. |
| **Availability and What-if lab** | Table readiness windows, queue comparisons, alternative seating and delays | The simulator runs the allocator over two sets of configured dining and cleaning assumptions. Unknown and overdue timings can be excluded. It shows projected effects on the known queue without changing state. The ranges are scenarios, not learned predictions or guaranteed bounds. |
| **Operations analytics** | Trend, waits, seated parties and guests, completed sessions, work counts, replay archives, CSV export | Read from local operational records and sampled floor activity. Camera-only occupancy counts are distinct from staff-entered party size and seated-guest counts. |
| **Video library, Vision monitor, Table setup** | Upload/list and play video, inspect camera, overlays and tracks; draw or adjust table/entrance polygons and capacity; camera occupancy analytics | OpenCV supplies frames from files or configured sources. Pretrained Ultralytics YOLO detects people and ByteTrack links tracks. Geometry and timed presence thresholds associate detections with regions. Setup includes scene/editor hints; staff verify and save the regions. Footage playback may be paused for a rehearsal. |
| **Supervisor advice** | Evidence cards on Floor and Supervisor, seating alternatives, task priority/assignment, focused questions and optional comparison without memory | Hindsight retrieves episodes for the current question and context. A configurable Groq model selects from server-generated candidates. Review and approve actions individually. Existing tasks can be prioritized or assigned; advice cannot create tasks, clear a table or complete work. |
| **Supervisor experience and handover** | Capture corrections and reasons, link an outcome, inspect sources and delivery, retire outdated guidance, start a logical shift, brief current and incoming staff | The SQLite ledger preserves the source records. Hindsight retains and recalls experience across shifts. The next logical shift keeps floor, queue and tasks intact but resets temporary context. Handover draws open work from SQLite and can add sourced past lessons. |

The prototype does not handle reservations, POS orders, guest identity or staff schedules. The roster and role checks do not provide authenticated accounts or authorization. Treat the app as a trusted local desk.

## What Hindsight does, exactly

**Hindsight is central to the project’s cross-shift learning.** Without it, staff can still run the floor, use the allocator, confirm turnover, assign work, record experience locally and read the current-work handover. With it, the Supervisor can recall why a prior manager overrode the allocator, whether that choice helped, and whether the reason still applies. For example, the allocator can still pick the smallest table that fits during a pickup rush. A recalled correction can explain why moving that same party away from pickup traffic may be worth using extra seats.

| Hindsight operation | Trigger and payload | What the manager gets |
| --- | --- | --- |
| **Retain** | A durable outbox sends a stable document ID, record kind and origin, shift ID, layout revision, timestamp, parent/dependency links and relevant context. Corrections, decisions, outcomes, measured task events and changes to conditions are separate records. The extraction prompt labels the embedded floor snapshot as historical. | Reasons and results survive application restart. The timeline shows pending, retained or failed delivery. Delivery attempts are bounded to three before manual retry; Local and Cloud receipts are tracked separately. |
| **Recall** | An advice question asks for relevant `world` and `experience` facts in this restaurant bank, strictly tagged to the current layout revision. Returned facts are checked against the local ledger and delivery status before they can be shown or cited. Local sourced handover uses the same read path and shows up to three sources. | The manager sees the lesson, source, age, condition and caveat. A lesson may explain history without being allowed to change the current seating decision. |
| **Reflect** | Cloud handover, or explicitly enabled Local reflection, synthesizes retrieved evidence in a read-only operation. It requests facts for validation and instructs the provider to distinguish changed conditions, unresolved questions and current state. Default Local handover builds a source brief from recall without asking a model to write it. | The next manager can see what changed and why. Current queue/task status is supplied separately by SQLite; an old task record cannot reopen work or override current status. |

The app uses the official Python Hindsight SDK. The bank is `floor-copilot-<restaurant-id>`. The Cloud endpoint and credentials and the Docker endpoint and credentials are separate; `./run_all.sh --memory cloud` and `./run_all.sh --memory local` choose the profile. Docker runs memory storage, embeddings and reranking locally. In this project’s configuration, Local extraction and optional native reflection still use a hosted model. The action reasoner remains hosted in both modes, defaults to Groq’s `openai/gpt-oss-120b`, and is called when staff request advice unless proactive advice is enabled. See [Docker setup and limits](LOCAL_HINDSIGHT.md).

### When memory can change a seating decision

- Staff record a direct correction naming the baseline table, preferred table and reason. A useful record ties that correction to confirmed conditions in its original shift. Staff can separately record **helped**, **did not help** or **unknown**. An approval records a decision; it does not prove success.
- For an alternative seat, the cited correction must be active and retained, from this restaurant and layout, and must match the actual baseline and the proposed table. A current manager must re-confirm the same delivery condition (**normal** or **rush**) in the new shift. A correction can guide ranking for seven days. A negative linked outcome, competing current corrections, a new layout or an explicit supersession can prevent it from guiding an action. Historical records remain available for review.
- SQLite determines which parties and tables are eligible. The model can return `seat_party`, `prioritize_task`, `assign_task` or `no_action` using only the supplied candidates. The app validates citations and rejects invented IDs. It cannot offer a memory alternative that displaces another baseline allocation, including a protected overdue party. The UI shows trade-offs; approval rechecks freshness, floor and memory revisions, capacity, task state and staff role. Memory action advice is paused in staff mode.
- For a rush recovery, recalled experience can explain why an existing cleaning or service task deserves priority. Priority and assignment are separate approvals. A staff member still does the work and confirms the outcome. Starting a shift does not replay footage or clear work.

Party and staff IDs and operational context may be sent to configured providers. The application omits footage, customer/staff names, raw detections and task free text from the floor payload. **Do not enter personal or sensitive data in shift context, corrections, feedback or questions**: free text in those fields is sent as entered. Model and memory output are treated as evidence, not instructions.

### Architecture and failure handling

1. **Camera:** OpenCV → YOLO / ByteTrack → time-filtered region observations. Stale frames and source changes invalidate observations. Reconnect keeps the operational session; restarting a replay archives it. A motionless live image can trigger the frozen-frame check, but a frozen scene with a moving overlay can escape that check.
2. **Operations:** FastAPI and SQLite are authoritative for floor, parties, tasks, roles, policies and shifts. API requests revalidate against current state. The service clock is based on clip time before staff fallback in a replay, and wall time from the switch to staff-confirmed service; live sources use wall service time. The React/Vite desk uses the same APIs.
3. **Memory and reasoning:** Supervisor captures meaningful episodes, not video frames. It sends work outside the operations lock, with one generation in flight, and discards an answer if its input revision has changed. Provider failure is shown explicitly; basic controls and the operations-only brief are still available. No mock sources appear as live evidence.

## Verification and its limits

- **Current busy-shift rehearsal:** See the [JSON trace](verification/busy-shift-rehearsal.json) for detector timing, recovery, seating, queue preservation and handover. The [browser run](verification/busy-shift-browser.json) also verified turnover, queue entry, staff seating, reconnect, handover and mobile navigation. The clip is a labeled synthetic montage from permitted stock footage; staff actions are staged. The outage stops a configured replay source through the API. It exercises the recovery flow without simulating a specific RTSP transport fault or spending provider credits.
- **Real restaurant footage:** The [Mixkit replay report](verification/restaurant-floor-mixkit-report.json) documents real YOLO/ByteTrack inference on a restaurant time-lapse and a staged workflow. It used earlier turnover rules; use the busy-shift report for current behavior. The time-lapse does not measure dining time or natural arrivals. See [footage provenance](FOOTAGE.md).
- **Cloud memory effect:** The [earlier real-service evaluation](verification/hindsight-live-memory-report.json) moved the recommendation from T2 without memory to T3 with memory in five of five paired trials. The same staged inputs were used and only retrieved evidence changed. The quiet-period control stayed at T2. The report also checks restart retrieval, task recovery and supersession. This shows that memory changed those model outputs; restaurant service impact still needs to be measured.
- **Local memory effect:** The [earlier single Local run](verification/hindsight-local-single-demo.json) used six retained sources, verified one real memory-backed alternative against the deterministic baseline, and built a handover with no handover generation call. On the current backend, [one Local handover after restart](verification/busy-shift-local-recall.json) returned three cited facts and the same open work as SQLite. That verification made no new retain, Groq generation or Hindsight Cloud calls.

## What still needs a real restaurant pilot

Start with one participating venue, one host station and four walk-in tables. Keep the host’s existing queue as the authority. Observe a quiet period and a rush in shadow mode before allowing an assisted seating choice. Rehearse an outage away from peak service first. Keep notes without customer identities.

| Pilot question | What to observe before broader use |
| --- | --- |
| **Can the camera be trusted at this site?** | Compare staff ground truth to presence, vacancy and entrance suggestions across real lighting, crowded aisles, occlusion and staff motion. Count missed and false prompts. Test a real RTSP loss, stale or frozen feed, restart and reconnect with the venue hardware. |
| **Is service safe through a disruption?** | Walk through unplug, reconnect and simultaneous actions from the actual host station. Require zero silent departures, seats without a current eligible table, duplicate queue entries or lost queue/tasks in the pilot. Verify the host can immediately fall back to their normal procedure. |
| **Does this save a host time?** | Compare time to log, seat, clear and re-seat a table, false check prompts, duplicate entry burden, and staff workload against the venue’s current process. Review actual party waits and fairness across sizes. The demo establishes none of these gains. |
| **Does recall help rather than distract?** | Ask incoming managers to judge source accuracy and applicability, whether the advice changed a useful decision, and whether they can retire it when pickup, staffing or floor conditions change. Measure ignored and incorrect advice and capture outcomes. |
| **What would production require?** | Agree on camera placement, permissions, access and retention with the venue; validate authenticated user roles, network security, backups, multi-terminal use, on-site support and provider outage handling before any broader deployment. |

For fixture provenance and inherited work, see [footage](FOOTAGE.md), [attribution](../ATTRIBUTION.md) and [submission disclosure](SUBMISSION_DISCLOSURE.md).
