from __future__ import annotations

from dataclasses import dataclass

from .geometry import Line, Point, horizontal_crossed_line, line_mid_x
from .tracker import TrackedPerson


ENTRY_SEQUENCES = {
    "LEFT_TO_RIGHT": ("A", "B"),
    "RIGHT_TO_LEFT": ("B", "A"),
}


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
    previous_point: Point | None = None
    last_seen: int = 0
    counted: bool = False


class EntryCounter:
    def __init__(self, initial_count: int = 0, ttl_frames: int = 45, entry_direction: str = "LEFT_TO_RIGHT") -> None:
        self.total = int(initial_count)
        self.ttl_frames = ttl_frames
        self.entry_direction = _normalize_entry_direction(entry_direction)
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
    ) -> CounterUpdate:
        increment = 0
        events: list[CounterEvent] = []
        active_ids = set()
        if entry_direction is not None:
            self.entry_direction = _normalize_entry_direction(entry_direction)

        for person in people:
            active_ids.add(person.track_id)
            memory = self._tracks.setdefault(person.track_id, TrackMemory())
            current_point = person.bottom_center
            crossings = self._crossings(memory.previous_point, current_point, line_a, line_b)
            memory.last_seen = frame_index

            for crossing in crossings:
                counted = self._apply_crossing(memory, person, crossing, events)
                if counted:
                    increment += 1
                    self.total += 1

            memory.previous_point = current_point

        for track_id, memory in list(self._tracks.items()):
            if track_id not in active_ids and frame_index - memory.last_seen > self.ttl_frames:
                del self._tracks[track_id]

        return CounterUpdate(increment=increment, events=events)

    def _crossings(self, previous: Point | None, current: Point, line_a: Line, line_b: Line) -> list[str]:
        crossed = []
        if horizontal_crossed_line(previous, current, line_a):
            crossed.append(("A", line_mid_x(line_a)))
        if horizontal_crossed_line(previous, current, line_b):
            crossed.append(("B", line_mid_x(line_b)))
        if len(crossed) <= 1:
            return [name for name, _mid_x in crossed]

        dx = current[0] - (previous[0] if previous else current[0])
        crossed.sort(key=lambda item: item[1], reverse=dx < 0)
        return [name for name, _mid_x in crossed]

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

        first_line, second_line = ENTRY_SEQUENCES[self.entry_direction]
        crossing_phase = f"CROSSED_{crossing}"
        first_phase = f"CROSSED_{first_line}"
        second_phase = f"CROSSED_{second_line}"

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

        if memory.phase == first_phase and crossing == second_line:
            memory.phase = "COUNTED"
            memory.counted = True
            events.append(
                CounterEvent(
                    track_id=track_id,
                    kind="entry",
                    message=f"ID {track_id}: ENTRADA CONFIRMADA",
                    age_group=person.age_group,
                    age_confidence=person.age_confidence,
                    confidence=person.confidence,
                )
            )
            return True

        if memory.phase == second_phase and crossing == first_line:
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


def _normalize_entry_direction(value: str) -> str:
    direction = str(value or "LEFT_TO_RIGHT").upper()
    if direction not in ENTRY_SEQUENCES:
        return "LEFT_TO_RIGHT"
    return direction
