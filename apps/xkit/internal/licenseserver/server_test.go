package licenseserver

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestActivationReturnsSignedEntitlement(t *testing.T) {
	srv := New(Config{
		Issuer:          "http://127.0.0.1:8787",
		VendorXClientID: "vendor-client",
		SigningSecret:   "test-secret",
		Now:             func() time.Time { return time.Unix(1_700_000_000, 0) },
	})

	req := httptest.NewRequest(http.MethodPost, "/v1/activations", strings.NewReader(`{
		"license_key":"xkit_dev_multi",
		"device":{"id":"device-1","name":"test-mac"},
		"client":{"name":"xkit","version":"dev"}
	}`))
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp entitlementEnvelope
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	claims, err := srv.parseToken(resp.EntitlementToken)
	if err != nil {
		t.Fatalf("parse token: %v", err)
	}
	if claims.Plan != "launch-multi" {
		t.Fatalf("expected launch-multi, got %q", claims.Plan)
	}
	if claims.CreditsRemaining != 3 {
		t.Fatalf("expected 3 credits, got %d", claims.CreditsRemaining)
	}
}

func TestRefreshRejectsInvalidToken(t *testing.T) {
	srv := New(Config{SigningSecret: "test-secret"})
	req := httptest.NewRequest(http.MethodPost, "/v1/entitlements/refresh", strings.NewReader(`{
		"entitlement_token":"bad.token.value",
		"device":{"id":"device-1","name":"test-mac"}
	}`))
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}
