# AI Restaurant Floor Copilot — execution plan

Authorized 2026-11-05: reuse the reference application in this workspace and implement autonomously.

## Architecture
One FastAPI process, SQLite, existing React/Vite frontend, YOLO + ByteTrack, manually drawn table polygons. Separate visual observations from operational readiness. No cloud services, identity recognition, or custom model training.

## Milestones and acceptance gates
1. **Foundation (verified):** reproduce upstream runtime, preserve attribution, run baseline checks and actual inference. Choose permitted footage; report unavailable inputs honestly.
2. **Timing and observations (verified):** propagate media timestamps; deterministic pause/restart; non-looping demo playback. Temporary absence must not release a table.
3. **Operations (verified):** capacities, unknown/ready/occupied/cleaning/verification states, staff corrections, cleaning confirmation, persistent state and event log. Camera misses cannot immediately undo seating.
4. **Queue and decisions (verified):** manual party registration, oldest feasible party then best fit; explain actual rules; transactional, version-checked approval and cancellation.
5. **Enhancements (verified):** explicit-assumption wait ranges, cleaning priorities; immediate allocation comparison after the core works; future-event simulation deferred.
6. **Demo reliability (verified controlled workflow):** polished command-center UI, integration checks, actual annotated-video inspection, reproducible commands and demonstration script. Freeze optional work if reliability suffers.

## Verification
Test temporal confirmation, media timing, manual/camera conflicts, capacity, fairness, duplicate and stale approvals, cleaning, persistence, and estimates. Run frontend tests and production build. Separate fake-detector integration checks from genuine inference evidence. No scripted outputs presented as predictions.

## Documentation
Maintain DEVELOPMENT_LOG.md and attribution throughout. Record commands, real results, decisions, limitations, footage/model provenance, and changes from upstream. Keep setup and demonstration instructions current.

## Goal control
The user resumed the goal on 2026-11-05. This file records the accepted scope and current execution plan. The earlier paused-goal control limitation is resolved by that user action.

## Current evidence
- Python 3.14 environment installed; dependencies frozen in backend/requirements-lock.txt.
- Original restaurant stock footage licensed/provenanced; actual model inference inspected.
- Explicitly synthetic four-region visual fixture prepared and continuously labeled.
- Full backend suite: 138 passed (including real detector tests).
- Frontend: 17 tests passed; production build passed; patched toolchain audit reports zero known vulnerabilities.
- Actual running API + YOLO smoke test passed all six checks through cleaning and reseating; report saved in docs/verification/live-smoke-report.json.
- Browser queue entry and approval verified. Presentation state prepared; runbook and attribution recorded.
- Immediate allocation comparison is implemented. Future departure simulation and real multi-table CCTV accuracy evaluation remain outside the verified demo.

## Completion audit additions
- Configuration edits cannot remove/overfill a seated party, and changed regions require verification. Paused edits reprocess the frame; obsolete in-flight results are discarded.
- Manager table alternatives, decline-without-cancellation, and immediate queue impact are implemented and browser-verified.
- Mixed-capacity scheduling regression fixed: displayed wait intervals span the two scenario outcomes and are explicitly not guaranteed bounds.
- Backend evidence is saved as JUnit; frontend evidence is saved as JSON; source fingerprints and summaries are in docs/verification/acceptance-summary.json.
- INFINEX 2K26's expanded public listing was reviewed. Individual entry, source/demo links and a recording/presentation are required; no published reuse/AI-assistance policy was found. Organizer clarification and external publication/submission are separate, unperformed steps.

## Local completion — 2026-11-06
All authorized prototype milestones and the requirement-to-evidence audit are complete. Current source fingerprints match the passing verification artifacts. The app is running locally and paused for review. Public publication/submission and event-specific organizer clarification remain separately identified future actions; no external entry was submitted.
