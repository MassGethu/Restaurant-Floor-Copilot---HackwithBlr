"""Application settings.

Every value comes from the environment or from the .env files in backend/:
.env.example provides the defaults and .env (if present) overrides them, so no
path, URL or port is hardcoded in the code. Relative paths are resolved from
the backend/ folder, whatever the current working directory is.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Typed view of backend/.env (see .env.example for what each value means)."""

    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env.example", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # API server
    api_host: str
    api_port: int = Field(ge=1, le=65535)
    cors_origins: str
    log_level: str
    log_dir: Path
    log_rotation_mb: int = Field(gt=0)
    log_retention_files: int = Field(ge=1)

    # Hindsight edition: secrets never leave the backend.
    restaurant_id: str = Field(default="demo-restaurant", pattern=r"^[a-z0-9-]{1,60}$")
    hindsight_base_url: str = ""
    hindsight_api_key: str = ""
    hindsight_profile: Literal["cloud", "local"] = "cloud"
    hindsight_local_base_url: str = "http://127.0.0.1:8888"
    hindsight_local_api_key: str = ""
    hindsight_local_timeout_seconds: float = Field(default=180, ge=1, le=600)
    hindsight_local_llm_model: str = "openai/gpt-oss-20b"
    hindsight_local_reflect_llm_model: str = "openai/gpt-oss-120b"
    hindsight_local_handover_mode: Literal["sources", "reflect"] = "sources"
    hindsight_local_retain_interval_seconds: float = Field(default=30, ge=0, le=300)
    agent_api_key: str = ""
    agent_base_url: str = "https://api.groq.com"
    agent_model: str = "openai/gpt-oss-120b"
    supervisor_proactive: bool = True
    memory_timeout_seconds: float = Field(default=30, ge=1, le=120)

    @property
    def memory_base_url(self) -> str:
        return (
            self.hindsight_local_base_url
            if self.hindsight_profile == "local"
            else self.hindsight_base_url
        )

    @property
    def memory_api_key(self) -> str:
        # Never forward the Cloud bearer token to the local server.
        return (
            self.hindsight_local_api_key
            if self.hindsight_profile == "local"
            else self.hindsight_api_key
        )

    @property
    def memory_request_timeout(self) -> float:
        return (
            self.hindsight_local_timeout_seconds
            if self.hindsight_profile == "local"
            else self.memory_timeout_seconds
        )

    @property
    def memory_handover_mode(self) -> Literal["sources", "reflect"]:
        return (
            self.hindsight_local_handover_mode
            if self.hindsight_profile == "local"
            else "reflect"
        )

    # External tools
    ffmpeg_path: str
    ffprobe_path: str
    mediamtx_path: str
    mediamtx_config: Path
    manage_mediamtx: bool

    # Fake CCTV camera
    fake_camera_rtsp_url: str

    # Storage
    videos_dir: Path
    configs_dir: Path
    data_dir: Path
    max_upload_mb: int = Field(gt=0)

    # Detection
    yolo_model: str
    models_dir: Path
    device: str
    yolo_img_size: int = Field(ge=32)
    confidence_threshold: float = Field(ge=0, le=1)
    detect_every_n_frames: int = Field(ge=1)

    # Live pipeline
    default_video_id: str
    stream_jpeg_quality: int = Field(ge=1, le=100)

    # Occupancy defaults for new table configs
    enter_seconds: float = Field(ge=0)
    leave_seconds: float = Field(ge=0)
    reference_point: Literal["bottom_center", "center"]

    # Video source
    source_reconnect_seconds: float = Field(gt=0)
    source_open_timeout_seconds: float = Field(gt=0)
    source_read_timeout_seconds: float = Field(gt=0)
    loop_video_files: bool
    source_outage_seconds: float = Field(gt=0)

    @field_validator(
        "log_dir",
        "mediamtx_config",
        "videos_dir",
        "configs_dir",
        "data_dir",
        "models_dir",
    )
    @classmethod
    def _resolve_from_backend_dir(cls, value: Path) -> Path:
        return (BACKEND_DIR / value).resolve()

    @property
    def yolo_model_path(self) -> Path:
        """YOLO_MODEL as a path: a bare file name lives in MODELS_DIR."""
        model = Path(self.yolo_model)
        if model.parent == Path("."):
            return self.models_dir / model
        return (BACKEND_DIR / model).resolve()

    @property
    def cors_origin_list(self) -> list[str]:
        """CORS_ORIGINS split into a list."""
        return [
            origin.strip() for origin in self.cors_origins.split(",") if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    """Load the settings once and reuse them."""
    return Settings()  # type: ignore[call-arg]  # values come from the .env files
