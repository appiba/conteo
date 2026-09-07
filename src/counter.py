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


COUNT_MODES = {"ENTRY_ONLY", "EXIT_ONLY", "BIDIRECTIONAL"}


@dataclass
class CounterEvent:
    track_id: int
    kind: str
    message: str
    age_group: str = "SIN_DETERMINAR"
    age_confidence: float = 0.0
    confidence: float = 0.0
    direction: str = "ENTRY"
    counted: bool = False


@dataclass
class CounterUpdate:
    increment: int
    events: list[CounterEvent]
    entry_increment: int = 0
    exit_increment: int = 0


@dataclass
class TrackMemory:
    phase: str = "NEW"
    first_point: Point | None = None
    previous_point: Point | None = None
    last_seen: int = 0
    counted: bool = False
    crossed_a: bool = False
    crossed_b: bool = False
    candidate_direction: str | None = None
    last_counted_event: str | None = None
    origin_status: str = "UNCERTAIN"
    origin_valid: bool = False
    entry_origin_valid: bool = False
    exit_origin_valid: bool = False
    ignored_entry: bool = False


class EntryCounter:
    def __init__(
        self,
        initial_count: int = 0,
        ttl_frames: int = 45,
        entry_direction: str = "LEFT_TO_RIGHT",
        line_orientation: str = "vertical",
        count_mode: str = "ENTRY_ONLY",
    ) -> None:
        self.total = int(initial_count)
        self.ttl_frames = ttl_frames
        self.line_orientation = normalize_orientation(line_orientation)
        self.entry_direction = normalize_entry_direction(entry_direction, self.line_orientation)
        self.count_mode = normalize_count_mode(count_mode)
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
        count_mode: str | None = None,
    ) -> CounterUpdate:
        entry_increment = 0
        exit_increment = 0
        events: list[CounterEvent] = []
        active_ids = set()
        if line_orientation is not None:
            self.line_orientation = normalize_orientation(line_orientation)
        if entry_direction is not None:
            self.entry_direction = normalize_entry_direction(entry_direction, self.line_orientation)
        if count_mode is not None:
            self.count_mode = normalize_count_mode(count_mode)

        for person in people:
            active_ids.add(person.track_id)
            memory = self._tracks.setdefault(person.track_id, TrackMemory())
            current_point = person.bottom_center
            if memory.first_point is None:
                memory.first_point = current_point
                memory.origin_status = self._classify_origin(current_point, line_a, line_b)
                memory.origin_valid = memory.origin_status == "VALID"
                memory.entry_origin_valid = memory.origin_status == "VALID"
                memory.exit_origin_valid = memory.origin_status == "DESTINATION"
                if memory.origin_status == "DESTINATION" and self.count_mode == "ENTRY_ONLY":
                    memory.ignored_entry = True
                    memory.phase = "IGNORE_ENTRY"

            crossings = self._crossings(memory.previous_point, current_point, line_a, line_b)
            memory.last_seen = frame_index

            for crossing in crossings:
                counted_direction = self._apply_directional_crossing(
                    memory,
                    person,
                    current_point,
                    line_a,
                    line_b,
                    crossing,
                    events,
                )
                if counted_direction == "ENTRY":
                    entry_increment += 1
                    self.total += 1
                elif counted_direction == "EXIT":
                    exit_increment += 1
                    self.total += 1

            counted_direction = self._should_complete_edge_journey(memory, person, current_point, line_a, line_b, events)
            if counted_direction == "ENTRY":
                entry_increment += 1
                self.total += 1
            elif counted_direction == "EXIT":
                exit_increment += 1
                self.total += 1

            memory.previous_point = current_point

        for track_id, memory in list(self._tracks.items()):
            if track_id not in active_ids and frame_index - memory.last_seen > self.ttl_frames:
                del self._tracks[track_id]

        return CounterUpdate(
            increment=entry_increment + exit_increment,
            events=events,
            entry_increment=entry_increment,
            exit_increment=exit_increment,
        )

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

    def _apply_directional_crossing(
        self,
        memory: TrackMemory,
        person: TrackedPerson,
        current: Point,
        line_a: Line,
        line_b: Line,
        crossing: str,
        events: list[CounterEvent],
    ) -> str | None:
        if memory.previous_point is None:
            return None
        if memory.phase == "IGNORE_ENTRY":
            return None

        event_direction = self._movement_event_direction(memory.previous_point, current)
        if event_direction is None:
            return None
        first_line = self._journey_first_line(event_direction)
        second_line = self._journey_second_line(event_direction)

        if memory.counted:
            if (
                event_direction != memory.last_counted_event
                and crossing == first_line
                and self._has_origin_evidence(memory, line_a, line_b, event_direction)
            ):
                self._start_journey(memory, person, crossing, event_direction, events)
            return None

        if memory.phase == "NEW" or memory.candidate_direction is None:
            if (
                crossing == second_line
                and self._should_count_late_journey(memory, current, line_a, line_b, event_direction)
            ):
                return self._confirm_event(memory, person, event_direction, events)
            if crossing == first_line and self._has_origin_evidence(memory, line_a, line_b, event_direction):
                self._start_journey(memory, person, crossing, event_direction, events)
            return None

        if memory.candidate_direction != event_direction:
            if crossing == self._journey_first_line(memory.candidate_direction):
                self._reset_journey(memory)
                events.append(
                    CounterEvent(
                        track_id=person.track_id,
                        kind="backed_out",
                        message=f"ID {person.track_id}: regreso antes de completar cruce",
                        age_group=person.age_group,
                        age_confidence=person.age_confidence,
                        confidence=person.confidence,
                        direction=event_direction,
                    )
                )
            if crossing == first_line and self._has_origin_evidence(memory, line_a, line_b, event_direction):
                self._start_journey(memory, person, crossing, event_direction, events)
            return None

        if crossing == second_line and self._moving_in_event_direction(memory.previous_point, current, event_direction):
            return self._confirm_event(memory, person, event_direction, events)

        if crossing == first_line and not self._moving_in_event_direction(memory.previous_point, current, event_direction):
            self._reset_journey(memory)

        return None

    def _start_journey(
        self,
        memory: TrackMemory,
        person: TrackedPerson,
        crossing: str,
        event_direction: str,
        events: list[CounterEvent],
    ) -> None:
        memory.counted = False
        memory.candidate_direction = normalize_event_direction(event_direction)
        memory.phase = "CROSSED_A" if memory.candidate_direction == "ENTRY" else "CROSSED_B"
        memory.crossed_a = crossing == "A"
        memory.crossed_b = crossing == "B"
        memory.ignored_entry = False
        events.append(
            CounterEvent(
                track_id=person.track_id,
                kind=f"crossed_{crossing.lower()}",
                message=f"ID {person.track_id}: {crossing} DETECTADA",
                age_group=person.age_group,
                age_confidence=person.age_confidence,
                confidence=person.confidence,
                direction=event_direction,
            )
        )

    def _reset_journey(self, memory: TrackMemory) -> None:
        memory.phase = "NEW"
        memory.counted = False
        memory.crossed_a = False
        memory.crossed_b = False
        memory.candidate_direction = None
        memory.ignored_entry = False

    def _should_count_late_journey(
        self,
        memory: TrackMemory,
        current: Point,
        line_a: Line,
        line_b: Line,
        event_direction: str,
    ) -> bool:
        if memory.counted or memory.phase != "NEW" or memory.previous_point is None:
            return False
        if not self._has_origin_evidence(memory, line_a, line_b, event_direction):
            return False
        return self._crossed_event_destination_axis(memory.previous_point, current, line_a, line_b, event_direction)

    def _should_complete_edge_journey(
        self,
        memory: TrackMemory,
        person: TrackedPerson,
        current: Point,
        line_a: Line,
        line_b: Line,
        events: list[CounterEvent],
    ) -> str | None:
        if memory.counted or memory.previous_point is None or memory.candidate_direction is None:
            return None
        event_direction = memory.candidate_direction
        if not self._moving_in_event_direction(memory.previous_point, current, event_direction):
            return None
        if self._crossed_event_destination_axis(memory.previous_point, current, line_a, line_b, event_direction):
            return self._confirm_event(memory, person, event_direction, events)
        if self._passed_event_destination(current, line_a, line_b, event_direction, tolerance=0.0):
            return self._confirm_event(memory, person, event_direction, events)
        return None

    def _confirm_event(
        self,
        memory: TrackMemory,
        person: TrackedPerson,
        event_direction: str,
        events: list[CounterEvent],
    ) -> str | None:
        direction = normalize_event_direction(event_direction)
        if memory.counted and memory.last_counted_event == direction:
            return None

        allowed = count_mode_allows(self.count_mode, direction)
        memory.phase = "COUNTED" if direction == "ENTRY" else "EXITED"
        memory.counted = True
        memory.crossed_a = True
        memory.crossed_b = True
        memory.candidate_direction = None
        memory.last_counted_event = direction
        events.append(
            CounterEvent(
                track_id=person.track_id,
                kind="entry" if direction == "ENTRY" else "exit",
                message=f"ID {person.track_id}: {'ENTRADA' if direction == 'ENTRY' else 'SALIDA'} CONFIRMADA",
                age_group=person.age_group,
                age_confidence=person.age_confidence,
                confidence=person.confidence,
                direction=direction,
                counted=allowed,
            )
        )
        return direction if allowed else None

    def _classify_origin(self, point: Point, line_a: Line, line_b: Line) -> str:
        if self._point_on_event_origin_side(point, line_a, line_b, "ENTRY"):
            return "VALID"
        if self._point_on_event_origin_side(point, line_a, line_b, "EXIT"):
            return "DESTINATION"
        return "UNCERTAIN"

    def _movement_event_direction(self, previous: Point, current: Point) -> str | None:
        if self._moving_in_event_direction(previous, current, "ENTRY"):
            return "ENTRY"
        if self._moving_in_event_direction(previous, current, "EXIT"):
            return "EXIT"
        return None

    def _moving_in_event_direction(self, previous: Point, current: Point, event_direction: str) -> bool:
        return (self._axis_value(current) - self._axis_value(previous)) * self._event_sign(event_direction) > 1e-6

    def _has_origin_evidence(
        self,
        memory: TrackMemory,
        line_a: Line,
        line_b: Line,
        event_direction: str,
    ) -> bool:
        return (
            self._point_on_event_origin_side(memory.first_point or memory.previous_point, line_a, line_b, event_direction)
            or self._point_on_event_origin_side(memory.previous_point, line_a, line_b, event_direction)
        )

    def _crossed_event_destination_axis(
        self,
        previous: Point,
        current: Point,
        line_a: Line,
        line_b: Line,
        event_direction: str,
    ) -> bool:
        if not self._moving_in_event_direction(previous, current, event_direction):
            return False
        gate = line_axis_mid(self._event_destination_line(line_a, line_b, event_direction), self.line_orientation)
        previous_axis = self._axis_value(previous)
        current_axis = self._axis_value(current)
        return (previous_axis < gate <= current_axis) or (previous_axis > gate >= current_axis)

    def _passed_event_destination(
        self,
        point: Point,
        line_a: Line,
        line_b: Line,
        event_direction: str,
        tolerance: float = 0.0,
    ) -> bool:
        destination = self._event_destination_line(line_a, line_b, event_direction)
        gate = line_axis_mid(destination, self.line_orientation)
        axis = self._axis_value(point)
        other_axis = 0 if self.line_orientation == "horizontal" else 1
        line_size = abs(destination[0][other_axis] - destination[1][other_axis]) or 1.0
        return (axis - gate) * self._event_sign(event_direction) >= -(line_size * tolerance)

    def _point_on_event_origin_side(
        self,
        point: Point | None,
        line_a: Line,
        line_b: Line,
        event_direction: str,
    ) -> bool:
        if point is None:
            return False
        origin = self._event_origin_line(line_a, line_b, event_direction)
        tolerance = self._origin_tolerance(origin)
        return (self._axis_value(point) - line_axis_mid(origin, self.line_orientation)) * self._event_sign(event_direction) <= tolerance

    def _event_origin_line(self, line_a: Line, line_b: Line, event_direction: str) -> Line:
        return line_a if normalize_event_direction(event_direction) == "ENTRY" else line_b

    def _event_destination_line(self, line_a: Line, line_b: Line, event_direction: str) -> Line:
        return line_b if normalize_event_direction(event_direction) == "ENTRY" else line_a

    def _journey_first_line(self, event_direction: str) -> str:
        return "A" if normalize_event_direction(event_direction) == "ENTRY" else "B"

    def _journey_second_line(self, event_direction: str) -> str:
        return "B" if normalize_event_direction(event_direction) == "ENTRY" else "A"

    def _axis_value(self, point: Point) -> float:
        return point[1] if self.line_orientation == "horizontal" else point[0]

    def _event_sign(self, event_direction: str) -> int:
        sign = self._entry_sign()
        return sign if normalize_event_direction(event_direction) == "ENTRY" else -sign

    def _entry_sign(self) -> int:
        if self.line_orientation == "horizontal":
            return -1 if self.entry_direction == "BOTTOM_TO_TOP" else 1
        return -1 if self.entry_direction == "RIGHT_TO_LEFT" else 1

    def _origin_tolerance(self, line: Line) -> float:
        other_axis = 0 if self.line_orientation == "horizontal" else 1
        line_size = abs(line[0][other_axis] - line[1][other_axis]) or 1.0
        return max(2.0, line_size * 0.055)


def normalize_count_mode(value: str | None) -> str:
    normalized = str(value or "ENTRY_ONLY").strip().upper()
    if normalized in {"EXIT_ONLY", "SALIDAS"}:
        return "EXIT_ONLY"
    if normalized in {"BIDIRECTIONAL", "MIXTO", "MIXED"}:
        return "BIDIRECTIONAL"
    return "ENTRY_ONLY"


def normalize_event_direction(value: str | None) -> str:
    return "EXIT" if str(value or "").strip().upper() in {"EXIT", "SALIDA", "SALIDAS"} else "ENTRY"


def count_mode_allows(count_mode: str | None, event_direction: str | None) -> bool:
    mode = normalize_count_mode(count_mode)
    direction = normalize_event_direction(event_direction)
    return (
        mode == "BIDIRECTIONAL"
        or (mode == "ENTRY_ONLY" and direction == "ENTRY")
        or (mode == "EXIT_ONLY" and direction == "EXIT")
    )
