# Restaurant Floor Copilot

Restaurant Floor Copilot is a floor manager's desk for walk-in restaurants. A camera watches the tables, the app suggests who to seat where, and an AI Supervisor with long-term memory ([Hindsight](https://github.com/vectorize-io/hindsight)) remembers what managers learned on past shifts, so the next shift starts with it.

Computer vision estimates occupancy. Staff confirm departures and cleanliness, and approve every seat. The app proposes; people decide.

## What it does

- **Run the floor.** Add walk-in parties and see which tables are free, seated, need cleaning or need a check. **Who to seat next** suggests a party and a table, with the reason, based on capacity, queue order and the chosen seating policy. Pick a different table and the app shows what that choice costs.
- **Turn tables over.** When the camera sees a table empty, the app asks whether the guests have left. A table becomes free only after staff mark it clean. Cleaning tasks are created automatically. Each table card shows staff progress, such as "Cleaner 1 is on the way" or "Being cleaned by Cleaner 1".
- **Seat slightly larger parties with extra chairs.** A party one or two guests over a table's seats can sit there with extra chairs, once the manager approves. The first time, the manager checks the space and the answer is saved to memory. Next time the Floor says "Remembered: Table 4 has room for 1 extra chair", so nobody has to walk over and check. A smaller table with a chair can also be offered as an alternative, but never as the recommendation. Parties too big even with extra chairs get a plain message.
- **Learn from past shifts.** A manager can teach the AI Supervisor a lesson, such as preferring Table 3 to Table 2 during delivery rushes. The Supervisor recalls it in a matching situation, shows its advice with and without memory side by side, and cites the lesson it used. When its advice differs from the rules, a banner appears on the Floor.
- **Hand over and review.** A shift handover lists open work and lessons learned. Reports show the floor over time, and records export as CSV. If the camera drops out, hosts switch to in-person checks and keep working.

## How Hindsight helps

Hindsight retains each manager correction, outcome and space check, along with the conditions it happened in, and recalls the relevant ones for the current shift.

The AI is kept on a short leash:

- The backend builds the list of allowed actions: tables that are actually free and fit the party.
- The model (hosted on Groq) only chooses from that list, and must cite recalled memory for any departure from the rules.
- The server checks that each cited lesson exists, is still active, and matches the current tables and conditions.
- Staff approve every action.
- The Floor calls something "remembered" only when Hindsight itself returned it.

In a staged delivery rush, pickup traffic near Table 2 gave a manager a reason to prefer Table 3. In five paired runs with the same model and floor inputs, the recommendation was Table 2 without retrieved memory and Table 3 with it. These runs measured recommendation changes on synthetic inputs. [Recorded evaluation](docs/verification/hindsight-live-memory-report.json)

[View the Supervisor comparison](docs/verification/hindsight-supervisor-browser.png) to see both recommendations and the cited correction.

## Run locally

Follow the [setup guide](docs/SETUP.md) to install the backend and frontend, prepare the demo footage, and start the app. Then open the [floor dashboard](http://127.0.0.1:5174/floor).

On the Floor:

1. Open **Camera**, choose `controlled-floor-demo.mp4` and press **Start**.
2. Pause during the opening empty interval.
3. Mark tables **clean and free**.
4. Add a party to the waiting list.

**Start over** begins a fresh service and saves the old one. The [busy-shift rehearsal](docs/PROJECT_GUIDE.md#try-the-busy-shift) continues through seating, turnover, camera recovery and shift handover.

The demo uses staged staff actions and a labelled montage of stock footage. A real-time food court clip is also included. See [footage and provenance](docs/FOOTAGE.md).

Core floor operations run locally. For memory-backed advice, configure [Hindsight Cloud and Groq](docs/HINDSIGHT.md#human-setup-and-secrets), or use the [local Docker memory profile](docs/LOCAL_HINDSIGHT.md), which still uses hosted inference for reasoning.

## Architecture

- **Vision:** OpenCV supplies frames. A pretrained YOLO model with ByteTrack tracks people in configured table regions.
- **Operations:** FastAPI serves the React dashboard. SQLite stores the queue, table state, tasks and the original experience records. Seating suggestions and wait estimates are deterministic code.
- **Supervisor:** Hindsight retains and recalls shift experience. A hosted model uses the recalled evidence to choose among actions supplied by the backend.

The [project guide](docs/PROJECT_GUIDE.md) covers the full feature set, architecture and verification. See the [demo runbook](docs/DEMO.md) for a shorter walkthrough and the [development checks](docs/SETUP.md#development-checks) for test commands.

## Attribution

The vision and monitoring foundation comes from Zihad’s Restaurant Table Occupancy Detection. See [upstream attribution](ATTRIBUTION.md), the [original README](README.upstream.md) and the [license notice](LICENSE). Ultralytics and its model weights have separate licensing terms.
