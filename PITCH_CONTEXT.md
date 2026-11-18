# Restaurant Floor Copilot — pitch context

**For Claude in a new chat:** this file is the full background on my hackathon project. I'm using that chat to prepare my pitch to the judges: the story, the live demo, slides if needed, and answers to tough questions. Please read all of it before helping. Keep advice practical, honest and simple to say out loud. Don't suggest claims the project can't back up; section 9 lists what is and isn't true.

---

## 1. The basics

- **Event:** HackwithBangalore 4.0 (HackwithBLR), the **second round**, which has limited time. *(Some older notes in the repo, `docs/HACKATHON_RULES.md` and `docs/SUBMISSION_DISCLOSURE.md`, mention a different event, INFINEX 2K26. That was an earlier plan. This pitch is for HackwithBangalore 4.0.)*
- **Project:** Restaurant Floor Copilot
- **Repository:** https://github.com/MassGethu/Restaurant-Floor-Copilot---HackwithBlr
- **Built by:** me, mostly with Codex (an AI coding assistant), with later UI, UX and feature work done with Claude Code.
- **Runs:** locally on my Mac. Frontend at `http://localhost:5174/floor`, backend at `http://127.0.0.1:8001`.

## 2. One-line pitch

**A floor manager's copilot for walk-in restaurants: a camera watches the tables, the app tells the host who to seat where, and an AI Supervisor with long-term memory (Hindsight) remembers what the manager learned on past shifts, so the next shift doesn't have to learn it again.**

## 3. The problem

In a busy walk-in restaurant, the host or floor manager is juggling:
- a waiting list of parties of different sizes,
- tables that are occupied, emptying, dirty, or clean,
- cleaners and waiters who need to be sent to the right table at the right time.

Problems that come up often:
- Tables sit empty and dirty because nobody noticed the guests left.
- Parties get seated in the wrong order, or a big table is wasted on a small party.
- **What experienced managers know never gets written down.** Examples: "during a delivery rush, Table 2 is a bad spot because the pickup crowd stands next to it", or "Table 4 can fit one extra chair". When that manager's shift ends, the knowledge leaves with them.

## 4. What the product does (in plain words)

### The Floor (the main screen, for the manager/host)
- **Tables grid:** each table shows Free / Guests seated / Needs cleaning / Check this table, plus a timer ("Seated 12m").
- **The camera watches the tables.** Computer vision (YOLO plus ByteTrack person tracking) sees whether people are at each table. It waits a few seconds before deciding, so someone walking past doesn't count.
- **The camera suggests, people confirm.** If the camera sees a table empty, the app asks "Did they leave?". A table only becomes free after a person confirms it's clean ("Mark clean and free"). A camera can't tell if a table is clean.
- **Waiting list:** add a party (name and size). The app shows estimated wait times.
- **"Who to seat next":** the app recommends which party goes to which table, with a reason (smallest table that fits, longest-waiting party first). The manager can pick a different table, and the app shows what that choice costs (seats left empty, whether other parties would have to keep waiting).
- **"Needs your attention":** departures to confirm, tables to clean, open staff tasks.
- **Staff progress on table cards:** e.g. "Waiting for a cleaner", "Cleaner 1 is on the way", "Being cleaned by Cleaner 1", "Waiter on the way".
- **Extra chairs (new):** see section 6.
- **Clear messages for impossible cases:** a party of 10 when the biggest table seats 6 shows "Too big for any table (largest seats 6). Push tables together…".

### Staff tasks (for cleaners and waiters, not the manager)
- Cleaning tasks are created automatically when a table needs cleaning. Waiters can be asked to visit a table.
- Staff acknowledge a task, start it, and complete it, and the Floor shows the progress live.

### AI Supervisor (the AI part)
- The manager can **teach it a lesson**, e.g. "During delivery rushes, don't use Table 2; people waiting for pickups crowd around it. Use Table 3." The lesson is saved to **Hindsight**, a long-term memory service from Vectorize.
- On a later shift, when the same situation comes up, the Supervisor **recalls that lesson** and suggests Table 3 instead of the rules' choice, Table 2.
- The Supervisor page shows **"Without memory → With past lessons" side by side**, plus the exact lesson it used ("Because of this lesson: …").
- If proactive mode is on, a banner appears on the Floor by itself: **"AI Supervisor suggests Table 3 instead for Kapoor. Based on a past lesson… See why."**
- **Shift handover:** a summary for the next manager of what's still open and what has been learned.
- **Lessons learned:** a list of saved lessons. Each can be marked as helped or didn't help, or replaced when things change.

### Reports and Settings
- **Reports:** how the floor changed over time, finished tables, CSV export.
- **Settings:** seating rules (fair / balanced / maximise throughput), usual meal and cleaning times, drawing table outlines on the camera view, managing videos, live camera.

## 5. How the AI and memory work (and why it's trustworthy)

This is the strongest technical point.

1. **The rules engine is deterministic.** Normal seating suggestions come from plain code: capacity, queue order and the chosen policy. No AI guessing there.
2. **The AI can only pick from options the server already checked.** The backend builds the list of allowed actions (which tables are actually free and fit). The language model (Groq, `openai/gpt-oss-120b`) only chooses among them and has to explain why. It can't invent a table or an action.
3. **Every claim has to cite memory.** If the AI suggests something different from the rules, it must cite a real lesson recalled from Hindsight. The server checks that the cited memory exists, is still active, matches the current situation (e.g. it's a delivery rush now too) and names the same tables. If not, the advice is rejected.
4. **Lessons expire and can be replaced.** A seating preference lesson is valid for 7 days. Feedback like "that didn't help" or "this changed" retires it.
5. **A human approves everything.** The app proposes and the manager decides. "Do it" / "No thanks".
6. **Memory is real, not faked locally.** Advice only counts something as "remembered" if Hindsight actually returned it. The local database is the audit trail, not a substitute for recall.

**Evidence I have:** a recorded evaluation (`docs/verification/hindsight-live-memory-report.json`). In five paired runs with the same floor, same question and same model, the recommendation was Table 2 without memory and Table 3 with memory every time. These were synthetic test inputs (a staged delivery rush), not a real restaurant.

## 6. Newest feature: extra chairs, remembered by Hindsight

Real restaurants often add a chair when a party is one or two over a table's size, but only if there's space around that table. I built:

- **A party of 7 with a 6-seat table:** the Floor offers "Needs 1 extra chair · Mehta (7) → Table 4".
- **First time:** "Check there's room at Table 4 first. The app will remember your answer." → **There's room, seat them** / **No room at Table 4**.
- The answer is saved as a **"Space check"** in Hindsight: "Table 4 (6 seats) has room for up to 1 extra chair…"
- **Next time:** within about 3 seconds the Floor says **"Remembered: Table 4 has room for 1 extra chair. You checked on 14 Nov. Saved in Hindsight memory."** → one tap to seat. No walking over to check.
- **It also works as an alternative:** a party of 3 normally gets a 4-seat table, but "Table 1 · 2 seats + 1 extra chair" also appears under "Prefer a different table?". It's never the recommendation. If memory says there's room, the card hints "Also possible: Table 1 with 1 extra chair."
- **Safety rules:**
  - At most 2 extra chairs.
  - Never takes a table the normal rules have suggested for someone else, so nobody waiting gets bumped.
  - The manager approves every time.
  - "Remembered" only shows when Hindsight actually recalled it.
  - The newest check replaces older ones. Checks are forgotten if the tables are redrawn.
- **Why it's a good pitch moment:** anyone instantly understands "it remembered Table 4 has room for one more chair". It shows memory saving real time.

## 7. Tech stack

- **Frontend:** React 19, React Router 7, Tailwind CSS 4, lucide icons, Vite.
- **Backend:** Python, FastAPI, SQLite.
- **Vision:** OpenCV, a pretrained Ultralytics YOLO model with ByteTrack tracking, polygon table regions with enter and leave delays.
- **Memory:** Hindsight by Vectorize (Hindsight Cloud). Retains each experience with its context and recalls the relevant ones per situation.
- **Reasoning:** Groq-hosted model (`openai/gpt-oss-120b`), structured output, choosing only from server-supplied candidates.
- **Tests:** 209 backend tests (pytest) and 17 frontend tests (vitest), all passing. TypeScript typecheck and production build pass.

## 8. Live demo flow (what I'll actually show)

The floor has been reset. All four tables show "Check this table", the camera is paused near the start of `controlled-floor-demo.mp4`, nobody is waiting, and there are no open tasks. Saved lessons are kept (9 retained in Hindsight, including the Kapoor / Table 2 → Table 3 delivery-rush lesson).

Tables in the controlled demo: **T1 = 2 seats, T2 = 4, T3 = 4, T4 = 6.**

Suggested order (about 3–4 minutes):
1. **Floor overview (20s):** camera, table cards, "the camera suggests, people confirm".
2. **Confirm tables clean:** "Mark clean and free" on the tables. Each becomes Free.
3. **Seat a normal party**, e.g. Sharma (2). Show "Who to seat next" with the reason, then "Seat them".
4. **AI Supervisor moment:** add the Kapoor party (4). The rules say Table 2. Within about 10–20 s (don't click anything meanwhile) the Floor banner says the AI suggests Table 3, based on the delivery-rush lesson. Click "See why" to show Without memory vs With past lessons, plus the cited lesson. Approve with "Do it".
5. **Extra chairs moment:** add a party of 7. First-time card → "There's room, seat them". Free Table 4 ("They left" → "Mark clean and free"). Add another party of 7 and wait about 5 s: "Remembered: Table 4 has room for 1 extra chair."
6. **Turnover:** a table's guests leave → it needs cleaning → staff progress shows on the card → clean → free.
7. **Close:** Shift handover summary. "The next manager starts with what the last one learned."

**Optional:** a longer clip of real-time food court footage (`d5390d012a5f`, 3 tables) shows the camera tracking real people. Show it before the controlled demo, while there's no open work.

**Demo gotchas:**
- After restarting the backend, the camera video stays off ("NO SOURCE"). Use Reconnect on the Camera row.
- "Start over" (to reset) is blocked while parties are waiting or seated, or tasks are open. Clear those first.
- The delivery-rush lesson is valid for 7 days from when it was recorded (14 Nov 2026).
- "Fresh confirmed absence is required…" means the camera currently sees someone at that table, so it can't be marked clean yet.

## 9. Honesty: what's true and what isn't (important for Q&A)

**True and defensible:**
- Real pretrained person detection runs live on video and drives table states.
- Real Hindsight memory and a real LLM are used. Recall changes the recommendation, and that change was measured on controlled inputs.
- The AI is constrained: it can't act on its own, can't invent actions, and must cite memory.
- Humans approve every seat, every clean and every override.
- Solid engineering: persistent state, stale-request protection (two people can't seat the same table), tests.

**Must not be overclaimed:**
- **Footage:** the main demo video is a **controlled, labelled montage made from stock footage** (one scene repeated across four table regions), not real CCTV from a working restaurant. The food court clip is real public footage but not our restaurant.
- **No real restaurant pilot.** No measured business results (no "X% shorter waits") from a real business.
- **The vision foundation isn't mine.** It builds on an open-source MIT project, *Restaurant Table Occupancy Detection* by Zihad (detector, table editor, occupancy tracking, base dashboard). My work is the restaurant operations layer: readiness and cleaning workflow, queue, seating allocator, wait estimates, tasks, AI Supervisor with Hindsight memory, extra chairs, and the redesigned UX. See `ATTRIBUTION.md`.
- **No custom model training.** The YOLO model is pretrained. Seating and wait estimates are deterministic code, not machine learning.
- **AI-assisted development:** built with Codex and Claude Code. Say this openly if asked.
- **Local only:** not deployed. Judges see it on my laptop.

## 10. Current limitations, framed as the roadmap

- **Reservations:** walk-ins only today. Reservations are the natural next step. I deliberately didn't rush them in.
- **Joining tables for big groups:** a party bigger than the biggest table plus 2 chairs gets a clear message, but the app can't merge tables yet.
- **Multi-camera / whole-restaurant coverage**, and live cameras rather than video files.
- **POS integration** (knowing when the bill is paid gives a stronger departure signal).
- **Staff mobile app** so cleaners and waiters get tasks on their phones.
- **Real pilot** in a restaurant to measure table turnover and wait time.

## 11. Likely judge questions and honest short answers

- **"Why not just use a reservation or waitlist app?"** Those manage the list. They don't know which tables are actually empty and clean right now, and they don't remember why the manager made a call. This combines live floor state, seating logic and memory.
- **"What does the AI actually do? Isn't this just rules?"** The rules handle the normal case. The AI adds what rules can't know: the manager's lessons from past shifts. It's measured: same inputs, the only difference is memory, and the recommendation changes.
- **"What if the AI is wrong?"** It can only choose from server-checked options, it must cite a real lesson that matches the current situation, and a person approves. Bad lessons can be marked "didn't help" or replaced.
- **"What if the camera is wrong?"** The camera only suggests. People confirm departures and cleanliness. If the camera drops out, the app switches to staff checks and keeps working.
- **"Privacy?"** It detects people, not identities. No face recognition, and no customer names are sent to the AI (the Supervisor gets anonymised floor data).
- **"Why Hindsight and not just a database?"** A database stores records. Hindsight recalls the relevant experience for the current situation (conditions, reasons, outcomes) and handles changed or conflicting lessons. That's what lets advice adapt across shifts.
- **"Does it scale?"** The allocator does exact matching for up to 8 free tables and 12 parties, and falls back to a fair queue beyond that. One SQLite database per restaurant. Memory is scoped per restaurant and per floor layout.
- **"How much of this did you build?"** See section 9: the vision base is open source and credited. The operations layer, AI Supervisor, memory design, extra chairs and UX are this project.
- **"Business model?"** Suggestion only, not decided: monthly subscription per restaurant, using existing CCTV cameras.

## 12. Key files, if needed

- `README.md`: short overview. `docs/PROJECT_GUIDE.md`: full guide. `docs/DEMO.md`: demo runbook.
- `docs/HINDSIGHT.md`: memory setup. `docs/FOOTAGE.md`: footage provenance.
- `ATTRIBUTION.md`, `docs/SUBMISSION_DISCLOSURE.md`: what's reused versus new.
- `docs/verification/hindsight-live-memory-report.json`: the memory evaluation.
- Backend: `backend/app/operations.py` (floor and seating rules), `backend/app/decisions.py` (allocator), `backend/app/supervisor.py` (AI Supervisor and memory).
- Frontend: `frontend/src/pages/FloorPage.tsx`, `frontend/src/pages/SupervisorPage.tsx`.

## 13. About me (how to help me)

- I'm presenting alone and learning as I go. I want to explain things simply enough that a **non-technical restaurant manager** would get it, and still impress technical judges.
- Time is limited, so prioritise what makes the pitch land: a clear problem, one memorable demo moment (the memory changing the recommendation, and the extra chair being remembered), and honest, confident answers.
