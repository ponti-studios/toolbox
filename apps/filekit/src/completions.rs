use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use clap_complete::{generate, Shell};
use std::path::{Path, PathBuf};

use crate::Cli;

#[derive(Subcommand)]
pub enum CompletionCmd {
    /// Generate completions to stdout.
    Generate(CompletionOpts),
    /// Install completions to the standard location for a shell.
    Install(CompletionInstallOpts),
}

#[derive(Parser, Debug)]
pub struct CompletionOpts {
    /// Shell to generate completions for.
    #[arg(value_enum)]
    pub shell: Shell,
}

#[derive(Parser, Debug)]
pub struct CompletionInstallOpts {
    /// Shell to install completions for.
    #[arg(value_enum)]
    pub shell: Shell,

    /// Write the completion file even if it already exists.
    #[arg(long)]
    pub force: bool,

    /// Do not write files; print the destination path instead.
    #[arg(long)]
    pub dry_run: bool,
}

pub fn run_generate(opts: CompletionOpts) -> Result<()> {
    let mut cmd = Cli::command();
    generate(opts.shell, &mut cmd, "filekit", &mut std::io::stdout());
    Ok(())
}

fn install_path(shell: Shell) -> Result<PathBuf> {
    let home = dirs::home_dir().context("could not determine home directory")?;

    let path = match shell {
        Shell::Zsh => {
            if let Ok(prefix) = std::env::var("HOMEBREW_PREFIX") {
                PathBuf::from(prefix).join("share/zsh/site-functions/_filekit")
            } else if let Ok(prefix) = std::env::var("HOMEBREW_CELLAR") {
                let prefix = PathBuf::from(prefix)
                    .parent()
                    .map(Path::to_path_buf)
                    .unwrap_or_else(|| home.clone());
                prefix.join("share/zsh/site-functions/_filekit")
            } else {
                home.join(".zsh/completions/_filekit")
            }
        }
        Shell::Bash => home.join(".local/share/bash-completion/completions/filekit"),
        Shell::Fish => home.join(".config/fish/completions/filekit.fish"),
        Shell::PowerShell => home.join("Documents/PowerShell/Completions/_filekit.ps1"),
        Shell::Elvish => home.join(".elvish/lib/filekit.elv"),
        _ => home.join(".local/share/filekit/completions/filekit"),
    };

    Ok(path)
}

pub fn run_install(opts: CompletionInstallOpts) -> Result<()> {
    let path = install_path(opts.shell)?;
    if opts.dry_run {
        println!("{}", path.display());
        return Ok(());
    }

    if path.exists() && !opts.force {
        anyhow::bail!(
            "completion file already exists: {} (use --force to overwrite)",
            path.display()
        );
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("creating {}", parent.display()))?;
    }

    let mut cmd = Cli::command();
    let mut buf = Vec::new();
    generate(opts.shell, &mut cmd, "filekit", &mut buf);
    std::fs::write(&path, buf).with_context(|| format!("writing {}", path.display()))?;

    println!("installed completions to {}", path.display());
    if matches!(opts.shell, Shell::Zsh) {
        println!("If needed, ensure that directory is on your fpath and run compinit.");
    }

    Ok(())
}
