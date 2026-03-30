mod error;
mod github;
mod parser;

use clap::Parser;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "gimme")]
#[command(version, about = "Copy files from GitHub to local filesystem", long_about = None)]
struct Args {
    #[arg(help = "GitHub URL or owner/repo/path@ref")]
    source: String,

    #[arg(
        help = "Destination directory (default: current directory)",
        default_value = "."
    )]
    destination: PathBuf,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    let file = parser::parse(&args.source).map_err(|e| anyhow::anyhow!("{}", e))?;
    println!("Fetching {}...", file);

    let client = github::GitHubClient::new();
    let content = client
        .fetch_file(&file)
        .await
        .map_err(|e| anyhow::anyhow!("{}", e))?;

    let dest = args.destination.join(&file.path);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&dest, &content)?;

    println!("Written to {}", dest.display());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_args_parsing() {
        let args = Args::parse_from(["gimme", "owner/repo/file.txt@main", "./output"]);
        assert_eq!(args.source, "owner/repo/file.txt@main");
        assert_eq!(args.destination, PathBuf::from("./output"));
    }

    #[test]
    fn test_default_destination() {
        let args = Args::parse_from(["gimme", "owner/repo/file.txt@main"]);
        assert_eq!(args.destination, PathBuf::from("."));
    }
}
