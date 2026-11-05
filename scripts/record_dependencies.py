"""Record installed dependency metadata and model integrity for reproducibility.

Metadata is evidence, not a conclusion about combined-work license obligations.
"""
import hashlib
import importlib.metadata
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
packages = []
for distribution in importlib.metadata.distributions():
    metadata = distribution.metadata
    packages.append(dict(name=metadata['Name'], version=metadata['Version'],
        license_expression=metadata.get('License-Expression'),
        declared_license=metadata.get('License'),
        project_urls=metadata.get_all('Project-URL') or [],
        license_files=metadata.get_all('License-File') or []))
lock = json.loads((root/'frontend/package-lock.json').read_text())
frontend = [dict(name=path.removeprefix('node_modules/'), version=value.get('version'),
    declared_license=value.get('license')) for path, value in lock['packages'].items() if path]
model = root/'backend/models/yolo26s.pt'
report = dict(python=sorted(packages, key=lambda p:p['name'].lower()),frontend=frontend,
    model=dict(name=model.name, sha256=hashlib.sha256(model.read_bytes()).hexdigest(),
    provenance='Downloaded by the official Ultralytics model resolver; exact resolved download URL was not captured. See upstream Ultralytics model licensing.'))
(root/'docs/verification/dependency-metadata.json').write_text(json.dumps(report, indent=2))
print(f'Recorded {len(packages)} Python and {len(frontend)} frontend packages and model checksum.')
