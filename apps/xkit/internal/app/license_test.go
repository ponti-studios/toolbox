package app

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"
)

func TestParseEntitlementToken(t *testing.T) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}

	claims := entitlementClaims{
		Aud:              "xkit-cli",
		Sub:              "lic_123",
		Plan:             "launch-single",
		Status:           "active",
		MeteringMode:     "cleanup_packs",
		CreditsRemaining: 1,
		CreditsTotal:     1,
		DeviceID:         "xkit-test-device",
		DeviceName:       "test-mac",
		XClientID:        "vendor-client-id",
		RefreshAfterUnix: time.Now().Add(1 * time.Hour).Unix(),
		ExpiresAtUnix:    time.Now().Add(24 * time.Hour).Unix(),
	}

	token := signTestEntitlement(t, privateKey, claims)
	got, err := parseEntitlementToken(token, publicKey)
	if err != nil {
		t.Fatalf("parse entitlement: %v", err)
	}
	if got.XClientID != claims.XClientID {
		t.Fatalf("expected x client id %q, got %q", claims.XClientID, got.XClientID)
	}
}

func TestEntitlementAllowedAtRejectsExhaustedCredits(t *testing.T) {
	claims := entitlementClaims{
		Status:           "active",
		MeteringMode:     "cleanup_packs",
		CreditsRemaining: 0,
		DeviceID:         "xkit-test-device",
		ExpiresAtUnix:    time.Now().Add(1 * time.Hour).Unix(),
	}
	if err := claims.AllowedAt(time.Now(), "xkit-test-device"); err == nil {
		t.Fatal("expected out-of-credits entitlement to be rejected")
	}
}

func TestEntitlementAllowedAtRejectsWrongDevice(t *testing.T) {
	claims := entitlementClaims{
		Status:        "active",
		DeviceID:      "device-a",
		ExpiresAtUnix: time.Now().Add(1 * time.Hour).Unix(),
	}
	if err := claims.AllowedAt(time.Now(), "device-b"); err == nil {
		t.Fatal("expected device mismatch to be rejected")
	}
}

func signTestEntitlement(t *testing.T, privateKey ed25519.PrivateKey, claims entitlementClaims) string {
	t.Helper()

	headerBytes, err := json.Marshal(map[string]string{
		"alg": "EdDSA",
		"typ": "JWT",
	})
	if err != nil {
		t.Fatalf("marshal header: %v", err)
	}
	payloadBytes, err := json.Marshal(claims)
	if err != nil {
		t.Fatalf("marshal claims: %v", err)
	}

	header := base64.RawURLEncoding.EncodeToString(headerBytes)
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	signingInput := header + "." + payload
	signature := ed25519.Sign(privateKey, []byte(signingInput))
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(signature)
}
