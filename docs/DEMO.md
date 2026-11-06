# Demonstration runbook

## Before presenting
1. Run `./run_all.sh`; open http://127.0.0.1:5173/floor.
2. Verify the model is ready. Model weights and videos are local, so the prepared demo does not require internet.
3. State the provenance: the four-region clip is an edited, repeated stock scene for a controlled systems demonstration. It does not establish real CCTV accuracy. Original single-table stock footage is separately available for actual detector inspection.

## Three-minute demonstration
1. Select `controlled-floor-demo.mp4` and Start/Restart. Pause before 12 seconds.
2. Confirm initial table cleanliness. Explain that the camera cannot establish that a vacant table is clean.
3. Add a party of four. Show its recommendation to a four-seat table and the explanation. Approve seating; show the party removed from the waiting queue and the table occupied.
4. Add a pair and approve its two-seat table. Resume; stock guests appear in T1 after 12 seconds and T2 after 25 seconds. Detection is actual pretrained inference.
5. If demonstrating overflow, staff-mark T3 and T4 occupied using the explicit override controls, then add another pair. Explain the overrides and heuristic wait range. These are visible staff actions, not model observations.
6. T1 briefly loses visual presence at 40–42 seconds. It remains occupied.
7. T1 loses sustained presence at 65 seconds. Around 71 seconds it becomes cleaning required. The waiting pair still cannot be seated there.
8. Staff confirms cleaning. Show the recommendation update, explain its rules, approve it, and pause.

Keep playback paused while explaining queue logic. Scenario timers freeze with playback. Restart always clears queue and staff actions; it is not a resume control.


## Immediate decision comparison
Pause during the initial vacant interval and confirm the tables clean. Add a pair and a six-person party. The default allocation sends the pair to T1 and the six-person party to T4. In the pair's **Manager table choice**, select T4. The comparison shows four unused seats and identifies the larger party losing its immediate seating option. This is a deterministic comparison of the current queue, not a forecast.

You can return to T1 and approve the recommendation, explicitly confirm the manager override, or decline a suggested table while retaining the party in the queue. Declines exclude that party/table pair until the table's next departure/cleaning cycle. Overrides remain subject to readiness, capacity, freshness and version checks.

## Original clip mode
Choose `restaurant-stock.mp4` to inspect genuine detection on an unmodified stock video. It has one configured table and camera movement. Do not present this as a fixed-camera, multi-table deployment evaluation.

## Evidence and limits
- `docs/verification/vision-report.json`: real detector samples on original footage, no ground-truth accuracy metric.
- `docs/verification/live-smoke-report.json`: actual inference plus declared staff actions through the running API.
- `scripts/smoke_live.py`: reproducible workflow test, approximately 75 seconds, leaves playback paused.
- Seating logic is deterministic; departure estimates are heuristics. Neither is a trained prediction model.
- Actual restaurant CCTV/staged fixed-camera validation remains future work.


## Expanded operations tour

1. In Policies choose fairness for the default demo; choose a one-minute check-in only when demonstrating the short scenario. Realistic defaults can be restored to ten minutes afterward.
2. Open Staff desk after departure: assign the cleaning task to Cleaner 1, acknowledge/start, then confirm completion. A waiter request can be entered manually and assigned to Waiter 1; completing it records a visit. Timed check-ins are service suggestions, not detected customer intent.
3. Pause a fresh scenario and prepare clean tables. Add a pair and six-person party. In What-if lab choose pair → T4 and Compare scenarios. Inspect guest waiting minutes and per-party ranges; confirm the live queue was not modified.
4. Show Availability and Analytics; archived scenarios remain separate from the current timeline. Export CSV if useful. Trends are recorded scenario samples.
5. For optional entrance demonstration run scripts/verify_arrivals.py first, then select entrance-calibration.mp4 on Floor. After about four seconds inspect Arrivals. Confirm the true party size manually or dismiss. This is translated stock calibration, not natural customer detection validation. Switching/restarting archives the previous scenario.

The expanded actual-model acceptance script is scripts/smoke_expanded.py. It uses explicit synthetic staff inputs, requires the local API, runs about 75 seconds and leaves playback paused.
