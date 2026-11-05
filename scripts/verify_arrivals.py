"""Actual-model entrance crossing test on explicitly motion-edited stock input."""

import json, sys, tempfile
from pathlib import Path
import cv2, numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.detector import PersonDetector
from app.settings import get_settings
from app.operations import Operations
from app.schemas import TableDef

cap = cv2.VideoCapture(str(ROOT / "fake_camera/videos/restaurant-stock.mp4"))
ok, image = cap.read()
cap.release()
assert ok
image = cv2.resize(image, (960, 506))
detector = PersonDetector.from_settings(get_settings(), confidence=0.3)
initial = detector.detect(image)
candidates = [
    box for box in initial.xyxy if box[0] > 30 and box[2] < 800 and box[3] > 400
]
assert candidates, "No suitable visible stock person for calibration"
box = max(candidates, key=lambda box: (box[2] - box[0]) * (box[3] - box[1]))
boundary = float((box[0] + box[2]) / 2 + 25)
polygon = [
    [boundary, 400],
    [min(950, boundary + 180), 400],
    [min(950, boundary + 180), 505],
    [boundary, 505],
]
with tempfile.TemporaryDirectory() as tmp:
    operations = Operations(Path(tmp) / "arrivals.db")
    operations.configure(
        "entrance-calibration",
        [
            TableDef(
                id="T1",
                name="Calibration table",
                capacity=6,
                polygon=[(0, 0), (200, 0), (200, 500), (0, 500)],
            )
        ],
    )
    detector.reset_tracking()
    samples = []
    frames = []
    for step in range(21):
        dx = step * 3
        frame = cv2.warpAffine(image, np.float32([[1, 0, dx], [0, 1, 0]]), (960, 506))
        detections = detector.detect(frame)
        operations.state["now"] = step * 0.5
        operations.observe_entrance(detections, polygon, step * 0.5)
        cv2.polylines(
            frame, [np.array(polygon, dtype=np.int32)], True, (230, 190, 40), 2
        )
        cv2.putText(
            frame,
            "CONTROLLED MOTION-EDITED STOCK - ACTUAL YOLO CROSSING TEST",
            (12, 25),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (255, 255, 255),
            1,
        )
        frames.append(frame)
        samples.append(
            dict(
                at=step * 0.5,
                detected=len(detections),
                arrival_candidates=len(operations.state["arrivals"]),
            )
        )
    assert operations.state["arrivals"], (
        "No actual-model crossing candidate was produced"
    )
    assert operations.state["parties"] == [], (
        "Vision must not silently register a party"
    )
    candidate = operations.state["arrivals"][0]
    operations.resolve_arrival(candidate["id"], "register", "Confirmed test party", 4)
    assert operations.state["parties"][0]["size"] == 4
    report = dict(
        passed=True,
        input="Permitted stock frame translated across a configured ROI; synthetic calibration, not natural arrival accuracy.",
        samples=samples,
        candidates=operations.state["arrivals"],
        host_confirmed_size=4,
    )
    (ROOT / "docs/verification/arrival-report.json").write_text(
        json.dumps(report, indent=2)
    )
    cv2.imwrite(str(ROOT / "docs/verification/arrival-calibration.jpg"), frames[-1])
    writer = cv2.VideoWriter(
        str(ROOT / "fake_camera/videos/entrance-calibration.mp4"),
        cv2.VideoWriter_fourcc(*"mp4v"),
        10,
        (960, 506),
    )
    for frame in frames:
        for _ in range(5):
            writer.write(frame)
    writer.release()
    operations.close()
config = dict(
    video_id="entrance-calibration",
    source="../fake_camera/videos/entrance-calibration.mp4",
    frame_width=960,
    frame_height=506,
    tables=[
        dict(
            id="T1",
            name="Calibration table",
            capacity=6,
            kind="table",
            polygon=[[0, 0], [200, 0], [200, 500], [0, 500]],
        ),
        dict(
            id="ENTRY",
            name="Entrance crossing",
            capacity=1,
            kind="entrance",
            polygon=polygon,
        ),
    ],
    occupancy=dict(
        confidence_threshold=0.3,
        enter_seconds=2,
        leave_seconds=6,
        reference_point="center",
        presence_hold_seconds=1,
    ),
)
(ROOT / "backend/configs/entrance-calibration.json").write_text(
    json.dumps(config, indent=2)
)
print(
    json.dumps(
        {
            "passed": True,
            "candidates": len(report["candidates"]),
            "host_confirmed_size": 4,
        }
    )
)
