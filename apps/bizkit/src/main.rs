use anyhow::Result;
use clap::{Parser, Subcommand};

mod biz;

#[derive(Parser)]
#[command(name = "bizkit")]
#[command(about = "Business modeling and scenario CLI", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize the default SaaS model and schema.
    Init(biz::InitOpts),
    /// List model knobs.
    Knobs(biz::KnobsOpts),
    /// Scenario operations.
    Scenario {
        #[command(subcommand)]
        cmd: biz::ScenarioCmd,
    },
    /// Run a scenario.
    Run(biz::RunOpts),
    /// Compare two scenarios.
    Compare(biz::CompareOpts),
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Init(opts) => biz::run_init(opts)?,
        Commands::Knobs(opts) => biz::run_knobs(opts)?,
        Commands::Scenario { cmd } => match cmd {
            biz::ScenarioCmd::Create(opts) => biz::run_scenario_create(opts)?,
            biz::ScenarioCmd::Set(opts) => biz::run_scenario_set(opts)?,
            biz::ScenarioCmd::List(opts) => biz::run_scenario_list(opts)?,
            biz::ScenarioCmd::Show(opts) => biz::run_scenario_show(opts)?,
            biz::ScenarioCmd::Clone(opts) => biz::run_scenario_clone(opts)?,
        },
        Commands::Run(opts) => biz::run_run(opts)?,
        Commands::Compare(opts) => biz::run_compare(opts)?,
    }

    Ok(())
}
