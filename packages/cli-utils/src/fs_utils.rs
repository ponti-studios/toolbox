//! File system utilities.

use anyhow::{Context, Result};
use std::fs;
use std::path::Path;

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
