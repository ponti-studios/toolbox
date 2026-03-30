use crate::error::{GimmeError, Result};
use crate::parser::GitHubFile;
use base64::Engine;
use reqwest::Client;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GitHubFileResponse {
    name: String,
    path: String,
    sha: String,
    size: u64,
    content: Option<String>,
    encoding: Option<String>,
    download_url: Option<String>,
}

pub struct GitHubClient {
    client: Client,
    token: Option<String>,
}

impl GitHubClient {
    pub fn new() -> Self {
        let token = std::env::var("GITHUB_TOKEN").ok();
        Self {
            client: Client::new(),
            token,
        }
    }

    #[allow(dead_code)]
    pub fn with_token(token: String) -> Self {
        Self {
            client: Client::new(),
            token: Some(token),
        }
    }

    #[cfg(test)]
    #[allow(dead_code)]
    pub fn with_mock(client: Client) -> Self {
        Self {
            client,
            token: None,
        }
    }

    pub async fn fetch_file(&self, file: &GitHubFile) -> Result<String> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/contents/{}?ref={}",
            file.owner, file.repo, file.path, file.reference
        );

        let mut request = self.client.get(&url).header("User-Agent", "gimme-cli");

        if let Some(token) = &self.token {
            request = request.header("Authorization", format!("Bearer {}", token));
        }

        let response = request
            .send()
            .await
            .map_err(|e| GimmeError::FetchError(e.to_string()))?;

        let status = response.status().as_u16();
        if status == 404 {
            return Err(GimmeError::ApiError {
                status,
                message: "File not found".to_string(),
            });
        }
        if status == 401 {
            return Err(GimmeError::ApiError {
                status,
                message: "Authentication required. Set GITHUB_TOKEN.".to_string(),
            });
        }
        if status == 403 {
            return Err(GimmeError::ApiError {
                status,
                message: "Rate limited or forbidden. Try setting GITHUB_TOKEN.".to_string(),
            });
        }
        if !response.status().is_success() {
            let msg = response.text().await.unwrap_or_default();
            return Err(GimmeError::ApiError {
                status,
                message: msg,
            });
        }

        let file_resp: GitHubFileResponse = response
            .json()
            .await
            .map_err(|e| GimmeError::FetchError(e.to_string()))?;

        if let (Some(content), Some("base64")) = (file_resp.content, file_resp.encoding.as_deref())
        {
            let decoded = base64::engine::general_purpose::STANDARD
                .decode(content.trim())
                .map_err(|e| GimmeError::FetchError(format!("Failed to decode base64: {}", e)))?;
            String::from_utf8(decoded)
                .map_err(|e| GimmeError::FetchError(format!("Failed to decode UTF-8: {}", e)))
        } else if let Some(download_url) = file_resp.download_url {
            let content = self
                .client
                .get(&download_url)
                .header("User-Agent", "gimme-cli")
                .send()
                .await
                .map_err(|e| GimmeError::FetchError(e.to_string()))?
                .text()
                .await
                .map_err(|e| GimmeError::FetchError(e.to_string()))?;
            Ok(content)
        } else {
            Err(GimmeError::FetchError(
                "Unable to get file content".to_string(),
            ))
        }
    }
}

impl Default for GitHubClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_without_token() {
        let client = GitHubClient::new();
        assert!(client.token.is_none());
    }

    #[test]
    fn test_client_with_token() {
        let client = GitHubClient::with_token("test-token".to_string());
        assert_eq!(client.token, Some("test-token".to_string()));
    }
}
