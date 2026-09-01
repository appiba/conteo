from __future__ import annotations

from typing import Iterable

Point = tuple[float, float]
Line = tuple[Point, Point]
Polygon = list[Point]

LINE_ORIENTATIONS = {"vertical", "horizontal"}
ENTRY_DIRECTIONS_BY_ORIENTATION = {
    "vertical": {"LEFT_TO_RIGHT", "RIGHT_TO_LEFT"},
    "horizontal": {"TOP_TO_BOTTOM", "BOTTOM_TO_TOP"},
}
ENTRY_DIRECTIONS = set().union(*ENTRY_DIRECTIONS_BY_ORIENTATION.values())


def as_point(value: Iterable[float]) -> Point:
    x, y = value
    return float(x), float(y)


def as_line(value, fallback: Line) -> Line:
    if not value:
        return fallback
    return as_point(value[0]), as_point(value[1])


def as_polygon(value) -> Polygon:
    if not value:
        return []
    return [as_point(point) for point in value]


def default_geometry(
    width: int,
    height: int,
    orientation: str = "vertical",
    entry_direction: str = "LEFT_TO_RIGHT",
) -> tuple[Line, Line, Polygon]:
    y1 = int(height * 0.12)
    y2 = int(height * 0.92)
    roi = [
        (int(width * 0.08), y1),
        (int(width * 0.92), y1),
        (int(width * 0.92), y2),
        (int(width * 0.08), y2),
    ]
    a_position, b_position = default_line_positions(orientation, entry_direction)
    return (
        line_from_position(width, height, orientation, a_position, roi),
        line_from_position(width, height, orientation, b_position, roi),
        roi,
    )


def bottom_center(box: tuple[float, float, float, float]) -> Point:
    x1, _y1, x2, y2 = box
    return (x1 + x2) / 2.0, y2


def line_mid_y(line: Line) -> float:
    return (line[0][1] + line[1][1]) / 2.0


def line_mid_x(line: Line) -> float:
    return (line[0][0] + line[1][0]) / 2.0


def line_axis_mid(line: Line, orientation: str) -> float:
    return line_mid_y(line) if normalize_orientation(orientation) == "horizontal" else line_mid_x(line)


def default_line_positions(orientation: str, entry_direction: str) -> tuple[float, float]:
    orientation = normalize_orientation(orientation)
    entry_direction = normalize_entry_direction(entry_direction, orientation)
    if orientation == "horizontal":
        if entry_direction == "TOP_TO_BOTTOM":
            return 0.35, 0.65
        return 0.65, 0.35
    if entry_direction == "RIGHT_TO_LEFT":
        return 0.65, 0.35
    return 0.35, 0.65


def normalize_orientation(value: str | None) -> str:
    orientation = str(value or "vertical").lower()
    return orientation if orientation in LINE_ORIENTATIONS else "vertical"


def normalize_entry_direction(value: str | None, orientation: str = "vertical") -> str:
    orientation = normalize_orientation(orientation)
    direction = str(value or "").upper()
    if direction in ENTRY_DIRECTIONS_BY_ORIENTATION[orientation]:
        return direction
    return "BOTTOM_TO_TOP" if orientation == "horizontal" else "LEFT_TO_RIGHT"


def direction_positions_valid(a_position: float, b_position: float, orientation: str, entry_direction: str) -> bool:
    orientation = normalize_orientation(orientation)
    entry_direction = normalize_entry_direction(entry_direction, orientation)
    if orientation == "vertical":
        return a_position > b_position if entry_direction == "RIGHT_TO_LEFT" else a_position < b_position
    return a_position < b_position if entry_direction == "TOP_TO_BOTTOM" else a_position > b_position


def roi_bounds(roi: Polygon, width: int, height: int) -> tuple[float, float, float, float]:
    if not roi:
        return 0.08 * width, 0.12 * height, 0.92 * width, 0.92 * height
    xs = [point[0] for point in roi]
    ys = [point[1] for point in roi]
    return min(xs), min(ys), max(xs), max(ys)


def line_from_position(width: int, height: int, orientation: str, position: float, roi: Polygon | None = None) -> Line:
    left, top, right, bottom = roi_bounds(roi or [], width, height)
    position = max(0.0, min(1.0, float(position)))
    if normalize_orientation(orientation) == "horizontal":
        y = int(round(height * position))
        return ((left, y), (right, y))
    x = int(round(width * position))
    return ((x, top), (x, bottom))


def normalized_line_position(line: Line, orientation: str, width: int, height: int) -> float:
    if normalize_orientation(orientation) == "horizontal":
        return max(0.0, min(1.0, line_mid_y(line) / max(1, height)))
    return max(0.0, min(1.0, line_mid_x(line) / max(1, width)))


def point_in_polygon(point: Point, polygon: Polygon) -> bool:
    if not polygon:
        return True
    x, y = point
    inside = False
    j = len(polygon) - 1
    for i, current in enumerate(polygon):
        xi, yi = current
        xj, yj = polygon[j]
        intersects = (yi > y) != (yj > y)
        if intersects:
            x_at_y = (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi
            if x < x_at_y:
                inside = not inside
        j = i
    return inside


def segments_intersect(a: Point, b: Point, c: Point, d: Point) -> bool:
    o1 = _orientation(a, b, c)
    o2 = _orientation(a, b, d)
    o3 = _orientation(c, d, a)
    o4 = _orientation(c, d, b)

    if o1 != o2 and o3 != o4:
        return True
    if o1 == 0 and _on_segment(a, c, b):
        return True
    if o2 == 0 and _on_segment(a, d, b):
        return True
    if o3 == 0 and _on_segment(c, a, d):
        return True
    if o4 == 0 and _on_segment(c, b, d):
        return True
    return False


def segment_crossed_line(previous: Point | None, current: Point, line: Line) -> bool:
    if previous is None:
        return False
    if abs(previous[0] - current[0]) < 1e-6 and abs(previous[1] - current[1]) < 1e-6:
        return False
    return segments_intersect(previous, current, line[0], line[1])


def horizontal_crossed_line(previous: Point | None, current: Point, line: Line) -> bool:
    return movement_crossed_line(previous, current, line, "vertical")


def movement_crossed_line(previous: Point | None, current: Point, line: Line, orientation: str) -> bool:
    if previous is None:
        return False

    orientation = normalize_orientation(orientation)
    axis = 1 if orientation == "horizontal" else 0
    other_axis = 0 if axis == 1 else 1
    previous_axis = previous[axis]
    current_axis = current[axis]
    delta = current_axis - previous_axis
    if abs(delta) < 1e-6:
        return False

    gate = line_axis_mid(line, orientation)
    crossed_axis = (previous_axis < gate <= current_axis) or (previous_axis > gate >= current_axis)
    if not crossed_axis:
        return False

    progress = (gate - previous_axis) / delta
    if progress < -1e-6 or progress > 1.0 + 1e-6:
        return False

    crossing_other = previous[other_axis] + (current[other_axis] - previous[other_axis]) * progress
    line_min, line_max = sorted((line[0][other_axis], line[1][other_axis]))
    return line_min - 8.0 <= crossing_other <= line_max + 8.0


def _orientation(a: Point, b: Point, c: Point) -> int:
    value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])
    if abs(value) < 1e-9:
        return 0
    return 1 if value > 0 else 2


def _on_segment(a: Point, b: Point, c: Point) -> bool:
    return (
        min(a[0], c[0]) - 1e-9 <= b[0] <= max(a[0], c[0]) + 1e-9
        and min(a[1], c[1]) - 1e-9 <= b[1] <= max(a[1], c[1]) + 1e-9
    )
