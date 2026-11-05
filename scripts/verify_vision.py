"""Run actual inference on permitted stock footage; save reproducible evidence."""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
import cv2
from app.detector import PersonDetector
from app.settings import get_settings

out = ROOT / 'docs' / 'verification'
out.mkdir(parents=True, exist_ok=True)
video = ROOT / 'fake_camera' / 'videos' / 'restaurant-stock.mp4'
cap = cv2.VideoCapture(str(video))
detector = PersonDetector.from_settings(get_settings())
rows = []
for at in (0, 5, 10, 15):
    cap.set(cv2.CAP_PROP_POS_MSEC, at * 1000)
    ok, frame = cap.read()
    if not ok:
        raise RuntimeError(f'Cannot read frame at {at}')
    frame = cv2.resize(frame, (960, 506))
    detector.reset_tracking()
    start = time.perf_counter()
    detections = detector.detect(frame)
    elapsed = time.perf_counter() - start
    for box, confidence in zip(detections.xyxy.astype(int), detections.confidence):
        x1, y1, x2, y2 = box
        cv2.rectangle(frame, (x1, y1), (x2, y2), (60, 200, 90), 2)
        cv2.putText(frame, f'person {confidence:.2f}', (x1, max(20, y1)), cv2.FONT_HERSHEY_SIMPLEX, .5, (60, 200, 90), 1)
    cv2.putText(frame, 'ACTUAL INFERENCE - PEXELS STOCK CLIP - NOT CCTV VALIDATION', (12, 490), cv2.FONT_HERSHEY_SIMPLEX, .5, (255, 255, 255), 1)
    cv2.imwrite(str(out / f'restaurant-{at:02d}s.jpg'), frame)
    rows.append(dict(at_seconds=at, people_detected=len(detections), inference_seconds=round(elapsed, 4), boxes=detections.xyxy.tolist()))
cap.release()
report = dict(source='https://www.pexels.com/video/people-sitting-down-at-a-table-in-a-restaurant-9782945/', author='Mikhail Nilov', license='https://www.pexels.com/license/', model=get_settings().yolo_model, device=detector.device, samples=rows, limitations='Single-table stock footage, no annotated ground truth. Counts are observations, not measured accuracy. Frames independently reset tracking.')
(out / 'vision-report.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
