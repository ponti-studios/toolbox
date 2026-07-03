-- +goose Up
-- +goose StatementBegin

-- ============================================================================
-- INITIAL SCHEMA — warehouse database
-- ============================================================================
-- Extracted from the production database at ~/.hominem/warehouse.db.
-- This is the canonical schema for all 175 tables, 7 views, and 40 indexes.
-- Schema version as of July 2026.
--
-- Table naming conventions:
--   finance_*     — Bank-grade ledger, accounts, categories, reconciliation
--   amazon_*      — Amazon purchases, returns, orders
--   music_*       — Unified music library (tracks, artists, albums, play history)
--   people        — People graph, contact methods, relationships, aliases
--   career_*      — Career positions, applications, stages, offers, education
--   calendar_*    — Calendar events, categories, types, tags, people
--   media_*       — Media items, collections, activity log, subscriptions
--   place_*       — Places visited, geocoded locations, collections, reviews
--   health_*      — Health metrics (weight, BP, heart rate, sleep, body composition)
--   life_events   — Personal journal with category + sentiment
--   reading_*     — Book highlights, reading sessions, shelves
--   tasks         — Task tracking
--   signal_*      — Signal messaging exports
--   google_*      — Google exports (play purchases, saved items, device registry)
--   myfitnesspal_* — MyFitnessPal raw export tables
--   llm_*         — LLM conversation and message history
--   openrouter_activity — OpenRouter API usage
--   hinge_*       — Hinge app exports (structure only, no PII)
--   social_*      — Social media connections
--   possessions_* — Physical possessions inventory
--   books         — Consolidated Kindle/Apple Books metadata
--   art/artworks  — Art collection inventory
--   tattoos       — Tattoo registry
--   purchases     — General purchase tracking
--   trips/trip_*  — Travel history
--   accounts      — Service account registry
-- ============================================================================

CREATE TABLE IF NOT EXISTS "account_aliases" ("id" TEXT, "alias" TEXT, "canonical_name" TEXT, "account_id" TEXT, "confidence_score" TEXT, "validation_count" TEXT, "last_seen_at" TEXT, "created_at" TEXT);
CREATE TABLE IF NOT EXISTS "activities" ("id" TEXT, "trip_id" TEXT, "date" TEXT, "type" TEXT, "name" TEXT, "location" TEXT, "notes" TEXT, "details" TEXT);
CREATE TABLE IF NOT EXISTS "activity_log" ("id" TEXT, "entity_id" TEXT, "action" TEXT, "domain" TEXT, "description" TEXT, "metadata" TEXT, "created_at" TEXT);
CREATE TABLE IF NOT EXISTS "activity_people" ("activity_id" TEXT, "person_id" TEXT, "role" TEXT);
CREATE TABLE IF NOT EXISTS "activity_types" ("id" TEXT, "name" TEXT, "category" TEXT, "description" TEXT, "created_at" TEXT);
CREATE TABLE IF NOT EXISTS "calendar_event_type_mappings" ("id" TEXT, "raw_summary" TEXT, "event_type_id" TEXT, "category_id" TEXT, "extracted_detail" TEXT, "extracted_person" TEXT, "confidence_score" TEXT, "format_class" TEXT, "notes" TEXT, "created_at" TEXT);
CREATE TABLE IF NOT EXISTS "calendar_event_types" ("id" TEXT, "category_id" TEXT, "name" TEXT, "description" TEXT, "emoji" TEXT, "is_active" TEXT, "frequency_score" TEXT, "format_class" TEXT, "parsing_rule" TEXT, "created_at" TEXT);
CREATE TABLE IF NOT EXISTS "calendar_events" ("id" TEXT, "calendar_name" TEXT, "start_time" TEXT, "end_time" TEXT, "summary" TEXT, "location" TEXT, "description" TEXT, "status" TEXT, "uid" TEXT, "recurrence_rule" TEXT, "organizer" TEXT, "attendees" TEXT, "created_at" TEXT, "dtstamp" TEXT, "last_modified" TEXT, "event_type_id" TEXT, "category_id" TEXT, "extracted_detail" TEXT, "extracted_person" TEXT, "confidence_score" TEXT, "format_class" TEXT, trip_id INTEGER, place_id INTEGER, source TEXT, source_row_id INTEGER, is_all_day INTEGER DEFAULT 0, metadata TEXT, activity_type TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS "calendar_summary_map" ("id" TEXT, "event_id" TEXT, "original_summary" TEXT, "new_summary" TEXT, "type_detected" TEXT, "people_extracted" TEXT, "yaml_valid" TEXT, "migration_timestamp" TEXT);
CREATE TABLE IF NOT EXISTS "people_contacts" ("id" TEXT, "user_id" TEXT, "first_name" TEXT, "last_name" TEXT, "email" TEXT, "phone" TEXT, "linkedin_url" TEXT, "title" TEXT, "notes" TEXT, "created_at" TEXT, "updated_at" TEXT, "sqlite_id" TEXT, "source_db" TEXT, "name" TEXT, "organization" TEXT, "source_file" TEXT, "extra" TEXT);
CREATE TABLE IF NOT EXISTS "domains" ("id" TEXT, "site" TEXT, "registrar" TEXT, "purchased" TEXT);
CREATE TABLE IF NOT EXISTS "people_family" ("id" TEXT, "name" TEXT, "relation" TEXT, "birthdate" TEXT, "birthplace" TEXT);
CREATE TABLE IF NOT EXISTS "media_games" ("id" TEXT, "game_title" TEXT, "platform" TEXT, "release_year" TEXT);
CREATE TABLE IF NOT EXISTS "health_log" ("id" TEXT, "timestamp" TEXT, "platform" TEXT, "metric_type" TEXT, "value" TEXT, "unit" TEXT, "source_file" TEXT);
CREATE TABLE IF NOT EXISTS "health_sleep" ("id" TEXT, "start_time" TEXT, "end_time" TEXT, "light_sleep_seconds" TEXT, "deep_sleep_seconds" TEXT, "rem_sleep_seconds" TEXT, "awake_seconds" TEXT, "wake_up_count" TEXT, "duration_to_sleep_seconds" TEXT, "duration_to_wake_seconds" TEXT, "snoring_seconds" TEXT, "snoring_episodes" TEXT, "avg_heart_rate" TEXT, "min_heart_rate" TEXT, "max_heart_rate" TEXT, "source" TEXT);
CREATE TABLE IF NOT EXISTS "hinge_media" ("type" TEXT, "url" TEXT, "from_social_media" TEXT);
CREATE TABLE IF NOT EXISTS "hinge_prompts" ("id" TEXT, "prompt" TEXT, "type" TEXT, "text" TEXT, "user_updated" TEXT, "created" TEXT);
CREATE TABLE IF NOT EXISTS "hinge_user" ("location" TEXT, "profile" TEXT, "preferences" TEXT, "identity" TEXT, "account" TEXT, "devices" TEXT);
CREATE TABLE IF NOT EXISTS "tasks_hominem" ("user_story" TEXT, "ui_screen_type" TEXT, "tags" TEXT);
CREATE TABLE IF NOT EXISTS "places_hotels" ("id" TEXT, "trip_id" TEXT, "hotel_name" TEXT, "check_in_date" TEXT, "check_out_date" TEXT, "city" TEXT, "state" TEXT, "country" TEXT, "price" TEXT, "status" TEXT, "number_of_travelers" TEXT, "notes" TEXT, "location_id" TEXT);
CREATE TABLE IF NOT EXISTS "turbotax_filing" ("authId" TEXT, "filingId" TEXT, "filingType" TEXT, "app_name" TEXT, "tax_year" TEXT, "rxTimestamp" TEXT, "postmark" TEXT);
CREATE TABLE IF NOT EXISTS "item" ("id" TEXT, "type" TEXT, "createdAt" TEXT, "updatedAt" TEXT, "itemId" TEXT, "listId" TEXT, "userId" TEXT, "itemType" TEXT);
CREATE TABLE IF NOT EXISTS "planning_results" ("id" TEXT, "name" TEXT, "objectives" TEXT, "category" TEXT, "type" TEXT, "blocked_by" TEXT, "blocking" TEXT, "date" TEXT, "parent_item" TEXT, "status" TEXT, "sub_item" TEXT);
CREATE TABLE IF NOT EXISTS "list" ("id" TEXT, "name" TEXT, "description" TEXT, "ownerId" TEXT, "createdAt" TEXT, "updatedAt" TEXT, "isPublic" TEXT);
CREATE TABLE IF NOT EXISTS "list_invite" ("accepted" TEXT, "listId" TEXT, "invitedUserEmail" TEXT, "invitedUserId" TEXT, "userId" TEXT, "acceptedAt" TEXT, "token" TEXT, "createdAt" TEXT, "updatedAt" TEXT);
CREATE TABLE IF NOT EXISTS "business_planning_inputs" ("Metric" TEXT, "Values" TEXT);
CREATE TABLE IF NOT EXISTS "business_planning_revenue" ("Monthly Subscription (MRR)" TEXT, "Monthly Subscription (ARR)" TEXT, "Annual Subscription (MRR)" TEXT, "Annual Subscription (ARR)" TEXT);
CREATE TABLE IF NOT EXISTS "possessions_crystals" ("Crystal" TEXT, "Identification" TEXT, "Metaphysical Meaning & Use" TEXT);
CREATE TABLE IF NOT EXISTS "health_vitamins" ("Category" TEXT, "Details / Dose" TEXT, "Notes" TEXT);
CREATE TABLE IF NOT EXISTS "myfitnesspal_activities" ("from" TEXT, "to" TEXT, "from (manual)" TEXT, "to (manual)" TEXT, "Timezone" TEXT, "Activity type" TEXT, "Data" TEXT, "Modified" TEXT, "GPS" TEXT);
CREATE TABLE IF NOT EXISTS "myfitnesspal_aggregates_calories_earned" ("date" TEXT, "value" TEXT);
CREATE TABLE IF NOT EXISTS "myfitnesspal_aggregates_calories_passive" ("date" TEXT, "value" TEXT);
CREATE TABLE IF NOT EXISTS "myfitnesspal_aggregates_distance" ("date" TEXT, "value" TEXT);
CREATE TABLE IF NOT EXISTS "myfitnesspal_aggregates_elevation" ("date" TEXT, "value" TEXT);
CREATE TABLE IF NOT EXISTS "myfitnesspal_aggregates_steps" ("date" TEXT, "value" TEXT);
CREATE TABLE IF NOT EXISTS "myfitnesspal_bp" ("Date" TEXT, "Heart rate" TEXT, "Systolic" TEXT, "Diastolic" TEXT, "Comments" TEXT);
CREATE TABLE IF NOT EXISTS "myfitnesspal_height" ("Date" TEXT, "Height (in)" TEXT, "Comments" TEXT);
CREATE TABLE IF NOT EXISTS "myfitnesspal_raw_tracker_calories_earned" ("start" TEXT, "duration" TEXT, "value" TEXT);
CREATE TABLE IF NOT EXISTS "myfitnesspal_raw_tracker_distance" ("start" TEXT, "duration" TEXT, "value" TEXT);
CREATE TABLE IF NOT EXISTS "myfitnesspal_raw_tracker_elevation" ("start" TEXT, "duration" TEXT, "value" TEXT);
CREATE TABLE IF NOT EXISTS "myfitnesspal_raw_tracker_hr" ("start" TEXT, "duration" TEXT, "value" TEXT);
CREATE TABLE IF NOT EXISTS "myfitnesspal_raw_tracker_steps" ("start" TEXT, "duration" TEXT, "value" TEXT);
CREATE TABLE IF NOT EXISTS "notes" ("id" TEXT, "title" TEXT, "content" TEXT, "folder" TEXT, "source_file" TEXT, "created_at" TEXT, "updated_at" TEXT, note_type TEXT, tags TEXT, linked_to TEXT);
CREATE TABLE IF NOT EXISTS "planning_objectives" ("id" TEXT, "name" TEXT, "domain" TEXT);
CREATE TABLE IF NOT EXISTS "payment_methods" ("id" TEXT, "provider" TEXT, "payment_method" TEXT, "country" TEXT, "postal_code" TEXT, "creation_date" TEXT, "source" TEXT);
CREATE TABLE IF NOT EXISTS "people" ("id" TEXT, "first_name" TEXT, "last_name" TEXT, "middle_name" TEXT, "notes" TEXT);
CREATE TABLE IF NOT EXISTS "personal_sizes" ("id" TEXT, "type" TEXT, "size" TEXT, "us_size" TEXT, "uk_size" TEXT, "mm" TEXT);
CREATE TABLE IF NOT EXISTS "phone_numbers" ("id" TEXT, "location" TEXT, "phone_number" TEXT);
CREATE TABLE IF NOT EXISTS "place" ("id" TEXT, "name" TEXT, "description" TEXT, "address" TEXT, "createdAt" TEXT, "updatedAt" TEXT, "itemId" TEXT, "google_maps_id" TEXT, "types" TEXT, "imageUrl" TEXT, "phoneNumber" TEXT, "rating" TEXT, "websiteUri" TEXT, "latitude" TEXT, "longitude" TEXT, "location" TEXT, "best_for" TEXT, "is_public" TEXT, "wifi_info" TEXT, "photos" TEXT, "priceLevel" TEXT, "business_status" TEXT, "opening_hours" TEXT);
CREATE TABLE IF NOT EXISTS "media_podcast_plays" ("id" TEXT, "episode_name" TEXT, "show_name" TEXT, "end_time" TEXT, "ms_played" TEXT, "source" TEXT, "spotify_episode_uri" TEXT, "spotify_track_uri" TEXT);
CREATE TABLE IF NOT EXISTS "possessions" ("id" TEXT, "name" TEXT, "brand" TEXT, "model" TEXT, "category" TEXT, "sub_category" TEXT, "status" TEXT, "acquired_date" TEXT, "retired_date" TEXT, "price" TEXT, "sell_price" TEXT, "net_value" TEXT, "url" TEXT, "image_url" TEXT, "notes" TEXT, "serial_number" TEXT, "size" TEXT, "color" TEXT, "placement" TEXT, "artist" TEXT, "daily_cost" TEXT, "days_owned" TEXT, "amount" TEXT, "amount_unit" TEXT, possession_type TEXT, source_table TEXT, source_row_id INTEGER, metadata TEXT);
CREATE TABLE IF NOT EXISTS "possessions_containers" ("id" TEXT, "possession_id" TEXT, "type" TEXT, "label" TEXT, "tare_weight_g" TEXT);
CREATE TABLE IF NOT EXISTS "possessions_usage" ("id" TEXT, "possession_id" TEXT, "container_id" TEXT, "type" TEXT, "timestamp" TEXT, "amount" TEXT, "amount_unit" TEXT, "method" TEXT, "start_date" TEXT, "end_date" TEXT);
CREATE TABLE IF NOT EXISTS "people_relationships" ("id" TEXT, "name" TEXT, "date_started" TEXT, "kiss" TEXT, "sex" TEXT, "location" TEXT, "profession" TEXT, "education" TEXT, "diet" TEXT, "details" TEXT, "date_ended" TEXT, "attractiveness_score" TEXT, "age" TEXT);
CREATE TABLE IF NOT EXISTS "residences" ("id" TEXT, "address" TEXT, "start_date" TEXT, "end_date" TEXT, "sqft" TEXT, "start_rent" TEXT, "end_rent" TEXT, "contact_email" TEXT, "contact_number" TEXT);
CREATE TABLE IF NOT EXISTS "schools" ("id" TEXT, "name" TEXT, "start_date" TEXT, "end_date" TEXT);
CREATE TABLE IF NOT EXISTS "services" ("id" TEXT, "company" TEXT, "address" TEXT, "password_changed" TEXT);
CREATE TABLE IF NOT EXISTS "social_comments" ("id" TEXT, "platform" TEXT, "timestamp" TEXT, "username" TEXT, "text" TEXT);
CREATE TABLE IF NOT EXISTS "social_connections" ("id" TEXT, "platform" TEXT, "connection_type" TEXT, "username" TEXT, "timestamp" TEXT);
CREATE TABLE IF NOT EXISTS "social_likes" ("id" TEXT, "platform" TEXT, "timestamp" TEXT, "target_username" TEXT, "target_type" TEXT, "reaction" TEXT);
CREATE TABLE IF NOT EXISTS "social_media" ("id" TEXT, "handle" TEXT, "platform" TEXT);
CREATE TABLE IF NOT EXISTS "social_messages" ("id" TEXT, "platform" TEXT, "timestamp" TEXT, "sender" TEXT, "receiver" TEXT, "text" TEXT, "media_url" TEXT, "story_share" TEXT, "metadata" TEXT);
CREATE TABLE IF NOT EXISTS "social_posts" ("id" TEXT, "platform" TEXT, "post_type" TEXT, "caption" TEXT, "location" TEXT, "timestamp" TEXT, "path" TEXT, "metadata" TEXT, "media_url" TEXT);
CREATE TABLE IF NOT EXISTS "tags" ("id" TEXT, "name" TEXT, "user_id" TEXT, "description" TEXT, "color" TEXT, "sqlite_id" TEXT, "source_db" TEXT, "domain" TEXT, "usage_count" TEXT, "extra" TEXT);
CREATE TABLE IF NOT EXISTS "tarot_readings" ("id" TEXT, "date" TEXT, "card" TEXT, "notes" TEXT);
CREATE TABLE IF NOT EXISTS "possessions_acquisition" ("id" TEXT, "value" TEXT, "timestamp" TEXT);
CREATE TABLE IF NOT EXISTS "possessions_usage_log" ("id" TEXT, "timestamp" TEXT, "amount" TEXT, "container_id" TEXT, "type" TEXT, "start_date" TEXT, "end_date" TEXT, "amount_per_day" TEXT);
CREATE TABLE IF NOT EXISTS "transportation" ("id" TEXT, "trip_id" TEXT, "date" TEXT, "type" TEXT, "from_location" TEXT, "to_location" TEXT, "cost" TEXT, "notes" TEXT, "transportation_type_id" TEXT);
CREATE TABLE IF NOT EXISTS "transportation_types" ("id" TEXT, "name" TEXT, "category" TEXT, "description" TEXT, "created_at" TEXT);
CREATE TABLE IF NOT EXISTS "trip_attendees" ("trip_id" TEXT, "person_id" TEXT, "role" TEXT);
CREATE TABLE IF NOT EXISTS "trip_categories" ("id" TEXT, "trip_id" TEXT, "category" TEXT, "created_at" TEXT);
CREATE TABLE IF NOT EXISTS "trip_tags" ("id" TEXT, "trip_id" TEXT, "tag" TEXT, "created_at" TEXT);
CREATE TABLE IF NOT EXISTS "trips" ("id" TEXT, "name" TEXT, "start_date" TEXT, "end_date" TEXT, "user_id" TEXT, "created_at" TEXT, "updated_at" TEXT, "sqlite_id" TEXT, "source_db" TEXT, "city" TEXT, "state" TEXT, "country" TEXT, "people" TEXT, "travel_details" TEXT, "price" TEXT, "num_of_travelers" TEXT, "location_id" TEXT, "extra" TEXT);
CREATE TABLE IF NOT EXISTS "user_lists" ("createdAt" TEXT, "updatedAt" TEXT, "listId" TEXT, "userId" TEXT);
CREATE TABLE IF NOT EXISTS "users" ("id" TEXT, "email" TEXT, "name" TEXT, "image" TEXT, "supabase_id" TEXT, "isAdmin" TEXT, "createdAt" TEXT, "updatedAt" TEXT, "emailVerified" TEXT, "photo_url" TEXT, "birthday" TEXT, "primary_auth_subject_id" TEXT, "better_auth_user_id" TEXT);
CREATE TABLE IF NOT EXISTS "locations_cities" ("﻿Name" TEXT, "Continent" TEXT, "Country" TEXT, "Status" TEXT);
CREATE TABLE IF NOT EXISTS "google_devices" ("Device Type" TEXT, "Brand Name" TEXT, "Marketing Name" TEXT, "OS" TEXT, "OS Version" TEXT, "Device Model" TEXT, "User Given Name" TEXT, "Device Last Location" TEXT, "Gaia ID" TEXT);
CREATE TABLE IF NOT EXISTS "google_activities" ("Gaia ID" TEXT, "Activity Timestamp" TEXT, "IP Address" TEXT, "Proxiedhost IP Address" TEXT, "Is Non-routable IP Address" TEXT, "Activity Country" TEXT, "Activity Region" TEXT, "Activity City" TEXT, "User Agent String" TEXT, "Product Name" TEXT, "Sub-Product Name" TEXT, "Activity Type" TEXT, "Gmail Access Channel" TEXT);
CREATE TABLE IF NOT EXISTS "turbotax_filing_order" ("orderNumber" TEXT, "orderStatus" TEXT, "createdDate" TEXT, "accountId" TEXT, "accountGivenName" TEXT, "accountMiddleName" TEXT, "accountOrganizationName" TEXT, "accountFamilyName" TEXT, "accountPhoneNumber" TEXT, "accountOrganizationPhoneNumber" TEXT, "addressLine1" TEXT, "addressLine2" TEXT, "addressLine3" TEXT, "city" TEXT, "stateOrProvince" TEXT, "locality" TEXT, "region" TEXT, "postalCode" TEXT, "postalExt" TEXT, "subRegion" TEXT, "country" TEXT, "accountEmail" TEXT, "accountOrganizationEmail" TEXT, "accountAuthId" TEXT, "paymentMethodCategory" TEXT, "paymentAuthorizationIds" TEXT, "paymentMethods" TEXT, "paymentMethodAttributes" TEXT, tax_year TEXT);
CREATE TABLE IF NOT EXISTS "tasks_prolog" ("ID" TEXT, "Team" TEXT, "Title" TEXT, "Description" TEXT, "Status" TEXT, "Estimate" TEXT, "Priority" TEXT, "Project ID" TEXT, "Project" TEXT, "Creator" TEXT, "Assignee" TEXT, "Labels" TEXT, "Cycle Number" TEXT, "Cycle Name" TEXT, "Cycle Start" TEXT, "Cycle End" TEXT, "Created" TEXT, "Updated" TEXT, "Started" TEXT, "Triaged" TEXT, "Completed" TEXT, "Canceled" TEXT, "Archived" TEXT, "Due Date" TEXT, "Parent issue" TEXT, "Initiatives" TEXT, "Project Milestone ID" TEXT, "Project Milestone" TEXT, "SLA Status" TEXT, "Roadmaps" TEXT);
CREATE TABLE IF NOT EXISTS "tasks_kensho" ("Summary" TEXT, "Issue key" TEXT, "Issue id" TEXT, "Issue Type" TEXT, "Status" TEXT, "Project key" TEXT, "Project name" TEXT, "Project type" TEXT, "Project lead" TEXT, "Project description" TEXT, "Project url" TEXT, "Priority" TEXT, "Resolution" TEXT, "Assignee" TEXT, "Reporter" TEXT, "Creator" TEXT, "Created" TEXT, "Updated" TEXT, "Last Viewed" TEXT, "Resolved" TEXT, "Components" TEXT, "Components_1" TEXT, "Components_2" TEXT, "Due date" TEXT, "Votes" TEXT, "Description" TEXT, "Environment" TEXT, "Watchers" TEXT, "Watchers_1" TEXT, "Watchers_2" TEXT, "Watchers_3" TEXT, "Original Estimate" TEXT, "Remaining Estimate" TEXT, "Time Spent" TEXT, "Work Ratio" TEXT, "Σ Original Estimate" TEXT, "Σ Remaining Estimate" TEXT, "Σ Time Spent" TEXT, "Security Level" TEXT, "Custom field (Additional Information)" TEXT, "Custom field (Business Sponsor)" TEXT, "Custom field (CIQ Key Dev Type)" TEXT, "Custom field (Can the project be sent to the offshore teams?)" TEXT, "Custom field (Can the project proceed?)" TEXT, "Custom field (Checklist Completed)" TEXT, "Custom field (Checklist Content YAML)" TEXT, "Custom field (Checklist Progress)" TEXT, "Custom field (Checklist Text)" TEXT, "Custom field (Customer Request Type)" TEXT, "Custom field (DQ Effort)" TEXT, "Custom field (DQ time costs (days))" TEXT, "Custom field (Deadline)" TEXT, "Custom field (Delivery Date)" TEXT, "Custom field (Description - Kubernetes)" TEXT, "Custom field (Description - New Project)" TEXT, "Custom field (Description-Jenkins)" TEXT, "Custom field (Development)" TEXT, "Custom field (Difficulty)" TEXT, "Custom field (Epic Color)" TEXT, "Custom field (Epic Link)" TEXT, "Custom field (Epic Name)" TEXT, "Custom field (Epic Status)" TEXT, "Custom field (Escalation outcome)" TEXT, "Custom field (Event Requested)" TEXT, "Custom field (Events Team Effort)" TEXT, "Custom field (Events Team time cost (days))" TEXT, "Custom field (Eventset Name)" TEXT, "Custom field (Frequency of Event)" TEXT, "Custom field (Full set annotation agreement?)" TEXT, "Custom field (Happy Meter)" TEXT, "Custom field (Instrument)" TEXT, "Custom field (Issue color)" TEXT, "Custom field (Kensho Event Type)" TEXT, "Custom field (Komitto Name)" TEXT, "Custom field (ML Team Effort)" TEXT, "Custom field (ML Team time cost (days))" TEXT, "Custom field (Model performance?)" TEXT, "Custom field (Model predictions are reasonable?)" TEXT, "Custom field (Model spec approved?)" TEXT, "Custom field (Outcome)" TEXT, "Custom field (Post-mortem Link)" TEXT, "Custom field (Primary Source URL)" TEXT, "Custom field (Rank)" TEXT, "Custom field (Request participants)" TEXT, "Custom field (Requested By)" TEXT, "Custom field (Requester Email)" TEXT, "Custom field (Requester Email)_1" TEXT, "Custom field (Requesting Institution)" TEXT, "Custom field (Retraining necessary?)" TEXT, "Satisfaction rating" TEXT, "Custom field (Secondary Source URL)" TEXT, "Custom field (Specification Due Date)" TEXT, "Custom field (Start date)" TEXT, "Custom field (Story Points)" TEXT, "Custom field (Story point estimate)" TEXT, "Custom field (Tech Point)" TEXT, "Custom field (Time to resolution)" TEXT, "Custom field (Trial set annotation agreement?)" TEXT, "Custom field (User Feedback)" TEXT, "Custom field (VSTS Link)" TEXT, "Custom field (Why Would Someone Care?)" TEXT, "Custom field ([CHART] Date of First Response)" TEXT, "Comment" TEXT, "Comment_1" TEXT, "Comment_2" TEXT, "Comment_3" TEXT, "Comment_4" TEXT);
CREATE TABLE media_youtube (
  "Video ID" TEXT,
  "Playlist Video Creation Timestamp" TEXT,
  list TEXT
);
CREATE TABLE favorites (
  "Title" TEXT,
  "Note" TEXT,
  "URL" TEXT,
  "Comment" TEXT,
  category TEXT
);
CREATE TABLE IF NOT EXISTS "media_backlog" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content_type TEXT,
  series_name TEXT,
  season INTEGER,
  episode INTEGER,
  status TEXT DEFAULT 'want_to_watch',
  first_watched TEXT,
  last_watched TEXT,
  watch_count INTEGER DEFAULT 0,
  seconds_watched REAL,
  quality TEXT,
  device TEXT,
  rating REAL,
  notes TEXT,
  letterboxd_id TEXT,
  sources TEXT,
  added_date TEXT
);

CREATE TABLE IF NOT EXISTS "amazon_purchases"(
  id TEXT,
  order_date TEXT,
  order_id TEXT,
  title,
  category TEXT,
  asin_isbn,
  purchase_price_per_unit TEXT,
  quantity TEXT,
  shipment_date TEXT,
  shipping_address_name TEXT,
  shipping_address_street_1 TEXT,
  shipping_address_street_2 TEXT,
  shipping_address_city TEXT,
  shipping_address_state TEXT,
  shipping_address_zip TEXT,
  order_status TEXT,
  carrier_name_and_tracking_number TEXT,
  item_subtotal TEXT,
  item_subtotal_tax TEXT,
  item_total TEXT,
  purchase_order_number TEXT,
  currency TEXT,
  product_condition TEXT,
  payment_instrument_type TEXT,
  shipment_status TEXT,
  shipping_option TEXT,
  gift_message TEXT,
  gift_sender_name TEXT,
  item_serial_number TEXT
, purchase_channel TEXT DEFAULT 'online', transaction_place TEXT, amazon_orders_id INTEGER REFERENCES amazon_orders(id));
CREATE TABLE IF NOT EXISTS "tasks" (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'todo',
  completed   INTEGER DEFAULT 0,
  priority    INTEGER DEFAULT 4,
  list        TEXT,
  section     TEXT,
  section_id  TEXT,
  project     TEXT,
  parent_id   TEXT,
  due_date    TEXT,
  recurrence  TEXT,
  estimate    TEXT,
  tags        TEXT,
  source_id   TEXT,
  created_at  TEXT,
  completed_at TEXT
);
CREATE TABLE music_artists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL COLLATE NOCASE,
  sort_name  TEXT,
  spotify_id TEXT    UNIQUE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(name COLLATE NOCASE)
);
CREATE TABLE music_albums (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL COLLATE NOCASE,
  artist_id    INTEGER REFERENCES music_artists(id) ON DELETE SET NULL,
  release_date TEXT,
  genre        TEXT,
  spotify_id   TEXT    UNIQUE,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(title COLLATE NOCASE, artist_id)
);
CREATE TABLE music_tracks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL COLLATE NOCASE,
  artist_id    INTEGER REFERENCES music_artists(id) ON DELETE SET NULL,
  album_id     INTEGER REFERENCES music_albums(id)  ON DELETE SET NULL,
  duration_ms  INTEGER,
  genre        TEXT,
  release_date TEXT,
  spotify_id   TEXT    UNIQUE,
  popularity   INTEGER,
  preview_url  TEXT,
  genres       TEXT,
  bpm          INTEGER,
  composer     TEXT,
  play_count   INTEGER DEFAULT 0,
  skip_count   INTEGER DEFAULT 0,
  rating       INTEGER,
  like_rating  TEXT,
  is_purchased INTEGER DEFAULT 0 CHECK(is_purchased IN (0,1)),
  is_compilation INTEGER DEFAULT 0 CHECK(is_compilation IN (0,1)),
  content_type TEXT,
  sort_title   TEXT,
  sort_artist  TEXT,
  sort_album   TEXT,
  disc_number  INTEGER,
  track_number INTEGER,
  date_added_to_library TEXT,
  last_modified_date    TEXT,
  last_played_at        TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
, enriched_at TEXT);
CREATE TABLE music_play_history (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  played_at        TEXT    NOT NULL,
  platform         TEXT    NOT NULL CHECK(platform IN ('spotify','apple_music','youtube_music','amazon_music','unknown')),
  track_id         INTEGER REFERENCES music_tracks(id) ON DELETE SET NULL,
  track_name       TEXT,
  artist_name      TEXT,
  ms_played        INTEGER,
  reason_start     TEXT,
  reason_end       TEXT,
  shuffle          INTEGER CHECK(shuffle IN (0,1,NULL)),
  skipped          INTEGER CHECK(skipped IN (0,1,NULL)),
  interaction_type TEXT,
  source_table     TEXT,
  original_id      TEXT
);
CREATE TABLE music_playlists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,
  name        TEXT,
  description TEXT,
  is_favorite INTEGER DEFAULT 0,
  visibility  TEXT,
  created_at  TEXT,
  updated_at  TEXT
);
CREATE TABLE music_playlist_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id INTEGER NOT NULL REFERENCES music_playlists(id) ON DELETE CASCADE,
  track_id    INTEGER REFERENCES music_tracks(id) ON DELETE SET NULL,
  track_name  TEXT,
  artist_name TEXT,
  position    INTEGER,
  added_at    TEXT
);
CREATE TABLE account_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL,
  account_id INTEGER,
  service TEXT,
  product TEXT,
  sub_product TEXT,
  activity_type TEXT,
  occurred_at TEXT,
  ip_address TEXT,
  proxied_ip_address TEXT,
  is_non_routable_ip INTEGER,
  country TEXT,
  region TEXT,
  city TEXT,
  user_agent TEXT,
  metadata TEXT,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(person_id) REFERENCES people(id),
  FOREIGN KEY(account_id) REFERENCES accounts(id)
);
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  person_id INTEGER NOT NULL,
  service TEXT NOT NULL,
  username TEXT,
  email TEXT,
  created_at TEXT,
  metadata TEXT,
  created_at_timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (person_id) REFERENCES people(id)
);
CREATE TABLE art (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  artist_id   INTEGER REFERENCES people(id) ON DELETE SET NULL,
  date        TEXT,
  medium      TEXT,
  movement    TEXT,
  period      TEXT,
  collection  TEXT,
  dimensions  TEXT,
  is_favorite INTEGER DEFAULT 1,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE artist_profiles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id   INTEGER NOT NULL UNIQUE REFERENCES people(id) ON DELETE CASCADE,
  discipline  TEXT,
  movement    TEXT,
  nationality TEXT,
  birth_place TEXT,
  active_from INTEGER,
  active_to   INTEGER,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE calendar_event_people (
  event_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  role TEXT DEFAULT 'participant',
  source TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, person_id),
  FOREIGN KEY(event_id) REFERENCES calendar_events(id),
  FOREIGN KEY(person_id) REFERENCES people(id)
);
CREATE TABLE calendar_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  full_path TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(full_path),
  FOREIGN KEY(parent_id) REFERENCES calendar_tags(id)
);
CREATE TABLE life_events(
  id INT,
  summary TEXT,
  description TEXT,
  people TEXT,
  location TEXT,
  tags TEXT,
  `date_end` text, `city` text, `state` text, `country` text, start DATETIME, category TEXT, sentiment TEXT, date_precision TEXT);
CREATE TABLE media_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL,
  account_id INTEGER,
  platform TEXT,
  media_type TEXT,
  activity_type TEXT,
  content_id TEXT,
  title TEXT,
  collection_name TEXT,
  occurred_at TEXT,
  metadata TEXT,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(person_id) REFERENCES people(id),
  FOREIGN KEY(account_id) REFERENCES accounts(id)
);
CREATE TABLE media_collection_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  added_at TEXT,
  removed_at TEXT,
  position INTEGER,
  source_table TEXT,
  source_row_id INTEGER,
  raw_title TEXT,
  raw_type TEXT,
  raw_group_name TEXT,
  raw_recorded_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT,
  FOREIGN KEY(collection_id) REFERENCES media_collections(id),
  FOREIGN KEY(item_id) REFERENCES media_items(id)
);
CREATE TABLE media_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL,
  account_id INTEGER,
  platform TEXT,
  collection_type TEXT,
  external_id TEXT,
  name TEXT,
  description TEXT,
  visibility TEXT,
  sort_order TEXT,
  created_at TEXT,
  updated_at TEXT,
  metadata TEXT,
  source TEXT,
  UNIQUE(person_id, platform, external_id),
  FOREIGN KEY(person_id) REFERENCES people(id),
  FOREIGN KEY(account_id) REFERENCES accounts(id)
);
CREATE TABLE media_item_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  account_id INTEGER,
  provider TEXT,
  activity_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_row_id INTEGER NOT NULL,
  source_event_key TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.0,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(item_id) REFERENCES media_items(id),
  FOREIGN KEY(person_id) REFERENCES people(id),
  FOREIGN KEY(account_id) REFERENCES accounts(id),
  UNIQUE(person_id, item_id, source_table, source_row_id, source_event_key, activity_type)
);
CREATE TABLE media_item_identifiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  identifier_type TEXT NOT NULL,
  identifier_value TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  FOREIGN KEY(item_id) REFERENCES media_items(id)
);
CREATE TABLE media_item_source_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  source_table TEXT NOT NULL,
  source_row_id INTEGER NOT NULL,
  link_type TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT,
  FOREIGN KEY(item_id) REFERENCES media_items(id),
  UNIQUE(source_table, source_row_id),
  UNIQUE(item_id, source_table, source_row_id)
);
CREATE TABLE media_item_source_summaries (
  item_id INTEGER NOT NULL,
  source_table TEXT NOT NULL,
  source_scope TEXT NOT NULL,
  source_key TEXT NOT NULL,
  watched_count INTEGER DEFAULT 0,
  watchlist_count INTEGER DEFAULT 0,
  liked_count INTEGER DEFAULT 0,
  rated_count INTEGER DEFAULT 0,
  reviewed_count INTEGER DEFAULT 0,
  first_activity_at TEXT,
  last_activity_at TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id, source_table, source_scope, source_key),
  FOREIGN KEY(item_id) REFERENCES media_items(id)
);
CREATE TABLE IF NOT EXISTS "media_item_tags" (
  item_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  tag TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_row_id INTEGER NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.0,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id, provider, tag, source_table, source_row_id),
  FOREIGN KEY(item_id) REFERENCES media_items(id)
);
CREATE TABLE IF NOT EXISTS "media_items" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_title TEXT NOT NULL,
  media_kind TEXT NOT NULL,
  runtime_seconds INTEGER,
  release_year INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT
);
CREATE TABLE media_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  media_type     TEXT NOT NULL CHECK (media_type IN (
                   'movie', 'tv_show', 'book', 'podcast', 'album', 'game'
                 )),
  year           INTEGER,
  author         TEXT,
  status         TEXT NOT NULL DEFAULT 'watched' CHECK (status IN (
                   'watched', 'reading', 'read', 'want', 'abandoned', 'listening', 'played'
                 )),
  rating         REAL,
  consumed_at    TEXT,
  season         INTEGER,
  episode        INTEGER,
  source         TEXT,
  letterboxd_uri TEXT UNIQUE,
  starred        INTEGER DEFAULT 0,
  rewatch_count  INTEGER DEFAULT 0,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS "media_subscriptions" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL,
  account_id INTEGER,
  platform TEXT,
  creator_id TEXT,
  creator_url TEXT,
  creator_name TEXT,
  subscribed_at TEXT,
  metadata TEXT,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(person_id, platform, creator_id),
  FOREIGN KEY(person_id) REFERENCES people(id),
  FOREIGN KEY(account_id) REFERENCES accounts(id)
);
CREATE TABLE music_listening (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  artist      TEXT NOT NULL,
  track       TEXT,
  album       TEXT,
  listened_at TEXT,
  source      TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS "music_songs" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  first_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  artist_id INTEGER NOT NULL,
  FOREIGN KEY (artist_id) REFERENCES music_artists(id) ON UPDATE NO ACTION ON DELETE NO ACTION
);
CREATE TABLE openrouter_activity (
          generation_id TEXT PRIMARY KEY,
          created_at TEXT,
          cost_total REAL,
          cost_web_search REAL,
          cost_cache REAL,
          cost_file_processing REAL,
          byok_usage_inference INTEGER,
          tokens_prompt INTEGER,
          tokens_completion INTEGER,
          tokens_reasoning INTEGER,
          tokens_cached INTEGER,
          model_permaslug TEXT,
          provider_name TEXT,
          variant TEXT,
          cancelled INTEGER,
          streamed INTEGER,
          user TEXT,
          finish_reason_raw TEXT,
          finish_reason_normalized TEXT,
          generation_time_ms INTEGER,
          time_to_first_token_ms INTEGER,
          app_name TEXT,
          api_key_name TEXT,
          source_file TEXT NOT NULL,
          imported_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
CREATE TABLE IF NOT EXISTS "person_aliases" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL,
  alias TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(person_id, alias),
  FOREIGN KEY(person_id) REFERENCES people(id)
);
CREATE TABLE IF NOT EXISTS "person_emails" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(person_id, email),
  FOREIGN KEY(person_id) REFERENCES people(id)
);
CREATE TABLE IF NOT EXISTS "person_organizations" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL,
  organization TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(person_id, organization),
  FOREIGN KEY(person_id) REFERENCES people(id)
);
CREATE TABLE IF NOT EXISTS "person_phones" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL,
  phone_number TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(person_id, phone_number),
  FOREIGN KEY(person_id) REFERENCES people(id)
);
CREATE TABLE place_collection_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER NOT NULL,
  place_id INTEGER NOT NULL,
  saved_at TEXT,
  source_table TEXT,
  source_row_id INTEGER,
  note TEXT,
  comment TEXT,
  url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT,
  FOREIGN KEY(collection_id) REFERENCES place_collections(id),
  FOREIGN KEY(place_id) REFERENCES places(id)
);
CREATE TABLE place_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL,
  account_id INTEGER,
  platform TEXT,
  collection_type TEXT,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT,
  source TEXT,
  FOREIGN KEY(person_id) REFERENCES people(id),
  FOREIGN KEY(account_id) REFERENCES accounts(id)
);
CREATE TABLE place_geocode_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL,
  query TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'apple_maps',
  status TEXT NOT NULL,
  result_summary TEXT,
  response_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(place_id) REFERENCES places(id)
);
CREATE TABLE place_geocode_state (
  place_id INTEGER PRIMARY KEY,
  last_geocode_status TEXT,
  last_geocode_query TEXT,
  last_geocode_result_summary TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(place_id) REFERENCES places(id) ON DELETE CASCADE
);
CREATE TABLE place_review_state (
  place_id INTEGER PRIMARY KEY,
  review_status TEXT,
  review_reason TEXT,
  review_query TEXT,
  review_updated_at TEXT,
  review_decision_at TEXT,
  review_decision_source TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(place_id) REFERENCES places(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "places" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT,
  place_type TEXT,
  latitude REAL,
  longitude REAL,
  formatted_address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  country_code TEXT,
  geocoded_at TEXT
);
CREATE TABLE signal_account (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_key TEXT,
  username TEXT,
  given_name TEXT,
  family_name TEXT,
  account_settings_json TEXT,
  raw_json TEXT NOT NULL,
  source_file TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE signal_chat_folders (
  id TEXT PRIMARY KEY,
  folder_type TEXT,
  show_muted_chats INTEGER,
  include_all_individual_chats INTEGER,
  include_all_group_chats INTEGER,
  raw_json TEXT NOT NULL,
  source_file TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE signal_chat_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT,
  author_id TEXT,
  date_sent TEXT,
  directionless INTEGER,
  update_message_json TEXT,
  raw_json TEXT NOT NULL,
  source_file TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE signal_chats (
  id TEXT PRIMARY KEY,
  recipient_id TEXT,
  expire_timer_version INTEGER,
  raw_json TEXT NOT NULL,
  source_file TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE signal_recipients (
  id TEXT PRIMARY KEY,
  pni TEXT,
  e164 TEXT,
  contact_json TEXT,
  raw_json TEXT NOT NULL,
  source_file TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE signal_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_type TEXT NOT NULL,
  source_line INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  source_file TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE signal_sticker_packs (
  pack_id TEXT PRIMARY KEY,
  pack_key TEXT,
  raw_json TEXT NOT NULL,
  source_file TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS "health_supplements" (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category TEXT,
          details_dose TEXT,
          notes TEXT);
CREATE TABLE tattoos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  location    TEXT,
  date        TEXT,
  artist      TEXT,
  studio      TEXT,
  cost_cents  INTEGER,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS "calendar_event_categories"(
  id TEXT,
  name TEXT,
  description TEXT,
  emoji TEXT,
  color_code TEXT,
  icon_name TEXT,
  display_order TEXT,
  created_at TEXT
);
CREATE TABLE place_visits (
    id          TEXT PRIMARY KEY,
    place_id    INTEGER REFERENCES places(id),
    name        TEXT,
    address     TEXT,
    visited_at  TEXT,
    notes       TEXT,
    people      TEXT,
    meal        TEXT,
    source      TEXT,
    source_id   TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "turbotax_filing_states" (
  filingId    TEXT REFERENCES "turbotax_filing"(filingId),
  filingType  TEXT,
  timeStamp   TEXT,
  filingState TEXT,
  message     TEXT
);
CREATE TABLE llm_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES llm_conversations(id),
  role            TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
  content         TEXT,
  model           TEXT,
  provider        TEXT CHECK(provider IN ('openai','google','anthropic','unknown')),
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  cost            REAL,
  source          TEXT NOT NULL DEFAULT 'boltai',
  created_at      TEXT
);
CREATE TABLE IF NOT EXISTS "llm_conversations" (
  id            TEXT PRIMARY KEY,
  title         TEXT,
  model         TEXT,
  provider      TEXT CHECK(provider IN ('openai','google','anthropic','unknown')),
  system_text   TEXT,
  temperature   REAL,
  message_count INTEGER,
  cost          REAL,
  source        TEXT NOT NULL DEFAULT 'boltai',
  created_at    TEXT,
  updated_at    TEXT
);
CREATE TABLE career_profile (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name      TEXT,
  last_name       TEXT,
  headline        TEXT,
  summary         TEXT,
  email           TEXT,
  phone           TEXT,
  location        TEXT,
  industry        TEXT,
  birth_date      TEXT,
  twitter_handles TEXT,
  websites        TEXT,
  linkedin_url    TEXT,
  registered_at   TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE career_positions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company         TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  location        TEXT,
  start_date      TEXT,
  end_date        TEXT,
  is_current      INTEGER DEFAULT 0,
  is_target       INTEGER DEFAULT 0,
  salary_low      REAL,
  salary_high     REAL,
  currency        TEXT,
  address         TEXT,
  contact_name    TEXT,
  contact_phone   TEXT,
  source          TEXT DEFAULT 'career_employers',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
, record_type     TEXT NOT NULL DEFAULT 'employment', url             TEXT, project_status  TEXT);
CREATE TABLE career_education (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  school          TEXT NOT NULL,
  degree          TEXT,
  field_of_study  TEXT,
  start_date      TEXT,
  end_date        TEXT,
  activities      TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE career_applications (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  company           TEXT NOT NULL,
  title             TEXT NOT NULL,
  location          TEXT,
  source            TEXT,           -- 'linkedin', 'referral', 'company_site', 'recruiter', 'other'
  referred_by       TEXT,
  applied_at        TEXT,
  current_stage     TEXT,
  status            TEXT,           -- 'active', 'rejected', 'offer', 'withdrew', 'ghosted', 'accepted'
  resume_url        TEXT,
  cover_letter_url  TEXT,
  job_posting_url   TEXT,
  salary_expectation TEXT,
  notes             TEXT,
  legacy_id         TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE career_application_stages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id  INTEGER NOT NULL REFERENCES career_applications(id) ON DELETE CASCADE,
  stage           TEXT NOT NULL,  -- 'applied'|'phone_screen'|'technical'|'take_home'|'onsite'|'reference_check'|'offer'|'negotiation'|'accepted'|'rejected'|'withdrew'
  entered_at      TEXT,
  exited_at       TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE career_offers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id  INTEGER REFERENCES career_applications(id) ON DELETE CASCADE,
  base_salary     REAL,
  equity          TEXT,
  bonus           REAL,
  signing_bonus   REAL,
  total_comp      REAL,
  currency        TEXT DEFAULT 'USD',
  decision        TEXT CHECK(decision IN ('accepted','declined','negotiating',NULL)),
  decision_at     TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS "health_weight_measurements" (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  measured_at  TEXT NOT NULL,
  weight_kg    REAL,
  fat_mass_kg  REAL,
  bone_mass_kg REAL,
  muscle_mass_kg REAL,
  hydration_kg REAL,
  source       TEXT NOT NULL CHECK (source IN ('withings', 'myfitnesspal')),
  comments     TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS "media_youtube_music_songs" (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id      TEXT,
  song_title    TEXT NOT NULL,
  album_title   TEXT,
  artist_name_1 TEXT,
  artist_name_2 TEXT,
  artist_name_3 TEXT,
  artist_name_4 TEXT,
  artist_name_5 TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS "media_youtube_playlists" (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id           TEXT,
  add_new_videos_to_top TEXT,
  description           TEXT,
  image_timestamp       TEXT,
  image_url             TEXT,
  image_height          TEXT,
  image_width           TEXT,
  title                 TEXT,
  title_language        TEXT,
  create_timestamp      TEXT,
  update_timestamp      TEXT,
  video_order           TEXT,
  visibility            TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE artworks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  artist          TEXT,
  artist_id       TEXT REFERENCES people(id) ON DELETE SET NULL,
  year            INTEGER,
  medium          TEXT,       -- print, vinyl, acrylic on canvas, photograph, sculpture, etc.
  dimensions      TEXT,       -- e.g. "24\" × 35\"" or "46.81\" × 33.11\""
  date_acquired   TEXT,
  price           REAL,
  location        TEXT,       -- where it lives in the house (living room, bedroom, storage, etc.)
  image_path      TEXT,       -- path to a photo of the piece
  edition         TEXT,       -- edition info for prints (e.g. "2/50")
  series          TEXT,       -- series or collection name
  frame_color     TEXT,
  framed          INTEGER DEFAULT 0,
  format          TEXT,       -- A0 Print, canvas, vinyl record, etc.
  tags            TEXT,       -- comma-separated or JSON list
  notes           TEXT,
  is_favorite     INTEGER DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE music_purchases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT,
  seller          TEXT,
  purchased_at    TEXT,           -- ISO-8601 timestamp
  device_details  TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE purchases (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_name    TEXT NOT NULL,
  purchased_at    TEXT,
  order_number    TEXT,
  serial_number   TEXT,
  price           REAL,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE social_accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  platform    TEXT NOT NULL,       -- 'instagram', 'facebook', 'twitter', etc.
  kind        TEXT NOT NULL,       -- 'follower', 'following', 'friend', 'blocked', 'follow_request_sent'
  timestamp   TEXT,                -- when the relationship was established
  metadata    TEXT,                -- JSON for extra data
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(name, platform, kind)
);
CREATE TABLE health_heart_rate (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at      TEXT NOT NULL,       -- ISO-8601 with timezone
  duration_s      TEXT,
  bpm             TEXT,                -- heart rate value
  level           TEXT,                -- activity level (0-3)
  state           TEXT,                -- heart rate state
  skin_temp       TEXT,                -- skin temperature
  spo2_quality    TEXT,                -- SPO2 quality score
  source          TEXT DEFAULT 'withings',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE health_body_composition (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  date            TEXT NOT NULL,
  fat_pct         REAL,
  muscle_pct      REAL,
  water_pct       REAL,
  bone_pct        REAL,
  fat_free_mass_kg REAL,
  vo2_max         REAL,
  vascular_age    INTEGER,
  pulse_wave_velocity REAL,
  source          TEXT DEFAULT 'withings',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE health_tracker (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at      TEXT NOT NULL,
  duration_s      TEXT,
  steps           INTEGER,
  distance_m      REAL,
  calories        REAL,
  intensity       REAL,
  source          TEXT DEFAULT 'withings',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE health_activities (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at      TEXT NOT NULL,
  ended_at        TEXT,
  activity_type   TEXT,              -- Hiking, Running, Yoga, etc.
  calories        REAL,
  distance_m      REAL,
  duration_s      INTEGER,
  intensity       INTEGER,
  gps_path        TEXT,              -- JSON path
  metadata        TEXT,              -- full Data + GPS JSON
  source          TEXT DEFAULT 'withings',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE health_locations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at      TEXT NOT NULL,       -- timestamp of the GPS sample
  duration_s      TEXT,                -- sample interval (typically 1-60s)
  latitude        REAL,
  longitude       REAL,
  altitude        REAL,
  speed           REAL,                -- m/s
  accuracy        REAL,                -- horizontal radius in meters
  source          TEXT DEFAULT 'withings',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE amazon_returns (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id            TEXT NOT NULL,
  return_date         TEXT,
  return_amount       REAL,
  currency            TEXT,
  return_reason       TEXT,
  resolution          TEXT,
  rma_id              TEXT,
  tracking_id          TEXT,
  carrier_package_id  TEXT,
  return_ship_option  TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
, amazon_orders_id INTEGER REFERENCES amazon_orders(id));
CREATE TABLE amazon_orders (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id              TEXT NOT NULL UNIQUE,
  order_date            TEXT,
  shipment_date          TEXT,
  order_status          TEXT,
  purchase_channel      TEXT DEFAULT 'online',
  carrier_name_and_tracking_number TEXT,
  shipping_option        TEXT,
  shipping_address_name  TEXT,
  shipping_address_street_1 TEXT,
  shipping_address_street_2 TEXT,
  shipping_address_city TEXT,
  shipping_address_state TEXT,
  shipping_address_zip  TEXT,
  payment_instrument_type TEXT,
  purchase_order_number TEXT,
  currency              TEXT,
  gift_message          TEXT,
  gift_sender_name      TEXT,
  source                TEXT DEFAULT 'amazon',
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE books (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  asin                 TEXT UNIQUE,
  isbn_10              TEXT,
  isbn_13              TEXT,
  title                TEXT NOT NULL COLLATE NOCASE,
  author               TEXT COLLATE NOCASE,
  publisher            TEXT,
  publication_date     TEXT,
  print_length         INTEGER,             -- pages (parsed from "268 pages")
  category_path        TEXT,
  cover_image_url      TEXT,
  rating               TEXT,                -- e.g. "4.6 out of 5 stars"
  description          TEXT,
  enriched_at          TEXT,                -- when enriched from Amazon API
  source               TEXT DEFAULT 'kindle', -- 'kindle' | 'manual'
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE periodicals (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  title                TEXT NOT NULL,       -- e.g. "032c", "Hypebeast", "GQ"
  issue                TEXT,                -- e.g. "Issue 43", "March 2024", "Winter 2019"
  author               TEXT,                -- publisher name when applicable
  category             TEXT,                -- e.g. "Culture", "Fashion", "Art"
  status               TEXT DEFAULT 'read',  -- 'read' | 'to_read'
  date_read            TEXT,
  cover_url            TEXT,
  source               TEXT DEFAULT 'reading_log',
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(title COLLATE NOCASE, issue)
);
CREATE TABLE reading_sessions (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id              INTEGER REFERENCES books(id) ON DELETE SET NULL,
  asin                 TEXT,                -- denormalized for linking
  started_at           TEXT,
  ended_at             TEXT,
  duration_ms          INTEGER,
  source               TEXT DEFAULT 'kindle',
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE book_highlights (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id              INTEGER REFERENCES books(id) ON DELETE SET NULL,
  book_title           TEXT,                -- for unmatched titles
  highlight_type       TEXT DEFAULT 'highlight' CHECK(highlight_type IN ('highlight','note','bookmark','quote','global')),
  selected_text        TEXT,                -- actual highlighted text (Apple Books)
  note                 TEXT,                -- personal note attached to highlight
  highlight_color      TEXT,
  is_starred           INTEGER DEFAULT 0,
  location             TEXT,                -- ePub CFI or page/percentage
  word_count           INTEGER,
  device_family        TEXT,
  source               TEXT DEFAULT 'kindle', -- 'kindle' | 'apple_books'
  created_at           TEXT,
  updated_at           TEXT,
  created_at_ts        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE book_shelves (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id              INTEGER REFERENCES books(id) ON DELETE SET NULL,
  book_title           TEXT,                -- for titles not yet in books
  shelf_name           TEXT NOT NULL,       -- 'currently-reading', 'read', 'to-read', etc.
  is_current           INTEGER DEFAULT 0,   -- 1 = this is the current shelf
  reading_progress_pct  INTEGER,             -- from goodreads_progre
  source               TEXT DEFAULT 'goodreads', -- 'goodreads' | 'kindle'
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE google_saved (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT,
    note        TEXT,
    url         TEXT,
    source      TEXT NOT NULL,   -- 'default' | 'favorites' | 'australia'
    saved_at    TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    UNIQUE(title, url, source)
);
CREATE TABLE google_device_registry (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    device_type         TEXT,
    brand               TEXT,
    marketing_name       TEXT,
    os                  TEXT,
    os_version          TEXT,
    model               TEXT,
    user_name           TEXT,
    last_location       TEXT,
    gaia_id             TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE google_play_purchases (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    purchased_at    TEXT NOT NULL,
    document_type   TEXT,
    title           TEXT NOT NULL,
    price           REAL,
    currency        TEXT DEFAULT 'USD',
    source_file     TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_media_youtube_list ON media_youtube(list);
CREATE INDEX idx_favorites_category ON favorites(category);
CREATE INDEX idx_music_tracks_artist  ON music_tracks(artist_id);
CREATE INDEX idx_music_tracks_album   ON music_tracks(album_id);
CREATE INDEX idx_music_tracks_spotify ON music_tracks(spotify_id);
CREATE INDEX idx_music_tracks_title   ON music_tracks(title COLLATE NOCASE);
CREATE INDEX idx_music_play_history_track  ON music_play_history(track_id);
CREATE INDEX idx_music_play_history_played ON music_play_history(played_at);
CREATE INDEX idx_music_playlist_items_playlist ON music_playlist_items(playlist_id);
CREATE INDEX idx_music_playlist_items_track    ON music_playlist_items(track_id);
CREATE INDEX idx_stages_app    ON career_application_stages(application_id);
CREATE INDEX idx_stages_stage  ON career_application_stages(stage);
CREATE INDEX idx_offers_app ON career_offers(application_id);
CREATE INDEX idx_apps_applied_at     ON career_applications(applied_at);
CREATE INDEX idx_apps_status         ON career_applications(status);
CREATE INDEX idx_apps_source         ON career_applications(source);
CREATE INDEX idx_apps_company        ON career_applications(company);
CREATE INDEX idx_stages_entered_at   ON career_application_stages(entered_at);
CREATE INDEX idx_weight_measured_at ON "health_weight_measurements"(measured_at);
CREATE INDEX idx_weight_source     ON "health_weight_measurements"(source);
CREATE INDEX idx_youtube_music_video_id ON "media_youtube_music_songs"(video_id);
CREATE INDEX idx_youtube_playlists_playlist_id ON "media_youtube_playlists"(playlist_id);
CREATE UNIQUE INDEX idx_returns_order_date ON amazon_returns(order_id, return_date, return_amount);
CREATE INDEX idx_purchases_orders ON amazon_purchases(amazon_orders_id);
CREATE INDEX idx_returns_orders ON amazon_returns(amazon_orders_id);
CREATE INDEX idx_google_play_purchases_type ON google_play_purchases(document_type);
CREATE INDEX idx_google_play_purchases_date ON google_play_purchases(purchased_at);
CREATE UNIQUE INDEX idx_google_play_purchases_lookup
    ON google_play_purchases(purchased_at, title);
CREATE VIEW spotify_streaming_history AS
SELECT
  played_at   AS endTime,
  artist_name AS artistName,
  track_name  AS trackName,
  ms_played   AS msPlayed
FROM music_play_history
WHERE platform = 'spotify'
/* spotify_streaming_history(endTime,artistName,trackName,msPlayed) */;
CREATE VIEW career_pipeline AS
SELECT
  ca.id,
  ca.company,
  ca.title,
  ca.source,
  ca.referred_by,
  ca.applied_at,
  ca.current_stage,
  ROUND(julianday('now') - julianday(ca.applied_at)) AS days_since_applied,
  ROUND(julianday('now') - julianday(
    COALESCE(s.entered_at, ca.applied_at)
  )) AS days_in_stage,
  s.notes AS stage_notes,
  ca.location,
  ca.salary_expectation,
  ca.job_posting_url
FROM career_applications ca
LEFT JOIN career_application_stages s
  ON s.application_id = ca.id
 AND s.id = (
    SELECT MAX(id) FROM career_application_stages
    WHERE application_id = ca.id
  )
WHERE ca.status = 'active'
ORDER BY ca.applied_at DESC
/* career_pipeline(id,company,title,source,referred_by,applied_at,current_stage,days_since_applied,days_in_stage,stage_notes,location,salary_expectation,job_posting_url) */;
CREATE VIEW career_stage_timeline AS
SELECT
  ca.id AS application_id,
  ca.company,
  ca.title,
  ca.status,
  s.stage,
  s.entered_at,
  s.exited_at,
  ROUND(julianday(COALESCE(s.exited_at, 'now')) - julianday(s.entered_at), 1) AS days_in_stage,
  ROW_NUMBER() OVER (
    PARTITION BY s.application_id ORDER BY s.id
  ) AS stage_number,
  s.notes AS stage_notes
FROM career_applications ca
JOIN career_application_stages s ON s.application_id = ca.id
ORDER BY ca.applied_at DESC, s.id
/* career_stage_timeline(application_id,company,title,status,stage,entered_at,exited_at,days_in_stage,stage_number,stage_notes) */;
CREATE VIEW career_stage_velocity AS
SELECT
  stage,
  ROUND(AVG(days_in_stage), 1) AS avg_days,
  ROUND(MIN(days_in_stage), 1) AS min_days,
  ROUND(MAX(days_in_stage), 1) AS max_days,
  COUNT(*) AS count
FROM career_stage_timeline
WHERE stage NOT IN ('applied', 'accepted')
GROUP BY stage
ORDER BY avg_days
/* career_stage_velocity(stage,avg_days,min_days,max_days,count) */;
CREATE VIEW career_weekly_applications AS
SELECT
  strftime('%Y-W%W', applied_at) AS week,
  COUNT(*) AS applications,
  SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
  SUM(CASE WHEN status = 'withdrew' THEN 1 ELSE 0 END) AS withdrew,
  SUM(CASE WHEN status = 'active'  THEN 1 ELSE 0 END) AS active
FROM career_applications
WHERE applied_at IS NOT NULL
GROUP BY week
ORDER BY week DESC
/* career_weekly_applications(week,applications,rejected,withdrew,active) */;
CREATE VIEW career_source_summary AS
SELECT
  COALESCE(source, 'unknown') AS source,
  COUNT(*) AS applications,
  SUM(CASE WHEN current_stage IN ('phone_screen','technical','onsite','offer') THEN 1 ELSE 0 END) AS progressed,
  SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
FROM career_applications
GROUP BY source
ORDER BY applications DESC
/* career_source_summary(source,applications,progressed,rejected,active) */;
CREATE VIEW career_company_velocity AS
SELECT
  ca.company,
  ca.status,
  COUNT(*) AS applications,
  ROUND(AVG(
    julianday(COALESCE(
      (SELECT MIN(entered_at) FROM career_application_stages
       WHERE application_id = ca.id AND stage IN ('rejected','withdrew','accepted')),
      'now'
    )) - julianday(ca.applied_at)
  )) AS avg_days_to_outcome
FROM career_applications ca
WHERE ca.applied_at IS NOT NULL
GROUP BY ca.company, ca.status
ORDER BY avg_days_to_outcome
/* career_company_velocity(company,status,applications,avg_days_to_outcome) */;
CREATE TABLE account_name_map (
    variant     TEXT PRIMARY KEY COLLATE NOCASE,
    canonical   TEXT NOT NULL,
    institution TEXT
);
CREATE TABLE finance_categories (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  parent_id INTEGER REFERENCES finance_categories(id),
  UNIQUE (name, parent_id)
);
CREATE TABLE IF NOT EXISTS "finance_accounts" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  institution TEXT,
  account_type TEXT NOT NULL DEFAULT 'other'
    CHECK (account_type IN ('checking', 'savings', 'credit_card', 'cash', 'loan', 'investment', 'retirement', 'other')),
  currency_code TEXT NOT NULL DEFAULT 'USD'
    CHECK (length(currency_code) = 3 AND currency_code = upper(currency_code)),
  lifecycle_status TEXT NOT NULL DEFAULT 'open'
    CHECK (lifecycle_status IN ('open', 'closed', 'historical', 'unknown')),
  opened_on TEXT,
  closed_on TEXT,
  include_in_net_worth INTEGER NOT NULL DEFAULT 1
    CHECK (include_in_net_worth IN (0, 1))
);
CREATE TABLE finance_account_labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  label_kind TEXT NOT NULL
    CHECK (label_kind IN ('canonical', 'alias', 'historical_name')),
  institution TEXT,
  effective_from TEXT,
  effective_to TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  confidence REAL NOT NULL DEFAULT 1.0
    CHECK (confidence >= 0 AND confidence <= 1),
  is_generic INTEGER NOT NULL DEFAULT 0
    CHECK (is_generic IN (0, 1)),
  resolves_to_account INTEGER NOT NULL DEFAULT 1
    CHECK (resolves_to_account IN (0, 1)),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CHECK (trim(label) <> '')
);
CREATE UNIQUE INDEX idx_finance_account_labels_active_resolution
  ON finance_account_labels(lower(trim(label)))
  WHERE resolves_to_account = 1 AND effective_to IS NULL;
CREATE INDEX idx_finance_account_labels_account
  ON finance_account_labels(account_id, label_kind);
CREATE INDEX idx_finance_account_labels_kind
  ON finance_account_labels(label_kind);
CREATE TABLE finance_account_ledger_entries (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES finance_accounts(id),
  posted_on TEXT NOT NULL
    CHECK (posted_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  description TEXT NOT NULL,
  balance_delta_cents INTEGER NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'USD'
    CHECK (length(currency_code) = 3 AND currency_code = upper(currency_code)),
  posting_status TEXT NOT NULL DEFAULT 'posted'
    CHECK (posting_status IN ('posted', 'pending')),
  ledger_entry_kind TEXT NOT NULL DEFAULT 'regular'
    CHECK (ledger_entry_kind IN ('regular', 'income', 'internal_transfer', 'adjustment')),
  account_mask TEXT,
  note TEXT,
  source_fingerprint TEXT NOT NULL UNIQUE,
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE finance_ledger_entry_annotations (
  ledger_entry_id INTEGER PRIMARY KEY
    REFERENCES finance_account_ledger_entries(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES finance_categories(id),
  category_assignment_source TEXT NOT NULL DEFAULT 'source'
    CHECK (category_assignment_source IN ('source', 'unmapped', 'manual', 'rule')),
  excluded INTEGER NOT NULL DEFAULT 0 CHECK (excluded IN (0, 1)),
  recurring INTEGER NOT NULL DEFAULT 0 CHECK (recurring IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT
);
CREATE TABLE finance_account_statement_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES finance_accounts(id),
  period_start_on TEXT NOT NULL
    CHECK (period_start_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  period_end_on TEXT NOT NULL
    CHECK (period_end_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  closing_balance_cents INTEGER NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'USD'
    CHECK (length(currency_code) = 3 AND currency_code = upper(currency_code)),
  evidence_path TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  note TEXT,
  certification_status TEXT NOT NULL DEFAULT 'uncertified'
    CHECK (certification_status IN ('uncertified', 'certified', 'variance')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (period_start_on <= period_end_on),
  UNIQUE (account_id, period_start_on, period_end_on)
);
CREATE INDEX idx_finance_ledger_entries_account_posted
  ON finance_account_ledger_entries(account_id, posted_on);
CREATE INDEX idx_finance_ledger_entries_posting_status
  ON finance_account_ledger_entries(posting_status);
CREATE INDEX idx_finance_ledger_entries_kind
  ON finance_account_ledger_entries(ledger_entry_kind);
CREATE INDEX idx_finance_statement_periods_account_end
  ON finance_account_statement_periods(account_id, period_end_on);

CREATE TABLE health_blood_pressure (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    measured_at     TEXT NOT NULL,
    systolic        REAL,
    diastolic       REAL,
    heart_rate_bpm  REAL,
    comments        TEXT,
    source          TEXT NOT NULL DEFAULT 'myfitnesspal',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE health_height_measurements (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    measured_at     TEXT NOT NULL,
    height_in       REAL,
    comments        TEXT,
    source          TEXT NOT NULL DEFAULT 'myfitnesspal',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_health_activities_source_dedupe
    ON health_activities (started_at, ended_at, activity_type, source);
CREATE INDEX idx_health_tracker_source_dedupe
    ON health_tracker (started_at, source);
CREATE INDEX idx_health_heart_rate_source_dedupe
    ON health_heart_rate (started_at, source);
CREATE INDEX idx_health_blood_pressure_source_dedupe
    ON health_blood_pressure (measured_at, source);
CREATE INDEX idx_health_height_measurements_source_dedupe
    ON health_height_measurements (measured_at, source);
CREATE TABLE health_daily (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    date             TEXT NOT NULL,
    steps            INTEGER,
    distance_m       REAL,
    calories_active  REAL,
    calories_passive REAL,
    elevation_m      REAL,
    source           TEXT DEFAULT 'withings',
    created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    UNIQUE(date, source)
);

INSERT OR IGNORE INTO finance_categories (id, name, parent_id) VALUES (1, 'Uncategorized', NULL);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP VIEW IF EXISTS spotify_streaming_history; DROP VIEW IF EXISTS career_pipeline; DROP VIEW IF EXISTS career_stage_timeline; DROP VIEW IF EXISTS career_stage_velocity; DROP VIEW IF EXISTS career_weekly_applications; DROP VIEW IF EXISTS career_source_summary; DROP VIEW IF EXISTS career_company_velocity;

DROP INDEX IF EXISTS idx_youtube_playlists_playlist_id; DROP INDEX IF EXISTS idx_youtube_music_video_id; DROP INDEX IF EXISTS idx_weight_source; DROP INDEX IF EXISTS idx_weight_measured_at; DROP INDEX IF EXISTS idx_stages_stage; DROP INDEX IF EXISTS idx_stages_entered_at; DROP INDEX IF EXISTS idx_stages_app; DROP INDEX IF EXISTS idx_returns_orders; DROP INDEX IF EXISTS idx_returns_order_date; DROP INDEX IF EXISTS idx_purchases_orders; DROP INDEX IF EXISTS idx_offers_app; DROP INDEX IF EXISTS idx_music_tracks_title; DROP INDEX IF EXISTS idx_music_tracks_spotify; DROP INDEX IF EXISTS idx_music_tracks_artist; DROP INDEX IF EXISTS idx_music_tracks_album; DROP INDEX IF EXISTS idx_music_playlist_items_track; DROP INDEX IF EXISTS idx_music_playlist_items_playlist; DROP INDEX IF EXISTS idx_music_play_history_track; DROP INDEX IF EXISTS idx_music_play_history_played; DROP INDEX IF EXISTS idx_media_youtube_list; DROP INDEX IF EXISTS idx_health_tracker_source_dedupe; DROP INDEX IF EXISTS idx_health_height_measurements_source_dedupe; DROP INDEX IF EXISTS idx_health_heart_rate_source_dedupe; DROP INDEX IF EXISTS idx_health_blood_pressure_source_dedupe; DROP INDEX IF EXISTS idx_health_activities_source_dedupe; DROP INDEX IF EXISTS idx_google_play_purchases_type; DROP INDEX IF EXISTS idx_google_play_purchases_lookup; DROP INDEX IF EXISTS idx_google_play_purchases_date; DROP INDEX IF EXISTS idx_finance_statement_periods_account_end; DROP INDEX IF EXISTS idx_finance_ledger_entries_posting_status; DROP INDEX IF EXISTS idx_finance_ledger_entries_kind; DROP INDEX IF EXISTS idx_finance_ledger_entries_account_posted; DROP INDEX IF EXISTS idx_finance_account_labels_kind; DROP INDEX IF EXISTS idx_finance_account_labels_active_resolution; DROP INDEX IF EXISTS idx_finance_account_labels_account; DROP INDEX IF EXISTS idx_favorites_category; DROP INDEX IF EXISTS idx_apps_status; DROP INDEX IF EXISTS idx_apps_source; DROP INDEX IF EXISTS idx_apps_company; DROP INDEX IF EXISTS idx_apps_applied_at;

DROP TABLE IF EXISTS "users";
DROP TABLE IF EXISTS "user_lists";
DROP TABLE IF EXISTS "turbotax_filing_states";
DROP TABLE IF EXISTS "turbotax_filing_order";
DROP TABLE IF EXISTS "turbotax_filing";
DROP TABLE IF EXISTS "trips";
DROP TABLE IF EXISTS "trip_tags";
DROP TABLE IF EXISTS "trip_categories";
DROP TABLE IF EXISTS "trip_attendees";
DROP TABLE IF EXISTS "transportation_types";
DROP TABLE IF EXISTS "transportation";
DROP TABLE IF EXISTS "tattoos";
DROP TABLE IF EXISTS "tasks_prolog";
DROP TABLE IF EXISTS "tasks_kensho";
DROP TABLE IF EXISTS "tasks_hominem";
DROP TABLE IF EXISTS "tasks";
DROP TABLE IF EXISTS "tarot_readings";
DROP TABLE IF EXISTS "tags";
DROP TABLE IF EXISTS "social_posts";
DROP TABLE IF EXISTS "social_messages";
DROP TABLE IF EXISTS "social_media";
DROP TABLE IF EXISTS "social_likes";
DROP TABLE IF EXISTS "social_connections";
DROP TABLE IF EXISTS "social_comments";
DROP TABLE IF EXISTS "social_accounts";
DROP TABLE IF EXISTS "signal_sticker_packs";
DROP TABLE IF EXISTS "signal_records";
DROP TABLE IF EXISTS "signal_recipients";
DROP TABLE IF EXISTS "signal_chats";
DROP TABLE IF EXISTS "signal_chat_items";
DROP TABLE IF EXISTS "signal_chat_folders";
DROP TABLE IF EXISTS "signal_account";
DROP TABLE IF EXISTS "services";
DROP TABLE IF EXISTS "schools";
DROP TABLE IF EXISTS "residences";
DROP TABLE IF EXISTS "reading_sessions";
DROP TABLE IF EXISTS "purchases";
DROP TABLE IF EXISTS "possessions_usage_log";
DROP TABLE IF EXISTS "possessions_usage";
DROP TABLE IF EXISTS "possessions_crystals";
DROP TABLE IF EXISTS "possessions_containers";
DROP TABLE IF EXISTS "possessions_acquisition";
DROP TABLE IF EXISTS "possessions";
DROP TABLE IF EXISTS "planning_results";
DROP TABLE IF EXISTS "planning_objectives";
DROP TABLE IF EXISTS "places_hotels";
DROP TABLE IF EXISTS "places";
DROP TABLE IF EXISTS "place_visits";
DROP TABLE IF EXISTS "place_review_state";
DROP TABLE IF EXISTS "place_geocode_state";
DROP TABLE IF EXISTS "place_geocode_attempts";
DROP TABLE IF EXISTS "place_collections";
DROP TABLE IF EXISTS "place_collection_items";
DROP TABLE IF EXISTS "place";
DROP TABLE IF EXISTS "phone_numbers";
DROP TABLE IF EXISTS "personal_sizes";
DROP TABLE IF EXISTS "person_phones";
DROP TABLE IF EXISTS "person_organizations";
DROP TABLE IF EXISTS "person_emails";
DROP TABLE IF EXISTS "person_aliases";
DROP TABLE IF EXISTS "periodicals";
DROP TABLE IF EXISTS "people_relationships";
DROP TABLE IF EXISTS "people_family";
DROP TABLE IF EXISTS "people_contacts";
DROP TABLE IF EXISTS "people";
DROP TABLE IF EXISTS "payment_methods";
DROP TABLE IF EXISTS "openrouter_activity";
DROP TABLE IF EXISTS "notes";
DROP TABLE IF EXISTS "myfitnesspal_raw_tracker_steps";
DROP TABLE IF EXISTS "myfitnesspal_raw_tracker_hr";
DROP TABLE IF EXISTS "myfitnesspal_raw_tracker_elevation";
DROP TABLE IF EXISTS "myfitnesspal_raw_tracker_distance";
DROP TABLE IF EXISTS "myfitnesspal_raw_tracker_calories_earned";
DROP TABLE IF EXISTS "myfitnesspal_height";
DROP TABLE IF EXISTS "myfitnesspal_bp";
DROP TABLE IF EXISTS "myfitnesspal_aggregates_steps";
DROP TABLE IF EXISTS "myfitnesspal_aggregates_elevation";
DROP TABLE IF EXISTS "myfitnesspal_aggregates_distance";
DROP TABLE IF EXISTS "myfitnesspal_aggregates_calories_passive";
DROP TABLE IF EXISTS "myfitnesspal_aggregates_calories_earned";
DROP TABLE IF EXISTS "myfitnesspal_activities";
DROP TABLE IF EXISTS "music_tracks";
DROP TABLE IF EXISTS "music_songs";
DROP TABLE IF EXISTS "music_purchases";
DROP TABLE IF EXISTS "music_playlists";
DROP TABLE IF EXISTS "music_playlist_items";
DROP TABLE IF EXISTS "music_play_history";
DROP TABLE IF EXISTS "music_listening";
DROP TABLE IF EXISTS "music_artists";
DROP TABLE IF EXISTS "music_albums";
DROP TABLE IF EXISTS "media_youtube_playlists";
DROP TABLE IF EXISTS "media_youtube_music_songs";
DROP TABLE IF EXISTS "media_youtube";
DROP TABLE IF EXISTS "media_subscriptions";
DROP TABLE IF EXISTS "media_podcast_plays";
DROP TABLE IF EXISTS "media_log";
DROP TABLE IF EXISTS "media_items";
DROP TABLE IF EXISTS "media_item_tags";
DROP TABLE IF EXISTS "media_item_source_summaries";
DROP TABLE IF EXISTS "media_item_source_links";
DROP TABLE IF EXISTS "media_item_identifiers";
DROP TABLE IF EXISTS "media_item_activities";
DROP TABLE IF EXISTS "media_games";
DROP TABLE IF EXISTS "media_collections";
DROP TABLE IF EXISTS "media_collection_items";
DROP TABLE IF EXISTS "media_backlog";
DROP TABLE IF EXISTS "media_activity_log";
DROP TABLE IF EXISTS "locations_cities";
DROP TABLE IF EXISTS "llm_messages";
DROP TABLE IF EXISTS "llm_conversations";
DROP TABLE IF EXISTS "list_invite";
DROP TABLE IF EXISTS "list";
DROP TABLE IF EXISTS "life_events";
DROP TABLE IF EXISTS "item";
DROP TABLE IF EXISTS "hinge_user";
DROP TABLE IF EXISTS "hinge_prompts";
DROP TABLE IF EXISTS "hinge_media";
DROP TABLE IF EXISTS "health_weight_measurements";
DROP TABLE IF EXISTS "health_vitamins";
DROP TABLE IF EXISTS "health_tracker";
DROP TABLE IF EXISTS "health_supplements";
DROP TABLE IF EXISTS "health_sleep";
DROP TABLE IF EXISTS "health_log";
DROP TABLE IF EXISTS "health_locations";
DROP TABLE IF EXISTS "health_height_measurements";
DROP TABLE IF EXISTS "health_heart_rate";
DROP TABLE IF EXISTS "health_daily";
DROP TABLE IF EXISTS "health_body_composition";
DROP TABLE IF EXISTS "health_blood_pressure";
DROP TABLE IF EXISTS "health_activities";
DROP TABLE IF EXISTS "google_saved";
DROP TABLE IF EXISTS "google_play_purchases";
DROP TABLE IF EXISTS "google_devices";
DROP TABLE IF EXISTS "google_device_registry";
DROP TABLE IF EXISTS "google_activities";
DROP TABLE IF EXISTS "finance_ledger_entry_annotations";
DROP TABLE IF EXISTS "finance_categories";
DROP TABLE IF EXISTS "finance_accounts";
DROP TABLE IF EXISTS "finance_account_statement_periods";
DROP TABLE IF EXISTS "finance_account_ledger_entries";
DROP TABLE IF EXISTS "finance_account_labels";
DROP TABLE IF EXISTS "favorites";
DROP TABLE IF EXISTS "domains";
DROP TABLE IF EXISTS "career_profile";
DROP TABLE IF EXISTS "career_positions";
DROP TABLE IF EXISTS "career_offers";
DROP TABLE IF EXISTS "career_education";
DROP TABLE IF EXISTS "career_applications";
DROP TABLE IF EXISTS "career_application_stages";
DROP TABLE IF EXISTS "calendar_tags";
DROP TABLE IF EXISTS "calendar_summary_map";
DROP TABLE IF EXISTS "calendar_events";
DROP TABLE IF EXISTS "calendar_event_types";
DROP TABLE IF EXISTS "calendar_event_type_mappings";
DROP TABLE IF EXISTS "calendar_event_people";
DROP TABLE IF EXISTS "calendar_event_categories";
DROP TABLE IF EXISTS "business_planning_revenue";
DROP TABLE IF EXISTS "business_planning_inputs";
DROP TABLE IF EXISTS "books";
DROP TABLE IF EXISTS "book_shelves";
DROP TABLE IF EXISTS "book_highlights";
DROP TABLE IF EXISTS "artworks";
DROP TABLE IF EXISTS "artist_profiles";
DROP TABLE IF EXISTS "art";
DROP TABLE IF EXISTS "amazon_returns";
DROP TABLE IF EXISTS "amazon_purchases";
DROP TABLE IF EXISTS "amazon_orders";
DROP TABLE IF EXISTS "activity_types";
DROP TABLE IF EXISTS "activity_people";
DROP TABLE IF EXISTS "activity_log";
DROP TABLE IF EXISTS "activities";
DROP TABLE IF EXISTS "accounts";
DROP TABLE IF EXISTS "account_name_map";
DROP TABLE IF EXISTS "account_aliases";
DROP TABLE IF EXISTS "account_activity_log";

-- +goose StatementEnd
