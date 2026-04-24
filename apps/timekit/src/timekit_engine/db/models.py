"""Dataclasses for database records."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SyncRun:
    id: int | None = None
    started_at: str = ""
    finished_at: str | None = None
    status: str = "running"
    calendars_seen: int = 0
    events_upserted: int = 0
    events_deleted: int = 0
    error_message: str | None = None
    date_range_start: str | None = None
    date_range_end: str | None = None


@dataclass
class Calendar:
    id: int | None = None
    ek_calendar_id: str = ""
    title: str = ""
    calendar_type: str | None = None
    source_title: str | None = None
    source_id: str | None = None
    color_hex: str | None = None
    is_writable: bool = True
    first_seen_sync_id: int | None = None
    last_seen_sync_id: int | None = None


@dataclass
class EventRaw:
    ek_event_id: str = ""
    calendar_id: int = 0
    sync_run_id: int = 0
    title: str | None = None
    start_date: str = ""
    end_date: str = ""
    is_all_day: bool = False
    location_name: str | None = None
    location_lat: float | None = None
    location_lon: float | None = None
    notes: str | None = None
    url: str | None = None
    availability: str | None = None
    status: str | None = None
    organizer_name: str | None = None
    organizer_email: str | None = None
    attendees_json: str | None = None
    recurrence_json: str | None = None
    alarms_json: str | None = None
    timezone: str | None = None
    last_modified: str | None = None
    ek_created_date: str | None = None
    content_hash: str = ""
    id: int | None = None


@dataclass
class EventCanonical:
    ek_event_id: str = ""
    latest_raw_id: int = 0
    calendar_id: int = 0
    title_original: str | None = None
    title_normalized: str | None = None
    start_date: str = ""
    end_date: str = ""
    duration_minutes: int | None = None
    is_all_day: bool = False
    location_name: str | None = None
    location_lat: float | None = None
    location_lon: float | None = None
    notes: str | None = None
    url: str | None = None
    organizer_name: str | None = None
    organizer_email: str | None = None
    attendee_count: int = 0
    is_recurring: bool = False
    timezone: str | None = None
    content_hash: str = ""
    first_seen_at: str = ""
    last_seen_at: str = ""
    deleted_at: str | None = None
    id: int | None = None


@dataclass
class Entity:
    id: int | None = None
    entity_type: str = ""
    name: str = ""
    email: str | None = None
    metadata_json: str | None = None


@dataclass
class RewriteProposal:
    id: int | None = None
    event_id: int = 0
    field_name: str = ""
    original_value: str | None = None
    proposed_value: str = ""
    model_name: str | None = None
    confidence: float | None = None
    status: str = "pending"
    reviewed_at: str | None = None
