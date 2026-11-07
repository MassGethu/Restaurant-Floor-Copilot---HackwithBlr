# Restaurant Floor Copilot

Restaurant Floor Copilot is a local host and shift supervisor desk for walk-in restaurants. It brings the waiting queue, table readiness, and staff tasks together. Computer vision estimates occupancy, staff confirm departures and cleanliness, and the app suggests which waiting party to seat next.

## What it does

- **Run the floor.** Add walk-in parties, check table readiness, and approve or decline seating recommendations. The allocator considers capacity, queue order, and the selected seating policy.
- **Manage turnover.** Review departure prompts, confirm cleaning, and assign cleaning and service tasks. If the camera becomes unavailable, hosts can switch to in-person checks and keep working with the existing queue and tasks.
- **Plan and review service.** Compare seating options and wait ranges under explicit dining and cleaning assumptions. Review operational analytics and export records as CSV.
- **Hand over a shift.** Brief the next manager on open work and use Hindsight to recall past corrections and their outcomes.

## How Hindsight helps

A manager can record why they chose a different table and add an outcome later. [Hindsight](https://github.com/vectorize-io/hindsight) retrieves relevant experience for the current shift. The Supervisor shows the cited evidence alongside its recommendation. The server checks current table readiness, capacity, and queue state when staff approve a seat.

In a staged delivery rush, pickup traffic near Table 2 gave a manager a reason to prefer Table 3. In five paired runs with the same model and floor inputs, the recommendation was Table 2 without retrieved memory and Table 3 with it. These runs measured recommendation changes on synthetic inputs. [Recorded evaluation](docs/verification/hindsight-live-memory-report.json)

[View the Supervisor comparison](docs/verification/hindsight-supervisor-browser.png) to see both recommendations and the cited correction.

## Run locally

Follow the [setup guide](docs/SETUP.md) to install the backend and frontend, prepare the demo footage, and start the app. Then open the [floor dashboard](http://127.0.0.1:5174/floor).

Start `controlled-floor-demo.mp4` in **Visual observation**, pause during the opening vacant interval, confirm a table empty and clean, and add a party to the waiting queue. The [busy-shift rehearsal](docs/PROJECT_GUIDE.md#try-the-busy-shift) continues through seating, turnover, camera recovery, and shift handover. The demo uses staged staff actions and a labeled montage of stock footage. [Footage and provenance](docs/FOOTAGE.md)

Core floor operations run locally. For memory-backed advice, configure [Hindsight Cloud and Groq](docs/HINDSIGHT.md#human-setup-and-secrets) or use the [local Docker memory profile](docs/LOCAL_HINDSIGHT.md), which still uses hosted inference for action reasoning.

## Architecture

- **Vision:** OpenCV supplies frames. Pretrained YOLO and ByteTrack track people in configured table regions.
- **Operations:** FastAPI serves the React dashboard. SQLite stores the queue, table state, tasks, and original experience records.
- **Supervisor:** Hindsight retains and recalls shift experience. A hosted model uses recalled evidence to choose among actions supplied by the backend.

The [project guide](docs/PROJECT_GUIDE.md) covers the full feature set, architecture, and verification. See the [demo runbook](docs/DEMO.md) for a shorter walkthrough and the [development checks](docs/SETUP.md#development-checks) for test commands.

## Attribution

The vision and monitoring foundation comes from Zihad’s Restaurant Table Occupancy Detection. See [upstream attribution](ATTRIBUTION.md), the [original README](README.upstream.md), and the [license notice](LICENSE). Ultralytics and its model weights have separate licensing terms.
