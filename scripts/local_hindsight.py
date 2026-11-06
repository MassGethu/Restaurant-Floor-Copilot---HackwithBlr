"""Manage only this edition's pinned local Hindsight stack. Never prints keys.

Usage: .venv/bin/python scripts/local_hindsight.py up|stop|restart|status|check
Cloud settings and the application backend are not modified by these commands.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.settings import get_settings


def compose_environment(settings):
    env = dict(os.environ)
    env["HINDSIGHT_DOCKER_LLM_API_KEY"] = (
        settings.agent_api_key or "unused-for-lifecycle-commands"
    )
    env["HINDSIGHT_DOCKER_LLM_MODEL"] = settings.hindsight_local_llm_model
    env["HINDSIGHT_DOCKER_REFLECT_MODEL"] = settings.hindsight_local_reflect_llm_model
    return env


def compose(arguments, settings):
    return subprocess.run(
        ["docker", "compose", "-f", str(ROOT / "compose.hindsight.yml"), *arguments],
        cwd=ROOT,
        env=compose_environment(settings),
        check=True,
    )


def check_local(timeout):
    deadline = time.monotonic() + timeout
    while True:
        try:
            with urlopen("http://127.0.0.1:8888/health", timeout=5) as response:
                if response.status == 200:
                    from hindsight_client import Hindsight

                    with Hindsight(
                        base_url="http://127.0.0.1:8888", timeout=10, max_attempts=1
                    ) as client:
                        print(
                            json.dumps(
                                {
                                    "local_api_ready": True,
                                    "api_version": client.get_version().api_version,
                                }
                            )
                        )
                    return
        except (OSError, URLError):
            if time.monotonic() >= deadline:
                raise RuntimeError(
                    "Local Hindsight is not ready. Inspect this edition's container logs."
                ) from None
            time.sleep(2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("up", "stop", "restart", "status", "check"))
    parser.add_argument(
        "--wait", type=int, default=0, help="Optional readiness wait in seconds"
    )
    args = parser.parse_args()
    settings = get_settings()
    if args.command == "check":
        check_local(args.wait)
        return
    if args.command == "up" and not settings.agent_api_key:
        raise SystemExit(
            "Configure AGENT_API_KEY in backend/.env; it is supplied to the local container without copying Cloud credentials."
        )
    if args.command == "up":
        for folder in ("pg0", "cache"):
            (ROOT / "backend/data/hindsight-local" / folder).mkdir(
                parents=True, exist_ok=True
            )
        compose(["up", "-d"], settings)
        if args.wait:
            check_local(args.wait)
    elif args.command == "restart":
        compose(["restart", "hindsight"], settings)
        if args.wait:
            check_local(args.wait)
    elif args.command == "stop":
        compose(["stop", "hindsight"], settings)
    else:
        compose(["ps"], settings)


if __name__ == "__main__":
    try:
        main()
    except (subprocess.CalledProcessError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from None
