from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any


class ConfigError(Exception):
    """Raised when config.json cannot be loaded or validated."""


DEFAULT_CONFIG: dict[str, Any] = {
    "source_type": "webcam",
    "camera_type": "webcam",
    "camera_index": 0,
    "camera_url": "",
    "video_file": "",
    "phone_server_host": "0.0.0.0",
    "phone_server_port": 8766,
    "computer_server_host": "127.0.0.1",
    "computer_server_port": 8765,
    "phone_https_enabled": True,
    "confidence": 0.30,
    "iou": 0.70,
    "max_det": 80,
    "debug": True,
    "debug_log_every_frames": 15,
    "auto_start": True,
    "line_a": [],
    "line_b": [],
    "roi": [],
    "track_ttl_frames": 70,
    "entry_direction": "LEFT_TO_RIGHT",
    "report_timezone": "America/Guayaquil",
    "time_bucket_minutes": 60,
    "live_rate_window_minutes": 5,
    "group_window_seconds": 2.0,
    "fallback_tracker_max_distance": 160.0,
    "fallback_tracker_max_missing": 45,
    "frame_width": 1280,
    "frame_height": 720,
    "target_fps": 15,
    "yolo_model": "yolov8s.pt",
    "imgsz": 960,
    "tracker_config": "config/bytetrack-groups.yaml",
    "google_sheets_enabled": False,
    "apps_script_url": "",
    "camera_name": "CAMARA_01",
}


SOURCE_TYPES = {"webcam", "ip_camera", "video_file", "phone_browser"}
ENTRY_DIRECTIONS = {"LEFT_TO_RIGHT", "RIGHT_TO_LEFT"}


def load_config(path: Path | str = "config.json") -> dict[str, Any]:
    path = Path(path)
    if not path.exists():
        config = deepcopy(DEFAULT_CONFIG)
        save_config(config, path)
        return config

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ConfigError(f"JSON invalido en {path}: {exc}") from exc
    except OSError as exc:
        raise ConfigError(f"No se pudo leer {path}: {exc}") from exc

    if not isinstance(raw, dict):
        raise ConfigError("La configuracion debe ser un objeto JSON.")

    config = deepcopy(DEFAULT_CONFIG)
    config.update(raw)
    _normalize_legacy_fields(config)
    validate_config(config)
    return config


def save_config(config: dict[str, Any], path: Path | str = "config.json") -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def validate_config(config: dict[str, Any]) -> None:
    source_type = config.get("source_type")
    if source_type not in SOURCE_TYPES:
        raise ConfigError(f"source_type debe ser uno de {sorted(SOURCE_TYPES)}.")

    _require_number(config, "confidence", minimum=0.01, maximum=1.0)
    _require_number(config, "iou", minimum=0.01, maximum=1.0)
    _require_int(config, "frame_width", minimum=160)
    _require_int(config, "frame_height", minimum=120)
    _require_int(config, "target_fps", minimum=1)
    _require_int(config, "imgsz", minimum=320)
    _require_int(config, "max_det", minimum=1)
    _require_int(config, "computer_server_port", minimum=1, maximum=65535)
    _require_int(config, "phone_server_port", minimum=1, maximum=65535)
    _require_int(config, "track_ttl_frames", minimum=1)
    _require_int(config, "debug_log_every_frames", minimum=1)
    _require_int(config, "time_bucket_minutes", minimum=1)
    _require_int(config, "live_rate_window_minutes", minimum=1)
    _require_number(config, "group_window_seconds", minimum=0.1)
    _require_number(config, "fallback_tracker_max_distance", minimum=1.0)
    _require_int(config, "fallback_tracker_max_missing", minimum=1)
    if config.get("entry_direction") not in ENTRY_DIRECTIONS:
        raise ConfigError(f"entry_direction debe ser uno de {sorted(ENTRY_DIRECTIONS)}.")

    for key in ("line_a", "line_b"):
        if config.get(key) and not _is_line(config[key]):
            raise ConfigError(f"{key} debe ser [] o [[x1, y1], [x2, y2]].")

    if config.get("roi") and not _is_polygon(config["roi"]):
        raise ConfigError("roi debe ser [] o una lista de puntos [[x, y], ...].")


def _normalize_legacy_fields(config: dict[str, Any]) -> None:
    camera_type = config.get("camera_type")
    if camera_type == "webcam" and "source_type" not in config:
        config["source_type"] = "webcam"
    elif camera_type == "ip_camera" and "source_type" not in config:
        config["source_type"] = "ip_camera"
    config["camera_type"] = config.get("source_type", "webcam")


def _require_number(config: dict[str, Any], key: str, minimum: float, maximum: float | None = None) -> None:
    value = config.get(key)
    if not isinstance(value, (int, float)):
        raise ConfigError(f"{key} debe ser numerico.")
    if value < minimum:
        raise ConfigError(f"{key} debe ser mayor o igual a {minimum}.")
    if maximum is not None and value > maximum:
        raise ConfigError(f"{key} debe ser menor o igual a {maximum}.")


def _require_int(config: dict[str, Any], key: str, minimum: int, maximum: int | None = None) -> None:
    value = config.get(key)
    if not isinstance(value, int):
        raise ConfigError(f"{key} debe ser entero.")
    if value < minimum:
        raise ConfigError(f"{key} debe ser mayor o igual a {minimum}.")
    if maximum is not None and value > maximum:
        raise ConfigError(f"{key} debe ser menor o igual a {maximum}.")


def _is_point(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) == 2
        and all(isinstance(item, (int, float)) for item in value)
    )


def _is_line(value: Any) -> bool:
    return isinstance(value, list) and len(value) == 2 and all(_is_point(point) for point in value)


def _is_polygon(value: Any) -> bool:
    return isinstance(value, list) and len(value) >= 3 and all(_is_point(point) for point in value)
