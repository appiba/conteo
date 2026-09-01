from __future__ import annotations

import unittest
from datetime import datetime, timedelta

from src.analytics import TrafficAnalytics, get_report_timezone


TZ = get_report_timezone()


def at(hour: int, minute: int, second: int = 0, microsecond: int = 0) -> datetime:
    return datetime(2026, 8, 31, hour, minute, second, microsecond, tzinfo=TZ)


def add_entry(events, analytics: TrafficAnalytics, when: datetime, track_id: int, age_group: str = "SIN_DETERMINAR"):
    event = analytics.build_entry_event(
        existing_events=events,
        camera="ENTRADA_01",
        track_id=track_id,
        age_group=age_group,
        age_confidence=0.82 if age_group != "SIN_DETERMINAR" else 0.0,
        total_count=len(events) + 1,
        timestamp=when,
    )
    events.append(event)
    analytics.annotate_groups(events)
    return event


class TrafficAnalyticsTest(unittest.TestCase):
    def test_ten_people_in_one_minute(self):
        analytics = TrafficAnalytics()
        events = []
        for index in range(10):
            add_entry(events, analytics, at(17, 0, index * 6), index + 1)

        summary = analytics.summarize_day(events, full_hour_session(), now=at(17, 1, 0))

        self.assertEqual(summary["total_today"], 10)
        self.assertEqual(summary["last_1_minute"], 10)
        self.assertEqual(summary["hourly_summary"][0]["peak_people_per_minute"], 10)

    def test_thirty_people_in_five_minutes_rate_projection(self):
        analytics = TrafficAnalytics(live_rate_window_minutes=5)
        events = []
        for index in range(30):
            add_entry(events, analytics, at(17, 0, 0) + timedelta(seconds=index * 10), index + 1)

        summary = analytics.summarize_day(events, full_hour_session(), now=at(17, 5, 0))

        self.assertEqual(summary["last_5_minutes"], 30)
        self.assertEqual(summary["live_rate_per_minute"], 6.0)
        self.assertEqual(summary["projected_people_per_hour"], 360.0)

    def test_group_of_six_keeps_individual_entries(self):
        analytics = TrafficAnalytics(group_window_seconds=2)
        events = []
        for index in range(6):
            add_entry(events, analytics, at(17, 10, 0) + timedelta(milliseconds=index * 200), index + 1)

        summary = analytics.summarize_day(events, full_hour_session(), now=at(17, 10, 3))

        self.assertEqual(summary["total_today"], 6)
        self.assertEqual(summary["max_group_size"], 6)
        self.assertEqual(summary["hourly_summary"][0]["max_group_size"], 6)

    def test_hour_boundary_buckets_entries_correctly(self):
        analytics = TrafficAnalytics()
        events = []
        add_entry(events, analytics, at(17, 59, 58), 1)
        add_entry(events, analytics, at(18, 0, 3), 2)

        summary = analytics.summarize_day(events, [{"start": at(17, 0).isoformat(), "end": at(19, 0).isoformat()}], now=at(18, 1))
        counts = {item["hour"]: item["count"] for item in summary["hourly_summary"]}

        self.assertEqual(counts["17:00-17:59"], 1)
        self.assertEqual(counts["18:00-18:59"], 1)

    def test_half_hour_coverage_has_separate_estimate(self):
        analytics = TrafficAnalytics()
        events = []
        for index in range(50):
            add_entry(events, analytics, at(17, 0, 0) + timedelta(seconds=index * 30), index + 1)

        summary = analytics.summarize_day(events, [{"start": at(17, 0).isoformat(), "end": at(17, 30).isoformat()}], now=at(17, 30))
        hour = summary["hourly_summary"][0]

        self.assertEqual(hour["count"], 50)
        self.assertEqual(hour["coverage_percentage"], 50.0)
        self.assertEqual(hour["estimated_full_hour_count"], 100.0)

    def test_age_groups_sum_to_total(self):
        analytics = TrafficAnalytics()
        events = []
        for index in range(3):
            add_entry(events, analytics, at(17, 0, index), index + 1, "ADULTO")
        for index in range(2):
            add_entry(events, analytics, at(17, 1, index), index + 10, "JOVEN")
        add_entry(events, analytics, at(17, 2), 20, "NINO")

        summary = analytics.summarize_day(events, full_hour_session(), now=at(17, 3))
        hour = summary["hourly_summary"][0]

        self.assertEqual(hour["count"], 6)
        self.assertEqual(hour["adults"], 3)
        self.assertEqual(hour["youth"], 2)
        self.assertEqual(hour["children"], 1)
        self.assertEqual(sum(hour[field] for field in ("children", "adolescents", "youth", "adults", "older_adults", "undetermined")), 6)


def full_hour_session():
    return [{"start": at(17, 0).isoformat(), "end": at(18, 0).isoformat()}]


if __name__ == "__main__":
    unittest.main()
