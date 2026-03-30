//! Frontmatter parsing utilities.

use anyhow::{Context, Result};
use std::collections::HashMap;
use std::path::Path;

/// Represents parsed frontmatter from a file.
#[derive(Debug, Clone)]
pub struct ParsedFrontmatter {
    pub frontmatter: Option<HashMap<String, serde_json::Value>>,
    pub body: String,
    pub has_fm: bool,
}

/// Parse YAML frontmatter from markdown content.
///
/// Returns the parsed frontmatter, remaining body, and whether frontmatter was present.
pub fn parse_yaml_frontmatter(content: &str) -> Result<ParsedFrontmatter> {
    let trimmed = content.trim_start_matches('\u{feff}');

    if !trimmed.starts_with("---") {
        return Ok(ParsedFrontmatter {
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

        return Ok(ParsedFrontmatter {
            frontmatter: Some(fm),
            body: body.trim_start_matches('\n').to_string(),
            has_fm: true,
        });
    }

    Ok(ParsedFrontmatter {
        frontmatter: None,
        body: content.to_string(),
        has_fm: false,
    })
}

/// Build YAML frontmatter from a map and body content.
pub fn build_yaml_frontmatter(
    frontmatter: &HashMap<String, serde_json::Value>,
    body: &str,
) -> Result<String> {
    let yaml = serde_yaml::to_string(frontmatter)?;
    Ok(format!("---\n{}---\n\n{}", yaml.trim(), body))
}

/// Update a frontmatter field in a file.
pub fn update_frontmatter_field(path: &Path, field: &str, value: serde_json::Value) -> Result<()> {
    let content = crate::fs_utils::read_file(path)?;
    let parsed = parse_yaml_frontmatter(&content)?;

    if !parsed.has_fm {
        anyhow::bail!("No frontmatter found in file");
    }

    let mut fm = parsed.frontmatter.unwrap_or_default();
    fm.insert(field.to_string(), value);

    let new_content = build_yaml_frontmatter(&fm, &parsed.body)?;
    crate::fs_utils::write_file(path, &new_content)?;

    Ok(())
}
