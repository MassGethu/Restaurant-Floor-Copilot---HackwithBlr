# Expanded-scope audit notice

The current 35-feature implementation and qualifications are mapped in [FEATURE_MATRIX.md](FEATURE_MATRIX.md). The following audit documents the earlier foundation; its future-simulation deferral was superseded by the 6 November expansion. Current policies and analytics are documented in README.md.

# Requirements and evidence audit

Scope: the approved two-day local prototype, built on the attributed reference. A controlled, explicitly synthetic visual scenario is allowed by the brief. This audit does not substitute stock/montage results for measured real CCTV accuracy.

## P0 acceptance requirements

| Brief item | Implementation and authoritative evidence |
|---|---|
| 1. Prerecorded video | Direct OpenCV playback; original stock-frame report and actual running model smoke report under docs/verification. Webcam is optional and not runtime-verified. |
| 2. Pretrained person detection | detector.py; real detector tests; annotated original restaurant frames inspected. |
| 3. Manual table regions | Retained table editor/config APIs; table editor API tests; prepared four-region config. |
| 4. Associate people to tables | occupancy.py reference-point/polygon checks; actual model smoke confirms distinct controlled regions. |
| 5. Occupied/vacant observations | OccupancyTracker; temporal tests; actual smoke report. Vacancy is distinct from operational readiness. |
| 6. Occupancy duration | Media timestamps carried by source packets; backdated confirmed presence; media-clock tests and browser timers. |
| 7. Transition safeguards | Enter/leave/hold settings; actual 40–42 second absence retained occupancy, sustained absence triggered cleaning. |
| 8. Consistent operational state | Operations service; version checks, concurrency test, persistence, rejected-edit invariants. |
| 9. Capacities | Validated TableDef capacity; editor input; capacity and overfill tests. |
| 10. Vacated → cleaning | Actual model smoke at approximately 71 seconds; operational event trace. |
| 11. Staff cleaning confirmation | API and browser actions; no automatic cleanliness claim. |
| 12. Staff correction | Held occupied/ready corrections, release action, geometry verification hold, manual-departure conflict regression. |
| 13. Register party | Validated HTTP input and dashboard form; API/browser verification. |
| 14. Group size/arrival | Persistent party records; scenario arrival timestamps; paused clock test. |
| 15. Waiting queue | FIFO insertion and oldest-feasible policy; cancellation, overflow, fairness tests. |
| 16. Mark seated | Transaction-serialized approval and party/table links; duplicate and concurrent approval tests. |
| 17. Suitable ready tables | Capacity/readiness/freshness eligibility; dirty/uncertain tables excluded. |
| 18. Transparent allocation | Pure decisions.py allocator; oldest feasible then smallest fit with stable tie-break. |
| 19. Basic fairness | Earlier feasible parties considered first; explanations identify skipped parties. Manager departures from policy are explicit. |
| 20. Explain reasons | Explanations derive from actual table data, capacity rule and staff declines; current-queue comparisons use the same allocator. |
| 21. Floor/status display | Floor dashboard; saved screenshots and live browser inspection. |
| 22. Occupancy timers | Floor cards show scenario-time duration; raw-monitor timer also uses server timestamp. |
| 23. Queue display | Party size, wait, additional estimated wait, next step, cancellation. |
| 24. Cleaning alerts | Cleaning status/cards/prioritized task list; demand-then-age regression. |
| 25. Seating suggestions | Live suggestion cards, actual reasons, immediate alternative effects. |
| 26. Approval/manual actions | Browser-verified approve, manager override, decline while retaining queue; stale/invalid actions rejected. |

## P1 and desired differentiation
- Wait ranges: explicit editable dining/cleaning assumptions and queue scheduling. Unknown/overdue sessions excluded. A regression proves that changing assignments can reverse scenario endpoints; the displayed envelope is ordered and explicitly not a guaranteed bound.
- Cleaning priority: current waiting parties that fit, then oldest cleaning task; tested.
- Decision comparison: alternative ready tables show unused seats, other parties/guests seatable now, and parties losing immediate seating under that choice. No future arrivals or departures are invented.
- Explainability: deterministic reasons, held overrides, declined assignments, and audit trail. A pair taking the only six-seat table correctly removes a larger party's immediate seating option in pure tests and the browser.

## Integration and demonstration gates
- Actual end-to-end smoke: inference → sustained presence → temporary absence retained → confirmed departure → cleaning → staff approval → reseating. Report explicitly identifies edited stock inputs and manual actions.
- Unit/API checks include state smoothing, timing, capacity, queue policy, stale/duplicate/concurrent approvals, manual/vision conflicts, persistence and configuration edits.
- Frontend type checking/production build and helper tests are run. Browser checks validate functional controls; helper tests alone are not claimed to cover the new UI.
- Original stock inference has no annotated ground truth. Its detections do not constitute an accuracy benchmark.
- Setup, source attribution, footage provenance, development history and demo script are saved. Original upstream documentation is retained separately.

## Deferred / external conditions
- Live webcam and real CCTV evaluation are optional/unverified. User has no restaurant footage. No claim of deployment accuracy is made.
- Future-event what-if simulation, waiter gestures, identities, reservations/POS, custom training, cloud deployment and multi-restaurant support are excluded.
- INFINEX 2K26 was identified by the user and its expanded public listing reviewed. It does not state a reuse/AI-assistance policy. Organizer permission remains unconfirmed; a disclosure and unsent clarification draft are prepared. External publication/submission is not authorized by this local implementation task.

Completion of the local prototype and eligibility for INFINEX 2K26 are separate claims. The latter remains unverified pending organizer clarification.
