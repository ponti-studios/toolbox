use assert_cmd::Command;
use base64::Engine;
use predicates::prelude::*;
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn base64_encode(s: &str) -> String {
    base64::engine::general_purpose::STANDARD.encode(s)
}

#[test]
fn test_cli_help() {
    let mut cmd = Command::cargo_bin("gimme").expect("binary exists");
    cmd.arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Copy files from GitHub"));
}

#[test]
fn test_cli_requires_source() {
    let mut cmd = Command::cargo_bin("gimme").expect("binary exists");
    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("required"));
}

#[test]
fn test_parse_invalid_url_shows_error() {
    let mut cmd = Command::cargo_bin("gimme").expect("binary exists");
    cmd.arg("invalid-url")
        .assert()
        .failure()
        .stderr(predicate::str::contains("Invalid"));
}

#[tokio::test]
async fn test_mock_github_api_returns_file() {
    let mock_server = MockServer::start().await;

    let content = "Hello, World!";
    let encoded = base64_encode(content);

    Mock::given(method("GET"))
        .and(path("/repos/owner/repo/contents/test.txt"))
        .and(header("User-Agent", "gimme-cli"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "name": "test.txt",
            "path": "test.txt",
            "sha": "abc123",
            "size": 13,
            "content": encoded,
            "encoding": "base64"
        })))
        .mount(&mock_server)
        .await;

    let url = format!(
        "{}/repos/owner/repo/contents/test.txt?ref=main",
        mock_server.uri()
    );
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", "gimme-cli")
        .send()
        .await
        .expect("request succeeds");

    assert_eq!(response.status(), 200);

    let body: serde_json::Value = response.json().await.expect("json body");
    let file_content = body["content"].as_str().expect("content field");
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(file_content)
        .expect("base64 decode");
    assert_eq!(String::from_utf8(decoded).expect("utf8"), content);
}

#[tokio::test]
async fn test_mock_github_api_404() {
    let mock_server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/repos/owner/repo/contents/notfound.txt"))
        .and(header("User-Agent", "gimme-cli"))
        .respond_with(ResponseTemplate::new(404))
        .mount(&mock_server)
        .await;

    let url = format!(
        "{}/repos/owner/repo/contents/notfound.txt?ref=main",
        mock_server.uri()
    );
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", "gimme-cli")
        .send()
        .await
        .expect("request succeeds");

    assert_eq!(response.status(), 404);
}

#[tokio::test]
async fn test_mock_github_api_auth_required() {
    let mock_server = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/repos/private/repo/contents/secret.txt"))
        .and(header("User-Agent", "gimme-cli"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&mock_server)
        .await;

    let url = format!(
        "{}/repos/private/repo/contents/secret.txt?ref=main",
        mock_server.uri()
    );
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", "gimme-cli")
        .send()
        .await
        .expect("request succeeds");

    assert_eq!(response.status(), 401);
}
