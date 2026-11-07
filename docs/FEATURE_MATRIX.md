# Expanded feature audit — 6 November 2026

This maps the user's 35-item feature attachment to the current local application. “Implemented” describes prototype behavior, not measured accuracy on real restaurant CCTV. The user has no restaurant footage; edited stock scenarios are disclosed throughout.

| # | Feature | Current behavior / qualification |
|---|---|---|
| 1 | Table occupancy | Actual pretrained YOLO + ByteTrack, manually drawn regions and temporal confirmation. |
| 2 | Occupancy duration | Replay timers use clip time; live and staff-confirmed service use wall time. Observed-only sessions disclose uncertain start. |
| 3 | Departure | Sustained visual absence requests staff review. Staff confirmation ends the seating. |
| 4 | Availability | Separate unknown, occupied, verification, dirty and staff-confirmed ready states. |
| 5 | Waiter assistance | **Partial:** manual requests and configurable timed check-ins. Customer intent/gestures are not detected. |
| 6 | Cleaning assistance | Staff-confirmed departure creates cleaning-required state and a task; the camera does not detect dirt. |
| 7 | Staff notifications | Local role-filtered task desk, new-task notices and optional sound. No external push/SMS. |
| 8 | Arriving customers | **Partial:** tracked outside→inside entrance crossings create host-review candidates. Staff/passers-by may trigger them; host confirms true party size. |
| 9 | Table recommendations | Automatic suggestions, staff approval required. |
| 10 | Group allocation | Host-confirmed size and validated table capacities. |
| 11 | Overflow | Queue retains parties without an immediately eligible table. |
| 12 | Waiting estimates | Two explicit dining/cleaning scenarios scheduled under the active policy. |
| 13 | Future availability | **Heuristic:** elapsed known occupancy plus configured duration ranges; unknown/overdue sessions excluded. |
| 14 | Dynamic allocation | Fairness, balanced and throughput presets; current alternatives shown. |
| 15 | Capacity optimization | Best-fit fairness; bounded joint matching for other presets. |
| 16 | Fairness | Oldest feasible default; overdue feasible parties protected in optimized presets. |
| 17 | Queue | Persistent names, size, arrival/seating/departure times, cancellation and CSV export. |
| 18 | Reevaluation | State changes recalculate suggestions and estimates; stale observations suppress seating. |
| 19 | Dirty state | Vacated tables remain unavailable until staff confirms cleaning. |
| 20 | Cleaning priorities | Demand (waiting parties fitting capacity), then age. |
| 21 | Cleaning confirmation | Direct table action or assigned task completion, with readiness validation. |
| 22 | Seating after cleaning | Immediate recommendation recalculation. |
| 23 | Operational actions | Seating, cleaning priorities, manual service requests and timed check-ins. |
| 24 | Explanation | Actual rule/policy, capacity, comparisons, sources and audit events. |
| 25 | Multiple factors | Party/guest counts, wait age and unused capacity with explicit preset weights. |
| 26 | What-if simulation | Pure baseline/proposed schedules for known queue, alternative table and optional delay. |
| 27 | Dynamic waits | Same policy engine as recommendations; recalculated after changes. |
| 28 | Uncertainty | Envelope of two scenarios; not statistical confidence or guaranteed bounds. |
| 29 | Floor visualization | Live region feed and table status cards. |
| 30 | Camera overlay | Actual detections/tracks, dining regions and optional entrance region. |
| 31 | Timers | Pausing freezes footage time; live and staff-confirmed service track wall time. |
| 32 | Central alerts | Floor attention links and operations task desk with role/assignment/lifecycle controls. |
| 33 | Recommendations panel | Floor seating decisions, cleaning queue and staff tasks. |
| 34 | Manual control | Approve, alternate-table override, decline, cancel, corrections, task handling and host review. |
| 35 | Analytics | Current counts, scenario-minute samples, seated guests, completed sessions, waits, tasks, overrides and archived sessions. |

## Algorithm boundaries

Balanced and throughput match at most eight ready tables against the first twelve feasible queued parties. Above eight ready tables the allocator falls back to fairness. Balanced weights: party 100, guests 10, wait minutes 2, unused seats −3. Throughput weights: 20, 30, 1, −1. Waiting-score age is capped at 60 minutes; oldest overdue feasible parties receive dominant ordered protection. These are explicit design choices, not trained scores.

Future schedules include known parties only, parallel cleaning, configured dining/cleaning ranges and the same allocator. A delayed choice reserves its table. Unknown or overdue occupied tables are excluded. Queue estimates use a 240-minute horizon; interactive simulation allows 1–240 minutes. Different allocations can make the “long duration” scenario seat a particular party sooner, so the displayed range uses the envelope.

Staff roster and assignments are local records, not authenticated staff accounts. Occupied-capacity metrics are not actual guest counts. Sampled trends and archives are recorded scenario data, not historical restaurant training data.

## Evidence

- Full backend suite: `backend/tests`, JUnit in `docs/verification/backend-junit.xml`.
- Frontend helper tests and production TypeScript/build; helper tests do not cover every new interaction.
- Browser: task assignment/acknowledgement/start/completion, entrance confirmation, policy changes, availability, analytics and what-if comparison inspected interactively.
- `scripts/smoke_expanded.py`: running API + actual YOLO, check-ins, cleaning tasks, reseating and analytics.
- `scripts/verify_arrivals.py`: actual YOLO/track crossing on translated stock pixels; synthetic calibration only.
- `docs/verification/acceptance-summary.json`: final results and source fingerprints.

No natural arrival accuracy, customer-intent detection, learned departure prediction, live webcam evaluation or real multi-table CCTV benchmark is claimed.
