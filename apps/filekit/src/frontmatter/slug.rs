use anyhow::{Context, Result};
use clap::Parser;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use super::{collect_markdown_files, parse_frontmatter};

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct SlugCollisionResult {
    pub slug: String,
    pub path: String,
    pub collisions: Vec<String>,
}

#[derive(Debug)]
pub struct SlugCollisionError {
    pub slug: String,
    pub collisions: Vec<String>,
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

#[derive(Parser)]
pub struct SlugOpts {
    #[arg(short, long, default_value = ".")]
    pub root: PathBuf,
    #[arg(long)]
    pub resolve: bool,
    #[arg(long)]
    pub detect: bool,
    #[arg(long, default_value = "directory")]
    pub scope: String,
    #[arg(long)]
    pub slug: Option<String>,
    #[arg(long, default_value = "increment")]
    pub policy: String,
    #[arg(long, default_value = "10")]
    pub max_attempts: usize,
    #[arg(long)]
    pub existing_slugs: Vec<String>,
    #[arg(short, long, default_value = "text")]
    pub output: String,
}

pub fn run(opts: SlugOpts) -> Result<()> {
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

pub(crate) fn detect_slug_collisions(root: &Path, scope: &str) -> Result<Vec<SlugCollisionResult>> {
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

        let Some(slug_val) = parsed
            .frontmatter
            .as_ref()
            .and_then(|fm| fm.get("slug"))
            .and_then(|value| value.as_str())
            .filter(|s| !s.trim().is_empty())
        else {
            continue;
        };

        entries.push(SlugEntry {
            slug: slug_val.to_string(),
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
    let mut seed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
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

pub(crate) fn resolve_slug_collision(
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
