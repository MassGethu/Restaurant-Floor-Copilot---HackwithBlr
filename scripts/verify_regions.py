"""Verify all four configured regions using actual inference on controlled pixels.

The same permitted stock crop is repeated. This is association/isolation
coverage for the prototype, not a real-world accuracy benchmark.
"""
import json
import sys
from pathlib import Path
import cv2
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from app.annotator import FrameAnnotator
from app.detector import PersonDetector
from app.occupancy import OccupancyTracker
from app.schemas import TableConfig
from app.settings import get_settings

config=TableConfig.model_validate_json((ROOT/'backend/configs/controlled-floor-demo.json').read_text())
cap=cv2.VideoCapture(str(ROOT/'fake_camera/videos/controlled-floor-demo.mp4'))
cap.set(cv2.CAP_PROP_POS_MSEC,30000)
ok,base=cap.read();cap.release()
if not ok:raise RuntimeError('Cannot read controlled fixture')
tile=base[27:269,5:475].copy()
model=PersonDetector.from_settings(get_settings(),confidence=.3)
tracker=OccupancyTracker(config.tables,config.occupancy)

def frame_without(missing=None):
    frame=base.copy()
    for i in range(4):
        x=5+(i%2)*480;y=27+(i//2)*265
        frame[y:y+242,x:x+470]=tile if missing!=i else np.full_like(tile,(39,57,49))
        cv2.rectangle(frame,(x,y),(x+470,y+23),(27,42,37),-1)
        cv2.putText(frame,f'T{i+1} - CONTROLLED REGION VERIFICATION',(x+7,y+17),cv2.FONT_HERSHEY_SIMPLEX,.4,(205,225,205),1)
    return frame

checks=[]
for now,missing in [(0,None),(4,None),(5,0),(6.1,0),(10.1,0),(12,None),(16,None),(17,1),(18.1,1),(22.1,1)]:
    frame=frame_without(missing)
    detections=model.detect(frame)
    tracker.update(detections,now=now)
    states={s.table_id:s.status.value for s in tracker.states}
    checks.append(dict(media_seconds=now,removed_region=missing,statuses=states,people_detected=len(detections)))
    if now==4:
        assert all(value=='OCCUPIED' for value in states.values()),states
        annotated=FrameAnnotator().annotate(frame,detections,config.tables,tracker.states,reference_point='center')
        cv2.imwrite(str(ROOT/'docs/verification/four-region-inference.jpg'),annotated)
    if now==10.1:
        assert states['T1']=='AVAILABLE' and all(states[f'T{i}']=='OCCUPIED' for i in (2,3,4)),states
    if now==16:
        assert all(value=='OCCUPIED' for value in states.values()),states
    if now==22.1:
        assert states['T2']=='AVAILABLE' and all(states[f'T{i}']=='OCCUPIED' for i in (1,3,4)),states
report=dict(passed=True,model=get_settings().yolo_model,device=model.device,
    input='Repeated edited stock scene; actual YOLO detections, no mocked outputs.',
    limitation='Tests configured region coverage and independent transitions, not real CCTV accuracy.',checks=checks)
(ROOT/'docs/verification/four-region-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
