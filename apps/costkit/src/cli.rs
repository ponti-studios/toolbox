use clap::{Parser, Subcommand, ValueEnum};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "costkit")]
#[command(about = "LLM cost analysis CLI", long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand)]
pub enum Commands {
    Dashboard(DashboardOpts),
    Models(ModelsOpts),
    Costs(CostsOpts),
    Tokens(TokensOpts),
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, ValueEnum)]
pub enum OutputFormat {
    Text,
    Json,
}

#[derive(Parser)]
pub struct DashboardOpts {
    #[arg(short, long, default_value = "data.csv")]
    pub file: PathBuf,
    #[arg(short, long)]
    pub model: Option<String>,
    #[arg(short, long)]
    pub provider: Option<String>,
    #[arg(short, long)]
    pub app: Option<String>,
    #[arg(short, long, default_value = "20")]
    pub limit: usize,
    #[arg(long, value_enum, default_value = "text")]
    pub output: OutputFormat,
}

#[derive(Parser)]
pub struct ModelsOpts {
    #[arg(short, long, default_value = "data.csv")]
    pub file: PathBuf,
    #[arg(long, default_value = "all")]
    pub tier: String,
    #[arg(long, default_value = "50.0")]
    pub threshold: f64,
    #[arg(short, long)]
    pub model: Option<String>,
    #[arg(short, long)]
    pub provider: Option<String>,
    #[arg(short, long, default_value = "20")]
    pub limit: usize,
    #[arg(long, value_enum, default_value = "text")]
    pub output: OutputFormat,
}

#[derive(Parser)]
pub struct CostsOpts {
    #[arg(short, long, default_value = "data.csv")]
    pub file: PathBuf,
    #[arg(long, default_value = "hour")]
    pub interval: String,
    #[arg(short, long)]
    pub model: Option<String>,
    #[arg(short, long)]
    pub provider: Option<String>,
    #[arg(long, value_enum, default_value = "text")]
    pub output: OutputFormat,
}

#[derive(Parser)]
pub struct TokensOpts {
    #[arg(value_name = "FOLDER", default_value = ".")]
    pub folder: PathBuf,
}
