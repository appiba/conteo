from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

try:
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
except ImportError:  # pragma: no cover - Python 3.8 fallback only.
    ZoneInfo = None  # type: ignore[assignment]
    ZoneInfoNotFoundError = Exception  # type: ignore[assignment]


REPORT_TIMEZONE = "America/Guayaquil"
ECUADOR_FALLBACK_TZ = timezone(timedelta(hours=-5), REPORT_TIMEZONE)

AGE_SUMMARY_FIELDS = (
    "children",
    "adolescents",
    "youth",
    "adults",
    "older_adults",
    "undetermined",
)

AGE_GROUP_TO_FIELD = {
    "NINO": "children",
    "NINOS": "children",
    "NIÑO": "children",
    "NIÑOS": "children",
    "CHILD": "children",
    "CHILDREN": "children",
    "ADOLESCENTE": "adolescents",
    "ADOLESCENTES": "adolescents",
    "TEEN": "adolescents",
    "TEENS": "adolescents",
    "JOVEN": "youth",
    "JOVENES": "youth",
    "JÓVEN": "youth",
    "JÓVENES": "youth",
    "YOUTH": "youth",
    "ADULTO": "adults",
    "ADULTOS": "adults",
    "ADULT": "adults",
    "ADULTS": "adults",
    "ADULTO_MAYOR": "older_adults",
    "ADULTOS_MAYORES": "older_adults",
    "OLDER_ADULT": "older_adults",
    "OLDER_ADULTS": "older_adults",
    "SIN_DETERMINAR": "undetermined",
    "UNDETERMINED": "undetermined",
    "UNKNOWN": "undetermined",
}

FIELD_TO_AGE_GROUP = {
    "children": "NINO",
    "adolescents": "ADOLESCENTE",
    "youth": "JOVEN",
    "adults": "ADULTO",
    "older_adults": "ADULTO_MAYOR",
    "undetermined": "SIN_DETERMINAR",
}


@dataclass(frozen=True)
class AnalyticsConfig:
    time_bucket_minutes: int = 60
    live_rate_window_minutes: int = 5
    group_window_seconds: float = 2.0


class TrafficAnalytics:
    def __init__(
        self,
        time_bucket_minutes: int = 60,
        live_rate_window_minutes: int = 5,
        group_window_seconds: float = 2.0,
    ) -> None:
        self.config = AnalyticsConfig(
            time_bucket_minutes=max(1, int(time_bucket_minutes)),
            live_rate_window_minutes=max(1, int(live_rate_window_minutes)),
            group_window_seconds=max(0.1, float(group_window_seconds)),
        )

    def build_entry_event(
        self,
        existing_events: list[dict[str, Any]],
        camera: str,
        track_id: int | None,
        age_group: str = "SIN_DETERMINAR",
        age_confidence: float = 0.0,
        total_count: int = 0,
        timestamp: datetime | str | None = None,
    ) -> dict[str, Any]:
        event_time = to_report_time(timestamp)
        previous_time = _last_entry_time(existing_events)
        seconds_since_previous = None
        if previous_time is not None:
            seconds_since_previous = round(max(0.0, (event_time - previous_time).total_seconds()), 3)

        normalized_age_group = normalize_age_group(age_group)
        return {
            "timestamp": event_time.isoformat(timespec="milliseconds"),
            "date": event_time.strftime("%d/%m/%Y"),
            "date_key": event_time.date().isoformat(),
            "hour": event_time.hour,
            "minute": event_time.minute,
            "second": event_time.second,
            "camera": camera,
            "event": "ENTRY",
            "track_id": track_id,
            "age_group": normalized_age_group,
            "age_confidence": round(float(age_confidence or 0.0), 3),
            "total_count": int(total_count),
            "seconds_since_previous_entry": seconds_since_previous,
            "hour_bucket": bucket_label(event_time, self.config.time_bucket_minutes),
            "minute_bucket": minute_bucket_label(event_time),
            "group_id": None,
            "group_size": 1,
        }

    def annotate_groups(self, events: list[dict[str, Any]]) -> None:
        annotate_group_events(events, self.config.group_window_seconds)

    def summarize_day(
        self,
        events: list[dict[str, Any]],
        sessions: list[dict[str, Any]],
        now: datetime | str | None = None,
    ) -> dict[str, Any]:
        current_time = to_report_time(now)
        ordered_events = sorted(events, key=lambda item: item.get("timestamp", ""))
        annotate_group_events(ordered_events, self.config.group_window_seconds)

        bucket_minutes = self.config.time_bucket_minutes
        bucket_seconds = bucket_minutes * 60
        buckets = _bucket_starts_from_events(ordered_events, bucket_minutes)
        buckets.update(_bucket_starts_from_sessions(sessions, bucket_minutes, current_time))
        if not buckets:
            buckets.add(bucket_start(current_time, bucket_minutes))

        summaries = []
        for start in sorted(buckets):
            end_exclusive = start + timedelta(minutes=bucket_minutes)
            bucket_events = [
                event for event in ordered_events if start <= parse_timestamp(event["timestamp"]) < end_exclusive
            ]
            age_counts = _age_counts(bucket_events)
            minute_counts = _minute_counts(bucket_events)
            coverage_seconds = coverage_seconds_for_period(sessions, start, end_exclusive, current_time)
            coverage_percentage = round(min(100.0, (coverage_seconds / bucket_seconds) * 100.0), 1)
            estimate = None
            if coverage_seconds > 0 and len(bucket_events) > 0:
                estimate = round(len(bucket_events) * (bucket_seconds / coverage_seconds), 1)

            summaries.append(
                {
                    "hour": bucket_label(start, bucket_minutes),
                    "count": len(bucket_events),
                    **age_counts,
                    "age_percentages": _age_percentages(age_counts, len(bucket_events)),
                    "avg_seconds_between_entries": _avg_interval(bucket_events),
                    "peak_people_per_minute": max(minute_counts.values(), default=0),
                    "peak_minute": _peak_minute(minute_counts),
                    "coverage_seconds": round(coverage_seconds, 3),
                    "coverage_percentage": coverage_percentage,
                    "actual_count": len(bucket_events),
                    "estimated_full_hour_count": estimate,
                    **_group_stats(bucket_events),
                    "variation_percent": None,
                }
            )

        for index, summary in enumerate(summaries):
            if index == 0:
                continue
            previous_count = summaries[index - 1]["count"]
            if previous_count > 0:
                summary["variation_percent"] = round(((summary["count"] - previous_count) / previous_count) * 100.0, 1)

        recent_1 = events_since(ordered_events, current_time, minutes=1)
        recent_5 = events_since(ordered_events, current_time, minutes=self.config.live_rate_window_minutes)
        recent_15 = events_since(ordered_events, current_time, minutes=15)
        recent_30 = events_since(ordered_events, current_time, minutes=30)
        rate = len(recent_5) / self.config.live_rate_window_minutes
        current_bucket = bucket_label(current_time, bucket_minutes)
        current_bucket_summary = next((item for item in summaries if item["hour"] == current_bucket), None)
        ranked = sorted(summaries, key=lambda item: item["count"], reverse=True)
        covered = [item for item in summaries if item["coverage_seconds"] > 0]

        return {
            "timezone": REPORT_TIMEZONE,
            "total_today": len(ordered_events),
            "current_bucket": current_bucket,
            "current_bucket_count": current_bucket_summary["count"] if current_bucket_summary else 0,
            "current_bucket_age_counts": {
                field: current_bucket_summary[field] if current_bucket_summary else 0 for field in AGE_SUMMARY_FIELDS
            },
            "last_1_minute": len(recent_1),
            "last_5_minutes": len(recent_5),
            "last_15_minutes": len(recent_15),
            "last_30_minutes": len(recent_30),
            "live_rate_per_minute": round(rate, 2),
            "projected_people_per_hour": round(rate * 60.0, 1),
            "peak_hour": ranked[0] if ranked else None,
            "second_peak_hour": ranked[1] if len(ranked) > 1 else None,
            "lowest_hour": min(covered, key=lambda item: item["count"]) if covered else None,
            "average_people_per_hour": round(sum(item["count"] for item in covered) / len(covered), 1)
            if covered
            else 0.0,
            "hourly_summary": summaries,
            **_group_stats(ordered_events),
        }


def get_report_timezone():
    if ZoneInfo is None:
        return ECUADOR_FALLBACK_TZ
    try:
        return ZoneInfo(REPORT_TIMEZONE)
    except ZoneInfoNotFoundError:
        return ECUADOR_FALLBACK_TZ


def now_in_report_timezone() -> datetime:
    return datetime.now(get_report_timezone())


def to_report_time(value: datetime | str | None = None) -> datetime:
    if value is None:
        return now_in_report_timezone()
    if isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        parsed = value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=get_report_timezone())
    return parsed.astimezone(get_report_timezone())


def parse_timestamp(value: str) -> datetime:
    return to_report_time(value)


def normalize_age_group(value: str | None) -> str:
    key = str(value or "SIN_DETERMINAR").strip().upper().replace(" ", "_")
    field = AGE_GROUP_TO_FIELD.get(key, "undetermined")
    return FIELD_TO_AGE_GROUP[field]


def age_field(value: str | None) -> str:
    return AGE_GROUP_TO_FIELD.get(str(normalize_age_group(value)).upper(), "undetermined")


def bucket_start(value: datetime, minutes: int = 60) -> datetime:
    current = to_report_time(value)
    minute = (current.minute // minutes) * minutes if minutes < 60 else 0
    return current.replace(minute=minute, second=0, microsecond=0)


def bucket_label(value: datetime, minutes: int = 60) -> str:
    start = bucket_start(value, minutes)
    end = start + timedelta(minutes=minutes) - timedelta(minutes=1)
    return f"{start:%H:%M}-{end:%H:%M}"


def minute_bucket_label(value: datetime) -> str:
    start = to_report_time(value).replace(second=0, microsecond=0)
    end = start + timedelta(minutes=1)
    return f"{start:%H:%M}-{end:%H:%M}"


def events_since(events: list[dict[str, Any]], now: datetime, minutes: int) -> list[dict[str, Any]]:
    start = to_report_time(now) - timedelta(minutes=minutes)
    return [event for event in events if parse_timestamp(event["timestamp"]) >= start]


def coverage_seconds_for_period(
    sessions: list[dict[str, Any]],
    start: datetime,
    end_exclusive: datetime,
    now: datetime | None = None,
) -> float:
    current_time = to_report_time(now)
    total = 0.0
    for session in sessions:
        session_start_raw = session.get("start")
        if not session_start_raw:
            continue
        session_start = parse_timestamp(str(session_start_raw))
        session_end = parse_timestamp(str(session.get("end"))) if session.get("end") else current_time
        overlap_start = max(session_start, start)
        overlap_end = min(session_end, end_exclusive)
        if overlap_end > overlap_start:
            total += (overlap_end - overlap_start).total_seconds()
    return total


def annotate_group_events(events: list[dict[str, Any]], group_window_seconds: float = 2.0) -> None:
    if not events:
        return

    ordered = sorted(events, key=lambda item: item.get("timestamp", ""))
    group_id = 0
    cluster: list[dict[str, Any]] = []
    cluster_start: datetime | None = None

    def flush() -> None:
        nonlocal group_id, cluster
        if not cluster:
            return
        group_id += 1
        size = len(cluster)
        for event in cluster:
            event["group_id"] = group_id
            event["group_size"] = size
        cluster = []

    for event in ordered:
        event_time = parse_timestamp(event["timestamp"])
        if not cluster:
            cluster = [event]
            cluster_start = event_time
            continue
        assert cluster_start is not None
        if (event_time - cluster_start).total_seconds() <= group_window_seconds:
            cluster.append(event)
        else:
            flush()
            cluster = [event]
            cluster_start = event_time
    flush()


def _last_entry_time(events: list[dict[str, Any]]) -> datetime | None:
    for event in reversed(events):
        if event.get("event") == "ENTRY" and event.get("timestamp"):
            return parse_timestamp(str(event["timestamp"]))
    return None


def _bucket_starts_from_events(events: list[dict[str, Any]], minutes: int) -> set[datetime]:
    return {bucket_start(parse_timestamp(event["timestamp"]), minutes) for event in events if event.get("timestamp")}


def _bucket_starts_from_sessions(
    sessions: list[dict[str, Any]],
    minutes: int,
    now: datetime,
) -> set[datetime]:
    starts: set[datetime] = set()
    for session in sessions:
        if not session.get("start"):
            continue
        current = bucket_start(parse_timestamp(str(session["start"])), minutes)
        session_end = parse_timestamp(str(session.get("end"))) if session.get("end") else to_report_time(now)
        final = bucket_start(session_end, minutes)
        while current <= final:
            starts.add(current)
            current += timedelta(minutes=minutes)
    return starts


def _age_counts(events: list[dict[str, Any]]) -> dict[str, int]:
    counts = {field: 0 for field in AGE_SUMMARY_FIELDS}
    for event in events:
        counts[age_field(str(event.get("age_group", "SIN_DETERMINAR")))] += 1
    return counts


def _age_percentages(age_counts: dict[str, int], total: int) -> dict[str, float]:
    if total <= 0:
        return {field: 0.0 for field in AGE_SUMMARY_FIELDS}
    return {field: round((count / total) * 100.0, 1) for field, count in age_counts.items()}


def _minute_counts(events: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for event in events:
        minute = str(event.get("minute_bucket") or minute_bucket_label(parse_timestamp(event["timestamp"])))
        counts[minute] = counts.get(minute, 0) + 1
    return counts


def _peak_minute(minute_counts: dict[str, int]) -> str | None:
    if not minute_counts:
        return None
    return max(minute_counts.items(), key=lambda item: item[1])[0]


def _avg_interval(events: list[dict[str, Any]]) -> float | None:
    intervals = [
        float(event["seconds_since_previous_entry"])
        for event in events
        if event.get("seconds_since_previous_entry") is not None
    ]
    if not intervals:
        return None
    return round(sum(intervals) / len(intervals), 3)


def _group_stats(events: list[dict[str, Any]]) -> dict[str, Any]:
    groups: dict[int, int] = {}
    for event in events:
        group_id = event.get("group_id")
        if group_id is None:
            continue
        groups[int(group_id)] = int(event.get("group_size", 1))
    sizes = list(groups.values())
    if not sizes:
        return {"groups_count": 0, "average_group_size": 0.0, "max_group_size": 0}
    return {
        "groups_count": len(sizes),
        "average_group_size": round(sum(sizes) / len(sizes), 2),
        "max_group_size": max(sizes),
    }
