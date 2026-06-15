pub mod analysis;
pub mod cli;
pub mod render;
pub mod schema;
pub mod tokens;

use analysis::{
    build_costs_report, build_dashboard_report, build_models_report, filter_rows, Filters,
};
use anyhow::Result;
use cli::{Cli, Commands};
use render::{render_costs_report, render_dashboard_report, render_models_report};
use schema::load_csv;
use tokens::render_tokens;

pub fn run(cli: Cli) -> Result<()> {
    match cli.command {
        Commands::Dashboard(opts) => {
            let rows = load_csv(&opts.file)?;
            if rows.is_empty() {
                println!("No data found in CSV file");
                return Ok(());
            }
            let filtered = filter_rows(
                &rows,
                Filters::new(
                    opts.model.as_deref(),
                    opts.provider.as_deref(),
                    opts.app.as_deref(),
                ),
            );
            let report = build_dashboard_report(&filtered, opts.limit);
            render_dashboard_report(&report, opts.output)?;
        }
        Commands::Models(opts) => {
            let rows = load_csv(&opts.file)?;
            if rows.is_empty() {
                println!("No data found in CSV file");
                return Ok(());
            }
            let filtered = filter_rows(
                &rows,
                Filters::new(opts.model.as_deref(), opts.provider.as_deref(), None),
            );
            let report = build_models_report(&filtered, opts.limit, &opts.tier, opts.threshold)?;
            render_models_report(&report, opts.output)?;
        }
        Commands::Costs(opts) => {
            let rows = load_csv(&opts.file)?;
            if rows.is_empty() {
                println!("No data found in CSV file");
                return Ok(());
            }
            let filtered = filter_rows(
                &rows,
                Filters::new(opts.model.as_deref(), opts.provider.as_deref(), None),
            );
            let report = build_costs_report(&filtered, &opts.interval)?;
            render_costs_report(&report, opts.output)?;
        }
        Commands::Tokens(opts) => {
            render_tokens(&opts.folder)?;
        }
    }

    Ok(())
}
