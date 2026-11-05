"""Create a visibly labeled, controlled visual test fixture from permitted stock.

This edits INPUT pixels only. No detections, events or operational outputs are
scripted. The normal YOLO pipeline must infer presence/absence from the video.
A repeated stock scene in four regions is NOT real multi-table CCTV evidence.
"""
import json
from pathlib import Path
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'fake_camera/videos/restaurant-stock.mp4'
cap = cv2.VideoCapture(str(source))
fps = 10
frames = []
while True:
    ok, frame = cap.read()
    if not ok:
        break
    # The left half contains seated guests; omit the server on the right.
    frame = cv2.resize(frame, (960, 506))
    frames.append(cv2.resize(frame[:, :500], (470, 242)))
cap.release()
if not frames:
    raise RuntimeError('Download the documented Pexels source first.')
path = ROOT / 'fake_camera/videos/controlled-floor-demo.mp4'
writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*'mp4v'), fps, (960, 560))
if not writer.isOpened():
    raise RuntimeError('Video encoder unavailable')
# One short absence is intentionally below the departure confirmation interval.
def present(table, second):
    return [12 <= second < 65 and not 40 <= second < 42,
            25 <= second < 110,
            85 <= second < 120,
            False][table]
for index in range(120 * fps):
    second = index / fps
    canvas = np.full((560, 960, 3), (27, 42, 37), dtype=np.uint8)
    for table in range(4):
        x = 5 + (table % 2) * 480
        y = 27 + (table // 2) * 265
        if present(table, second):
            source_index = int(second * 25) % len(frames)
            canvas[y:y+242, x:x+470] = frames[source_index]
        else:
            cv2.rectangle(canvas, (x,y), (x+470,y+242), (39,57,49), -1)
            cv2.putText(canvas, 'VACANT CALIBRATION REGION', (x+66,y+125), cv2.FONT_HERSHEY_SIMPLEX, .5, (125,155,135), 1)
        cv2.putText(canvas, f'T{table+1} - CONTROLLED INPUT', (x+8,y+18), cv2.FONT_HERSHEY_SIMPLEX, .45, (215,230,210), 1)
    cv2.putText(canvas, 'CONTROLLED TEST MONTAGE - REPEATED STOCK SCENE - NOT REAL MULTI-TABLE CCTV', (12,18), cv2.FONT_HERSHEY_SIMPLEX, .48, (205,225,215), 1)
    cv2.putText(canvas, f'Pexels / Mikhail Nilov | Input timeline {second:05.1f}s | YOLO outputs are inferred', (12,551), cv2.FONT_HERSHEY_SIMPLEX, .48, (185,205,185), 1)
    writer.write(canvas)
writer.release()
tables=[]
for i, capacity in enumerate([2,4,4,6]):
    x=5+(i%2)*480; y=27+(i//2)*265
    tables.append(dict(id=f'T{i+1}',name=f'Table {i+1}',capacity=capacity,polygon=[[x,y],[x+470,y],[x+470,y+242],[x,y+242]]))
config = dict(video_id='controlled-floor-demo', source='../fake_camera/videos/controlled-floor-demo.mp4', frame_width=960,frame_height=560,tables=tables,
              occupancy=dict(confidence_threshold=.3,enter_seconds=3,leave_seconds=6,reference_point='center',presence_hold_seconds=1))
(ROOT/'backend/configs/controlled-floor-demo.json').write_text(json.dumps(config,indent=2))
original = dict(video_id='restaurant-stock',source='../fake_camera/videos/restaurant-stock.mp4',frame_width=960,frame_height=506,
    tables=[dict(id='T1',name='Stock dining table',capacity=6,polygon=[[0,40],[690,40],[690,506],[0,506]])],
    occupancy=dict(confidence_threshold=.3,enter_seconds=3,leave_seconds=6,reference_point='center',presence_hold_seconds=1))
(ROOT/'backend/configs/restaurant-stock.json').write_text(json.dumps(original,indent=2))
cv2.imwrite(str(ROOT/'docs/verification/controlled-input.jpg'), cv2.VideoCapture(str(path)).read()[1])
print(f'Generated {path.name}: 120 seconds, four explicitly synthetic observation regions.')
