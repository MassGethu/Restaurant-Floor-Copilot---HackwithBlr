"""Profile boundaries and delivery migration; service doubles are explicit."""
# ruff: noqa: F811

import copy
import os
import socket
import subprocess
import sys
from pathlib import Path

import pytest
from app.memory_clients import HindsightMemory
from app.supervisor import ServiceUnavailable, Supervisor, destination
from test_supervisor import FakeMemory, FakeReasoner, retain_lesson, supervisor  # noqa: F401 - shared fixture


def test_cloud_and_local_credentials_are_selected_independently(
    supervisor, monkeypatch
):
    settings = supervisor.settings.model_copy(
        update={
            "hindsight_base_url": "https://cloud.example.invalid",
            "hindsight_api_key": "cloud-only-token",
            "hindsight_local_base_url": "http://127.0.0.1:8888",
            "hindsight_local_api_key": "",
            "agent_api_key": "reasoning-only-token",
        }
    )
    calls = []
    monkeypatch.setattr("hindsight_client.Hindsight", lambda **kw: calls.append(kw))
    HindsightMemory(settings).client()
    HindsightMemory(settings.model_copy(update={"hindsight_profile": "local"})).client()
    assert calls[0]["base_url"] == "https://cloud.example.invalid"
    assert calls[0]["api_key"] == "cloud-only-token"
    assert calls[1]["base_url"] == "http://127.0.0.1:8888"
    assert calls[1]["api_key"] is None
    assert calls[1]["timeout"] == settings.hindsight_local_timeout_seconds
    assert settings.agent_api_key == "reasoning-only-token"


def test_cloud_local_cloud_roundtrip_preserves_receipts_and_invalidates_advice(
    supervisor,
):
    cloud = supervisor
    item = retain_lesson(cloud)
    cloud.advice()
    old_receipt = copy.deepcopy(
        cloud.record(item["id"])["deliveries"][cloud.destination]
    )
    original_floor = copy.deepcopy(cloud.ops.state)
    local_settings = cloud.settings.model_copy(update={"hindsight_profile": "local"})
    local = Supervisor(
        cloud.ops, local_settings, memory=FakeMemory(), reasoner=FakeReasoner()
    )
    assert local.snapshot()["integration"]["memory_profile"] == "local"
    assert local.record(item["id"])["delivery"] == "pending"
    assert (
        local.snapshot()["advice"] is None
    )  # Never display a Cloud response as local.
    assert (
        local.evidence(local.memory.recall("context", local.layout()), local.layout())
        == []
    )
    assert local.sync_once()
    assert set(local.memory.records) == {item["id"]}
    assert local.record(item["id"])["deliveries"][cloud.destination] == old_receipt
    restored = Supervisor(
        cloud.ops, cloud.settings, memory=cloud.memory, reasoner=cloud.reasoner
    )
    assert restored.record(item["id"])["delivery"] == "retained"
    assert restored.record(item["id"])["deliveries"][cloud.destination] == old_receipt
    assert not restored.sync_once()  # No unnecessary Cloud reingestion.
    assert cloud.ops.state == original_floor


def test_new_local_experience_is_queued_for_cloud_on_return(supervisor):
    cloud = supervisor
    original = retain_lesson(cloud)
    local = Supervisor(
        cloud.ops,
        cloud.settings.model_copy(update={"hindsight_profile": "local"}),
        memory=FakeMemory(),
        reasoner=FakeReasoner(),
    )
    assert local.sync_once()
    new = local.capture("Synthetic experience recorded while local is selected")
    assert local.sync_once()
    restored = Supervisor(
        cloud.ops, cloud.settings, memory=cloud.memory, reasoner=cloud.reasoner
    )
    assert restored.record(original["id"])["delivery"] == "retained"
    assert restored.record(new["id"])["delivery"] == "pending"
    assert restored.sync_once()
    assert set(cloud.memory.records) == {original["id"], new["id"]}


def test_local_supersession_is_respected_before_cloud_delivery(supervisor):
    cloud = supervisor
    old = retain_lesson(cloud)
    local = Supervisor(
        cloud.ops,
        cloud.settings.model_copy(update={"hindsight_profile": "local"}),
        memory=FakeMemory(),
        reasoner=FakeReasoner(),
    )
    assert local.sync_once()
    replacement = local.supersede(old["id"], "Synthetic pickup relocation")
    restored = Supervisor(
        cloud.ops, cloud.settings, memory=cloud.memory, reasoner=cloud.reasoner
    )
    assert restored.record(replacement["id"])["delivery"] == "pending"
    assert (
        restored.evidence(
            cloud.memory.recall("old preference", restored.layout()), restored.layout()
        )
        == []
    )


def test_local_outage_never_falls_back_or_changes_cloud_receipts(supervisor):
    cloud = supervisor
    old = retain_lesson(cloud)
    receipt = copy.deepcopy(cloud.record(old["id"])["deliveries"][cloud.destination])
    broken = FakeMemory()
    broken.fail = True
    local = Supervisor(
        cloud.ops,
        cloud.settings.model_copy(update={"hindsight_profile": "local"}),
        memory=broken,
        reasoner=FakeReasoner(),
    )
    assert not local.sync_once()
    with pytest.raises(ServiceUnavailable):
        local.advice()
    assert local.record(old["id"])["deliveries"][cloud.destination] == receipt
    assert len(cloud.memory.records) == 1
    assert local.record(old["id"])["delivery"] == "pending"


def test_new_local_endpoint_has_its_own_delivery_status(supervisor):
    old = retain_lesson(supervisor)
    settings = supervisor.settings.model_copy(update={"hindsight_profile": "local"})
    first = Supervisor(
        supervisor.ops, settings, memory=FakeMemory(), reasoner=FakeReasoner()
    )
    assert first.sync_once()
    moved_settings = settings.model_copy(
        update={"hindsight_local_base_url": "http://127.0.0.1:8889"}
    )
    moved = Supervisor(
        supervisor.ops, moved_settings, memory=FakeMemory(), reasoner=FakeReasoner()
    )
    assert moved.record(old["id"])["delivery"] == "pending"
    assert (
        moved.record(old["id"])["deliveries"][destination(settings)]["delivery"]
        == "retained"
    )


def test_busy_backend_port_cannot_migrate_profile_state(tmp_path):
    backend = Path(__file__).resolve().parents[1]
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        port = listener.getsockname()[1]
        env = {
            **os.environ,
            "API_HOST": "127.0.0.1",
            "API_PORT": str(port),
            "DATA_DIR": str(tmp_path / "data"),
            "LOG_DIR": str(tmp_path / "logs"),
            "AGENT_API_KEY": "",
            "HINDSIGHT_API_KEY": "",
        }
        result = subprocess.run(
            [sys.executable, "-m", "app", "--memory", "local"],
            cwd=backend,
            env=env,
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    assert result.returncode == 1
    assert "already in use" in result.stdout + result.stderr
    assert not (tmp_path / "data/app.db").exists()


def test_local_replay_is_paced_without_holding_operations(supervisor, monkeypatch):
    clock = [100.0]
    monkeypatch.setattr("app.supervisor.time.monotonic", lambda: clock[0])
    local = Supervisor(
        supervisor.ops,
        supervisor.settings.model_copy(
            update={
                "hindsight_profile": "local",
                "hindsight_local_retain_interval_seconds": 30,
            }
        ),
        memory=FakeMemory(),
        reasoner=FakeReasoner(),
    )
    first = local.capture("First synthetic report")
    second = local.capture("Second synthetic report")
    assert local.sync_once()
    assert not local.sync_once()
    assert local.record(second["id"])["attempts"] == 0
    # Operational changes remain available while the network delivery is paced.
    local.ops.add_party("Synthetic arrival during replay", 2)
    clock[0] += 30
    assert local.sync_once()
    assert set(local.memory.records) == {first["id"], second["id"]}
