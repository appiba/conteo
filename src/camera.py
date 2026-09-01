from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

from .phone_server import PhoneCameraServer, PhoneFrameBuffer


class CameraOpenError(Exception):
    """Raised when a video source cannot be opened."""


@dataclass
class FrameResult:
    ok: bool
    frame: object | None
    message: str = ""


class OpenCvVideoSource:
    def __init__(self, source, config: dict, label: str) -> None:
        self.source = source
        self.config = config
        self.label = label
        self.cap = None
        self.start_messages: list[str] = []

    def open(self) -> None:
        import cv2

        if isinstance(self.source, int):
            self.cap = self._open_webcam(cv2)
        else:
            self.cap = cv2.VideoCapture(str(self.source))

        if not self.cap.isOpened():
            raise CameraOpenError(f"No se pudo abrir {self.label}: {self.source}")

        self.start_messages.append(f"Fuente abierta: {self.label}")

    def _open_webcam(self, cv2):
        backends = [
            getattr(cv2, "CAP_DSHOW", None),
            getattr(cv2, "CAP_MSMF", None),
            None,
        ]
        for backend in backends:
            cap = cv2.VideoCapture(self.source) if backend is None else cv2.VideoCapture(self.source, backend)
            if not cap.isOpened():
                cap.release()
                continue
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, int(self.config.get("frame_width", 1280)))
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, int(self.config.get("frame_height", 720)))
            cap.set(cv2.CAP_PROP_FPS, int(self.config.get("target_fps", 20)))
            return cap
        return cv2.VideoCapture(self.source)

    def read(self) -> FrameResult:
        if self.cap is None:
            return FrameResult(False, None, "Fuente no inicializada.")
        ok, frame = self.cap.read()
        if not ok:
            return FrameResult(False, None, "No se recibio frame de la fuente de video.")
        return FrameResult(True, frame)

    def release(self) -> None:
        if self.cap is not None:
            self.cap.release()
            self.cap = None


class PhoneBrowserVideoSource:
    def __init__(self, config: dict) -> None:
        self.config = config
        self.buffer = PhoneFrameBuffer()
        self.computer_server = PhoneCameraServer(
            host=str(config.get("computer_server_host", "127.0.0.1")),
            port=int(config.get("computer_server_port", 8765)),
            https_enabled=False,
            buffer=self.buffer,
        )
        self.phone_server = PhoneCameraServer(
            host=str(config.get("phone_server_host", "0.0.0.0")),
            port=int(config.get("phone_server_port", 8766)),
            https_enabled=bool(config.get("phone_https_enabled", True)),
            buffer=self.buffer,
        )
        self.start_messages: list[str] = []
        self._last_frame_time = 0.0

    def open(self) -> None:
        self.computer_server.start()
        self.phone_server.start()
        self.start_messages = [
            "Modo navegador activo para compu o celular.",
            f"LINK PARA LA COMPU: {self.computer_server.local_url}",
            f"LINK PARA EL CELULAR: {self.phone_server.lan_url}",
            "El celular y la computadora deben estar en la misma red Wi-Fi.",
        ]
        if self.phone_server.warning:
            self.start_messages.append(self.phone_server.warning)

    def read(self) -> FrameResult:
        frame = self.buffer.latest()
        if frame is None:
            return FrameResult(True, self._placeholder(), f"Compu: {self.computer_server.local_url} | Celular: {self.phone_server.lan_url}")
        self._last_frame_time = time.time()
        return FrameResult(True, frame, f"Frames recibidos del navegador: {self.buffer.received}")

    def release(self) -> None:
        self.computer_server.stop()
        self.phone_server.stop()

    def _placeholder(self):
        import cv2
        import numpy as np

        width = int(self.config.get("frame_width", 1280))
        height = int(self.config.get("frame_height", 720))
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        cv2.putText(frame, "Compu:", (48, height // 2 - 54), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (240, 240, 240), 2)
        cv2.putText(frame, self.computer_server.local_url, (190, height // 2 - 54), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (120, 220, 255), 2)
        cv2.putText(frame, "Celular:", (48, height // 2 + 10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (240, 240, 240), 2)
        cv2.putText(frame, self.phone_server.lan_url, (190, height // 2 + 10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (120, 220, 255), 2)
        return frame


def create_video_source(config: dict):
    source_type = config.get("source_type", "webcam")
    if source_type == "webcam":
        return OpenCvVideoSource(int(config.get("camera_index", 0)), config, f"Webcam {config.get('camera_index', 0)}")
    if source_type == "ip_camera":
        url = str(config.get("camera_url", "")).strip()
        if not url:
            raise CameraOpenError("camera_url esta vacio.")
        return OpenCvVideoSource(url, config, "Camara IP")
    if source_type == "video_file":
        video_file = str(config.get("video_file", "")).strip()
        if not video_file:
            raise CameraOpenError("video_file esta vacio.")
        if not Path(video_file).exists():
            raise CameraOpenError(f"No existe el archivo de video: {video_file}")
        return OpenCvVideoSource(video_file, config, "Archivo de video")
    if source_type == "phone_browser":
        return PhoneBrowserVideoSource(config)
    raise CameraOpenError(f"source_type no soportado: {source_type}")
