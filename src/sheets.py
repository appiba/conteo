from __future__ import annotations

import json
from datetime import datetime
from urllib import request


class SheetsClient:
    def __init__(self, config: dict) -> None:
        self.enabled = bool(config.get("google_sheets_enabled"))
        self.url = str(config.get("apps_script_url", "")).strip()
        self.camera_name = str(config.get("camera_name", "CAMARA_01"))

    def send_entry(self, count: int) -> bool:
        if not self.enabled or not self.url:
            return False

        payload = {
            "type": "entry",
            "timestamp": datetime.now().astimezone().isoformat(timespec="seconds"),
            "camera": self.camera_name,
            "count": int(count),
        }
        data = json.dumps(payload).encode("utf-8")
        req = request.Request(
            self.url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=5) as response:
                return 200 <= response.status < 300
        except Exception as exc:
            print(f"No se pudo enviar a Google Sheets: {exc}")
            return False
