use costkit::analysis::{build_costs_report, build_dashboard_report};
use costkit::schema::load_csv;
use std::path::Path;

#[test]
fn openrouter_fixture_loads_and_uses_api_key_fallback() {
    let rows = load_csv(Path::new("tests/fixtures/openrouter_activity_fixture.csv")).unwrap();
    assert_eq!(rows.len(), 3);

    let report = build_dashboard_report(&rows, 10);
    assert_eq!(report.summary.total_requests, 3);
    assert_eq!(report.app_breakdown[0].app, "nexus.dev");
    assert_eq!(report.finish_reasons.len(), 2);
}

#[test]
fn openrouter_fixture_builds_daily_cost_report() {
    let rows = load_csv(Path::new("tests/fixtures/openrouter_activity_fixture.csv")).unwrap();
    let report = build_costs_report(&rows, "day").unwrap();

    assert_eq!(report.rows.len(), 1);
    assert_eq!(report.rows[0].time, "2026-06-15");
    assert_eq!(report.rows[0].requests, 3);
    assert_eq!(report.rows[0].tokens, 83_878);
}

#[test]
fn invalid_openrouter_fixture_fails_validation() {
    let error = load_csv(Path::new("tests/fixtures/openrouter_activity_invalid.csv")).unwrap_err();
    let message = format!("{error:#}");
    assert!(message.contains("row 2"));
    assert!(message.contains("invalid decimal value"));
}
