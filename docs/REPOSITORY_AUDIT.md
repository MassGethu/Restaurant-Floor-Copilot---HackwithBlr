# Repository audit and implementation strategy

Reference checkout: `/Users/massgethu/Forks/Clone's/Restaurant-Table-Occupancy-Detection`.
Audited reference commit: `51053aac5d4f6e4f5600205d0aadb177fb493826`.

## Verified reference architecture
FastAPI backend, React/Vite frontend, SQLite monitoring records, OpenCV source reading, Ultralytics YOLO person detection with ByteTrack, and configurable polygon zones. Uploaded footage is originally looped through FFmpeg and MediaMTX; MJPEG carries video and WebSockets carry visual statuses/events.

Important source references:
- `backend/app/detector.py`: person-class inference and tracking; `auto` chooses CUDA or CPU, not MPS.
- `backend/app/occupancy.py`: per-polygon anchor tests, enter/leave delays and short-gap holding. Raw vacancy is called AVAILABLE; it is not cleanliness evidence.
- `backend/app/sources.py` and `pipeline.py`: source threading, newest-frame detection and rendering. Original frame times are arrival wall time rather than file presentation time.
- `backend/app/schemas.py`: original tables have ID/name/polygon, without capacity.
- `backend/app/db.py`: observation events, monitoring runs and video metadata; not a restaurant party/cleaning state store.
- `backend/app/main.py`: video/configuration, status, stream, analytics and WebSocket APIs.
- `frontend/src/pages/LiveMonitorPage.tsx` and `components/TableEditor.tsx`: monitor and polygon setup.

Baseline tests cover occupancy smoothing, sources, APIs and analytics; many integrations use fake detections. Real detector tests use an Ultralytics sample image, which does not validate restaurant occupancy accuracy. At audit time the checkout had no venv, frontend dependencies, footage, weights or table configurations.

## Missing restaurant workflow
Capacities, a waiting queue, staff-approved seating, cleaning-required/readiness states, manual/vision conflict policy, operational persistence, wait assumptions and explained allocation were absent. Initial raw AVAILABLE status could incorrectly be interpreted as ready. Wall-clock replay timing and loop boundaries needed explicit handling for reproducible demonstrations.

## Architecture decision
Extend the existing application. Rewriting it would replace useful source handling, inference integration, configuration editing and delivery before adding any restaurant differentiation. Selective extraction would create similar integration work and is a fallback only if the foundation cannot run.

Retain a single Python application and SQLite database plus the existing frontend. Add a separate operational service and pure decision functions. For the primary demo, process files directly to carry media timestamps and avoid extra RTSP processes. Retain optional upstream RTSP infrastructure without making it the demo's dependency.

Prioritize reliable observation → operational state → queue evaluation → explained recommendation → staff approval → updated state. P0 includes capacities, cleaning, corrections, queue and seating. P1 adds qualified waits, cleaning priorities and immediate queue comparisons. Future-event simulations and additional restaurant features are deferred.

## First experiment and risks
First run genuine person inference on permitted footage and inspect its output, then test temporary absence and sustained departure through the actual pipeline. A fixed view and non-overlapping seating zones are preferable. Walking staff, occlusion, small people, ambiguous geometry, model/package compatibility and timing resets are the main technical risks.

No real multi-table recording was available. Permitted original single-table stock footage was inspected with genuine inference, and an explicitly synthetic four-region input fixture was prepared for end-to-end transitions. These establish a reproducible workflow, not deployment accuracy.

## Licensing and disclosure
The reference MIT license credits Zihad and is retained. Ultralytics and weights carry separate obligations. Installed dependency metadata and the model checksum are recorded. New contributions and inherited components are identified in ATTRIBUTION.md, DEVELOPMENT_LOG.md and docs/SUBMISSION_DISCLOSURE.md. INFINEX 2K26's public listing was checked; its unstated reuse/AI policy requires organizer clarification before claiming competition eligibility.

## Development sequence
Environment and real inference → media-time observation → persistent operational states → queue and approval → wait/cleaning rules → immediate allocation comparison → regression and actual-model smoke tests → browser verification → runbook and requirement audit. PLAN.md records current evidence; docs/REQUIREMENTS_AUDIT.md maps the brief to acceptance checks.
