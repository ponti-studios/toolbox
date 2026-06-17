use crate::schema::ActivityRow;
use anyhow::{bail, Result};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};

#[derive(Copy, Clone)]
pub struct Filters<'a> {
    pub model: Option<&'a str>,
    pub provider: Option<&'a str>,
    pub app: Option<&'a str>,
}

impl<'a> Filters<'a> {
    pub fn new(model: Option<&'a str>, provider: Option<&'a str>, app: Option<&'a str>) -> Self {
        Self {
            model,
            provider,
            app,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct DashboardReport {
    pub summary: DashboardSummary,
    pub provider_breakdown: Vec<ProviderReport>,
    pub model_breakdown: Vec<ModelReport>,
    pub app_breakdown: Vec<AppReport>,
    pub finish_reasons: Vec<FinishReasonReport>,
}

#[derive(Debug, Serialize)]
pub struct DashboardSummary {
    pub total_spend: f64,
    pub total_requests: i64,
    pub average_cost_per_request: f64,
    pub total_cache_savings: f64,
    pub net_cost_after_cache: f64,
    pub total_prompt_tokens: i64,
    pub total_completion_tokens: i64,
    pub total_reasoning_tokens: i64,
    pub total_cached_tokens: i64,
    pub average_prompt_tokens_per_request: f64,
    pub average_completion_tokens_per_request: f64,
    pub cache_hit_rate_percent: f64,
    pub requests_with_cache: i64,
    pub average_generation_time_ms: f64,
    pub average_time_to_first_token_ms: f64,
    pub cost_per_million_prompt_tokens: f64,
    pub cost_per_million_completion_tokens: f64,
    pub overall_cache_percent: f64,
    pub cancelled_requests: i64,
    pub streamed_requests: i64,
}

#[derive(Debug, Serialize)]
pub struct ProviderReport {
    pub provider: String,
    pub cost: f64,
    pub spend_percent: f64,
    pub requests: i64,
    pub average_cost_per_request: f64,
    pub cache_percent: f64,
    pub average_generation_time_seconds: f64,
}

#[derive(Debug, Serialize)]
pub struct ModelReport {
    pub model: String,
    pub cost: f64,
    pub requests: i64,
    pub average_cost_per_request: f64,
    pub cost_per_million_completion_tokens: f64,
    pub cache_percent: f64,
    pub average_generation_time_seconds: f64,
}

#[derive(Debug, Serialize)]
pub struct AppReport {
    pub app: String,
    pub cost: f64,
    pub spend_percent: f64,
    pub requests: i64,
    pub average_cost_per_request: f64,
}

#[derive(Debug, Serialize)]
pub struct FinishReasonReport {
    pub reason: String,
    pub count: i64,
    pub percent: f64,
}

#[derive(Debug, Serialize)]
pub struct ModelsReport {
    pub tier: String,
    pub threshold: f64,
    pub rows: Vec<ModelCostReport>,
}

#[derive(Debug, Serialize)]
pub struct ModelCostReport {
    pub model: String,
    pub gross_cost: f64,
    pub requests: i64,
    pub gross_cost_per_request: f64,
    pub cost_per_million_prompt_tokens: f64,
    pub cost_per_million_completion_tokens: f64,
    pub cache_percent: f64,
    pub tier: String,
}

#[derive(Debug, Serialize)]
pub struct CostsReport {
    pub interval: String,
    pub rows: Vec<TimeCostReport>,
}

#[derive(Debug, Serialize)]
pub struct TimeCostReport {
    pub time: String,
    pub spend: f64,
    pub requests: i64,
    pub saved: f64,
    pub tokens: i64,
}

#[derive(Default)]
struct SummaryAccumulator {
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
struct ProviderAccumulator {
    requests: i64,
    spend: f64,
    prompt: i64,
    completion: i64,
    cached: i64,
    generation_time_ms: i64,
}

#[derive(Default)]
struct ModelAccumulator {
    requests: i64,
    spend: f64,
    prompt_tokens: i64,
    completion_tokens: i64,
    cached_tokens: i64,
    generation_time_ms: i64,
}

impl ModelAccumulator {
    fn cost_per_million_completion_tokens(&self) -> f64 {
        ratio_cost_per_million(self.spend, self.completion_tokens)
    }

    fn tier(&self, threshold: f64) -> &'static str {
        if self.cost_per_million_completion_tokens() >= threshold {
            "large"
        } else {
            "small"
        }
    }
}

#[derive(Default)]
struct AppAccumulator {
    requests: i64,
    spend: f64,
}

pub fn filter_rows(rows: &[ActivityRow], filters: Filters<'_>) -> Vec<ActivityRow> {
    rows.iter()
        .filter(|row| {
            matches_filter(row.model_label(), filters.model)
                && matches_filter(row.provider_label(), filters.provider)
                && matches_filter(row.app_label(), filters.app)
        })
        .cloned()
        .collect()
}

pub fn build_dashboard_report(rows: &[ActivityRow], limit: usize) -> DashboardReport {
    let (summary, providers, models, apps, finish_reasons) = aggregate(rows);

    let provider_breakdown = sorted_providers(&providers)
        .into_iter()
        .take(limit)
        .map(|(provider, data)| ProviderReport {
            provider,
            cost: data.spend,
            spend_percent: percentage(data.spend, summary.total_spend),
            requests: data.requests,
            average_cost_per_request: ratio(data.spend, data.requests),
            cache_percent: percentage_i64(data.cached, data.prompt + data.completion),
            average_generation_time_seconds: ratio(data.generation_time_ms as f64, data.requests)
                / 1000.0,
        })
        .collect();

    let model_breakdown = sorted_models(&models)
        .into_iter()
        .take(limit)
        .map(|(model, data)| ModelReport {
            model,
            cost: data.spend,
            requests: data.requests,
            average_cost_per_request: ratio(data.spend, data.requests),
            cost_per_million_completion_tokens: data.cost_per_million_completion_tokens(),
            cache_percent: percentage_i64(
                data.cached_tokens,
                data.prompt_tokens + data.completion_tokens,
            ),
            average_generation_time_seconds: ratio(data.generation_time_ms as f64, data.requests)
                / 1000.0,
        })
        .collect();

    let app_breakdown = sorted_apps(&apps)
        .into_iter()
        .take(limit)
        .map(|(app, data)| AppReport {
            app,
            cost: data.spend,
            spend_percent: percentage(data.spend, summary.total_spend),
            requests: data.requests,
            average_cost_per_request: ratio(data.spend, data.requests),
        })
        .collect();

    let finish_reasons = sorted_finish_reasons(&finish_reasons)
        .into_iter()
        .map(|(reason, count)| FinishReasonReport {
            reason,
            count,
            percent: percentage(count as f64, summary.total_requests as f64),
        })
        .collect();

    DashboardReport {
        summary: DashboardSummary {
            total_spend: summary.total_spend,
            total_requests: summary.total_requests,
            average_cost_per_request: ratio(summary.total_spend, summary.total_requests),
            total_cache_savings: summary.cache_credits,
            net_cost_after_cache: (summary.total_spend - summary.cache_credits).max(0.0),
            total_prompt_tokens: summary.total_prompt_tokens,
            total_completion_tokens: summary.total_completion_tokens,
            total_reasoning_tokens: summary.total_reasoning_tokens,
            total_cached_tokens: summary.total_cached_tokens,
            average_prompt_tokens_per_request: ratio(
                summary.total_prompt_tokens as f64,
                summary.total_requests,
            ),
            average_completion_tokens_per_request: ratio(
                summary.total_completion_tokens as f64,
                summary.total_requests,
            ),
            cache_hit_rate_percent: percentage(
                summary.requests_with_cache as f64,
                summary.total_requests as f64,
            ),
            requests_with_cache: summary.requests_with_cache,
            average_generation_time_ms: ratio(
                summary.total_generation_ms as f64,
                summary.total_requests,
            ),
            average_time_to_first_token_ms: ratio(
                summary.total_ttft_ms as f64,
                summary.total_requests,
            ),
            cost_per_million_prompt_tokens: ratio_cost_per_million(
                summary.total_spend,
                summary.total_prompt_tokens,
            ),
            cost_per_million_completion_tokens: ratio_cost_per_million(
                summary.total_spend,
                summary.total_completion_tokens,
            ),
            overall_cache_percent: percentage_i64(
                summary.total_cached_tokens,
                summary.total_prompt_tokens + summary.total_completion_tokens,
            ),
            cancelled_requests: summary.cancelled_requests,
            streamed_requests: summary.streamed_requests,
        },
        provider_breakdown,
        model_breakdown,
        app_breakdown,
        finish_reasons,
    }
}

pub fn build_models_report(
    rows: &[ActivityRow],
    limit: usize,
    tier: &str,
    threshold: f64,
) -> Result<ModelsReport> {
    let normalized_tier = tier.trim().to_lowercase();
    if !matches!(normalized_tier.as_str(), "all" | "large" | "small") {
        bail!("tier must be one of: all, large, small");
    }

    let (_, _, models, _, _) = aggregate(rows);
    let rows = sorted_models(&models)
        .into_iter()
        .filter(|(_, data)| normalized_tier == "all" || data.tier(threshold) == normalized_tier)
        .take(limit)
        .map(|(model, data)| ModelCostReport {
            model,
            gross_cost: data.spend,
            requests: data.requests,
            gross_cost_per_request: ratio(data.spend, data.requests),
            cost_per_million_prompt_tokens: ratio_cost_per_million(data.spend, data.prompt_tokens),
            cost_per_million_completion_tokens: data.cost_per_million_completion_tokens(),
            cache_percent: percentage_i64(
                data.cached_tokens,
                data.prompt_tokens + data.completion_tokens,
            ),
            tier: data.tier(threshold).to_string(),
        })
        .collect();

    Ok(ModelsReport {
        tier: normalized_tier,
        threshold,
        rows,
    })
}

pub fn build_costs_report(rows: &[ActivityRow], interval: &str) -> Result<CostsReport> {
    let normalized_interval = interval.trim().to_lowercase();
    if !matches!(normalized_interval.as_str(), "hour" | "day" | "minute") {
        bail!("interval must be one of: hour, day, minute");
    }

    let mut buckets: BTreeMap<String, TimeCostReport> = BTreeMap::new();

    for row in rows {
        let Some(key) = bucket_key(&row.created_at, &normalized_interval) else {
            continue;
        };

        let entry = buckets.entry(key.clone()).or_insert(TimeCostReport {
            time: key,
            spend: 0.0,
            requests: 0,
            saved: 0.0,
            tokens: 0,
        });
        entry.spend += row.cost_total;
        entry.requests += 1;
        entry.saved += row.cache_credit();
        entry.tokens += row.tokens_prompt + row.tokens_completion;
    }

    Ok(CostsReport {
        interval: normalized_interval,
        rows: buckets.into_values().collect(),
    })
}

pub fn bucket_key(ts: &str, interval: &str) -> Option<String> {
    let trimmed = ts.trim();
    match interval {
        "minute" if trimmed.len() >= 16 => Some(trimmed[0..16].to_string()),
        "day" if trimmed.len() >= 10 => Some(trimmed[0..10].to_string()),
        "hour" if trimmed.len() >= 13 => Some(trimmed[0..13].to_string()),
        _ => None,
    }
}

fn aggregate(rows: &[ActivityRow]) -> AggregateState {
    let mut summary = SummaryAccumulator::default();
    let mut providers = HashMap::new();
    let mut models = HashMap::new();
    let mut apps = HashMap::new();
    let mut finish_reasons = HashMap::new();

    for row in rows {
        summary.total_spend += row.cost_total;
        summary.total_requests += 1;
        summary.total_prompt_tokens += row.tokens_prompt;
        summary.total_completion_tokens += row.tokens_completion;
        summary.total_reasoning_tokens += row.tokens_reasoning;
        summary.total_cached_tokens += row.tokens_cached;
        summary.total_generation_ms += row.generation_time_ms;
        summary.total_ttft_ms += row.time_to_first_token_ms;
        summary.cache_credits += row.cache_credit();
        if row.tokens_cached > 0 {
            summary.requests_with_cache += 1;
        }
        if row.cancelled {
            summary.cancelled_requests += 1;
        }
        if row.streamed {
            summary.streamed_requests += 1;
        }

        let provider = providers
            .entry(row.provider_label().to_string())
            .or_insert_with(ProviderAccumulator::default);
        provider.requests += 1;
        provider.spend += row.cost_total;
        provider.prompt += row.tokens_prompt;
        provider.completion += row.tokens_completion;
        provider.cached += row.tokens_cached;
        provider.generation_time_ms += row.generation_time_ms;

        let model = models
            .entry(row.model_label().to_string())
            .or_insert_with(ModelAccumulator::default);
        model.requests += 1;
        model.spend += row.cost_total;
        model.prompt_tokens += row.tokens_prompt;
        model.completion_tokens += row.tokens_completion;
        model.cached_tokens += row.tokens_cached;
        model.generation_time_ms += row.generation_time_ms;

        let app = apps
            .entry(row.app_label().to_string())
            .or_insert_with(AppAccumulator::default);
        app.requests += 1;
        app.spend += row.cost_total;

        if let Some(reason) = &row.finish_reason_normalized {
            *finish_reasons.entry(reason.clone()).or_insert(0) += 1;
        }
    }

    (summary, providers, models, apps, finish_reasons)
}

type AggregateState = (
    SummaryAccumulator,
    HashMap<String, ProviderAccumulator>,
    HashMap<String, ModelAccumulator>,
    HashMap<String, AppAccumulator>,
    HashMap<String, i64>,
);

fn fuzzy_match(text: &str, pattern: &str) -> bool {
    let text = text.to_lowercase();
    let pattern = pattern.to_lowercase();
    let mut index = 0;
    for character in pattern.chars() {
        if let Some(position) = text[index..].find(character) {
            index += position + 1;
        } else {
            return false;
        }
    }
    true
}

fn matches_filter(value: &str, pattern: Option<&str>) -> bool {
    pattern.is_none_or(|candidate| fuzzy_match(value, candidate))
}

fn sorted_providers(
    providers: &HashMap<String, ProviderAccumulator>,
) -> Vec<(String, &ProviderAccumulator)> {
    let mut items: Vec<_> = providers.iter().map(|(k, v)| (k.clone(), v)).collect();
    items.sort_by(|a, b| {
        b.1.spend
            .partial_cmp(&a.1.spend)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    items
}

fn sorted_models(models: &HashMap<String, ModelAccumulator>) -> Vec<(String, &ModelAccumulator)> {
    let mut items: Vec<_> = models.iter().map(|(k, v)| (k.clone(), v)).collect();
    items.sort_by(|a, b| {
        b.1.spend
            .partial_cmp(&a.1.spend)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    items
}

fn sorted_apps(apps: &HashMap<String, AppAccumulator>) -> Vec<(String, &AppAccumulator)> {
    let mut items: Vec<_> = apps.iter().map(|(k, v)| (k.clone(), v)).collect();
    items.sort_by(|a, b| {
        b.1.spend
            .partial_cmp(&a.1.spend)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    items
}

fn sorted_finish_reasons(reasons: &HashMap<String, i64>) -> Vec<(String, i64)> {
    let mut items: Vec<_> = reasons.iter().map(|(k, v)| (k.clone(), *v)).collect();
    items.sort_by_key(|item| std::cmp::Reverse(item.1));
    items
}

fn ratio(numerator: f64, denominator: i64) -> f64 {
    if denominator > 0 {
        numerator / denominator as f64
    } else {
        0.0
    }
}

fn ratio_cost_per_million(cost: f64, tokens: i64) -> f64 {
    if tokens > 0 {
        cost / tokens as f64 * 1_000_000.0
    } else {
        0.0
    }
}

fn percentage(numerator: f64, denominator: f64) -> f64 {
    if denominator > 0.0 {
        numerator / denominator * 100.0
    } else {
        0.0
    }
}

fn percentage_i64(numerator: i64, denominator: i64) -> f64 {
    percentage(numerator as f64, denominator as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filter_rows_applies_fuzzy_filters() {
        let rows = vec![
            ActivityRow {
                created_at: "2026-03-30 02:37:51.271".to_string(),
                cost_total: 0.1,
                cost_cache: -0.01,
                tokens_prompt: 10,
                tokens_completion: 20,
                tokens_reasoning: 0,
                tokens_cached: 0,
                generation_time_ms: 1000,
                time_to_first_token_ms: 100,
                provider_name: Some("Minimax".to_string()),
                model_permaslug: Some("minimax/minimax-m2.7-20260318".to_string()),
                app_name: Some("vscode".to_string()),
                api_key_name: None,
                cancelled: false,
                streamed: true,
                finish_reason_normalized: Some("stop".to_string()),
            },
            ActivityRow {
                created_at: "2026-03-30 03:37:51.271".to_string(),
                cost_total: 0.2,
                cost_cache: 0.0,
                tokens_prompt: 10,
                tokens_completion: 20,
                tokens_reasoning: 0,
                tokens_cached: 0,
                generation_time_ms: 1000,
                time_to_first_token_ms: 100,
                provider_name: Some("AtlasCloud".to_string()),
                model_permaslug: Some("openai/gpt-5".to_string()),
                app_name: Some("opencode".to_string()),
                api_key_name: None,
                cancelled: false,
                streamed: true,
                finish_reason_normalized: Some("stop".to_string()),
            },
        ];

        let filtered = filter_rows(&rows, Filters::new(Some("m27"), Some("mini"), Some("vsc")));
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].provider_name.as_deref(), Some("Minimax"));
    }

    #[test]
    fn model_tier_uses_completion_cost_threshold() {
        let data = ModelAccumulator {
            requests: 1,
            spend: 0.6,
            prompt_tokens: 1000,
            completion_tokens: 10_000,
            cached_tokens: 0,
            generation_time_ms: 0,
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
