package app

import "time"

const (
	defaultBaseURL       = "https://api.x.com/2"
	defaultRedirectURI   = "http://127.0.0.1:8765/callback"
	defaultAuthEndpoint  = "https://x.com/i/oauth2/authorize"
	tokenEndpoint        = "https://api.x.com/2/oauth2/token"
	defaultLoginWaitTime = 10 * time.Minute
	licenseRefreshSkew   = 10 * time.Minute

	retryMaxAttempts = 6
	retryBaseDelay   = 500 * time.Millisecond
	retryMaxDelay    = 30 * time.Second
)

var defaultLoginScopes = []string{"tweet.read", "tweet.write", "users.read", "offline.access"}
