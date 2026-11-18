"""Staff workflow endpoints. Inputs are validated before operational transitions."""

import os
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.config_store import default_occupancy
from app.schemas import TableConfig
from app.settings import BACKEND_DIR

router = APIRouter(prefix="/api/copilot", tags=["floor copilot"])


class PartyInput(BaseModel):
    name: str = Field(default="", max_length=60)
    size: int = Field(ge=1, le=20)
    request_id: str | None = Field(default=None, min_length=1, max_length=100)
    session_id: str | None = Field(default=None, max_length=100)


class SeatInput(BaseModel):
    party_id: str
    table_id: str
    version: int
    override: bool = False
    decision_key: str | None = Field(default=None, min_length=64, max_length=64)
    # Seat a party one or two over the table's seats with extra chairs.
    extra_chairs: int = Field(default=0, ge=0, le=2)
    # The manager checked the space in person: remember the answer.
    room_checked: bool = False


class ExtraChairsDecline(BaseModel):
    party_id: str
    table_id: str
    version: int
    extra_chairs: int = Field(ge=1, le=2)
    # True: the manager checked and there is no room; remember it.
    # False: just not tonight; nothing is remembered.
    remember: bool = False


class TableAction(BaseModel):
    action: Literal[
        "clean",
        "depart",
        "still_seated",
        "hold_occupied",
        "hold_ready",
        "release",
        "block",
        "unblock",
    ]
    table_key: str | None = Field(default=None, min_length=64, max_length=64)


class ServiceModeInput(BaseModel):
    mode: Literal["camera", "staff"]


class PlayInput(BaseModel):
    video_id: str


class PauseInput(BaseModel):
    paused: bool


class AssumptionsInput(BaseModel):
    dining_min: int = Field(ge=1, le=240)
    dining_max: int = Field(ge=1, le=240)
    cleaning_min: int = Field(ge=1, le=60)
    cleaning_max: int = Field(ge=1, le=60)


class ServiceInput(BaseModel):
    note: str = Field(default="Staff requested assistance.", max_length=240)


class TaskInput(BaseModel):
    action: Literal[
        "assign",
        "acknowledge",
        "start",
        "complete",
        "cancel",
        "priority_high",
        "priority_normal",
        "report_problem",
        "resolve_problem",
    ]
    staff_id: str | None = None
    assignment_revision: int | None = Field(default=None, ge=0)
    assigned_staff_id: str | None = None
    note: str = Field(default="", max_length=240)


class StaffAvailabilityInput(BaseModel):
    available: bool


class StaffInput(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    role: Literal["waiter", "cleaner", "host"]


class ArrivalInput(BaseModel):
    action: Literal["register", "dismiss"]
    name: str = Field(default="", max_length=60)
    size: int = Field(default=1, ge=1, le=20)


class PolicyInput(BaseModel):
    strategy: Literal["fairness", "balanced", "throughput"]
    max_wait_minutes: int = Field(default=15, ge=1, le=240)
    check_in_minutes: int = Field(default=10, ge=1, le=120)


class SimulationInput(BaseModel):
    party_id: str
    table_id: str
    delay_minutes: int = Field(default=0, ge=0, le=120)
    horizon_minutes: int = Field(default=120, ge=1, le=240)


class AutomationInput(BaseModel):
    acknowledgement_timeout_seconds: int | None = Field(default=None, ge=10, le=600)
    enabled: bool | None = None
    paused: bool | None = None
    departure_seconds: int | None = Field(default=None, ge=5, le=120)
    task_timeout_seconds: int | None = Field(default=None, ge=30, le=1800)
    seating_timeout_seconds: int | None = Field(default=None, ge=30, le=600)
    max_tasks_per_staff: int | None = Field(default=None, ge=1, le=10)


class ExceptionInput(BaseModel):
    action: Literal["acknowledge", "retry"]
    note: str = Field(default="", max_length=240)


@router.post("/automation")
def automation(body: AutomationInput, request: Request):
    request.app.state.autonomy.configure(body.model_dump(exclude_none=True))
    return snapshot(request)


@router.post("/exceptions/{exception_id}")
def exception_action(exception_id: str, body: ExceptionInput, request: Request):
    request.app.state.autonomy.intervene(exception_id, body.action, body.note)
    return snapshot(request)


@router.get("/network")
def network_address():
    import socket
    address = None
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("10.255.255.255", 1))
            address = sock.getsockname()[0]
    except OSError:
        pass
    return {"lan_address": address}


@router.get("/check-in")
def check_in_status(request: Request):
    """Guest display: deliberately excludes names, staff, memory, and manager state."""
    app = request.app.state
    with app.operations.lock:
        state = app.operations.state
        return dict(session_id=state["session_id"], accepting=bool(state["tables"]),
                    waiting=sum(p["status"] == "waiting" for p in state["parties"]),
                    max_party_size=20)


@router.post("/check-in", status_code=201)
def check_in(body: PartyInput, request: Request):
    if not body.request_id or not body.session_id:
        raise HTTPException(422, "A check-in request and current session are required.")
    party = request.app.state.operations.add_party(body.name, body.size,
                request_id=body.request_id, session_id=body.session_id)
    return dict(party_id=party["id"], name=party["name"], size=party["size"], status=party["status"])


@router.get("/check-in/{request_id}")
def check_in_ticket(request_id: str, request: Request):
    app = request.app.state
    with app.operations.lock:
        app.operations.advance_clock()
        party = next((p for p in app.operations.state["parties"] if p.get("request_id") == request_id), None)
        if party is None:
            raise HTTPException(404, "Check-in not found for this service.")
        table = next((t for t in app.operations.state["tables"] if t["id"] == party["table_id"]), None)
        return dict(party_id=party["id"], name=party["name"], size=party["size"], status=party["status"],
                    table_name=table["name"] if table else None,
                    arrival_confirmed=party.get("arrival_confirmed", False),
                    waiting_seconds=max(0, app.operations.state["now"] - party["arrived_at"]))


@router.get("")
def snapshot(request: Request):
    app = request.app.state
    playback = app.pipeline.refresh_operations()
    state = app.operations.snapshot()
    supervisor = getattr(app, "supervisor", None)
    for option in state["extra_chair_options"]:
        option["memory"] = (
            supervisor.chair_status(option["table_id"])
            if supervisor
            else {"status": "none"}
        )
    return dict(**state, playback=playback)


@router.post("/play")
def play(body: PlayInput, request: Request):
    app = request.app.state
    with app.operations.lock:
        app.operations.validate_session_change(body.video_id, reset=True)
    path = app.library.path(body.video_id)
    if path is None:
        raise HTTPException(404, "Video not found.")
    info = app.library.get(body.video_id)
    config = app.store.load(body.video_id)
    if config is None:
        config = TableConfig(
            video_id=body.video_id,
            source=os.path.relpath(path, BACKEND_DIR),
            frame_width=info["width"] or 640,
            frame_height=info["height"] or 360,
            tables=[],
            occupancy=default_occupancy(app.pipeline.settings),
        )
        app.store.save(config)
    app.pipeline.activate(
        body.video_id, source_override=str(path), reset_operations=True
    )
    app.streams.stop()
    return snapshot(request)


@router.post("/pause")
def pause(body: PauseInput, request: Request):
    try:
        request.app.state.pipeline.pause(body.paused)
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    return snapshot(request)


@router.post("/service-mode")
def service_mode(body: ServiceModeInput, request: Request):
    snapshot(request)
    request.app.state.operations.set_staff_mode(body.mode == "staff")
    return snapshot(request)


@router.post("/reconnect")
def reconnect(request: Request):
    app = request.app.state
    try:
        app.pipeline.reconnect(app.operations.state["video_id"])
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    return snapshot(request)


@router.post("/parties", status_code=201)
def add_party(body: PartyInput, request: Request):
    request.app.state.operations.add_party(
        body.name, body.size, request_id=body.request_id, session_id=body.session_id
    )
    return snapshot(request)


@router.post("/assumptions")
def assumptions(body: AssumptionsInput, request: Request):
    request.app.state.operations.set_assumptions(body.model_dump())
    return snapshot(request)


@router.delete("/parties/{party_id}")
def cancel_party(party_id: str, request: Request):
    request.app.state.operations.cancel(party_id)
    return snapshot(request)


@router.post("/seat")
def seat(body: SeatInput, request: Request):
    # Refresh inference health before validating an approval.
    snapshot(request)
    app = request.app.state
    with app.operations.lock:
        baseline = next((r["table_id"] for r in app.operations.recommendations() if r["party_id"] == body.party_id), None)
        app.operations.seat(
            body.party_id, body.table_id, body.version, override=body.override,
            decision_key=body.decision_key, extra_chairs=body.extra_chairs,
            dispatch=bool(app.autonomy.worker and app.autonomy.worker.is_alive()),
        )
        if body.override and baseline and baseline != body.table_id:
            app.supervisor.capture(
                "Manager intervened in seating and selected a different eligible table. This records a preference, not a successful outcome.",
                party_id=body.party_id, table_id=body.table_id, baseline_table_id=baseline)
    if body.extra_chairs and body.room_checked:
        request.app.state.supervisor.record_space(
            body.table_id, body.extra_chairs, room=True
        )
    return snapshot(request)


@router.post("/extra-chairs/decline")
def decline_extra_chairs(body: ExtraChairsDecline, request: Request):
    snapshot(request)
    request.app.state.operations.decline_extra_chairs(
        body.party_id, body.table_id, body.extra_chairs, body.version
    )
    if body.remember:
        request.app.state.supervisor.record_space(
            body.table_id, body.extra_chairs, room=False
        )
    return snapshot(request)


@router.post("/decline")
def decline(body: SeatInput, request: Request):
    snapshot(request)
    request.app.state.operations.decline(
        body.party_id, body.table_id, body.version, decision_key=body.decision_key
    )
    return snapshot(request)


@router.post("/tables/{table_id}")
def table_action(table_id: str, body: TableAction, request: Request):
    snapshot(request)
    request.app.state.operations.action(table_id, body.action, table_key=body.table_key)
    return snapshot(request)


@router.post("/tables/{table_id}/service")
def request_service(table_id: str, body: ServiceInput, request: Request):
    request.app.state.operations.request_service(table_id, body.note)
    return snapshot(request)


@router.post("/tasks/{task_id}")
def task_action(task_id: str, body: TaskInput, request: Request):
    snapshot(request)
    request.app.state.operations.update_task(task_id, body.action, body.staff_id, body.note, body.assignment_revision, body.assigned_staff_id)
    return snapshot(request)


@router.post("/staff/{staff_id}/availability")
def staff_availability(staff_id: str, body: StaffAvailabilityInput, request: Request):
    request.app.state.operations.set_staff_availability(staff_id, body.available)
    request.app.state.autonomy.tick()
    return snapshot(request)


@router.post("/staff", status_code=201)
def staff(body: StaffInput, request: Request):
    request.app.state.operations.add_staff(body.name, body.role)
    return snapshot(request)


@router.post("/arrivals/{arrival_id}")
def arrival(arrival_id: str, body: ArrivalInput, request: Request):
    request.app.state.operations.resolve_arrival(
        arrival_id, body.action, body.name, body.size
    )
    return snapshot(request)


@router.post("/policy")
def policy(body: PolicyInput, request: Request):
    operations = request.app.state.operations
    with operations.lock:
        operations.state["policy"] = body.model_dump()
        operations.event(
            f"Allocation policy set to {body.strategy}; overdue protection {body.max_wait_minutes} min.",
            "staff",
        )
        operations.save()
    return snapshot(request)


@router.post("/simulate")
def simulation(body: SimulationInput, request: Request):
    from app.simulation import simulate

    state = snapshot(request)
    try:
        return dict(
            **simulate(
                state,
                body.party_id,
                body.table_id,
                body.delay_minutes,
                body.horizon_minutes,
            ),
            state_version=state["version"],
        )
    except ValueError as error:
        raise HTTPException(409, str(error)) from error


@router.get("/export")
def export(request: Request):
    import csv
    import io
    from fastapi.responses import Response

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["party", "size", "status", "arrival_s", "seated_s", "table"])
    for party in snapshot(request)["parties"]:
        # Prefix spreadsheet formula triggers in user-provided text.
        name = party["name"]
        name = "'" + name if name.lstrip().startswith(("=", "+", "-", "@")) else name
        writer.writerow(
            [
                name,
                party["size"],
                party["status"],
                party["arrived_at"],
                party.get("seated_at"),
                party["table_id"],
            ]
        )
    return Response(
        output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="floor-parties.csv"'},
    )
