use anyhow::Result;
use clap::Parser;
use files::get_files_with_extensions;
use std::fs;
use std::path::PathBuf;

use super::parse_frontmatter;

#[derive(Parser)]
pub struct WalkOpts {
    #[arg(short, long, default_value = ".")]
    pub root: PathBuf,
    #[arg(short, long, default_value = "text")]
    pub output: String,
    #[arg(long)]
    pub include_hidden: bool,
    #[arg(long, default_value = ".md,.markdown")]
    pub extensions: String,
    #[arg(long)]
    pub include_globs: Option<String>,
    #[arg(long)]
    pub exclude_globs: Option<String>,
    #[arg(long, default_value = "0")]
    pub max_files: usize,
}

pub fn run(opts: WalkOpts) -> Result<()> {
    let extensions: Vec<String> = opts
        .extensions
        .split(',')
        .map(|s| s.trim().to_string())
        .collect();

    let files = get_files_with_extensions(&opts.root, &extensions, opts.include_hidden);

    match opts.output.as_str() {
        "json" => {
            let results: Vec<serde_json::Value> = files
                .iter()
                .filter_map(|path| {
                    fs::read_to_string(path).ok().and_then(|content| {
                        parse_frontmatter(&content).ok().map(|parsed| {
                            serde_json::json!({
                                "path": path.to_string_lossy(),
                                "has_frontmatter": parsed.has_fm,
                                "fields": parsed.frontmatter,
                            })
                        })
                    })
                })
                .collect();
            println!("{}", serde_json::to_string_pretty(&results)?);
        }
        _ => {
            for path in files {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(parsed) = parse_frontmatter(&content) {
                        println!("{}", path.display());
                        if let Some(ref fm) = parsed.frontmatter {
                            for (key, value) in fm {
                                println!("  {}: {}", key, value);
                            }
                        }
                        println!();
                    }
                }
            }
        }
    }

    Ok(())
}
