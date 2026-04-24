#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
filekit_bin="${FILEKIT_BIN:-${repo_root}/target/debug/filekit}"

artifact_root="${FILEKIT_BIZ_ARTIFACT_DIR:-${repo_root}/.tmp/filekit-biz-smoke}"
run_id="$(date +%Y%m%d-%H%M%S)"
tmp_dir="${artifact_root}/${run_id}"
mkdir -p "$tmp_dir"

if [[ ! -x "$filekit_bin" ]]; then
    echo "error: filekit binary not found or not executable: $filekit_bin" >&2
    echo "hint: build it first with 'cargo build -p filekit' or set FILEKIT_BIN" >&2
    exit 1
fi

export FILEKIT_DB="$tmp_dir/filekit.sqlite3"

run_log="$tmp_dir/run.txt"

{
    printf 'filekit binary: %s\n' "$filekit_bin"
    printf 'sqlite db: %s\n' "$FILEKIT_DB"
    printf '\n'
} > "$run_log"

log_command() {
    local label="$1"
    shift

    local output status
    if output="$("$filekit_bin" "$@" 2>&1)"; then
        status=0
    else
        status=$?
    fi

    {
        printf '[%s]\n' "$label"
        printf '$ %q' "$filekit_bin"
        for arg in "$@"; do
            printf ' %q' "$arg"
        done
        printf '\n%s\n' "$output"
        if [[ $status -ne 0 ]]; then
            printf '[exit code: %s]\n' "$status"
        fi
        printf '\n'
    } >> "$run_log"

    printf '%s' "$output"
    return "$status"
}

expect_contains() {
    local haystack="$1"
    local needle="$2"
    local label="$3"
    if [[ "$haystack" != *"$needle"* ]]; then
        echo "error: expected $label to contain: $needle" >&2
        exit 1
    fi
}

log_command "01-init" biz init >/dev/null

knobs_output="$(log_command "02-knobs" biz knobs --model saas)"
expect_contains "$knobs_output" "starting_customers" "biz knobs output"
expect_contains "$knobs_output" "monthly_new_customers" "biz knobs output"
expect_contains "$knobs_output" "starting_cash" "biz knobs output"

log_command "03-scenario-create-base" biz scenario create --model saas --name base --baseline >/dev/null
log_command "04-scenario-set-base" biz scenario set base \
    --set starting_customers=15 \
    --set monthly_new_customers=20 \
    --set monthly_churn_rate=0.05 \
    --set monthly_price=10 \
    --set fixed_monthly_cost=5000 \
    --set monthly_marketing_spend=2000 >/dev/null

base_list_output="$(log_command "05-scenario-list" biz scenario list)"
expect_contains "$base_list_output" "base" "scenario list output"
expect_contains "$base_list_output" "yes" "scenario list output"

base_show_output="$(log_command "06-scenario-show-base" biz scenario show base)"
expect_contains "$base_show_output" "starting_customers" "scenario show output"
expect_contains "$base_show_output" "15" "scenario show output"
expect_contains "$base_show_output" "monthly_marketing_spend" "scenario show output"

log_command "07-scenario-clone-aggressive" biz scenario clone base --name aggressive >/dev/null
log_command "08-scenario-set-aggressive" biz scenario set aggressive \
    --set monthly_new_customers=40 \
    --set monthly_marketing_spend=4000 >/dev/null

aggressive_show_output="$(log_command "09-scenario-show-aggressive" biz scenario show aggressive)"
expect_contains "$aggressive_show_output" "monthly_new_customers" "cloned scenario output"
expect_contains "$aggressive_show_output" "40" "cloned scenario output"
expect_contains "$aggressive_show_output" "monthly_marketing_spend" "cloned scenario output"
expect_contains "$aggressive_show_output" "4000" "cloned scenario output"

run_output="$(log_command "10-run-aggressive" biz run aggressive --months 24)"
expect_contains "$run_output" "Scenario" "biz run output"
expect_contains "$run_output" "Ending cash" "biz run output"
expect_contains "$run_output" "Runway month" "biz run output"

compare_output="$(log_command "11-compare-base-aggressive" biz compare base aggressive --months 24)"
expect_contains "$compare_output" "Metric" "biz compare output"
expect_contains "$compare_output" "Ending MRR" "biz compare output"
expect_contains "$compare_output" "Delta" "biz compare output"

if log_command "12-invalid-knob" biz scenario set aggressive --set not_a_knob=1 >/dev/null 2>&1; then
    echo "error: expected unknown knob assignment to fail" >&2
    exit 1
fi

if log_command "13-invalid-assignment" biz scenario set aggressive --set malformed >/dev/null 2>&1; then
    echo "error: expected malformed assignment to fail" >&2
    exit 1
fi

python3 - <<'PY' "$FILEKIT_DB"
import sqlite3
import sys

conn = sqlite3.connect(sys.argv[1])
cur = conn.cursor()
cur.execute("select count(*) from business_scenario_runs")
count = cur.fetchone()[0]
if count < 1:
    raise SystemExit("expected at least one stored business_scenario_runs row")
PY

printf 'wrote run log to %s\n' "$run_log"
echo "filekit biz smoke test passed"
