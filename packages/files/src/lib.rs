//! Shared filesystem helpers.

use anyhow::{Context, Result};
use gray_matter::engine::YAML;
use gray_matter::{Matter, ParsedEntity};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use walkdir::WalkDir;

/// Read a file as string.
pub fn read_file(path: &Path) -> Result<String> {
    fs::read_to_string(path).with_context(|| format!("Failed to read file: {}", path.display()))
}

/// Write content to a file, creating directories if needed.
pub fn write_file(path: &Path, content: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content).with_context(|| format!("Failed to write file: {}", path.display()))
}

/// Copy a file from source to destination, creating directories if needed.
pub fn copy_file(src: &Path, dest: &Path) -> Result<()> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(src, dest).map(|_| ())?;
    Ok(())
}

/// Check if a path exists and is a file.
pub fn is_file(path: &Path) -> bool {
    path.is_file()
}

/// Check if a path exists and is a directory.
pub fn is_dir(path: &Path) -> bool {
    path.is_dir()
}

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

    // Preserve existing behavior: an explicit empty block (`---\n---`) still counts as frontmatter.
    if trimmed.starts_with("---") {
        let after = trimmed
            .strip_prefix("---")
            .unwrap()
            .trim_start_matches('\n');
        if let Some((fm_raw, body)) = after.split_once("---") {
            if fm_raw.trim().is_empty() {
                return Ok(ParsedFrontmatter {
                    frontmatter: Some(HashMap::new()),
                    body: body.trim_start_matches('\n').to_string(),
                    has_fm: true,
                });
            }
        }
    }

    let matter = Matter::<YAML>::new();
    let parsed: ParsedEntity<HashMap<String, serde_json::Value>> = matter
        .parse(trimmed)
        .map_err(|e| anyhow::anyhow!("Failed to parse YAML frontmatter: {e}"))?;

    Ok(ParsedFrontmatter {
        frontmatter: parsed.data,
        body: parsed.content,
        has_fm: !parsed.matter.is_empty(),
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
    let content = read_file(path)?;
    let parsed = parse_yaml_frontmatter(&content)?;

    if !parsed.has_fm {
        anyhow::bail!("No frontmatter found in file");
    }

    let mut fm = parsed.frontmatter.unwrap_or_default();
    fm.insert(field.to_string(), value);

    let new_content = build_yaml_frontmatter(&fm, &parsed.body)?;
    write_file(path, &new_content)?;

    Ok(())
}

/// Get all files in a directory with specific extensions.
///
/// # Arguments
/// * `root` - Root directory to search
/// * `extensions` - File extensions to include (e.g., &[".md", ".txt"])
/// * `include_hidden` - Whether to include hidden files
pub fn get_files_with_extensions(
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

/// Walk a directory and apply a function to each file.
pub fn walk_files<F>(root: &Path, include_hidden: bool, mut f: F) -> Result<usize>
where
    F: FnMut(&Path) -> Result<()>,
{
    let mut count = 0;

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
            f(path)?;
            count += 1;
        }
    }

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::{NamedTempFile, TempDir};

    #[test]
    fn read_file_returns_content() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "Hello, world!").unwrap();

        let content = read_file(file.path()).unwrap();
        assert!(content.contains("Hello, world!"));
    }

    #[test]
    fn read_file_nonexistent_returns_error() {
        let result = read_file(Path::new("/nonexistent/path/to/file.txt"));
        assert!(result.is_err());
    }

    #[test]
    fn write_file_creates_content() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");

        write_file(&file_path, "Test content").unwrap();

        let content = std::fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "Test content");
    }

    #[test]
    fn write_file_creates_parent_directories() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("nested/dirs/test.txt");

        write_file(&file_path, "Nested content").unwrap();

        assert!(file_path.exists());
        let content = std::fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "Nested content");
    }

    #[test]
    fn copy_file_copies_content() {
        let temp_dir = TempDir::new().unwrap();
        let src = temp_dir.path().join("source.txt");
        let dest = temp_dir.path().join("dest.txt");

        std::fs::write(&src, "Copy me!").unwrap();
        copy_file(&src, &dest).unwrap();

        assert!(dest.exists());
        let content = std::fs::read_to_string(&dest).unwrap();
        assert_eq!(content, "Copy me!");
    }

    #[test]
    fn copy_file_creates_parent_directories() {
        let temp_dir = TempDir::new().unwrap();
        let src = temp_dir.path().join("source.txt");
        let dest = temp_dir.path().join("deep/nested/dest.txt");

        std::fs::write(&src, "Deep copy").unwrap();
        copy_file(&src, &dest).unwrap();

        assert!(dest.exists());
    }

    #[test]
    fn is_file_returns_true_for_file() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "content").unwrap();

        assert!(is_file(file.path()));
    }

    #[test]
    fn is_file_returns_false_for_directory() {
        let temp_dir = TempDir::new().unwrap();
        assert!(!is_file(temp_dir.path()));
    }

    #[test]
    fn is_dir_returns_true_for_directory() {
        let temp_dir = TempDir::new().unwrap();
        assert!(is_dir(temp_dir.path()));
    }

    #[test]
    fn is_dir_returns_false_for_file() {
        let mut file = NamedTempFile::new().unwrap();
        writeln!(file, "content").unwrap();

        assert!(!is_dir(file.path()));
    }

    #[test]
    fn get_files_with_extensions_filters_by_extension() {
        let temp_dir = TempDir::new().unwrap();

        fs::write(temp_dir.path().join("test.md"), "# Markdown").unwrap();
        fs::write(temp_dir.path().join("test.txt"), "Text file").unwrap();
        fs::write(temp_dir.path().join("test.rs"), "fn main() {}").unwrap();

        let files = get_files_with_extensions(temp_dir.path(), &[String::from(".md")], false);

        assert_eq!(files.len(), 1);
        assert!(files[0].to_string_lossy().ends_with("test.md"));
    }

    #[test]
    fn get_files_with_extensions_case_insensitive() {
        let temp_dir = TempDir::new().unwrap();

        fs::write(temp_dir.path().join("test.MD"), "# Markdown").unwrap();
        fs::write(temp_dir.path().join("test.TXT"), "Text file").unwrap();

        let files = get_files_with_extensions(temp_dir.path(), &[String::from(".md")], false);

        assert_eq!(files.len(), 1);
    }

    #[test]
    fn get_files_with_extensions_excludes_hidden() {
        let temp_dir = TempDir::new().unwrap();

        fs::write(temp_dir.path().join("visible.md"), "# Markdown").unwrap();
        fs::write(temp_dir.path().join(".hidden.md"), "# Hidden").unwrap();

        let files = get_files_with_extensions(temp_dir.path(), &[String::from(".md")], false);

        assert_eq!(files.len(), 1);
        assert!(files[0].to_string_lossy().ends_with("visible.md"));
    }

    #[test]
    fn get_files_with_extensions_includes_hidden_when_enabled() {
        let temp_dir = TempDir::new().unwrap();

        fs::write(temp_dir.path().join("visible.md"), "# Markdown").unwrap();
        fs::write(temp_dir.path().join(".hidden.md"), "# Hidden").unwrap();

        let files = get_files_with_extensions(temp_dir.path(), &[String::from(".md")], true);

        assert_eq!(files.len(), 2);
    }

    #[test]
    fn get_files_with_extensions_nested_files() {
        let temp_dir = TempDir::new().unwrap();

        fs::create_dir_all(temp_dir.path().join("subdir")).unwrap();
        fs::write(temp_dir.path().join("root.md"), "# Root").unwrap();
        fs::write(temp_dir.path().join("subdir/nested.md"), "# Nested").unwrap();

        let files = get_files_with_extensions(temp_dir.path(), &[String::from(".md")], false);

        assert_eq!(files.len(), 2);
    }

    #[test]
    fn walk_files_counts_files() {
        let temp_dir = TempDir::new().unwrap();

        fs::write(temp_dir.path().join("a.txt"), "A").unwrap();
        fs::write(temp_dir.path().join("b.txt"), "B").unwrap();

        let mut count = 0;
        walk_files(temp_dir.path(), false, |_| {
            count += 1;
            Ok(())
        })
        .unwrap();

        assert_eq!(count, 2);
    }

    #[test]
    fn walk_files_passes_correct_paths() {
        let temp_dir = TempDir::new().unwrap();

        fs::write(temp_dir.path().join("test.txt"), "test").unwrap();

        let mut paths = Vec::new();
        walk_files(temp_dir.path(), false, |path| {
            paths.push(path.to_path_buf());
            Ok(())
        })
        .unwrap();

        assert_eq!(paths.len(), 1);
        assert!(paths[0].to_string_lossy().ends_with("test.txt"));
    }

    #[test]
    fn walk_files_respects_hidden_flag() {
        let temp_dir = TempDir::new().unwrap();

        fs::write(temp_dir.path().join("visible.txt"), "V").unwrap();
        fs::write(temp_dir.path().join(".hidden.txt"), "H").unwrap();

        let mut count_visible = 0;
        walk_files(temp_dir.path(), false, |_| {
            count_visible += 1;
            Ok(())
        })
        .unwrap();

        let mut count_all = 0;
        walk_files(temp_dir.path(), true, |_| {
            count_all += 1;
            Ok(())
        })
        .unwrap();

        assert_eq!(count_visible, 1);
        assert_eq!(count_all, 2);
    }

    #[test]
    fn parse_yaml_frontmatter_with_valid_frontmatter() {
        let content = r#"---
title: Test
tags: [rust, cli]
---

Body content here.
"#;
        let result = parse_yaml_frontmatter(content).unwrap();

        assert!(result.has_fm);
        assert_eq!(result.body.trim(), "Body content here.");

        let fm = result.frontmatter.unwrap();
        assert_eq!(fm.get("title").and_then(|v| v.as_str()), Some("Test"));
    }

    #[test]
    fn parse_yaml_frontmatter_without_frontmatter() {
        let content = "Just plain content.";
        let result = parse_yaml_frontmatter(content).unwrap();

        assert!(!result.has_fm);
        assert!(result.frontmatter.is_none());
        assert_eq!(result.body, content);
    }

    #[test]
    fn parse_yaml_frontmatter_with_bom() {
        let content = "\u{feff}---\ntitle: BOM Test\n---\n\nContent.";
        let result = parse_yaml_frontmatter(content).unwrap();

        assert!(result.has_fm);
        let fm = result.frontmatter.unwrap();
        assert_eq!(fm.get("title").and_then(|v| v.as_str()), Some("BOM Test"));
    }

    #[test]
    fn parse_yaml_frontmatter_empty_frontmatter() {
        let content = "---\n---\n\nContent.";
        let result = parse_yaml_frontmatter(content).unwrap();

        assert!(result.has_fm);
        assert!(result.frontmatter.unwrap().is_empty());
    }

    #[test]
    fn build_yaml_frontmatter_round_trip() {
        let mut frontmatter = HashMap::new();
        frontmatter.insert("title".to_string(), serde_json::json!("Hello"));
        frontmatter.insert("count".to_string(), serde_json::json!(42));

        let body = "This is the body content.";
        let content = build_yaml_frontmatter(&frontmatter, body).unwrap();

        assert!(content.contains("title: Hello"));
        assert!(content.contains("count: 42"));
        assert!(content.starts_with("---"));
        assert!(content.contains("---"));
        assert!(content.ends_with(body));
    }

    #[test]
    fn build_yaml_frontmatter_with_array() {
        let mut frontmatter = HashMap::new();
        frontmatter.insert("tags".to_string(), serde_json::json!(["a", "b", "c"]));

        let content = build_yaml_frontmatter(&frontmatter, "").unwrap();

        assert!(content.contains("tags:"));
    }
}
