from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from .geometry import point_in_polygon_with_margin
from .tracker import SimpleCentroidTracker, TrackedPerson


class DetectorError(Exception):
    """Raised when YOLO/Ultralytics cannot run."""


@dataclass
class DetectorStats:
    raw_person_detections: int = 0
    roi_person_detections: int = 0
    active_tracks: int = 0


class PersonDetector:
    def __init__(self, config: dict) -> None:
        configure_ultralytics_environment()
        self.config = config
        self.confidence = float(config.get("confidence", 0.30))
        self.iou = float(config.get("iou", 0.70))
        self.max_det = int(config.get("max_det", 80))
        self.model_name = str(config.get("yolo_model", "yolov8n.pt"))
        self.imgsz = int(config.get("imgsz", 960))
        self.tracker_config = str(config.get("tracker_config", "config/bytetrack-groups.yaml"))
        self.device = self._select_device()
        self.last_stats = DetectorStats()
        self.fallback_tracker = SimpleCentroidTracker(
            max_distance=float(config.get("fallback_tracker_max_distance", 160.0)),
            max_missing=int(config.get("fallback_tracker_max_missing", 45)),
        )

        try:
            from ultralytics import YOLO
        except Exception as exc:
            raise DetectorError(
                "Ultralytics no esta instalado. Ejecuta: pip install -r requirements.txt"
            ) from exc

        try:
            self.model = YOLO(self.model_name)
        except Exception as exc:
            raise DetectorError(f"No se pudo cargar el modelo YOLO {self.model_name}: {exc}") from exc

    def detect(self, frame, roi) -> list[TrackedPerson]:
        try:
            results = self.model.track(
                frame,
                persist=True,
                classes=[0],
                conf=self.confidence,
                iou=self.iou,
                imgsz=self.imgsz,
                max_det=self.max_det,
                tracker=self.tracker_config,
                device=self.device,
                verbose=False,
            )
        except Exception as exc:
            raise DetectorError(f"YOLO fallo durante la deteccion: {exc}") from exc

        if not results:
            return []

        boxes_obj = getattr(results[0], "boxes", None)
        if boxes_obj is None or boxes_obj.xyxy is None:
            return []

        xyxy = boxes_obj.xyxy.cpu().numpy().tolist()
        confidences = boxes_obj.conf.cpu().numpy().tolist() if boxes_obj.conf is not None else [0.0] * len(xyxy)
        ids = boxes_obj.id.cpu().numpy().tolist() if boxes_obj.id is not None else None

        people: list[TrackedPerson] = []
        fallback_detections = []
        self.last_stats = DetectorStats(raw_person_detections=len(xyxy))
        height, width = frame.shape[:2]
        roi_margin = float(self.config.get("counting_roi_margin", 0.10)) * max(width, height)
        for index, box_values in enumerate(xyxy):
            box = tuple(float(value) for value in box_values)
            confidence = float(confidences[index])
            point = ((box[0] + box[2]) / 2.0, box[3])
            if not point_in_polygon_with_margin(point, roi, roi_margin):
                continue
            self.last_stats.roi_person_detections += 1
            if ids is None:
                fallback_detections.append((box, confidence))
            else:
                people.append(TrackedPerson(track_id=int(ids[index]), box=box, confidence=confidence))

        if ids is None:
            people = self.fallback_tracker.update(fallback_detections)
            self.last_stats.active_tracks = len(people)
            return people
        self.last_stats.active_tracks = len(people)
        return people

    @staticmethod
    def _select_device() -> str:
        try:
            import torch

            if torch.cuda.is_available():
                return "cuda:0"
        except Exception:
            pass
        return "cpu"


def configure_ultralytics_environment() -> None:
    config_root = Path("data/ultralytics").resolve()
    config_root.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("YOLO_CONFIG_DIR", str(config_root))
