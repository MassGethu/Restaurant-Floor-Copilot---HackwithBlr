# Restaurant Floor Copilot — Hindsight edition

A local hackathon prototype connecting pretrained person detection to table readiness, a waiting queue, and explained seating decisions.

See the [project guide](docs/PROJECT_GUIDE.md) for the full feature inventory, exactly where Hindsight affects decisions, a safe busy-shift rehearsal with an outage and reconnect, and what needs a real restaurant pilot.

Using a fresh Windows laptop? Follow [Windows setup and demo](#windows-setup-and-demo).

## Windows setup and demo

Use 64-bit Windows 11 on an Intel or AMD laptop. Install [Git for Windows](https://git-scm.com/install/windows), [Python 3.14 for Windows (64-bit)](https://www.python.org/downloads/windows/) with the Python launcher, and [Node.js LTS](https://nodejs.org/en/download) version 22.12 or newer with npm. Select the x64 installers. The file replay runs on the CPU and needs internet on first setup for packages, footage, and the model download.

### 1. Open PowerShell and get the code

Open **PowerShell** from the Start menu after installing the tools. Run these checks before continuing:

```powershell
git --version
py -3.14 --version
node --version
npm.cmd --version
```

If a command is missing, close and reopen PowerShell so it picks up the installer's PATH changes. Use `npm.cmd` throughout this guide so PowerShell does not need to run npm's script shim.

For a first clone, run:

```powershell
Set-Location $env:USERPROFILE
git clone --branch main https://github.com/MassGethu/Restaurant-Floor-Copilot---HackwithBlr.git Restaurant-Floor-Copilot
Set-Location .\Restaurant-Floor-Copilot
git status -sb
```

If you already cloned it using that folder name, update it instead:

```powershell
Set-Location "$env:USERPROFILE\Restaurant-Floor-Copilot"
git status -sb
git switch main
git pull --ff-only origin main
```

If you used a different folder, replace the path in each terminal. The repo root is the folder containing `README.md`, `backend`, and `frontend`. Save any local source edits before switching branches or pulling.

### 2. Install the dependencies

Run from the repo root. Repeat the two dependency installs after pulling changes to the requirements or npm lockfile.

```powershell
py -3.14 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m pip check
Set-Location .\frontend
npm.cmd ci
Set-Location ..
```

Use `backend\requirements.txt` on Windows. The Mac lockfile pins `uvloop`, which has no Windows build. The commands call the virtual environment's Python directly, so activation and execution policy changes are unnecessary.

### 3. Download and prepare the demo footage

Run from the repo root:

```powershell
New-Item -ItemType Directory -Force .\fake_camera\videos | Out-Null
curl.exe --fail --location --output .\fake_camera\videos\restaurant-stock.mp4 "https://videos.pexels.com/video-files/9782945/9782945-uhd_2732_1440_25fps.mp4"
.\.venv\Scripts\python.exe .\scripts\prepare_demo.py
Get-Item .\fake_camera\videos\controlled-floor-demo.mp4
```

If the download fails, download the clip in your browser and save it as `fake_camera\videos\restaurant-stock.mp4`, then rerun the last two commands. The generator creates a two-minute labeled montage and its table configuration. Video files are downloaded or generated locally. [Source and footage details](docs/FOOTAGE.md)

### 4. Start the backend and dashboard

In the first PowerShell window, run:

```powershell
Set-Location "$env:USERPROFILE\Restaurant-Floor-Copilot\backend"
$env:DEVICE = 'cpu'
$env:DATA_DIR = 'data/windows-demo-' + [guid]::NewGuid().ToString('N')
..\.venv\Scripts\python.exe -m app --memory cloud
```

Leave this window running. The data directory gives this demo a fresh local database each time you run the block. For the first run, allow time for the YOLO weights to download. The floor workflow and current-work handover run without API keys. You can add Hindsight credentials in step 7.

Open a **second PowerShell window** and run:

```powershell
Set-Location "$env:USERPROFILE\Restaurant-Floor-Copilot\frontend"
npm.cmd run dev
```

Leave both windows open. Visit [Floor overview](http://127.0.0.1:5174/floor). If it reports a backend connection problem, open [the backend health endpoint](http://127.0.0.1:8001/api/health) and check the first window for startup errors. If either server reports that its port is already in use, stop the older copy of that server and rerun the corresponding command. The walkthrough uses backend port 8001 and frontend port 5174.

### 5. Run the busy-shift demo

1. Open **Floor overview** and scroll to **Visual observation**. Select `controlled-floor-demo.mp4`, click **Start replay**, then click **Pause** during the initial empty interval, before the counter reaches 12 seconds. Wait for fresh observations before confirming tables. If you miss the interval on the fresh floor, use **Restart replay** and pause earlier.
2. In **Restaurant floor**, click **Confirm empty and clean** on **Table 1** and **Table 2**. Open the **…** menu on **Table 3** and choose **Block for walk-ins**. Leave **Table 4** unverified.
3. In **Waiting room**, enter `First pair`, set **Guests** to `2`, and click **Add to queue**. Under **Next best move**, click **Approve seating** for Table 1. Add `Party of four` with `4` guests and approve Table 2. Add `Next pair` with `2` guests and `Party of six` with `6` guests. These last two parties should remain waiting.
4. Open **Staff tasks**. Under **Request a service visit**, click **Table 2 · request assistance**. Return to **Floor overview** and click **Resume** under **Visual observation**.
5. Around 15 and 28 seconds of clip time, expect detections at Tables 1 and 2. Table 1 should stay seated through the short gap at 40–42 seconds. At about 71 seconds, look for a Table 1 departure check under **Table turnover**. Pause the replay, then click **Confirm departed** for Table 1. A cleaning task should appear. You can assign it to a cleaner from **Staff tasks**.

### 6. Simulate an outage, reconnect, and hand over

1. With the backend and dashboard still running, open a **third PowerShell window**. From any folder, run:

   ```powershell
   Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8001/api/stream/stop'
   ```

2. On **Floor overview**, wait for **Camera unavailable**, then click **Use staff checks**. Check that the two waiting parties and open work are still present.
3. On **Table 1**, click **Confirm empty and clean**. Under **Next best move**, click **Seat using staff check** for `Next pair` within 60 seconds. The party of six should remain in the queue. If the check expires, confirm the table again.
4. Click **Reconnect source**, wait for fresh observations, then click **Resume camera assistance**. The file reopens from the beginning and keeps the current queue and tasks. Pause the replay once assistance is back. **Restart replay** starts a new scenario, so use **Reconnect source** for this step.
5. Open **Supervisor**. Under **Start the next shift**, type `Evening handover` and click **Start shift**. Under **Shift handover**, click **Prepare current-work brief**. Expect one waiting party and the Table 2 service visit.

Press **Ctrl+C** in the dashboard and backend windows when finished. To repeat the walkthrough from a fresh floor, start both servers again using step 4.

### 7. Optional Hindsight Cloud demo

For memory-backed advice and handover, use your own Hindsight Cloud API URL and key, plus a Groq API key. From the repo root, create and open the ignored settings file if it does not already exist:

```powershell
if (-not (Test-Path .\backend\.env)) {
    Copy-Item .\backend\.env.example .\backend\.env
}
notepad.exe .\backend\.env
```

Fill in `HINDSIGHT_BASE_URL`, `HINDSIGHT_API_KEY`, and `AGENT_API_KEY` in that file and save. Keep these values out of Git and chat. Stop the backend with **Ctrl+C**, then rerun its commands in step 4 to start with a fresh floor.

1. Start the controlled replay and pause it in the initial empty interval. Confirm **Table 2** and **Table 3** empty and clean, then add a party of four. The floor should recommend Table 2. Leave the party waiting.
2. In **Supervisor**, set **Delivery activity** to **Delivery rush** and click **Confirm shift context**. Under **Remember a correction**, choose **Table 3** as the reported alternative. Enter a synthetic note such as `Demo scenario: pickup traffic repeatedly interrupted T2 during a delivery rush. T3 was quieter.` Click **Remember experience**.
3. Wait for the entry in **Experience timeline** to show **retained**. Optionally record a separate simulated outcome using **helped**. Start a new shift, then set and confirm **Delivery rush** again.
4. Under **Shift advice**, enter a question such as `Where should we seat the waiting party during this delivery rush, and why?` and click **Ask supervisor**. Check whether the advice cites the correction and proposes Table 3. Under **Shift handover**, click **Recall past lessons** to see the memory-backed handover. [Memory workflow and service troubleshooting](docs/HINDSIGHT.md)

## Learning across shifts

This independent edition adds an experience ledger and Hindsight retain/recall/reflect integration, contextual seating advice, approved task priority/assignment, logical shifts, feedback, supersession, focused questions and handover. The original `CV AI for restaurants` folder and its servers remain separate.

Open **Supervisor** at http://127.0.0.1:5174/supervisor. Configure Hindsight Cloud and Groq credentials in ignored `backend/.env` to enable real memory and reasoning. Missing service setup is shown honestly; local recording and inherited operations remain available. The Cloud actual-service evaluator passed all checks, including five paired memory comparisons, normal-service control, restart persistence, recovery actions, handover and supersession. These are synthetic operational scenarios, not restaurant business benchmarks. Fake-service tests do not establish live memory behavior.

See [setup, architecture, demonstration and limits](docs/HINDSIGHT.md), [live memory evaluator](scripts/evaluate_memory.py), and [local submission drafts](docs/submission/checklist.md). The inherited foundation below remains relevant; its earlier validation and event-specific documents are historical, not new memory evidence.

Local Docker memory is also available alongside Cloud. Run `.venv/bin/python scripts/local_hindsight.py up --wait 60`, then start this edition with `./run_all.sh --memory local`. Return with `--memory cloud`; stop this edition's backend before switching. Cloud stays the default and its credentials remain unchanged. See [local setup, persistence and verification](docs/LOCAL_HINDSIGHT.md). Storage, embeddings and reranking run locally; action reasoning still uses Groq. The [single live demo](docs/verification/hindsight-local-single-demo.json) passed using existing local sources, a real memory-backed seating recommendation and a handover without a generation call. It used no Cloud memory requests.

## Run on this Mac

The Python 3.14 environment, model, frontend packages, two test videos, and table configurations have been prepared in this working directory.

```sh
./run_all.sh
```

Open http://127.0.0.1:5174/floor. The API listens on http://127.0.0.1:8001; interactive API documentation is at `/docs`. Ctrl+C in the launcher stops both servers.

Select `controlled-floor-demo.mp4`, click **Start replay**, and pause during its initial vacant interval. Confirm each table clean. Add a party and approve the explained recommendation. Resume to observe sustained presence, a temporary absence, and a departure check. Confirm departure in person, then confirm cleaning to enable seating from the queue again. Use the [isolated practice launcher](docs/PROJECT_GUIDE.md#try-the-busy-shift) if you have open service work.

**Restart replay starts a new scenario and archives the previous queue and staff actions.** It is blocked when active service work would be abandoned. **Reconnect source** preserves the queue and tasks. Replay uses clip time until you switch to staff checks, after which the service clock tracks wall time. The demo does not loop automatically.

## Reproduce setup

On macOS, use Python 3.14 with compatible PyTorch wheels. On another Mac create the environment with its Python path:

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

Visual absence never ends a recorded seating or proves cleanliness. New tables require staff verification. Staff readiness checks in outage mode expire after 60 seconds. A seated party receives a 30-second arrival grace period; continued absence requests verification. Freshness failures suspend camera-assisted recommendations until fresh observations return or staff explicitly switch to in-person checks.

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

Run actual stock-frame inference with `scripts/verify_vision.py`. With the API running, `scripts/smoke_live.py` executes an approximately 75-second model-driven workflow and writes `docs/verification/hindsight-live-smoke-report.json`. It resets prototype demo data and pauses at the end. These checks distinguish real inference from fake-detector API tests.

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

Open http://127.0.0.1:5174/operations for six linked workflows:

- **Staff desk:** role-filtered cleaning/service tasks, staff roster, assignment, acknowledgement, progress, completion, new-task notices and optional sound.
- **Arrivals:** review tracked entrance crossings, independently confirm party size, or dismiss. Configure one entrance region in the table editor.
- **Availability:** table-by-table future ranges with their basis and uncertainty.
- **What-if lab:** compare future known-queue schedules for another seating choice or delay without changing live state.
- **Analytics:** actual scenario samples, waits, seated guests, completed table sessions, task metrics, archived scenarios and CSV export.
- **Policies:** fairness, balanced or throughput presets, overdue protection and check-in interval.

Waiter requests are manual; timed check-ins are heuristic suggestions with unknown customer intent. Entrance crossings do not distinguish customers from staff or reliably infer group size. The host confirms each arrival. Predictions use explicit duration assumptions and require real restaurant validation.

See [the 35-feature matrix](docs/FEATURE_MATRIX.md), [Git history notes](docs/HISTORY.md) and [demo runbook](docs/DEMO.md). With the API running, `.venv/bin/python scripts/smoke_expanded.py` checks the expanded workflow using actual YOLO and declared synthetic staff inputs. It starts a new demo scenario and leaves playback paused. `.venv/bin/python scripts/verify_arrivals.py` generates and checks a synthetic entrance calibration clip from the permitted stock frame. Neither test measures real restaurant accuracy.

The original upstream analytics component remains in source for provenance; `/analytics` now redirects to the operational analytics workspace.
