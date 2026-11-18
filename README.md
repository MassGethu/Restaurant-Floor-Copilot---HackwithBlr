# Restaurant Floor Copilot

Restaurant Floor Copilot runs the walk-in service loop: guest check-in, table allocation, staff dispatch, arrival checks, departure detection, cleaning and the next seating. Its manager watches an exception desk and intervenes when service needs judgment. [Hindsight](https://github.com/vectorize-io/hindsight) supplies recalled operating lessons and space checks.

**Human on the loop.** Routine decisions execute automatically in a backend worker, even with the dashboard closed. Staff report physical work; the manager does not approve every seating, departure or assignment.

See the [Future Tech implementation report and demo guide](docs/FUTURE_TECH_AUTONOMY.md) for the changes, decisions, evidence and limits.

## What it does

- **Welcome guests.** Guests scan the printable `/welcome` QR sign to open a check-in page that registers a party once and keeps its table ticket up to date. The host can still add parties on the Floor.
- **Allocate and dispatch.** Ready tables are allocated by capacity, queue order and the chosen policy. Hosts or waiters receive seating jobs. Cleaning and service work go to matching staff with spare workload capacity. Unanswered jobs and unavailable staff trigger automatic reassignment before a staffing alert.
- **Verify and turn over.** Vision confirms presence. Sustained vacancy after a confirmed arrival closes the dining session and dispatches cleaning. A cleaner's completion report releases the table for the next automatic allocation. Camera vacancy alone never means clean.
- **Manage exceptions.** Camera failure, stale evidence, missing roles, overdue jobs, unconfirmed arrivals, large parties and staff-reported problems appear in Service overview. Repeated incidents are deduplicated and recoveries close them automatically. Pause the loop or switch to manual operation when needed.
- **Remember useful corrections.** A recalled, active manager preference can change allocation only for its matching tables and service conditions. Recalled space checks can permit one or two extra chairs without another routine approval. First-time space checks remain manager exceptions.
- **Hand over and learn.** Automatic allocations, lifecycle events and staff task outcomes enter the experience ledger with explicit qualifications. Existing advice comparisons, handover, reports and CSV export remain available.

## How Hindsight helps

Hindsight retains each manager correction, outcome and space check, along with the conditions it happened in, and recalls the relevant ones for the current shift.

The AI is kept on a short leash:

- The backend builds the list of allowed actions: tables that are actually free and fit the party.
- The model (hosted on Groq) only chooses from that list, and must cite recalled memory for any departure from the rules.
- The server checks that each cited lesson exists, is still active, and matches the current tables and conditions.
- The local controller executes eligible actions and records its policy and cited evidence. A bounded recall wait falls back to the deterministic policy if memory is unavailable.
- The Floor calls something "remembered" only when Hindsight itself returned it.

The earlier advisory version recorded five paired runs in which recalled memory changed Table 2 to Table 3 on synthetic inputs. That historical evaluation is separate from the new autonomous controller's tests. [Earlier evaluation](docs/verification/hindsight-live-memory-report.json)

[View the Supervisor comparison](docs/verification/hindsight-supervisor-browser.png) to see both recommendations and the cited correction.

## Run locally

Follow the [setup guide](docs/SETUP.md) to install dependencies and prepare footage, then run `./run_all.sh --video controlled-floor-demo`. Open [Service overview](http://127.0.0.1:5174/autonomy).

For the autonomous demo:

1. Open **Camera**, choose `controlled-floor-demo.mp4` and press **Start**.
2. Pause during the opening empty interval.
3. Open [Staff jobs](http://127.0.0.1:5174/staff); opening clean checks arrive automatically. Report the staged checks complete.
4. Open [Guest check-in](http://127.0.0.1:5174/check-in) and register a party. Its table is allocated automatically.
5. Resume the footage. Watch arrival, departure and cleaning dispatch without manager approvals. See the [full runbook](docs/FUTURE_TECH_AUTONOMY.md#live-demo).

**Start over** begins a fresh replay and saves the old one. The older busy-shift guides describe manual operation; use Settings → **Switch to manual operation** before following them.

The demo uses staged staff actions and a labelled montage of stock footage. A real-time food court clip is also included. See [footage and provenance](docs/FOOTAGE.md).

Core floor operations run locally. For memory-backed advice, configure [Hindsight Cloud and Groq](docs/HINDSIGHT.md#human-setup-and-secrets), or use the [local Docker memory profile](docs/LOCAL_HINDSIGHT.md), which still uses hosted inference for reasoning.

## Architecture

- **Vision:** OpenCV supplies frames. A pretrained YOLO model with ByteTrack tracks people in configured table regions.
- **Operations:** FastAPI serves the React dashboard. SQLite stores the queue, table state, tasks, exceptions and decision history. A separate one-second control loop revalidates actions under the floor lock. Allocation and wait estimates are deterministic code.
- **Supervisor:** Hindsight retains and recalls shift experience. A hosted model uses the recalled evidence to choose among actions supplied by the backend.

The [project guide](docs/PROJECT_GUIDE.md) covers the full feature set, architecture and verification. See the [demo runbook](docs/DEMO.md) for a shorter walkthrough and the [development checks](docs/SETUP.md#development-checks) for test commands.

## Attribution

The vision and monitoring foundation comes from Zihad’s Restaurant Table Occupancy Detection. See [upstream attribution](ATTRIBUTION.md), the [original README](README.upstream.md) and the [license notice](LICENSE). Ultralytics and its model weights have separate licensing terms.
