from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from src.config import DEFAULT_CONFIG, load_config


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


if __name__ == "__main__":
    unittest.main()
