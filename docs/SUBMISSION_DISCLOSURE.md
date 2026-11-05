# Reuse and AI disclosure for a future hackathon submission

This is a factual disclosure draft, not a submitted entry. Eligibility must be checked against the named event's actual rules before submission.

## Pre-existing foundation
Restaurant Table Occupancy Detection by Zihad, commit `51053aac5d4f6e4f5600205d0aadb177fb493826`:
https://github.com/sanaulislamzihad/Restaurant-Table-Occupancy-Detection

Reused foundation: person detection and ByteTrack integration, polygon-based visual occupancy, table editor, source handling, FastAPI/MJPEG/WebSocket infrastructure, SQLite monitoring analytics, React components, and baseline tests. MIT notice retained in the root LICENSE. These components were not invented or created from scratch by this team during the hackathon.

## Added in this workspace
Operational readiness separated from visual occupancy; staff cleaning and correction workflows; persistent parties and seating records; queue fairness and best-fit allocation; current-queue alternative comparisons; manager overrides and declines; scenario-based wait ranges; cleaning priorities; media-time pause/restart integration; copilot dashboard; and additional regression/integration tests. DEVELOPMENT_LOG.md and docs/UPSTREAM_CHANGES.md record the development evidence.

## AI and tools
Codex assisted code inspection, implementation, debugging, verification, and documentation. Runtime person detection uses a pretrained Ultralytics YOLO model with ByteTrack. The restaurant allocation and wait-estimation features are deterministic code, not an LLM or a newly trained model. No custom model training or customer identification was performed.

Ultralytics/model weights have licensing separate from the upstream MIT repository. Dependency metadata and model checksum are in docs/verification/dependency-metadata.json. Preserve applicable notices and provide source as required by the licenses when distributing; this draft does not declare the combined application MIT-only.

## Demonstration media
Permitted restaurant stock footage by Mikhail Nilov on Pexels is used for original-scene inference inspection. A continuously labeled edited montage repeats a cropped stock scene across four controlled regions. It is a synthetic systems test, not real multi-table CCTV evidence. Model outputs and recommendations are computed, not scripted. No endorsement by the creator or people in the footage is implied.

## Claims supported by evidence
The application demonstrates genuine pretrained inference connected to an operational state and staff approval loop on a disclosed controlled input. No real-world accuracy percentage, learned departure prediction, production readiness, or invention of upstream occupancy technology is claimed.

## Event-specific eligibility
The user identified INFINEX 2K26, organized by PropCare NW, with individual participation. Its expanded public Unstop listing was reviewed; it does not state a policy on pre-existing code or AI coding assistance. See docs/HACKATHON_RULES.md. Organizer clarification is still needed before claiming eligibility; this disclosure does not establish permission. This is an individual entry draft, not a team entry.
