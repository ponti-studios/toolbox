package app

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func performLogin(ctx context.Context, cfg loginConfig) (session, error) {
	state, err := randomString(24)
	if err != nil {
		return session{}, err
	}
	verifier, err := randomString(48)
	if err != nil {
		return session{}, err
	}
	challenge := pkceChallenge(verifier)

	callback, server, err := startAuthCallbackServer(cfg.RedirectURI, state)
	if err != nil {
		return session{}, err
	}
	defer server.Close()

	authURL, err := buildAuthorizeURL(cfg.ClientID, cfg.RedirectURI, cfg.Scopes, state, challenge)
	if err != nil {
		return session{}, err
	}

	logInfo("open this URL to authorize xkit: %s", authURL)
	if !cfg.NoBrowser {
		if err := openBrowser(authURL); err == nil {
			logInfo("opened your browser automatically")
		} else {
			logWarn("could not open browser automatically: %v", err)
		}
	}

	result, err := waitForAuthCode(ctx, callback, cfg.Timeout)
	if err != nil {
		return session{}, err
	}
	if result.Err != "" {
		return session{}, fmt.Errorf("authorization failed: %s", result.Err)
	}
	if result.State != state {
		return session{}, fmt.Errorf("authorization state mismatch")
	}

	tokenResp, err := exchangeAuthorizationCode(ctx, cfg, result.Code, verifier)
	if err != nil {
		return session{}, err
	}

	me, err := fetchCurrentUser(ctx, &http.Client{Timeout: cfg.Timeout}, tokenResp.AccessToken)
	if err != nil {
		return session{}, err
	}

	return session{
		AuthMode:     authMode(cfg.ClientSecret),
		ClientID:     cfg.ClientID,
		RedirectURI:  cfg.RedirectURI,
		UserID:       me.Data.ID,
		Username:     me.Data.Username,
		Name:         me.Data.Name,
		AccessToken:  tokenResp.AccessToken,
		RefreshToken: tokenResp.RefreshToken,
		TokenType:    tokenResp.TokenType,
		Scopes:       normalizeScopes(tokenResp.Scope),
		ExpiresAt:    time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second),
		UpdatedAt:    time.Now(),
	}, nil
}

func buildAuthorizeURL(clientID, redirectURI string, scopes []string, state, codeChallenge string) (string, error) {
	u, err := url.Parse(defaultAuthEndpoint)
	if err != nil {
		return "", err
	}
	q := u.Query()
	q.Set("response_type", "code")
	q.Set("client_id", clientID)
	q.Set("redirect_uri", redirectURI)
	q.Set("scope", strings.Join(scopes, " "))
	q.Set("state", state)
	q.Set("code_challenge", codeChallenge)
	q.Set("code_challenge_method", "S256")
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func authMode(clientSecret string) string {
	if strings.TrimSpace(clientSecret) != "" {
		return "confidential"
	}
	return "public"
}
