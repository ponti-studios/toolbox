use anyhow::Result;
use clap::{CommandFactory, Parser, Subcommand};

mod analyze;
mod classify;
mod completions;
mod docx;
mod fileops;
mod frontmatter;

#[derive(Parser)]
#[command(name = "filekit")]
#[command(about = "CLI utilities and tools", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Frontmatter {
        #[command(subcommand)]
        cmd: frontmatter::FrontmatterCmd,
    },
    Classify {
        #[command(subcommand)]
        cmd: classify::ClassifyCmd,
    },
    Docx {
        #[command(subcommand)]
        cmd: docx::DocxCmd,
    },
    Analyze(analyze::AnalyzeOpts),
    Files {
        #[command(subcommand)]
        cmd: fileops::FileOpsCmd,
    },
    Completions {
        #[command(subcommand)]
        cmd: completions::CompletionCmd,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Frontmatter { cmd } => frontmatter::run(cmd)?,
        Commands::Classify { cmd } => match cmd {
            classify::ClassifyCmd::Essays(opts) => classify::run_essays(opts)?,
        },
        Commands::Docx { cmd } => docx::run_docx(cmd)?,
        Commands::Analyze(opts) => analyze::run_analyze(opts)?,
        Commands::Files { cmd } => match cmd {
            fileops::FileOpsCmd::MergeMarkdown(opts) => fileops::run_merge_markdown(opts)?,
            fileops::FileOpsCmd::FindDuplicates(opts) => fileops::run_find_duplicates(opts)?,
            fileops::FileOpsCmd::BulkRename(opts) => fileops::run_bulk_rename(opts)?,
            fileops::FileOpsCmd::Convert(opts) => fileops::run_convert(opts)?,
            fileops::FileOpsCmd::XlsxToCsv(opts) => fileops::run_xlsx_to_csv(opts)?,
        },
        Commands::Completions { cmd } => match cmd {
            completions::CompletionCmd::Generate(opts) => completions::run_generate(opts)?,
            completions::CompletionCmd::Install(opts) => completions::run_install(opts)?,
        },
    }

    Ok(())
}

impl Cli {
    pub fn command() -> clap::Command {
        <Cli as CommandFactory>::command()
    }
}
