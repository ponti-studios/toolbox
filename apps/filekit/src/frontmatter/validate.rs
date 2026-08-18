use anyhow::Result;
use clap::Parser;
use std::path::PathBuf;

use super::{
    collect_markdown_files, default_schema, parse_frontmatter, validate_frontmatter,
    FileValidationResult, ValidationReport, ValidationSummary,
};

#[derive(Parser)]
pub struct ValidateOpts {
    #[arg(short, long, default_value = ".")]
    pub root: PathBuf,
    #[arg(short, long)]
    pub schema: Option<String>,
    #[arg(short, long)]
    pub config: Option<String>,
    #[arg(short, long, default_value = "text")]
    pub output: String,
}

pub fn run(opts: ValidateOpts) -> Result<()> {
    let schema = default_schema(opts.schema.as_deref())?;
    let files = collect_markdown_files(&opts.root);
    let mut results = Vec::new();

    for path in files {
        let content = std::fs::read_to_string(&path)
            .map_err(|e| anyhow::anyhow!("failed to read {}: {}", path.display(), e))?;
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
