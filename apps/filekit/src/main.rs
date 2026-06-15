use anyhow::{Context, Result};
use clap::{CommandFactory, Parser, Subcommand};
use clap_complete::{generate, Shell};
use files::get_files_with_extensions;
use files::{build_yaml_frontmatter, parse_yaml_frontmatter, ParsedFrontmatter};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

mod cal;
mod classify;
mod fileops;
mod kernel;

#[derive(Parser)]
#[command(name = "filekit")]
#[command(about = "CLI utilities and tools", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Frontmatter {
        #[command(subcommand)]
        cmd: FrontmatterCmd,
    },
    Cal {
        #[command(subcommand)]
        cmd: cal::CalCmd,
    },
    Classify {
        #[command(subcommand)]
        cmd: classify::ClassifyCmd,
    },
    Analyze(kernel::AnalyzeOpts),
    Files {
        #[command(subcommand)]
        cmd: fileops::FileOpsCmd,
    },
    Completions {
        #[command(subcommand)]
        cmd: CompletionCmd,
    },
}

#[derive(Subcommand)]
enum CompletionCmd {
    /// Generate completions to stdout.
    Generate(CompletionOpts),
    /// Install completions to the standard location for a shell.
    Install(CompletionInstallOpts),
}

#[derive(Parser, Debug)]
struct CompletionOpts {
    /// Shell to generate completions for.
    #[arg(value_enum)]
    shell: Shell,
}

#[derive(Parser, Debug)]
struct CompletionInstallOpts {
    /// Shell to install completions for.
    #[arg(value_enum)]
    shell: Shell,

    /// Write the completion file even if it already exists.
    #[arg(long)]
    force: bool,

    /// Do not write files; print the destination path instead.
    #[arg(long)]
    dry_run: bool,
}

#[derive(Subcommand)]
enum FrontmatterCmd {
    Walk(WalkOpts),
    Aggregate(AggregateOpts),
    Validate(ValidateOpts),
    Migrate(MigrateOpts),
    Slug(SlugOpts),
    Update(UpdateOpts),
}

#[derive(Parser)]
struct WalkOpts {
    #[arg(short, long, default_value = ".")]
    root: PathBuf,
    #[arg(short, long, default_value = "text")]
    output: String,
    #[arg(long)]
    include_hidden: bool,
    #[arg(long, default_value = ".md,.markdown")]
    extensions: String,
    #[arg(long)]
    include_globs: Option<String>,
    #[arg(long)]
    exclude_globs: Option<String>,
    #[arg(long, default_value = "0")]
    max_files: usize,
}

#[derive(Parser)]
struct AggregateOpts {
    #[arg(default_value = ".")]
    target: PathBuf,
    #[arg(short, long, default_value = "frontmatter.json")]
    output: PathBuf,
}

#[derive(Parser)]
struct ValidateOpts {
    #[arg(short, long, default_value = ".")]
    root: PathBuf,
    #[arg(short, long)]
    schema: Option<String>,
    #[arg(short, long)]
    config: Option<String>,
    #[arg(short, long, default_value = "text")]
    output: String,
}

#[derive(Parser)]
struct MigrateOpts {
    #[arg(short, long, default_value = ".")]
    root: PathBuf,
    #[arg(short, long)]
    schema: Option<String>,
    #[arg(short, long)]
    config: Option<String>,
    #[arg(long, default_value = "fill")]
    strategy: String,
    #[arg(long)]
    dry_run: bool,
    #[arg(long)]
    write: bool,
    #[arg(long)]
    backup: bool,
    #[arg(short, long, default_value = "text")]
    output: String,
}

#[derive(Parser)]
struct SlugOpts {
    #[arg(short, long, default_value = ".")]
    root: PathBuf,
    #[arg(long)]
    resolve: bool,
    #[arg(long)]
    detect: bool,
    #[arg(long, default_value = "directory")]
    scope: String,
    #[arg(long)]
    slug: Option<String>,
    #[arg(long, default_value = "increment")]
    policy: String,
    #[arg(long, default_value = "10")]
    max_attempts: usize,
    #[arg(long)]
    existing_slugs: Vec<String>,
    #[arg(short, long, default_value = "text")]
    output: String,
}

#[derive(Parser)]
struct UpdateOpts {
    #[arg(short, long, default_value = ".")]
    root: PathBuf,
    #[arg(long)]
    field: Option<String>,
    #[arg(long)]
    value: Option<String>,
    #[arg(long)]
    dry_run: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Frontmatter {
    #[serde(flatten)]
    pub fields: HashMap<String, serde_json::Value>,
}

type ParsedFile = ParsedFrontmatter;

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
struct AggregatedProperty {
    name: String,
    values: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
struct SlugCollisionResult {
    slug: String,
    path: String,
    collisions: Vec<String>,
}

#[derive(Debug)]
struct SlugCollisionError {
    slug: String,
    collisions: Vec<String>,
}

impl std::fmt::Display for SlugCollisionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "slug {:?} collides with: {}",
            self.slug,
            self.collisions.join(", ")
        )
    }
}

impl std::error::Error for SlugCollisionError {}

#[derive(Debug, Clone)]
struct SchemaDefinition {
    required: Vec<&'static str>,
    defaults: HashMap<&'static str, &'static str>,
    validators: HashMap<&'static str, ValidatorConfig>,
}

#[derive(Debug, Clone)]
struct ValidatorConfig {
    allowed: Vec<&'static str>,
    pattern: Option<&'static str>,
    min_length: Option<usize>,
    max_length: Option<usize>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
struct ValidationError {
    field: String,
    message: String,
    pointer: String,
}

#[derive(Debug, Serialize)]
struct FileValidationResult {
    path: String,
    valid: bool,
    errors: Vec<ValidationError>,
}

#[derive(Debug, Serialize, Clone)]
struct ValidationSummary {
    processed_files: usize,
    valid_files: usize,
    error_files: usize,
    exit_code: i32,
}

#[derive(Debug, Serialize)]
struct ValidationReport {
    files: Vec<FileValidationResult>,
    summary: ValidationSummary,
}

#[derive(Debug, Serialize)]
struct FieldChange {
    before: String,
    after: String,
    reason: String,
}

#[derive(Debug, Serialize)]
struct FileMigrationResult {
    path: String,
    changed: bool,
    wrote: bool,
    backup_path: Option<String>,
    changes: HashMap<String, FieldChange>,
    validation_errors: Vec<ValidationError>,
}

#[derive(Debug, Serialize, Clone)]
struct MigrationSummary {
    processed_files: usize,
    changed_files: usize,
    error_files: usize,
    exit_code: i32,
}

#[derive(Debug, Serialize)]
struct MigrationReport {
    files: Vec<FileMigrationResult>,
    summary: MigrationSummary,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MigrationStrategy {
    Fill,
    Repair,
    Overwrite,
    Timestamps,
}

fn default_schema(name: Option<&str>) -> Result<SchemaDefinition> {
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

fn validate_field(
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

fn validate_frontmatter(
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

fn parse_migration_strategy(raw: &str) -> Result<MigrationStrategy> {
    match raw.trim().to_lowercase().as_str() {
        "fill" => Ok(MigrationStrategy::Fill),
        "repair" => Ok(MigrationStrategy::Repair),
        "overwrite" => Ok(MigrationStrategy::Overwrite),
        "timestamps" => Ok(MigrationStrategy::Timestamps),
        other => anyhow::bail!("unknown migration strategy: {}", other),
    }
}

fn apply_field_change(
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

fn migrate_frontmatter(
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

fn build_frontmatter_content(
    frontmatter: &HashMap<String, serde_json::Value>,
    body: &str,
) -> Result<String> {
    build_yaml_frontmatter(frontmatter, body)
}

fn parse_frontmatter(content: &str) -> Result<ParsedFile> {
    parse_yaml_frontmatter(content)
}

fn collect_markdown_files(target: &Path) -> Vec<PathBuf> {
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

fn frontmatter_values(parsed: &ParsedFile) -> HashMap<String, Vec<String>> {
    let mut props = HashMap::new();

    if let Some(frontmatter) = &parsed.frontmatter {
        for (key, value) in frontmatter {
            let values = match value {
                serde_json::Value::Null => Vec::new(),
                serde_json::Value::Bool(v) => vec![v.to_string()],
                serde_json::Value::Number(v) => vec![v.to_string()],
                serde_json::Value::String(v) => vec![v.clone()],
                serde_json::Value::Array(items) => items
                    .iter()
                    .filter_map(|item| match item {
                        serde_json::Value::Null => None,
                        serde_json::Value::Bool(v) => Some(v.to_string()),
                        serde_json::Value::Number(v) => Some(v.to_string()),
                        serde_json::Value::String(v) => Some(v.clone()),
                        other => Some(other.to_string()),
                    })
                    .collect(),
                other => vec![other.to_string()],
            };

            props.insert(key.clone(), values);
        }
    }

    props
}

fn aggregate_frontmatter(target: &Path) -> Result<Vec<AggregatedProperty>> {
    let mut all_props: HashMap<String, Vec<String>> = HashMap::new();

    for path in collect_markdown_files(target) {
        let content = fs::read_to_string(&path)
            .with_context(|| format!("failed to read {}", path.display()))?;
        let parsed = parse_frontmatter(&content)?;

        if !parsed.has_fm {
            continue;
        }

        for (key, values) in frontmatter_values(&parsed) {
            all_props.entry(key).or_default().extend(values);
        }
    }

    let mut result: Vec<_> = all_props
        .into_iter()
        .map(|(name, mut values)| {
            values.sort();
            values.dedup();
            AggregatedProperty { name, values }
        })
        .collect();

    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

fn detect_slug_collisions(root: &Path, scope: &str) -> Result<Vec<SlugCollisionResult>> {
    #[derive(Clone)]
    struct SlugEntry {
        slug: String,
        path: String,
        dir: String,
    }

    let mut entries = Vec::new();

    for path in collect_markdown_files(root) {
        let content = fs::read_to_string(&path)
            .with_context(|| format!("failed to read {}", path.display()))?;
        let parsed = parse_frontmatter(&content)?;
        if !parsed.has_fm {
            continue;
        }

        let Some(slug) = parsed
            .frontmatter
            .as_ref()
            .and_then(|fm| fm.get("slug"))
            .and_then(|value| value.as_str())
            .filter(|slug| !slug.trim().is_empty())
        else {
            continue;
        };

        entries.push(SlugEntry {
            slug: slug.to_string(),
            path: path.to_string_lossy().to_string(),
            dir: path.parent().unwrap_or(root).to_string_lossy().to_string(),
        });
    }

    let root_scope = root.to_string_lossy().to_string();
    let mut buckets: HashMap<(String, String), Vec<String>> = HashMap::new();

    for entry in &entries {
        let scope_key = match scope {
            "directory" => entry.dir.clone(),
            "project" => root_scope.clone(),
            "global" => String::new(),
            _ => entry.dir.clone(),
        };
        buckets
            .entry((entry.slug.clone(), scope_key))
            .or_default()
            .push(entry.path.clone());
    }

    let mut results = Vec::new();
    for ((slug, _), paths) in buckets {
        if paths.len() <= 1 {
            continue;
        }

        for path in &paths {
            let collisions = paths
                .iter()
                .filter(|other| *other != path)
                .cloned()
                .collect();
            results.push(SlugCollisionResult {
                slug: slug.clone(),
                path: path.clone(),
                collisions,
            });
        }
    }

    results.sort_by(|a, b| match a.slug.cmp(&b.slug) {
        std::cmp::Ordering::Equal => a.path.cmp(&b.path),
        other => other,
    });
    Ok(results)
}

fn generate_short_uid() -> String {
    let mut seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos() as u64)
        .unwrap_or(0);
    let alphabet = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut out = String::with_capacity(4);

    for _ in 0..4 {
        let idx = (seed % alphabet.len() as u64) as usize;
        out.push(alphabet[idx] as char);
        seed = seed / alphabet.len() as u64 + 1;
    }

    out
}

fn resolve_slug_collision(
    slug: &str,
    existing_slugs: &HashMap<String, bool>,
    policy: &str,
    max_attempts: usize,
) -> Result<String> {
    if !existing_slugs.get(slug).copied().unwrap_or(false) {
        return Ok(slug.to_string());
    }

    match policy {
        "fail" => Err(SlugCollisionError {
            slug: slug.to_string(),
            collisions: vec!["(existing)".to_string()],
        }
        .into()),
        "increment" => {
            for i in 2..=max_attempts + 1 {
                let candidate = format!("{}-{}", slug, i);
                if !existing_slugs.get(&candidate).copied().unwrap_or(false) {
                    return Ok(candidate);
                }
            }
            anyhow::bail!(
                "slug {:?}: exhausted {} increment attempts",
                slug,
                max_attempts
            )
        }
        "append-uid" => Ok(format!("{}-{}", slug, generate_short_uid())),
        _ => anyhow::bail!("unknown slug collision policy: {:?}", policy),
    }
}

fn run_walk(opts: WalkOpts) -> Result<()> {
    let extensions: Vec<String> = opts
        .extensions
        .split(',')
        .map(|s| s.trim().to_string())
        .collect();

    let files = get_files_with_extensions(&opts.root, &extensions, opts.include_hidden);

    match opts.output.as_str() {
        "json" => {
            let results: Vec<serde_json::Value> = files
                .iter()
                .filter_map(|path| {
                    fs::read_to_string(path).ok().and_then(|content| {
                        parse_frontmatter(&content).ok().map(|parsed| {
                            serde_json::json!({
                                "path": path.to_string_lossy(),
                                "has_frontmatter": parsed.has_fm,
                                "fields": parsed.frontmatter,
                            })
                        })
                    })
                })
                .collect();
            println!("{}", serde_json::to_string_pretty(&results)?);
        }
        _ => {
            for path in files {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(parsed) = parse_frontmatter(&content) {
                        println!("{}", path.display());
                        if let Some(ref fm) = parsed.frontmatter {
                            for (key, value) in fm {
                                println!("  {}: {}", key, value);
                            }
                        }
                        println!();
                    }
                }
            }
        }
    }

    Ok(())
}

fn run_aggregate(opts: AggregateOpts) -> Result<()> {
    let aggregated = aggregate_frontmatter(&opts.target)?;

    println!("Processed {} properties with frontmatter", aggregated.len());

    let output = serde_json::to_string_pretty(&aggregated)?;
    println!("\nAggregated frontmatter properties:\n{}", output);

    fs::write(&opts.output, &output)
        .with_context(|| format!("failed to write {}", opts.output.display()))?;
    println!("\nWritten to {}", opts.output.display());

    Ok(())
}

fn run_validate(opts: ValidateOpts) -> Result<()> {
    let schema = default_schema(opts.schema.as_deref())?;
    let files = collect_markdown_files(&opts.root);
    let mut results = Vec::new();

    for path in files {
        let content = fs::read_to_string(&path)
            .with_context(|| format!("failed to read {}", path.display()))?;
        let parsed = parse_frontmatter(&content)?;
        let errors = validate_frontmatter(parsed.frontmatter.as_ref(), &schema)?;
        results.push(FileValidationResult {
            path: path.to_string_lossy().to_string(),
            valid: errors.is_empty(),
            errors,
        });
    }

    results.sort_by(|a, b| a.path.cmp(&b.path));
    let valid_files = results.iter().filter(|result| result.valid).count();
    let error_files = results.len().saturating_sub(valid_files);
    let summary = ValidationSummary {
        processed_files: results.len(),
        valid_files,
        error_files,
        exit_code: if error_files > 0 { 2 } else { 0 },
    };

    if opts.output == "json" {
        println!(
            "{}",
            serde_json::to_string_pretty(&ValidationReport {
                files: results,
                summary: summary.clone(),
            })?
        );
    } else {
        for result in &results {
            if result.valid {
                println!("OK {}", result.path);
            } else {
                println!("INVALID {}", result.path);
                for error in &result.errors {
                    println!("  {}", error.message);
                }
            }
        }
        println!(
            "Processed: {}, Valid: {}, Invalid: {}",
            summary.processed_files, summary.valid_files, summary.error_files
        );
    }

    if summary.error_files > 0 {
        anyhow::bail!("validation errors found");
    }

    Ok(())
}

fn run_migrate(opts: MigrateOpts) -> Result<()> {
    let schema = default_schema(opts.schema.as_deref())?;
    let strategy = parse_migration_strategy(&opts.strategy)?;
    let files = collect_markdown_files(&opts.root);
    let should_write = opts.write && !opts.dry_run;
    let mut results = Vec::new();

    for path in files {
        let content = fs::read_to_string(&path)
            .with_context(|| format!("failed to read {}", path.display()))?;
        let parsed = parse_frontmatter(&content)?;
        let (frontmatter, changes) = migrate_frontmatter(&parsed, &path, &schema, strategy)?;
        let validation_errors = validate_frontmatter(Some(&frontmatter), &schema)?;
        let changed = !changes.is_empty();
        let mut backup_path = None;

        if changed && should_write {
            if opts.backup {
                let backup = path.with_extension(format!(
                    "{}.bak",
                    path.extension()
                        .and_then(|ext| ext.to_str())
                        .unwrap_or("md")
                ));
                fs::write(&backup, &content)
                    .with_context(|| format!("failed to write backup {}", backup.display()))?;
                backup_path = Some(backup.to_string_lossy().to_string());
            }

            let updated = build_frontmatter_content(&frontmatter, &parsed.body)?;
            fs::write(&path, updated)
                .with_context(|| format!("failed to write {}", path.display()))?;
        }

        results.push(FileMigrationResult {
            path: path.to_string_lossy().to_string(),
            changed,
            wrote: changed && should_write,
            backup_path,
            changes,
            validation_errors,
        });
    }

    results.sort_by(|a, b| a.path.cmp(&b.path));
    let changed_files = results.iter().filter(|result| result.changed).count();
    let error_files = results
        .iter()
        .filter(|result| !result.validation_errors.is_empty())
        .count();
    let summary = MigrationSummary {
        processed_files: results.len(),
        changed_files,
        error_files,
        exit_code: if error_files > 0 { 2 } else { 0 },
    };

    if opts.output == "json" {
        println!(
            "{}",
            serde_json::to_string_pretty(&MigrationReport {
                files: results,
                summary: summary.clone(),
            })?
        );
    } else {
        for result in &results {
            if result.changed {
                if result.wrote {
                    println!("Migrated: {}", result.path);
                } else {
                    println!("Would migrate: {}", result.path);
                }
            }
            for (field, change) in &result.changes {
                println!(
                    "  {}: {} -> {} ({})",
                    field, change.before, change.after, change.reason
                );
            }
        }
        println!(
            "Processed: {}, Changed: {}, Error files: {}",
            summary.processed_files, summary.changed_files, summary.error_files
        );
    }

    if summary.error_files > 0 {
        anyhow::bail!("migration completed with validation errors");
    }

    Ok(())
}

fn run_slug(opts: SlugOpts) -> Result<()> {
    if opts.output != "text" && opts.output != "json" {
        anyhow::bail!("output must be one of: text, json");
    }

    if opts.resolve {
        let slug = opts
            .slug
            .as_deref()
            .map(str::trim)
            .filter(|slug| !slug.is_empty())
            .ok_or_else(|| anyhow::anyhow!("--slug is required when using --resolve"))?;

        if opts.max_attempts < 1 {
            anyhow::bail!("--max-attempts must be >= 1");
        }

        let existing: HashMap<String, bool> = opts
            .existing_slugs
            .iter()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .map(|value| (value.to_string(), true))
            .collect();

        let resolved = resolve_slug_collision(slug, &existing, &opts.policy, opts.max_attempts)?;

        if opts.output == "json" {
            println!(
                "{}",
                serde_json::to_string_pretty(&serde_json::json!({
                    "slug": slug,
                    "resolved": resolved,
                }))?
            );
        } else {
            println!("{} -> {}", slug, resolved);
        }

        return Ok(());
    }

    let collisions = detect_slug_collisions(&opts.root, &opts.scope)?;

    if opts.output == "json" {
        println!("{}", serde_json::to_string_pretty(&collisions)?);
    } else if collisions.is_empty() {
        println!("No slug collisions found");
    } else {
        for collision in collisions {
            println!("{}", collision.path);
            println!("  slug: {}", collision.slug);
            println!("  collides with: {}", collision.collisions.join(", "));
            println!();
        }
    }

    Ok(())
}

fn run_update(opts: UpdateOpts) -> Result<()> {
    if opts.field.is_none() || opts.value.is_none() {
        eprintln!("Error: --field and --value are required");
        std::process::exit(1);
    }

    let field = opts.field.unwrap();
    let value = opts.value.unwrap();

    let extensions = vec![".md".to_string(), ".markdown".to_string()];
    let files = get_files_with_extensions(&opts.root, &extensions, false);

    for path in files {
        if let Ok(content) = fs::read_to_string(&path) {
            let parsed = parse_frontmatter(&content)?;

            if !parsed.has_fm {
                continue;
            }

            let mut fm = parsed.frontmatter.unwrap_or_default();
            fm.insert(field.clone(), serde_json::Value::String(value.clone()));

            let new_content = build_frontmatter_content(&fm, &parsed.body)?;

            if opts.dry_run {
                println!("Would update: {}", path.display());
            } else {
                fs::write(&path, new_content)?;
                println!("Updated: {}", path.display());
            }
        }
    }

    Ok(())
}

fn run_completions(opts: CompletionOpts) -> Result<()> {
    let mut cmd = Cli::command();
    generate(opts.shell, &mut cmd, "filekit", &mut std::io::stdout());
    Ok(())
}

fn completion_install_path(shell: Shell) -> Result<PathBuf> {
    let home = dirs::home_dir().context("could not determine home directory")?;

    let path = match shell {
        Shell::Zsh => {
            if let Ok(prefix) = std::env::var("HOMEBREW_PREFIX") {
                PathBuf::from(prefix).join("share/zsh/site-functions/_filekit")
            } else if let Ok(prefix) = std::env::var("HOMEBREW_CELLAR") {
                let prefix = PathBuf::from(prefix)
                    .parent()
                    .map(Path::to_path_buf)
                    .unwrap_or_else(|| home.clone());
                prefix.join("share/zsh/site-functions/_filekit")
            } else {
                home.join(".zsh/completions/_filekit")
            }
        }
        Shell::Bash => home.join(".local/share/bash-completion/completions/filekit"),
        Shell::Fish => home.join(".config/fish/completions/filekit.fish"),
        Shell::PowerShell => home.join("Documents/PowerShell/Completions/_filekit.ps1"),
        Shell::Elvish => home.join(".elvish/lib/filekit.elv"),
        _ => home.join(".local/share/filekit/completions/filekit"),
    };

    Ok(path)
}

fn run_completion_install(opts: CompletionInstallOpts) -> Result<()> {
    let path = completion_install_path(opts.shell)?;
    if opts.dry_run {
        println!("{}", path.display());
        return Ok(());
    }

    if path.exists() && !opts.force {
        anyhow::bail!(
            "completion file already exists: {} (use --force to overwrite)",
            path.display()
        );
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("creating {}", parent.display()))?;
    }

    let mut cmd = Cli::command();
    let mut buf = Vec::new();
    generate(opts.shell, &mut cmd, "filekit", &mut buf);
    std::fs::write(&path, buf).with_context(|| format!("writing {}", path.display()))?;

    println!("installed completions to {}", path.display());
    if matches!(opts.shell, Shell::Zsh) {
        println!("If needed, ensure that directory is on your fpath and run compinit.");
    }

    Ok(())
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Frontmatter { cmd } => match cmd {
            FrontmatterCmd::Walk(opts) => run_walk(opts)?,
            FrontmatterCmd::Aggregate(opts) => run_aggregate(opts)?,
            FrontmatterCmd::Validate(opts) => run_validate(opts)?,
            FrontmatterCmd::Migrate(opts) => run_migrate(opts)?,
            FrontmatterCmd::Slug(opts) => run_slug(opts)?,
            FrontmatterCmd::Update(opts) => run_update(opts)?,
        },
        Commands::Cal { cmd } => match cmd {
            cal::CalCmd::Import(opts) => cal::run_import(opts)?,
            cal::CalCmd::Expand(opts) => cal::run_expand(opts)?,
            cal::CalCmd::Query(opts) => cal::run_query(opts)?,
            cal::CalCmd::Inspect(opts) => cal::run_inspect(opts)?,
            cal::CalCmd::Stats(opts) => cal::run_stats(opts)?,
            cal::CalCmd::Doctor(opts) => cal::run_doctor(opts)?,
        },
        Commands::Classify { cmd } => match cmd {
            classify::ClassifyCmd::Essays(opts) => classify::run_essays(opts)?,
        },
        Commands::Analyze(opts) => kernel::run_analyze(opts)?,
        Commands::Files { cmd } => match cmd {
            fileops::FileOpsCmd::MergeMarkdown(opts) => fileops::run_merge_markdown(opts)?,
            fileops::FileOpsCmd::FindDuplicates(opts) => fileops::run_find_duplicates(opts)?,
            fileops::FileOpsCmd::BulkRename(opts) => fileops::run_bulk_rename(opts)?,
            fileops::FileOpsCmd::Convert(opts) => fileops::run_convert(opts)?,
            fileops::FileOpsCmd::XlsxToCsv(opts) => fileops::run_xlsx_to_csv(opts)?,
        },
        Commands::Completions { cmd } => match cmd {
            CompletionCmd::Generate(opts) => run_completions(opts)?,
            CompletionCmd::Install(opts) => run_completion_install(opts)?,
        },
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aggregate_frontmatter_collects_and_deduplicates_values() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::write(
            dir.path().join("a.md"),
            "---\ntags: [ai, rust]\nstatus: draft\ncount: 3\n---\n\nhello\n",
        )
        .expect("write markdown");
        fs::write(
            dir.path().join("b.md"),
            "---\ntags:\n  - rust\n  - cli\nstatus: published\n---\n\nworld\n",
        )
        .expect("write markdown");
        fs::write(dir.path().join("c.txt"), "ignored").expect("write text");

        let aggregated = aggregate_frontmatter(dir.path()).expect("aggregate frontmatter");

        assert_eq!(
            aggregated,
            vec![
                AggregatedProperty {
                    name: "count".to_string(),
                    values: vec!["3".to_string()],
                },
                AggregatedProperty {
                    name: "status".to_string(),
                    values: vec!["draft".to_string(), "published".to_string()],
                },
                AggregatedProperty {
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
        fs::write(
            &path,
            "---\ncategory: tools\ntags: [filekit]\n---\n\nbody\n",
        )
        .expect("write markdown");

        let aggregated = aggregate_frontmatter(&path).expect("aggregate frontmatter");

        assert_eq!(
            aggregated,
            vec![
                AggregatedProperty {
                    name: "category".to_string(),
                    values: vec!["tools".to_string()],
                },
                AggregatedProperty {
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
        fs::create_dir_all(&a).expect("create dir a");
        fs::create_dir_all(&b).expect("create dir b");

        let content = "---\nslug: same\n---\n\nbody\n";
        fs::write(a.join("one.md"), content).expect("write one");
        fs::write(b.join("two.md"), content).expect("write two");

        let collisions = detect_slug_collisions(dir.path(), "project").expect("detect collisions");

        assert_eq!(collisions.len(), 2);
        assert!(collisions.iter().all(|collision| collision.slug == "same"));
    }

    #[test]
    fn detect_slug_collisions_directory_scope_ignores_cross_directory_duplicates() {
        let dir = tempfile::tempdir().expect("tempdir");
        let a = dir.path().join("a");
        let b = dir.path().join("b");
        fs::create_dir_all(&a).expect("create dir a");
        fs::create_dir_all(&b).expect("create dir b");

        let content = "---\nslug: same\n---\n\nbody\n";
        fs::write(a.join("one.md"), content).expect("write one");
        fs::write(b.join("two.md"), content).expect("write two");

        let collisions =
            detect_slug_collisions(dir.path(), "directory").expect("detect collisions");

        assert!(collisions.is_empty());
    }

    #[test]
    fn resolve_slug_increment_policy_matches_legacy_behavior() {
        let existing = HashMap::from([("note".to_string(), true), ("note-2".to_string(), true)]);

        let resolved =
            resolve_slug_collision("note", &existing, "increment", 10).expect("resolve slug");

        assert_eq!(resolved, "note-3");
    }

    #[test]
    fn resolve_slug_fail_policy_returns_error() {
        let existing = HashMap::from([("note".to_string(), true)]);

        let error =
            resolve_slug_collision("note", &existing, "fail", 10).expect_err("expected error");

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
