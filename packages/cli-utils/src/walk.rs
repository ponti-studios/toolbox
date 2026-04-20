//! File traversal utilities.

use anyhow::Result;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

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
    use std::fs;
    use tempfile::TempDir;

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
}
