use anyhow::{Context, Result};
use clap::Parser;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use super::{collect_markdown_files, parse_frontmatter};

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct AggregatedProperty {
    pub name: String,
    pub values: Vec<String>,
}

#[derive(Parser)]
pub struct AggregateOpts {
    #[arg(default_value = ".")]
    pub target: PathBuf,
    #[arg(short, long, default_value = "frontmatter.json")]
    pub output: PathBuf,
}

pub fn run(opts: AggregateOpts) -> Result<()> {
    let aggregated = aggregate_frontmatter(&opts.target)?;

    println!("Processed {} properties with frontmatter", aggregated.len());

    let output = serde_json::to_string_pretty(&aggregated)?;
    println!("\nAggregated frontmatter properties:\n{}", output);

    fs::write(&opts.output, &output)
        .with_context(|| format!("failed to write {}", opts.output.display()))?;
    println!("\nWritten to {}", opts.output.display());

    Ok(())
}

fn frontmatter_values(parsed: &super::ParsedFile) -> HashMap<String, Vec<String>> {
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

pub(crate) fn aggregate_frontmatter(target: &Path) -> Result<Vec<AggregatedProperty>> {
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
