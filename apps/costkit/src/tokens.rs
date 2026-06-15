use anyhow::Result;
use std::path::Path;
use tiktoken_rs::CoreBPE;
use walkdir::WalkDir;

pub fn render_tokens(folder: &Path) -> Result<()> {
    let encoding = tiktoken_rs::cl100k_base_singleton();
    let mut total = 0;
    let mut file_count = 0;

    let mut entries: Vec<_> = WalkDir::new(folder)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_file())
        .collect();
    entries.sort_by_key(|entry| entry.path().to_path_buf());

    for entry in entries {
        let path = entry.path();
        if let Some(tokens) = count_tokens_in_file(path, encoding) {
            let relative = path.strip_prefix(folder).unwrap_or(path);
            println!("{:>8}  {}", tokens, relative.display());
            total += tokens;
            file_count += 1;
        }
    }

    println!("\n{:>8}  TOTAL ({} files)", total, file_count);
    Ok(())
}

fn count_tokens_in_file(path: &Path, encoding: &CoreBPE) -> Option<usize> {
    let content = std::fs::read_to_string(path).ok()?;
    Some(encoding.encode_ordinary(&content).len())
}
