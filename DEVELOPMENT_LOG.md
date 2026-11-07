# Development log

## 2026-11-05 — foundation
- User approved implementation and copying reference code into the working directory.
- Copied upstream source from `/Users/massgethu/Forks/Clone's/Restaurant-Table-Occupancy-Detection`, commit `51053aac5d4f6e4f5600205d0aadb177fb493826`; excluded its `.git`, preserved LICENSE and original README.
- Architecture: extend FastAPI/React with separate operational state and decisions; direct file playback preferred for timestamp correctness and fewer demo dependencies.
- Audit: source syntax and lockfile parsed; no prior runtime/inference claims. No footage or weights included upstream. Python 3.14 is available locally; default Python is 3.15.
- Goal replacement rejected because an unfinished paused goal exists; tools expose no resume/objective-edit operation. Expanded execution plan persisted in PLAN.md.

Further entries record actual commands, checks, implementation decisions, and unresolved work.

## 2026-11-05 — implementation and verification
- Installed pinned Python requirements into a Python 3.14 venv and frontend dependencies from the lockfile. Network and localhost socket access required sandbox escalation. Default Python 3.15 was avoided for the verified runtime.
- Added `backend/app/operations.py` and `copilot_api.py`: persistent versioned restaurant snapshots in app.db, initial verification, cleaning-required states, staff overrides, seated-party links, grace periods, cancellation, oldest-feasible/best-fit recommendations, transaction-serialized approval, wait schedules and demand-based cleaning priority.
- Added capacity to table configuration and its editor. Retained upstream geometry, tracking, configuration, video upload, and presentation components with attribution.
- Extended source packets with media position and loop epoch. Added pause/resume and non-looping direct-file playback. Source and inference clocks are distinguished. File replay boundaries create new observation sessions; freshness prevents acting on stale inference.
- Added `/floor` dashboard with live video, readiness cards, queue entry, explained approvals, cleaning priority, staff actions, assumption disclosure, and audit events. Updated navigation and title. Direct playback avoids external FFmpeg/MediaMTX services for the default demo.
- Preserved original README as README.upstream.md; wrote current setup, footprint, limitations, and demo instructions.
- Downloaded permitted Pexels footage by Mikhail Nilov; no endorsement implied. See docs/FOOTAGE.md. Created a clearly labeled controlled montage by editing input pixels only; inference and recommendations are never scripted.
- Real stock-frame inference: 5, 5, 5, 7 person detections at 0/5/10/15 seconds; CPU warm timings approximately 32–62 ms. Annotated images inspected. Some duplicate/overlapping boxes appear in the final sample, illustrating why no accuracy or exact customer-count claim is made.
- Detector tests: 4 passed. New operational invariants: 14 passed. Complete backend suite after integration: 126 passed in 11.86 seconds, including detector, media clock, and HTTP workflow checks.
- Fixed test fixture grayscale overflow when extending its duration; lengthened the general API fixture to avoid crossing a replay boundary during a single-session analytics assertion. Dedicated media tests verify loop epoch changes.
- Frontend: production build and 17 tests passed. Audited upstream toolchain, patched Vite to 8.3.6 and Vitest to 5.1.0 plus transitive fixes; npm reports zero known vulnerabilities.
- Browser verification: started and paused footage, confirmed four tables clean, entered a four-person party, received Table 2, approved seating, observed queue removal and occupied count increment together.
- Actual model-driven API smoke test passed: paused media clock, staff seating, overflow and heuristic estimate, vision confirmation of T1/T2, brief absence retention, sustained departure to cleaning at ~71.1 seconds, cleaning confirmation and reseating. Runtime processed around 10 detections per second on this fixture. Report: docs/verification/live-smoke-report.json.

## Remaining limitations / deliberate scope cuts
- Real multi-table CCTV accuracy is unmeasured. Original stock is one table; four-region demo is synthetic, not independent diners. User has no restaurant footage.
- No learned waiting-time prediction; configurable explicit assumptions are used by the engine. Unknown/overdue sessions may require staff estimates. Parallel cleaning is assumed.
- What-if simulation and global allocation comparison deferred; current policy is explicitly oldest feasible then smallest fitting ready table.
- Legacy monitoring analytics are retained upstream functionality, excluded from primary navigation; they are not a media-time analytics product.
- CPU verified; MPS is optional and unbenchmarked. No custom training, cloud inference, identity recognition, POS integration, or authentication added.
- Dependency/model notices and competition rules require final review before external distribution/submission. Upstream attribution preserved.
- Existing paused goal cannot be resumed or rewritten by the provided goal tools. User requested resumption; execution state is recorded in PLAN.md.

- Final review: added staff-editable dining and cleaning ranges, validated ordering/bounds, and verified recalculation. Patched inference freshness reset when switching video. Final suite: 126 backend tests, 17 frontend tests, production build passed. A review scenario uses explicit staff preparation and synthetic queue entries; no approvals are pre-applied for the user.

- Saved full dashboard and recommendation screenshots in docs/verification. Review state is paused at ~35 seconds: two vision-observed occupied regions, one staff-confirmed ready table, one staff-marked cleaning task, and two synthetic waiting parties; Table 3 is recommended for the four-person party. No pending recommendation was approved on the user's behalf.
- Recorded installed Python/frontend license metadata and model SHA-256 in docs/verification/dependency-metadata.json. This is a provenance inventory, not a legal conclusion about the combined application.
- Attempted goal control through the app after tool refusal; computer use is explicitly prohibited from accessing Codex itself. No workaround attempted. Goal card remains paused; implementation and plan persistence are complete within the authorized workspace.

## 2026-11-05 — active-goal completion audit
- User resumed the goal; the earlier paused-card obstacle is resolved.
- Audited the implementation against the full brief rather than treating passing tests as completion.
- Found and fixed: removal/reduced capacity could orphan or overfill a seated party; geometry changes could leave stale readiness; in-flight inference could apply obsolete table regions; staff departure could be immediately undone by old presence; no alternative seating approval or decline; and mixed-capacity schedules could produce a reversed wait interval (reproduced as 17–14 minutes).
- Configuration validation now precedes disk writes under state locks. Region edits require staff verification and cause paused-frame reprocessing. Old-config inference is discarded. Added regression tests for unchanged disk/state on rejection and concurrent approvals.
- Added explicit manager overrides and rejection without queue cancellation. Held staff departures persist until visual absence is confirmed. Events use readable party names.
- Extracted pure allocation/comparison functions to decisions.py. Table alternatives report actual unused seats, other parties/guests immediately seatable and displaced waiting parties. Future arrivals/departures are not simulated. Browser verified the pair-at-six-seater trade-off, explicit manager override, and decline causing a different recommendation while retaining the party.
- Wait intervals now show the envelope of two duration scenarios and retain per-scenario values for traceability. No confidence or guaranteed-bound claim is made.
- Added a last-known-state banner and disabled inactive playback controls. Browser verified stopping footage hides the feed and suppresses seating suggestions while retaining disclosed stale state.
- Final complete backend run: 138 passed, zero failures/errors/skips; JUnit saved. Frontend production build and 17 helper tests passed; JSON report saved. Current source fingerprints are recorded in acceptance-summary.json.
- Refreshed actual YOLO API smoke test passed all six checks at around 10 inference updates/second, including temporary absence, departure, cleaning and reseating. Original stock inference evidence remains separate from the controlled fixture.
- User supplied INFINEX 2K26. TinyFish's initial extraction was collapsed, so the browser expanded Read More to inspect the full public description. Source: https://unstop.com/p/infinex-2k26-propcare-nw-1782880 . Individual participation, 7 November 2026 11:55 p.m. IST submission close, source/demo access and recording/presentation requirements were recorded in docs/HACKATHON_RULES.md. No public pre-existing-code/AI-assistance policy was found. No registration, payment, WhatsApp join or organizer message was performed.
- Saved requirement mapping, original repository audit and submission disclosure. Competition eligibility is not claimed without organizer clarification. External code publication, a judge-accessible URL and final media submission remain future user-authorized steps, distinct from completion of the local prototype.

- Added and ran scripts/verify_regions.py: actual YOLO detected all four configured regions in the repeated-stock fixture; independently blanking T1 and T2 changed only their own states after confirmation. Ten timestamped checks passed. Annotated four-region output was visually inspected. This adds association/isolation coverage without claiming real CCTV accuracy.

## 2026-11-06 — local prototype handoff
- Completion check matched all recorded source SHA-256 fingerprints, 138 backend passes, 17 frontend passes, six live workflow checks, four-region actual-inference verification, and required documentation artifacts. No application source changed after these recorded checks.
- Browser review state restored with four staff-confirmed ready tables and two synthetic queued parties. A manager-choice preview shows the consequence of assigning a pair to the only six-seater; it has not been approved. Saved manager-comparison.jpg and retained the local dashboard tab.
- Local prototype acceptance is complete within the approved scope. Publication/hosting, final presentation media, registration/payment and submission were not performed. INFINEX eligibility is not asserted: the public rules did not specify pre-existing-code or AI-assistance permission.


## 2026-11-06 — expanded implementation after user review

The user found the earlier scope insufficient and requested as many features from the 35-item attachment as practical, thorough tests, and meaningful local commits. The attachment is treated as feature context; the user's direct request authorizes implementation and Git commits.

- Initialized Git from the exact attributed MIT reference tree, reconstructed existing work into logical foundation commits, then committed new work incrementally. No backdating or remote push. See docs/HISTORY.md.
- Added persistent role-aware task assignment, acknowledgement, progress and completion; staff roster; cleaning-task reconciliation; manual service requests and configurable elapsed-time check-ins. Timed suggestions explicitly do not infer customer intent. Dismissed suggestions stay dismissed until another service interval.
- Added an optional entrance-region type, actual tracked outside-to-inside crossings, cooldown/grouping and mandatory host registration/dismissal. Entrance regions do not become dining tables. Verified actual YOLO crossing on a visibly synthetic translated-stock calibration and confirmed a different host-entered party size in the browser.
- Added bounded matching presets for balanced and throughput objectives, ordered overdue protection, pure immediate comparisons and event-driven future what-if schedules. Delayed choices reserve their table; unknown/overdue occupied tables are excluded. No invented future arrivals.
- Added the six-tab operations workspace: staff, arrivals, availability, what-if, analytics and policies. Tested task transitions, host review, policy editing and trade-off comparison interactively. Poll response guards prevent stale reads from replacing a newer mutation; sound is opt-in and handles unavailable audio contexts.
- Added current and archived media-time session analytics, sampled count trends and spreadsheet-safe party CSV export. Roster, policy and assumptions survive restart. Completed visits and table sessions are recorded; occupancy capacity is labeled separately from actual seated guest counts.
- Made prepared camera sources portable relative paths, ignored user runtime configs and retained pinned dependencies. Formatted implementation modules for maintenance.
- Found policy-specific wait estimates still used the earlier FIFO schedule; replaced them with the same future scheduler/allocator used by policy recommendations. Regression checks throughput ordering and preserves the earlier reversed-scenario-envelope regression.
- Final backend: 154 passed. Frontend: 17 existing helper tests passed and production build passed. Browser checks supplement helper coverage; no automated full-component coverage claim. Actual YOLO expanded live workflow and entrance calibration evidence are stored separately. See acceptance-summary.json for final evidence and source hashes.

Remaining limitations are explicit in docs/FEATURE_MATRIX.md. In particular, staff/customer intent, natural party grouping, trained departure prediction and real CCTV accuracy are not established. The app remains a local hackathon prototype without staff authentication or external notifications. Competition submission/publication remains outside this local implementation.


## 2026-11-07 — independent Hindsight edition

- Implemented only in `/Users/massgethu/CV_AI_Hindsight`; preserved the original folder and servers. This edition uses backend 8001 and frontend 5174, including CORS, frontend API settings and live smoke scripts. Storage paths were verified to resolve inside this edition.
- Added the original-source ledger, durable three-attempt retain outbox, official Hindsight client 1.2.0, Groq SDK 1.7.0, logical shifts independent of playback, staff-supplied context, feedback, supersession and dependent-source invalidation. SQLite remains authoritative for current state.
- Added structured advice selecting server candidates, evidence-rooted preference validation, original-version approval checks, bounded generation, and task prioritization/role-matching assignment. Recorded task closures are separate lifecycle evidence, never inferred success. Network calls do not hold the operational lock.
- Added proactive Floor cards and the Supervisor workspace with grouped source evidence, focused questions, same-input comparison, source history and actual Hindsight reflect handover. Current task lists come from operational records. Navigation labels remain accessible when icons are shown without text.
- User configured ignored backend service settings. Actual retain/recall/reflect and the hosted reasoning model were exercised. The final expanded evaluation passed all 12 checks and five paired trials: T3 with memory, T2 without, plus normal-service, restart, recovery, handover and supersession controls. Inputs are synthetic; no real restaurant impact is claimed.
- Live verification found and fixed a duplicated Groq SDK URL path, misinterpretation of a retired preference, and historical holds being confused with current state. Failed/partial runs are preserved in `docs/verification/hindsight-memory-attempt-*.json` and explained in `hindsight-live-failures.md`. An early smoke invocation preceded server readiness; the subsequent actual-model regression passed. One proactive proposal was safely rejected during browser recovery; explicit refreshed advice produced the valid approved task actions.
- Final tests: 189 backend tests, zero failures/errors; 17 inherited frontend helper tests; TypeScript and Vite production build; targeted Ruff checks; dependency consistency. Browser checks covered context, capture, separate feedback, logical shift continuity, genuine comparison, seating approval, task priority/assignment, explicit cleaning completion and sourced handover. Actual YOLO regression passed all five stages on the disclosed controlled input.
- Saved current-source hashes, real-service reports, comparison/approval trace, browser images and handover text under separately named `hindsight-` verification artifacts. Inherited verification remains historical. Exact configured credential values were scanned against all publishable files with zero matches.
- Prepared an unpublished 1,200–1,500-word article, a sub-800-character social post, a four-minute demo script, checklist and unsent eligibility clarification. No account registration, organizer contact, publication or submission. Band AI usage is not asserted. Local Hindsight deployment remains the first stretch item after the working Cloud edition.
- Left the real-service Supervisor open with an unapproved T3 recommendation and its T2 no-memory comparison; the synthetic floor is paused, tables are ready and the recovery task was explicitly completed by staff.

## 2026-11-07 — Local Docker and a budgeted live demo

- Added an explicit Local profile alongside the default Cloud profile. The pinned Hindsight 1.2.0 Compose stack uses loopback-only ports 8888/9999 and edition-owned bind mounts for PostgreSQL and model cache. Cloud credentials remained byte-for-byte unchanged; Local receives no Cloud bearer token. Hosted Groq is still used for extraction and action reasoning.
- Verified a real Cloud → Local → Cloud round trip: all six canonical sources were retained locally; both receipt sets, queue, task records and logical shift survived. An actual Docker outage returned 503 without changing profile or operational records. Recreating the container preserved recalled fact IDs. Cloud recall and native Reflect worked after returning to Cloud. The original folder and servers were outside this work.
- An initial local evaluator passed five paired seating comparisons and the quiet, restart, shift and recovery controls, but failed native handover. Full reruns hit provider limits. Preserved partial evidence and actual error categories. Paced Local retain to fit shared hosted inference capacity.
- At the user's request to conserve their Hindsight credit, ran one live demo with no Cloud memory calls and no new retain. Actual YOLO processed the labeled controlled footage; the deterministic allocator selected T2 and the Local proactive Supervisor proposed T3 citing the stored pickup-rush correction. It also proposed priority and assignment for an existing cleaning task. Neither the synthetic outcome nor the demo is evidence of real restaurant improvement.
- Native local Reflect remained limited by hosted request size and quotas. Local now defaults to a labeled source brief using actual Hindsight recall and current SQLite tasks without a generation call. Cloud retains native Reflect, which is also available as a deliberate Local option. The live source brief returned four verified sources and the current open task. Restarted into the same paused Local scene, reused the valid advice, and disabled automatic refresh for that running demo to conserve model tokens.
- Evidence: `docs/verification/hindsight-docker-verification.json`, `docs/verification/hindsight-local-single-demo.json` and `docs/verification/hindsight-local-failures.md`. Setup and manual-only advice commands are in `docs/LOCAL_HINDSIGHT.md`.
