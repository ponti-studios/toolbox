use anyhow::{Context, Result};
use serde::Deserialize;
use std::fs::File;
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
pub struct ActivityRow {
    #[serde(rename = "created_at", deserialize_with = "de_required_string")]
    pub created_at: String,
    #[serde(rename = "cost_total", deserialize_with = "de_required_f64")]
    pub cost_total: f64,
    #[serde(rename = "cost_cache", default, deserialize_with = "de_default_f64")]
    pub cost_cache: f64,
    #[serde(rename = "tokens_prompt", deserialize_with = "de_required_i64")]
    pub tokens_prompt: i64,
    #[serde(rename = "tokens_completion", deserialize_with = "de_required_i64")]
    pub tokens_completion: i64,
    #[serde(
        rename = "tokens_reasoning",
        default,
        deserialize_with = "de_default_i64"
    )]
    pub tokens_reasoning: i64,
    #[serde(rename = "tokens_cached", default, deserialize_with = "de_default_i64")]
    pub tokens_cached: i64,
    #[serde(
        rename = "generation_time_ms",
        default,
        deserialize_with = "de_default_i64"
    )]
    pub generation_time_ms: i64,
    #[serde(
        rename = "time_to_first_token_ms",
        default,
        deserialize_with = "de_default_i64"
    )]
    pub time_to_first_token_ms: i64,
    #[serde(
        rename = "provider_name",
        default,
        deserialize_with = "de_optional_string"
    )]
    pub provider_name: Option<String>,
    #[serde(
        rename = "model_permaslug",
        default,
        deserialize_with = "de_optional_string"
    )]
    pub model_permaslug: Option<String>,
    #[serde(rename = "app_name", default, deserialize_with = "de_optional_string")]
    pub app_name: Option<String>,
    #[serde(
        rename = "api_key_name",
        default,
        deserialize_with = "de_optional_string"
    )]
    pub api_key_name: Option<String>,
    #[serde(rename = "cancelled", default, deserialize_with = "de_default_bool")]
    pub cancelled: bool,
    #[serde(rename = "streamed", default, deserialize_with = "de_default_bool")]
    pub streamed: bool,
    #[serde(
        rename = "finish_reason_normalized",
        default,
        deserialize_with = "de_optional_string"
    )]
    pub finish_reason_normalized: Option<String>,
}

impl ActivityRow {
    pub fn provider_label(&self) -> &str {
        self.provider_name.as_deref().unwrap_or("Unknown")
    }

    pub fn model_label(&self) -> &str {
        self.model_permaslug.as_deref().unwrap_or("Unknown")
    }

    pub fn app_label(&self) -> &str {
        self.app_name
            .as_deref()
            .or(self.api_key_name.as_deref())
            .unwrap_or("unknown")
    }

    pub fn cache_credit(&self) -> f64 {
        if self.cost_cache < 0.0 {
            self.cost_cache.abs()
        } else {
            0.0
        }
    }
}

pub fn load_csv(path: &Path) -> Result<Vec<ActivityRow>> {
    let file =
        File::open(path).with_context(|| format!("Failed to open CSV file: {}", path.display()))?;
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_reader(file);

    let mut rows = Vec::new();
    for (index, result) in reader.deserialize::<ActivityRow>().enumerate() {
        let row_number = index + 2;
        let row = result.with_context(|| {
            format!(
                "Failed to parse OpenRouter activity CSV row {} from {}",
                row_number,
                path.display()
            )
        })?;
        rows.push(row);
    }
    Ok(rows)
}

fn parse_required_string(value: Option<String>) -> std::result::Result<String, String> {
    match value.and_then(normalize_string) {
        Some(text) => Ok(text),
        None => Err("missing required text value".to_string()),
    }
}

fn parse_f64_with_default(value: Option<String>, default: f64) -> std::result::Result<f64, String> {
    match value.and_then(normalize_string) {
        Some(text) => text
            .parse::<f64>()
            .map_err(|_| format!("invalid decimal value: {text}")),
        None => Ok(default),
    }
}

fn parse_i64_with_default(value: Option<String>, default: i64) -> std::result::Result<i64, String> {
    match value.and_then(normalize_string) {
        Some(text) => text
            .parse::<i64>()
            .map_err(|_| format!("invalid integer value: {text}")),
        None => Ok(default),
    }
}

fn parse_bool_with_default(
    value: Option<String>,
    default: bool,
) -> std::result::Result<bool, String> {
    match value.and_then(normalize_string) {
        Some(text) => match text.to_ascii_lowercase().as_str() {
            "true" | "1" | "yes" => Ok(true),
            "false" | "0" | "no" => Ok(false),
            _ => Err(format!("invalid boolean value: {text}")),
        },
        None => Ok(default),
    }
}

fn normalize_string(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn de_required_string<'de, D>(deserializer: D) -> std::result::Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<String>::deserialize(deserializer)?;
    parse_required_string(value).map_err(serde::de::Error::custom)
}

fn de_optional_string<'de, D>(deserializer: D) -> std::result::Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<String>::deserialize(deserializer)?;
    Ok(value.and_then(normalize_string))
}

fn de_required_f64<'de, D>(deserializer: D) -> std::result::Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<String>::deserialize(deserializer)?;
    parse_f64_with_default(value, f64::NAN)
        .and_then(|parsed| {
            if parsed.is_nan() {
                Err("missing required decimal value".to_string())
            } else {
                Ok(parsed)
            }
        })
        .map_err(serde::de::Error::custom)
}

fn de_default_f64<'de, D>(deserializer: D) -> std::result::Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<String>::deserialize(deserializer)?;
    parse_f64_with_default(value, 0.0).map_err(serde::de::Error::custom)
}

fn de_required_i64<'de, D>(deserializer: D) -> std::result::Result<i64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<String>::deserialize(deserializer)?;
    match value.and_then(normalize_string) {
        Some(text) => text.parse::<i64>().map_err(serde::de::Error::custom),
        None => Err(serde::de::Error::custom("missing required integer value")),
    }
}

fn de_default_i64<'de, D>(deserializer: D) -> std::result::Result<i64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<String>::deserialize(deserializer)?;
    parse_i64_with_default(value, 0).map_err(serde::de::Error::custom)
}

fn de_default_bool<'de, D>(deserializer: D) -> std::result::Result<bool, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<String>::deserialize(deserializer)?;
    parse_bool_with_default(value, false).map_err(serde::de::Error::custom)
}
