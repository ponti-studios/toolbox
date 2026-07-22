use anyhow::Result;
use clap::Parser;
use files::get_files_with_extensions;
use std::fs;
use std::path::PathBuf;

use super::{build_frontmatter_content, parse_frontmatter};

#[derive(Parser)]
pub struct UpdateOpts {
    #[arg(short, long, default_value = ".")]
    pub root: PathBuf,
    #[arg(long)]
    pub field: Option<String>,
    #[arg(long)]
    pub value: Option<String>,
    #[arg(long)]
    pub dry_run: bool,
}

pub fn run(opts: UpdateOpts) -> Result<()> {
    if opts.field.is_none() || opts.value.is_none() {
        eprintln!("Error: --field and --value are required");
        std::process::exit(1);
    }

    let field = opts.field.unwrap();
    let value = opts.value.unwrap();

    let extensions = vec![".md".to_string(), ".markdown".to_string()];
    let files = get_files_with_extensions(&opts.root, &extensions, false);

    for path in files {
        if let Ok(content) = fs::read_to_string(&path) {
            let parsed = parse_frontmatter(&content)?;

            if !parsed.has_fm {
                continue;
            }

            let mut fm = parsed.frontmatter.unwrap_or_default();
            fm.insert(field.clone(), serde_json::Value::String(value.clone()));

            let new_content = build_frontmatter_content(&fm, &parsed.body)?;

            if opts.dry_run {
                println!("Would update: {}", path.display());
            } else {
                fs::write(&path, new_content)?;
                println!("Updated: {}", path.display());
            }
        }
    }

    Ok(())
}
