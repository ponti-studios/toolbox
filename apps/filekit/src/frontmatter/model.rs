use files::ParsedFrontmatter;
use serde::Serialize;
use std::collections::HashMap;

pub type ParsedFile = ParsedFrontmatter;

#[derive(Debug, Clone)]
pub struct SchemaDefinition {
    pub required: Vec<&'static str>,
    pub defaults: HashMap<&'static str, &'static str>,
    pub validators: HashMap<&'static str, ValidatorConfig>,
}

#[derive(Debug, Clone)]
pub struct ValidatorConfig {
    pub allowed: Vec<&'static str>,
    pub pattern: Option<&'static str>,
    pub min_length: Option<usize>,
    pub max_length: Option<usize>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
    pub pointer: String,
}

#[derive(Debug, Serialize)]
pub struct FileValidationResult {
    pub path: String,
    pub valid: bool,
    pub errors: Vec<ValidationError>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ValidationSummary {
    pub processed_files: usize,
    pub valid_files: usize,
    pub error_files: usize,
    pub exit_code: i32,
}

#[derive(Debug, Serialize)]
pub struct ValidationReport {
    pub files: Vec<FileValidationResult>,
    pub summary: ValidationSummary,
}

#[derive(Debug, Serialize)]
pub struct FieldChange {
    pub before: String,
    pub after: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
pub struct FileMigrationResult {
    pub path: String,
    pub changed: bool,
    pub wrote: bool,
    pub backup_path: Option<String>,
    pub changes: HashMap<String, FieldChange>,
    pub validation_errors: Vec<ValidationError>,
}

#[derive(Debug, Serialize, Clone)]
pub struct MigrationSummary {
    pub processed_files: usize,
    pub changed_files: usize,
    pub error_files: usize,
    pub exit_code: i32,
}

#[derive(Debug, Serialize)]
pub struct MigrationReport {
    pub files: Vec<FileMigrationResult>,
    pub summary: MigrationSummary,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MigrationStrategy {
    Fill,
    Repair,
    Overwrite,
    Timestamps,
}
