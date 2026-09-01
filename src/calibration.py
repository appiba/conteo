from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from .config import save_config
from .geometry import (
    Line,
    Polygon,
    as_line,
    as_polygon,
    default_geometry,
    direction_positions_valid,
    line_axis_mid,
    line_from_position,
    normalize_entry_direction,
    normalize_orientation,
    normalized_line_position,
    roi_bounds,
)


DIRECTIONS_BY_ORIENTATION = {
    "vertical": ("LEFT_TO_RIGHT", "RIGHT_TO_LEFT"),
    "horizontal": ("BOTTOM_TO_TOP", "TOP_TO_BOTTOM"),
}


class CalibrationController:
    def __init__(self, config: dict, config_path: Path) -> None:
        self.config = config
        self.config_path = config_path
        self.active = False
        self.selected = "line_a"
        self.status_message = ""
        self._drag_start: tuple[int, int] | None = None
        self._frame_width = 0
        self._frame_height = 0

    @property
    def orientation(self) -> str:
        return normalize_orientation(self.config.get("line_orientation"))

    @property
    def entry_direction(self) -> str:
        return normalize_entry_direction(self.config.get("entry_direction"), self.orientation)

    @property
    def line_a(self) -> Line:
        fallback_a, _fallback_b, _fallback_roi = default_geometry(
            self._frame_width or 1280,
            self._frame_height or 720,
            self.orientation,
            self.entry_direction,
        )
        return as_line(self.config.get("line_a"), fallback_a)

    @property
    def line_b(self) -> Line:
        _fallback_a, fallback_b, _fallback_roi = default_geometry(
            self._frame_width or 1280,
            self._frame_height or 720,
            self.orientation,
            self.entry_direction,
        )
        return as_line(self.config.get("line_b"), fallback_b)

    @property
    def roi(self) -> Polygon:
        return as_polygon(self.config.get("roi"))

    def ensure_defaults(self, frame_shape) -> None:
        height, width = frame_shape[:2]
        changed = False
        self._frame_width = width
        self._frame_height = height
        orientation = self.orientation
        entry_direction = self.entry_direction
        default_a, default_b, default_roi = default_geometry(width, height, orientation, entry_direction)
        changed |= self._set_if_changed("line_orientation", orientation)
        changed |= self._set_if_changed("entry_direction", entry_direction)
        if not self.config.get("line_a"):
            self.config["line_a"] = _line_to_json(default_a)
            changed = True
        if not self.config.get("line_b"):
            self.config["line_b"] = _line_to_json(default_b)
            changed = True
        if not self.config.get("roi"):
            self.config["roi"] = _polygon_to_json(default_roi)
            changed = True
        changed |= self._sync_line_metadata()
        if changed:
            save_config(self.config, self.config_path)

    def toggle(self) -> None:
        self.active = not self.active
        self._drag_start = None
        print("Modo calibracion ON" if self.active else "Modo calibracion OFF")

    def handle_key(self, key: int) -> None:
        if key in (ord("1"),):
            self.selected = "line_a"
            print("Calibrando LINE_A")
        elif key in (ord("2"),):
            self.selected = "line_b"
            print("Calibrando LINE_B")
        elif key in (ord("r"), ord("R")):
            self.selected = "roi"
            print("Calibrando ROI")
        elif key in (ord("v"), ord("V")):
            self._switch_orientation("vertical")
            print("Orientacion vertical")
        elif key in (ord("h"), ord("H")):
            self._switch_orientation("horizontal")
            print("Orientacion horizontal")
        elif key in (ord("d"), ord("D")):
            self._cycle_direction()
            print(f"Direccion: {self.entry_direction}")
        elif key in (ord("x"), ord("X")):
            self._swap_lines()
            print("Lineas A y B intercambiadas")
        elif key in (ord("s"), ord("S")):
            self._try_save()

    def handle_mouse(self, event: int, x: int, y: int, flags: int) -> None:
        if not self.active:
            return
        if x < 0 or y < 0 or y >= self._frame_height:
            return

        import cv2

        if event == cv2.EVENT_LBUTTONDOWN:
            self._drag_start = (x, y)
            self._write_drag_geometry((x, y), (x, y), preview=True)
        elif event == cv2.EVENT_MOUSEMOVE and self._drag_start is not None:
            self._write_drag_geometry(self._drag_start, (x, y), preview=True)
        elif event == cv2.EVENT_LBUTTONUP and self._drag_start is not None:
            self._write_drag_geometry(self._drag_start, (x, y), preview=False)
            self._drag_start = None
            self._try_save()

    def _write_drag_geometry(self, start: tuple[int, int], end: tuple[int, int], preview: bool) -> None:
        if self.selected in ("line_a", "line_b"):
            x, y = end
            self.config[self.selected] = _line_to_json(self._line_from_axis(x if self.orientation == "vertical" else y))
        elif self.selected == "roi":
            x1, y1 = start
            x2, y2 = end
            if abs(x1 - x2) < 8 or abs(y1 - y2) < 8:
                self.status_message = "Zona demasiado pequena"
                return
            left, right = sorted((int(x1), int(x2)))
            top, bottom = sorted((int(y1), int(y2)))
            self.config["roi"] = [[left, top], [right, top], [right, bottom], [left, bottom]]
            self._sync_line_spans_to_roi()
        self._sync_line_metadata()

    def instructions(self) -> list[str]:
        if not self.active:
            return []
        axis = "izq/der" if self.orientation == "vertical" else "arriba/abajo"
        separation = float(self.config.get("line_separation", 0.0)) * 100
        return [
            "CALIBRAR: 1 LINE_A, 2 LINE_B, R ROI, V/H orientacion, D direccion, X intercambiar, S guardar",
            f"Arrastra para mover {axis}. A->B cuenta; B->A no suma.",
            f"Seleccion: {self.selected.upper()} | {self.orientation.upper()} | {self.entry_direction} | sep {separation:.1f}%",
        ]

    def _switch_orientation(self, orientation: str) -> None:
        orientation = normalize_orientation(orientation)
        self.config["line_orientation"] = orientation
        self.config["entry_direction"] = normalize_entry_direction(self.config.get("entry_direction"), orientation)
        self._restore_default_lines()
        self.status_message = "Orientacion lista; guarda para aplicar."

    def _cycle_direction(self) -> None:
        options = DIRECTIONS_BY_ORIENTATION[self.orientation]
        current = self.entry_direction
        next_index = (options.index(current) + 1) % len(options) if current in options else 0
        self.config["entry_direction"] = options[next_index]
        self._restore_default_lines()
        self.status_message = "Direccion lista; guarda para aplicar."

    def _swap_lines(self) -> None:
        self.config["line_a"], self.config["line_b"] = self.config.get("line_b"), self.config.get("line_a")
        self._sync_line_metadata()
        self.status_message = "Lineas intercambiadas."

    def _restore_default_lines(self) -> None:
        line_a, line_b, default_roi = default_geometry(
            self._frame_width or 1280,
            self._frame_height or 720,
            self.orientation,
            self.entry_direction,
        )
        if not self.config.get("roi"):
            self.config["roi"] = _polygon_to_json(default_roi)
        self.config["line_a"] = _line_to_json(line_a)
        self.config["line_b"] = _line_to_json(line_b)
        self._sync_line_metadata()

    def _line_from_axis(self, axis_value: float) -> Line:
        width = self._frame_width or 1280
        height = self._frame_height or 720
        position = axis_value / max(1, width if self.orientation == "vertical" else height)
        return line_from_position(width, height, self.orientation, position, self.roi)

    def _sync_line_spans_to_roi(self) -> None:
        self.config["line_a"] = _line_to_json(self._line_from_axis(line_axis_mid(self.line_a, self.orientation)))
        self.config["line_b"] = _line_to_json(self._line_from_axis(line_axis_mid(self.line_b, self.orientation)))

    def _sync_line_metadata(self) -> bool:
        width = self._frame_width or 1280
        height = self._frame_height or 720
        a_position = normalized_line_position(self.line_a, self.orientation, width, height)
        b_position = normalized_line_position(self.line_b, self.orientation, width, height)
        separation = abs(a_position - b_position)
        changed = False
        changed |= self._set_if_changed("line_a_position", round(a_position, 4))
        changed |= self._set_if_changed("line_b_position", round(b_position, 4))
        changed |= self._set_if_changed("line_separation", round(separation, 4))
        if not self.config.get("calibration_id"):
            self.config["calibration_id"] = str(uuid4())
            changed = True
        self.config.setdefault("session_id", "")
        self.config.setdefault("device_id", "")
        self.config.setdefault("zone_id", "")
        return changed

    def _try_save(self) -> bool:
        ok, message = self._validate_before_save()
        self.status_message = message
        if not ok:
            print(message)
            return False
        self._sync_line_metadata()
        save_config(self.config, self.config_path)
        print("Calibracion guardada en config.json")
        return True

    def _validate_before_save(self) -> tuple[bool, str]:
        width = self._frame_width or 1280
        height = self._frame_height or 720
        a_position = normalized_line_position(self.line_a, self.orientation, width, height)
        b_position = normalized_line_position(self.line_b, self.orientation, width, height)
        separation = abs(a_position - b_position)
        minimum = float(self.config.get("min_line_separation", 0.05))
        if separation <= 0.001:
            return False, "No se puede guardar: LINE_A y LINE_B estan encima."
        if separation < minimum:
            return False, f"No se puede guardar: separacion minima {minimum * 100:.0f}%."
        if not direction_positions_valid(a_position, b_position, self.orientation, self.entry_direction):
            return False, "No se puede guardar: el orden A/B no coincide con la direccion."
        left, top, right, bottom = roi_bounds(self.roi, width, height)
        if right - left < 16 or bottom - top < 16:
            return False, "No se puede guardar: zona demasiado pequena."
        return True, "Calibracion valida."

    def _set_if_changed(self, key: str, value) -> bool:
        if self.config.get(key) == value:
            return False
        self.config[key] = value
        return True


def _line_to_json(line: Line) -> list[list[int]]:
    return [[int(line[0][0]), int(line[0][1])], [int(line[1][0]), int(line[1][1])]]


def _polygon_to_json(polygon: Polygon) -> list[list[int]]:
    return [[int(x), int(y)] for x, y in polygon]
