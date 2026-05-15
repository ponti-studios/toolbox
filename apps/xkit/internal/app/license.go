package app

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"os"
	"os/user"
	"path"
	"strings"
	"time"

	keyring "github.com/zalando/go-keyring"
)

const (
	entitlementKeyringService = "xkit-license"
	entitlementKeyringUser    = "current-entitlement"
)

type licenseClientConfig struct {
	BaseURL    string
	PublicKey  ed25519.PublicKey
	DeviceID   string
	DeviceName string
}

type entitlementCache struct {
	BaseURL      string    `json:"base_url"`
	Token        string    `json:"token"`
	ActivatedAt  time.Time `json:"activated_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	LastVerified time.Time `json:"last_verified"`
}

type entitlementClaims struct {
	Iss              string   `json:"iss"`
	Aud              string   `json:"aud"`
	Sub              string   `json:"sub"`
	JTI              string   `json:"jti"`
	Plan             string   `json:"plan"`
	Status           string   `json:"status"`
	Scope            []string `json:"scope,omitempty"`
	MeteringMode     string   `json:"metering_mode,omitempty"`
	CreditsRemaining int      `json:"credits_remaining,omitempty"`
	CreditsTotal     int      `json:"credits_total,omitempty"`
	DeviceID         string   `json:"device_id,omitempty"`
	DeviceName       string   `json:"device_name,omitempty"`
	DevicesAllowed   int      `json:"devices_allowed,omitempty"`
	XClientID        string   `json:"x_client_id,omitempty"`
	Reason           string   `json:"reason,omitempty"`
	RefreshAfterUnix int64    `json:"refresh_after,omitempty"`
	IssuedAtUnix     int64    `json:"iat,omitempty"`
	NotBeforeUnix    int64    `json:"nbf,omitempty"`
	ExpiresAtUnix    int64    `json:"exp,omitempty"`
}

type entitlementEnvelope struct {
	EntitlementToken string `json:"entitlement_token"`
}

type activationRequest struct {
	LicenseKey string        `json:"license_key"`
	Device     licenseDevice `json:"device"`
	Client     licenseClient `json:"client"`
}

type refreshRequest struct {
	EntitlementToken string        `json:"entitlement_token"`
	Device           licenseDevice `json:"device"`
	Client           licenseClient `json:"client"`
}

type licenseDevice struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type licenseClient struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

func buildLicenseClientConfig(baseURL, publicKey, deviceID, deviceName string) (licenseClientConfig, error) {
	if strings.TrimSpace(publicKey) == "" {
		return licenseClientConfig{}, fmt.Errorf("--public-key or XKIT_LICENSE_PUBLIC_KEY is required")
	}
	key, err := parseLicensePublicKey(publicKey)
	if err != nil {
		return licenseClientConfig{}, err
	}
	if deviceID == "" {
		deviceID = defaultDeviceID()
	}
	if deviceName == "" {
		deviceName = defaultDeviceName()
	}
	return licenseClientConfig{
		BaseURL:    strings.TrimSpace(baseURL),
		PublicKey:  key,
		DeviceID:   deviceID,
		DeviceName: deviceName,
	}, nil
}

func parseLicensePublicKey(value string) (ed25519.PublicKey, error) {
	value = strings.TrimSpace(value)
	if strings.Contains(value, "BEGIN PUBLIC KEY") {
		block, _ := pem.Decode([]byte(value))
		if block == nil {
			return nil, fmt.Errorf("failed to decode PEM public key")
		}
		pub, err := x509.ParsePKIXPublicKey(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("failed to parse PEM public key: %w", err)
		}
		edKey, ok := pub.(ed25519.PublicKey)
		if !ok {
			return nil, fmt.Errorf("public key must be Ed25519")
		}
		return edKey, nil
	}

	decoders := []*base64.Encoding{
		base64.RawURLEncoding,
		base64.StdEncoding,
		base64.RawStdEncoding,
		base64.URLEncoding,
	}
	for _, enc := range decoders {
		if raw, err := enc.DecodeString(value); err == nil && len(raw) == ed25519.PublicKeySize {
			return ed25519.PublicKey(raw), nil
		}
	}
	return nil, fmt.Errorf("public key must be PEM or base64-encoded Ed25519 bytes")
}

func defaultDeviceName() string {
	if host, err := os.Hostname(); err == nil && strings.TrimSpace(host) != "" {
		return host
	}
	return "local-mac"
}

func defaultDeviceID() string {
	host, _ := os.Hostname()
	currentUser, _ := user.Current()
	input := strings.TrimSpace(host) + "|" + currentUser.Username + "|" + currentUser.HomeDir
	sum := sha256.Sum256([]byte(input))
	return fmt.Sprintf("xkit-%x", sum[:8])
}

func loadEntitlementCache() (entitlementCache, error) {
	data, err := keyring.Get(entitlementKeyringService, entitlementKeyringUser)
	if err != nil {
		return entitlementCache{}, err
	}
	var cache entitlementCache
	if err := json.Unmarshal([]byte(data), &cache); err != nil {
		return entitlementCache{}, err
	}
	return cache, nil
}

func saveEntitlementCache(cache entitlementCache) error {
	data, err := json.MarshalIndent(cache, "", "  ")
	if err != nil {
		return err
	}
	return keyring.Set(entitlementKeyringService, entitlementKeyringUser, string(data))
}

func clearEntitlementCache() error {
	return keyring.Delete(entitlementKeyringService, entitlementKeyringUser)
}

func resolveEntitledClientID() string {
	publicKey := strings.TrimSpace(envOrDefault("XKIT_LICENSE_PUBLIC_KEY", ""))
	if publicKey == "" {
		return ""
	}
	cfg, err := buildLicenseClientConfig("", publicKey, envOrDefault("XKIT_DEVICE_ID", defaultDeviceID()), envOrDefault("XKIT_DEVICE_NAME", defaultDeviceName()))
	if err != nil {
		return ""
	}
	cache, err := loadEntitlementCache()
	if err != nil || cache.Token == "" {
		return ""
	}
	claims, err := parseEntitlementToken(cache.Token, cfg.PublicKey)
	if err != nil {
		return ""
	}
	if err := claims.AllowedAt(time.Now(), cfg.DeviceID); err != nil {
		return ""
	}
	return claims.XClientID
}

func activateLicense(ctx context.Context, client *http.Client, cfg licenseClientConfig, licenseKey string) (entitlementCache, entitlementClaims, error) {
	if cfg.BaseURL == "" {
		return entitlementCache{}, entitlementClaims{}, fmt.Errorf("--license-base-url or XKIT_LICENSE_BASE_URL is required")
	}

	var resp entitlementEnvelope
	if err := postLicenseJSON(ctx, client, cfg.BaseURL, "/v1/activations", activationRequest{
		LicenseKey: licenseKey,
		Device:     licenseDevice{ID: cfg.DeviceID, Name: cfg.DeviceName},
		Client:     licenseClient{Name: "xkit", Version: "dev"},
	}, &resp); err != nil {
		return entitlementCache{}, entitlementClaims{}, err
	}

	claims, err := parseEntitlementToken(resp.EntitlementToken, cfg.PublicKey)
	if err != nil {
		return entitlementCache{}, entitlementClaims{}, err
	}
	if err := claims.AllowedAt(time.Now(), cfg.DeviceID); err != nil {
		return entitlementCache{}, entitlementClaims{}, err
	}

	now := time.Now()
	cache := entitlementCache{
		BaseURL:      cfg.BaseURL,
		Token:        resp.EntitlementToken,
		ActivatedAt:  now,
		UpdatedAt:    now,
		LastVerified: now,
	}
	return cache, claims, nil
}

func ensureDeleteEntitlement(ctx context.Context, client *http.Client) (entitlementCache, entitlementClaims, error) {
	cfg, err := buildLicenseClientConfig(
		strings.TrimSpace(envOrDefault("XKIT_LICENSE_BASE_URL", "")),
		strings.TrimSpace(envOrDefault("XKIT_LICENSE_PUBLIC_KEY", "")),
		envOrDefault("XKIT_DEVICE_ID", defaultDeviceID()),
		envOrDefault("XKIT_DEVICE_NAME", defaultDeviceName()),
	)
	if err != nil {
		return entitlementCache{}, entitlementClaims{}, err
	}
	return loadVerifiedEntitlement(ctx, client, cfg, true)
}

func loadVerifiedEntitlement(ctx context.Context, client *http.Client, cfg licenseClientConfig, enforceAllowed bool) (entitlementCache, entitlementClaims, error) {
	cache, err := loadEntitlementCache()
	if err != nil {
		return entitlementCache{}, entitlementClaims{}, fmt.Errorf("no saved entitlement found; run xkit activate first")
	}
	if cache.BaseURL != "" && cfg.BaseURL == "" {
		cfg.BaseURL = cache.BaseURL
	}

	claims, err := parseEntitlementToken(cache.Token, cfg.PublicKey)
	if err != nil {
		return entitlementCache{}, entitlementClaims{}, err
	}
	if shouldRefreshEntitlement(cache, claims) {
		if cfg.BaseURL == "" {
			return entitlementCache{}, entitlementClaims{}, fmt.Errorf("entitlement refresh is required but no license base URL is configured")
		}
		refreshedCache, refreshedClaims, refreshErr := refreshEntitlement(ctx, client, cfg, cache)
		if refreshErr == nil {
			cache = refreshedCache
			claims = refreshedClaims
			if err := saveEntitlementCache(cache); err != nil {
				return entitlementCache{}, entitlementClaims{}, err
			}
		} else if claims.IsUsableOfflineAt(time.Now(), cfg.DeviceID) == nil {
			logWarn("entitlement refresh failed; using the still-valid cached entitlement: %v", refreshErr)
		} else {
			return entitlementCache{}, entitlementClaims{}, refreshErr
		}
	}

	cache.LastVerified = time.Now()
	if err := saveEntitlementCache(cache); err != nil {
		return entitlementCache{}, entitlementClaims{}, err
	}
	if enforceAllowed {
		if err := claims.AllowedAt(time.Now(), cfg.DeviceID); err != nil {
			return entitlementCache{}, entitlementClaims{}, err
		}
	}
	return cache, claims, nil
}

func refreshEntitlement(ctx context.Context, client *http.Client, cfg licenseClientConfig, cache entitlementCache) (entitlementCache, entitlementClaims, error) {
	var resp entitlementEnvelope
	if err := postLicenseJSON(ctx, client, cfg.BaseURL, "/v1/entitlements/refresh", refreshRequest{
		EntitlementToken: cache.Token,
		Device:           licenseDevice{ID: cfg.DeviceID, Name: cfg.DeviceName},
		Client:           licenseClient{Name: "xkit", Version: "dev"},
	}, &resp); err != nil {
		return entitlementCache{}, entitlementClaims{}, err
	}

	claims, err := parseEntitlementToken(resp.EntitlementToken, cfg.PublicKey)
	if err != nil {
		return entitlementCache{}, entitlementClaims{}, err
	}
	if err := claims.AllowedAt(time.Now(), cfg.DeviceID); err != nil {
		return entitlementCache{}, entitlementClaims{}, err
	}
	cache.Token = resp.EntitlementToken
	cache.BaseURL = cfg.BaseURL
	cache.UpdatedAt = time.Now()
	cache.LastVerified = time.Now()
	return cache, claims, nil
}

func shouldRefreshEntitlement(cache entitlementCache, claims entitlementClaims) bool {
	now := time.Now()
	refreshAt := claims.RefreshAt()
	if !refreshAt.IsZero() && !now.Before(refreshAt) {
		return true
	}
	expiresAt := claims.ExpiresAt()
	return !expiresAt.IsZero() && time.Until(expiresAt) <= licenseRefreshSkew
}

func postLicenseJSON(ctx context.Context, client *http.Client, baseURL, endpoint string, reqBody any, dest any) error {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return fmt.Errorf("license base URL cannot be empty")
	}
	payload, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}
	status, err := doJSON(ctx, client, http.MethodPost, baseURL+path.Clean("/"+endpoint), "", strings.NewReader(string(payload)), dest)
	if err != nil {
		return err
	}
	if status < 200 || status >= 300 {
		return fmt.Errorf("license request failed (%d)", status)
	}
	return nil
}

func parseEntitlementToken(token string, publicKey ed25519.PublicKey) (entitlementClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return entitlementClaims{}, fmt.Errorf("entitlement token must be a compact JWS")
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return entitlementClaims{}, fmt.Errorf("invalid entitlement header: %w", err)
	}
	var header struct {
		Alg string `json:"alg"`
		Typ string `json:"typ"`
	}
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return entitlementClaims{}, fmt.Errorf("invalid entitlement header JSON: %w", err)
	}
	if header.Alg != "EdDSA" {
		return entitlementClaims{}, fmt.Errorf("unsupported entitlement algorithm %q", header.Alg)
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return entitlementClaims{}, fmt.Errorf("invalid entitlement payload: %w", err)
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return entitlementClaims{}, fmt.Errorf("invalid entitlement signature: %w", err)
	}
	if !ed25519.Verify(publicKey, []byte(parts[0]+"."+parts[1]), signature) {
		return entitlementClaims{}, fmt.Errorf("entitlement signature verification failed")
	}

	var claims entitlementClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return entitlementClaims{}, fmt.Errorf("invalid entitlement claims: %w", err)
	}
	if claims.Aud != "" && claims.Aud != "xkit-cli" {
		return entitlementClaims{}, fmt.Errorf("entitlement audience %q does not match xkit-cli", claims.Aud)
	}
	return claims, nil
}

func (c entitlementClaims) ExpiresAt() time.Time {
	if c.ExpiresAtUnix <= 0 {
		return time.Time{}
	}
	return time.Unix(c.ExpiresAtUnix, 0)
}

func (c entitlementClaims) RefreshAt() time.Time {
	if c.RefreshAfterUnix > 0 {
		return time.Unix(c.RefreshAfterUnix, 0)
	}
	if expiresAt := c.ExpiresAt(); !expiresAt.IsZero() {
		return expiresAt.Add(-6 * time.Hour)
	}
	return time.Time{}
}

func (c entitlementClaims) IsUsableOfflineAt(now time.Time, deviceID string) error {
	if c.DeviceID != "" && deviceID != "" && c.DeviceID != deviceID {
		return fmt.Errorf("entitlement is bound to %s, not this device", c.DeviceID)
	}
	if !c.ExpiresAt().IsZero() && now.After(c.ExpiresAt()) {
		return fmt.Errorf("entitlement expired at %s", c.ExpiresAt().Format(time.RFC3339))
	}
	if c.NotBeforeUnix > 0 && now.Before(time.Unix(c.NotBeforeUnix, 0)) {
		return fmt.Errorf("entitlement is not active until %s", time.Unix(c.NotBeforeUnix, 0).Format(time.RFC3339))
	}
	return nil
}

func (c entitlementClaims) AllowedAt(now time.Time, deviceID string) error {
	if err := c.IsUsableOfflineAt(now, deviceID); err != nil {
		return err
	}
	switch strings.ToLower(strings.TrimSpace(c.Status)) {
	case "", "active":
	default:
		if c.Reason != "" {
			return fmt.Errorf("entitlement is %s: %s", c.Status, c.Reason)
		}
		return fmt.Errorf("entitlement is %s", c.Status)
	}
	if strings.EqualFold(c.MeteringMode, "cleanup_packs") && c.CreditsRemaining <= 0 {
		return fmt.Errorf("entitlement is out of cleanup packs")
	}
	return nil
}
