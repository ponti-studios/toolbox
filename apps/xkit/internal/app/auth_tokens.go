package app

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func exchangeAuthorizationCode(ctx context.Context, cfg loginConfig, code, codeVerifier string) (oauthTokenResponse, error) {
	form := url.Values{}
	form.Set("code", code)
	form.Set("grant_type", "authorization_code")
	form.Set("redirect_uri", cfg.RedirectURI)
	form.Set("code_verifier", codeVerifier)
	if strings.TrimSpace(cfg.ClientSecret) == "" {
		form.Set("client_id", cfg.ClientID)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return oauthTokenResponse{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if strings.TrimSpace(cfg.ClientSecret) != "" {
		req.Header.Set("Authorization", "Basic "+basicAuth(cfg.ClientID, cfg.ClientSecret))
	}

	resp, err := (&http.Client{Timeout: cfg.Timeout}).Do(req)
	if err != nil {
		return oauthTokenResponse{}, err
	}
	defer resp.Body.Close()

	payload, err := io.ReadAll(resp.Body)
	if err != nil {
		return oauthTokenResponse{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return oauthTokenResponse{}, fmt.Errorf("token exchange failed (%s): %s", resp.Status, summarizeHTTPError(payload))
	}

	var out oauthTokenResponse
	if err := json.Unmarshal(payload, &out); err != nil {
		return oauthTokenResponse{}, err
	}
	return out, nil
}

func refreshSession(ctx context.Context, client *http.Client, sess session) (session, error) {
	if strings.TrimSpace(sess.RefreshToken) == "" {
		return session{}, fmt.Errorf("saved session does not include a refresh token; run xkit login again")
	}

	form := url.Values{}
	form.Set("refresh_token", sess.RefreshToken)
	form.Set("grant_type", "refresh_token")
	if sess.AuthMode == "confidential" {
		if strings.TrimSpace(envOrDefault("X_CLIENT_SECRET", "")) == "" {
			return session{}, fmt.Errorf("this session was created with a confidential client; set X_CLIENT_SECRET and try again")
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenEndpoint, strings.NewReader(form.Encode()))
		if err != nil {
			return session{}, err
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Authorization", "Basic "+basicAuth(sess.ClientID, envOrDefault("X_CLIENT_SECRET", "")))
		resp, err := client.Do(req)
		if err != nil {
			return session{}, err
		}
		defer resp.Body.Close()
		payload, err := io.ReadAll(resp.Body)
		if err != nil {
			return session{}, err
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return session{}, fmt.Errorf("refresh failed (%s): %s", resp.Status, summarizeHTTPError(payload))
		}
		var out oauthTokenResponse
		if err := json.Unmarshal(payload, &out); err != nil {
			return session{}, err
		}
		return updateSessionFromToken(sess, out), nil
	}

	form.Set("client_id", sess.ClientID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return session{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := client.Do(req)
	if err != nil {
		return session{}, err
	}
	defer resp.Body.Close()
	payload, err := io.ReadAll(resp.Body)
	if err != nil {
		return session{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return session{}, fmt.Errorf("refresh failed (%s): %s", resp.Status, summarizeHTTPError(payload))
	}
	var out oauthTokenResponse
	if err := json.Unmarshal(payload, &out); err != nil {
		return session{}, err
	}
	return updateSessionFromToken(sess, out), nil
}

func updateSessionFromToken(sess session, token oauthTokenResponse) session {
	if token.AccessToken != "" {
		sess.AccessToken = token.AccessToken
	}
	if token.RefreshToken != "" {
		sess.RefreshToken = token.RefreshToken
	}
	if token.TokenType != "" {
		sess.TokenType = token.TokenType
	}
	if token.Scope != "" {
		sess.Scopes = normalizeScopes(token.Scope)
	}
	if token.ExpiresIn > 0 {
		sess.ExpiresAt = time.Now().Add(time.Duration(token.ExpiresIn) * time.Second)
	}
	sess.UpdatedAt = time.Now()
	return sess
}

func fetchCurrentUser(ctx context.Context, client *http.Client, bearer string) (meResponse, error) {
	endpoint := defaultBaseURL + "/users/me?user.fields=created_at,description,verified,public_metrics,profile_image_url"
	var out meResponse
	status, err := doJSON(ctx, client, http.MethodGet, endpoint, bearer, nil, &out)
	if err != nil {
		if status == http.StatusUnauthorized {
			return meResponse{}, errUnauthorized
		}
		return meResponse{}, err
	}
	return out, nil
}

func ensureFreshSession(ctx context.Context, client *http.Client, sess session) (session, error) {
	if sess.isExpiringSoon() {
		refreshed, err := refreshSession(ctx, client, sess)
		if err != nil {
			return session{}, err
		}
		return refreshed, nil
	}
	return sess, nil
}
