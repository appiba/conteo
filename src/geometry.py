from __future__ import annotations

from typing import Iterable

Point = tuple[float, float]
Line = tuple[Point, Point]
Polygon = list[Point]


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


def default_geometry(width: int, height: int) -> tuple[Line, Line, Polygon]:
    y1 = int(height * 0.12)
    y2 = int(height * 0.92)
    line_a_x = int(width * 0.38)
    line_b_x = int(width * 0.62)
    roi = [
        (int(width * 0.08), y1),
        (int(width * 0.92), y1),
        (int(width * 0.92), y2),
        (int(width * 0.08), y2),
    ]
    return ((line_a_x, y1), (line_a_x, y2)), ((line_b_x, y1), (line_b_x, y2)), roi


def bottom_center(box: tuple[float, float, float, float]) -> Point:
    x1, _y1, x2, y2 = box
    return (x1 + x2) / 2.0, y2


def line_mid_y(line: Line) -> float:
    return (line[0][1] + line[1][1]) / 2.0


def line_mid_x(line: Line) -> float:
    return (line[0][0] + line[1][0]) / 2.0


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
    if previous is None:
        return False

    previous_x, previous_y = previous
    current_x, current_y = current
    dx = current_x - previous_x
    if abs(dx) < 1e-6:
        return False

    gate_x = line_mid_x(line)
    crossed_x = (previous_x < gate_x <= current_x) or (previous_x > gate_x >= current_x)
    if not crossed_x:
        return False

    progress = (gate_x - previous_x) / dx
    if progress < -1e-6 or progress > 1.0 + 1e-6:
        return False

    crossing_y = previous_y + (current_y - previous_y) * progress
    line_top, line_bottom = sorted((line[0][1], line[1][1]))
    return line_top - 8.0 <= crossing_y <= line_bottom + 8.0


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
