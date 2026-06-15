use anyhow::Result;
use clap::Parser;
use costkit::cli::Cli;

fn main() -> Result<()> {
    costkit::run(Cli::parse())
}
