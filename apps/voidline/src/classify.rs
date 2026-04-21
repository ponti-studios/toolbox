use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Subcommand)]
pub enum ClassifyCmd {
    /// Classify markdown essays and generate a move plan.
    Essays(EssayClassifyOpts),
}

#[derive(Parser, Debug)]
pub struct EssayClassifyOpts {
    /// Directory containing markdown essays.
    #[arg(short, long, default_value = ".")]
    pub dir: PathBuf,

    /// Skip confirmation prompts when executing a move plan.
    #[arg(long)]
    pub yes: bool,

    /// Execute the move plan instead of only generating it.
    #[arg(long)]
    pub execute: bool,

    /// Launch interactive TUI mode.
    #[arg(long)]
    pub tui: bool,

    /// Resume from the highest completed pass.
    #[arg(long)]
    pub resume: bool,

    /// Resume from a specific pass.
    #[arg(long = "from-pass")]
    pub from_pass: Option<u8>,

    /// Confidence threshold for auto-move decisions.
    #[arg(long, default_value = "0.75")]
    pub threshold: f64,

    /// LLM provider name.
    #[arg(long, default_value = "ollama")]
    pub llm: String,

    /// OpenAI API key.
    #[arg(long)]
    pub api_key: Option<String>,

    /// Base URL for an OpenAI-compatible API.
    #[arg(long)]
    pub base_url: Option<String>,

    /// Model name to use.
    #[arg(long)]
    pub model: Option<String>,

    /// Export the move plan to CSV.
    #[arg(long)]
    pub csv: Option<PathBuf>,

    /// Clustering distance threshold.
    #[arg(long, default_value = "0.75")]
    pub cluster_threshold: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fingerprint {
    pub id: String,
    pub filename: String,
    pub relative_path: String,
    pub title: String,
    pub headings: Vec<String>,
    pub intro_excerpt: String,
    pub closing_excerpt: String,
    pub keywords: Vec<String>,
    pub word_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Embedding {
    pub id: String,
    pub vector: Vec<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ClassificationState {
    fingerprints: Vec<Fingerprint>,
}

#[derive(Debug, Serialize, Deserialize)]
struct EmbeddingState {
    embeddings: Vec<Embedding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterResult {
    pub id: String,
    pub cluster_id: i32,
    pub is_outlier: bool,
    pub distance: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Classification {
    pub id: String,
    pub primary_domain: String,
    pub secondary_domain: Option<String>,
    pub confidence: f64,
    pub reason: String,
    pub needs_full_text_review: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MoveEntry {
    pub id: String,
    pub source: String,
    pub target: String,
    pub domain: String,
    pub confidence: f64,
    pub reason: String,
}

const MAX_INTRO_WORDS: usize = 500;
const MAX_CLOSING_WORDS: usize = 200;

pub fn run_essays(opts: EssayClassifyOpts) -> Result<()> {
    let state_dir = opts.dir.join(".voidline").join("classify");
    fs::create_dir_all(&state_dir).context("creating classify state dir")?;

    println!("voidline classify essays");
    println!("target: {}", opts.dir.display());
    println!("llm: {}", opts.llm);
    println!("threshold: {:.2}", opts.threshold);
    println!("cluster threshold: {:.2}", opts.cluster_threshold);

    if opts.tui {
        println!("tui mode is not implemented yet in voidline");
        return Ok(());
    }

    let should_execute = opts.execute;

    if opts.resume {
        println!("resuming from highest completed pass (stub)");
    } else if let Some(pass) = opts.from_pass {
        println!("resuming from pass {} (stub)", pass);
    }

    if opts.yes {
        println!("confirmation prompts disabled");
    }

    if let Some(csv) = opts.csv.as_ref() {
        println!("csv export requested: {}", csv.display());
    }

    if opts.llm.trim().is_empty() {
        anyhow::bail!("--llm cannot be empty");
    }

    let pass1_path = state_dir.join("pass1_fingerprints.json");
    let pass2_path = state_dir.join("pass2_embeddings.json");
    let pass3_path = state_dir.join("pass3_clusters.json");
    let pass4_path = state_dir.join("pass4_classifications.json");
    let pass5_path = state_dir.join("move_plan.json");
    let start_pass = opts.from_pass.unwrap_or(if opts.resume { 2 } else { 1 }).clamp(1, 5);

    let fingerprints = if start_pass > 1 && pass1_path.exists() {
        let state: ClassificationState = load_json(&pass1_path)?;
        println!("loaded {} fingerprints from {}", state.fingerprints.len(), pass1_path.display());
        state.fingerprints
    } else {
        let fingerprints = pass1_scan(&opts.dir)?;
        let pass1 = ClassificationState {
            fingerprints: fingerprints.clone(),
        };
        fs::write(&pass1_path, serde_json::to_string_pretty(&pass1)?).context("writing pass1 state")?;
        println!("parsed {} essays", fingerprints.len());
        println!("wrote {}", pass1_path.display());
        fingerprints
    };

    let embeddings = if start_pass > 2 && pass2_path.exists() {
        let state: EmbeddingState = load_json(&pass2_path)?;
        println!("loaded {} embeddings from {}", state.embeddings.len(), pass2_path.display());
        state.embeddings
    } else {
        let embeddings = pass2_embed(&fingerprints);
        let pass2 = EmbeddingState {
            embeddings: embeddings.clone(),
        };
        fs::write(&pass2_path, serde_json::to_string_pretty(&pass2)?).context("writing pass2 state")?;
        println!("generated {} embeddings", embeddings.len());
        println!("wrote {}", pass2_path.display());
        embeddings
    };

    let clusters = if start_pass > 3 && pass3_path.exists() {
        let clusters: Vec<ClusterResult> = load_json(&pass3_path)?;
        println!("loaded {} clusters from {}", clusters.len(), pass3_path.display());
        clusters
    } else {
        let clusters = pass3_cluster(&embeddings, opts.cluster_threshold);
        fs::write(&pass3_path, serde_json::to_string_pretty(&clusters)?).context("writing pass3 state")?;
        println!("clustered {} essays", clusters.len());
        println!("wrote {}", pass3_path.display());
        clusters
    };

    let classifications = if start_pass > 4 && pass4_path.exists() {
        let classifications: Vec<Classification> = load_json(&pass4_path)?;
        println!("loaded {} classifications from {}", classifications.len(), pass4_path.display());
        classifications
    } else {
        let classifications = pass4_classify(&fingerprints, &clusters, opts.threshold);
        fs::write(&pass4_path, serde_json::to_string_pretty(&classifications)?).context("writing pass4 state")?;
        println!("classified {} essays", classifications.len());
        println!("wrote {}", pass4_path.display());
        classifications
    };

    let move_plan = if start_pass > 5 && pass5_path.exists() {
        let move_plan: Vec<MoveEntry> = load_json(&pass5_path)?;
        println!("loaded {} move plan entries from {}", move_plan.len(), pass5_path.display());
        move_plan
    } else {
        let move_plan = pass5_move(&fingerprints, &classifications);
        fs::write(&pass5_path, serde_json::to_string_pretty(&move_plan)?).context("writing move plan")?;
        println!("wrote {} move plan entries", move_plan.len());
        println!("wrote {}", pass5_path.display());
        move_plan
    };

    if should_execute {
        execute_move_plan(&opts.dir, &move_plan, opts.yes)?;
    }

    println!("essay classification pipeline now covers Pass 1 through Pass 5 in scaffold form");
    println!("latest move plan entries: {}", move_plan.len());
    Ok(())
}

fn pass1_scan(root: &Path) -> Result<Vec<Fingerprint>> {
    let mut files = Vec::new();
    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.components().any(|c| c.as_os_str() == ".voidline") {
            continue;
        }
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("md") {
            files.push(path.to_path_buf());
        }
    }

    files.sort();
    let mut fingerprints = Vec::with_capacity(files.len());
    for (idx, path) in files.iter().enumerate() {
        let content = fs::read_to_string(path)
            .with_context(|| format!("reading {}", path.display()))?;
        let rel = path.strip_prefix(root).unwrap_or(path).to_string_lossy().to_string();
        fingerprints.push(Fingerprint {
            id: format!("essay_{:04}", idx),
            filename: path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string(),
            relative_path: rel,
            title: extract_title(&content),
            headings: extract_headings(&content),
            intro_excerpt: extract_intro(&content),
            closing_excerpt: extract_closing(&content),
            keywords: extract_keywords(&content),
            word_count: count_words(&content),
        });
    }

    Ok(fingerprints)
}

fn extract_title(content: &str) -> String {
    for line in content.lines().take(10) {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("# ") {
            return rest.trim().to_string();
        }
    }
    String::new()
}

fn extract_headings(content: &str) -> Vec<String> {
    content
        .lines()
        .filter_map(|line| line.trim().strip_prefix("## ").map(|s| s.trim().to_string()))
        .collect()
}

fn extract_intro(content: &str) -> String {
    let mut out = Vec::new();
    let mut words = 0usize;
    let mut in_code = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            in_code = !in_code;
            continue;
        }
        if in_code || trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let wc = count_words(line);
        if words + wc > MAX_INTRO_WORDS {
            break;
        }
        out.push(line.trim());
        words += wc;
    }
    out.join(" ").trim().to_string()
}

fn extract_closing(content: &str) -> String {
    let mut out = Vec::new();
    let mut words = 0usize;
    for line in content.lines().rev() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('`') || trimmed.starts_with('#') {
            continue;
        }
        let wc = count_words(trimmed);
        if words + wc > MAX_CLOSING_WORDS {
            break;
        }
        out.push(trimmed.to_string());
        words += wc;
    }
    out.reverse();
    out.join(" ").trim().to_string()
}

fn extract_keywords(content: &str) -> Vec<String> {
    let mut freq: HashMap<String, usize> = HashMap::new();
    for token in content.split(|c: char| !c.is_ascii_alphanumeric() && c != '-') {
        let token = token.trim().to_lowercase();
        if token.len() < 4 {
            continue;
        }
        if matches!(token.as_str(), "the" | "and" | "with" | "that" | "this" | "from" | "have" | "will" | "your" | "into" | "more") {
            continue;
        }
        *freq.entry(token).or_default() += 1;
    }
    let mut items: Vec<_> = freq.into_iter().collect();
    items.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    items.into_iter().filter(|(_, n)| *n >= 2).take(20).map(|(k, _)| k).collect()
}

fn count_words(s: &str) -> usize {
    let mut words = 0usize;
    let mut in_word = false;
    for ch in s.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' {
            if !in_word && ch.is_ascii_alphanumeric() {
                words += 1;
                in_word = true;
            }
        } else {
            in_word = false;
        }
    }
    words
}

fn pass2_embed(fingerprints: &[Fingerprint]) -> Vec<Embedding> {
    fingerprints
        .iter()
        .map(|fp| Embedding {
            id: fp.id.clone(),
            vector: build_embedding_vector(fp),
        })
        .collect()
}

fn build_embedding_vector(fp: &Fingerprint) -> Vec<f64> {
    const DIM: usize = 16;
    let text = build_embedding_text(fp);
    let mut vec = vec![0.0f64; DIM];

    for (i, token) in text
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|t| !t.is_empty())
        .enumerate()
    {
        let mut hash = 0u64;
        for b in token.bytes() {
            hash = hash.wrapping_mul(31).wrapping_add(b as u64);
        }
        let idx = (hash as usize) % DIM;
        vec[idx] += 1.0 + ((i % 7) as f64 * 0.1);
    }

    let norm = vec.iter().map(|v| v * v).sum::<f64>().sqrt();
    if norm > 0.0 {
        for v in &mut vec {
            *v /= norm;
        }
    }

    vec
}

fn build_embedding_text(fp: &Fingerprint) -> String {
    let mut parts = Vec::new();
    parts.push(fp.filename.clone());
    parts.push(fp.title.clone());
    parts.extend(fp.headings.clone());
    parts.push(fp.intro_excerpt.clone());
    parts.push(fp.closing_excerpt.clone());
    parts.extend(fp.keywords.clone());
    parts.join(" ")
}

fn pass3_cluster(embeddings: &[Embedding], threshold: f64) -> Vec<ClusterResult> {
    let mut results: Vec<ClusterResult> = Vec::with_capacity(embeddings.len());
    for (i, emb) in embeddings.iter().enumerate() {
        let mut best_cluster = i as i32;
        let mut best_distance = f64::MAX;
        for (j, other) in embeddings.iter().enumerate().take(i) {
            let distance = cosine_distance(&emb.vector, &other.vector);
            if distance < best_distance {
                best_distance = distance;
                best_cluster = results[j].cluster_id;
            }
        }

        let is_outlier = best_distance.is_infinite() || best_distance > threshold;
        results.push(ClusterResult {
            id: emb.id.clone(),
            cluster_id: if is_outlier { -1 } else { best_cluster },
            is_outlier,
            distance: if best_distance.is_finite() { best_distance } else { 0.0 },
        });
    }
    results
}

fn cosine_distance(a: &[f64], b: &[f64]) -> f64 {
    let len = a.len().min(b.len());
    if len == 0 {
        return 1.0;
    }
    let mut dot = 0.0;
    let mut na = 0.0;
    let mut nb = 0.0;
    for i in 0..len {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if na == 0.0 || nb == 0.0 {
        return 1.0;
    }
    1.0 - (dot / (na.sqrt() * nb.sqrt()))
}

fn pass4_classify(fingerprints: &[Fingerprint], clusters: &[ClusterResult], threshold: f64) -> Vec<Classification> {
    let mut fp_map = HashMap::new();
    for fp in fingerprints {
        fp_map.insert(fp.id.clone(), fp);
    }

    clusters
        .iter()
        .map(|cluster| {
            let fp = fp_map.get(&cluster.id);
            let title = fp.map(|f| f.title.as_str()).unwrap_or("");
            let domain = infer_domain(title, fp.map(|f| f.keywords.as_slice()).unwrap_or(&[]), cluster.cluster_id);
            Classification {
                id: cluster.id.clone(),
                primary_domain: domain,
                secondary_domain: None,
                confidence: if cluster.is_outlier { 0.35 } else { (1.0 - cluster.distance).max(0.0) },
                reason: if cluster.is_outlier {
                    "low cluster confidence".to_string()
                } else {
                    "heuristic classification from title/keywords".to_string()
                },
                needs_full_text_review: cluster.is_outlier || cluster.distance > threshold,
            }
        })
        .collect()
}

fn infer_domain(title: &str, keywords: &[String], cluster_id: i32) -> String {
    let haystack = format!("{} {}", title.to_lowercase(), keywords.join(" "));
    let rules = [
        ("technology", &["rust", "go", "python", "cli", "api", "code", "software"] as &[_]),
        ("science", &["research", "data", "model", "analysis", "experiment"]),
        ("writing", &["essay", "write", "writing", "draft", "prose"]),
        ("product", &["product", "roadmap", "feature", "workflow"]),
        ("design", &["design", "ui", "ux", "interface"]),
        ("business", &["business", "strategy", "market", "revenue"]),
        ("personal", &["journal", "personal", "life", "note"]),
    ];
    for (domain, terms) in rules {
        if terms.iter().any(|term| haystack.contains(term)) {
            return domain.to_string();
        }
    }
    if cluster_id >= 0 {
        format!("cluster-{}", cluster_id)
    } else {
        "unclear".to_string()
    }
}

fn pass5_move(fingerprints: &[Fingerprint], classifications: &[Classification]) -> Vec<MoveEntry> {
    let mut map = HashMap::new();
    for fp in fingerprints {
        map.insert(fp.id.clone(), fp);
    }

    let mut plan = Vec::with_capacity(fingerprints.len());
    for c in classifications {
        if let Some(fp) = map.get(&c.id) {
            let domain = if c.primary_domain.is_empty() { "unclear" } else { &c.primary_domain };
            let target = PathBuf::from(domain).join(&fp.filename);
            plan.push(MoveEntry {
                id: c.id.clone(),
                source: fp.relative_path.clone(),
                target: target.to_string_lossy().to_string(),
                domain: domain.to_string(),
                confidence: c.confidence,
                reason: c.reason.clone(),
            });
        }
    }
    plan
}

fn load_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T> {
    let content = fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?;
    serde_json::from_str(&content).with_context(|| format!("parsing {}", path.display()))
}

fn execute_move_plan(source_dir: &Path, plan: &[MoveEntry], assume_yes: bool) -> Result<()> {
    if plan.is_empty() {
        println!("no move plan entries to execute");
        return Ok(());
    }

    println!("executing move plan: {} files", plan.len());
    if !assume_yes {
        println!("Execute? [y/N]");
        let mut response = String::new();
        std::io::stdin().read_line(&mut response).context("reading confirmation")?;
        let response = response.trim().to_lowercase();
        if response != "y" && response != "yes" {
            println!("aborted.");
            return Ok(());
        }
    }

    let mut moved = 0usize;
    let mut failed = 0usize;
    for entry in plan {
        let source = source_dir.join(&entry.source);
        let target = source_dir.join(&entry.target);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("creating {}", parent.display()))?;
        }
        match fs::rename(&source, &target) {
            Ok(_) => {
                moved += 1;
                println!("  MOVED: {} -> {}", source.display(), target.display());
            }
            Err(err) => {
                failed += 1;
                println!("  FAILED: {} -> {}: {}", source.display(), target.display(), err);
            }
        }
    }

    println!("done: {} moved, {} failed", moved, failed);
    Ok(())
}
