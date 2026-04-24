use thiserror::Error;

#[derive(Debug, Error)]
#[allow(clippy::enum_variant_names)]
pub enum GitkitError {
    #[error("Failed to parse URL: {0}")]
    ParseError(String),

    #[error("Failed to fetch from GitHub: {0}")]
    FetchError(String),

    #[error("GitHub API error [{status}]: {message}")]
    ApiError { status: u16, message: String },
}

pub type Result<T> = std::result::Result<T, GitkitError>;
