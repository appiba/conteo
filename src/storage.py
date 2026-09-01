from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from .analytics import REPORT_TIMEZONE, TrafficAnalytics, now_in_report_timezone, to_report_time
from .counter import CounterEvent


class CountStorage:
    def __init__(
        self,
        path: Path | str,
        config: dict[str, Any] | None = None,
        now_fn: Callable[[], datetime] | None = None,
    ) -> None:
        self.path = Path(path)
        self.config = config or {}
        self.now_fn = now_fn or now_in_report_timezone
        self.analytics = TrafficAnalytics(
            time_bucket_minutes=int(self.config.get("time_bucket_minutes", 60)),
            live_rate_window_minutes=int(self.config.get("live_rate_window_minutes", 5)),
            group_window_seconds=float(self.config.get("group_window_seconds", 2.0)),
        )
        self.camera_name = str(self.config.get("camera_name", "CAMARA_01"))
        self.data: dict[str, Any] = {"timezone": REPORT_TIMEZONE, "days": {}}
        self.date = self._today()
        self.count = 0
        self.load()

    def load(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self._ensure_day(self._today())
            self.save()
            return

        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            raw = {}

        self.data = self._normalize_payload(raw)
        self._ensure_day(self._today())
        self._sync_current_count()

    def rollover_if_needed(self) -> bool:
        current_day = self._today()
        if current_day == self.date:
            return False
        now = to_report_time(self.now_fn())
        previous_day = self.data.get("days", {}).get(self.date, {})
        had_open_session = any(not session.get("end") for session in previous_day.get("sessions", []))
        self.end_session(now)
        self._ensure_day(current_day)
        if had_open_session:
            self.start_session(timestamp=now)
        self._sync_current_count()
        self.save()
        return True

    def start_session(self, camera: str | None = None, timestamp: datetime | str | None = None) -> dict[str, Any]:
        now = to_report_time(timestamp or self.now_fn())
        day = self._ensure_day(now.date().isoformat())
        open_session = next((session for session in reversed(day["sessions"]) if not session.get("end")), None)
        if open_session is not None:
            return open_session
        session = {
            "id": len(day["sessions"]) + 1,
            "camera": camera or self.camera_name,
            "start": now.isoformat(timespec="seconds"),
            "end": None,
        }
        day["sessions"].append(session)
        self.save()
        return session

    def end_session(self, timestamp: datetime | str | None = None) -> None:
        now = to_report_time(timestamp or self.now_fn())
        for day in self.data.get("days", {}).values():
            for session in reversed(day.get("sessions", [])):
                if not session.get("end"):
                    session["end"] = now.isoformat(timespec="seconds")
                    self.save()
                    return

    def record_entry(
        self,
        event: CounterEvent | None = None,
        camera: str | None = None,
        timestamp: datetime | str | None = None,
    ) -> dict[str, Any]:
        now = to_report_time(timestamp or self.now_fn())
        day = self._ensure_day(now.date().isoformat())
        total_count = int(day.get("count", 0)) + 1
        payload = self.analytics.build_entry_event(
            existing_events=day["events"],
            camera=camera or self.camera_name,
            track_id=event.track_id if event is not None else None,
            age_group=event.age_group if event is not None else "SIN_DETERMINAR",
            age_confidence=event.age_confidence if event is not None else 0.0,
            total_count=total_count,
            timestamp=now,
        )
        day["events"].append(payload)
        self.analytics.annotate_groups(day["events"])
        day["count"] = total_count
        self.date = now.date().isoformat()
        self.count = total_count
        self.save()
        return payload

    def increment(self, amount: int = 1) -> int:
        for _ in range(int(amount)):
            self.record_entry()
        return self.count

    def reset(self) -> None:
        self.reset_session_counter()

    def reset_session_counter(self) -> int:
        day = self._ensure_day(self._today())
        day.setdefault("session_resets", []).append(to_report_time(self.now_fn()).isoformat(timespec="seconds"))
        self.save()
        return self.count

    def clear_day(self, confirm: bool = False) -> None:
        if not confirm:
            raise ValueError("clear_day requiere confirm=True para borrar datos del dia.")
        day_key = self._today()
        self.data["days"][day_key] = self._empty_day(day_key)
        self._sync_current_count()
        self.save()

    def summary(self, date_key: str | None = None, now: datetime | str | None = None) -> dict[str, Any]:
        day_key = date_key or self._today()
        day = self._ensure_day(day_key)
        return self.analytics.summarize_day(day["events"], day["sessions"], now=now or self.now_fn())

    def current_hour_summary(self, now: datetime | str | None = None) -> dict[str, Any] | None:
        summary = self.summary(now=now)
        current_bucket = summary["current_bucket"]
        return next((item for item in summary["hourly_summary"] if item["hour"] == current_bucket), None)

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.data["timezone"] = REPORT_TIMEZONE
        self.data["current_date"] = self.date
        self.data["count"] = self.count
        self.data["updated_at"] = to_report_time(self.now_fn()).isoformat(timespec="seconds")
        self.path.write_text(json.dumps(self.data, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    def _normalize_payload(self, raw: dict[str, Any]) -> dict[str, Any]:
        if isinstance(raw, dict) and isinstance(raw.get("days"), dict):
            payload = raw
            payload.setdefault("timezone", REPORT_TIMEZONE)
            for day_key, day in list(payload["days"].items()):
                payload["days"][day_key] = self._normalize_day(day_key, day)
            return payload

        legacy_date = str(raw.get("date") or self._today()) if isinstance(raw, dict) else self._today()
        legacy_count = int(raw.get("count", 0)) if isinstance(raw, dict) else 0
        return {
            "timezone": REPORT_TIMEZONE,
            "current_date": legacy_date,
            "count": legacy_count,
            "days": {
                legacy_date: {
                    **self._empty_day(legacy_date),
                    "count": legacy_count,
                }
            },
        }

    def _normalize_day(self, day_key: str, value: Any) -> dict[str, Any]:
        day = self._empty_day(day_key)
        if isinstance(value, dict):
            day["count"] = int(value.get("count", len(value.get("events", []))))
            day["events"] = list(value.get("events", []))
            day["sessions"] = list(value.get("sessions", []))
            day["session_resets"] = list(value.get("session_resets", []))
        return day

    def _ensure_day(self, day_key: str) -> dict[str, Any]:
        self.data.setdefault("days", {})
        if day_key not in self.data["days"]:
            self.data["days"][day_key] = self._empty_day(day_key)
        if day_key == self._today():
            self.date = day_key
            self.count = int(self.data["days"][day_key].get("count", 0))
        return self.data["days"][day_key]

    def _sync_current_count(self) -> None:
        self.date = self._today()
        day = self._ensure_day(self.date)
        self.count = int(day.get("count", 0))

    def _today(self) -> str:
        return to_report_time(self.now_fn()).date().isoformat()

    @staticmethod
    def _empty_day(day_key: str) -> dict[str, Any]:
        return {
            "date": day_key,
            "count": 0,
            "events": [],
            "sessions": [],
            "session_resets": [],
        }
