use anyhow::{Context, Result};
use calamine::{open_workbook_auto, Reader};
use clap::{Parser, Subcommand, ValueEnum};
use csv::{ReaderBuilder, WriterBuilder};
use glob::glob;
use md5::Md5;
use regex::Regex;
use serde::Serialize;
use sha1::Sha1;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

#[derive(Subcommand)]
pub enum FileOpsCmd {
    /// Merge multiple markdown files into one.
    MergeMarkdown(MergeMarkdownOpts),
    /// Find duplicate files in a directory.
    FindDuplicates(FindDuplicatesOpts),
    /// Rename files in bulk using regex.
    BulkRename(BulkRenameOpts),
    /// Convert between JSON and CSV.
    Convert(ConvertOpts),
    /// Convert XLSX workbooks to CSV files.
    XlsxToCsv(XlsxToCsvOpts),
}

#[derive(Parser, Debug)]
pub struct MergeMarkdownOpts {
    /// Output markdown file.
    pub output: PathBuf,

    /// Input markdown files or glob patterns.
    #[arg(required = true)]
    pub input_files: Vec<String>,

    /// Include a table of contents.
    #[arg(long)]
    pub toc: bool,

    /// Add each input file as a section header.
    #[arg(long = "with-filenames")]
    pub with_filenames: bool,
}

#[derive(Debug, Clone, ValueEnum)]
pub enum HashAlgorithm {
    Md5,
    Sha1,
    Sha256,
}

#[derive(Parser, Debug)]
pub struct FindDuplicatesOpts {
    /// Directory to search.
    pub directory: PathBuf,

    /// Hash algorithm to use.
    #[arg(long, value_enum, default_value_t = HashAlgorithm::Md5)]
    pub algorithm: HashAlgorithm,

    /// Minimum file size in bytes.
    #[arg(long = "min-size", default_value_t = 0)]
    pub min_size: u64,

    /// Only check files with these extensions.
    #[arg(long, num_args = 1..)]
    pub extensions: Vec<String>,

    /// Show hashes in output.
    #[arg(long = "show-hashes")]
    pub show_hashes: bool,
}

#[derive(Parser, Debug)]
pub struct BulkRenameOpts {
    /// Directory containing files to rename.
    pub directory: PathBuf,

    /// Regex pattern to match.
    #[arg(long)]
    pub pattern: String,

    /// Replacement string.
    #[arg(long)]
    pub replacement: String,

    /// Only rename files with these extensions.
    #[arg(long, num_args = 1..)]
    pub extensions: Vec<String>,

    /// Only process files in the specified directory.
    #[arg(long = "no-recursive")]
    pub no_recursive: bool,

    /// Actually apply renames.
    #[arg(long)]
    pub apply: bool,
}

#[derive(Parser, Debug)]
pub struct ConvertOpts {
    /// Input file.
    pub input: PathBuf,

    /// Output file.
    pub output: PathBuf,

    /// Don't flatten nested JSON objects when converting JSON to CSV.
    #[arg(long = "no-flatten")]
    pub no_flatten: bool,

    /// Separator for flattened nested keys.
    #[arg(long, default_value = ".")]
    pub separator: String,

    /// Force CSV to JSON conversion.
    #[arg(long = "csv-to-json")]
    pub csv_to_json: bool,
}

#[derive(Parser, Debug)]
pub struct XlsxToCsvOpts {
    /// Directory containing xlsx files.
    #[arg(short, long)]
    pub directory: Option<PathBuf>,

    /// Single xlsx file to convert.
    #[arg(short, long)]
    pub file: Option<PathBuf>,

    /// Convert all sheets in each workbook.
    #[arg(short = 'a', long = "all-sheets")]
    pub all_sheets: bool,

    /// Best-effort formula preservation (xlsx formulas are typically exported as cached values).
    #[arg(long = "keep-formulas")]
    pub keep_formulas: bool,
}

#[derive(Debug, Serialize)]
struct DuplicateGroup {
    hash: String,
    files: Vec<String>,
}

fn normalize_extensions(extensions: &[String]) -> BTreeSet<String> {
    extensions
        .iter()
        .map(|ext| {
            if ext.starts_with('.') {
                ext.to_ascii_lowercase()
            } else {
                format!(".{}", ext.to_ascii_lowercase())
            }
        })
        .collect()
}

fn matches_extension(path: &Path, allowed: &BTreeSet<String>) -> bool {
    if allowed.is_empty() {
        return true;
    }
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| format!(".{}", s.to_ascii_lowercase()));
    match ext {
        Some(ext) => allowed.contains(&ext),
        None => allowed.contains("no-ext"),
    }
}

fn expand_input_files(input_files: &[String]) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    for input in input_files {
        if input.contains('*') || input.contains('?') || input.contains('[') {
            let mut matches: Vec<PathBuf> = glob(input)
                .with_context(|| format!("invalid glob pattern: {}", input))?
                .filter_map(|entry| entry.ok())
                .collect();
            matches.sort();
            files.extend(matches);
        } else {
            files.push(PathBuf::from(input));
        }
    }
    files.sort();
    files.dedup();
    Ok(files)
}

fn slugify_heading(text: &str) -> String {
    let mut slug = String::new();
    let mut prev_dash = false;
    for ch in text.chars().flat_map(|c| c.to_lowercase()) {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
            prev_dash = false;
        } else if !prev_dash {
            slug.push('-');
            prev_dash = true;
        }
    }
    slug.trim_matches('-').to_string()
}

pub fn run_merge_markdown(opts: MergeMarkdownOpts) -> Result<()> {
    let input_files = expand_input_files(&opts.input_files)?;
    if input_files.is_empty() {
        anyhow::bail!("no input files found");
    }

    let mut merged = String::new();
    let mut toc_entries = Vec::new();
    let mut merged_count = 0usize;

    if opts.with_filenames {
        merged.push_str("# Merged Document\n\n");
        merged.push_str(&format!("Generated: {}\n\n---\n\n", chrono::Local::now().format("%Y-%m-%d %H:%M:%S")));
    }

    for file_path in &input_files {
        if !file_path.exists() {
            eprintln!("⚠️  Warning: File not found: {}", file_path.display());
            continue;
        }
        if !file_path.is_file() {
            eprintln!("⚠️  Warning: Not a file: {}", file_path.display());
            continue;
        }

        let content = fs::read_to_string(file_path)
            .with_context(|| format!("reading {}", file_path.display()))?;

        if opts.with_filenames {
            let heading = file_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("untitled")
                .to_string();
            toc_entries.push((heading.clone(), slugify_heading(&heading)));
            merged.push_str(&format!("## {}\n\n", heading));
        }

        merged.push_str(&content);
        if !content.ends_with('\n') {
            merged.push('\n');
        }
        merged.push('\n');
        merged_count += 1;
    }

    let mut final_content = String::new();
    if opts.toc && !toc_entries.is_empty() {
        final_content.push_str("# Table of Contents\n\n");
        for (heading, anchor) in &toc_entries {
            final_content.push_str(&format!("- [{}](#{})\n", heading, anchor));
        }
        final_content.push_str("\n---\n\n");
    }
    final_content.push_str(&merged);

    fs::write(&opts.output, &final_content)
        .with_context(|| format!("writing {}", opts.output.display()))?;

    let lines = final_content.lines().count();
    let words = final_content.split_whitespace().count();
    println!("✅ Merged {} files into {}", merged_count, opts.output.display());
    println!("   Lines: {}", lines);
    println!("   Words: {}", words);
    Ok(())
}

fn hash_file(path: &Path, algorithm: &HashAlgorithm) -> Result<String> {
    let mut file = fs::File::open(path).with_context(|| format!("opening {}", path.display()))?;
    let mut buf = [0u8; 8192];

    match algorithm {
        HashAlgorithm::Md5 => {
            let mut hasher = Md5::new();
            loop {
                let n = file.read(&mut buf)?;
                if n == 0 { break; }
                hasher.update(&buf[..n]);
            }
            Ok(format!("{:x}", hasher.finalize()))
        }
        HashAlgorithm::Sha1 => {
            let mut hasher = Sha1::new();
            loop {
                let n = file.read(&mut buf)?;
                if n == 0 { break; }
                hasher.update(&buf[..n]);
            }
            Ok(format!("{:x}", hasher.finalize()))
        }
        HashAlgorithm::Sha256 => {
            let mut hasher = Sha256::new();
            loop {
                let n = file.read(&mut buf)?;
                if n == 0 { break; }
                hasher.update(&buf[..n]);
            }
            Ok(format!("{:x}", hasher.finalize()))
        }
    }
}

pub fn run_find_duplicates(opts: FindDuplicatesOpts) -> Result<()> {
    let allowed = normalize_extensions(&opts.extensions);
    let mut size_groups: BTreeMap<u64, Vec<PathBuf>> = BTreeMap::new();

    for entry in WalkDir::new(&opts.directory).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if !matches_extension(path, &allowed) {
            continue;
        }
        let size = match path.metadata() {
            Ok(meta) if meta.len() >= opts.min_size => meta.len(),
            _ => continue,
        };
        size_groups.entry(size).or_default().push(path.to_path_buf());
    }

    let mut groups: BTreeMap<String, Vec<PathBuf>> = BTreeMap::new();
    for (_size, files) in size_groups {
        if files.len() < 2 {
            continue;
        }
        for file in files {
            let hash = hash_file(&file, &opts.algorithm)?;
            groups.entry(hash).or_default().push(file);
        }
    }

    let duplicates: Vec<DuplicateGroup> = groups
        .into_iter()
        .filter(|(_, files)| files.len() > 1)
        .map(|(hash, mut files)| {
            files.sort();
            DuplicateGroup {
                hash,
                files: files.into_iter().map(|p| p.display().to_string()).collect(),
            }
        })
        .collect();

    if duplicates.is_empty() {
        println!("✅ No duplicates found!");
        return Ok(());
    }

    println!("\n📋 Found {} duplicate groups\n", duplicates.len());
    let mut total_duplicate_files = 0usize;
    let mut total_wasted_space = 0u64;

    for (i, group) in duplicates.iter().enumerate() {
        println!("Group {}:", i + 1);
        if opts.show_hashes {
            println!("  Hash: {}", group.hash);
        }
        let mut sizes: Vec<(u64, &String)> = group
            .files
            .iter()
            .map(|p| {
                let size = fs::metadata(p).map(|m| m.len()).unwrap_or(0);
                (size, p)
            })
            .collect();
        sizes.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(b.1)));

        for (idx, (size, path)) in sizes.iter().enumerate() {
            let marker = if idx == 0 { "  ✓ KEEP" } else { "  ✗ DELETE" };
            println!("    {}: {} ({:.2} MB)", marker, path, *size as f64 / (1024.0 * 1024.0));
        }

        if let Some((size, _)) = sizes.first() {
            total_duplicate_files += sizes.len() - 1;
            total_wasted_space += *size * (sizes.len() as u64 - 1);
        }
        println!();
    }

    println!("📊 Summary:");
    println!("  Total duplicate files: {}", total_duplicate_files);
    println!("  Potential space to free: {:.2} MB", total_wasted_space as f64 / (1024.0 * 1024.0));
    Ok(())
}

fn normalize_backrefs(replacement: &str) -> String {
    let mut out = String::new();
    let chars: Vec<char> = replacement.chars().collect();
    let mut i = 0usize;
    while i < chars.len() {
        if chars[i] == '\\' {
            let mut j = i;
            while j < chars.len() && chars[j] == '\\' {
                j += 1;
            }
            if j < chars.len() && chars[j].is_ascii_digit() {
                out.push('$');
                out.push(chars[j]);
                i = j + 1;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn apply_template_vars(filepath: &Path, template: &str) -> String {
    let name = filepath.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
    let ext = filepath
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| format!(".{}", s))
        .unwrap_or_default();
    let parent = filepath
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let datetime = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string();

    let vars = [
        ("{name}", name.as_str()),
        ("{ext}", ext.as_str()),
        ("{parent}", parent.as_str()),
        ("{date}", date.as_str()),
        ("{datetime}", datetime.as_str()),
        ("{timestamp}", timestamp.as_str()),
    ];

    let mut out = template.to_string();
    for (needle, value) in vars {
        out = out.replace(needle, value);
    }
    out
}

pub fn run_bulk_rename(opts: BulkRenameOpts) -> Result<()> {
    if !opts.directory.exists() {
        anyhow::bail!("directory not found: {}", opts.directory.display());
    }
    let regex = Regex::new(&opts.pattern).with_context(|| format!("invalid regex: {}", opts.pattern))?;
    let allowed = normalize_extensions(&opts.extensions);
    let replacement = normalize_backrefs(&opts.replacement);

    let entries: Vec<PathBuf> = if opts.no_recursive {
        fs::read_dir(&opts.directory)
            .with_context(|| format!("reading {}", opts.directory.display()))?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .collect()
    } else {
        WalkDir::new(&opts.directory)
            .into_iter()
            .filter_map(|e| e.ok().map(|e| e.path().to_path_buf()))
            .collect()
    };

    let mut matches = Vec::new();
    for path in entries {
        if !path.is_file() {
            continue;
        }
        if !matches_extension(&path, &allowed) {
            continue;
        }
        if regex.is_match(path.file_name().and_then(|s| s.to_str()).unwrap_or("")) {
            matches.push(path);
        }
    }

    if matches.is_empty() {
        println!("⚠️  No files matching the pattern found");
        return Ok(());
    }

    println!("📋 Found {} matching files\n", matches.len());
    matches.sort();
    for filepath in &matches {
        let old_name = filepath.file_name().and_then(|s| s.to_str()).unwrap_or("");
        let mut new_name = regex.replace(old_name, replacement.as_str()).to_string();
        if new_name.contains('{') && new_name.contains('}') {
            new_name = apply_template_vars(filepath, &new_name);
        }
        let new_path = filepath.parent().unwrap_or(Path::new(".")).join(&new_name);

        if new_path == *filepath {
            println!("⊘ SKIP: {} (no change)", old_name);
            continue;
        }
        if new_path.exists() {
            println!("⚠️  SKIP: {} → {} (destination exists)", old_name, new_name);
            continue;
        }

        if opts.apply {
            fs::rename(filepath, &new_path)
                .with_context(|| format!("renaming {} to {}", filepath.display(), new_path.display()))?;
            println!("✅ {} → {}", old_name, new_name);
        } else {
            println!("→ {}", old_name);
            println!("  └─ {}", new_name);
        }
    }

    if !opts.apply {
        println!("\n💡 Use --apply to actually rename files");
    }
    Ok(())
}

fn flatten_json_value(value: &serde_json::Value, prefix: &str, sep: &str, out: &mut BTreeMap<String, String>) {
    match value {
        serde_json::Value::Object(map) => {
            for (k, v) in map {
                let next = if prefix.is_empty() { k.clone() } else { format!("{}{}{}", prefix, sep, k) };
                flatten_json_value(v, &next, sep, out);
            }
        }
        serde_json::Value::Array(items) => {
            for (i, v) in items.iter().enumerate() {
                let next = if prefix.is_empty() { i.to_string() } else { format!("{}{}{}", prefix, sep, i) };
                flatten_json_value(v, &next, sep, out);
            }
        }
        _ => {
            out.insert(prefix.to_string(), match value {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Null => String::new(),
                _ => value.to_string(),
            });
        }
    }
}

pub fn run_convert(opts: ConvertOpts) -> Result<()> {
    if !opts.input.exists() {
        anyhow::bail!("input file not found: {}", opts.input.display());
    }

    let force_csv_to_json = opts.csv_to_json || opts.input.extension().and_then(|s| s.to_str()).map(|s| s.eq_ignore_ascii_case("csv")).unwrap_or(false);
    if force_csv_to_json {
        let mut rdr = ReaderBuilder::new().from_path(&opts.input)
            .with_context(|| format!("reading {}", opts.input.display()))?;
        let headers = rdr.headers()?.clone();
        let mut rows = Vec::new();
        for result in rdr.records() {
            let rec = result?;
            let mut obj = serde_json::Map::new();
            for (h, v) in headers.iter().zip(rec.iter()) {
                obj.insert(h.to_string(), serde_json::Value::String(v.to_string()));
            }
            rows.push(serde_json::Value::Object(obj));
        }
        fs::write(&opts.output, serde_json::to_string_pretty(&rows)?).with_context(|| format!("writing {}", opts.output.display()))?;
        println!("✅ Converted {} to {}", opts.input.display(), opts.output.display());
        println!("   Rows: {}", rows.len());
        return Ok(());
    }

    let content = fs::read_to_string(&opts.input).with_context(|| format!("reading {}", opts.input.display()))?;
    let data: serde_json::Value = serde_json::from_str(&content).with_context(|| format!("parsing JSON {}", opts.input.display()))?;
    let items: Vec<serde_json::Value> = match data {
        serde_json::Value::Array(items) => items,
        serde_json::Value::Object(_) => vec![data],
        _ => anyhow::bail!("JSON must be an object or array"),
    };

    let mut flattened = Vec::new();
    for item in items {
        let mut map = BTreeMap::new();
        if opts.no_flatten {
            if let serde_json::Value::Object(obj) = item {
                for (k, v) in obj {
                    map.insert(k, match v {
                        serde_json::Value::String(s) => s,
                        serde_json::Value::Null => String::new(),
                        _ => v.to_string(),
                    });
                }
            } else {
                map.insert("value".to_string(), item.to_string());
            }
        } else {
            flatten_json_value(&item, "", &opts.separator, &mut map);
        }
        flattened.push(map);
    }

    if flattened.is_empty() {
        println!("⚠️  JSON array is empty");
        return Ok(());
    }

    let mut keys = BTreeSet::new();
    for row in &flattened {
        for key in row.keys() {
            keys.insert(key.clone());
        }
    }
    let keys: Vec<String> = keys.into_iter().collect();

    let mut wtr = WriterBuilder::new().from_path(&opts.output)
        .with_context(|| format!("writing {}", opts.output.display()))?;
    wtr.write_record(&keys)?;
    for row in &flattened {
        let record: Vec<String> = keys.iter().map(|k| row.get(k).cloned().unwrap_or_default()).collect();
        wtr.write_record(&record)?;
    }
    wtr.flush()?;

    println!("✅ Converted {} to {}", opts.input.display(), opts.output.display());
    println!("   Rows: {}", flattened.len());
    println!("   Columns: {}", keys.len());
    Ok(())
}

fn sanitize_component(text: &str) -> String {
    let mut out = String::new();
    let mut last_was_sep = false;
    for ch in text.chars() {
        let ok = ch.is_ascii_alphanumeric() || ch == '-' || ch == '_';
        if ok {
            out.push(ch);
            last_was_sep = false;
        } else if !last_was_sep {
            out.push('_');
            last_was_sep = true;
        }
    }
    out.trim_matches('_').to_string()
}

fn xlsx_output_path(input: &Path, sheet_name: Option<&str>) -> PathBuf {
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    let parent = input.parent().unwrap_or_else(|| Path::new("."));
    match sheet_name {
        Some(sheet) => parent.join(format!("{}_{}.csv", stem, sanitize_component(sheet))),
        None => input.with_extension("csv"),
    }
}

fn cell_to_string<T: ToString>(cell: &T, keep_formulas: bool) -> String {
    let s = cell.to_string();
    if keep_formulas && s.starts_with('=') {
        s
    } else {
        s
    }
}

fn write_sheet_csv<T: ToString>(rows: &[Vec<T>], output: &Path, keep_formulas: bool) -> Result<()> {
    let mut writer = WriterBuilder::new()
        .from_path(output)
        .with_context(|| format!("writing {}", output.display()))?;

    if rows.is_empty() {
        writer.flush()?;
        return Ok(());
    }

    let headers: Vec<String> = rows[0]
        .iter()
        .map(|cell| cell_to_string(cell, keep_formulas))
        .collect();
    writer.write_record(&headers)?;

    for row in &rows[1..] {
        let record: Vec<String> = row.iter().map(|cell| cell_to_string(cell, keep_formulas)).collect();
        writer.write_record(&record)?;
    }

    writer.flush()?;
    Ok(())
}

pub fn run_xlsx_to_csv(opts: XlsxToCsvOpts) -> Result<()> {
    let workbook_paths: Vec<PathBuf> = if let Some(file) = opts.file.clone() {
        vec![file]
    } else if let Some(dir) = opts.directory.clone() {
        fs::read_dir(&dir)
            .with_context(|| format!("reading {}", dir.display()))?
            .filter_map(|entry| entry.ok().map(|e| e.path()))
            .filter(|path| path.extension().and_then(|s| s.to_str()).map(|s| s.eq_ignore_ascii_case("xlsx")).unwrap_or(false))
            .collect()
    } else {
        fs::read_dir(".")?
            .filter_map(|entry| entry.ok().map(|e| e.path()))
            .filter(|path| path.extension().and_then(|s| s.to_str()).map(|s| s.eq_ignore_ascii_case("xlsx")).unwrap_or(false))
            .collect()
    };

    if workbook_paths.is_empty() {
        anyhow::bail!("no xlsx files found");
    }

    if opts.keep_formulas {
        eprintln!("⚠️  --keep-formulas is best-effort; xlsx exports typically use cached cell values");
    }

    for workbook_path in workbook_paths {
        let mut workbook = open_workbook_auto(&workbook_path)
            .with_context(|| format!("opening {}", workbook_path.display()))?;
        let sheet_names = workbook.sheet_names().to_owned();

        if opts.all_sheets {
            for sheet_name in sheet_names {
                let range = workbook
                    .worksheet_range(&sheet_name)
                    .with_context(|| format!("reading sheet '{}' in {}", sheet_name, workbook_path.display()))?;
                let rows: Vec<Vec<String>> = range
                    .rows()
                    .map(|row| row.iter().map(|cell| cell_to_string(cell, opts.keep_formulas)).collect())
                    .collect();
                let output = xlsx_output_path(&workbook_path, Some(&sheet_name));
                write_sheet_csv(&rows, &output, opts.keep_formulas)?;
                println!("Converted: {} [{}] -> {}", workbook_path.display(), sheet_name, output.display());
            }
        } else {
            let sheet_name = sheet_names
                .first()
                .cloned()
                .ok_or_else(|| anyhow::anyhow!("workbook has no sheets: {}", workbook_path.display()))?;
            let range = workbook
                .worksheet_range(&sheet_name)
                .with_context(|| format!("reading sheet '{}' in {}", sheet_name, workbook_path.display()))?;
            let rows: Vec<Vec<String>> = range
                .rows()
                .map(|row| row.iter().map(|cell| cell_to_string(cell, opts.keep_formulas)).collect())
                .collect();
            let output = xlsx_output_path(&workbook_path, None);
            write_sheet_csv(&rows, &output, opts.keep_formulas)?;
            println!("Converted: {} -> {}", workbook_path.display(), output.display());
        }
    }

    Ok(())
}
