package app

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

func Run(args []string) error {
	if err := loadLocalEnv(); err != nil {
		logWarn("could not load local .env: %v", err)
	}
	if len(args) == 0 {
		usage()
		return nil
	}

	switch args[0] {
	case "help", "-h", "--help":
		usage()
		return nil
	case "version":
		fmt.Println("xkit dev")
		return nil
	case "activate":
		return runActivate(args[1:])
	case "login":
		return runLogin(args[1:])
	case "license-status":
		return runLicenseStatus(args[1:])
	case "whoami":
		return runWhoami(args[1:])
	case "deactivate":
		return runDeactivate(args[1:])
	case "logout":
		return runLogout(args[1:])
	case "delete-posts":
		return runDeletePosts(args[1:])
	default:
		return fmt.Errorf("unknown command %q", args[0])
	}
}

func usage() {
	fmt.Fprint(os.Stderr, `xkit - delete X posts for the authenticated user

Usage:
  xkit <command> [flags]

Commands:
  activate      Activate a paid entitlement for this device
  login         Authenticate with X and save a local session
  license-status Show the cached entitlement state
  whoami        Show the saved account and refresh it if needed
  deactivate    Remove the saved entitlement
  delete-posts  Delete posts authored by the saved account
  logout        Remove the saved session
  version       Print the build version
  help          Show this help text

Examples:
  xkit activate --license-key <key> --license-base-url <url>
  xkit login
  xkit license-status
  xkit whoami
  xkit delete-posts --dry-run
  xkit delete-posts --yes
  xkit delete-posts --user-id <id> --yes
  xkit deactivate
  xkit logout
`)
}

func runActivate(args []string) error {
	fs := flag.NewFlagSet("activate", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	licenseKey := fs.String("license-key", envOrDefault("XKIT_LICENSE_KEY", ""), "Paid xkit license key")
	baseURL := fs.String("license-base-url", envOrDefault("XKIT_LICENSE_BASE_URL", ""), "Entitlement service base URL")
	publicKey := fs.String("public-key", envOrDefault("XKIT_LICENSE_PUBLIC_KEY", ""), "Ed25519 public key (PEM or base64)")
	deviceName := fs.String("device-name", envOrDefault("XKIT_DEVICE_NAME", defaultDeviceName()), "Human-readable device name")
	deviceID := fs.String("device-id", envOrDefault("XKIT_DEVICE_ID", defaultDeviceID()), "Stable device identifier")
	timeout := fs.Duration("timeout", 30*time.Second, "HTTP timeout for activation requests")

	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, `Usage:
  xkit activate --license-key <key> --license-base-url <url> [flags]

Flags:`)
		fs.PrintDefaults()
	}

	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}

	cfg, err := buildLicenseClientConfig(strings.TrimSpace(*baseURL), strings.TrimSpace(*publicKey), strings.TrimSpace(*deviceID), strings.TrimSpace(*deviceName))
	if err != nil {
		return err
	}
	if strings.TrimSpace(*licenseKey) == "" {
		return fmt.Errorf("--license-key or XKIT_LICENSE_KEY is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()
	client := &http.Client{Timeout: *timeout}

	cache, claims, err := activateLicense(ctx, client, cfg, strings.TrimSpace(*licenseKey))
	if err != nil {
		return err
	}
	if err := saveEntitlementCache(cache); err != nil {
		return err
	}

	logInfo("license activated for %s", claims.DeviceName)
	logInfo("plan: %s", claims.Plan)
	logInfo("entitlement status: %s", claims.Status)
	if claims.CreditsRemaining > 0 {
		logInfo("cleanup packs remaining: %d", claims.CreditsRemaining)
	}
	if claims.XClientID != "" {
		logInfo("vendor X client ready; you can now run xkit login without --client-id")
	}
	return nil
}

func runLogin(args []string) error {
	fs := flag.NewFlagSet("login", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	clientID := fs.String("client-id", envOrDefault("X_CLIENT_ID", ""), "X OAuth 2.0 client ID")
	clientSecret := fs.String("client-secret", envOrDefault("X_CLIENT_SECRET", ""), "X OAuth 2.0 client secret for confidential clients")
	redirectURI := fs.String("redirect-uri", envOrDefault("X_REDIRECT_URI", defaultRedirectURI), "Redirect URI registered in the X app")
	scopes := fs.String("scopes", strings.Join(defaultLoginScopes, " "), "Space-separated OAuth scopes")
	noBrowser := fs.Bool("no-browser", false, "Do not try to open the browser automatically")
	timeout := fs.Duration("timeout", defaultLoginWaitTime, "Maximum time to wait for the callback")

	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, `Usage:
  xkit login [flags]

Flags:`)
		fs.PrintDefaults()
	}

	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}

	cfg := loginConfig{
		ClientID:     strings.TrimSpace(*clientID),
		ClientSecret: strings.TrimSpace(*clientSecret),
		RedirectURI:  strings.TrimSpace(*redirectURI),
		Scopes:       normalizeScopes(*scopes),
		NoBrowser:    *noBrowser,
		Timeout:      *timeout,
	}
	if cfg.ClientID == "" {
		cfg.ClientID = resolveEntitledClientID()
	}

	if cfg.ClientID == "" {
		return fmt.Errorf("--client-id, X_CLIENT_ID, or a saved vendor entitlement with x_client_id is required")
	}
	if cfg.RedirectURI == "" {
		return fmt.Errorf("--redirect-uri cannot be empty")
	}
	if len(cfg.Scopes) == 0 {
		return fmt.Errorf("at least one OAuth scope is required")
	}
	if !strings.Contains(cfg.RedirectURI, "127.0.0.1") && !strings.Contains(cfg.RedirectURI, "localhost") {
		return fmt.Errorf("the CLI login flow expects a loopback redirect URI; use a localhost redirect like %q", defaultRedirectURI)
	}

	ctx, cancel := context.WithTimeout(context.Background(), cfg.Timeout)
	defer cancel()

	sess, err := performLogin(ctx, cfg)
	if err != nil {
		return err
	}
	if err := saveSession(sess); err != nil {
		return err
	}

	logInfo("logged in as @%s (%s)", sess.Username, sess.UserID)
	logInfo("session saved to the system keychain")
	return nil
}

func runWhoami(args []string) error {
	fs := flag.NewFlagSet("whoami", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	jsonOut := fs.Bool("json", false, "Print the saved session as JSON")
	timeout := fs.Duration("timeout", 30*time.Second, "HTTP timeout for refresh requests")

	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, `Usage:
  xkit whoami [flags]

Flags:`)
		fs.PrintDefaults()
	}

	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}

	sess, err := loadSession()
	if err != nil {
		return fmt.Errorf("no saved session found; run xkit login first")
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()
	client := &http.Client{Timeout: *timeout}

	if sess.isExpiringSoon() {
		if refreshed, err := refreshSession(ctx, client, sess); err == nil {
			sess = refreshed
			_ = saveSession(sess)
		}
	}

	if !*jsonOut {
		logInfo("@%s (%s)", sess.Username, sess.Name)
		logInfo("user id: %s", sess.UserID)
		logInfo("auth mode: %s", sess.AuthMode)
		logInfo("scopes: %s", strings.Join(sess.Scopes, ", "))
		if !sess.ExpiresAt.IsZero() {
			logInfo("expires: %s", sess.ExpiresAt.Format(time.RFC3339))
		}
		logInfo("session storage: system keychain")
		return nil
	}

	data, err := json.MarshalIndent(sess, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(data))
	return nil
}

func runLicenseStatus(args []string) error {
	fs := flag.NewFlagSet("license-status", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	baseURL := fs.String("license-base-url", envOrDefault("XKIT_LICENSE_BASE_URL", ""), "Entitlement service base URL override")
	publicKey := fs.String("public-key", envOrDefault("XKIT_LICENSE_PUBLIC_KEY", ""), "Ed25519 public key (PEM or base64)")
	deviceName := fs.String("device-name", envOrDefault("XKIT_DEVICE_NAME", defaultDeviceName()), "Human-readable device name")
	deviceID := fs.String("device-id", envOrDefault("XKIT_DEVICE_ID", defaultDeviceID()), "Stable device identifier")
	jsonOut := fs.Bool("json", false, "Print the verified entitlement claims as JSON")
	timeout := fs.Duration("timeout", 15*time.Second, "HTTP timeout for refresh requests")

	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, `Usage:
  xkit license-status [flags]

Flags:`)
		fs.PrintDefaults()
	}

	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}

	cfg, err := buildLicenseClientConfig(strings.TrimSpace(*baseURL), strings.TrimSpace(*publicKey), strings.TrimSpace(*deviceID), strings.TrimSpace(*deviceName))
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()
	client := &http.Client{Timeout: *timeout}

	cache, claims, err := loadVerifiedEntitlement(ctx, client, cfg, false)
	if err != nil {
		return err
	}
	if cache.BaseURL != "" && strings.TrimSpace(*baseURL) == "" {
		cfg.BaseURL = cache.BaseURL
	}

	if *jsonOut {
		data, err := json.MarshalIndent(claims, "", "  ")
		if err != nil {
			return err
		}
		fmt.Println(string(data))
		return nil
	}

	logInfo("status: %s", claims.Status)
	logInfo("plan: %s", claims.Plan)
	logInfo("license id: %s", claims.Sub)
	logInfo("device: %s (%s)", claims.DeviceName, claims.DeviceID)
	if claims.MeteringMode != "" {
		logInfo("metering: %s", claims.MeteringMode)
	}
	if claims.CreditsTotal > 0 {
		logInfo("cleanup packs: %d remaining of %d", claims.CreditsRemaining, claims.CreditsTotal)
	}
	if !claims.ExpiresAt().IsZero() {
		logInfo("expires: %s", claims.ExpiresAt().Format(time.RFC3339))
	}
	if !claims.RefreshAt().IsZero() {
		logInfo("refresh after: %s", claims.RefreshAt().Format(time.RFC3339))
	}
	if claims.XClientID != "" {
		logInfo("vendor X client id: %s", claims.XClientID)
	}
	if allowedErr := claims.AllowedAt(time.Now(), cfg.DeviceID); allowedErr == nil {
		logInfo("destructive commands: allowed")
	} else {
		logWarn("destructive commands: blocked (%v)", allowedErr)
	}
	return nil
}

func runDeactivate(args []string) error {
	fs := flag.NewFlagSet("deactivate", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	force := fs.Bool("force", false, "Do not ask for confirmation")

	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, `Usage:
  xkit deactivate [flags]

Flags:`)
		fs.PrintDefaults()
	}

	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}

	if !*force {
		logInfo("this will remove the saved paid entitlement")
		fmt.Fprint(os.Stderr, "Type DEACTIVATE to continue: ")
		var confirm string
		if _, err := fmt.Fscanln(os.Stdin, &confirm); err != nil {
			return err
		}
		if confirm != "DEACTIVATE" {
			return fmt.Errorf("aborted")
		}
	}

	if err := clearEntitlementCache(); err != nil {
		return err
	}
	logInfo("entitlement removed")
	return nil
}

func runLogout(args []string) error {
	fs := flag.NewFlagSet("logout", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	force := fs.Bool("force", false, "Do not ask for confirmation")

	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, `Usage:
  xkit logout [flags]

Flags:`)
		fs.PrintDefaults()
	}

	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}

	if !*force {
		logInfo("this will remove the saved X session")
		fmt.Fprint(os.Stderr, "Type DELETE to continue: ")
		var confirm string
		if _, err := fmt.Fscanln(os.Stdin, &confirm); err != nil {
			return err
		}
		if confirm != "DELETE" {
			return fmt.Errorf("aborted")
		}
	}

	if err := clearSession(); err != nil {
		return err
	}
	logInfo("session removed")
	return nil
}

func runDeletePosts(args []string) error {
	fs := flag.NewFlagSet("delete-posts", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)

	userIDOverride := fs.String("user-id", "", "Override the authenticated user ID")
	baseURL := fs.String("base-url", defaultBaseURL, "X API base URL")
	maxResults := fs.Int("max-results", 100, "Maximum posts to fetch per page (5-100)")
	exclude := fs.String("exclude", "", "Comma-separated list of post types to exclude (replies,retweets)")
	dryRun := fs.Bool("dry-run", false, "List posts but do not delete them")
	yes := fs.Bool("yes", false, "Skip the safety confirmation prompt")
	limit := fs.Int("limit", 0, "Maximum number of posts to delete (0 = all)")
	previewCount := fs.Int("preview-count", 10, "Number of post IDs to show in the confirmation preview")
	timeout := fs.Duration("timeout", 30*time.Second, "HTTP timeout for each request")

	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, `Usage:
  xkit delete-posts [flags]

Flags:`)
		fs.PrintDefaults()
	}

	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}

	sess, err := loadSession()
	if err != nil {
		return fmt.Errorf("no saved session found; run xkit login first")
	}

	ctx := context.Background()
	client := &http.Client{Timeout: *timeout}

	_, claims, err := ensureDeleteEntitlement(ctx, client)
	if err != nil {
		return err
	}
	if claims.XClientID != "" && sess.ClientID == "" {
		sess.ClientID = claims.XClientID
	}

	sess, err = ensureFreshSession(ctx, client, sess)
	if err != nil {
		return err
	}
	sess, err = waitForDeleteCooldown(ctx, sess)
	if err != nil {
		return err
	}
	if err := saveSession(sess); err != nil {
		return err
	}

	targetUserID := strings.TrimSpace(*userIDOverride)
	if targetUserID == "" {
		targetUserID = sess.UserID
	}
	if targetUserID == "" {
		return fmt.Errorf("unable to determine target user id; rerun xkit login")
	}

	cfg := deletePostsConfig{
		BaseURL:    strings.TrimSpace(*baseURL),
		MaxResults: *maxResults,
		Exclude:    normalizeList(*exclude),
		DryRun:     *dryRun,
		Yes:        *yes,
		Limit:      *limit,
		Timeout:    *timeout,
	}
	if cfg.MaxResults < 5 || cfg.MaxResults > 100 {
		return fmt.Errorf("--max-results must be between 5 and 100")
	}
	if cfg.Limit < 0 {
		return fmt.Errorf("--limit must be >= 0")
	}
	if *previewCount < 1 {
		return fmt.Errorf("--preview-count must be >= 1")
	}

	ids, err := fetchAllPostIDs(ctx, client, cfg, sess.AccessToken, targetUserID)
	if errors.Is(err, errUnauthorized) && sess.RefreshToken != "" {
		refreshed, refreshErr := refreshSession(ctx, client, sess)
		if refreshErr != nil {
			return refreshErr
		}
		sess = refreshed
		_ = saveSession(sess)
		ids, err = fetchAllPostIDs(ctx, client, cfg, sess.AccessToken, targetUserID)
	}
	var rlErr rateLimitError
	if errors.As(err, &rlErr) {
		until, source := cooldownUntilFromRateLimit(rlErr)
		if persistErr := persistDeleteCooldown(sess, until); persistErr != nil {
			return persistErr
		}
		logWarn("X rate limit hit while listing posts; pausing until %s (%s, %s remaining)", until.Format(time.RFC3339), source, formatDuration(time.Until(until)))
		if waitErr := sleepWithCountdown(ctx, time.Until(until), "waiting for X delete window to reset"); waitErr != nil {
			return waitErr
		}
		sess.DeleteCooldownUntil = time.Time{}
		if err := saveSession(sess); err != nil {
			return err
		}
		ids, err = fetchAllPostIDs(ctx, client, cfg, sess.AccessToken, targetUserID)
		if errors.Is(err, errUnauthorized) && sess.RefreshToken != "" {
			refreshed, refreshErr := refreshSession(ctx, client, sess)
			if refreshErr != nil {
				return refreshErr
			}
			sess = refreshed
			_ = saveSession(sess)
			ids, err = fetchAllPostIDs(ctx, client, cfg, sess.AccessToken, targetUserID)
		}
	}
	if err != nil {
		return err
	}

	logInfo("found %d posts for @%s (%s)", len(ids), sess.Username, targetUserID)
	if len(cfg.Exclude) > 0 {
		logInfo("exclude filter: %s", strings.Join(cfg.Exclude, ","))
	}
	if cfg.Limit > 0 && len(ids) > cfg.Limit {
		ids = ids[:cfg.Limit]
		logInfo("applying limit: deleting first %d posts only", len(ids))
	}

	if cfg.DryRun {
		for _, id := range ids {
			logInfo("dry run would delete post %s", id)
		}
		logInfo("dry run complete: %d posts would be deleted", len(ids))
		return nil
	}

	if !cfg.Yes {
		if err := confirmDeletionPreview(sess, targetUserID, ids, *previewCount, cfg); err != nil {
			return err
		}
	}

	deleted := 0
	failed := 0
	for i, id := range ids {
		if err := deletePost(ctx, client, cfg, sess.AccessToken, id); err != nil {
			if errors.Is(err, errUnauthorized) && sess.RefreshToken != "" {
				if refreshed, refreshErr := refreshSession(ctx, client, sess); refreshErr == nil {
					sess = refreshed
					_ = saveSession(sess)
					if retryErr := deletePost(ctx, client, cfg, sess.AccessToken, id); retryErr == nil {
						deleted++
						continue
					} else {
						err = retryErr
					}
				}
			}
			var rlErr rateLimitError
			if errors.As(err, &rlErr) {
				until, source := cooldownUntilFromRateLimit(rlErr)
				if persistErr := persistDeleteCooldown(sess, until); persistErr != nil {
					return persistErr
				}
				logWarn("X rate limit hit while deleting post %s; pausing until %s (%s, %s remaining)", id, until.Format(time.RFC3339), source, formatDuration(time.Until(until)))
				if waitErr := sleepWithCountdown(ctx, time.Until(until), "waiting for X delete window to reset"); waitErr != nil {
					return waitErr
				}
				sess.DeleteCooldownUntil = time.Time{}
				if err := saveSession(sess); err != nil {
					return err
				}
				if retryErr := deletePost(ctx, client, cfg, sess.AccessToken, id); retryErr == nil {
					deleted++
					continue
				} else {
					err = retryErr
				}
			}
			failed++
			logError("failed to delete %s (%d/%d): %v", id, i+1, len(ids), err)
			continue
		}
		deleted++
		if deleted%25 == 0 || deleted == len(ids) {
			logInfo("deleted %d/%d posts", deleted, len(ids))
		}
	}

	logInfo("done. deleted %d posts, %d failed", deleted, failed)
	if failed > 0 {
		return fmt.Errorf("one or more deletions failed")
	}
	return nil
}

func cooldownUntilFromRateLimit(err rateLimitError) (time.Time, string) {
	until := err.ResetAt
	source := strings.TrimSpace(err.Source)
	if until.IsZero() && err.RetryAfter > 0 {
		until = time.Now().Add(err.RetryAfter)
		if source == "" {
			source = "Retry-After"
		}
	}
	if until.IsZero() {
		until = time.Now().Add(retryRateLimitBase)
		source = "fallback 15m window"
	}
	if source == "" {
		source = "server cooldown"
	}
	return until, source
}
