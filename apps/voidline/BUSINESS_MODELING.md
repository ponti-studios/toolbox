# Business Modeling in `voidline`

`voidline biz` adds a scenario-based business modeling system backed by SQLite.

## Design principles

- Store **knobs**, not spreadsheet outputs, as the source of truth.
- Save a **baseline** and many named **scenarios**.
- A scenario stores only the knob values that differ from the model defaults.
- Every run stores a snapshot of computed outputs for later comparison.

## Schema

### `business_models`
Defines a business model template.

- `id`
- `model_key` unique key such as `saas`
- `name`
- `description`
- `created_at`

### `business_model_knobs`
Defines the available knobs for a model.

- `id`
- `model_id`
- `knob_key`
- `label`
- `category`
- `value_type`
- `unit`
- `default_value`
- `min_value`
- `max_value`
- `step_value`
- `description`
- `is_required`
- `is_advanced`

### `business_scenarios`
Stores named scenarios.

- `id`
- `model_id`
- `name`
- `description`
- `parent_scenario_id`
- `is_baseline`
- `created_at`
- `updated_at`

### `business_scenario_values`
Stores scenario-specific knob overrides.

- `id`
- `scenario_id`
- `knob_key`
- `value_text`
- `created_at`
- `updated_at`

### `business_scenario_runs`
Stores computed outputs for a scenario run.

- `id`
- `scenario_id`
- `months`
- `input_hash`
- `summary_json`
- `series_json`
- `created_at`

## Seeded model

The initial seeded model is `saas` with knobs for:

- `starting_customers`
- `monthly_new_customers`
- `monthly_churn_rate`
- `monthly_price`
- `annual_price`
- `annual_plan_share`
- `expansion_mrr_rate`
- `cogs_rate`
- `fixed_monthly_cost`
- `monthly_marketing_spend`
- `tax_rate`
- `starting_cash`

## Commands

### Initialize schema

```bash
voidline biz init
```

### Inspect knobs

```bash
voidline biz knobs --model saas
```

### Create a baseline scenario

```bash
voidline biz scenario create --model saas --name base --baseline
```

### Set knob values

```bash
voidline biz scenario set base \
  --set starting_customers=15 \
  --set monthly_new_customers=20 \
  --set monthly_churn_rate=0.05 \
  --set monthly_price=10 \
  --set fixed_monthly_cost=5000 \
  --set monthly_marketing_spend=2000
```

### Clone a scenario

```bash
voidline biz scenario clone base --name aggressive
```

### Change just a few knobs

```bash
voidline biz scenario set aggressive \
  --set monthly_new_customers=40 \
  --set monthly_marketing_spend=4000
```

### List scenarios

```bash
voidline biz scenario list
```

### Show resolved knob values

```bash
voidline biz scenario show aggressive
```

### Run a scenario

```bash
voidline biz run aggressive --months 24
```

### Compare two scenarios

```bash
voidline biz compare base aggressive --months 24
```

## Current SaaS model equations

For each month:

- `churned_customers = customers * monthly_churn_rate`
- `customers = customers - churned_customers + monthly_new_customers`
- `effective_arpu = (1 - annual_plan_share) * monthly_price + annual_plan_share * (annual_price / 12)`
- `mrr = customers * effective_arpu * (1 + expansion_mrr_rate)`
- `revenue = mrr`
- `cogs = revenue * cogs_rate`
- `gross_profit = revenue - cogs`
- `operating_profit_before_tax = gross_profit - fixed_monthly_cost - monthly_marketing_spend`
- `taxes = max(operating_profit_before_tax, 0) * tax_rate`
- `net_income = operating_profit_before_tax - taxes`
- `cash_end = prior_cash + net_income`

Summary outputs include:

- ending customers
- ending MRR
- cumulative revenue
- cumulative net income
- ending cash
- break-even month
- runway month
