package app

import "time"

type loginConfig struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string
	Scopes       []string
	NoBrowser    bool
	Timeout      time.Duration
}

type deletePostsConfig struct {
	BaseURL    string
	MaxResults int
	Exclude    []string
	DryRun     bool
	Yes        bool
	Limit      int
	Timeout    time.Duration
}

type session struct {
	AuthMode            string    `json:"auth_mode"`
	ClientID            string    `json:"client_id"`
	RedirectURI         string    `json:"redirect_uri"`
	UserID              string    `json:"user_id"`
	Username            string    `json:"username"`
	Name                string    `json:"name"`
	AccessToken         string    `json:"access_token"`
	RefreshToken        string    `json:"refresh_token,omitempty"`
	TokenType           string    `json:"token_type,omitempty"`
	Scopes              []string  `json:"scopes,omitempty"`
	ExpiresAt           time.Time `json:"expires_at"`
	UpdatedAt           time.Time `json:"updated_at"`
	DeleteCooldownUntil time.Time `json:"delete_cooldown_until,omitempty"`
}

type oauthTokenResponse struct {
	TokenType    string `json:"token_type"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	Scope        string `json:"scope"`
}

type meResponse struct {
	Data struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		Username string `json:"username"`
	} `json:"data"`
}

type listPostsResponse struct {
	Data []struct {
		ID string `json:"id"`
	} `json:"data"`
	Meta struct {
		NextToken   string `json:"next_token"`
		ResultCount int    `json:"result_count"`
	} `json:"meta"`
}

type deletePostResponse struct {
	Data struct {
		Deleted bool `json:"deleted"`
	} `json:"data"`
}

type authCodeResult struct {
	Code  string
	State string
	Err   string
}

func (s session) isExpiringSoon() bool {
	if s.RefreshToken == "" {
		return false
	}
	if s.ExpiresAt.IsZero() {
		return false
	}
	return time.Until(s.ExpiresAt) < 5*time.Minute
}
