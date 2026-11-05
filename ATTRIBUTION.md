# Attribution and provenance

This application builds on Restaurant Table Occupancy Detection by Zihad:
https://github.com/sanaulislamzihad/Restaurant-Table-Occupancy-Detection

Reference commit: `51053aac5d4f6e4f5600205d0aadb177fb493826`.
Upstream source copied on 2026-11-05. Its MIT license and copyright notice are retained in LICENSE.

Upstream foundation: YOLO/ByteTrack detector, polygon editor and occupancy tracker, FastAPI video/status APIs, SQLite analytics, React dashboard, and existing tests. These are pre-existing work, not original hackathon contributions.

New work is tracked in DEVELOPMENT_LOG.md: restaurant operational states, staff actions, party queue, explainable allocation, wait assumptions, media-time integration, and copilot interface.

Dependencies have separate licenses. Ultralytics is AGPL-3.0; preserve applicable notices and supply corresponding source where required. MIT upstream licensing does not override dependency or model-weight terms. FFmpeg licensing varies with its build. Exact installed dependency notices and footage/model provenance must be recorded before distribution. Hackathon rules on pre-existing work remain to be checked by the team.
