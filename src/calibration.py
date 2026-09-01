from __future__ import annotations

from pathlib import Path

from .config import save_config
from .geometry import Line, Polygon, as_line, as_polygon, default_geometry


class CalibrationController:
    def __init__(self, config: dict, config_path: Path) -> None:
        self.config = config
        self.config_path = config_path
        self.active = False
        self.selected = "line_a"
        self._drag_start: tuple[int, int] | None = None
        self._frame_width = 0
        self._frame_height = 0

    @property
    def line_a(self) -> Line:
        fallback_a, _fallback_b, _fallback_roi = default_geometry(self._frame_width or 1280, self._frame_height or 720)
        return as_line(self.config.get("line_a"), fallback_a)

    @property
    def line_b(self) -> Line:
        _fallback_a, fallback_b, _fallback_roi = default_geometry(self._frame_width or 1280, self._frame_height or 720)
        return as_line(self.config.get("line_b"), fallback_b)

    @property
    def roi(self) -> Polygon:
        return as_polygon(self.config.get("roi"))

    def ensure_defaults(self, frame_shape) -> None:
        height, width = frame_shape[:2]
        changed = False
        self._frame_width = width
        self._frame_height = height
        default_a, default_b, default_roi = default_geometry(width, height)
        if not self.config.get("line_a"):
            self.config["line_a"] = _line_to_json(default_a)
            changed = True
        if not self.config.get("line_b"):
            self.config["line_b"] = _line_to_json(default_b)
            changed = True
        if not self.config.get("roi"):
            self.config["roi"] = _polygon_to_json(default_roi)
            changed = True
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
        elif key in (ord("s"), ord("S")):
            save_config(self.config, self.config_path)
            print("Calibracion guardada en config.json")

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
            save_config(self.config, self.config_path)

    def _write_drag_geometry(self, start: tuple[int, int], end: tuple[int, int], preview: bool) -> None:
        if self.selected in ("line_a", "line_b"):
            x1, y1 = start
            x2, y2 = end
            if abs(x1 - x2) < 8 and abs(y1 - y2) < 8:
                y1 = int(self._frame_height * 0.12)
                y2 = int(self._frame_height * 0.92)
                x2 = x1
            self.config[self.selected] = [[int(x1), int(y1)], [int(x2), int(y2)]]
        elif self.selected == "roi":
            x1, y1 = start
            x2, y2 = end
            if abs(x1 - x2) < 8 or abs(y1 - y2) < 8:
                return
            left, right = sorted((int(x1), int(x2)))
            top, bottom = sorted((int(y1), int(y2)))
            self.config["roi"] = [[left, top], [right, top], [right, bottom], [left, bottom]]

    def instructions(self) -> list[str]:
        if not self.active:
            return []
        return [
            "CALIBRAR: 1 LINE_A, 2 LINE_B, R ROI, S guardar",
            "Arrastra sobre el video para ubicar el elemento seleccionado.",
            f"Seleccion actual: {self.selected.upper()}",
        ]


def _line_to_json(line: Line) -> list[list[int]]:
    return [[int(line[0][0]), int(line[0][1])], [int(line[1][0]), int(line[1][1])]]


def _polygon_to_json(polygon: Polygon) -> list[list[int]]:
    return [[int(x), int(y)] for x, y in polygon]
