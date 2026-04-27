use anyhow::{Context, Result};
use clap::{Parser, ValueEnum};
use serde::Serialize;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone, ValueEnum)]
pub enum AnalyzeOutputFormat {
    Text,
    Json,
}

#[derive(Debug, Clone, Parser)]
pub struct AnalyzeOpts {
    /// Root directory to analyze.
    #[arg(short, long, default_value = ".")]
    pub root: PathBuf,

    /// Show individual file breakdown.
    #[arg(long)]
    pub files: bool,

    /// File extensions to include, comma-separated.
    #[arg(long, default_value = ".md,.txt,.py,.js,.json,.yaml,.yml,.sh")]
    pub extensions: String,

    /// Include hidden files and directories when no .kernelignore is present.
    #[arg(long)]
    pub include_hidden: bool,

    /// Additional ignore files to load, in gitignore format.
    #[arg(long = "ignore-file", value_name = "FILE")]
    pub ignore_files: Vec<PathBuf>,

    /// Do not read .gitignore from the target directory.
    #[arg(long)]
    pub no_gitignore: bool,

    /// Output format.
    #[arg(long, value_enum, default_value_t = AnalyzeOutputFormat::Text)]
    pub output: AnalyzeOutputFormat,
}

#[derive(Debug, Default, Clone, Serialize)]
struct FileStats {
    files: usize,
    lines: usize,
    words: usize,
    bytes: u64,
    tokens: usize,
}

#[derive(Debug, Clone)]
struct IgnorePattern {
    pattern: String,
    negated: bool,
    directory_only: bool,
    anchored: bool,
}

#[derive(Debug, Clone, Serialize)]
struct AnalyzeFileReport {
    path: String,
    lines: usize,
    words: usize,
    bytes: u64,
    tokens: usize,
}

#[derive(Debug, Clone, Serialize)]
struct AnalyzeExtensionReport {
    extension: String,
    files: usize,
    lines: usize,
    words: usize,
    bytes: u64,
    tokens: usize,
}

#[derive(Debug, Clone, Serialize)]
struct AnalyzeSummaryReport {
    files: usize,
    lines: usize,
    words: usize,
    bytes: u64,
    tokens: usize,
    average_tokens_per_file: f64,
    estimated_input_cost_usd: f64,
}

#[derive(Debug, Clone, Serialize)]
struct AnalyzeReport {
    root: String,
    ignored_entries: usize,
    token_estimation: String,
    summary: AnalyzeSummaryReport,
    by_extension: Vec<AnalyzeExtensionReport>,
    files: Option<Vec<AnalyzeFileReport>>,
}

pub fn run_analyze(opts: AnalyzeOpts) -> Result<()> {
    let root = if opts.root.as_os_str().is_empty() {
        PathBuf::from(".")
    } else {
        opts.root.clone()
    };

    if !root.exists() {
        anyhow::bail!("directory not found: {}", root.display());
    }

    let extensions = parse_extensions(&opts.extensions);
    let patterns = load_ignore_patterns(&root, &opts)?;
    let default_hidden_ignore = patterns.is_empty() && !opts.include_hidden;

    let mut report = analyze_directory(&root, &extensions, &patterns, default_hidden_ignore)?;
    if !opts.files {
        report.files = None;
    }

    match opts.output {
        AnalyzeOutputFormat::Text => print_text_report(&report, opts.files),
        AnalyzeOutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&report)?);
        }
    }

    Ok(())
}

fn parse_extensions(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|ext| {
            if ext.starts_with('.') {
                ext.to_ascii_lowercase()
            } else {
                format!(".{}", ext.to_ascii_lowercase())
            }
        })
        .collect()
}

fn load_ignore_patterns(root: &Path, opts: &AnalyzeOpts) -> Result<Vec<IgnorePattern>> {
    let mut patterns = Vec::new();

    let kernelignore = root.join(".kernelignore");
    if kernelignore.exists() {
        patterns.extend(parse_ignore_file(
            &fs::read_to_string(&kernelignore)
                .with_context(|| format!("reading {}", kernelignore.display()))?,
        ));
    }

    if !opts.no_gitignore {
        let gitignore = root.join(".gitignore");
        if gitignore.exists() {
            patterns.extend(parse_ignore_file(
                &fs::read_to_string(&gitignore)
                    .with_context(|| format!("reading {}", gitignore.display()))?,
            ));
        }
    }

    for ignore_file in &opts.ignore_files {
        let path = if ignore_file.is_absolute() {
            ignore_file.clone()
        } else {
            root.join(ignore_file)
        };

        if path.exists() {
            patterns.extend(parse_ignore_file(
                &fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))?,
            ));
        }
    }

    Ok(patterns)
}

fn parse_ignore_file(content: &str) -> Vec<IgnorePattern> {
    let mut patterns = Vec::new();

    for raw_line in content.lines() {
        let mut line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let negated = line.starts_with('!');
        if negated {
            line = &line[1..];
        }
        if line.is_empty() {
            continue;
        }

        let directory_only = line.ends_with('/');
        if directory_only {
            line = &line[..line.len() - 1];
        }

        let anchored = line.starts_with('/');
        if anchored {
            line = &line[1..];
        }

        if line.is_empty() {
            continue;
        }

        patterns.push(IgnorePattern {
            pattern: line.to_string(),
            negated,
            directory_only,
            anchored,
        });
    }

    patterns
}

fn matches_extension(path: &Path, extensions: &[String]) -> bool {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| format!(".{}", s.to_ascii_lowercase()));

    match ext {
        Some(ext) => extensions.iter().any(|allowed| allowed == &ext),
        None => extensions.iter().any(|allowed| allowed == "no-ext"),
    }
}

fn is_hidden_path(path: &Path) -> bool {
    path.components().any(|component| {
        let s = component.as_os_str().to_string_lossy();
        s.starts_with('.') && s != "." && s != ".."
    })
}

fn matches_pattern(path: &Path, pat: &IgnorePattern) -> bool {
    use glob::Pattern;

    let rel = path.to_string_lossy().replace('\\', "/");
    let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");

    if pat.directory_only {
        if pat.anchored {
            return rel == pat.pattern || rel.starts_with(&format!("{}/", pat.pattern));
        }

        return path
            .components()
            .any(|component| component.as_os_str().to_string_lossy() == pat.pattern);
    }

    let pattern = pat.pattern.replace('\\', "/");
    let mut candidates = Vec::new();

    if pat.anchored || pattern.contains('/') {
        candidates.push(rel.clone());
    } else {
        candidates.push(name.to_string());
        candidates.extend(
            path.components()
                .map(|c| c.as_os_str().to_string_lossy().to_string()),
        );
    }

    for candidate in candidates {
        if let Ok(glob) = Pattern::new(&pattern) {
            if glob.matches(&candidate) || glob.matches_path(Path::new(&candidate)) {
                return true;
            }
        }
    }

    false
}

fn should_ignore(path: &Path, patterns: &[IgnorePattern], default_hidden_ignore: bool) -> bool {
    if default_hidden_ignore && is_hidden_path(path) {
        return true;
    }

    let mut ignored = false;
    for pat in patterns {
        if matches_pattern(path, pat) {
            ignored = !pat.negated;
        }
    }

    ignored
}

fn analyze_file(path: &Path) -> Result<Option<FileStats>> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(_) => return Ok(None),
    };

    let lines = if content.is_empty() {
        0
    } else {
        content.lines().count() + if content.ends_with('\n') { 0 } else { 1 }
    };
    let words = content.split_whitespace().count();
    let bytes = fs::metadata(path)?.len();
    let tokens = estimate_tokens_rough(&content);

    Ok(Some(FileStats {
        files: 1,
        lines,
        words,
        bytes,
        tokens,
    }))
}

fn estimate_tokens_rough(text: &str) -> usize {
    (text.len() / 4).max(1)
}

fn format_bytes(bytes_value: u64) -> String {
    let units = ["B", "KB", "MB", "GB", "TB"];
    let mut unit = 0usize;
    let mut value = bytes_value as f64;

    while value >= 1024.0 && unit < units.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }

    format!("{:.1}{}", value, units[unit])
}

fn analyze_directory(
    root: &Path,
    extensions: &[String],
    patterns: &[IgnorePattern],
    default_hidden_ignore: bool,
) -> Result<AnalyzeReport> {
    let mut by_ext: BTreeMap<String, FileStats> = BTreeMap::new();
    let mut files = Vec::new();
    let mut ignored = 0usize;

    for entry in WalkDir::new(root).into_iter().filter_map(|entry| entry.ok()) {
        let path = entry.path();
        if path == root {
            continue;
        }

        let rel = path.strip_prefix(root).unwrap_or(path).to_path_buf();

        if should_ignore(&rel, patterns, default_hidden_ignore) {
            ignored += 1;
            continue;
        }

        if !entry.file_type().is_file() {
            continue;
        }

        if rel.file_name().map(|n| n == ".kernelignore").unwrap_or(false) {
            continue;
        }

        if !extensions.is_empty() && !matches_extension(&rel, extensions) {
            continue;
        }

        if let Some(stats) = analyze_file(path)? {
            let ext = path
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| format!(".{}", s.to_ascii_lowercase()))
                .unwrap_or_else(|| "no-ext".to_string());

            let bucket = by_ext.entry(ext).or_default();
            bucket.files += 1;
            bucket.lines += stats.lines;
            bucket.words += stats.words;
            bucket.bytes += stats.bytes;
            bucket.tokens += stats.tokens;

            files.push(AnalyzeFileReport {
                path: rel.to_string_lossy().to_string(),
                lines: stats.lines,
                words: stats.words,
                bytes: stats.bytes,
                tokens: stats.tokens,
            });
        }
    }

    let total_files: usize = by_ext.values().map(|s| s.files).sum();
    let total_lines: usize = by_ext.values().map(|s| s.lines).sum();
    let total_words: usize = by_ext.values().map(|s| s.words).sum();
    let total_bytes: u64 = by_ext.values().map(|s| s.bytes).sum();
    let total_tokens: usize = by_ext.values().map(|s| s.tokens).sum();
    let average_tokens_per_file = if total_files > 0 {
        total_tokens as f64 / total_files as f64
    } else {
        0.0
    };

    let by_extension = by_ext
        .into_iter()
        .map(|(extension, stats)| AnalyzeExtensionReport {
            extension,
            files: stats.files,
            lines: stats.lines,
            words: stats.words,
            bytes: stats.bytes,
            tokens: stats.tokens,
        })
        .collect();

    Ok(AnalyzeReport {
        root: root.display().to_string(),
        ignored_entries: ignored,
        token_estimation: "rough".to_string(),
        summary: AnalyzeSummaryReport {
            files: total_files,
            lines: total_lines,
            words: total_words,
            bytes: total_bytes,
            tokens: total_tokens,
            average_tokens_per_file,
            estimated_input_cost_usd: (total_tokens as f64 / 1000.0) * 0.0005,
        },
        by_extension,
        files: Some(files),
    })
}

fn print_text_report(report: &AnalyzeReport, show_files: bool) {
    println!("\n📊 Analysis of: {}", report.root);
    println!("{}", "=".repeat(80));

    if report.ignored_entries > 0 {
        println!("⏭️  Ignored {} files/directories", report.ignored_entries);
    }

    println!("\n📁 By File Type:");
    println!("{}", "-".repeat(80));
    println!("{:<12} {:>8} {:>12} {:>12} {:>12} {:>12}", "Type", "Files", "Lines", "Words", "Size", "Tokens");
    println!("{}", "-".repeat(80));

    for item in &report.by_extension {
        println!(
            "{:<12} {:>8} {:>12} {:>12} {:>12} {:>12}",
            item.extension,
            item.files,
            item.lines,
            item.words,
            format_bytes(item.bytes),
            item.tokens,
        );
    }

    println!("{}", "-".repeat(80));
    println!(
        "{:<12} {:>8} {:>12} {:>12} {:>12} {:>12}",
        "TOTAL",
        report.summary.files,
        report.summary.lines,
        report.summary.words,
        format_bytes(report.summary.bytes),
        report.summary.tokens,
    );

    if show_files {
        if let Some(files) = &report.files {
            if !files.is_empty() {
                println!("\n📄 Individual Files:");
                println!("{}", "-".repeat(80));
                println!("{:<50} {:>10} {:>10} {:>10} {:>10}", "File", "Lines", "Words", "Size", "Tokens");
                println!("{}", "-".repeat(80));

                for file in files {
                    let mut p = file.path.clone();
                    if p.len() > 50 {
                        p = format!("...{}", &p[p.len() - 47..]);
                    }
                    println!(
                        "{:<50} {:>10} {:>10} {:>10} {:>10}",
                        p,
                        file.lines,
                        file.words,
                        format_bytes(file.bytes),
                        file.tokens,
                    );
                }
            }
        }
    }

    println!("\n💡 Token Information:");
    println!("{}", "-".repeat(80));
    println!("⚠️  Using rough estimation (~1 token per 4 characters)");
    println!("Total tokens: {}", report.summary.tokens);
    if report.summary.files > 0 {
        println!("Average tokens per file: {:.0}", report.summary.average_tokens_per_file);
        println!(
            "Approx input cost (GPT-3.5-turbo): ${:.4}",
            report.summary.estimated_input_cost_usd
        );
    }
    println!("{}", "=".repeat(80));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_kernelignore_patterns() {
        let patterns = parse_ignore_file("# comment\n.obsidian/\n*.json\n!keep.json\n");
        assert_eq!(patterns.len(), 3);
        assert!(patterns[0].directory_only);
        assert_eq!(patterns[1].pattern, "*.json");
        assert!(patterns[2].negated);
    }

    #[test]
    fn ignores_json_and_obsidian_paths() {
        let patterns = parse_ignore_file(".obsidian/\n*.json\n");
        assert!(should_ignore(Path::new(".obsidian/workspace.json"), &patterns, false));
        assert!(should_ignore(Path::new("notes/data.json"), &patterns, false));
        assert!(!should_ignore(Path::new("notes/readme.md"), &patterns, false));
    }
}
