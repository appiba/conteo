from __future__ import annotations

import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from src.analytics import get_report_timezone
from src.counter import CounterEvent
from src.storage import CountStorage


TZ = get_report_timezone()


class CountStorageTest(unittest.TestCase):
    def test_records_entry_without_losing_history_on_session_reset(self):
        current = [datetime(2026, 8, 31, 17, 0, 0, tzinfo=TZ)]
        with tempfile.TemporaryDirectory() as tmp:
            storage = CountStorage(
                Path(tmp) / "count.json",
                {"camera_name": "ENTRADA_01"},
                now_fn=lambda: current[0],
            )
            storage.start_session()
            storage.record_entry(CounterEvent(21, "entry", "entrada", age_group="JOVEN", age_confidence=0.8))
            storage.reset_session_counter()

            day = storage.data["days"]["2026-08-31"]
            self.assertEqual(storage.count, 1)
            self.assertEqual(len(day["events"]), 1)
            self.assertEqual(day["events"][0]["hour_bucket"], "17:00-17:59")
            self.assertEqual(day["events"][0]["age_group"], "JOVEN")

    def test_rolls_to_new_ecuador_day_without_deleting_previous_day(self):
        current = [datetime(2026, 8, 31, 23, 59, 50, tzinfo=TZ)]
        with tempfile.TemporaryDirectory() as tmp:
            storage = CountStorage(Path(tmp) / "count.json", now_fn=lambda: current[0])
            storage.record_entry(CounterEvent(1, "entry", "entrada"))
            current[0] = datetime(2026, 9, 1, 0, 0, 1, tzinfo=TZ)

            rolled = storage.rollover_if_needed()
            summary = storage.summary()

            self.assertTrue(rolled)
            self.assertEqual(storage.count, 0)
            self.assertEqual(summary["total_today"], 0)
            self.assertEqual(storage.data["days"]["2026-08-31"]["count"], 1)
            self.assertIn("2026-09-01", storage.data["days"])


if __name__ == "__main__":
    unittest.main()
