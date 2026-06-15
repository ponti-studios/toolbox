use crate::analysis::{CostsReport, DashboardReport, ModelsReport};
use crate::cli::OutputFormat;
use anyhow::Result;
use serde::Serialize;

pub fn render_dashboard_report(report: &DashboardReport, output: OutputFormat) -> Result<()> {
    match output {
        OutputFormat::Text => render_dashboard_text(report),
        OutputFormat::Json => render_json(report)?,
    }
    Ok(())
}

pub fn render_models_report(report: &ModelsReport, output: OutputFormat) -> Result<()> {
    match output {
        OutputFormat::Text => render_models_text(report),
        OutputFormat::Json => render_json(report)?,
    }
    Ok(())
}

pub fn render_costs_report(report: &CostsReport, output: OutputFormat) -> Result<()> {
    match output {
        OutputFormat::Text => render_costs_text(report),
        OutputFormat::Json => render_json(report)?,
    }
    Ok(())
}

fn render_json<T: Serialize>(value: &T) -> Result<()> {
    println!("{}", serde_json::to_string_pretty(value)?);
    Ok(())
}

fn render_dashboard_text(report: &DashboardReport) {
    let summary = &report.summary;

    println!("\n=== OPENROUTER USAGE DASHBOARD ===");
    println!("Total Requests: {}", summary.total_requests);
    println!();

    println!("┌────┬────────────────────────────────┬──────────────────────┐");
    println!("│ #  │ Metric                         │ Value                │");
    println!("├────┼────────────────────────────────┼──────────────────────┤");
    println!(
        "│ 1  │ Total Spend                    │ ${:.4}             │",
        summary.total_spend
    );
    println!(
        "│ 2  │ Total Requests                │ {:>18} │",
        summary.total_requests
    );
    println!(
        "│ 3  │ Avg Cost/Request              │ ${:.4}             │",
        summary.average_cost_per_request
    );
    println!(
        "│ 4  │ Total Cache Savings           │ ${:.4}             │",
        summary.total_cache_savings
    );
    println!(
        "│ 5  │ Net Cost (after cache)        │ ${:.4}             │",
        summary.net_cost_after_cache
    );
    println!(
        "│ 6  │ Total Prompt Tokens           │ {:>18} │",
        summary.total_prompt_tokens
    );
    println!(
        "│ 7  │ Total Completion Tokens       │ {:>18} │",
        summary.total_completion_tokens
    );
    println!(
        "│ 8  │ Total Cached Tokens           │ {:>18} │",
        summary.total_cached_tokens
    );
    println!(
        "│ 9  │ Avg Prompt/Request            │ {:>18.0} │",
        summary.average_prompt_tokens_per_request
    );
    println!(
        "│ 10 │ Avg Completion/Request        │ {:>18.0} │",
        summary.average_completion_tokens_per_request
    );
    println!(
        "│ 11 │ Cache Hit Rate                │ {:>17.1}% │",
        summary.cache_hit_rate_percent
    );
    println!(
        "│ 12 │ Requests with Cache           │ {:>12} / {} │",
        summary.requests_with_cache, summary.total_requests
    );
    println!(
        "│ 13 │ Avg Generation Time           │ {:>14.0}ms │",
        summary.average_generation_time_ms
    );
    println!(
        "│ 14 │ Avg Time to First Token       │ {:>14.0}ms │",
        summary.average_time_to_first_token_ms
    );
    println!(
        "│ 15 │ Cost/1M Prompt Tokens         │ ${:>17.2} │",
        summary.cost_per_million_prompt_tokens
    );
    println!(
        "│ 16 │ Cost/1M Completion Tokens     │ ${:>17.2} │",
        summary.cost_per_million_completion_tokens
    );
    println!(
        "│ 17 │ Overall Cache %               │ {:>17.1}% │",
        summary.overall_cache_percent
    );
    println!(
        "│ 18 │ Cancelled Requests            │ {:>18} │",
        summary.cancelled_requests
    );
    println!(
        "│ 19 │ Streamed Requests             │ {:>18} │",
        summary.streamed_requests
    );
    println!("└────┴────────────────────────────────┴──────────────────────┘");
    println!();

    println!("=== PROVIDER BREAKDOWN ===");
    println!(
        "{:<20} {:>10} {:>6} {:>6} {:>10} {:>7} {:>8}",
        "Provider", "Cost", "%", "Reqs", "Avg/Req", "Cache%", "AvgGen"
    );
    for row in &report.provider_breakdown {
        println!(
            "{:<20} ${:>9.4} {:>5.1}% {:>6} ${:>9.4} {:>6.0}% {:>7.1}s",
            row.provider,
            row.cost,
            row.spend_percent,
            row.requests,
            row.average_cost_per_request,
            row.cache_percent,
            row.average_generation_time_seconds
        );
    }
    println!();

    println!("=== MODEL BREAKDOWN ===");
    println!(
        "{:<30} {:>10} {:>6} {:>10} {:>10} {:>7} {:>8}",
        "Model", "Cost", "Reqs", "Avg/Req", "$/1M Cmp", "Cache%", "AvgGen"
    );
    for row in &report.model_breakdown {
        println!(
            "{:<30} ${:>9.4} {:>6} ${:>9.4} ${:>9.2} {:>6.0}% {:>7.1}s",
            row.model,
            row.cost,
            row.requests,
            row.average_cost_per_request,
            row.cost_per_million_completion_tokens,
            row.cache_percent,
            row.average_generation_time_seconds
        );
    }
    println!();

    println!("=== APP BREAKDOWN ===");
    println!(
        "{:<18} {:>10} {:>6} {:>6} {:>10}",
        "App", "Cost", "%", "Reqs", "Avg/Req"
    );
    for row in &report.app_breakdown {
        println!(
            "{:<18} ${:>9.4} {:>5.1}% {:>6} ${:>9.4}",
            row.app, row.cost, row.spend_percent, row.requests, row.average_cost_per_request
        );
    }
    println!();

    println!("=== FINISH REASONS ===");
    println!("{:<20} {:>8} {:>6}", "Reason", "Count", "%");
    for row in &report.finish_reasons {
        println!("{:<20} {:>8} {:>5.1}%", row.reason, row.count, row.percent);
    }
}

fn render_models_text(report: &ModelsReport) {
    println!("\n=== MODEL COST ANALYSIS ===");
    println!(
        "{:<30} {:>10} {:>6} {:>11} {:>10} {:>10} {:>7}",
        "Model", "Gross $", "Reqs", "Gross/req", "$/1M Pmt", "$/1M Cmp", "Cache%"
    );
    for row in &report.rows {
        println!(
            "{:<30} ${:>9.4} {:>6} ${:>10.4} ${:>9.2} ${:>9.2} {:>6.0}%",
            row.model,
            row.gross_cost,
            row.requests,
            row.gross_cost_per_request,
            row.cost_per_million_prompt_tokens,
            row.cost_per_million_completion_tokens,
            row.cache_percent
        );
    }
}

fn render_costs_text(report: &CostsReport) {
    println!("\n=== COST OVER TIME ===");
    println!(
        "{:<20} {:>12} {:>12} {:>12} {:>15}",
        "Time", "Spend", "Reqs", "Saved", "Tokens"
    );
    for row in &report.rows {
        println!(
            "{:<20} ${:>11.4} {:>12} ${:>11.4} {:>15}",
            row.time, row.spend, row.requests, row.saved, row.tokens
        );
    }
}
