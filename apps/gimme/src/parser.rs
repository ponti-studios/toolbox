use crate::error::{GimmeError, Result};
use regex::Regex;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitHubFile {
    pub owner: String,
    pub repo: String,
    pub path: String,
    pub reference: String,
}

impl fmt::Display for GitHubFile {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}/{}/{}@{}",
            self.owner, self.repo, self.path, self.reference
        )
    }
}

pub fn parse(input: &str) -> Result<GitHubFile> {
    let input = input.trim();

    if input.starts_with("http://") || input.starts_with("https://") {
        if input.contains("github.com") {
            parse_github_url(input)
        } else if input.contains("raw.githubusercontent.com") {
            parse_raw_url(input)
        } else {
            Err(GimmeError::ParseError(format!(
                "Unsupported URL: {}",
                input
            )))
        }
    } else if input.contains('@') {
        parse_short_format(input)
    } else {
        Err(GimmeError::ParseError(format!(
            "Invalid format. Expected URL or owner/repo/path@ref, got: {}",
            input
        )))
    }
}

fn parse_github_url(url: &str) -> Result<GitHubFile> {
    let re = Regex::new(r"https?://github\.com/([^/]+)/([^/]+)/blob/(.+)")
        .map_err(|e| GimmeError::ParseError(e.to_string()))?;

    let caps = re.captures(url).ok_or_else(|| {
        GimmeError::ParseError(format!(
            "Invalid GitHub URL format: {}. Expected: https://github.com/owner/repo/blob/ref/path",
            url
        ))
    })?;

    let rest = caps[3].to_string();
    let (reference, path) = rest.split_once('/').ok_or_else(|| {
        GimmeError::ParseError(format!(
            "Invalid GitHub URL: missing path after branch in {}",
            url
        ))
    })?;

    Ok(GitHubFile {
        owner: caps[1].to_string(),
        repo: caps[2].to_string(),
        reference: reference.to_string(),
        path: path.to_string(),
    })
}

fn parse_raw_url(url: &str) -> Result<GitHubFile> {
    let re = Regex::new(r"https?://raw\.githubusercontent\.com/([^/]+)/([^/]+)/(.+)")
        .map_err(|e| GimmeError::ParseError(e.to_string()))?;

    let caps = re.captures(url).ok_or_else(|| {
        GimmeError::ParseError(format!(
            "Invalid raw URL format: {}. Expected: https://raw.githubusercontent.com/owner/repo/ref/path",
            url
        ))
    })?;

    let rest = caps[3].to_string();
    let (reference, path) = rest.split_once('/').ok_or_else(|| {
        GimmeError::ParseError(format!(
            "Invalid raw URL: missing path after branch in {}",
            url
        ))
    })?;

    Ok(GitHubFile {
        owner: caps[1].to_string(),
        repo: caps[2].to_string(),
        reference: reference.to_string(),
        path: path.to_string(),
    })
}

fn parse_short_format(input: &str) -> Result<GitHubFile> {
    let parts: Vec<&str> = input.splitn(2, '@').collect();
    if parts.len() != 2 {
        return Err(GimmeError::ParseError(
            "Short format requires @ for branch/ref".to_string(),
        ));
    }

    let path_parts: Vec<&str> = parts[0].split('/').collect();
    if path_parts.len() < 3 {
        return Err(GimmeError::ParseError(
            "Short format requires owner/repo/path".to_string(),
        ));
    }

    let owner = path_parts[0].to_string();
    let repo = path_parts[1].to_string();
    let path = path_parts[2..].join("/");

    Ok(GitHubFile {
        owner,
        repo,
        reference: parts[1].to_string(),
        path,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_github_url_full() {
        let result = parse("https://github.com/owner/repo/blob/main/src/main.rs");
        assert!(result.is_ok());
        let file = result.unwrap();
        assert_eq!(file.owner, "owner");
        assert_eq!(file.repo, "repo");
        assert_eq!(file.reference, "main");
        assert_eq!(file.path, "src/main.rs");
    }

    #[test]
    fn test_parse_github_url_with_subpath() {
        let result = parse("https://github.com/foo/bar/blob/feature/src/lib.rs");
        assert!(result.is_ok());
        let file = result.unwrap();
        assert_eq!(file.owner, "foo");
        assert_eq!(file.repo, "bar");
        assert_eq!(file.reference, "feature");
        assert_eq!(file.path, "src/lib.rs");
    }

    #[test]
    fn test_parse_github_url_with_underscore_branch() {
        let result = parse("https://github.com/foo/bar/blob/feature_test/src/lib.rs");
        assert!(result.is_ok());
        let file = result.unwrap();
        assert_eq!(file.owner, "foo");
        assert_eq!(file.repo, "bar");
        assert_eq!(file.reference, "feature_test");
        assert_eq!(file.path, "src/lib.rs");
    }

    #[test]
    fn test_parse_raw_url() {
        let result = parse("https://raw.githubusercontent.com/owner/repo/main/README.md");
        assert!(result.is_ok());
        let file = result.unwrap();
        assert_eq!(file.owner, "owner");
        assert_eq!(file.repo, "repo");
        assert_eq!(file.reference, "main");
        assert_eq!(file.path, "README.md");
    }

    #[test]
    fn test_parse_short_format() {
        let result = parse("owner/repo/path/to/file.txt@v1.0.0");
        assert!(result.is_ok());
        let file = result.unwrap();
        assert_eq!(file.owner, "owner");
        assert_eq!(file.repo, "repo");
        assert_eq!(file.reference, "v1.0.0");
        assert_eq!(file.path, "path/to/file.txt");
    }

    #[test]
    fn test_parse_short_format_main() {
        let result = parse("owner/repo/src/main.rs");
        assert!(result.is_err());
    }

    #[test]
    fn test_invalid_url() {
        let result = parse("not-a-url");
        assert!(result.is_err());
    }

    #[test]
    fn test_display() {
        let file = GitHubFile {
            owner: "owner".to_string(),
            repo: "repo".to_string(),
            path: "path/to/file.rs".to_string(),
            reference: "main".to_string(),
        };
        assert_eq!(file.to_string(), "owner/repo/path/to/file.rs@main");
    }
}
