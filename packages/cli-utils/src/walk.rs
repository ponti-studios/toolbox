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
