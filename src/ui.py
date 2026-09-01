from __future__ import annotations

from dataclasses import dataclass

from .counter import CounterEvent


@dataclass
class Button:
    label: str
    action: str
    rect: tuple[int, int, int, int]


class AppUi:
    def __init__(self, config: dict) -> None:
        self.config = config
        self.buttons: list[Button] = []

    def draw(self, frame, detections, total: int, running: bool, calibration, events, message: str, source, metrics=None):
        import cv2
        import numpy as np

        debug = bool(self.config.get("debug", True))
        view = frame.copy()
        height, width = view.shape[:2]

        self._draw_roi(cv2, view, calibration.roi)
        self._draw_line(cv2, view, calibration.line_a, (80, 220, 80), "LINE_A")
        self._draw_line(cv2, view, calibration.line_b, (255, 170, 60), "LINE_B")
        if calibration.active:
            self._draw_direction(cv2, view, calibration)

        if debug:
            for person in detections:
                x1, y1, x2, y2 = [int(value) for value in person.box]
                cv2.rectangle(view, (x1, y1), (x2, y2), (90, 210, 255), 2)
                cv2.circle(view, (int(person.bottom_center[0]), int(person.bottom_center[1])), 4, (0, 255, 255), -1)
                self._put_text(cv2, view, f"ID: {person.track_id}", (x1, max(24, y1 - 8)), 0.65, (90, 210, 255))

        self._put_text(cv2, view, f"INGRESOS: {total}", (28, 54), 1.35, (255, 255, 255), thickness=3)
        status = "ACTIVO" if running else "DETENIDO"
        self._put_text(cv2, view, status, (30, 92), 0.7, (120, 245, 160) if running else (170, 180, 190))

        y_text = 126
        if debug:
            metrics = metrics or {}
            debug_lines = [
                f"PERSONAS DETECTADAS: {metrics.get('detected_persons', len(detections))}",
                f"TRACKS ACTIVOS: {metrics.get('active_tracks', len(detections))}",
                f"ENTRADAS CONFIRMADAS: {metrics.get('entries_confirmed', total)}",
                f"PERSONAS ULTIMO MINUTO: {metrics.get('last_1_minute', 0)}",
                f"PERSONAS ULTIMOS 5 MIN: {metrics.get('last_5_minutes', 0)}",
                f"RITMO: {metrics.get('live_rate_per_minute', 0)}/MIN",
                f"PROYECCION: {metrics.get('projected_people_per_hour', 0)}/HORA",
                f"FRANJA ACTUAL: {metrics.get('current_bucket', '--')}",
            ]
            for text in debug_lines:
                self._put_text(cv2, view, text, (30, y_text), 0.58, (165, 245, 205))
                y_text += 24

        for event in list(events)[-3:]:
            if isinstance(event, CounterEvent):
                self._put_text(cv2, view, event.message, (30, y_text), 0.62, (240, 240, 140))
                y_text += 28
        if message:
            self._put_text(cv2, view, message[:110], (30, height - 24), 0.55, (220, 220, 220))

        for index, text in enumerate(calibration.instructions()):
            self._put_text(cv2, view, text, (30, height - 92 + index * 25), 0.58, (255, 255, 255))
        if calibration.active and getattr(calibration, "status_message", ""):
            self._put_text(cv2, view, calibration.status_message, (30, height - 18), 0.58, (80, 230, 230))

        panel_height = 92
        canvas = np.zeros((height + panel_height, width, 3), dtype=np.uint8)
        canvas[:height, :width] = view
        canvas[height:, :] = (27, 33, 40)

        self.buttons = self._layout_buttons(width, height, running)
        for button in self.buttons:
            self._draw_button(cv2, canvas, button, active=False)

        return canvas

    def handle_click(self, x: int, y: int) -> str | None:
        for button in self.buttons:
            x1, y1, x2, y2 = button.rect
            if x1 <= x <= x2 and y1 <= y <= y2:
                return button.action
        return None

    def _layout_buttons(self, width: int, top: int, running: bool) -> list[Button]:
        labels = [
            ("DETENER" if running else "INICIAR", "toggle_run"),
            ("CALIBRAR", "toggle_calibrate"),
            ("NUEVA SESION", "reset_counter"),
            ("CONFIG", "config"),
        ]
        buttons = []
        margin = 18
        gap = 12
        available = width - margin * 2 - gap * (len(labels) - 1)
        button_width = max(118, available // len(labels))
        x = margin
        y = top + 22
        for label, action in labels:
            buttons.append(Button(label=label, action=action, rect=(x, y, min(x + button_width, width - margin), y + 48)))
            x += button_width + gap
        return buttons

    @staticmethod
    def _draw_button(cv2, canvas, button: Button, active: bool) -> None:
        x1, y1, x2, y2 = button.rect
        color = (56, 120, 215) if button.action == "toggle_run" else (58, 68, 78)
        cv2.rectangle(canvas, (x1, y1), (x2, y2), color, -1)
        cv2.rectangle(canvas, (x1, y1), (x2, y2), (100, 115, 130), 1)
        text_size, _ = cv2.getTextSize(button.label, cv2.FONT_HERSHEY_SIMPLEX, 0.62, 2)
        text_x = x1 + max(8, (x2 - x1 - text_size[0]) // 2)
        text_y = y1 + (y2 - y1 + text_size[1]) // 2
        cv2.putText(canvas, button.label, (text_x, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (245, 247, 250), 2)

    @staticmethod
    def _draw_line(cv2, frame, line, color, label: str) -> None:
        p1 = (int(line[0][0]), int(line[0][1]))
        p2 = (int(line[1][0]), int(line[1][1]))
        cv2.line(frame, p1, p2, color, 3)
        cv2.circle(frame, p1, 6, color, -1)
        cv2.circle(frame, p2, 6, color, -1)
        cv2.putText(frame, label, (p1[0] + 8, p1[1] - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.62, color, 2)

    @staticmethod
    def _draw_roi(cv2, frame, roi) -> None:
        if not roi:
            return
        import numpy as np

        points = np.array([[(int(x), int(y)) for x, y in roi]], dtype=np.int32)
        overlay = frame.copy()
        cv2.fillPoly(overlay, points, (55, 75, 80))
        cv2.addWeighted(overlay, 0.18, frame, 0.82, 0, frame)
        cv2.polylines(frame, points, True, (80, 230, 230), 2)

    @staticmethod
    def _draw_direction(cv2, frame, calibration) -> None:
        line_a = calibration.line_a
        line_b = calibration.line_b
        a_mid = (
            int((line_a[0][0] + line_a[1][0]) / 2),
            int((line_a[0][1] + line_a[1][1]) / 2),
        )
        b_mid = (
            int((line_b[0][0] + line_b[1][0]) / 2),
            int((line_b[0][1] + line_b[1][1]) / 2),
        )
        cv2.arrowedLine(frame, a_mid, b_mid, (80, 230, 230), 3, tipLength=0.06)
        cv2.putText(frame, "ORIGEN A", (max(8, a_mid[0] - 44), max(24, a_mid[1] - 16)), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (80, 230, 230), 2)
        cv2.putText(frame, "DESTINO B", (max(8, b_mid[0] - 44), min(frame.shape[0] - 12, b_mid[1] + 30)), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (80, 230, 230), 2)

    @staticmethod
    def _put_text(cv2, frame, text: str, pos: tuple[int, int], scale: float, color, thickness: int = 2) -> None:
        x, y = pos
        cv2.putText(frame, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), thickness + 2)
        cv2.putText(frame, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, scale, color, thickness)
