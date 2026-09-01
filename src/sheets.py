from __future__ import annotations

import json
from typing import Any
from urllib import request


class SheetsClient:
    def __init__(self, config: dict) -> None:
        self.enabled = bool(config.get("google_sheets_enabled"))
        self.url = str(config.get("apps_script_url", "")).strip()
        self.camera_name = str(config.get("camera_name", "CAMARA_01"))

    def send_entry(self, entry: dict[str, Any] | int) -> bool:
        if isinstance(entry, int):
            entry = {
                "camera": self.camera_name,
                "event": "ENTRY",
                "total_count": int(entry),
            }
        return self._post({"type": "entry", "entry": entry})

    def send_hourly_summary(self, summary: dict[str, Any] | None) -> bool:
        if not summary:
            return False
        return self._post({"type": "hourly_summary", "summary": summary, "camera": self.camera_name})

    def _post(self, payload: dict[str, Any]) -> bool:
        if not self.enabled or not self.url:
            return False

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
