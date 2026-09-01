from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from src.config import DEFAULT_CONFIG, load_config
from src.camera import _requested_fps, _requested_frame_size


class ConfigTest(unittest.TestCase):
    def test_load_config_writes_defaults_when_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            config = load_config(path)
            self.assertTrue(path.exists())
            self.assertEqual(config["source_type"], DEFAULT_CONFIG["source_type"])

    def test_partial_config_gets_defaults(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            path.write_text('{"source_type": "phone_browser"}', encoding="utf-8")
            config = load_config(path)
            self.assertEqual(config["source_type"], "phone_browser")
            self.assertEqual(config["phone_server_port"], DEFAULT_CONFIG["phone_server_port"])
            self.assertEqual(config["confidence"], 0.30)
            self.assertEqual(config["iou"], 0.70)
            self.assertEqual(config["imgsz"], 960)
            self.assertEqual(config["entry_direction"], "LEFT_TO_RIGHT")
            self.assertEqual(config["camera_resolution"], "1280x720")
            self.assertEqual(config["camera_fit_mode"], "fit")

    def test_camera_resolution_accepts_detected_size(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            path.write_text('{"source_type": "webcam", "camera_resolution": "960x540"}', encoding="utf-8")
            config = load_config(path)
            self.assertEqual(config["camera_resolution"], "960x540")

    def test_camera_helpers_use_camera_resolution_and_fps(self):
        config = {**DEFAULT_CONFIG, "camera_resolution": "640x480", "camera_fps": "20"}
        self.assertEqual(_requested_frame_size(config), (640, 480))
        self.assertEqual(_requested_fps(config), 20)


if __name__ == "__main__":
    unittest.main()
