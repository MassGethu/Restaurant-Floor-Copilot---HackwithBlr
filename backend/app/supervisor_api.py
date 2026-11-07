"""Validated supervisor HTTP boundary. Never accepts arbitrary model tool arguments."""

from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix="/api/supervisor", tags=["shift supervisor"])


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ShiftInput(Input):
    label: str = Field(min_length=1, max_length=80)


class ContextInput(Input):
    delivery_activity: Literal["unknown", "normal", "rush"] = "unknown"
    staffing: str = Field(default="", max_length=240)
    note: str = Field(default="", max_length=500)


class ExperienceInput(Input):
    note: str = Field(min_length=1, max_length=2000)
    party_id: str | None = None
    table_id: str | None = None
    baseline_table_id: str | None = None
    request_id: str | None = Field(default=None, max_length=100)


class FeedbackInput(Input):
    outcome: Literal["helped", "did_not_help", "unknown"]
    note: str = Field(default="", max_length=1000)


class NoteInput(Input):
    note: str = Field(min_length=1, max_length=2000)


class AdviceInput(Input):
    question: str = Field(
        default="What should we do next?", min_length=1, max_length=500
    )
    compare: bool = False


class ApprovalInput(Input):
    candidate_id: str = Field(min_length=1, max_length=200)
    accepted: bool


def service(request):
    app = request.app.state
    app.supervisor.refresh()
    return app.supervisor


@router.get("")
def snapshot(request: Request):
    return service(request).snapshot()


@router.post("/shifts", status_code=201)
def shift(body: ShiftInput, request: Request):
    return service(request).start_shift(body.label)


@router.put("/context")
def context(body: ContextInput, request: Request):
    supervisor = service(request)
    supervisor.set_context(body.model_dump())
    return supervisor.snapshot()


@router.post("/experiences", status_code=201)
def experience(body: ExperienceInput, request: Request):
    return service(request).capture(**body.model_dump())


@router.post("/experiences/{record_id}/feedback", status_code=201)
def feedback(record_id: str, body: FeedbackInput, request: Request):
    return service(request).feedback(record_id, **body.model_dump())


@router.post("/experiences/{record_id}/supersede", status_code=201)
def supersede(record_id: str, body: NoteInput, request: Request):
    return service(request).supersede(record_id, body.note)


@router.post("/experiences/{record_id}/retry")
def retry(record_id: str, request: Request):
    supervisor = service(request)
    supervisor.retry(record_id)
    return supervisor.snapshot()


@router.post("/advice")
def advice(body: AdviceInput, request: Request):
    return service(request).advice(**body.model_dump())


@router.post("/advice/{advice_id}/decision", status_code=201)
def decision(advice_id: str, body: ApprovalInput, request: Request):
    return service(request).approve(advice_id, **body.model_dump())


@router.post("/handover")
def handover(request: Request):
    return service(request).handover()


@router.get("/handover")
def current_work(request: Request):
    return service(request).current_work()
