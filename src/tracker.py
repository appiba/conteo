from __future__ import annotations

from dataclasses import dataclass
from math import hypot

from .geometry import Point, bottom_center


@dataclass(frozen=True)
class TrackedPerson:
    track_id: int
    box: tuple[float, float, float, float]
    confidence: float = 0.0
    age_group: str = "SIN_DETERMINAR"
    age_confidence: float = 0.0

    @property
    def bottom_center(self) -> Point:
        return bottom_center(self.box)


class SimpleCentroidTracker:
    """Small fallback tracker for detections without YOLO track ids."""

    def __init__(self, max_distance: float = 160.0, max_missing: int = 45) -> None:
        self.max_distance = max_distance
        self.max_missing = max_missing
        self._next_id = 1
        self._tracks: dict[int, dict] = {}

    def update(self, detections: list[tuple[tuple[float, float, float, float], float]]) -> list[TrackedPerson]:
        points = [bottom_center(box) for box, _confidence in detections]
        matched_track_ids: set[int] = set()
        matched_detection_ids: set[int] = set()
        candidates: list[tuple[float, int, int]] = []

        for track_id, track in self._tracks.items():
            for index, point in enumerate(points):
                distance = hypot(track["point"][0] - point[0], track["point"][1] - point[1])
                overlap = _box_iou(track["box"], detections[index][0])
                adaptive_distance = max(self.max_distance, _box_diagonal(track["box"]) * 0.45)
                if distance <= adaptive_distance or overlap >= 0.08:
                    score = overlap * 1000.0 - distance
                    candidates.append((score, track_id, index))

        candidates.sort(reverse=True)
        for _score, track_id, index in candidates:
            if track_id in matched_track_ids or index in matched_detection_ids:
                continue
            box, confidence = detections[index]
            self._tracks[track_id] = {
                "point": points[index],
                "box": box,
                "confidence": confidence,
                "missing": 0,
            }
            matched_track_ids.add(track_id)
            matched_detection_ids.add(index)

        for track_id, track in list(self._tracks.items()):
            if track_id not in matched_track_ids:
                track["missing"] += 1
                if track["missing"] > self.max_missing:
                    del self._tracks[track_id]

        for index in range(len(detections)):
            if index in matched_detection_ids:
                continue
            box, confidence = detections[index]
            self._tracks[self._next_id] = {
                "point": points[index],
                "box": box,
                "confidence": confidence,
                "missing": 0,
            }
            matched_track_ids.add(self._next_id)
            self._next_id += 1

        people = []
        for track_id in sorted(matched_track_ids):
            track = self._tracks.get(track_id)
            if track is None:
                continue
            people.append(TrackedPerson(track_id=track_id, box=track["box"], confidence=track["confidence"]))
        return people


def _box_iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    intersection = inter_w * inter_h
    if intersection <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - intersection
    return 0.0 if union <= 0 else intersection / union


def _box_diagonal(box: tuple[float, float, float, float]) -> float:
    x1, y1, x2, y2 = box
    return hypot(x2 - x1, y2 - y1)
