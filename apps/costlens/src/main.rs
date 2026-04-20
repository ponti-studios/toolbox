use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap};
use std::fs::File;
use std::path::Path;
use std::path::PathBuf;
use tiktoken_rs::CoreBPE;
use walkdir::WalkDir;

#[derive(Parser)]
#[command(name = "costlens")]
#[command(about = "LLM cost analysis CLI", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
    #[arg(short, long, default_value = "data.csv")]
    file: PathBuf,
}

#[derive(Subcommand)]
enum Commands {
    Dashboard(DashboardOpts),
    Models(ModelsOpts),
    Costs(CostsOpts),
    Tokens(TokensOpts),
}

#[derive(Parser)]
struct DashboardOpts {
    #[arg(short, long)]
    model: Option<String>,
    #[arg(short, long)]
    provider: Option<String>,
    #[arg(short, long)]
    app: Option<String>,
    #[arg(short, long, default_value = "20")]
    limit: usize,
}

#[derive(Parser)]
struct ModelsOpts {
    #[arg(long, default_value = "all")]
    tier: String,
    #[arg(long, default_value = "50.0")]
    threshold: f64,
    #[arg(short, long)]
    model: Option<String>,
    #[arg(short, long)]
    provider: Option<String>,
    #[arg(short, long, default_value = "20")]
    limit: usize,
}

#[derive(Parser)]
struct CostsOpts {
    #[arg(long, default_value = "hour")]
    interval: String,
    #[arg(short, long)]
    model: Option<String>,
    #[arg(short, long)]
    provider: Option<String>,
}

#[derive(Parser)]
struct TokensOpts {
    #[arg(value_name = "FOLDER", default_value = ".")]
    folder: PathBuf,
}

#[derive(Debug, Deserialize)]
struct Row {
    #[serde(rename = "cost_total")]
    cost_total: String,
    #[serde(rename = "cost_cache")]
    cost_cache: String,
    #[serde(rename = "tokens_prompt")]
    tokens_prompt: String,
    #[serde(rename = "tokens_completion")]
    tokens_completion: String,
    #[serde(rename = "tokens_reasoning")]
    tokens_reasoning: Option<String>,
    #[serde(rename = "tokens_cached")]
    tokens_cached: Option<String>,
    #[serde(rename = "generation_time_ms")]
    generation_time_ms: String,
    #[serde(rename = "time_to_first_token_ms")]
    time_to_first_token_ms: Option<String>,
    #[serde(rename = "provider_name")]
    provider_name: Option<String>,
    #[serde(rename = "model_permaslug")]
    model_permaslug: Option<String>,
    #[serde(rename = "app_name")]
    app_name: Option<String>,
    #[serde(rename = "cancelled")]
    cancelled: Option<String>,
    #[serde(rename = "streamed")]
    streamed: Option<String>,
    #[serde(rename = "finish_reason_normalized")]
    finish_reason_normalized: Option<String>,
    #[serde(rename = "created_at")]
    created_at: Option<String>,
}

fn parse_float(val: &str) -> f64 {
    val.parse().unwrap_or(0.0)
}

fn parse_int(val: &str) -> i64 {
    val.parse().unwrap_or(0)
}

fn fuzzy_match(text: &str, pattern: &str) -> bool {
    let text = text.to_lowercase();
    let pattern = pattern.to_lowercase();
    let mut i = 0;
    for c in pattern.chars() {
        if let Some(pos) = text[i..].find(c) {
            i += pos + 1;
        } else {
            return false;
        }
    }
    true
}

#[derive(Default)]
struct Summary {
    total_spend: f64,
    total_requests: i64,
    total_prompt_tokens: i64,
    total_completion_tokens: i64,
    total_reasoning_tokens: i64,
    total_cached_tokens: i64,
    total_generation_ms: i64,
    total_ttft_ms: i64,
    requests_with_cache: i64,
    cache_credits: f64,
    cancelled_requests: i64,
    streamed_requests: i64,
}

#[derive(Default)]
struct ProviderData {
    requests: i64,
    spend: f64,
    prompt: i64,
    completion: i64,
    cached: i64,
    gen_time: i64,
}

#[derive(Default)]
struct ModelData {
    requests: i64,
    spend: f64,
    cache_credits: f64,
    prompt_tokens: i64,
    completion_tokens: i64,
    cached_tokens: i64,
    gen_time_ms: i64,
    ttft_ms: i64,
}

impl ModelData {
    fn cost_per_m_completion(&self) -> f64 {
        if self.completion_tokens > 0 {
            self.spend / self.completion_tokens as f64 * 1_000_000.0
        } else {
            0.0
        }
    }

    fn tier(&self, threshold: f64) -> &'static str {
        if self.cost_per_m_completion() >= threshold {
            "large"
        } else {
            "small"
        }
    }
}

#[derive(Default)]
struct AppData {
    requests: i64,
    spend: f64,
}

fn process_rows(
    rows: &[Row],
) -> (
    Summary,
    HashMap<String, ProviderData>,
    HashMap<String, ModelData>,
    HashMap<String, AppData>,
    HashMap<String, i64>,
) {
    let mut summary = Summary::default();
    let mut providers: HashMap<String, ProviderData> = HashMap::new();
    let mut models: HashMap<String, ModelData> = HashMap::new();
    let mut apps: HashMap<String, AppData> = HashMap::new();
    let mut finish_reasons: HashMap<String, i64> = HashMap::new();

    for r in rows {
        let spend = parse_float(&r.cost_total);
        let cache_credit = if parse_float(&r.cost_cache) < 0.0 {
            parse_float(&r.cost_cache).abs()
        } else {
            0.0
        };
        let prompt = parse_int(&r.tokens_prompt);
        let completion = parse_int(&r.tokens_completion);
        let reasoning = parse_int(r.tokens_reasoning.as_deref().unwrap_or("0"));
        let cached = parse_int(r.tokens_cached.as_deref().unwrap_or("0"));
        let gen_time = parse_int(&r.generation_time_ms);
        let ttft = parse_int(r.time_to_first_token_ms.as_deref().unwrap_or("0"));

        let provider = r.provider_name.as_deref().unwrap_or("Unknown");
        let model = r.model_permaslug.as_deref().unwrap_or("Unknown");
        let app_name = r.app_name.as_deref().unwrap_or("unknown");

        summary.total_spend += spend;
        summary.total_requests += 1;
        summary.total_prompt_tokens += prompt;
        summary.total_completion_tokens += completion;
        summary.total_reasoning_tokens += reasoning;
        summary.total_cached_tokens += cached;
        summary.total_generation_ms += gen_time;
        summary.total_ttft_ms += ttft;
        summary.cache_credits += cache_credit;
        if cached > 0 {
            summary.requests_with_cache += 1;
        }
        if r.cancelled.as_deref().unwrap_or("").to_lowercase() == "true" {
            summary.cancelled_requests += 1;
        }
        if r.streamed.as_deref().unwrap_or("").to_lowercase() == "true" {
            summary.streamed_requests += 1;
        }

        let p = providers.entry(provider.to_string()).or_default();
        p.requests += 1;
        p.spend += spend;
        p.prompt += prompt;
        p.completion += completion;
        p.cached += cached;
        p.gen_time += gen_time;

        let m = models.entry(model.to_string()).or_default();
        m.requests += 1;
        m.spend += spend;
        m.cache_credits += cache_credit;
        m.prompt_tokens += prompt;
        m.completion_tokens += completion;
        m.cached_tokens += cached;
        m.gen_time_ms += gen_time;
        m.ttft_ms += ttft;

        let a = apps.entry(app_name.to_string()).or_default();
        a.requests += 1;
        a.spend += spend;

        if let Some(reason) = &r.finish_reason_normalized {
            *finish_reasons.entry(reason.clone()).or_insert(0) += 1;
        }
    }

    (summary, providers, models, apps, finish_reasons)
}

fn load_csv(path: &PathBuf) -> Result<Vec<Row>> {
    let file = File::open(path).context("Failed to open CSV file")?;
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_reader(file);

    let mut rows = Vec::new();
    for result in reader.deserialize() {
        let row: Row = result.context("Failed to parse CSV row")?;
        rows.push(row);
    }
    Ok(rows)
}

fn matches_filter(value: Option<&str>, pattern: &Option<String>) -> bool {
    pattern
        .as_ref()
        .is_none_or(|p| fuzzy_match(value.unwrap_or(""), p))
}

fn filter_rows(
    rows: Vec<Row>,
    model: &Option<String>,
    provider: &Option<String>,
    app: &Option<String>,
) -> Vec<Row> {
    rows.into_iter()
        .filter(|r| {
            matches_filter(r.model_permaslug.as_deref(), model)
                && matches_filter(r.provider_name.as_deref(), provider)
                && matches_filter(r.app_name.as_deref(), app)
        })
        .collect()
}

fn render_dashboard(rows: Vec<Row>, limit: usize) {
    let (summary, providers, models, apps, finish_reasons) = process_rows(&rows);

    let total_spend = summary.total_spend;
    let total_requests = summary.total_requests;
    let total_prompt_tokens = summary.total_prompt_tokens;
    let total_completion_tokens = summary.total_completion_tokens;
    let total_cached_tokens = summary.total_cached_tokens;
    let total_generation_ms = summary.total_generation_ms;
    let total_ttft_ms = summary.total_ttft_ms;
    let requests_with_cache = summary.requests_with_cache;
    let total_cache_savings = summary.cache_credits;
    let cancelled_requests = summary.cancelled_requests;
    let streamed_requests = summary.streamed_requests;

    let cache_hit_rate = if total_requests > 0 {
        (requests_with_cache as f64 / total_requests as f64) * 100.0
    } else {
        0.0
    };
    let avg_cost = if total_requests > 0 {
        total_spend / total_requests as f64
    } else {
        0.0
    };
    let avg_prompt = if total_requests > 0 {
        total_prompt_tokens as f64 / total_requests as f64
    } else {
        0.0
    };
    let avg_completion = if total_requests > 0 {
        total_completion_tokens as f64 / total_requests as f64
    } else {
        0.0
    };
    let avg_gen_time = if total_requests > 0 {
        total_generation_ms as f64 / total_requests as f64
    } else {
        0.0
    };
    let avg_ttft = if total_requests > 0 {
        total_ttft_ms as f64 / total_requests as f64
    } else {
        0.0
    };
    let cost_per_m_prompt = if total_prompt_tokens > 0 {
        total_spend / total_prompt_tokens as f64 * 1_000_000.0
    } else {
        0.0
    };
    let cost_per_m_completion = if total_completion_tokens > 0 {
        total_spend / total_completion_tokens as f64 * 1_000_000.0
    } else {
        0.0
    };
    let total_tokens = total_prompt_tokens + total_completion_tokens;
    let overall_cache_pct = if total_tokens > 0 {
        (total_cached_tokens as f64 / total_tokens as f64) * 100.0
    } else {
        0.0
    };

    println!("\n=== OPENROUTER USAGE DASHBOARD ===");
    println!("Total Requests: {}", total_requests);
    println!();

    println!("┌────┬────────────────────────────────┬──────────────────────┐");
    println!("│ #  │ Metric                         │ Value                │");
    println!("├────┼────────────────────────────────┼──────────────────────┤");
    println!(
        "│ 1  │ Total Spend                    │ ${:.4}             │",
        total_spend
    );
    println!(
        "│ 2  │ Total Requests                │ {:>18} │",
        total_requests
    );
    println!(
        "│ 3  │ Avg Cost/Request              │ ${:.4}             │",
        avg_cost
    );
    println!(
        "│ 4  │ Total Cache Savings           │ ${:.4}             │",
        total_cache_savings
    );
    println!(
        "│ 5  │ Net Cost (after cache)        │ ${:.4}             │",
        (total_spend - total_cache_savings).max(0.0)
    );
    println!(
        "│ 6  │ Total Prompt Tokens           │ {:>18} │",
        total_prompt_tokens
    );
    println!(
        "│ 7  │ Total Completion Tokens       │ {:>18} │",
        total_completion_tokens
    );
    println!(
        "│ 8  │ Total Cached Tokens           │ {:>18} │",
        total_cached_tokens
    );
    println!(
        "│ 9  │ Avg Prompt/Request            │ {:>18.0} │",
        avg_prompt
    );
    println!(
        "│ 10 │ Avg Completion/Request        │ {:>18.0} │",
        avg_completion
    );
    println!(
        "│ 11 │ Cache Hit Rate                │ {:>17.1}% │",
        cache_hit_rate
    );
    println!(
        "│ 12 │ Requests with Cache           │ {:>12} / {} │",
        requests_with_cache, total_requests
    );
    println!(
        "│ 13 │ Avg Generation Time           │ {:>14.0}ms │",
        avg_gen_time
    );
    println!(
        "│ 14 │ Avg Time to First Token       │ {:>14.0}ms │",
        avg_ttft
    );
    println!(
        "│ 15 │ Cost/1M Prompt Tokens         │ ${:>17.2} │",
        cost_per_m_prompt
    );
    println!(
        "│ 16 │ Cost/1M Completion Tokens     │ ${:>17.2} │",
        cost_per_m_completion
    );
    println!(
        "│ 17 │ Overall Cache %               │ {:>17.1}% │",
        overall_cache_pct
    );
    println!(
        "│ 18 │ Cancelled Requests            │ {:>18} │",
        cancelled_requests
    );
    println!(
        "│ 19 │ Streamed Requests             │ {:>18} │",
        streamed_requests
    );
    println!("└────┴────────────────────────────────┴──────────────────────┘");
    println!();

    println!("=== PROVIDER BREAKDOWN ===");
    let mut provider_items: Vec<_> = providers.iter().collect();
    provider_items.sort_by(|a, b| {
        b.1.spend
            .partial_cmp(&a.1.spend)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    println!(
        "{:<20} {:>10} {:>6} {:>6} {:>10} {:>7} {:>8}",
        "Provider", "Cost", "%", "Reqs", "Avg/Req", "Cache%", "AvgGen"
    );
    for (provider, data) in provider_items.iter().take(limit) {
        let pct = if total_spend > 0.0 {
            data.spend / total_spend * 100.0
        } else {
            0.0
        };
        let avg_cost = if data.requests > 0 {
            data.spend / data.requests as f64
        } else {
            0.0
        };
        let total_tok = data.prompt + data.completion;
        let cache_pct = if total_tok > 0 {
            (data.cached as f64 / total_tok as f64) * 100.0
        } else {
            0.0
        };
        let avg_gen = if data.requests > 0 {
            data.gen_time as f64 / data.requests as f64
        } else {
            0.0
        };
        println!(
            "{:<20} ${:>9.4} {:>5.1}% {:>6} ${:>9.4} {:>6.0}% {:>7.1}s",
            provider,
            data.spend,
            pct,
            data.requests,
            avg_cost,
            cache_pct,
            avg_gen / 1000.0
        );
    }
    println!();

    println!("=== MODEL BREAKDOWN ===");
    let mut model_items: Vec<_> = models.iter().collect();
    model_items.sort_by(|a, b| {
        b.1.spend
            .partial_cmp(&a.1.spend)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    println!(
        "{:<30} {:>10} {:>6} {:>10} {:>10} {:>7} {:>8}",
        "Model", "Cost", "Reqs", "Avg/Req", "$/1M Cmp", "Cache%", "AvgGen"
    );
    for (model, data) in model_items.iter().take(limit) {
        let reqs = data.requests;
        let avg_cost = if reqs > 0 {
            data.spend / reqs as f64
        } else {
            0.0
        };
        let cost_per_m = if data.completion_tokens > 0 {
            data.spend / data.completion_tokens as f64 * 1_000_000.0
        } else {
            0.0
        };
        let cache_pct = if data.prompt_tokens + data.completion_tokens > 0 {
            (data.cached_tokens as f64 / (data.prompt_tokens + data.completion_tokens) as f64)
                * 100.0
        } else {
            0.0
        };
        let avg_gen = if reqs > 0 {
            data.gen_time_ms as f64 / reqs as f64
        } else {
            0.0
        };
        println!(
            "{:<30} ${:>9.4} {:>6} ${:>9.4} ${:>9.2} {:>6.0}% {:>7.1}s",
            model,
            data.spend,
            reqs,
            avg_cost,
            cost_per_m,
            cache_pct,
            avg_gen / 1000.0
        );
    }
    println!();

    println!("=== APP BREAKDOWN ===");
    let mut app_items: Vec<_> = apps.iter().collect();
    app_items.sort_by(|a, b| {
        b.1.spend
            .partial_cmp(&a.1.spend)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    println!(
        "{:<18} {:>10} {:>6} {:>6} {:>10}",
        "App", "Cost", "%", "Reqs", "Avg/Req"
    );
    for (app_name, data) in app_items.iter().take(limit) {
        let pct = if total_spend > 0.0 {
            data.spend / total_spend * 100.0
        } else {
            0.0
        };
        let avg_cost = if data.requests > 0 {
            data.spend / data.requests as f64
        } else {
            0.0
        };
        println!(
            "{:<18} ${:>9.4} {:>5.1}% {:>6} ${:>9.4}",
            app_name, data.spend, pct, data.requests, avg_cost
        );
    }
    println!();

    println!("=== FINISH REASONS ===");
    let mut reason_items: Vec<_> = finish_reasons.iter().collect();
    reason_items.sort_by(|a, b| b.1.cmp(a.1));
    println!("{:<20} {:>8} {:>6}", "Reason", "Count", "%");
    for (reason, count) in reason_items {
        let pct = if total_requests > 0 {
            (*count as f64 / total_requests as f64) * 100.0
        } else {
            0.0
        };
        println!("{:<20} {:>8} {:>5.1}%", reason, count, pct);
    }
}

fn render_models(rows: Vec<Row>, opts: &ModelsOpts) -> Result<()> {
    let (_, _, models, _, _) = process_rows(&rows);
    let tier = opts.tier.trim().to_lowercase();

    if !matches!(tier.as_str(), "all" | "large" | "small") {
        anyhow::bail!("tier must be one of: all, large, small");
    }

    println!("\n=== MODEL COST ANALYSIS ===");
    println!(
        "{:<30} {:>10} {:>6} {:>11} {:>10} {:>10} {:>7}",
        "Model", "Gross $", "Reqs", "Gross/req", "$/1M Pmt", "$/1M Cmp", "Cache%"
    );

    let mut model_items: Vec<_> = models.iter().collect();
    model_items.sort_by(|a, b| {
        b.1.spend
            .partial_cmp(&a.1.spend)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    for (model, data) in model_items
        .into_iter()
        .filter(|(model, data)| {
            matches_filter(Some(model.as_str()), &opts.model)
                && matches_filter(None, &None::<String>)
                && (tier == "all" || data.tier(opts.threshold) == tier)
        })
        .take(opts.limit)
    {
        let reqs = data.requests;
        if reqs == 0 {
            continue;
        }

        let gross_per_req = data.spend / reqs as f64;
        let cost_per_m_prompt = if data.prompt_tokens > 0 {
            data.spend / data.prompt_tokens as f64 * 1_000_000.0
        } else {
            0.0
        };
        let cost_per_m_completion = if data.completion_tokens > 0 {
            data.spend / data.completion_tokens as f64 * 1_000_000.0
        } else {
            0.0
        };
        let cache_pct = if data.prompt_tokens + data.completion_tokens > 0 {
            (data.cached_tokens as f64 / (data.prompt_tokens + data.completion_tokens) as f64)
                * 100.0
        } else {
            0.0
        };

        println!(
            "{:<30} ${:>9.4} {:>6} ${:>10.4} ${:>9.2} ${:>9.2} {:>6.0}%",
            model,
            data.spend,
            reqs,
            gross_per_req,
            cost_per_m_prompt,
            cost_per_m_completion,
            cache_pct
        );
    }

    Ok(())
}

fn bucket_key(ts: &str, interval: &str) -> Option<String> {
    let trimmed = ts.trim();
    match interval {
        "minute" if trimmed.len() >= 16 => Some(trimmed[0..16].to_string()),
        "day" if trimmed.len() >= 10 => Some(trimmed[0..10].to_string()),
        "hour" if trimmed.len() >= 13 => Some(trimmed[0..13].to_string()),
        _ => None,
    }
}

fn render_costs_over_time(rows: Vec<Row>, opts: &CostsOpts) -> Result<()> {
    let mut time_buckets: BTreeMap<String, (f64, i64, f64, i64)> = BTreeMap::new();
    let interval = opts.interval.trim().to_lowercase();

    if !matches!(interval.as_str(), "hour" | "day" | "minute") {
        anyhow::bail!("interval must be one of: hour, day, minute");
    }

    for r in &rows {
        let ts = r.created_at.as_deref().unwrap_or("");
        let Some(key) = bucket_key(ts, &interval) else {
            continue;
        };

        let spend = parse_float(&r.cost_total);
        let cache = if parse_float(&r.cost_cache) < 0.0 {
            parse_float(&r.cost_cache).abs()
        } else {
            0.0
        };
        let tokens = parse_int(&r.tokens_prompt) + parse_int(&r.tokens_completion);

        let entry = time_buckets.entry(key).or_insert((0.0, 0, 0.0, 0));
        entry.0 += spend;
        entry.1 += 1;
        entry.2 += cache;
        entry.3 += tokens;
    }

    println!("\n=== COST OVER TIME ===");
    println!(
        "{:<20} {:>12} {:>12} {:>12} {:>15}",
        "Time", "Spend", "Reqs", "Saved", "Tokens"
    );

    for (time, (spend, requests, cached, tokens)) in &time_buckets {
        println!(
            "{:<20} ${:>11.4} {:>12} ${:>11.4} {:>15}",
            time, spend, requests, cached, tokens
        );
    }

    Ok(())
}
fn count_tokens_in_file(path: &Path, encoding: &CoreBPE) -> Option<usize> {
    let content = std::fs::read_to_string(path).ok()?;
    let tokens = encoding.encode_ordinary(&content).len();
    Some(tokens)
}

fn render_tokens(opts: &TokensOpts) -> Result<()> {
    let encoding = tiktoken_rs::cl100k_base_singleton();

    let folder = &opts.folder;
    let mut total = 0;
    let mut file_count = 0;

    let mut entries: Vec<_> = WalkDir::new(folder)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .collect();
    entries.sort_by_key(|e| e.path().to_path_buf());

    for entry in entries {
        let path = entry.path();
        if let Some(tokens) = count_tokens_in_file(path, &encoding) {
            let rel = path.strip_prefix(folder).unwrap_or(path);
            println!("{:>8}  {}", tokens, rel.display());
            total += tokens;
            file_count += 1;
        }
    }

    println!("\n{:>8}  TOTAL ({} files)", total, file_count);
    Ok(())
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Tokens(opts) => {
            render_tokens(&opts)?;
        }
        _ => {
            let rows = load_csv(&cli.file)?;

            if rows.is_empty() {
                println!("No data found in CSV file");
                return Ok(());
            }

            match cli.command {
                Commands::Dashboard(opts) => {
                    let filtered = filter_rows(rows, &opts.model, &opts.provider, &opts.app);
                    render_dashboard(filtered, opts.limit);
                }
                Commands::Models(opts) => {
                    let filtered = filter_rows(rows, &opts.model, &opts.provider, &None);
                    render_models(filtered, &opts)?;
                }
                Commands::Costs(opts) => {
                    let filtered = filter_rows(rows, &opts.model, &opts.provider, &None);
                    render_costs_over_time(filtered, &opts)?;
                }
                Commands::Tokens(_) => unreachable!(),
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_row(
        created_at: &str,
        provider: &str,
        model: &str,
        app: &str,
        cost_total: &str,
        cost_cache: &str,
        prompt: &str,
        completion: &str,
    ) -> Row {
        Row {
            cost_total: cost_total.to_string(),
            cost_cache: cost_cache.to_string(),
            tokens_prompt: prompt.to_string(),
            tokens_completion: completion.to_string(),
            tokens_reasoning: Some("0".to_string()),
            tokens_cached: Some("0".to_string()),
            generation_time_ms: "1000".to_string(),
            time_to_first_token_ms: Some("100".to_string()),
            provider_name: Some(provider.to_string()),
            model_permaslug: Some(model.to_string()),
            app_name: Some(app.to_string()),
            cancelled: Some("false".to_string()),
            streamed: Some("true".to_string()),
            finish_reason_normalized: Some("stop".to_string()),
            created_at: Some(created_at.to_string()),
        }
    }

    #[test]
    fn filter_rows_applies_fuzzy_filters() {
        let rows = vec![
            sample_row(
                "2026-03-30 02:37:51.271",
                "Minimax",
                "minimax/minimax-m2.7-20260318",
                "vscode",
                "0.1",
                "-0.01",
                "10",
                "20",
            ),
            sample_row(
                "2026-03-30 03:37:51.271",
                "AtlasCloud",
                "openai/gpt-5",
                "opencode",
                "0.2",
                "0",
                "10",
                "20",
            ),
        ];

        let filtered = filter_rows(
            rows,
            &Some("m27".to_string()),
            &Some("mini".to_string()),
            &Some("vsc".to_string()),
        );

        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].provider_name.as_deref(), Some("Minimax"));
    }

    #[test]
    fn model_tier_uses_completion_cost_threshold() {
        let data = ModelData {
            requests: 1,
            spend: 0.6,
            cache_credits: 0.0,
            prompt_tokens: 1000,
            completion_tokens: 10_000,
            cached_tokens: 0,
            gen_time_ms: 0,
            ttft_ms: 0,
        };

        assert_eq!(data.tier(50.0), "large");
        assert_eq!(data.tier(70.0), "small");
    }

    #[test]
    fn bucket_key_respects_interval() {
        let ts = "2026-03-30 02:37:51.271";

        assert_eq!(bucket_key(ts, "hour").as_deref(), Some("2026-03-30 02"));
        assert_eq!(bucket_key(ts, "day").as_deref(), Some("2026-03-30"));
        assert_eq!(
            bucket_key(ts, "minute").as_deref(),
            Some("2026-03-30 02:37")
        );
    }
}
