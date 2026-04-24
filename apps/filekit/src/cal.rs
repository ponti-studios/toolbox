use anyhow::{Context, Result};
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use chrono_tz::Tz;
use clap::Parser;
use refinery::embed_migrations;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use walkdir::WalkDir;

embed_migrations!("migrations");

#[derive(Debug, Clone)]
pub struct RawEvent {
    pub import_batch_id: String,
    pub source_system: Option<String>,
    pub source_file: String,
    pub source_path: Option<String>,
    pub source_hash: Option<String>,
    pub uid: String,
    pub recurrence_id_raw: Option<String>,
    pub recurrence_id_utc: Option<String>,
    pub sequence: Option<i32>,
    pub dtstamp_utc: Option<String>,
    pub created_utc: Option<String>,
    pub last_modified_utc: Option<String>,
    pub calendar_name: Option<String>,
    pub prodid: Option<String>,
    pub method: Option<String>,
    pub event_type: Option<String>,
    pub classification: Option<String>,
    pub status: Option<String>,
    pub transp: Option<String>,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub location: Option<String>,
    pub dtstart_raw: Option<String>,
    pub dtstart_tzid: Option<String>,
    pub dtstart_utc: Option<String>,
    pub dtstart_kind: String,
    pub dtend_raw: Option<String>,
    pub dtend_tzid: Option<String>,
    pub dtend_utc: Option<String>,
    pub dtend_kind: String,
    pub duration_raw: Option<String>,
    pub all_day: bool,
    pub rrule_raw: Option<String>,
    pub exdate_raw: Option<String>,
    pub rdate_raw: Option<String>,
    pub exrule_raw: Option<String>,
    pub tzid: Option<String>,
    pub organizer: Option<String>,
    pub attendees_json: Option<String>,
    pub categories_json: Option<String>,
    pub url: Option<String>,
    pub raw: String,
    pub parse_warnings_json: Option<String>,
    pub parse_error: Option<String>,
    pub ingested_at: String,
}

#[derive(Debug, Clone)]
pub struct Occurrence {
    pub raw_event_id: i64,
    pub uid: String,
    pub occurrence_key: String,
    pub recurrence_id_utc: Option<String>,
    pub occurrence_start_utc: String,
    pub occurrence_end_utc: Option<String>,
    pub occurrence_date: Option<String>,
    pub is_all_day: bool,
    pub is_generated: bool,
    pub is_override: bool,
    pub is_cancelled: bool,
    pub is_excluded: bool,
    pub status: Option<String>,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub location: Option<String>,
    pub expansion_window_start: Option<String>,
    pub expansion_window_end: Option<String>,
    pub expanded_at: String,
    pub expansion_version: String,
}

#[derive(Parser)]
pub struct ImportOpts {
    #[arg(short, long)]
    pub db: Option<PathBuf>,
    pub path: PathBuf,
    #[arg(long)]
    pub source_system: Option<String>,
    #[arg(long, default_value = "2")]
    pub future_years: u32,
    #[arg(long, default_value = "1")]
    pub past_years: u32,
}

#[derive(Parser)]
pub struct ExpandOpts {
    #[arg(short, long)]
    pub db: Option<PathBuf>,
    #[arg(long)]
    pub from: String,
    #[arg(long)]
    pub to: String,
    #[arg(long, short)]
    pub rebuild: bool,
}

#[derive(Parser)]
pub struct QueryOpts {
    #[arg(short, long)]
    pub db: Option<PathBuf>,
    pub text: String,
    #[arg(long)]
    pub from: Option<String>,
    #[arg(long)]
    pub to: Option<String>,
    #[arg(long, default_value = "50")]
    pub limit: usize,
}

#[derive(Parser)]
pub struct InspectOpts {
    #[arg(short, long)]
    pub db: Option<PathBuf>,
    pub identifier: String,
}

#[derive(Parser)]
pub struct StatsOpts {
    #[arg(short, long)]
    pub db: Option<PathBuf>,
}

#[derive(Parser)]
pub struct DoctorOpts {
    #[arg(short, long)]
    pub db: Option<PathBuf>,
}

#[derive(clap::Subcommand)]
pub enum CalCmd {
    Import(ImportOpts),
    Expand(ExpandOpts),
    Query(QueryOpts),
    Inspect(InspectOpts),
    Stats(StatsOpts),
    Doctor(DoctorOpts),
}

fn get_db_path(cli_override: &Option<PathBuf>) -> PathBuf {
    if let Some(ref p) = cli_override {
        return p.clone();
    }
    if let Ok(p) = std::env::var("FILEKIT_DB") {
        return PathBuf::from(p);
    }
    let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join(".hominem").join("db.sqlite")
}

#[allow(dead_code)]
fn infer_source_system(prodid: &Option<String>, path: &Path) -> String {
    if let Some(ref p) = prodid {
        let p_lower = p.to_lowercase();
        if p_lower.contains("google") {
            return "google".to_string();
        }
        if p_lower.contains("apple") || p_lower.contains("apple inc") {
            return "apple".to_string();
        }
        if p_lower.contains("microsoft") || p_lower.contains("outlook") {
            return "outlook".to_string();
        }
        if p_lower.contains("mimecast") {
            return "mimecast".to_string();
        }
        if p_lower.contains("todoist") {
            return "todoist".to_string();
        }
    }
    let name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if name.contains("todoist") {
        return "todoist".to_string();
    }
    if name.contains("mimecast") {
        return "mimecast".to_string();
    }
    if name.contains("apple") {
        return "apple".to_string();
    }
    "unknown".to_string()
}

fn unfold_ics(content: &str) -> String {
    let mut result = String::with_capacity(content.len());
    let mut prev_continuation = false;
    for line in content.lines() {
        let line = line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        if prev_continuation && (line.starts_with(' ') || line.starts_with('\t')) {
            result.push_str(line.trim_start_matches([' ', '\t']));
        } else {
            if !result.is_empty() {
                result.push('\n');
            }
            result.push_str(line);
        }
        prev_continuation = line.ends_with('\\');
    }
    result
}

fn parse_ical_value(raw: &str) -> String {
    raw.replace("\\n", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
}

fn parse_datetime(raw: &str, default_tz: Option<&str>) -> (Option<String>, Option<String>, String) {
    let raw = raw.trim();

    if raw.contains("VALUE=DATE") {
        if let Some(idx) = raw.find(':') {
            let date_str = raw[idx + 1..].trim();
            if date_str.len() == 8 && date_str.chars().all(|c| c.is_ascii_digit()) {
                return (Some(date_str.to_string()), None, "date".to_string());
            }
        }
        if raw.len() == 8 && raw.chars().all(|c| c.is_ascii_digit()) {
            return (Some(raw.to_string()), None, "date".to_string());
        }
    }

    if raw.len() == 8 && raw.chars().all(|c| c.is_ascii_digit()) {
        return (Some(raw.to_string()), None, "date".to_string());
    }

    if raw.ends_with('Z') {
        if let Ok(dt) = DateTime::parse_from_rfc3339(raw) {
            return (
                Some(raw.to_string()),
                Some(dt.with_timezone(&Utc).to_rfc3339()),
                "utc".to_string(),
            );
        }
    }

    let params_part = raw.split(':').next().unwrap_or("");
    let value_part = raw.split(':').next_back().unwrap_or(raw);

    let tzid = params_part
        .split(';')
        .find(|p| p.starts_with("TZID="))
        .map(|p| p.trim_start_matches("TZID="));

    if let Ok(dt) = DateTime::parse_from_rfc3339(value_part) {
        return (
            Some(raw.to_string()),
            Some(dt.with_timezone(&Utc).to_rfc3339()),
            "utc".to_string(),
        );
    }

    let naive_formats = ["%Y%m%dT%H%M%S", "%Y%m%dT%H%M"];
    for fmt in &naive_formats {
        if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(value_part, fmt) {
            if let Some(tz_name) = tzid.or(default_tz) {
                if let Ok(tz) = Tz::from_str(tz_name) {
                    if let Some(dt) = tz.from_local_datetime(&ndt).single() {
                        return (
                            Some(raw.to_string()),
                            Some(dt.with_timezone(&Utc).to_rfc3339()),
                            "zoned".to_string(),
                        );
                    }
                }
            }
            let dt = Utc.from_utc_datetime(&ndt);
            return (
                Some(raw.to_string()),
                Some(dt.to_rfc3339()),
                "floating".to_string(),
            );
        }
    }

    if let Some(tz_name) = tzid.or(default_tz) {
        if let Ok(tz) = Tz::from_str(tz_name) {
            for fmt in &naive_formats {
                if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(value_part, fmt) {
                    if let Some(dt) = tz.from_local_datetime(&ndt).single() {
                        return (
                            Some(raw.to_string()),
                            Some(dt.with_timezone(&Utc).to_rfc3339()),
                            "zoned".to_string(),
                        );
                    }
                }
            }
        }
    }

    (Some(raw.to_string()), None, "unknown".to_string())
}

fn file_hash(path: &Path) -> Result<String> {
    use std::io::Read;
    let mut file = fs::File::open(path).context("opening file for hash")?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = file.read(&mut buf).context("reading file for hash")?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn parse_ics_file(
    path: &Path,
    import_batch_id: &str,
    inferred_source: &str,
) -> Result<Vec<RawEvent>> {
    let content = fs::read_to_string(path).context("reading ics file")?;
    let unfolded = unfold_ics(&content);
    let source_hash = file_hash(path)?;
    let source_file = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown.ics")
        .to_string();
    let source_path = path.to_str().map(String::from);

    let mut events = Vec::new();
    let mut warnings = Vec::new();
    let mut prodid: Option<String> = None;
    let mut method: Option<String> = None;
    let mut calendar_name: Option<String> = None;
    let mut current_tzid: Option<String> = None;
    let mut vevent_raw = String::new();
    let mut in_vevent = false;
    let mut fields: HashMap<String, String> = HashMap::new();

    for line in unfolded.lines() {
        if line.is_empty() {
            continue;
        }

        if line == "BEGIN:VEVENT" {
            in_vevent = true;
            vevent_raw.clear();
            fields.clear();
            current_tzid = None;
            vevent_raw.push_str(line);
            vevent_raw.push('\n');
            continue;
        }
        if line == "END:VEVENT" {
            in_vevent = false;
            vevent_raw.push_str(line);
            vevent_raw.push('\n');

            let uid = fields.get("UID").cloned().unwrap_or_else(|| {
                warnings.push("Missing UID".to_string());
                format!(
                    "MISSING-UID-{}",
                    chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
                )
            });

            let dtstamp_utc = fields
                .get("DTSTAMP")
                .and_then(|v| parse_datetime(v, None).1);
            let created_utc = fields
                .get("CREATED")
                .and_then(|v| parse_datetime(v, None).1);
            let last_modified_utc = fields
                .get("LAST-MODIFIED")
                .and_then(|v| parse_datetime(v, None).1);

            let dtstart_raw = fields.get("DTSTART").cloned();
            let dtend_raw = fields.get("DTEND").cloned();

            let (dtstart_tzid, dtstart_kind) = {
                let hint = current_tzid
                    .as_deref()
                    .or(dtstart_raw.as_ref().and_then(|v| {
                        v.split(';')
                            .find(|p| p.starts_with("TZID="))
                            .map(|p| p.trim_start_matches("TZID="))
                    }));
                (
                    hint.map(String::from),
                    dtstart_raw
                        .as_ref()
                        .map(|v| {
                            if v.contains("VALUE=DATE") {
                                "date"
                            } else if v.ends_with('Z') {
                                "utc"
                            } else {
                                "zoned"
                            }
                        })
                        .unwrap_or("unknown")
                        .to_string(),
                )
            };

            let dtstart_utc_val = dtstart_raw
                .as_ref()
                .and_then(|v| parse_datetime(v, current_tzid.as_deref()).1);
            let dtend_utc_val = dtend_raw
                .as_ref()
                .and_then(|v| parse_datetime(v, current_tzid.as_deref()).1);

            let all_day = dtstart_kind == "date";

            let recurrence_id_raw = fields.get("RECURRENCE-ID").cloned();
            let recurrence_id_utc = recurrence_id_raw
                .as_ref()
                .and_then(|v| parse_datetime(v, current_tzid.as_deref()).1);

            let rrule_raw = fields.get("RRULE").cloned();
            let exdate_raw = fields.get("EXDATE").cloned();
            let rdate_raw = fields.get("RDATE").cloned();
            let exrule_raw = fields.get("EXRULE").cloned();

            let sequence = fields.get("SEQUENCE").and_then(|v| v.parse().ok());
            let classification = fields.get("CLASS").cloned();
            let status = fields.get("STATUS").cloned();
            let transp = fields.get("TRANSP").cloned();

            let summary = fields.get("SUMMARY").cloned().map(|v| parse_ical_value(&v));
            let description = fields
                .get("DESCRIPTION")
                .cloned()
                .map(|v| parse_ical_value(&v));
            let location = fields.get("LOCATION").cloned();
            let organizer = fields.get("ORGANIZER").cloned();
            let url = fields.get("URL").cloned();

            let categories_json = fields.get("CATEGORIES").map(|v| {
                serde_json::to_string(
                    &v.split(',')
                        .map(|s| s.trim().to_string())
                        .collect::<Vec<_>>(),
                )
                .unwrap_or_else(|_| "[]".to_string())
            });
            let attendees_json = fields.get("ATTENDEE").map(|v| {
                serde_json::to_string(
                    &v.split(',')
                        .map(|s| s.trim().to_string())
                        .collect::<Vec<_>>(),
                )
                .unwrap_or_else(|_| "[]".to_string())
            });

            let warnings_json = if warnings.is_empty() {
                None
            } else {
                Some(serde_json::to_string(&warnings).unwrap_or_default())
            };

            events.push(RawEvent {
                import_batch_id: import_batch_id.to_string(),
                source_system: Some(inferred_source.to_string()),
                source_file: source_file.clone(),
                source_path: source_path.clone(),
                source_hash: Some(source_hash.clone()),
                uid,
                recurrence_id_raw,
                recurrence_id_utc,
                sequence,
                dtstamp_utc,
                created_utc,
                last_modified_utc,
                calendar_name: calendar_name.clone(),
                prodid: prodid.clone(),
                method: method.clone(),
                event_type: None,
                classification,
                status,
                transp,
                summary,
                description,
                location,
                dtstart_raw,
                dtstart_tzid,
                dtstart_utc: dtstart_utc_val,
                dtstart_kind,
                dtend_raw,
                dtend_tzid: None,
                dtend_utc: dtend_utc_val,
                dtend_kind: "zoned".to_string(),
                duration_raw: fields.get("DURATION").cloned(),
                all_day,
                rrule_raw,
                exdate_raw,
                rdate_raw,
                exrule_raw,
                tzid: current_tzid.clone(),
                organizer,
                attendees_json,
                categories_json,
                url,
                raw: vevent_raw.clone(),
                parse_warnings_json: warnings_json,
                parse_error: None,
                ingested_at: Utc::now().to_rfc3339(),
            });

            warnings.clear();
            continue;
        }

        if in_vevent {
            vevent_raw.push_str(line);
            vevent_raw.push('\n');
        }

        let parts: Vec<&str> = line.splitn(2, ':').collect();
        if parts.len() < 2 {
            continue;
        }

        let key_full = parts[0];
        let value = parts[1].trim();

        let key_base = key_full.split(';').next().unwrap_or(key_full);

        if key_base == "BEGIN" || key_base == "END" {
            continue;
        }

        if key_base == "TZID" {
            current_tzid = Some(value.to_string());
            continue;
        }

        if in_vevent {
            let existing = fields.get(key_base).cloned();
            let combined = if let Some(prev) = existing {
                format!("{},{}", prev, value)
            } else {
                value.to_string()
            };
            fields.insert(key_base.to_string(), combined);
        } else {
            match key_base {
                "PRODID" => {
                    prodid = Some(value.to_string());
                }
                "METHOD" => {
                    method = Some(value.to_string());
                }
                "X-WR-CALNAME" => {
                    calendar_name = Some(value.to_string());
                }
                _ => {}
            }
        }
    }

    Ok(events)
}

fn insert_raw_event(conn: &Connection, event: &RawEvent) -> Result<i64> {
    conn.execute(
        r#"INSERT OR REPLACE INTO calendar_events_raw (
            import_batch_id, source_system, source_file, source_path, source_hash,
            uid, recurrence_id_raw, recurrence_id_utc, sequence,
            dtstamp_utc, created_utc, last_modified_utc,
            calendar_name, prodid, method, event_type, classification, status, transp,
            summary, description, location,
            dtstart_raw, dtstart_tzid, dtstart_utc, dtstart_kind,
            dtend_raw, dtend_tzid, dtend_utc, dtend_kind,
            duration_raw, all_day,
            rrule_raw, exdate_raw, rdate_raw, exrule_raw, tzid,
            organizer, attendees_json, categories_json, url,
            raw, parse_warnings_json, parse_error, ingested_at
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19,
            ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35, ?36,
            ?37, ?38, ?39, ?40, ?41, ?42, ?43, ?44, ?45
        )"#,
        params![
            event.import_batch_id,
            event.source_system,
            event.source_file,
            event.source_path,
            event.source_hash,
            event.uid,
            event.recurrence_id_raw,
            event.recurrence_id_utc,
            event.sequence,
            event.dtstamp_utc,
            event.created_utc,
            event.last_modified_utc,
            event.calendar_name,
            event.prodid,
            event.method,
            event.event_type,
            event.classification,
            event.status,
            event.transp,
            event.summary,
            event.description,
            event.location,
            event.dtstart_raw,
            event.dtstart_tzid,
            event.dtstart_utc,
            event.dtstart_kind,
            event.dtend_raw,
            event.dtend_tzid,
            event.dtend_utc,
            event.dtend_kind,
            event.duration_raw,
            event.all_day as i32,
            event.rrule_raw,
            event.exdate_raw,
            event.rdate_raw,
            event.exrule_raw,
            event.tzid,
            event.organizer,
            event.attendees_json,
            event.categories_json,
            event.url,
            event.raw,
            event.parse_warnings_json,
            event.parse_error,
            event.ingested_at
        ],
    )
    .context("inserting raw event")?;
    Ok(conn.last_insert_rowid())
}

fn make_naive_date(raw: &str) -> Option<chrono::NaiveDate> {
    if raw.len() == 8 && raw.chars().all(|c| c.is_ascii_digit()) {
        let y: i32 = raw[0..4].parse().ok()?;
        let m: u32 = raw[4..6].parse().ok()?;
        let d: u32 = raw[6..8].parse().ok()?;
        chrono::NaiveDate::from_ymd_opt(y, m, d)
    } else {
        None
    }
}

fn expand_single_event(
    event: &RawEvent,
    raw_id: i64,
    window_start: &NaiveDate,
    window_end: &NaiveDate,
    version: &str,
) -> Vec<Occurrence> {
    let expanded_at = Utc::now().to_rfc3339();

    let start_utc = if let Some(ref s) = event.dtstart_utc {
        DateTime::parse_from_rfc3339(s)
            .ok()
            .map(|dt| dt.with_timezone(&Utc))
    } else if let Some(ref s) = event.dtstart_raw {
        make_naive_date(s).and_then(|d| {
            let default_tz: Tz = event
                .dtstart_tzid
                .as_ref()
                .and_then(|t| Tz::from_str(t).ok())
                .unwrap_or_else(|| "UTC".parse().unwrap());
            default_tz
                .from_local_datetime(&d.and_hms_opt(0, 0, 0).unwrap())
                .single()
                .map(|dt| dt.with_timezone(&Utc))
        })
    } else {
        None
    };

    let end_utc = event
        .dtend_utc
        .as_ref()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&Utc));

    if let Some(start) = start_utc {
        if start.date_naive() < *window_start || start.date_naive() > *window_end {
            return Vec::new();
        }

        let date_str = if event.all_day {
            Some(start.format("%Y-%m-%d").to_string())
        } else {
            None
        };
        let key = format!(
            "{}:{}",
            start.to_rfc3339(),
            end_utc.map(|e| e.to_rfc3339()).unwrap_or_default()
        );

        vec![Occurrence {
            raw_event_id: raw_id,
            uid: event.uid.clone(),
            occurrence_key: key,
            recurrence_id_utc: event.recurrence_id_utc.clone(),
            occurrence_start_utc: start.to_rfc3339(),
            occurrence_end_utc: end_utc.map(|e| e.to_rfc3339()),
            occurrence_date: date_str,
            is_all_day: event.all_day,
            is_generated: event.rrule_raw.is_some(),
            is_override: event.recurrence_id_raw.is_some(),
            is_cancelled: event
                .status
                .as_ref()
                .map(|s| s == "CANCELLED")
                .unwrap_or(false),
            is_excluded: false,
            status: event.status.clone(),
            summary: event.summary.clone(),
            description: event.description.clone(),
            location: event.location.clone(),
            expansion_window_start: Some(window_start.format("%Y-%m-%d").to_string()),
            expansion_window_end: Some(window_end.format("%Y-%m-%d").to_string()),
            expanded_at: expanded_at.clone(),
            expansion_version: version.to_string(),
        }]
    } else {
        Vec::new()
    }
}

fn insert_occurrences(conn: &Connection, occs: &[Occurrence]) -> Result<()> {
    for occ in occs {
        conn.execute(
            r#"INSERT OR REPLACE INTO calendar_event_occurrences (
                raw_event_id, uid, occurrence_key, recurrence_id_utc,
                occurrence_start_utc, occurrence_end_utc, occurrence_date,
                is_all_day, is_generated, is_override, is_cancelled, is_excluded, status,
                summary, description, location,
                expansion_window_start, expansion_window_end, expanded_at, expansion_version
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)"#,
            params![
                occ.raw_event_id, occ.uid, occ.occurrence_key, occ.recurrence_id_utc,
                occ.occurrence_start_utc, occ.occurrence_end_utc, occ.occurrence_date,
                occ.is_all_day as i32, occ.is_generated as i32, occ.is_override as i32,
                occ.is_cancelled as i32, occ.is_excluded as i32, occ.status,
                occ.summary, occ.description, occ.location,
                occ.expansion_window_start, occ.expansion_window_end, occ.expanded_at, occ.expansion_version
            ],
        ).context("inserting occurrence")?;
    }
    Ok(())
}

fn ensure_migrations(conn: &mut Connection) -> Result<()> {
    migrations::runner()
        .run(conn)
        .context("running database migrations")?;
    Ok(())
}

pub fn run_import(opts: ImportOpts) -> Result<()> {
    let db_path = get_db_path(&opts.db);
    let parent = db_path.parent().unwrap_or(Path::new("."));
    if !parent.exists() {
        fs::create_dir_all(parent).context("creating filekit data dir")?;
    }
    let mut conn = Connection::open(&db_path).context("opening DB")?;
    ensure_migrations(&mut conn)?;

    let import_batch_id = format!("import-{}", chrono::Utc::now().format("%Y%m%d%H%M%S"));

    let ics_files: Vec<PathBuf> = WalkDir::new(&opts.path)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("ics"))
        .map(|e| e.path().to_path_buf())
        .collect();

    if ics_files.is_empty() {
        println!("No .ics files found in {}", opts.path.display());
        return Ok(());
    }

    println!("Found {} .ics files", ics_files.len());

    let mut total_events = 0;
    let mut total_warnings = 0;
    let mut total_errors = 0;

    for file_path in &ics_files {
        let source_system = opts
            .source_system
            .clone()
            .or_else(|| {
                file_path.file_stem().and_then(|s| s.to_str()).map(|s| {
                    let s_lower = s.to_lowercase();
                    if s_lower.contains("todoist") {
                        return "todoist".to_string();
                    }
                    if s_lower.contains("mimecast") {
                        return "mimecast".to_string();
                    }
                    if s_lower.contains("apple") {
                        return "apple".to_string();
                    }
                    "google".to_string()
                })
            })
            .unwrap_or_else(|| "google".to_string());

        match parse_ics_file(file_path, &import_batch_id, &source_system) {
            Ok(events) => {
                let event_count = events.len();
                for event in &events {
                    insert_raw_event(&conn, event)?;
                }
                let warnings = events
                    .iter()
                    .filter_map(|e| e.parse_warnings_json.as_ref())
                    .count();
                println!(
                    "  {}: {} events, {} warnings",
                    file_path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("?"),
                    event_count,
                    warnings
                );
                total_events += event_count;
                total_warnings += warnings;
            }
            Err(e) => {
                eprintln!("  ERROR parsing {}: {}", file_path.display(), e);
                total_errors += 1;
            }
        }
    }

    conn.execute(
        "INSERT INTO cal_import_batches (id, imported_at, source_paths_json, file_count, event_count, warning_count, error_count) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            import_batch_id,
            Utc::now().to_rfc3339(),
            serde_json::to_string(&ics_files.iter().filter_map(|p| p.to_str()).collect::<Vec<_>>()).unwrap_or_default(),
            ics_files.len() as i64,
            total_events as i64,
            total_warnings as i64,
            total_errors as i64
        ],
    ).context("inserting batch record")?;

    println!(
        "\nImport complete: {} events, {} warnings, {} errors",
        total_events, total_warnings, total_errors
    );

    let today = chrono::Utc::now().date_naive();
    let expand_from = today - chrono::Duration::days((opts.past_years * 365) as i64);
    let expand_to = today + chrono::Duration::days((opts.future_years * 365) as i64);

    println!(
        "\nExpanding occurrences from {} to {}...",
        expand_from, expand_to
    );

    let events: Vec<RawEvent> = {
        let mut stmt = conn.prepare(
            "SELECT id, import_batch_id, source_system, source_file, source_path, source_hash,
                uid, recurrence_id_raw, recurrence_id_utc, sequence,
                dtstamp_utc, created_utc, last_modified_utc,
                calendar_name, prodid, method, event_type, classification, status, transp,
                summary, description, location,
                dtstart_raw, dtstart_tzid, dtstart_utc, dtstart_kind,
                dtend_raw, dtend_tzid, dtend_utc, dtend_kind,
                duration_raw, all_day, rrule_raw, exdate_raw, rdate_raw, exrule_raw, tzid,
                organizer, attendees_json, categories_json, url,
                raw, parse_warnings_json, parse_error, ingested_at
             FROM calendar_events_raw",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(RawEvent {
                import_batch_id: row.get("import_batch_id")?,
                source_system: row.get("source_system")?,
                source_file: row.get("source_file")?,
                source_path: row.get("source_path")?,
                source_hash: row.get("source_hash")?,
                uid: row.get("uid")?,
                recurrence_id_raw: row.get("recurrence_id_raw")?,
                recurrence_id_utc: row.get("recurrence_id_utc")?,
                sequence: row.get("sequence")?,
                dtstamp_utc: row.get("dtstamp_utc")?,
                created_utc: row.get("created_utc")?,
                last_modified_utc: row.get("last_modified_utc")?,
                calendar_name: row.get("calendar_name")?,
                prodid: row.get("prodid")?,
                method: row.get("method")?,
                event_type: row.get("event_type")?,
                classification: row.get("classification")?,
                status: row.get("status")?,
                transp: row.get("transp")?,
                summary: row.get("summary")?,
                description: row.get("description")?,
                location: row.get("location")?,
                dtstart_raw: row.get("dtstart_raw")?,
                dtstart_tzid: row.get("dtstart_tzid")?,
                dtstart_utc: row.get("dtstart_utc")?,
                dtstart_kind: row.get("dtstart_kind")?,
                dtend_raw: row.get("dtend_raw")?,
                dtend_tzid: row.get("dtend_tzid")?,
                dtend_utc: row.get("dtend_utc")?,
                dtend_kind: row.get("dtend_kind")?,
                duration_raw: row.get("duration_raw")?,
                all_day: row.get::<_, i32>("all_day")? != 0,
                rrule_raw: row.get("rrule_raw")?,
                exdate_raw: row.get("exdate_raw")?,
                rdate_raw: row.get("rdate_raw")?,
                exrule_raw: row.get("exrule_raw")?,
                tzid: row.get("tzid")?,
                organizer: row.get("organizer")?,
                attendees_json: row.get("attendees_json")?,
                categories_json: row.get("categories_json")?,
                url: row.get("url")?,
                raw: row.get("raw")?,
                parse_warnings_json: row.get("parse_warnings_json")?,
                parse_error: row.get("parse_error")?,
                ingested_at: row.get("ingested_at")?,
            })
        })?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let version = chrono::Utc::now().format("%Y%m%d%H%M%S").to_string();
    let mut occ_count = 0;

    for raw_event in &events {
        let raw_id = {
            let mut s = conn.prepare(
                "SELECT id FROM calendar_events_raw WHERE uid = ?1 AND source_file = ?2 LIMIT 1",
            )?;
            s.query_row(params![raw_event.uid, raw_event.source_file], |r| r.get(0))
                .unwrap_or(0)
        };
        if raw_id == 0 {
            continue;
        }
        let occs = expand_single_event(raw_event, raw_id, &expand_from, &expand_to, &version);
        insert_occurrences(&conn, &occs)?;
        occ_count += occs.len();
    }

    println!("Expanded {} occurrences (note: RRULE expansion is a future feature - recurring events show one placeholder)", occ_count);
    Ok(())
}

pub fn run_query(opts: QueryOpts) -> Result<()> {
    let db_path = get_db_path(&opts.db);
    let mut conn = Connection::open(&db_path).context("opening DB")?;
    ensure_migrations(&mut conn)?;

    let search_term = format!("%{}%", opts.text.to_lowercase());

    let mut sql = r#"SELECT o.uid, o.occurrence_start_utc, o.occurrence_date,
                  o.summary, o.is_cancelled,
                  r.source_file, r.source_system
           FROM calendar_event_occurrences o
           JOIN calendar_events_raw r ON r.id = o.raw_event_id
           WHERE (lower(o.summary) LIKE ?1 OR lower(o.description) LIKE ?1 OR lower(o.location) LIKE ?1)
           "#.to_string();

    if let Some(ref f) = opts.from {
        sql.push_str(&format!(" AND o.occurrence_start_utc >= '{}'", f));
    }
    if let Some(ref t) = opts.to {
        sql.push_str(&format!(" AND o.occurrence_start_utc <= '{}'", t));
    }
    sql.push_str(&format!(
        " ORDER BY o.occurrence_start_utc LIMIT {}",
        opts.limit
    ));

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([&search_term], |row| {
        Ok((
            row.get::<_, Option<String>>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, i32>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
        ))
    })?;

    let mut count = 0;
    for row in rows.flatten() {
        let (uid, start, date, summary, cancelled, source_file, source_system) = row;
        let uid_display = uid
            .as_ref()
            .map(|u| u.chars().take(8).collect::<String>())
            .unwrap_or_default();
        let summary_display = summary.as_deref().unwrap_or("(no summary)");
        let cancelled_flag = cancelled != 0;

        let date_display = if let Some(ref d) = date {
            format!("[{}] ", d)
        } else if let Some(ref s) = start {
            DateTime::parse_from_rfc3339(s)
                .map(|dt| format!("[{}] ", dt.format("%Y-%m-%d %H:%M")))
                .unwrap_or_default()
        } else {
            String::new()
        };

        let marker = if cancelled_flag { " [CANCELLED]" } else { "" };
        println!(
            "{} {}{}{} ({}/{})",
            uid_display,
            date_display,
            summary_display,
            marker,
            source_system.as_deref().unwrap_or("?"),
            source_file.as_deref().unwrap_or("?")
        );
        count += 1;
    }

    println!("\n{} results shown (limit: {})", count, opts.limit);
    Ok(())
}

pub fn run_stats(opts: StatsOpts) -> Result<()> {
    let db_path = get_db_path(&opts.db);
    let mut conn = Connection::open(&db_path).context("opening DB")?;
    ensure_migrations(&mut conn)?;

    println!("=== Calendar Stats ===\n");

    let total_raw: i64 =
        conn.query_row("SELECT COUNT(*) FROM calendar_events_raw", [], |r| r.get(0))?;
    println!("Raw events: {}", total_raw);

    let total_occ: i64 =
        conn.query_row("SELECT COUNT(*) FROM calendar_event_occurrences", [], |r| {
            r.get(0)
        })?;
    println!("Occurrences: {}", total_occ);

    let batches: i64 =
        conn.query_row("SELECT COUNT(*) FROM cal_import_batches", [], |r| r.get(0))?;
    println!("Import batches: {}", batches);

    println!("\n--- By Source System ---");
    let mut stmt = conn.prepare("SELECT source_system, COUNT(*) FROM calendar_events_raw GROUP BY source_system ORDER BY COUNT(*) DESC")?;
    for (k, v) in stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?
        .flatten()
    {
        println!("  {}: {}", k, v);
    }

    println!("\n--- By Calendar Name ---");
    let mut stmt = conn.prepare("SELECT calendar_name, COUNT(*) FROM calendar_events_raw WHERE calendar_name IS NOT NULL GROUP BY calendar_name ORDER BY COUNT(*) DESC")?;
    for (k, v) in stmt
        .query_map([], |r| {
            Ok((r.get::<_, Option<String>>(0)?, r.get::<_, i64>(1)?))
        })?
        .flatten()
    {
        println!("  {}: {}", k.unwrap_or_else(|| "(none)".to_string()), v);
    }

    println!("\n--- By Source File ---");
    let mut stmt = conn.prepare("SELECT source_file, COUNT(*) FROM calendar_events_raw GROUP BY source_file ORDER BY COUNT(*) DESC")?;
    for (k, v) in stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?
        .flatten()
    {
        println!("  {}: {}", k, v);
    }

    let recurring: i64 = conn.query_row(
        "SELECT COUNT(*) FROM calendar_events_raw WHERE rrule_raw IS NOT NULL",
        [],
        |r| r.get(0),
    )?;
    println!("\nRecurring events (RRULE): {}", recurring);

    let overrides: i64 = conn.query_row(
        "SELECT COUNT(*) FROM calendar_events_raw WHERE recurrence_id_raw IS NOT NULL",
        [],
        |r| r.get(0),
    )?;
    println!("Override events: {}", overrides);

    let cancelled: i64 = conn.query_row(
        "SELECT COUNT(*) FROM calendar_event_occurrences WHERE is_cancelled = 1",
        [],
        |r| r.get(0),
    )?;
    println!("Cancelled occurrences: {}", cancelled);

    Ok(())
}

pub fn run_doctor(opts: DoctorOpts) -> Result<()> {
    let db_path = get_db_path(&opts.db);
    let mut conn = Connection::open(&db_path).context("opening DB")?;
    ensure_migrations(&mut conn)?;

    println!("=== Calendar Doctor ===\n");

    let mut issues = Vec::new();
    let mut warnings = Vec::new();

    let schema_ver: i64 = conn
        .query_row(
            "SELECT version FROM cal_schema_version ORDER BY version DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    println!("Schema version: {}", schema_ver);
    if schema_ver < 1 {
        issues.push(format!(
            "Schema version {} is below expected v1",
            schema_ver
        ));
    }

    let total_raw: i64 = conn
        .query_row("SELECT COUNT(*) FROM calendar_events_raw", [], |r| r.get(0))
        .unwrap_or(0);
    if total_raw == 0 {
        issues.push("No raw events found - have you imported anything?".to_string());
    } else {
        println!("Raw events: {}", total_raw);
    }

    let total_occ: i64 = conn
        .query_row("SELECT COUNT(*) FROM calendar_event_occurrences", [], |r| {
            r.get(0)
        })
        .unwrap_or(0);
    println!("Occurrences: {}", total_occ);

    let missing_uid: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM calendar_events_raw WHERE uid LIKE 'MISSING-UID-%'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if missing_uid > 0 {
        warnings.push(format!(
            "{} events have missing/generated UIDs",
            missing_uid
        ));
    }

    let no_dtstart: i64 = conn.query_row("SELECT COUNT(*) FROM calendar_events_raw WHERE dtstart_utc IS NULL AND dtstart_raw IS NULL", [], |r| r.get(0)).unwrap_or(0);
    if no_dtstart > 0 {
        warnings.push(format!("{} events have no dtstart", no_dtstart));
    }

    let parse_errors: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM calendar_events_raw WHERE parse_error IS NOT NULL",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if parse_errors > 0 {
        issues.push(format!("{} events have parse errors", parse_errors));
    }

    let orphaned_occ: i64 = conn.query_row("SELECT COUNT(*) FROM calendar_event_occurrences o WHERE NOT EXISTS (SELECT 1 FROM calendar_events_raw r WHERE r.id = o.raw_event_id)", [], |r| r.get(0)).unwrap_or(0);
    if orphaned_occ > 0 {
        issues.push(format!("{} orphaned occurrences", orphaned_occ));
    }

    let duplicate_keys: i64 = conn.query_row("SELECT COUNT(*) FROM (SELECT uid, occurrence_key, COUNT(*) as cnt FROM calendar_event_occurrences GROUP BY uid, occurrence_key HAVING cnt > 1)", [], |r| r.get(0)).unwrap_or(0);
    if duplicate_keys > 0 {
        warnings.push(format!("{} duplicate occurrence keys", duplicate_keys));
    }

    let all_day_occ: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM calendar_event_occurrences WHERE is_all_day = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let timed_occ: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM calendar_event_occurrences WHERE is_all_day = 0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    println!("All-day occurrences: {}", all_day_occ);
    println!("Timed occurrences: {}", timed_occ);

    println!("\n--- Source Systems ---");
    let mut stmt = conn.prepare(
        "SELECT source_system, COUNT(*) FROM calendar_events_raw GROUP BY source_system",
    )?;
    for (k, v) in stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?
        .flatten()
    {
        println!("  {}: {}", k, v);
    }

    if !issues.is_empty() {
        println!("\n!!! ISSUES !!!");
        for issue in &issues {
            println!("  - {}", issue);
        }
    }
    if !warnings.is_empty() {
        println!("\n--- Warnings ---");
        for warn in &warnings {
            println!("  - {}", warn);
        }
    }
    if issues.is_empty() && warnings.is_empty() {
        println!("\nNo issues found. DB looks healthy.");
    }

    Ok(())
}

pub fn run_inspect(opts: InspectOpts) -> Result<()> {
    let db_path = get_db_path(&opts.db);
    let mut conn = Connection::open(&db_path).context("opening DB")?;
    ensure_migrations(&mut conn)?;

    let is_numeric = opts.identifier.chars().all(|c| c.is_ascii_digit());

    let result = if is_numeric {
        let id: i64 = opts.identifier.parse().unwrap_or(0);
        conn.query_row(
            "SELECT id, import_batch_id, source_system, source_file, uid,
                calendar_name, summary, description, location,
                dtstart_raw, dtstart_tzid, dtstart_utc, dtstart_kind,
                dtend_raw, dtend_tzid, dtend_utc, dtend_kind,
                all_day, status, transp,
                rrule_raw, exdate_raw, sequence, recurrence_id_raw,
                organizer, url, raw, ingested_at
             FROM calendar_events_raw WHERE id = ?1",
            [id],
            |r| {
                let mut vals: Vec<String> = Vec::new();
                for i in 0..28 {
                    let s: Option<String> = r.get::<_, Option<String>>(i).ok().flatten();
                    vals.push(format!("{:?}", s));
                }
                Ok(vals)
            },
        )
    } else {
        conn.query_row(
            "SELECT id, import_batch_id, source_system, source_file, uid,
                calendar_name, summary, description, location,
                dtstart_raw, dtstart_tzid, dtstart_utc, dtstart_kind,
                dtend_raw, dtend_tzid, dtend_utc, dtend_kind,
                all_day, status, transp,
                rrule_raw, exdate_raw, sequence, recurrence_id_raw,
                organizer, url, raw, ingested_at
             FROM calendar_events_raw WHERE uid = ?1 ORDER BY dtstamp_utc DESC LIMIT 1",
            [&opts.identifier],
            |r| {
                let mut vals: Vec<String> = Vec::new();
                for i in 0..28 {
                    let s: Option<String> = r.get::<_, Option<String>>(i).ok().flatten();
                    vals.push(format!("{:?}", s));
                }
                Ok(vals)
            },
        )
    };

    match result {
        Ok(vals) => {
            let labels = [
                "id",
                "import_batch_id",
                "source_system",
                "source_file",
                "uid",
                "calendar_name",
                "summary",
                "description",
                "location",
                "dtstart_raw",
                "dtstart_tzid",
                "dtstart_utc",
                "dtstart_kind",
                "dtend_raw",
                "dtend_tzid",
                "dtend_utc",
                "dtend_kind",
                "all_day",
                "status",
                "transp",
                "rrule_raw",
                "exdate_raw",
                "sequence",
                "recurrence_id_raw",
                "organizer",
                "url",
                "raw",
                "ingested_at",
            ];

            for (label, val) in labels.iter().zip(vals.iter()) {
                println!("{:20}  {}", label, val);
            }
        }
        Err(_) => {
            eprintln!("Event not found: {}", opts.identifier);
            std::process::exit(1);
        }
    }

    Ok(())
}

pub fn run_expand(opts: ExpandOpts) -> Result<()> {
    let db_path = get_db_path(&opts.db);
    let mut conn = Connection::open(&db_path).context("opening DB")?;
    ensure_migrations(&mut conn)?;

    let from = NaiveDate::parse_from_str(&opts.from, "%Y-%m-%d")
        .context("parsing --from date (use YYYY-MM-DD)")?;
    let to = NaiveDate::parse_from_str(&opts.to, "%Y-%m-%d")
        .context("parsing --to date (use YYYY-MM-DD)")?;

    let version = chrono::Utc::now().format("%Y%m%d%H%M%S").to_string();

    if opts.rebuild {
        println!("Rebuilding occurrences for window {} to {}...", from, to);
        conn.execute(
            "DELETE FROM calendar_event_occurrences WHERE expansion_window_start <= ?1 AND expansion_window_end >= ?2",
            params![from.format("%Y-%m-%d").to_string(), to.format("%Y-%m-%d").to_string()],
        ).context("clearing old occurrences")?;
        println!("Cleared old occurrences in window.");
    } else {
        println!("Expanding occurrences for window {} to {}...", from, to);
    }

    let events: Vec<RawEvent> = {
        let mut stmt = conn.prepare(
            "SELECT id, import_batch_id, source_system, source_file, source_path, source_hash,
                uid, recurrence_id_raw, recurrence_id_utc, sequence,
                dtstamp_utc, created_utc, last_modified_utc,
                calendar_name, prodid, method, event_type, classification, status, transp,
                summary, description, location,
                dtstart_raw, dtstart_tzid, dtstart_utc, dtstart_kind,
                dtend_raw, dtend_tzid, dtend_utc, dtend_kind,
                duration_raw, all_day, rrule_raw, exdate_raw, rdate_raw, exrule_raw, tzid,
                organizer, attendees_json, categories_json, url,
                raw, parse_warnings_json, parse_error, ingested_at
             FROM calendar_events_raw",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(RawEvent {
                import_batch_id: row.get("import_batch_id")?,
                source_system: row.get("source_system")?,
                source_file: row.get("source_file")?,
                source_path: row.get("source_path")?,
                source_hash: row.get("source_hash")?,
                uid: row.get("uid")?,
                recurrence_id_raw: row.get("recurrence_id_raw")?,
                recurrence_id_utc: row.get("recurrence_id_utc")?,
                sequence: row.get("sequence")?,
                dtstamp_utc: row.get("dtstamp_utc")?,
                created_utc: row.get("created_utc")?,
                last_modified_utc: row.get("last_modified_utc")?,
                calendar_name: row.get("calendar_name")?,
                prodid: row.get("prodid")?,
                method: row.get("method")?,
                event_type: row.get("event_type")?,
                classification: row.get("classification")?,
                status: row.get("status")?,
                transp: row.get("transp")?,
                summary: row.get("summary")?,
                description: row.get("description")?,
                location: row.get("location")?,
                dtstart_raw: row.get("dtstart_raw")?,
                dtstart_tzid: row.get("dtstart_tzid")?,
                dtstart_utc: row.get("dtstart_utc")?,
                dtstart_kind: row.get("dtstart_kind")?,
                dtend_raw: row.get("dtend_raw")?,
                dtend_tzid: row.get("dtend_tzid")?,
                dtend_utc: row.get("dtend_utc")?,
                dtend_kind: row.get("dtend_kind")?,
                duration_raw: row.get("duration_raw")?,
                all_day: row.get::<_, i32>("all_day")? != 0,
                rrule_raw: row.get("rrule_raw")?,
                exdate_raw: row.get("exdate_raw")?,
                rdate_raw: row.get("rdate_raw")?,
                exrule_raw: row.get("exrule_raw")?,
                tzid: row.get("tzid")?,
                organizer: row.get("organizer")?,
                attendees_json: row.get("attendees_json")?,
                categories_json: row.get("categories_json")?,
                url: row.get("url")?,
                raw: row.get("raw")?,
                parse_warnings_json: row.get("parse_warnings_json")?,
                parse_error: row.get("parse_error")?,
                ingested_at: row.get("ingested_at")?,
            })
        })?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let mut occ_count = 0;
    for raw_event in &events {
        let raw_id = {
            let mut s = conn.prepare(
                "SELECT id FROM calendar_events_raw WHERE uid = ?1 AND source_file = ?2 LIMIT 1",
            )?;
            s.query_row(params![raw_event.uid, raw_event.source_file], |r| r.get(0))
                .unwrap_or(0)
        };
        if raw_id == 0 {
            continue;
        }
        let occs = expand_single_event(raw_event, raw_id, &from, &to, &version);
        insert_occurrences(&conn, &occs)?;
        occ_count += occs.len();
    }

    println!("Expanded {} occurrences", occ_count);
    Ok(())
}
