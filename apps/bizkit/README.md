# bizkit

Business modeling and scenario analysis CLI.

## Install

```bash
cargo run -p bizkit -- --help
```

## Commands

### `init`
Initialize the default SaaS model and database schema.

```bash
bizkit init
bizkit init --db ./biz.sqlite
```

### `knobs`
List knobs for a business model.

```bash
bizkit knobs
bizkit knobs --model saas
```

### `scenario`
Manage scenarios.

```bash
bizkit scenario create --name baseline --baseline
bizkit scenario set baseline --set monthly_price=29 monthly_churn_rate=0.03
bizkit scenario list
bizkit scenario show baseline
bizkit scenario clone baseline --name test
```

### `run`
Run a scenario and save the results.

```bash
bizkit run baseline --months 24
```

### `compare`
Compare two scenarios over the same horizon.

```bash
bizkit compare baseline aggressive --months 24
```

## Storage

By default, data is stored in:

```bash
~/.hominem/db.sqlite
```

You can override with:

```bash
bizkit --db /path/to/db.sqlite ...
```

or set:

```bash
FILEKIT_DB=/path/to/db.sqlite
```
