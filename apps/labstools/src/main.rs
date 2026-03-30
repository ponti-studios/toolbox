use anyhow::Result;
use clap::Parser;
use std::fs;
use std::path::PathBuf;
use walkdir::WalkDir;

#[derive(Parser)]
#[command(name = "labstools")]
#[command(about = "Labs team CLI tools", long_about = None)]
struct Cli {
    #[arg(default_value = ".")]
    folder: PathBuf,
}

fn count_tokens_approx(text: &str) -> usize {
    text.split_whitespace().count() * 4 / 3
}

fn process_file(path: &std::path::Path) -> Option<usize> {
    fs::read_to_string(path)
        .ok()
        .map(|content| count_tokens_approx(&content))
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    let folder = &cli.folder;

    if !folder.exists() {
        anyhow::bail!("Folder does not exist: {}", folder.display());
    }

    let mut total = 0usize;
    let mut file_count = 0usize;
    let mut files: Vec<(PathBuf, usize)> = Vec::new();

    for entry in WalkDir::new(folder)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();

        if path.is_file() {
            if let Some(tokens) = process_file(path) {
                let rel_path = path.strip_prefix(folder).unwrap_or(path);
                files.push((rel_path.to_path_buf(), tokens));
                total += tokens;
                file_count += 1;
            }
        }
    }

    files.sort_by(|a, b| a.0.cmp(&b.0));

    for (path, tokens) in &files {
        println!("{:>8}  {}", tokens, path.display());
    }

    println!("\n{:>8}  TOTAL ({} files)", total, file_count);

    Ok(())
}
