CREATE TABLE `venues` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`address` text NOT NULL,
	`created_at` text DEFAULT 'datetime(''now'')' NOT NULL,
	`updated_at` text DEFAULT 'datetime(''now'')' NOT NULL
);
CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text,
	`last_name` text
, middle_name TEXT, "notes" text, heritage TEXT, origin TEXT, membership_type TEXT, is_user INTEGER, email TEXT, gender TEXT, birth_date TEXT, death_date TEXT, phone TEXT, organization TEXT, email_addresses TEXT, nicknames TEXT);
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE `amazon_purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_date` text,
	`order_id` text,
	`title` text,
	`category` text,
	`asin_isbn` text,
	`purchase_price_per_unit` real,
	`quantity` integer,
	`shipment_date` text,
	`shipping_address_name` text,
	`shipping_address_street_1` text,
	`shipping_address_street_2` text,
	`shipping_address_city` text,
	`shipping_address_state` text,
	`shipping_address_zip` text,
	`order_status` text,
	`carrier_name_and_tracking_number` text,
	`item_subtotal` real,
	`item_subtotal_tax` real,
	`item_total` real
);
CREATE TABLE `career_employers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company` text,
	`position` text,
	`start_date` text,
	`end_date` text,
	`start_salary` real,
	`end_salary` real,
	`currency` text,
	`address` text,
	`phone_number` text,
	`contact_name` text
);
CREATE TABLE `personal_sizes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text,
	`size` text,
	`us_size` text,
	`uk_size` text,
	`mm` real
);
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`status` text,
	`dates` text,
	`completion` text,
	`owner` text,
	`priority` text,
	`tasks` text,
	`blocked_by` text,
	`is_blocking` text,
	`summary` text,
	`domain` text,
	`url` text,
	"company" text
);
CREATE TABLE `tarot_readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text,
	`card` text,
	`notes` text
);
CREATE TABLE `transportation` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer,
	`date` text,
	`type` text,
	`from_location` text,
	`to_location` text,
	`cost` real,
	`notes` text, transportation_type_id INTEGER REFERENCES transportation_types(id),
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `concerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`artist` text,
	`venue` text,
	`city` text,
	`state` text,
	`date` text
);
CREATE TABLE `credit_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text,
	`fico` integer,
	`vantage` integer
);
CREATE TABLE `domains` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`site` text,
	`registrar` text,
	`purchased` text
);
CREATE TABLE `entertainment_backlog` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`type` text,
	`series` text,
	`watch_date` text
);
CREATE TABLE IF NOT EXISTS "finance_expenses" (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payee` text,
	`monthly_cost` real,
	`type` text,
	`billing_period` text,
	`situation` text,
	`year` integer
, category TEXT, start_date TEXT, end_date TEXT, annual_cost REAL);
CREATE TABLE `family` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`relation` text,
	`birthdate` text,
	`birthplace` text
);
CREATE TABLE `financial_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`type` text,
	`credit_limit` real,
	`active` integer
);
CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_title` text,
	`platform` text,
	`release_year` integer
);
CREATE TABLE `interviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company` text,
	`date_applied` text,
	`phone_screen` text,
	`status` text,
	`location` text
);
CREATE TABLE `job_applications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company` text,
	`date` text,
	`reference` integer,
	`end_date` text,
	`end_stage` text,
	`num_of_stages` integer
);
CREATE TABLE `reading_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`author` text,
	`status` text,
	`date_read` text,
	`category` text,
	`cover` text,
	`issue` text,
	`type` text
);
CREATE TABLE `relationships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`date_started` text,
	`kiss` integer,
	`sex` integer,
	`location` text,
	`profession` text,
	`education` text,
	`diet` text,
	`details` text,
	`date_ended` text,
	`attractiveness_score` integer,
	`age` integer
);
CREATE TABLE `residences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`address` text,
	`start` text,
	`end` text,
	`sqft` integer,
	`start_rent` real,
	`end_rent` real,
	`contact_email` text,
	`contact_number` text
);
CREATE TABLE `schools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`start` text,
	`end` text
);
CREATE TABLE IF NOT EXISTS "trip_attendees"( trip_id INT NOT NULL, person_id INT NOT NULL, role TEXT DEFAULT 'participant', PRIMARY KEY(trip_id, person_id), FOREIGN KEY(trip_id) REFERENCES trips(id) ON UPDATE NO ACTION ON DELETE CASCADE, FOREIGN KEY(person_id) REFERENCES people(id) ON UPDATE NO ACTION ON DELETE NO ACTION );
CREATE TABLE IF NOT EXISTS "finance_transactions" ("id" INTEGER PRIMARY KEY, "date" TEXT NOT NULL, "name" TEXT NOT NULL, "amount" REAL NOT NULL, "status" TEXT NOT NULL, "category" TEXT NOT NULL, "parent_category" TEXT NOT NULL, "excluded" INTEGER NOT NULL DEFAULT false, "tags" TEXT, "type" TEXT NOT NULL, "account" TEXT NOT NULL, "account_mask" TEXT, "note" TEXT, "recurring" INTEGER, "created_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL, account_id INTEGER REFERENCES financial_accounts(id));
CREATE TABLE runway (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    date text,
    available_funds real,
    weight real
);
CREATE TABLE tax_rates (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    place text,
    total_tax_rate real,
    federal_tax_rate real,
    federal_tax_rate_effective real,
    fica_tax_rate real,
    fica_tax_rate_effective real,
    state_tax_rate real,
    state_tax_rate_effective real,
    local_tax_rate real,
    local_tax_rate_effective real,
    sales_tax_rate real
);
CREATE TABLE IF NOT EXISTS "media_log"(
"name" TEXT, "year" TEXT, "letterboxd_uri" TEXT, "movie_id" TEXT,
 "sources" TEXT, "latest_rating" TEXT, "all_ratings" TEXT, "first_watched" TEXT,
 "last_activity" TEXT, "rewatch_count" TEXT, "has_review" TEXT, "all_tags" TEXT,
 "is_watched" TEXT, "is_in_diary" TEXT, "is_rated" TEXT, "is_reviewed" TEXT,
 "is_in_watchlist" TEXT, "is_liked" TEXT, media_type TEXT, season INTEGER, episode INTEGER);
CREATE TABLE podcast_plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  episode_name TEXT,
  show_name TEXT,
  end_time TEXT,
  ms_played INT,
  source TEXT,
  spotify_episode_uri TEXT,
  spotify_track_uri TEXT
);
CREATE TABLE IF NOT EXISTS "trips"(
  id INT PRIMARY KEY,
  start_date TEXT,
  end_date TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  travel_details TEXT,
  price REAL,
  num_of_travelers INT
, location_id INTEGER REFERENCES locations(id));
CREATE TABLE IF NOT EXISTS "hotels"(
  id INT PRIMARY KEY,
  trip_id INT,
  hotel_name TEXT,
  check_in_date TEXT,
  check_out_date TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  price REAL,
  status TEXT,
  number_of_travelers INT,
  notes TEXT, location_id INTEGER REFERENCES locations(id),
  FOREIGN KEY (trip_id) REFERENCES trips(id)
);
CREATE TABLE locations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,
  state TEXT,
  country TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, continent TEXT, status TEXT,
  UNIQUE(city, state, country)
);
CREATE TABLE transportation_types(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT DEFAULT 'Transportation',
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE trip_categories(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(trip_id, category),
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
);
CREATE TABLE trip_tags(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INT NOT NULL,
  tag TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(trip_id, tag),
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
);
CREATE TABLE audit_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  old_data TEXT,
  new_data TEXT,
  changed_by TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "possessions" (
            id INTEGER PRIMARY KEY,
            name TEXT,
            brand TEXT,
            model TEXT,
            category TEXT,
            sub_category TEXT,
            status TEXT,
            acquired_date TEXT,
            retired_date TEXT,
            price REAL,
            sell_price REAL,
            net_value REAL,
            url TEXT,
            image_url TEXT,
            notes TEXT,
            serial_number TEXT,
            size TEXT,
            color TEXT,
            placement TEXT,
            artist TEXT,
            daily_cost REAL,
            days_owned INTEGER
        , amount REAL, amount_unit TEXT);
CREATE TABLE income_log (
            id INTEGER PRIMARY KEY,
            year INTEGER,
            source TEXT,
            location TEXT,
            gross_amount REAL,
            net_amount REAL,
            type TEXT, 
            tax_details TEXT 
        );
CREATE TABLE unified_listening_log (
            id INTEGER PRIMARY KEY,
            timestamp TEXT,
            platform TEXT,
            track_name TEXT,
            artist_name TEXT,
            album_name TEXT,
            ms_played INTEGER,
            reason_start TEXT,
            reason_end TEXT,
            shuffle BOOLEAN,
            skipped BOOLEAN,
            interaction_type TEXT -- 'Playback', 'Library Add', etc.
        , platform_canonical TEXT);
CREATE TABLE unified_activities (
            id INTEGER PRIMARY KEY,
            trip_id INTEGER,
            date TEXT, -- YYYY-MM-DD
            type TEXT, -- 'Dining', 'Concert', 'Museum Visit', etc.
            name TEXT, -- Derived from activity.type or dining.meal
            location TEXT,
            notes TEXT,
            details TEXT, -- JSON for extra fields
            FOREIGN KEY(trip_id) REFERENCES trips(id)
        );
CREATE TABLE unified_activity_people (
            activity_id INTEGER,
            person_id INTEGER,
            role TEXT DEFAULT 'participant',
            PRIMARY KEY (activity_id, person_id),
            FOREIGN KEY(activity_id) REFERENCES unified_activities(id),
            FOREIGN KEY(person_id) REFERENCES people(id)
        );
CREATE TABLE health_weight (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            weight_lb REAL,
            fat_mass_lb REAL,
            bone_mass_lb REAL,
            muscle_mass_lb REAL,
            hydration_lb REAL,
            comments TEXT,
            source TEXT DEFAULT 'Withings'
        );
CREATE TABLE health_sleep (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_time TEXT,
            end_time TEXT,
            light_sleep_seconds INTEGER,
            deep_sleep_seconds INTEGER,
            rem_sleep_seconds INTEGER,
            awake_seconds INTEGER,
            wake_up_count INTEGER,
            duration_to_sleep_seconds INTEGER,
            duration_to_wake_seconds INTEGER,
            snoring_seconds INTEGER,
            snoring_episodes INTEGER,
            avg_heart_rate INTEGER,
            min_heart_rate INTEGER,
            max_heart_rate INTEGER,
            source TEXT DEFAULT 'Withings'
        );
CREATE TABLE health_blood_pressure (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            heart_rate INTEGER,
            systolic INTEGER,
            diastolic INTEGER,
            comments TEXT,
            source TEXT DEFAULT 'Withings'
        );
CREATE TABLE health_heart_rate (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            duration_seconds TEXT, -- JSON array or value
            bpm_value TEXT,       -- JSON array or value
            source TEXT DEFAULT 'Withings'
        );
CREATE TABLE account_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias TEXT NOT NULL UNIQUE,
    canonical_name TEXT NOT NULL,
    account_id INTEGER,
    confidence_score REAL DEFAULT 1.0,
    validation_count INTEGER DEFAULT 0,
    last_seen_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES financial_accounts(id)
);
CREATE TABLE entities (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_subtype TEXT,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT -- JSON blob for domain-specific data
);
CREATE TABLE entity_relationships (
    id TEXT PRIMARY KEY,
    from_entity_id TEXT NOT NULL,
    to_entity_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    strength INTEGER DEFAULT 1 CHECK(strength >= 1 AND strength <= 5),
    bidirectional INTEGER DEFAULT 0,
    metadata TEXT, -- JSON for relationship-specific data
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
    FOREIGN KEY (to_entity_id) REFERENCES entities(id) ON DELETE CASCADE,

    -- Ensure no self-references
    CHECK (from_entity_id != to_entity_id),
    UNIQUE (from_entity_id, to_entity_id, relationship_type)
);
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT, -- NULL = global tag, specific value = domain-specific
    color TEXT DEFAULT '#666666',
    description TEXT,
    usage_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(name, domain)
);
CREATE TABLE entity_tags (
    entity_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (entity_id, tag_id),
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
CREATE TABLE search_index (
    entity_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (entity_id)
);
CREATE TABLE activity_log (
    id TEXT PRIMARY KEY,
    entity_id TEXT,
    action TEXT NOT NULL, -- 'create', 'update', 'delete', 'tag', 'link'
    domain TEXT NOT NULL,
    description TEXT,
    metadata TEXT, -- JSON for action-specific data
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL
);
CREATE TABLE schema_migrations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		version_id INTEGER NOT NULL,
		is_applied INTEGER NOT NULL,
		tstamp TIMESTAMP DEFAULT (datetime('now'))
	);
CREATE TABLE dedup_id_map (
    table_name     TEXT NOT NULL,
    old_id         TEXT NOT NULL,
    canonical_id   TEXT NOT NULL,
    cluster_key    TEXT,
    merge_strategy TEXT,
    merged_at      TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (table_name, old_id)
);
CREATE TABLE dedup_conflicts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name   TEXT NOT NULL,
    cluster_key  TEXT NOT NULL,
    field_name   TEXT NOT NULL,
    value_a      TEXT,
    value_b      TEXT,
    row_ids      TEXT,
    resolution   TEXT,
    resolved_at  TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_finance_transactions_date ON finance_transactions(date);
CREATE INDEX idx_finance_transactions_account ON finance_transactions(account);
CREATE INDEX idx_finance_transactions_category ON finance_transactions(category);
CREATE INDEX idx_finance_transactions_excluded ON finance_transactions(excluded);
CREATE INDEX idx_finance_transactions_amount ON finance_transactions(amount);
CREATE INDEX idx_financial_accounts_name ON financial_accounts(name);
CREATE INDEX idx_aliases_alias ON account_aliases(alias);
CREATE INDEX idx_aliases_canonical ON account_aliases(canonical_name);
CREATE INDEX idx_entities_domain ON entities(domain);
CREATE INDEX idx_entities_type ON entities(domain, entity_type);
CREATE INDEX idx_entities_status ON entities(status);
CREATE INDEX idx_entities_created ON entities(created_at);
CREATE INDEX idx_entities_updated ON entities(updated_at);
CREATE INDEX idx_relationships_from ON entity_relationships(from_entity_id);
CREATE INDEX idx_relationships_to ON entity_relationships(to_entity_id);
CREATE INDEX idx_relationships_type ON entity_relationships(relationship_type);
CREATE INDEX idx_tags_domain ON tags(domain);
CREATE INDEX idx_tags_name ON tags(name);
CREATE INDEX idx_tags_usage ON tags(usage_count);
CREATE INDEX idx_entity_tags_entity ON entity_tags(entity_id);
CREATE INDEX idx_entity_tags_tag ON entity_tags(tag_id);
CREATE INDEX idx_search_domain ON search_index(domain);
CREATE INDEX idx_search_type ON search_index(entity_type);
CREATE INDEX idx_search_title ON search_index(title);
CREATE INDEX idx_activity_entity ON activity_log(entity_id);
CREATE INDEX idx_activity_domain ON activity_log(domain);
CREATE INDEX idx_activity_created ON activity_log(created_at);
CREATE INDEX idx_activity_action ON activity_log(action);
CREATE INDEX idx_ull_artist         ON unified_listening_log(artist_name);
CREATE INDEX idx_ull_track          ON unified_listening_log(track_name);
CREATE INDEX idx_ull_timestamp      ON unified_listening_log(timestamp);
CREATE INDEX idx_ull_platform       ON unified_listening_log(platform_canonical);
CREATE INDEX idx_ull_platform_raw   ON unified_listening_log(platform);
CREATE INDEX idx_media_name         ON media_log(name);
CREATE INDEX idx_media_type         ON media_log(media_type);
CREATE INDEX idx_media_watched      ON media_log(is_watched);
CREATE INDEX idx_media_year         ON media_log(year);
CREATE INDEX idx_people_last        ON people(last_name);
CREATE INDEX idx_people_first       ON people(first_name);
CREATE INDEX idx_people_email       ON people(email);
CREATE INDEX idx_trips_start        ON trips(start_date);
CREATE INDEX idx_trips_location     ON trips(location_id);
CREATE INDEX idx_trips_country      ON trips(country);
CREATE INDEX idx_hw_timestamp       ON health_weight(timestamp);
CREATE INDEX idx_hs_start           ON health_sleep(start_time);
CREATE INDEX idx_hbp_timestamp      ON health_blood_pressure(timestamp);
CREATE INDEX idx_hhr_timestamp      ON health_heart_rate(timestamp);
CREATE INDEX idx_fe_payee           ON finance_expenses(payee);
CREATE INDEX idx_fe_year            ON finance_expenses(year);
CREATE INDEX idx_fe_category        ON finance_expenses(category);
CREATE INDEX idx_poss_category      ON possessions(category);
CREATE INDEX idx_poss_status        ON possessions(status);
CREATE INDEX idx_poss_name          ON possessions(name);
CREATE INDEX idx_rl_author          ON reading_log(author);
CREATE INDEX idx_rl_status          ON reading_log(status);
CREATE INDEX idx_pp_show            ON podcast_plays(show_name);
CREATE INDEX idx_pp_end_time        ON podcast_plays(end_time);
CREATE INDEX idx_amz_order_date     ON amazon_purchases(order_date);
CREATE INDEX idx_amz_category       ON amazon_purchases(category);
CREATE INDEX idx_amz_title          ON amazon_purchases(title);
CREATE INDEX idx_ta_person          ON trip_attendees(person_id);
CREATE INDEX idx_ua_trip            ON unified_activities(trip_id);
CREATE INDEX idx_ua_date            ON unified_activities(date);
CREATE INDEX idx_ua_type            ON unified_activities(type);
CREATE INDEX idx_ce_company         ON career_employers(company);
CREATE INDEX idx_ce_start           ON career_employers(start_date);
CREATE INDEX idx_ja_company         ON job_applications(company);
CREATE INDEX idx_ja_date            ON job_applications(date);
CREATE TRIGGER trg_locations_no_whitespace_dupe
BEFORE INSERT ON locations
BEGIN
    SELECT RAISE(ABORT, 'DEDUP: duplicate location (whitespace-normalised) already exists')
    WHERE EXISTS (
        SELECT 1 FROM locations
        WHERE LOWER(TRIM(city))                       = LOWER(TRIM(NEW.city))
          AND LOWER(TRIM(COALESCE(state,'')))         = LOWER(TRIM(COALESCE(NEW.state,'')))
          AND LOWER(TRIM(country))                    = LOWER(TRIM(NEW.country))
    );
END;
CREATE TRIGGER trg_people_no_name_dupe
BEFORE INSERT ON people
BEGIN
    SELECT RAISE(ABORT, 'DEDUP: person with this name already exists')
    WHERE EXISTS (
        SELECT 1 FROM people
        WHERE LOWER(TRIM(first_name)) = LOWER(TRIM(NEW.first_name))
          AND LOWER(TRIM(COALESCE(last_name,''))) = LOWER(TRIM(COALESCE(NEW.last_name,'')))
    );
END;
CREATE VIEW v_health_heart_rate AS
SELECT
    id,
    timestamp,
    CAST(TRIM(REPLACE(REPLACE(bpm_value,       '[',''),']','')) AS REAL) AS bpm,
    CAST(TRIM(REPLACE(REPLACE(duration_seconds,'[',''),']','')) AS REAL) AS duration_seconds,
    bpm_value        AS bpm_json,
    duration_seconds AS duration_json,
    source,
    -- Multi-value flag: comma inside the brackets means multiple readings
    CASE WHEN bpm_value LIKE '%,%' THEN 1 ELSE 0 END AS is_multi_value
FROM health_heart_rate
/* v_health_heart_rate(id,timestamp,bpm,duration_seconds,bpm_json,duration_json,source,is_multi_value) */;
CREATE VIEW life_timeline AS
SELECT
  'life_event' AS timeline_type,
  'life_events' AS source_table,
  rowid AS source_id,
  datetime(COALESCE(start, date_end)) AS occurred_at,
  datetime(date_end) AS occurred_end_at,
  summary AS title,
  COALESCE(location, city, country) AS subtitle,
  description AS body,
  tags AS tags,
  NULL AS amount,
  JSON_OBJECT(
    'source_rowid', rowid,
    'people', people,
    'location', location,
    'city', city,
    'state', state,
    'country', country
  ) AS metadata
FROM life_events
WHERE COALESCE(start, date_end) IS NOT NULL
UNION ALL
SELECT
  'finance_transaction' AS timeline_type,
  'finance_transactions' AS source_table,
  id AS source_id,
  datetime(date) AS occurred_at,
  NULL AS occurred_end_at,
  name AS title,
  account AS subtitle,
  note AS body,
  tags AS tags,
  amount AS amount,
  JSON_OBJECT(
    'status', status,
    'category', category,
    'parent_category', parent_category,
    'excluded', excluded,
    'type', type,
    'account_mask', account_mask,
    'recurring', recurring,
    'account_id', account_id
  ) AS metadata
FROM finance_transactions
WHERE date IS NOT NULL
UNION ALL
SELECT
  'trip' AS timeline_type,
  'trips' AS source_table,
  id AS source_id,
  datetime(COALESCE(start_date, end_date)) AS occurred_at,
  datetime(end_date) AS occurred_end_at,
  COALESCE(travel_details, city, country, 'Trip') AS title,
  COALESCE(city, country) AS subtitle,
  travel_details AS body,
  NULL AS tags,
  price AS amount,
  JSON_OBJECT(
    'city', city,
    'state', state,
    'country', country,
    'num_of_travelers', num_of_travelers,
    'location_id', location_id
  ) AS metadata
FROM trips
WHERE COALESCE(start_date, end_date) IS NOT NULL
UNION ALL
SELECT
  'reading' AS timeline_type,
  'reading_log' AS source_table,
  id AS source_id,
  datetime(date_read) AS occurred_at,
  NULL AS occurred_end_at,
  name AS title,
  author AS subtitle,
  status AS body,
  category AS tags,
  NULL AS amount,
  JSON_OBJECT(
    'status', status,
    'category', category,
    'type', type,
    'cover', cover,
    'issue', issue
  ) AS metadata
FROM reading_log
WHERE date_read IS NOT NULL;
CREATE VIEW life_event_backlog AS
SELECT
  rowid AS source_id,
  summary,
  description,
  people,
  location,
  tags,
  city,
  state,
  country,
  JSON_OBJECT(
    'source_rowid', rowid,
    'reason', 'missing chronology',
    'has_people', people IS NOT NULL,
    'has_location', location IS NOT NULL,
    'has_tags', tags IS NOT NULL
  ) AS metadata
FROM life_events
WHERE start IS NULL
  AND (date_end IS NULL OR trim(date_end) = '');
CREATE TABLE IF NOT EXISTS "tasks"(
  taskId TEXT,
  taskName TEXT,
  parentTaskId TEXT,
  parentTask TEXT,
  status TEXT,
  created_at TEXT,
  updated_at TEXT,
  sort_order INT,
  indentation INT,
  raw_checkbox TEXT,
  tags TEXT);
CREATE TABLE notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT,
        text TEXT,
        is_task INTEGER DEFAULT 0,
        is_complete INTEGER DEFAULT 0,
        text_analysis TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        ui_screen_type TEXT,
        tags TEXT,
        user_persona TEXT,
        industry TEXT
    );
CREATE TRIGGER trg_notes_no_text_dupe
    BEFORE INSERT ON notes
    WHEN NEW.text IS NOT NULL AND NEW.text != '' AND NEW.file_path IS NOT NULL
    BEGIN
        SELECT RAISE(ABORT, 'DEDUP: note with this (file_path, text) already exists')
        WHERE EXISTS (
            SELECT 1 FROM notes
            WHERE COALESCE(file_path,'') = COALESCE(NEW.file_path,'')
              AND text = NEW.text
        );
    END;
CREATE TRIGGER trg_tasks_no_name_dupe
    BEFORE INSERT ON tasks
    BEGIN
        SELECT RAISE(ABORT, 'DEDUP: task with this name already exists')
        WHERE EXISTS (
            SELECT 1 FROM tasks
            WHERE LOWER(TRIM(taskName)) = LOWER(TRIM(NEW.taskName))
        );
    END;
CREATE TRIGGER trg_media_log_no_dupe
    BEFORE INSERT ON media_log
    WHEN NEW.letterboxd_uri IS NOT NULL AND NEW.letterboxd_uri != ''
    BEGIN
        SELECT RAISE(ABORT, 'DEDUP: media_log with this letterboxd_uri already exists')
        WHERE EXISTS (
            SELECT 1 FROM media_log
            WHERE letterboxd_uri = NEW.letterboxd_uri
        );
    END;
CREATE TABLE calendar_event_people (calendar_event_id INT REFERENCES calendar_events(id), person_id INT REFERENCES people(id), PRIMARY KEY (calendar_event_id, person_id));
CREATE TABLE IF NOT EXISTS "calendar_events"(
  id INT,
  calendar_name TEXT,
  "end" TEXT,
  summary TEXT,
  location TEXT,
  description TEXT,
  status TEXT,
  uid TEXT,
  recurrence_rule TEXT,
  organizer TEXT,
  attendees TEXT,
  created TEXT,
  dtstamp TEXT,
  last_modified TEXT,
  event_type_id INT,
  category_id INT,
  extracted_detail TEXT,
  confidence_score REAL,
  format_class TEXT,
  importance INT,
  threshold_value REAL,
  threshold_currency TEXT,
  threshold_direction TEXT,
  planned_at TEXT,
  start TEXT,
  early_achievement_days INT
);
CREATE INDEX idx_cal_uid ON calendar_events(uid);
CREATE INDEX idx_cal_calendar ON calendar_events(calendar_name);
CREATE INDEX idx_cal_summary ON calendar_events(summary);
CREATE INDEX idx_cal_start ON calendar_events(start);
CREATE TABLE refinery_schema_history(
             version int4 PRIMARY KEY,
             name VARCHAR(255),
             applied_on VARCHAR(255),
             checksum VARCHAR(255));
CREATE TABLE calendar_events_raw (
    id                      INTEGER PRIMARY KEY,
    import_batch_id         TEXT NOT NULL,
    source_system           TEXT,
    source_file             TEXT NOT NULL,
    source_path             TEXT,
    source_hash             TEXT,

    uid                     TEXT NOT NULL,
    recurrence_id_raw        TEXT,
    recurrence_id_utc       TEXT,
    sequence                INTEGER,
    dtstamp_utc             TEXT,
    created_utc             TEXT,
    last_modified_utc       TEXT,

    calendar_name           TEXT,
    prodid                  TEXT,
    method                  TEXT,
    event_type              TEXT,
    classification          TEXT,
    status                  TEXT,
    transp                  TEXT,

    summary                 TEXT,
    description             TEXT,
    location               TEXT,

    dtstart_raw            TEXT,
    dtstart_tzid           TEXT,
    dtstart_utc            TEXT,
    dtstart_kind           TEXT,

    dtend_raw              TEXT,
    dtend_tzid             TEXT,
    dtend_utc              TEXT,
    dtend_kind             TEXT,

    duration_raw            TEXT,
    all_day                INTEGER DEFAULT 0,

    rrule_raw              TEXT,
    exdate_raw             TEXT,
    rdate_raw              TEXT,
    exrule_raw             TEXT,
    tzid                   TEXT,

    organizer              TEXT,
    attendees_json          TEXT,
    categories_json        TEXT,
    url                    TEXT,

    raw                    TEXT NOT NULL,
    parse_warnings_json    TEXT,
    parse_error            TEXT,

    ingested_at            TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_raw_event_key
    ON calendar_events_raw(source_file, uid,
        COALESCE(recurrence_id_raw, ''),
        COALESCE(sequence, 0));
CREATE INDEX idx_raw_uid ON calendar_events_raw(uid);
CREATE INDEX idx_raw_source_file ON calendar_events_raw(source_file);
CREATE INDEX idx_raw_source_system ON calendar_events_raw(source_system);
CREATE INDEX idx_raw_summary ON calendar_events_raw(summary);
CREATE INDEX idx_raw_dtstart_utc ON calendar_events_raw(dtstart_utc);
CREATE INDEX idx_raw_import_batch ON calendar_events_raw(import_batch_id);
CREATE TABLE calendar_event_occurrences (
    id                      INTEGER PRIMARY KEY,
    raw_event_id            INTEGER NOT NULL,
    uid                     TEXT NOT NULL,

    occurrence_key          TEXT NOT NULL,
    recurrence_id_utc       TEXT,
    occurrence_start_utc    TEXT NOT NULL,
    occurrence_end_utc      TEXT,
    occurrence_date         TEXT,

    is_all_day              INTEGER NOT NULL DEFAULT 0,
    is_generated            INTEGER NOT NULL DEFAULT 0,
    is_override             INTEGER NOT NULL DEFAULT 0,
    is_cancelled            INTEGER NOT NULL DEFAULT 0,
    is_excluded             INTEGER NOT NULL DEFAULT 0,
    status                  TEXT,

    summary                 TEXT,
    description             TEXT,
    location                TEXT,

    expansion_window_start  TEXT,
    expansion_window_end    TEXT,
    expanded_at            TEXT NOT NULL,
    expansion_version      TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_occ_key
    ON calendar_event_occurrences(uid, occurrence_key);
CREATE INDEX idx_occ_start ON calendar_event_occurrences(occurrence_start_utc);
CREATE INDEX idx_occ_date ON calendar_event_occurrences(occurrence_date);
CREATE INDEX idx_occ_raw_id ON calendar_event_occurrences(raw_event_id);
CREATE TABLE cal_import_batches (
    id                      TEXT PRIMARY KEY,
    imported_at             TEXT NOT NULL,
    source_paths_json       TEXT,
    file_count              INTEGER,
    event_count             INTEGER,
    warning_count           INTEGER,
    error_count             INTEGER
);
CREATE TABLE cal_schema_version (
    version                 INTEGER PRIMARY KEY,
    applied_at              TEXT NOT NULL
);
