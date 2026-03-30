use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Parser)]
#[command(name = "voidline")]
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
    Finance {
        #[command(subcommand)]
        cmd: FinanceCmd,
    },
    Server(ServerCmd),
    Import {
        #[command(subcommand)]
        cmd: ImportCmd,
    },
}

#[derive(Subcommand)]
enum FrontmatterCmd {
    Walk(WalkOpts),
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
}

#[derive(Parser)]
struct SlugOpts {
    #[arg(short, long, default_value = ".")]
    root: PathBuf,
    #[arg(long)]
    resolve: bool,
    #[arg(long)]
    detect: bool,
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

#[derive(Subcommand)]
enum FinanceCmd {
    Report(ReportOpts),
    Dashboard,
    BudgetInit,
    BudgetShow,
    BudgetCalendar,
}

#[derive(Parser)]
struct ReportOpts {
    #[arg(short, long)]
    start: Option<String>,
    #[arg(short, long)]
    end: Option<String>,
}

#[derive(Parser)]
struct ServerCmd {
    #[arg(long, default_value = "8080")]
    port: u16,
}

#[derive(Subcommand)]
enum ImportCmd {
    Amazon,
    Apple,
    Health,
    Music,
    Social,
    TypingMind,
    OpenAI,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Frontmatter {
    #[serde(flatten)]
    pub fields: HashMap<String, serde_json::Value>,
}

#[derive(Debug)]
#[allow(dead_code)]
struct ParsedFile {
    frontmatter: Option<HashMap<String, serde_json::Value>>,
    body: String,
    has_fm: bool,
}

fn parse_frontmatter(content: &str) -> Result<ParsedFile> {
    let trimmed = content.trim_start_matches('\u{feff}');

    if !trimmed.starts_with("---") {
        return Ok(ParsedFile {
            frontmatter: None,
            body: content.to_string(),
            has_fm: false,
        });
    }

    let after = trimmed
        .strip_prefix("---")
        .unwrap()
        .trim_start_matches('\n');

    if let Some((fm_raw, body)) = after.split_once("---") {
        let fm: HashMap<String, serde_json::Value> =
            serde_yaml::from_str(fm_raw).context("Failed to parse YAML frontmatter")?;

        return Ok(ParsedFile {
            frontmatter: Some(fm),
            body: body.trim_start_matches('\n').to_string(),
            has_fm: true,
        });
    }

    Ok(ParsedFile {
        frontmatter: None,
        body: content.to_string(),
        has_fm: false,
    })
}

fn get_files_with_extensions(
    root: &Path,
    extensions: &[String],
    include_hidden: bool,
) -> Vec<PathBuf> {
    let mut files = Vec::new();

    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        if !include_hidden {
            if let Some(name) = path.file_name() {
                if name.to_string_lossy().starts_with('.') {
                    continue;
                }
            }
        }

        if path.is_file() {
            if let Some(ext) = path.extension() {
                let ext_str = format!(".{}", ext.to_string_lossy());
                if extensions
                    .iter()
                    .any(|e| e.to_lowercase() == ext_str.to_lowercase())
                {
                    files.push(path.to_path_buf());
                }
            }
        }
    }

    files
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

fn run_validate(opts: ValidateOpts) -> Result<()> {
    let extensions = vec![".md".to_string(), ".markdown".to_string()];
    let files = get_files_with_extensions(&opts.root, &extensions, false);

    let mut valid_count = 0;
    let mut invalid_count = 0;

    for path in files {
        if let Ok(content) = fs::read_to_string(&path) {
            match parse_frontmatter(&content) {
                Ok(parsed) => {
                    if parsed.has_fm {
                        valid_count += 1;
                    } else {
                        invalid_count += 1;
                        eprintln!("No frontmatter: {}", path.display());
                    }
                }
                Err(e) => {
                    invalid_count += 1;
                    eprintln!("Error parsing {}: {}", path.display(), e);
                }
            }
        }
    }

    println!("Valid: {}, Invalid: {}", valid_count, invalid_count);

    if invalid_count > 0 {
        std::process::exit(1);
    }

    Ok(())
}

fn run_migrate(opts: MigrateOpts) -> Result<()> {
    let extensions = vec![".md".to_string(), ".markdown".to_string()];
    let files = get_files_with_extensions(&opts.root, &extensions, false);

    for path in files {
        if let Ok(content) = fs::read_to_string(&path) {
            let parsed = parse_frontmatter(&content)?;

            if !parsed.has_fm {
                continue;
            }

            let mut fm = parsed.frontmatter.unwrap_or_default();

            fm.insert(
                "migrated_at".to_string(),
                serde_json::Value::String(chrono::Utc::now().to_rfc3339()),
            );

            let new_content = format!(
                "---\n{}---\n\n{}",
                serde_yaml::to_string(&fm)?.trim(),
                parsed.body
            );

            if opts.dry_run {
                println!("Would migrate: {}", path.display());
            } else {
                fs::write(&path, new_content)?;
                println!("Migrated: {}", path.display());
            }
        }
    }

    Ok(())
}

fn run_slug(_opts: SlugOpts) -> Result<()> {
    println!("Slug command - resolves/detects slugs in frontmatter");
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

            let new_content = format!(
                "---\n{}---\n\n{}",
                serde_yaml::to_string(&fm)?.trim(),
                parsed.body
            );

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

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Frontmatter { cmd } => match cmd {
            FrontmatterCmd::Walk(opts) => run_walk(opts)?,
            FrontmatterCmd::Validate(opts) => run_validate(opts)?,
            FrontmatterCmd::Migrate(opts) => run_migrate(opts)?,
            FrontmatterCmd::Slug(opts) => run_slug(opts)?,
            FrontmatterCmd::Update(opts) => run_update(opts)?,
        },
        Commands::Finance { cmd } => match cmd {
            FinanceCmd::Report(_opts) => {
                println!("Finance report");
            }
            FinanceCmd::Dashboard => {
                println!("Finance dashboard TUI");
            }
            FinanceCmd::BudgetInit => println!("Budget init"),
            FinanceCmd::BudgetShow => println!("Budget show"),
            FinanceCmd::BudgetCalendar => println!("Budget calendar"),
        },
        Commands::Server(cmd) => {
            println!("Server starting on port {}", cmd.port);
        }
        Commands::Import { cmd } => match cmd {
            ImportCmd::Amazon => println!("Import Amazon data"),
            ImportCmd::Apple => println!("Import Apple data"),
            ImportCmd::Health => println!("Import Health data"),
            ImportCmd::Music => println!("Import Music data"),
            ImportCmd::Social => println!("Import Social data"),
            ImportCmd::TypingMind => println!("Import TypingMind data"),
            ImportCmd::OpenAI => println!("Import OpenAI data"),
        },
    }

    Ok(())
}
