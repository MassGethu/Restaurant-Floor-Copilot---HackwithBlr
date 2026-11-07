# Local setup and demo

- [macOS setup](#macos-setup)
- [Windows setup and demo](#windows-setup-and-demo)
- [Development checks](#development-checks)

## macOS setup

Install Python 3.14 with compatible PyTorch wheels and Node.js 22.12 or newer with npm. From the repository root, create the virtual environment and install dependencies:

```sh
python3.14 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-lock.txt
npm --prefix frontend ci
```

Download the [original restaurant clip](FOOTAGE.md#original-restaurant-clip) to `fake_camera/videos/restaurant-stock.mp4`, then prepare the demo footage and start the app:

```sh
.venv/bin/python scripts/prepare_demo.py
./run_all.sh
```

Open the [floor dashboard](http://127.0.0.1:5174/floor). The backend serves [API documentation](http://127.0.0.1:8001/docs) on port 8001. Press Ctrl+C in the launcher to stop both servers.

OpenCV handles direct file playback. The first inference run downloads YOLO weights. CPU is the verified baseline. To benchmark MPS, set `DEVICE=mps` in `backend/.env`.

For an isolated practice session, follow the [busy-shift rehearsal](PROJECT_GUIDE.md#try-the-busy-shift). To connect shift memory, see [Hindsight Cloud and Groq setup](HINDSIGHT.md#human-setup-and-secrets) or [the local Docker profile](LOCAL_HINDSIGHT.md).

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

If the download fails, download the clip in your browser and save it as `fake_camera\videos\restaurant-stock.mp4`, then rerun the last two commands. The generator creates a two-minute labeled montage and its table configuration. Video files are downloaded or generated locally. [Source and footage details](FOOTAGE.md)

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
4. Under **Shift advice**, enter a question such as `Where should we seat the waiting party during this delivery rush, and why?` and click **Ask supervisor**. Check whether the advice cites the correction and proposes Table 3. Under **Shift handover**, click **Recall past lessons** to see the memory-backed handover. [Memory workflow and service troubleshooting](HINDSIGHT.md)

## Development checks

From the repository root:

```sh
.venv/bin/python -m pytest backend -q
npm --prefix frontend test
npm --prefix frontend run build
```

On Windows, use `.\.venv\Scripts\python.exe` for the backend command and `npm.cmd` for the frontend commands.

The [demo runbook](DEMO.md) links the recorded verification and describes the staged workflows.
