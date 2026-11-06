# Footage and demonstration integrity

## Original restaurant clip
- Creator: Mikhail Nilov.
- Source: https://www.pexels.com/video/people-sitting-down-at-a-table-in-a-restaurant-9782945/
- Download: https://videos.pexels.com/video-files/9782945/9782945-uhd_2732_1440_25fps.mp4
- Terms reviewed 2026-11-05: https://www.pexels.com/license/
- Terms permit free use and modification, prohibit implying endorsement and certain redistribution. No endorsement is implied. Footage is for a local technical demonstration, not redistribution as stock.
- Local file: `fake_camera/videos/restaurant-stock.mp4` (excluded from Git).
- A single restaurant table and camera movement make this unsuitable as evidence of real multi-table CCTV accuracy.

## Controlled floor demo
`scripts/prepare_demo.py` creates `controlled-floor-demo.mp4` from a cropped, repeated version of this stock scene, with four independently blanked regions. This is an explicitly synthetic visual fixture, continuously labeled in the pixels and dashboard. It does not represent four real tables or independent diners.

Normal YOLO inference processes its pixels. No model detections, occupancy events or decision outputs are scripted. The generator controls inputs only, allowing reproducible tests of the full observation-to-staff-action loop.

Timeline (seconds in the generated video):
- 0–12: vacant regions; confirm initial readiness manually.
- 12–65: T1 contains the stock scene, except a brief absence at 40–42.
- 25–110: T2 contains the stock scene.
- 85–120: T3 contains the stock scene.
- T4 stays visually vacant for queue and seating tests.

Manual queue entries and staff actions are explicit. Synthetic capacities and dining/cleaning assumptions are demo configuration. Seated party sizes come from staff entry, never from detector counts.

## Evidence
`scripts/verify_vision.py` runs real inference on original clip frames and stores annotated images plus `docs/verification/vision-report.json`. This has no ground-truth evaluation and establishes no accuracy percentage. Actual stock footage and controlled fixture results must be described separately.

`verify_regions.py` additionally repeats the permitted crop across all four regions and checks independent occupancy/departure transitions using actual YOLO outputs. Results and annotated image are in docs/verification/four-region-report.json and four-region-inference.jpg. These are controlled geometry/isolation tests, not real-world accuracy evaluation.


## Entrance calibration added 6 November

scripts/verify_arrivals.py translates a frame of the same permitted stock clip across a configured entrance region and writes entrance-calibration.mp4 plus its portable config. This artificial motion checks actual YOLO/ByteTrack region-crossing plumbing. The generated input is synthetic and is not evidence of natural arrival, group-size, or customer-versus-staff accuracy. The host must independently confirm party size. Video remains excluded from Git; annotated evidence and the JSON report are in docs/verification.
