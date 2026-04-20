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
}
