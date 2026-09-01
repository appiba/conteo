from __future__ import annotations

from dataclasses import dataclass

from .geometry import (
    Line,
    Point,
    line_axis_mid,
    movement_crossed_line,
    normalize_entry_direction,
    normalize_orientation,
)
from .tracker import TrackedPerson


@dataclass
class CounterEvent:
    track_id: int
    kind: str
    message: str
    age_group: str = "SIN_DETERMINAR"
    age_confidence: float = 0.0
    confidence: float = 0.0


@dataclass
class CounterUpdate:
    increment: int
    events: list[CounterEvent]


@dataclass
class TrackMemory:
    phase: str = "NEW"
    first_point: Point | None = None
    previous_point: Point | None = None
    last_seen: int = 0
    counted: bool = False


class EntryCounter:
    def __init__(
        self,
        initial_count: int = 0,
        ttl_frames: int = 45,
        entry_direction: str = "LEFT_TO_RIGHT",
        line_orientation: str = "vertical",
    ) -> None:
        self.total = int(initial_count)
        self.ttl_frames = ttl_frames
        self.line_orientation = normalize_orientation(line_orientation)
        self.entry_direction = normalize_entry_direction(entry_direction, self.line_orientation)
        self._tracks: dict[int, TrackMemory] = {}

    def set_total(self, total: int) -> None:
        self.total = int(total)

    def reset(self, total: int = 0) -> None:
        self.total = int(total)
        self._tracks.clear()

    def update(
        self,
        people: list[TrackedPerson],
        line_a: Line,
        line_b: Line,
        frame_index: int,
        entry_direction: str | None = None,
        line_orientation: str | None = None,
    ) -> CounterUpdate:
        increment = 0
        events: list[CounterEvent] = []
        active_ids = set()
        if line_orientation is not None:
            self.line_orientation = normalize_orientation(line_orientation)
        if entry_direction is not None:
            self.entry_direction = normalize_entry_direction(entry_direction, self.line_orientation)

        for person in people:
            active_ids.add(person.track_id)
            memory = self._tracks.setdefault(person.track_id, TrackMemory())
            current_point = person.bottom_center
            if memory.first_point is None:
                memory.first_point = current_point
            crossings = self._crossings(memory.previous_point, current_point, line_a, line_b)
            memory.last_seen = frame_index

            for crossing in crossings:
                if self._should_count_late_entry(memory, current_point, line_b, crossing):
                    if self._confirm_entry(memory, person, events):
                        increment += 1
                        self.total += 1
                    continue
                counted = self._apply_crossing(memory, person, crossing, events)
                if counted:
                    increment += 1
                    self.total += 1

            if self._should_complete_edge_entry(memory, current_point, line_b):
                if self._confirm_entry(memory, person, events):
                    increment += 1
                    self.total += 1

            memory.previous_point = current_point

        for track_id, memory in list(self._tracks.items()):
            if track_id not in active_ids and frame_index - memory.last_seen > self.ttl_frames:
                del self._tracks[track_id]

        return CounterUpdate(increment=increment, events=events)

    def _crossings(self, previous: Point | None, current: Point, line_a: Line, line_b: Line) -> list[str]:
        crossed = []
        if self._movement_crossed_line(previous, current, line_a):
            crossed.append(("A", line_axis_mid(line_a, self.line_orientation)))
        if self._movement_crossed_line(previous, current, line_b):
            crossed.append(("B", line_axis_mid(line_b, self.line_orientation)))
        if len(crossed) <= 1:
            return [name for name, _axis_mid in crossed]

        axis = 1 if self.line_orientation == "horizontal" else 0
        delta = current[axis] - (previous[axis] if previous else current[axis])
        crossed.sort(key=lambda item: item[1], reverse=delta < 0)
        return [name for name, _axis_mid in crossed]

    def _movement_crossed_line(self, previous: Point | None, current: Point, line: Line) -> bool:
        other_axis = 0 if self.line_orientation == "horizontal" else 1
        line_span = abs(line[0][other_axis] - line[1][other_axis])
        line_margin = max(8.0, line_span * 0.12)
        return movement_crossed_line(previous, current, line, self.line_orientation, line_margin=line_margin)

    def _apply_crossing(
        self,
        memory: TrackMemory,
        person: TrackedPerson,
        crossing: str,
        events: list[CounterEvent],
    ) -> bool:
        track_id = person.track_id
        if memory.counted:
            return False

        crossing_phase = f"CROSSED_{crossing}"

        if memory.phase in ("COUNTED", "EXITED"):
            return False

        if memory.phase == "NEW":
            memory.phase = crossing_phase
            events.append(
                CounterEvent(
                    track_id=track_id,
                    kind=f"crossed_{crossing.lower()}",
                    message=f"ID {track_id}: {crossing} DETECTADA",
                    age_group=person.age_group,
                    age_confidence=person.age_confidence,
                    confidence=person.confidence,
                )
            )
            return False

        if memory.phase == crossing_phase:
            memory.phase = "NEW"
            events.append(
                CounterEvent(
                    track_id=track_id,
                    kind="backed_out",
                    message=f"ID {track_id}: regreso antes de completar cruce",
                    age_group=person.age_group,
                    age_confidence=person.age_confidence,
                    confidence=person.confidence,
                )
            )
            return False

        if memory.phase == "CROSSED_A" and crossing == "B":
            return self._confirm_entry(memory, person, events)

        if memory.phase == "CROSSED_B" and crossing == "A":
            memory.phase = "EXITED"
            events.append(
                CounterEvent(
                    track_id=track_id,
                    kind="exit",
                    message=f"ID {track_id}: salida detectada",
                    age_group=person.age_group,
                    age_confidence=person.age_confidence,
                    confidence=person.confidence,
                )
            )
            return False

        return False

    def _should_count_late_entry(
        self,
        memory: TrackMemory,
        current: Point,
        line_b: Line,
        crossing: str,
    ) -> bool:
        if memory.counted or memory.phase != "NEW" or crossing != "B":
            return False
        if memory.previous_point is None or memory.first_point is None:
            return False
        return (
            self._crossed_destination_axis(memory.previous_point, current, line_b)
            and self._point_before_destination(memory.first_point, line_b)
        )

    def _should_complete_edge_entry(self, memory: TrackMemory, current: Point, line_b: Line) -> bool:
        if memory.counted or memory.phase != "CROSSED_A" or memory.previous_point is None:
            return False
        if not self._moving_in_entry_direction(memory.previous_point, current):
            return False
        return self._crossed_destination_axis(memory.previous_point, current, line_b) or self._passed_destination(
            current,
            line_b,
            tolerance=0.0,
        )

    def _confirm_entry(self, memory: TrackMemory, person: TrackedPerson, events: list[CounterEvent]) -> bool:
        if memory.counted:
            return False
        memory.phase = "COUNTED"
        memory.counted = True
        events.append(
            CounterEvent(
                track_id=person.track_id,
                kind="entry",
                message=f"ID {person.track_id}: ENTRADA CONFIRMADA",
                age_group=person.age_group,
                age_confidence=person.age_confidence,
                confidence=person.confidence,
            )
        )
        return True

    def _crossed_destination_axis(self, previous: Point, current: Point, line_b: Line) -> bool:
        if not self._moving_in_entry_direction(previous, current):
            return False
        gate = line_axis_mid(line_b, self.line_orientation)
        previous_axis = self._axis_value(previous)
        current_axis = self._axis_value(current)
        return (previous_axis < gate <= current_axis) or (previous_axis > gate >= current_axis)

    def _moving_in_entry_direction(self, previous: Point, current: Point) -> bool:
        return (self._axis_value(current) - self._axis_value(previous)) * self._entry_sign() > 1e-6

    def _point_before_destination(self, point: Point, line_b: Line) -> bool:
        return (self._axis_value(point) - line_axis_mid(line_b, self.line_orientation)) * self._entry_sign() < 0

    def _passed_destination(self, point: Point, line_b: Line, tolerance: float = 0.0) -> bool:
        gate = line_axis_mid(line_b, self.line_orientation)
        axis = self._axis_value(point)
        other_axis = 0 if self.line_orientation == "horizontal" else 1
        line_size = abs(line_b[0][other_axis] - line_b[1][other_axis]) or 1.0
        return (axis - gate) * self._entry_sign() >= -(line_size * tolerance)

    def _axis_value(self, point: Point) -> float:
        return point[1] if self.line_orientation == "horizontal" else point[0]

    def _entry_sign(self) -> int:
        if self.line_orientation == "horizontal":
            return -1 if self.entry_direction == "BOTTOM_TO_TOP" else 1
        return -1 if self.entry_direction == "RIGHT_TO_LEFT" else 1
