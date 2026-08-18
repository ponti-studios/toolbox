use anyhow::Result;
use clap::Subcommand;
use files::{
    build_yaml_frontmatter, get_files_with_extensions, parse_yaml_frontmatter, ParsedFrontmatter,
};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub mod aggregate;
pub mod migrate;
pub mod slug;
pub mod update;
pub mod validate;
pub mod walk;

#[derive(Subcommand)]
pub enum FrontmatterCmd {
    Walk(walk::WalkOpts),
    Aggregate(aggregate::AggregateOpts),
    Validate(validate::ValidateOpts),
    Migrate(migrate::MigrateOpts),
    Slug(slug::SlugOpts),
    Update(update::UpdateOpts),
}

pub fn run(cmd: FrontmatterCmd) -> anyhow::Result<()> {
    use FrontmatterCmd::*;
    match cmd {
        Walk(opts) => walk::run(opts),
        Aggregate(opts) => aggregate::run(opts),
        Validate(opts) => validate::run(opts),
        Migrate(opts) => migrate::run(opts),
        Slug(opts) => slug::run(opts),
        Update(opts) => update::run(opts),
    }
}

pub type ParsedFile = ParsedFrontmatter;

// ── Shared types ──────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct SchemaDefinition {
    pub required: Vec<&'static str>,
    pub defaults: HashMap<&'static str, &'static str>,
    pub validators: HashMap<&'static str, ValidatorConfig>,
}

#[derive(Debug, Clone)]
pub struct ValidatorConfig {
    pub allowed: Vec<&'static str>,
    pub pattern: Option<&'static str>,
    pub min_length: Option<usize>,
    pub max_length: Option<usize>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
    pub pointer: String,
}

#[derive(Debug, Serialize)]
pub struct FileValidationResult {
    pub path: String,
    pub valid: bool,
    pub errors: Vec<ValidationError>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ValidationSummary {
    pub processed_files: usize,
    pub valid_files: usize,
    pub error_files: usize,
    pub exit_code: i32,
}

#[derive(Debug, Serialize)]
pub struct ValidationReport {
    pub files: Vec<FileValidationResult>,
    pub summary: ValidationSummary,
}

#[derive(Debug, Serialize)]
pub struct FieldChange {
    pub before: String,
    pub after: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
pub struct FileMigrationResult {
    pub path: String,
    pub changed: bool,
    pub wrote: bool,
    pub backup_path: Option<String>,
    pub changes: HashMap<String, FieldChange>,
    pub validation_errors: Vec<ValidationError>,
}

#[derive(Debug, Serialize, Clone)]
pub struct MigrationSummary {
    pub processed_files: usize,
    pub changed_files: usize,
    pub error_files: usize,
    pub exit_code: i32,
}

#[derive(Debug, Serialize)]
pub struct MigrationReport {
    pub files: Vec<FileMigrationResult>,
    pub summary: MigrationSummary,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MigrationStrategy {
    Fill,
    Repair,
    Overwrite,
    Timestamps,
}

// ── Shared functions ──────────────────────────────────────────

pub fn default_schema(name: Option<&str>) -> Result<SchemaDefinition> {
    let schema_name = name.unwrap_or("personal");
    match schema_name {
        "personal" => {
            let mut defaults = HashMap::new();
            defaults.insert("type", "reference");
            defaults.insert("status", "draft");

            let mut validators = HashMap::new();
            validators.insert(
                "type",
                ValidatorConfig {
                    allowed: vec![
                        "identity",
                        "lifestyle",
                        "goals",
                        "relationships",
                        "finance",
                        "reference",
                        "tracking",
                    ],
                    pattern: None,
                    min_length: None,
                    max_length: None,
                },
            );
            validators.insert(
                "status",
                ValidatorConfig {
                    allowed: vec!["draft", "published", "private", "archived"],
                    pattern: None,
                    min_length: None,
                    max_length: None,
                },
            );
            validators.insert(
                "slug",
                ValidatorConfig {
                    allowed: vec![],
                    pattern: Some("^[a-z0-9][a-z0-9-]*[a-z0-9]$"),
                    min_length: None,
                    max_length: Some(64),
                },
            );
            validators.insert(
                "uid",
                ValidatorConfig {
                    allowed: vec![],
                    pattern: Some(
                        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
                    ),
                    min_length: None,
                    max_length: None,
                },
            );

            Ok(SchemaDefinition {
                required: vec![
                    "title", "uid", "slug", "created", "updated", "type", "status",
                ],
                defaults,
                validators,
            })
        }
        other => anyhow::bail!("unsupported schema: {}", other),
    }
}

pub fn collect_markdown_files(target: &Path) -> Vec<PathBuf> {
    if target.is_file() {
        return target
            .extension()
            .and_then(|ext| ext.to_str())
            .filter(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
            .map(|_| target.to_path_buf())
            .into_iter()
            .collect();
    }

    get_files_with_extensions(target, &[".md".to_string(), ".markdown".to_string()], false)
}

pub fn parse_frontmatter(content: &str) -> Result<ParsedFile> {
    parse_yaml_frontmatter(content)
}

pub fn build_frontmatter_content(
    frontmatter: &HashMap<String, serde_json::Value>,
    body: &str,
) -> Result<String> {
    build_yaml_frontmatter(frontmatter, body)
}

pub fn validate_field(
    field: &str,
    value: &serde_json::Value,
    rules: &ValidatorConfig,
) -> Vec<ValidationError> {
    let mut errors = Vec::new();
    let Some(value_str) = value.as_str() else {
        errors.push(ValidationError {
            field: field.to_string(),
            message: "must be a string".to_string(),
            pointer: format!("frontmatter.{}", field),
        });
        return errors;
    };

    if !rules.allowed.is_empty() && !rules.allowed.contains(&value_str) {
        errors.push(ValidationError {
            field: field.to_string(),
            message: format!("value {:?} not in allowed set", value_str),
            pointer: format!("frontmatter.{}", field),
        });
    }

    if let Some(pattern) = rules.pattern {
        match regex::Regex::new(pattern) {
            Ok(regex) => {
                if !regex.is_match(value_str) {
                    errors.push(ValidationError {
                        field: field.to_string(),
                        message: format!("value {:?} does not match pattern", value_str),
                        pointer: format!("frontmatter.{}", field),
                    });
                }
            }
            Err(_) => {
                errors.push(ValidationError {
                    field: field.to_string(),
                    message: "invalid validation pattern".to_string(),
                    pointer: format!("frontmatter.{}", field),
                });
            }
        }
    }

    if let Some(min_length) = rules.min_length {
        if value_str.len() < min_length {
            errors.push(ValidationError {
                field: field.to_string(),
                message: format!("length must be >= {}", min_length),
                pointer: format!("frontmatter.{}", field),
            });
        }
    }

    if let Some(max_length) = rules.max_length {
        if value_str.len() > max_length {
            errors.push(ValidationError {
                field: field.to_string(),
                message: format!("length must be <= {}", max_length),
                pointer: format!("frontmatter.{}", field),
            });
        }
    }

    errors
}

pub fn validate_frontmatter(
    frontmatter: Option<&HashMap<String, serde_json::Value>>,
    schema: &SchemaDefinition,
) -> Result<Vec<ValidationError>> {
    let mut errors = Vec::new();

    for field in &schema.required {
        if frontmatter.and_then(|fm| fm.get(*field)).is_none() {
            errors.push(ValidationError {
                field: (*field).to_string(),
                message: "missing required field".to_string(),
                pointer: format!("frontmatter.{}", field),
            });
        }
    }

    if let Some(frontmatter) = frontmatter {
        for (field, rules) in &schema.validators {
            if let Some(value) = frontmatter.get(*field) {
                errors.extend(validate_field(field, value, rules));
            }
        }
    }

    Ok(errors)
}

pub fn parse_migration_strategy(raw: &str) -> Result<MigrationStrategy> {
    match raw.trim().to_lowercase().as_str() {
        "fill" => Ok(MigrationStrategy::Fill),
        "repair" => Ok(MigrationStrategy::Repair),
        "overwrite" => Ok(MigrationStrategy::Overwrite),
        "timestamps" => Ok(MigrationStrategy::Timestamps),
        other => anyhow::bail!("unknown migration strategy: {}", other),
    }
}

pub fn apply_field_change(
    fm: &mut HashMap<String, serde_json::Value>,
    changes: &mut HashMap<String, FieldChange>,
    field: &str,
    new_value: String,
    reason: &str,
) -> bool {
    let before = fm
        .get(field)
        .map(|value| value.to_string())
        .unwrap_or_default();
    if fm.get(field).and_then(|value| value.as_str()) == Some(new_value.as_str()) {
        return false;
    }

    fm.insert(
        field.to_string(),
        serde_json::Value::String(new_value.clone()),
    );
    changes.insert(
        field.to_string(),
        FieldChange {
            before,
            after: new_value,
            reason: reason.to_string(),
        },
    );
    true
}

fn generated_value(
    field: &str,
    fm: &HashMap<String, serde_json::Value>,
    file_path: &Path,
) -> Option<String> {
    match field {
        "uid" => Some(generate_uuid_like(file_path)),
        "slug" => Some(generate_slug(
            file_path,
            fm.get("title").and_then(|value| value.as_str()),
        )),
        "created" | "updated" => Some(generate_timestamp()),
        _ => None,
    }
}

pub fn migrate_frontmatter(
    parsed: &ParsedFile,
    file_path: &Path,
    schema: &SchemaDefinition,
    strategy: MigrationStrategy,
) -> Result<(
    HashMap<String, serde_json::Value>,
    HashMap<String, FieldChange>,
)> {
    let mut fm = parsed.frontmatter.clone().unwrap_or_default();
    let mut changes = HashMap::new();

    match strategy {
        MigrationStrategy::Overwrite => {
            for (field, value) in &schema.defaults {
                apply_field_change(
                    &mut fm,
                    &mut changes,
                    field,
                    (*value).to_string(),
                    "overwrite",
                );
            }
            for field in &schema.required {
                if let Some(value) = generated_value(field, &fm, file_path) {
                    apply_field_change(&mut fm, &mut changes, field, value, "overwrite");
                }
            }
        }
        MigrationStrategy::Timestamps => {
            if !fm.contains_key("created") {
                if let Some(value) = generated_value("created", &fm, file_path) {
                    apply_field_change(&mut fm, &mut changes, "created", value, "timestamps");
                }
            }
            if let Some(value) = generated_value("updated", &fm, file_path) {
                apply_field_change(&mut fm, &mut changes, "updated", value, "timestamps");
            }
        }
        MigrationStrategy::Fill | MigrationStrategy::Repair => {
            for field in &schema.required {
                if !fm.contains_key(*field) {
                    if let Some(value) = generated_value(field, &fm, file_path)
                        .or_else(|| schema.defaults.get(field).map(|value| (*value).to_string()))
                    {
                        apply_field_change(
                            &mut fm,
                            &mut changes,
                            field,
                            value,
                            "missing required field",
                        );
                    }
                }
            }
            for (field, value) in &schema.defaults {
                if !fm.contains_key(*field) {
                    apply_field_change(
                        &mut fm,
                        &mut changes,
                        field,
                        (*value).to_string(),
                        "default",
                    );
                }
            }

            if strategy == MigrationStrategy::Repair {
                for error in validate_frontmatter(Some(&fm), schema)? {
                    if let Some(value) =
                        generated_value(&error.field, &fm, file_path).or_else(|| {
                            schema
                                .defaults
                                .get(error.field.as_str())
                                .map(|value| (*value).to_string())
                        })
                    {
                        apply_field_change(&mut fm, &mut changes, &error.field, value, "repair");
                    }
                }
            }

            if !changes.is_empty() {
                if let Some(value) = generated_value("updated", &fm, file_path) {
                    apply_field_change(&mut fm, &mut changes, "updated", value, "update timestamp");
                }
            }
        }
    }

    Ok((fm, changes))
}

fn generate_uuid_like(file_path: &Path) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    file_path.to_string_lossy().hash(&mut hasher);
    let seed = hasher.finish() as u128;
    let hex = format!(
        "{:032x}",
        seed.wrapping_mul(0x9e3779b97f4a7c15) + 0x123456789abcdef
    );
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}

fn generate_slug(file_path: &Path, title: Option<&str>) -> String {
    let source = title
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.to_string())
        .or_else(|| {
            file_path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .map(|stem| stem.to_string())
        })
        .unwrap_or_else(|| "note".to_string());

    let mut slug = String::new();
    let mut prev_dash = false;
    for ch in source.chars() {
        let lower = ch.to_ascii_lowercase();
        if lower.is_ascii_alphanumeric() {
            slug.push(lower);
            prev_dash = false;
        } else if !prev_dash && !slug.is_empty() {
            slug.push('-');
            prev_dash = true;
        }
    }

    while slug.ends_with('-') {
        slug.pop();
    }

    if slug.is_empty() {
        "note".to_string()
    } else {
        slug.truncate(64);
        slug.trim_matches('-').to_string()
    }
}

fn generate_timestamp() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aggregate_frontmatter_collects_and_deduplicates_values() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(
            dir.path().join("a.md"),
            "---\ntags: [ai, rust]\nstatus: draft\ncount: 3\n---\n\nhello\n",
        )
        .expect("write markdown");
        std::fs::write(
            dir.path().join("b.md"),
            "---\ntags:\n  - rust\n  - cli\nstatus: published\n---\n\nworld\n",
        )
        .expect("write markdown");
        std::fs::write(dir.path().join("c.txt"), "ignored").expect("write text");

        let aggregated = crate::frontmatter::aggregate::aggregate_frontmatter(dir.path())
            .expect("aggregate frontmatter");

        assert_eq!(
            aggregated,
            vec![
                aggregate::AggregatedProperty {
                    name: "count".to_string(),
                    values: vec!["3".to_string()],
                },
                aggregate::AggregatedProperty {
                    name: "status".to_string(),
                    values: vec!["draft".to_string(), "published".to_string()],
                },
                aggregate::AggregatedProperty {
                    name: "tags".to_string(),
                    values: vec!["ai".to_string(), "cli".to_string(), "rust".to_string()],
                },
            ]
        );
    }

    #[test]
    fn aggregate_frontmatter_single_file_target_works() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("note.md");
        std::fs::write(
            &path,
            "---\ncategory: tools\ntags: [filekit]\n---\n\nbody\n",
        )
        .expect("write markdown");

        let aggregated = crate::frontmatter::aggregate::aggregate_frontmatter(&path)
            .expect("aggregate frontmatter");

        assert_eq!(
            aggregated,
            vec![
                aggregate::AggregatedProperty {
                    name: "category".to_string(),
                    values: vec!["tools".to_string()],
                },
                aggregate::AggregatedProperty {
                    name: "tags".to_string(),
                    values: vec!["filekit".to_string()],
                },
            ]
        );
    }

    #[test]
    fn detect_slug_collisions_project_scope_finds_duplicates() {
        let dir = tempfile::tempdir().expect("tempdir");
        let a = dir.path().join("a");
        let b = dir.path().join("b");
        std::fs::create_dir_all(&a).expect("create dir a");
        std::fs::create_dir_all(&b).expect("create dir b");

        let content = "---\nslug: same\n---\n\nbody\n";
        std::fs::write(a.join("one.md"), content).expect("write one");
        std::fs::write(b.join("two.md"), content).expect("write two");

        let collisions = crate::frontmatter::slug::detect_slug_collisions(dir.path(), "project")
            .expect("detect collisions");

        assert_eq!(collisions.len(), 2);
        assert!(collisions.iter().all(|collision| collision.slug == "same"));
    }

    #[test]
    fn detect_slug_collisions_directory_scope_ignores_cross_directory_duplicates() {
        let dir = tempfile::tempdir().expect("tempdir");
        let a = dir.path().join("a");
        let b = dir.path().join("b");
        std::fs::create_dir_all(&a).expect("create dir a");
        std::fs::create_dir_all(&b).expect("create dir b");

        let content = "---\nslug: same\n---\n\nbody\n";
        std::fs::write(a.join("one.md"), content).expect("write one");
        std::fs::write(b.join("two.md"), content).expect("write two");

        let collisions = crate::frontmatter::slug::detect_slug_collisions(dir.path(), "directory")
            .expect("detect collisions");

        assert!(collisions.is_empty());
    }

    #[test]
    fn resolve_slug_increment_policy_matches_legacy_behavior() {
        let existing = HashMap::from([("note".to_string(), true), ("note-2".to_string(), true)]);

        let resolved =
            crate::frontmatter::slug::resolve_slug_collision("note", &existing, "increment", 10)
                .expect("resolve slug");

        assert_eq!(resolved, "note-3");
    }

    #[test]
    fn resolve_slug_fail_policy_returns_error() {
        let existing = HashMap::from([("note".to_string(), true)]);

        let error = crate::frontmatter::slug::resolve_slug_collision("note", &existing, "fail", 10)
            .expect_err("expected error");

        assert!(error.to_string().contains("collides with"));
    }

    #[test]
    fn validate_frontmatter_reports_missing_required_fields() {
        let schema = default_schema(Some("personal")).expect("schema");
        let errors = validate_frontmatter(
            Some(&HashMap::from([(
                "title".to_string(),
                serde_json::Value::String("Draft".to_string()),
            )])),
            &schema,
        )
        .expect("validate frontmatter");

        assert!(errors.iter().any(|error| error.field == "uid"));
        assert!(errors.iter().any(|error| error.field == "slug"));
        assert!(errors.iter().any(|error| error.field == "status"));
    }

    #[test]
    fn migrate_frontmatter_fill_adds_required_fields_without_mutating_input() {
        let schema = default_schema(Some("personal")).expect("schema");
        let path = PathBuf::from("draft-note.md");
        let original = "---\ntitle: Draft Note\n---\n\nbody\n";
        let parsed = parse_frontmatter(original).expect("parse frontmatter");

        let (frontmatter, changes) =
            migrate_frontmatter(&parsed, &path, &schema, MigrationStrategy::Fill)
                .expect("migrate frontmatter");

        assert!(changes.contains_key("uid"));
        assert!(changes.contains_key("slug"));
        assert_eq!(
            frontmatter.get("type").and_then(|value| value.as_str()),
            Some("reference")
        );
        assert_eq!(
            frontmatter.get("status").and_then(|value| value.as_str()),
            Some("draft")
        );
        assert_eq!(
            parsed.frontmatter.as_ref().and_then(|fm| fm.get("uid")),
            None
        );
    }

    #[test]
    fn build_frontmatter_content_round_trips_body() {
        let frontmatter = HashMap::from([
            (
                "title".to_string(),
                serde_json::Value::String("Draft".to_string()),
            ),
            (
                "status".to_string(),
                serde_json::Value::String("draft".to_string()),
            ),
        ]);

        let content = build_frontmatter_content(&frontmatter, "hello\n").expect("build content");

        assert!(content.starts_with("---\n"));
        assert!(content.contains("title: Draft"));
        assert!(content.ends_with("\n\nhello\n"));
    }
}
