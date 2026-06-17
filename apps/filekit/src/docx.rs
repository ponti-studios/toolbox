use anyhow::{bail, Context, Result};
use clap::{Args, Subcommand};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Command;
use walkdir::WalkDir;

#[derive(Subcommand)]
pub enum DocxCmd {
    /// Convert DOCX files to Markdown with pandoc.
    ToMd(ConvertDocxOpts),
}

#[derive(Args, Debug)]
pub struct ConvertDocxOpts {
    /// One or more DOCX files and/or directories. Directories are searched recursively.
    #[arg(value_name = "PATH")]
    pub paths: Vec<PathBuf>,

    /// Replace existing .md outputs.
    #[arg(short, long)]
    pub overwrite: bool,

    /// Do not extract embedded media.
    #[arg(long)]
    pub no_media: bool,
}

pub fn run_docx(cmd: DocxCmd) -> Result<()> {
    match cmd {
        DocxCmd::ToMd(opts) => run_to_md(opts),
    }
}

fn run_to_md(opts: ConvertDocxOpts) -> Result<()> {
    ensure_pandoc_available()?;

    let input_paths = if opts.paths.is_empty() {
        vec![PathBuf::from(".")]
    } else {
        opts.paths
    };

    let docx_files = collect_docx_files(&input_paths)?;
    if docx_files.is_empty() {
        println!("No .docx files found.");
        return Ok(());
    }

    let mut converted = 0usize;
    let mut skipped = 0usize;
    let mut failed = 0usize;

    for file in docx_files {
        let target_md = markdown_output_path(&file)?;
        let media_dir = media_output_path(&file)?;

        if target_md.exists() && !opts.overwrite {
            println!(
                "Skipped: {} (exists: {})",
                file.display(),
                target_md.display()
            );
            skipped += 1;
            continue;
        }

        match run_pandoc(
            &file,
            &target_md,
            (!opts.no_media).then_some(media_dir.as_path()),
        ) {
            Ok(()) => {
                println!("Converted: {} -> {}", file.display(), target_md.display());
                converted += 1;
            }
            Err(error) => {
                eprintln!("Failed: {} ({error:#})", file.display());
                failed += 1;
            }
        }
    }

    println!(
        "\nSummary: {} converted, {} skipped, {} failed",
        converted, skipped, failed
    );

    if failed > 0 {
        bail!("{failed} conversion(s) failed");
    }

    Ok(())
}

fn ensure_pandoc_available() -> Result<()> {
    let status = Command::new("pandoc")
        .arg("--version")
        .status()
        .context("failed to invoke pandoc")?;

    if status.success() {
        Ok(())
    } else {
        bail!("pandoc is required. Install it with: brew install pandoc");
    }
}

fn collect_docx_files(paths: &[PathBuf]) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();

    for path in paths {
        if path.is_dir() {
            let mut found = WalkDir::new(path)
                .follow_links(false)
                .into_iter()
                .filter_map(|entry| entry.ok())
                .map(|entry| entry.into_path())
                .filter(|candidate| candidate.is_file() && is_docx(candidate))
                .collect::<Vec<_>>();
            found.sort();
            files.extend(found);
            continue;
        }

        if path.exists() {
            if is_docx(path) {
                files.push(path.clone());
            } else {
                bail!("Not a .docx file: {}", path.display());
            }
            continue;
        }

        bail!("Path not found: {}", path.display());
    }

    Ok(files)
}

fn is_docx(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .map(|ext| ext.eq_ignore_ascii_case("docx"))
        .unwrap_or(false)
}

fn markdown_output_path(path: &Path) -> Result<PathBuf> {
    if !is_docx(path) {
        bail!("Not a .docx file: {}", path.display());
    }

    Ok(path.with_extension("md"))
}

fn media_output_path(path: &Path) -> Result<PathBuf> {
    let stem = path
        .file_stem()
        .and_then(OsStr::to_str)
        .context("failed to determine DOCX file stem")?;

    Ok(path.with_file_name(format!("{stem}_media")))
}

fn run_pandoc(file: &Path, target_md: &Path, media_dir: Option<&Path>) -> Result<()> {
    let mut command = Command::new("pandoc");
    command.arg(file).arg("-t").arg("gfm").arg("--wrap=none");

    if let Some(media_dir) = media_dir {
        command.arg(format!("--extract-media={}", media_dir.display()));
    }

    let status = command
        .arg("-o")
        .arg(target_md)
        .status()
        .with_context(|| format!("failed to run pandoc for {}", file.display()))?;

    if status.success() {
        Ok(())
    } else {
        bail!("pandoc exited with status {status}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn collect_docx_files_accepts_single_docx_file() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("resume.docx");
        fs::write(&path, "placeholder").expect("write file");

        let files = collect_docx_files(&[path.clone()]).expect("collect files");

        assert_eq!(files, vec![path]);
    }

    #[test]
    fn collect_docx_files_recurses_directories() {
        let dir = tempfile::tempdir().expect("tempdir");
        let nested = dir.path().join("nested");
        fs::create_dir_all(&nested).expect("create nested dir");
        let a = dir.path().join("a.docx");
        let b = nested.join("b.DOCX");
        let ignored = nested.join("notes.md");
        fs::write(&a, "a").expect("write a");
        fs::write(&b, "b").expect("write b");
        fs::write(&ignored, "ignored").expect("write ignored");

        let files = collect_docx_files(&[dir.path().to_path_buf()]).expect("collect files");

        assert_eq!(files, vec![a, b]);
    }

    #[test]
    fn collect_docx_files_rejects_non_docx_file() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("note.txt");
        fs::write(&path, "placeholder").expect("write file");

        let error = collect_docx_files(&[path]).expect_err("expected error");

        assert!(error.to_string().contains("Not a .docx file"));
    }

    #[test]
    fn markdown_output_path_changes_extension() {
        let path = PathBuf::from("/tmp/resume.docx");
        assert_eq!(
            markdown_output_path(&path).expect("markdown path"),
            PathBuf::from("/tmp/resume.md")
        );
    }

    #[test]
    fn media_output_path_uses_docx_stem() {
        let path = PathBuf::from("/tmp/resume.docx");
        assert_eq!(
            media_output_path(&path).expect("media path"),
            PathBuf::from("/tmp/resume_media")
        );
    }
}
