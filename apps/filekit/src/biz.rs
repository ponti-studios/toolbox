use anyhow::{anyhow, bail, Context, Result};
use clap::Parser;
use rusqlite::{params, Connection};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(clap::Subcommand)]
pub enum BizCmd {
    /// Initialize business modeling schema and seed the default SaaS model
    Init(InitOpts),
    /// List knobs for a business model
    Knobs(KnobsOpts),
    /// Manage scenarios
    Scenario {
        #[command(subcommand)]
        cmd: ScenarioCmd,
    },
    /// Run a scenario and save computed outputs
    Run(RunOpts),
    /// Compare two scenarios over the same horizon
    Compare(CompareOpts),
}

#[derive(Parser)]
pub struct InitOpts {
    #[arg(short, long)]
    pub db: Option<PathBuf>,
}

#[derive(Parser)]
pub struct KnobsOpts {
    #[arg(short, long)]
    pub db: Option<PathBuf>,
    #[arg(long, default_value = "saas")]
    pub model: String,
}

#[derive(clap::Subcommand)]
pub enum ScenarioCmd {
    Create(CreateScenarioOpts),
    Set(SetScenarioOpts),
    List(ListScenarioOpts),
    Show(ShowScenarioOpts),
    Clone(CloneScenarioOpts),
}

#[derive(Parser)]
pub struct CreateScenarioOpts {
    #[arg(short, long)]
    pub db: Option<PathBuf>,
    #[arg(long, default_value = "saas")]
    pub model: String,
    #[arg(long)]
    pub name: String,
    #[arg(long)]
    pub description: Option<String>,
    #[arg(long)]
    pub baseline: bool,
    #[arg(long)]
    pub from: Option<String>,
}

#[derive(Parser)]
pub struct SetScenarioOpts {
    #[arg(short, long)]
    pub db: Option<PathBuf>,
    /// Scenario name
    pub scenario: String,
    /// One or more assignments like monthly_price=29 or monthly_churn_rate=0.03
    #[arg(long = "set", required = true)]
    pub assignments: Vec<String>,
}

#[derive(Parser)]
pub struct ListScenarioOpts {
    #[arg(short, long)]
    pub db: Option<PathBuf>,
    #[arg(long)]
    pub model: Option<String>,
}

#[derive(Parser)]
pub struct ShowScenarioOpts {
    #[arg(short, long)]
    pub db: Option<PathBuf>,
    pub scenario: String,
}

#[derive(Parser)]
pub struct CloneScenarioOpts {
    #[arg(short, long)]
    pub db: Option<PathBuf>,
    pub source: String,
    #[arg(long)]
    pub name: String,
    #[arg(long)]
    pub description: Option<String>,
}

#[derive(Parser)]
pub struct RunOpts {
    #[arg(short, long)]
    pub db: Option<PathBuf>,
    pub scenario: String,
    #[arg(long, default_value_t = 24)]
    pub months: u32,
}

#[derive(Parser)]
pub struct CompareOpts {
    #[arg(short, long)]
    pub db: Option<PathBuf>,
    pub left: String,
    pub right: String,
    #[arg(long, default_value_t = 24)]
    pub months: u32,
}

#[derive(Debug, Serialize, Clone)]
struct KnobDef {
    key: &'static str,
    label: &'static str,
    category: &'static str,
    unit: &'static str,
    default_value: &'static str,
    min_value: Option<&'static str>,
    max_value: Option<&'static str>,
    step_value: Option<&'static str>,
    description: &'static str,
    is_required: bool,
    is_advanced: bool,
}

#[derive(Debug, Serialize, Clone)]
struct MonthRow {
    month: u32,
    customers: f64,
    new_customers: f64,
    churned_customers: f64,
    mrr: f64,
    revenue: f64,
    cogs: f64,
    gross_profit: f64,
    marketing_spend: f64,
    fixed_cost: f64,
    taxes: f64,
    net_income: f64,
    cash_end: f64,
}

#[derive(Debug, Serialize, Clone)]
struct RunSummary {
    scenario: String,
    months: u32,
    ending_customers: f64,
    ending_mrr: f64,
    cumulative_revenue: f64,
    cumulative_net_income: f64,
    ending_cash: f64,
    break_even_month: Option<u32>,
    runway_month: Option<u32>,
}

const SAAS_KNOBS: &[KnobDef] = &[
    KnobDef { key: "starting_customers", label: "Starting customers", category: "growth", unit: "customers", default_value: "0", min_value: Some("0"), max_value: None, step_value: Some("1"), description: "Customers at month 0 before the forecast begins.", is_required: true, is_advanced: false },
    KnobDef { key: "monthly_new_customers", label: "Monthly new customers", category: "growth", unit: "customers/month", default_value: "20", min_value: Some("0"), max_value: None, step_value: Some("1"), description: "New customers acquired each month before churn is applied to the existing base.", is_required: true, is_advanced: false },
    KnobDef { key: "monthly_churn_rate", label: "Monthly churn rate", category: "retention", unit: "ratio", default_value: "0.05", min_value: Some("0"), max_value: Some("1"), step_value: Some("0.005"), description: "Fraction of current customers lost each month.", is_required: true, is_advanced: false },
    KnobDef { key: "monthly_price", label: "Monthly plan price", category: "pricing", unit: "usd", default_value: "10", min_value: Some("0"), max_value: None, step_value: Some("1"), description: "Monthly subscription list price.", is_required: true, is_advanced: false },
    KnobDef { key: "annual_price", label: "Annual plan price", category: "pricing", unit: "usd", default_value: "100", min_value: Some("0"), max_value: None, step_value: Some("1"), description: "Annual plan price billed once per year.", is_required: true, is_advanced: true },
    KnobDef { key: "annual_plan_share", label: "Annual plan share", category: "pricing", unit: "ratio", default_value: "0.0", min_value: Some("0"), max_value: Some("1"), step_value: Some("0.05"), description: "Share of customers on annual billing; recognized as annual_price/12 in monthly revenue.", is_required: true, is_advanced: true },
    KnobDef { key: "expansion_mrr_rate", label: "Expansion MRR rate", category: "revenue", unit: "ratio", default_value: "0.0", min_value: Some("0"), max_value: None, step_value: Some("0.01"), description: "Additional revenue uplift applied to subscription MRR for upgrades/upsells.", is_required: true, is_advanced: true },
    KnobDef { key: "cogs_rate", label: "COGS rate", category: "costs", unit: "ratio", default_value: "0.15", min_value: Some("0"), max_value: Some("1"), step_value: Some("0.01"), description: "Variable cost as a fraction of revenue.", is_required: true, is_advanced: false },
    KnobDef { key: "fixed_monthly_cost", label: "Fixed monthly cost", category: "costs", unit: "usd/month", default_value: "5000", min_value: Some("0"), max_value: None, step_value: Some("100"), description: "Monthly fixed operating costs excluding marketing.", is_required: true, is_advanced: false },
    KnobDef { key: "monthly_marketing_spend", label: "Monthly marketing spend", category: "acquisition", unit: "usd/month", default_value: "2000", min_value: Some("0"), max_value: None, step_value: Some("100"), description: "Monthly paid acquisition spend.", is_required: true, is_advanced: false },
    KnobDef { key: "tax_rate", label: "Tax rate", category: "finance", unit: "ratio", default_value: "0.20", min_value: Some("0"), max_value: Some("1"), step_value: Some("0.01"), description: "Tax rate applied to positive operating profit.", is_required: true, is_advanced: true },
    KnobDef { key: "starting_cash", label: "Starting cash", category: "finance", unit: "usd", default_value: "50000", min_value: Some("0"), max_value: None, step_value: Some("1000"), description: "Cash available at the start of the forecast.", is_required: true, is_advanced: false },
];

pub fn run_init(opts: InitOpts) -> Result<()> {
    let db = get_db_path(&opts.db);
    ensure_parent_dir(&db)?;
    let conn = Connection::open(&db)?;
    init_schema(&conn)?;
    seed_saas_model(&conn)?;
    println!("initialized business modeling schema at {}", db.display());
    Ok(())
}

pub fn run_knobs(opts: KnobsOpts) -> Result<()> {
    let conn = Connection::open(get_db_path(&opts.db))?;
    init_schema(&conn)?;
    seed_saas_model(&conn)?;
    let model_id = model_id_by_key(&conn, &opts.model)?;
    let mut stmt = conn.prepare(
        "SELECT knob_key, label, category, unit, default_value, description, is_advanced FROM business_model_knobs WHERE model_id = ? ORDER BY category, knob_key",
    )?;
    let rows = stmt.query_map([model_id], |r| {
        Ok(vec![
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, String>(3)?,
            r.get::<_, String>(4)?,
            r.get::<_, String>(5)?,
            if r.get::<_, i64>(6)? == 1 {
                "yes".to_string()
            } else {
                "no".to_string()
            },
        ])
    })?;
    let rows: Vec<Vec<String>> = rows.collect::<rusqlite::Result<_>>()?;
    print_table(
        &[
            "Key",
            "Label",
            "Category",
            "Unit",
            "Default",
            "Description",
            "Advanced",
        ],
        rows,
    );
    Ok(())
}

pub fn run_scenario_create(opts: CreateScenarioOpts) -> Result<()> {
    let conn = Connection::open(get_db_path(&opts.db))?;
    init_schema(&conn)?;
    seed_saas_model(&conn)?;
    let model_id = model_id_by_key(&conn, &opts.model)?;
    let now = now_ts();
    conn.execute(
        "INSERT INTO business_scenarios (model_id, name, description, parent_scenario_id, is_baseline, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![
            model_id,
            opts.name,
            opts.description,
            opts.from.as_ref().map(|name| scenario_id_by_name(&conn, name)).transpose()?,
            if opts.baseline { 1 } else { 0 },
            now,
        ],
    )?;
    let new_id = conn.last_insert_rowid();
    if let Some(source_name) = opts.from {
        let source_id = scenario_id_by_name(&conn, &source_name)?;
        clone_values(&conn, source_id, new_id)?;
    }
    println!("created scenario {}", new_id);
    Ok(())
}

pub fn run_scenario_set(opts: SetScenarioOpts) -> Result<()> {
    let conn = Connection::open(get_db_path(&opts.db))?;
    init_schema(&conn)?;
    let scenario_id = scenario_id_by_name(&conn, &opts.scenario)?;
    let model_id: i64 = conn.query_row(
        "SELECT model_id FROM business_scenarios WHERE id = ?1",
        [scenario_id],
        |r| r.get(0),
    )?;
    let valid_knobs = knob_keys_for_model(&conn, model_id)?;
    let now = now_ts();
    for assignment in &opts.assignments {
        let (key, value) = parse_assignment(assignment)?;
        if !valid_knobs.contains_key(key) {
            bail!("unknown knob '{}' for this scenario's model", key);
        }
        conn.execute(
            "INSERT INTO business_scenario_values (scenario_id, knob_key, value_text, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)
             ON CONFLICT(scenario_id, knob_key) DO UPDATE SET value_text = excluded.value_text, updated_at = excluded.updated_at",
            params![scenario_id, key, value, now],
        )?;
    }
    conn.execute(
        "UPDATE business_scenarios SET updated_at = ?2 WHERE id = ?1",
        params![scenario_id, now],
    )?;
    println!("updated scenario {}", opts.scenario);
    Ok(())
}

pub fn run_scenario_list(opts: ListScenarioOpts) -> Result<()> {
    let conn = Connection::open(get_db_path(&opts.db))?;
    init_schema(&conn)?;
    let (sql, params_vec): (&str, Vec<String>) = if let Some(model) = opts.model {
        (
            "SELECT m.model_key, s.name, COALESCE(s.description,''), s.is_baseline, s.created_at, s.updated_at
             FROM business_scenarios s
             JOIN business_models m ON m.id = s.model_id
             WHERE m.model_key = ?1
             ORDER BY m.model_key, s.name",
            vec![model],
        )
    } else {
        (
            "SELECT m.model_key, s.name, COALESCE(s.description,''), s.is_baseline, s.created_at, s.updated_at
             FROM business_scenarios s
             JOIN business_models m ON m.id = s.model_id
             ORDER BY m.model_key, s.name",
            vec![],
        )
    };
    let mut stmt = conn.prepare(sql)?;
    let rows = if params_vec.is_empty() {
        stmt.query_map([], |r| {
            Ok(vec![
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                if r.get::<_, i64>(3)? == 1 {
                    "yes".to_string()
                } else {
                    "no".to_string()
                },
                r.get::<_, i64>(4)?.to_string(),
                r.get::<_, i64>(5)?.to_string(),
            ])
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?
    } else {
        stmt.query_map([&params_vec[0]], |r| {
            Ok(vec![
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                if r.get::<_, i64>(3)? == 1 {
                    "yes".to_string()
                } else {
                    "no".to_string()
                },
                r.get::<_, i64>(4)?.to_string(),
                r.get::<_, i64>(5)?.to_string(),
            ])
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?
    };
    print_table(
        &[
            "Model",
            "Scenario",
            "Description",
            "Baseline",
            "Created",
            "Updated",
        ],
        rows,
    );
    Ok(())
}

pub fn run_scenario_show(opts: ShowScenarioOpts) -> Result<()> {
    let conn = Connection::open(get_db_path(&opts.db))?;
    init_schema(&conn)?;
    let scenario_id = scenario_id_by_name(&conn, &opts.scenario)?;
    let resolved = resolved_knobs(&conn, scenario_id)?;
    let mut rows = Vec::new();
    for (key, val) in resolved {
        rows.push(vec![key, val]);
    }
    print_table(&["Knob", "Value"], rows);
    Ok(())
}

pub fn run_scenario_clone(opts: CloneScenarioOpts) -> Result<()> {
    let conn = Connection::open(get_db_path(&opts.db))?;
    init_schema(&conn)?;
    let source_id = scenario_id_by_name(&conn, &opts.source)?;
    let row: (i64, Option<String>, i64) = conn.query_row(
        "SELECT model_id, description, is_baseline FROM business_scenarios WHERE id = ?1",
        [source_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )?;
    let now = now_ts();
    conn.execute(
        "INSERT INTO business_scenarios (model_id, name, description, parent_scenario_id, is_baseline, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)",
        params![row.0, opts.name, opts.description.or(row.1), source_id, now],
    )?;
    let new_id = conn.last_insert_rowid();
    clone_values(&conn, source_id, new_id)?;
    println!("cloned {} -> {}", opts.source, new_id);
    Ok(())
}

pub fn run_run(opts: RunOpts) -> Result<()> {
    let conn = Connection::open(get_db_path(&opts.db))?;
    init_schema(&conn)?;
    let scenario_id = scenario_id_by_name(&conn, &opts.scenario)?;
    let model_key: String = conn.query_row(
        "SELECT m.model_key FROM business_scenarios s JOIN business_models m ON m.id = s.model_id WHERE s.id = ?1",
        [scenario_id],
        |r| r.get(0),
    )?;
    if model_key != "saas" {
        bail!("unsupported model '{}'", model_key);
    }
    let (summary, series, resolved) =
        run_saas_model(&conn, scenario_id, &opts.scenario, opts.months)?;
    save_run(
        &conn,
        scenario_id,
        opts.months,
        &resolved,
        &summary,
        &series,
    )?;
    print_summary(&summary);
    let rows = series
        .iter()
        .take(12)
        .map(|r| {
            vec![
                r.month.to_string(),
                fmt_num(r.customers),
                fmt_money(r.mrr),
                fmt_money(r.revenue),
                fmt_money(r.net_income),
                fmt_money(r.cash_end),
            ]
        })
        .collect();
    println!();
    print_table(
        &[
            "Month",
            "Customers",
            "MRR",
            "Revenue",
            "Net Income",
            "Cash End",
        ],
        rows,
    );
    Ok(())
}

pub fn run_compare(opts: CompareOpts) -> Result<()> {
    let conn = Connection::open(get_db_path(&opts.db))?;
    init_schema(&conn)?;
    let left_id = scenario_id_by_name(&conn, &opts.left)?;
    let right_id = scenario_id_by_name(&conn, &opts.right)?;
    let (left_summary, _, _) = run_saas_model(&conn, left_id, &opts.left, opts.months)?;
    let (right_summary, _, _) = run_saas_model(&conn, right_id, &opts.right, opts.months)?;
    print_table(
        &["Metric", &opts.left, &opts.right, "Delta"],
        vec![
            vec![
                "Ending customers".into(),
                fmt_num(left_summary.ending_customers),
                fmt_num(right_summary.ending_customers),
                fmt_num(right_summary.ending_customers - left_summary.ending_customers),
            ],
            vec![
                "Ending MRR".into(),
                fmt_money(left_summary.ending_mrr),
                fmt_money(right_summary.ending_mrr),
                fmt_money(right_summary.ending_mrr - left_summary.ending_mrr),
            ],
            vec![
                "Cumulative revenue".into(),
                fmt_money(left_summary.cumulative_revenue),
                fmt_money(right_summary.cumulative_revenue),
                fmt_money(right_summary.cumulative_revenue - left_summary.cumulative_revenue),
            ],
            vec![
                "Cumulative net income".into(),
                fmt_money(left_summary.cumulative_net_income),
                fmt_money(right_summary.cumulative_net_income),
                fmt_money(right_summary.cumulative_net_income - left_summary.cumulative_net_income),
            ],
            vec![
                "Ending cash".into(),
                fmt_money(left_summary.ending_cash),
                fmt_money(right_summary.ending_cash),
                fmt_money(right_summary.ending_cash - left_summary.ending_cash),
            ],
            vec![
                "Break-even month".into(),
                opt_u32(left_summary.break_even_month),
                opt_u32(right_summary.break_even_month),
                compare_optional_months(
                    left_summary.break_even_month,
                    right_summary.break_even_month,
                ),
            ],
            vec![
                "Runway month".into(),
                opt_u32(left_summary.runway_month),
                opt_u32(right_summary.runway_month),
                compare_optional_months(left_summary.runway_month, right_summary.runway_month),
            ],
        ],
    );
    Ok(())
}

fn get_db_path(cli_override: &Option<PathBuf>) -> PathBuf {
    if let Some(ref p) = cli_override {
        return p.clone();
    }
    if let Ok(p) = std::env::var("FILEKIT_DB") {
        return PathBuf::from(p);
    }
    let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join(".hominem").join("db.sqlite")
}

fn ensure_parent_dir(path: &PathBuf) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(())
}

fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS business_models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_key TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            description TEXT,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS business_model_knobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_id INTEGER NOT NULL,
            knob_key TEXT NOT NULL,
            label TEXT NOT NULL,
            category TEXT NOT NULL,
            value_type TEXT NOT NULL DEFAULT 'number',
            unit TEXT NOT NULL,
            default_value TEXT NOT NULL,
            min_value TEXT,
            max_value TEXT,
            step_value TEXT,
            description TEXT,
            is_required INTEGER NOT NULL DEFAULT 1,
            is_advanced INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(model_id) REFERENCES business_models(id) ON DELETE CASCADE,
            UNIQUE(model_id, knob_key)
        );

        CREATE TABLE IF NOT EXISTS business_scenarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            parent_scenario_id INTEGER,
            is_baseline INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(model_id) REFERENCES business_models(id) ON DELETE CASCADE,
            FOREIGN KEY(parent_scenario_id) REFERENCES business_scenarios(id) ON DELETE SET NULL,
            UNIQUE(model_id, name)
        );

        CREATE TABLE IF NOT EXISTS business_scenario_values (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scenario_id INTEGER NOT NULL,
            knob_key TEXT NOT NULL,
            value_text TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(scenario_id) REFERENCES business_scenarios(id) ON DELETE CASCADE,
            UNIQUE(scenario_id, knob_key)
        );

        CREATE TABLE IF NOT EXISTS business_scenario_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scenario_id INTEGER NOT NULL,
            months INTEGER NOT NULL,
            input_hash TEXT NOT NULL,
            summary_json TEXT NOT NULL,
            series_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(scenario_id) REFERENCES business_scenarios(id) ON DELETE CASCADE
        );
        "#,
    )?;
    Ok(())
}

fn seed_saas_model(conn: &Connection) -> Result<()> {
    let now = now_ts();
    conn.execute(
        "INSERT INTO business_models (model_key, name, description, created_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(model_key) DO NOTHING",
        params![
            "saas",
            "SaaS subscription",
            "Subscription SaaS scenario model with saved knobs and scenario runs.",
            now
        ],
    )?;
    let model_id = model_id_by_key(conn, "saas")?;
    for knob in SAAS_KNOBS {
        conn.execute(
            "INSERT INTO business_model_knobs (model_id, knob_key, label, category, value_type, unit, default_value, min_value, max_value, step_value, description, is_required, is_advanced)
             VALUES (?1, ?2, ?3, ?4, 'number', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(model_id, knob_key) DO UPDATE SET
               label = excluded.label,
               category = excluded.category,
               unit = excluded.unit,
               default_value = excluded.default_value,
               min_value = excluded.min_value,
               max_value = excluded.max_value,
               step_value = excluded.step_value,
               description = excluded.description,
               is_required = excluded.is_required,
               is_advanced = excluded.is_advanced",
            params![
                model_id,
                knob.key,
                knob.label,
                knob.category,
                knob.unit,
                knob.default_value,
                knob.min_value,
                knob.max_value,
                knob.step_value,
                knob.description,
                if knob.is_required { 1 } else { 0 },
                if knob.is_advanced { 1 } else { 0 },
            ],
        )?;
    }
    Ok(())
}

fn model_id_by_key(conn: &Connection, key: &str) -> Result<i64> {
    conn.query_row(
        "SELECT id FROM business_models WHERE model_key = ?1",
        [key],
        |r| r.get(0),
    )
    .with_context(|| format!("unknown model '{}'", key))
}

fn scenario_id_by_name(conn: &Connection, name: &str) -> Result<i64> {
    conn.query_row(
        "SELECT id FROM business_scenarios WHERE name = ?1",
        [name],
        |r| r.get(0),
    )
    .with_context(|| format!("unknown scenario '{}'", name))
}

fn clone_values(conn: &Connection, source_id: i64, dest_id: i64) -> Result<()> {
    conn.execute(
        "INSERT INTO business_scenario_values (scenario_id, knob_key, value_text, created_at, updated_at)
         SELECT ?2, knob_key, value_text, ?3, ?3 FROM business_scenario_values WHERE scenario_id = ?1",
        params![source_id, dest_id, now_ts()],
    )?;
    Ok(())
}

fn knob_keys_for_model(conn: &Connection, model_id: i64) -> Result<BTreeMap<String, ()>> {
    let mut stmt = conn.prepare("SELECT knob_key FROM business_model_knobs WHERE model_id = ?1")?;
    let rows = stmt.query_map([model_id], |r| r.get::<_, String>(0))?;
    let mut out = BTreeMap::new();
    for row in rows {
        out.insert(row?, ());
    }
    Ok(out)
}

fn parse_assignment(input: &str) -> Result<(&str, &str)> {
    let Some((k, v)) = input.split_once('=') else {
        bail!("expected KEY=VALUE assignment, got '{}'", input);
    };
    let key = k.trim();
    let value = v.trim();
    if key.is_empty() || value.is_empty() {
        bail!("invalid assignment '{}'", input);
    }
    Ok((key, value))
}

fn resolved_knobs(conn: &Connection, scenario_id: i64) -> Result<BTreeMap<String, String>> {
    let model_id: i64 = conn.query_row(
        "SELECT model_id FROM business_scenarios WHERE id = ?1",
        [scenario_id],
        |r| r.get(0),
    )?;
    let mut defaults = BTreeMap::new();
    let mut stmt = conn.prepare(
        "SELECT knob_key, default_value FROM business_model_knobs WHERE model_id = ?1 ORDER BY knob_key",
    )?;
    for row in stmt.query_map([model_id], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })? {
        let (k, v) = row?;
        defaults.insert(k, v);
    }
    let mut stmt = conn.prepare(
        "SELECT knob_key, value_text FROM business_scenario_values WHERE scenario_id = ?1 ORDER BY knob_key",
    )?;
    for row in stmt.query_map([scenario_id], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })? {
        let (k, v) = row?;
        defaults.insert(k, v);
    }
    Ok(defaults)
}

fn parse_f64(map: &BTreeMap<String, String>, key: &str) -> Result<f64> {
    let raw = map
        .get(key)
        .ok_or_else(|| anyhow!("missing knob '{}'", key))?;
    raw.parse::<f64>()
        .with_context(|| format!("invalid numeric value for '{}' -> '{}", key, raw))
}

fn run_saas_model(
    conn: &Connection,
    scenario_id: i64,
    scenario_name: &str,
    months: u32,
) -> Result<(RunSummary, Vec<MonthRow>, BTreeMap<String, String>)> {
    let knobs = resolved_knobs(conn, scenario_id)?;
    let starting_customers = parse_f64(&knobs, "starting_customers")?;
    let monthly_new_customers = parse_f64(&knobs, "monthly_new_customers")?;
    let monthly_churn_rate = parse_f64(&knobs, "monthly_churn_rate")?;
    let monthly_price = parse_f64(&knobs, "monthly_price")?;
    let annual_price = parse_f64(&knobs, "annual_price")?;
    let annual_plan_share = parse_f64(&knobs, "annual_plan_share")?;
    let expansion_mrr_rate = parse_f64(&knobs, "expansion_mrr_rate")?;
    let cogs_rate = parse_f64(&knobs, "cogs_rate")?;
    let fixed_monthly_cost = parse_f64(&knobs, "fixed_monthly_cost")?;
    let monthly_marketing_spend = parse_f64(&knobs, "monthly_marketing_spend")?;
    let tax_rate = parse_f64(&knobs, "tax_rate")?;
    let starting_cash = parse_f64(&knobs, "starting_cash")?;

    let effective_arpu =
        ((1.0 - annual_plan_share) * monthly_price) + (annual_plan_share * (annual_price / 12.0));
    let revenue_multiplier = 1.0 + expansion_mrr_rate;

    let mut customers = starting_customers;
    let mut cash = starting_cash;
    let mut rows = Vec::new();
    let mut cumulative_revenue = 0.0;
    let mut cumulative_net_income = 0.0;
    let mut break_even_month = None;
    let mut runway_month = None;

    for month in 1..=months {
        let churned_customers = customers * monthly_churn_rate;
        customers = (customers - churned_customers + monthly_new_customers).max(0.0);
        let mrr = customers * effective_arpu * revenue_multiplier;
        let revenue = mrr;
        let cogs = revenue * cogs_rate;
        let gross_profit = revenue - cogs;
        let operating_profit_before_tax =
            gross_profit - fixed_monthly_cost - monthly_marketing_spend;
        let taxes = if operating_profit_before_tax > 0.0 {
            operating_profit_before_tax * tax_rate
        } else {
            0.0
        };
        let net_income = operating_profit_before_tax - taxes;
        cash += net_income;

        if break_even_month.is_none() && net_income >= 0.0 {
            break_even_month = Some(month);
        }
        if runway_month.is_none() && cash < 0.0 {
            runway_month = Some(month);
        }

        cumulative_revenue += revenue;
        cumulative_net_income += net_income;

        rows.push(MonthRow {
            month,
            customers,
            new_customers: monthly_new_customers,
            churned_customers,
            mrr,
            revenue,
            cogs,
            gross_profit,
            marketing_spend: monthly_marketing_spend,
            fixed_cost: fixed_monthly_cost,
            taxes,
            net_income,
            cash_end: cash,
        });
    }

    let last = rows.last().cloned().unwrap_or(MonthRow {
        month: 0,
        customers: starting_customers,
        new_customers: 0.0,
        churned_customers: 0.0,
        mrr: 0.0,
        revenue: 0.0,
        cogs: 0.0,
        gross_profit: 0.0,
        marketing_spend: 0.0,
        fixed_cost: 0.0,
        taxes: 0.0,
        net_income: 0.0,
        cash_end: starting_cash,
    });

    let summary = RunSummary {
        scenario: scenario_name.to_string(),
        months,
        ending_customers: last.customers,
        ending_mrr: last.mrr,
        cumulative_revenue,
        cumulative_net_income,
        ending_cash: last.cash_end,
        break_even_month,
        runway_month,
    };
    Ok((summary, rows, knobs))
}

fn save_run(
    conn: &Connection,
    scenario_id: i64,
    months: u32,
    knobs: &BTreeMap<String, String>,
    summary: &RunSummary,
    series: &[MonthRow],
) -> Result<()> {
    let input_json = serde_json::to_string(knobs)?;
    let mut hasher = Sha256::new();
    hasher.update(input_json.as_bytes());
    hasher.update(months.to_string().as_bytes());
    let input_hash = format!("{:x}", hasher.finalize());
    conn.execute(
        "INSERT INTO business_scenario_runs (scenario_id, months, input_hash, summary_json, series_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            scenario_id,
            months as i64,
            input_hash,
            serde_json::to_string(summary)?,
            serde_json::to_string(series)?,
            now_ts(),
        ],
    )?;
    Ok(())
}

fn now_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn opt_u32(v: Option<u32>) -> String {
    v.map(|x| x.to_string()).unwrap_or_else(|| "-".to_string())
}

fn compare_optional_months(left: Option<u32>, right: Option<u32>) -> String {
    match (left, right) {
        (Some(l), Some(r)) => (r as i64 - l as i64).to_string(),
        _ => "-".to_string(),
    }
}

fn print_summary(summary: &RunSummary) {
    let rows = vec![
        vec!["Scenario".into(), summary.scenario.clone()],
        vec!["Months".into(), summary.months.to_string()],
        vec!["Ending customers".into(), fmt_num(summary.ending_customers)],
        vec!["Ending MRR".into(), fmt_money(summary.ending_mrr)],
        vec![
            "Cumulative revenue".into(),
            fmt_money(summary.cumulative_revenue),
        ],
        vec![
            "Cumulative net income".into(),
            fmt_money(summary.cumulative_net_income),
        ],
        vec!["Ending cash".into(), fmt_money(summary.ending_cash)],
        vec!["Break-even month".into(), opt_u32(summary.break_even_month)],
        vec!["Runway month".into(), opt_u32(summary.runway_month)],
    ];
    print_table(&["Metric", "Value"], rows);
}

fn print_table(headers: &[&str], rows: Vec<Vec<String>>) {
    let mut widths: Vec<usize> = headers.iter().map(|h| h.len()).collect();
    for row in &rows {
        for (i, cell) in row.iter().enumerate() {
            if i >= widths.len() {
                widths.push(cell.len());
            } else {
                widths[i] = widths[i].max(cell.len());
            }
        }
    }
    let sep = widths
        .iter()
        .map(|w| "-".repeat(*w))
        .collect::<Vec<_>>()
        .join("-+-");
    println!(
        "{}",
        headers
            .iter()
            .enumerate()
            .map(|(i, h)| format!("{:width$}", h, width = widths[i]))
            .collect::<Vec<_>>()
            .join(" | ")
    );
    println!("{}", sep);
    for row in rows {
        println!(
            "{}",
            row.iter()
                .enumerate()
                .map(|(i, c)| format!("{:width$}", c, width = widths[i]))
                .collect::<Vec<_>>()
                .join(" | ")
        );
    }
}

fn fmt_num(v: f64) -> String {
    if (v - v.round()).abs() < 1e-9 {
        format!("{:.0}", v)
    } else {
        format!("{:.2}", v)
    }
}

fn fmt_money(v: f64) -> String {
    format!("${:.2}", v)
}
