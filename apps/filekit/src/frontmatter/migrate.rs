use anyhow::Result;
use clap::Parser;
use std::path::PathBuf;

use super::{
    build_frontmatter_content, collect_markdown_files_excluding, default_schema,
    migrate_frontmatter, parse_frontmatter, parse_migration_strategy, validate_frontmatter,
    FileMigrationResult, MigrationReport, MigrationSummary,
};

#[derive(Parser)]
pub struct MigrateOpts {
    #[arg(short, long, default_value = ".")]
    pub root: PathBuf,
    #[arg(short, long)]
    pub schema: Option<String>,
    #[arg(short, long)]
    pub config: Option<String>,
    #[arg(long, default_value = "fill")]
    pub strategy: String,
    #[arg(long)]
    pub dry_run: bool,
    #[arg(long)]
    pub write: bool,
    #[arg(long)]
    pub backup: bool,
    #[arg(short, long, default_value = "text")]
    pub output: String,
    /// Directory names to exclude. Directories beginning with `_` are always excluded.
    #[arg(long = "exclude-dir")]
    pub exclude_dirs: Vec<String>,
}

pub fn run(opts: MigrateOpts) -> Result<()> {
    let schema = default_schema(opts.schema.as_deref())?;
    let strategy = parse_migration_strategy(&opts.strategy)?;
    let files = collect_markdown_files_excluding(&opts.root, &opts.exclude_dirs);
    let should_write = opts.write && !opts.dry_run;
    let mut results = Vec::new();

    for path in files {
        let content = std::fs::read_to_string(&path)
            .map_err(|e| anyhow::anyhow!("failed to read {}: {}", path.display(), e))?;
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
                std::fs::write(&backup, &content).map_err(|e| {
                    anyhow::anyhow!("failed to write backup {}: {}", backup.display(), e)
                })?;
                backup_path = Some(backup.to_string_lossy().to_string());
            }

            let updated = build_frontmatter_content(&frontmatter, &parsed.body)?;
            std::fs::write(&path, updated)
                .map_err(|e| anyhow::anyhow!("failed to write {}: {}", path.display(), e))?;
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
