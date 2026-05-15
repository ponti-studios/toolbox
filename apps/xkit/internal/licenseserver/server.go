package licenseserver

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	defaultSigningSecret = "xkit-dev-signing-secret"
	defaultAudience      = "xkit-cli"
	defaultIssuer        = "http://127.0.0.1:8787"
	defaultClientID      = "xkit-dev-vendor-client-id"
	defaultTTL           = 24 * time.Hour
	defaultRefreshLead   = 6 * time.Hour
)

type Config struct {
	Issuer          string
	VendorXClientID string
	SigningSecret   string
	TTL             time.Duration
	Now             func() time.Time
}

type Server struct {
	cfg        Config
	publicKey  ed25519.PublicKey
	privateKey ed25519.PrivateKey
}

type activationRequest struct {
	LicenseKey string `json:"license_key"`
	Device     struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"device"`
	Client struct {
		Name    string `json:"name"`
		Version string `json:"version"`
	} `json:"client"`
}

type refreshRequest struct {
	EntitlementToken string `json:"entitlement_token"`
	Device           struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"device"`
	Client struct {
		Name    string `json:"name"`
		Version string `json:"version"`
	} `json:"client"`
}

type entitlementEnvelope struct {
	EntitlementToken string `json:"entitlement_token"`
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

func New(cfg Config) *Server {
	if strings.TrimSpace(cfg.Issuer) == "" {
		cfg.Issuer = defaultIssuer
	}
	if strings.TrimSpace(cfg.VendorXClientID) == "" {
		cfg.VendorXClientID = defaultClientID
	}
	if strings.TrimSpace(cfg.SigningSecret) == "" {
		cfg.SigningSecret = defaultSigningSecret
	}
	if cfg.TTL <= 0 {
		cfg.TTL = defaultTTL
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}

	seed := sha256.Sum256([]byte(cfg.SigningSecret))
	privateKey := ed25519.NewKeyFromSeed(seed[:])
	publicKey := privateKey.Public().(ed25519.PublicKey)

	return &Server{
		cfg:        cfg,
		publicKey:  publicKey,
		privateKey: privateKey,
	}
}

func (s *Server) PublicKeyBase64() string {
	return base64.StdEncoding.EncodeToString(s.publicKey)
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.handleHealth)
	mux.HandleFunc("/v1/activations", s.handleActivation)
	mux.HandleFunc("/v1/entitlements/refresh", s.handleRefresh)
	return mux
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleActivation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req activationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if strings.TrimSpace(req.LicenseKey) == "" {
		writeError(w, http.StatusBadRequest, "license_key is required")
		return
	}
	if strings.TrimSpace(req.Device.ID) == "" {
		writeError(w, http.StatusBadRequest, "device.id is required")
		return
	}

	claims := s.claimsForLicenseKey(strings.TrimSpace(req.LicenseKey), strings.TrimSpace(req.Device.ID), strings.TrimSpace(req.Device.Name))
	token, err := s.signClaims(claims)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, entitlementEnvelope{EntitlementToken: token})
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req refreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if strings.TrimSpace(req.EntitlementToken) == "" {
		writeError(w, http.StatusBadRequest, "entitlement_token is required")
		return
	}

	claims, err := s.parseToken(req.EntitlementToken)
	if err != nil {
		writeError(w, http.StatusUnauthorized, fmt.Sprintf("invalid entitlement token: %v", err))
		return
	}
	if req.Device.ID != "" {
		claims.DeviceID = strings.TrimSpace(req.Device.ID)
	}
	if req.Device.Name != "" {
		claims.DeviceName = strings.TrimSpace(req.Device.Name)
	}

	now := s.cfg.Now().UTC()
	claims.Iss = s.cfg.Issuer
	claims.IssuedAtUnix = now.Unix()
	claims.NotBeforeUnix = now.Unix()
	claims.RefreshAfterUnix = now.Add(s.cfg.TTL - defaultRefreshLead).Unix()
	claims.ExpiresAtUnix = now.Add(s.cfg.TTL).Unix()
	claims.JTI = fmt.Sprintf("refresh_%d", now.UnixNano())
	claims.XClientID = s.cfg.VendorXClientID

	token, err := s.signClaims(claims)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, entitlementEnvelope{EntitlementToken: token})
}

func (s *Server) claimsForLicenseKey(licenseKey, deviceID, deviceName string) entitlementClaims {
	now := s.cfg.Now().UTC()
	claims := entitlementClaims{
		Iss:              s.cfg.Issuer,
		Aud:              defaultAudience,
		Sub:              licenseKey,
		JTI:              fmt.Sprintf("activation_%d", now.UnixNano()),
		Plan:             "launch-single",
		Status:           "active",
		Scope:            []string{"delete-posts"},
		MeteringMode:     "cleanup_packs",
		CreditsRemaining: 1,
		CreditsTotal:     1,
		DeviceID:         deviceID,
		DeviceName:       deviceName,
		DevicesAllowed:   1,
		XClientID:        s.cfg.VendorXClientID,
		RefreshAfterUnix: now.Add(s.cfg.TTL - defaultRefreshLead).Unix(),
		IssuedAtUnix:     now.Unix(),
		NotBeforeUnix:    now.Unix(),
		ExpiresAtUnix:    now.Add(s.cfg.TTL).Unix(),
	}

	switch strings.TrimSpace(licenseKey) {
	case "xkit_dev_multi":
		claims.Plan = "launch-multi"
		claims.CreditsRemaining = 3
		claims.CreditsTotal = 3
		claims.DevicesAllowed = 2
	case "xkit_dev_empty":
		claims.CreditsRemaining = 0
		claims.Reason = "cleanup packs exhausted"
	case "xkit_dev_revoked":
		claims.Status = "revoked"
		claims.Reason = "support revoked this license"
	case "xkit_dev_suspended":
		claims.Status = "suspended"
		claims.Reason = "billing issue"
	}

	return claims
}

func (s *Server) signClaims(claims entitlementClaims) (string, error) {
	headerBytes, err := json.Marshal(map[string]string{
		"alg": "EdDSA",
		"typ": "JWT",
	})
	if err != nil {
		return "", err
	}
	payloadBytes, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}

	header := base64.RawURLEncoding.EncodeToString(headerBytes)
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	signingInput := header + "." + payload
	signature := ed25519.Sign(s.privateKey, []byte(signingInput))
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func (s *Server) parseToken(token string) (entitlementClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return entitlementClaims{}, fmt.Errorf("token must contain 3 parts")
	}

	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return entitlementClaims{}, err
	}
	if !ed25519.Verify(s.publicKey, []byte(parts[0]+"."+parts[1]), signature) {
		return entitlementClaims{}, fmt.Errorf("signature verification failed")
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return entitlementClaims{}, err
	}
	var claims entitlementClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return entitlementClaims{}, err
	}
	if claims.Aud != "" && claims.Aud != defaultAudience {
		return entitlementClaims{}, fmt.Errorf("unexpected audience %q", claims.Aud)
	}
	return claims, nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
