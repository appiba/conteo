from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path


class CountStorage:
    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self.date = self._today()
        self.count = 0
        self.load()

    def load(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.save()
            return

        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = {}

        stored_date = data.get("date")
        if stored_date != self._today():
            self.date = self._today()
            self.count = 0
            self.save()
            return

        self.date = stored_date
        self.count = int(data.get("count", 0))

    def increment(self, amount: int = 1) -> int:
        self.count += int(amount)
        self.save()
        return self.count

    def reset(self) -> None:
        self.date = self._today()
        self.count = 0
        self.save()

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "date": self.date,
            "count": self.count,
            "updated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        }
        self.path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    @staticmethod
    def _today() -> str:
        return datetime.now().date().isoformat()
