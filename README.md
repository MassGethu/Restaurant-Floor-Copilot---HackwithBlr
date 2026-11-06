# Restaurant Floor Copilot

A local hackathon prototype connecting pretrained person detection to table readiness, a waiting queue, and explained seating decisions.

## Run on this Mac

The Python 3.14 environment, model, frontend packages, two test videos, and table configurations have been prepared in this working directory.

```sh
./run_all.sh
```

Open http://127.0.0.1:5173/floor. The API listens on http://127.0.0.1:8000; interactive API documentation is at `/docs`. Ctrl+C in the launcher stops both servers.

Select `controlled-floor-demo.mp4`, click **Start**, and pause during its initial vacant interval. Confirm each table clean. Add a party and approve the explained recommendation. Resume to observe sustained presence, a temporary absence, and a departure. Confirm cleaning to enable seating from the queue again.

**Restart starts a new scenario, archiving the previous queue and staff actions.** Roster, policies and duration assumptions persist. Pause freezes footage time, occupancy timers, and queue waits. The demo does not loop automatically.

## Reproduce setup

Use Python 3.14 with compatible PyTorch wheels. On another machine create the environment with its Python path:

```sh
python3.14 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-lock.txt
cd frontend
npm ci
```

Direct-file playback uses OpenCV; FFmpeg and MediaMTX executables are unnecessary for the default workflow. The optional upstream RTSP workflow remains available but is not the primary demo path. CPU is the verified baseline; explicit MPS can be benchmarked through `DEVICE=mps` in `backend/.env`.

Model weights download automatically on first inference. Prepare them before an offline demo. Footage is excluded from Git; see `docs/FOOTAGE.md` for the permitted source URL. After obtaining `fake_camera/videos/restaurant-stock.mp4`, run:

```sh
.venv/bin/python scripts/prepare_demo.py
```

This generates the controlled visual fixture and portable relative-path table configurations.

## What is AI and what is deterministic?

- **Pretrained model inference:** Ultralytics YOLO + ByteTrack detects and tracks people.
- **Temporal geometry rules:** reference points inside manually defined regions establish sustained visual presence/absence.
- **Operational state:** staff-confirmed cleanliness, seating, corrections, and cleaning tasks are stored in SQLite.
- **Seating policy:** configurable fairness (oldest feasible/best fit), balanced, or throughput allocation, with overdue-party protection and bounded matching. Suggestions require staff approval and revalidation. Managers can choose another eligible table or decline a suggestion while keeping the party waiting. Comparisons show the effect on the current queue, using the same allocator.
- **Wait ranges:** deterministic schedules using stated 30–60 minute dining and 2–5 minute cleaning assumptions, including queue allocation. Displayed ranges span two duration scenarios, whose allocations can differ; they are not guaranteed bounds or learned departure predictions. Unknown or overdue sessions are excluded and may need staff estimates.
- **Cleaning priority:** number of current waiting parties that fit, then time awaiting cleaning.

Visual absence never proves cleanliness. New tables require staff verification. Staff overrides persist until released. A seated party receives a 30-second arrival grace period; continued absence without any visual confirmation requests verification rather than silently releasing the table. Freshness failures disable recommendations.

## Honest demonstration inputs

`restaurant-stock.mp4` is permitted single-table stock footage by Mikhail Nilov on Pexels. Actual inference samples are recorded under `docs/verification`.

`controlled-floor-demo.mp4` is a continuously labeled synthetic montage of repeated stock footage and blank regions. Its input timeline is controlled to exercise transitions. Detection outputs, state events, and recommendations are computed by the application. It is not real multi-table CCTV validation, and no accuracy percentage is claimed.

The configuration editor supports new uploaded footage and capacities. A fixed staged camera view is the next step for evaluating real table association. Walking staff, occlusion, camera movement, and overlapping regions remain limitations.

## Verification

```sh
.venv/bin/python -m pytest backend -q
cd frontend
npm test
npm run build
```

Run actual stock-frame inference with `scripts/verify_vision.py`. With the API running, `scripts/smoke_live.py` executes an approximately 75-second model-driven workflow and writes `docs/verification/live-smoke-report.json`. It resets prototype demo data and pauses at the end. These checks distinguish real inference from fake-detector API tests.

## Documentation and attribution

- `PLAN.md`: milestones and execution status.
- `DEVELOPMENT_LOG.md`: decisions, actual validation, and remaining work.
- `ATTRIBUTION.md`, `LICENSE`: upstream attribution and licensing.
- `README.upstream.md`: original repository documentation.
- `docs/FOOTAGE.md`: input provenance, editing, limitations, and test timeline.
- `docs/REQUIREMENTS_AUDIT.md`: requirement-to-evidence mapping.
- `docs/HACKATHON_RULES.md`: INFINEX 2K26 public requirements and unstated reuse policy.
- `docs/SUBMISSION_DISCLOSURE.md`: pre-existing-code and AI-assistance disclosure draft.

Built on Zihad’s MIT-licensed Restaurant Table Occupancy Detection, reference commit `51053aac5d4f6e4f5600205d0aadb177fb493826`. Upstream detection, editor, APIs, analytics, and dashboard foundation are pre-existing work. Ultralytics and model weights retain their separate licensing obligations; this project is not an assertion of MIT-only licensing for the combined application. Check the competition rules for disclosure of pre-existing work before submitting.

## Expanded operations workspace

Open http://127.0.0.1:5173/operations for six linked workflows:

- **Staff desk:** role-filtered cleaning/service tasks, staff roster, assignment, acknowledgement, progress, completion, new-task notices and optional sound.
- **Arrivals:** review tracked entrance crossings, independently confirm party size, or dismiss. Configure one entrance region in the table editor.
- **Availability:** table-by-table future ranges with their basis and uncertainty.
- **What-if lab:** compare future known-queue schedules for another seating choice or delay without changing live state.
- **Analytics:** actual scenario samples, waits, seated guests, completed table sessions, task metrics, archived scenarios and CSV export.
- **Policies:** fairness, balanced or throughput presets, overdue protection and check-in interval.

Waiter requests are manual; timed check-ins are heuristic suggestions with unknown customer intent. Entrance crossings do not distinguish customers from staff or reliably infer group size. The host confirms each arrival. Predictions use explicit duration assumptions and require real restaurant validation.

See [the 35-feature matrix](docs/FEATURE_MATRIX.md), [Git history notes](docs/HISTORY.md) and [demo runbook](docs/DEMO.md). With the API running, `.venv/bin/python scripts/smoke_expanded.py` checks the expanded workflow using actual YOLO and declared synthetic staff inputs. It starts a new demo scenario and leaves playback paused. `.venv/bin/python scripts/verify_arrivals.py` generates and checks a synthetic entrance calibration clip from the permitted stock frame. Neither test measures real restaurant accuracy.

The original upstream analytics component remains in source for provenance; `/analytics` now redirects to the operational analytics workspace.
