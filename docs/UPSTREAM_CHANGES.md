# Changes from upstream

Reference: `51053aac5d4f6e4f5600205d0aadb177fb493826`.

## Modified source and configuration
- `backend/app/annotator.py`
- `backend/app/main.py`
- `backend/app/pipeline.py`
- `backend/app/schemas.py`
- `backend/app/sources.py`
- `backend/tests/conftest.py`
- `backend/tests/test_api.py`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/src/App.tsx`
- `frontend/src/api/types.ts`
- `frontend/src/components/Layout.tsx`
- `frontend/src/components/TableCanvas.tsx`
- `frontend/src/components/TableCard.tsx`
- `frontend/src/components/TableEditor.tsx`
- `frontend/src/components/VideoCard.tsx`
- `frontend/src/index.css`
- `frontend/src/pages/LiveMonitorPage.tsx`
- `frontend/src/pages/VideosPage.tsx`

## New application/test modules
- `backend/app/copilot_api.py`
- `backend/app/decisions.py`
- `backend/app/operations.py`
- `backend/tests/test_copilot_api.py`
- `backend/tests/test_decisions.py`
- `backend/tests/test_media_time.py`
- `backend/tests/test_operations.py`
- `frontend/src/api/copilot.ts`
- `frontend/src/pages/FloorPage.tsx`

Additional changes include media-time configuration defaults, the local launch script, documentation and scripts listed in README.md. Original upstream README is preserved separately. Model weights and footage are excluded from Git.
