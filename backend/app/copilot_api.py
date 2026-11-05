"""Staff workflow endpoints. Inputs are validated before operational transitions."""
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.config_store import default_occupancy
from app.schemas import TableConfig

router = APIRouter(prefix='/api/copilot', tags=['floor copilot'])


class PartyInput(BaseModel):
    name: str = Field(default='', max_length=60)
    size: int = Field(ge=1, le=20)


class SeatInput(BaseModel):
    party_id: str
    table_id: str
    version: int
    override: bool = False


class TableAction(BaseModel):
    action: Literal['clean', 'depart', 'hold_occupied', 'hold_ready', 'release']


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
    note: str = Field(default='Staff requested assistance.', max_length=240)


class TaskInput(BaseModel):
    action: Literal['assign','acknowledge','start','complete','cancel']
    staff_id: str | None = None


class StaffInput(BaseModel):
    name: str = Field(min_length=1,max_length=60)
    role: Literal['waiter','cleaner','host']


class ArrivalInput(BaseModel):
    action: Literal['register','dismiss']
    name: str = Field(default='',max_length=60)
    size: int = Field(default=1,ge=1,le=20)


class PolicyInput(BaseModel):
    strategy: Literal['fairness','balanced','throughput']
    max_wait_minutes: int = Field(default=15,ge=1,le=240)
    check_in_minutes: int = Field(default=10,ge=1,le=120)


class SimulationInput(BaseModel):
    party_id: str
    table_id: str
    delay_minutes: int = Field(default=0,ge=0,le=120)
    horizon_minutes: int = Field(default=120,ge=1,le=240)


@router.get('')
def snapshot(request: Request):
    app = request.app.state
    playback = app.pipeline.playback()
    app.operations.fresh = playback['inference_fresh']
    state = app.operations.snapshot(playback['source_status'], playback['model_state'])
    return dict(**state, playback=playback)


@router.post('/play')
def play(body: PlayInput, request: Request):
    app = request.app.state
    path = app.library.path(body.video_id)
    if path is None:
        raise HTTPException(404, 'Video not found.')
    info = app.library.get(body.video_id)
    config = app.store.load(body.video_id)
    if config is None:
        config = TableConfig(video_id=body.video_id, source=str(path),
                             frame_width=info['width'] or 640, frame_height=info['height'] or 360,
                             tables=[], occupancy=default_occupancy(app.pipeline.settings))
    else:
        config = config.model_copy(update={'source': str(path)})
    app.store.save(config)
    app.streams.stop()
    app.pipeline.activate(body.video_id, source_override=str(path), reset_operations=True)
    return snapshot(request)


@router.post('/pause')
def pause(body: PauseInput, request: Request):
    try:
        request.app.state.pipeline.pause(body.paused)
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    return snapshot(request)


@router.post('/parties', status_code=201)
def add_party(body: PartyInput, request: Request):
    request.app.state.operations.add_party(body.name, body.size)
    return snapshot(request)


@router.post('/assumptions')
def assumptions(body: AssumptionsInput, request: Request):
    request.app.state.operations.set_assumptions(body.model_dump())
    return snapshot(request)


@router.delete('/parties/{party_id}')
def cancel_party(party_id: str, request: Request):
    request.app.state.operations.cancel(party_id)
    return snapshot(request)


@router.post('/seat')
def seat(body: SeatInput, request: Request):
    # Refresh inference health before validating an approval.
    snapshot(request)
    request.app.state.operations.seat(body.party_id, body.table_id, body.version, override=body.override)
    return snapshot(request)


@router.post('/decline')
def decline(body: SeatInput, request: Request):
    snapshot(request)
    request.app.state.operations.decline(body.party_id, body.table_id, body.version)
    return snapshot(request)


@router.post('/tables/{table_id}')
def table_action(table_id: str, body: TableAction, request: Request):
    snapshot(request)
    request.app.state.operations.action(table_id, body.action)
    return snapshot(request)


@router.post('/tables/{table_id}/service')
def request_service(table_id: str,body:ServiceInput,request:Request):
    request.app.state.operations.request_service(table_id,body.note)
    return snapshot(request)


@router.post('/tasks/{task_id}')
def task_action(task_id:str,body:TaskInput,request:Request):
    snapshot(request)
    request.app.state.operations.update_task(task_id,body.action,body.staff_id)
    return snapshot(request)


@router.post('/staff',status_code=201)
def staff(body:StaffInput,request:Request):
    request.app.state.operations.add_staff(body.name,body.role)
    return snapshot(request)


@router.post('/arrivals/{arrival_id}')
def arrival(arrival_id:str,body:ArrivalInput,request:Request):
    request.app.state.operations.resolve_arrival(arrival_id,body.action,body.name,body.size)
    return snapshot(request)


@router.post('/policy')
def policy(body:PolicyInput,request:Request):
    operations=request.app.state.operations
    with operations.lock:
        operations.state['policy']=body.model_dump()
        operations.event(f"Allocation policy set to {body.strategy}; overdue protection {body.max_wait_minutes} min.",'staff')
        operations.save()
    return snapshot(request)


@router.post('/simulate')
def simulation(body:SimulationInput,request:Request):
    from app.simulation import simulate
    state=snapshot(request)
    try:
        return dict(**simulate(state,body.party_id,body.table_id,body.delay_minutes,body.horizon_minutes),state_version=state['version'])
    except ValueError as error:raise HTTPException(409,str(error)) from error


@router.get('/export')
def export(request:Request):
    import csv
    import io
    from fastapi.responses import Response
    output=io.StringIO();writer=csv.writer(output)
    writer.writerow(['party','size','status','arrival_s','seated_s','table'])
    for party in snapshot(request)['parties']:
        # Prefix spreadsheet formula triggers in user-provided text.
        name=party['name'];name="'"+name if name.lstrip().startswith(('=','+','-','@')) else name
        writer.writerow([name,party['size'],party['status'],party['arrived_at'],party.get('seated_at'),party['table_id']])
    return Response(output.getvalue(),media_type='text/csv',headers={'Content-Disposition':'attachment; filename="floor-parties.csv"'})
