use anyhow::{Context, Result};
use clap::Parser;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use super::{collect_markdown_files, default_schema, parse_frontmatter, validate_frontmatter};

const MANIFEST_NAME: &str = ".filekit-publish-manifest";

#[derive(Parser)]
pub struct PublishOpts {
    /// Directory containing canonical essay source files.
    #[arg(short, long, default_value = "essays")]
    pub root: PathBuf,
    /// Generated Jekyll collection directory.
    #[arg(short, long, default_value = "site/_essays")]
    pub output: PathBuf,
    #[arg(short, long, default_value = "text")]
    pub format: String,
}

#[derive(Debug, Serialize)]
struct PublishResult {
    source: String,
    output: String,
    published: bool,
    errors: Vec<String>,
}

#[derive(Debug, Serialize)]
struct PublishReport {
    processed_files: usize,
    published_files: usize,
    skipped_files: usize,
    error_files: usize,
    files: Vec<PublishResult>,
}

pub fn run(opts: PublishOpts) -> Result<()> {
    let schema = default_schema(Some("essay"))?;
    let files = collect_markdown_files(&opts.root);
    let mut results = Vec::new();
    let mut generated = Vec::new();

    prepare_output(&opts.output)?;

    for path in files {
        let content = fs::read_to_string(&path)
            .with_context(|| format!("failed to read {}", path.display()))?;
        let parsed = parse_frontmatter(&content)
            .with_context(|| format!("failed to parse {}", path.display()))?;
        let mut errors = validate_frontmatter(parsed.frontmatter.as_ref(), &schema)?
            .into_iter()
            .map(|error| error.message)
            .collect::<Vec<_>>();

        let eligible = parsed
            .frontmatter
            .as_ref()
            .map(is_publishable)
            .unwrap_or(false);
        let mut output_path = String::new();

        if errors.is_empty() && eligible {
            let slug = parsed
                .frontmatter
                .as_ref()
                .and_then(|frontmatter| frontmatter.get("slug"))
                .and_then(Value::as_str)
                .expect("validated essay schema requires slug");
            let destination = opts.output.join(format!("{}.md", slug));
            fs::write(&destination, content)
                .with_context(|| format!("failed to write {}", destination.display()))?;
            generated.push(destination);
            output_path = generated
                .last()
                .expect("generated output was just appended")
                .to_string_lossy()
                .to_string();
        }

        if errors.is_empty() && !eligible {
            errors.push("skipped: requires visibility: public and status: published".to_string());
        }

        results.push(PublishResult {
            source: path.to_string_lossy().to_string(),
            output: output_path,
            published: errors.is_empty(),
            errors,
        });
    }

    write_manifest(&opts.output, &generated)?;

    let error_files = results
        .iter()
        .filter(|result| {
            !result.published
                && !result
                    .errors
                    .iter()
                    .any(|error| error.starts_with("skipped:"))
        })
        .count();
    let published_files = results.iter().filter(|result| result.published).count();
    let skipped_files = results
        .iter()
        .filter(|result| {
            !result.published
                && result
                    .errors
                    .iter()
                    .any(|error| error.starts_with("skipped:"))
        })
        .count();
    let report = PublishReport {
        processed_files: results.len(),
        published_files,
        skipped_files,
        error_files,
        files: results,
    };

    if opts.format == "json" {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        for result in &report.files {
            if result.published {
                println!("Published: {}", result.source);
            } else if result
                .errors
                .iter()
                .any(|error| error.starts_with("skipped:"))
            {
                println!("Skipped: {}", result.source);
            } else {
                println!("Invalid: {}", result.source);
                for error in &result.errors {
                    println!("  {}", error);
                }
            }
        }
        println!(
            "Processed: {}, Published: {}, Skipped: {}, Errors: {}",
            report.processed_files,
            report.published_files,
            report.skipped_files,
            report.error_files
        );
    }

    if report.error_files > 0 {
        anyhow::bail!("publish validation failed");
    }

    Ok(())
}

fn is_publishable(frontmatter: &HashMap<String, Value>) -> bool {
    frontmatter.get("visibility").and_then(Value::as_str) == Some("public")
        && frontmatter.get("status").and_then(Value::as_str) == Some("published")
}

fn prepare_output(output: &Path) -> Result<()> {
    fs::create_dir_all(output)
        .with_context(|| format!("failed to create output directory {}", output.display()))?;
    let manifest = output.join(MANIFEST_NAME);
    if manifest.is_file() {
        for line in fs::read_to_string(&manifest)?
            .lines()
            .filter(|line| !line.is_empty())
        {
            let generated = output.join(line);
            if generated.is_file() {
                fs::remove_file(generated)?;
            }
        }
    }
    Ok(())
}

fn write_manifest(output: &Path, generated: &[PathBuf]) -> Result<()> {
    let contents = generated
        .iter()
        .filter_map(|path| path.strip_prefix(output).ok())
        .map(|path| path.to_string_lossy())
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(output.join(MANIFEST_NAME), format!("{}\n", contents))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn opts(root: &Path, output: &Path) -> PublishOpts {
        PublishOpts {
            root: root.to_path_buf(),
            output: output.to_path_buf(),
            format: "json".to_string(),
        }
    }

    #[test]
    fn publish_stages_only_public_published_files() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("essays");
        let output = temp.path().join("site/_essays");
        fs::create_dir_all(&source).unwrap();
        fs::write(
            source.join("public.md"),
            "---\ntitle: Public\ndescription: A public essay\ntype: essay\nstatus: published\nvisibility: public\nslug: public\n---\n\nPublic body\n",
        )
        .unwrap();
        fs::write(
            source.join("draft.md"),
            "---\ntitle: Draft\ndescription: A draft essay\ntype: essay\nstatus: draft\nvisibility: private\nslug: draft\n---\n\nDraft body\n",
        )
        .unwrap();

        run(opts(&source, &output)).unwrap();

        assert!(output.join("public.md").is_file());
        assert!(!output.join("draft.md").exists());
        assert_eq!(
            fs::read_to_string(source.join("public.md")).unwrap(),
            "---\ntitle: Public\ndescription: A public essay\ntype: essay\nstatus: published\nvisibility: public\nslug: public\n---\n\nPublic body\n"
        );
    }

    #[test]
    fn publish_rejects_invalid_frontmatter() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("essays");
        let output = temp.path().join("site/_essays");
        fs::create_dir_all(&source).unwrap();
        fs::write(
            source.join("invalid.md"),
            "---\ntitle: Missing fields\n---\nbody\n",
        )
        .unwrap();

        assert!(run(opts(&source, &output)).is_err());
        assert!(!output.join("invalid.md").exists());
    }
}
