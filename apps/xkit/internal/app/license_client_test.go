package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/ponti-studios/toolbox/apps/xkit/internal/licenseserver"
)

func TestActivateLicenseAgainstDevServer(t *testing.T) {
	now := time.Now().UTC()
	server := licenseserver.New(licenseserver.Config{
		Issuer:          "http://127.0.0.1:8787",
		VendorXClientID: "vendor-client",
		SigningSecret:   "test-secret",
		Now:             func() time.Time { return now },
	})
	ts := httptest.NewServer(server.Handler())
	defer ts.Close()

	cfg, err := buildLicenseClientConfig(ts.URL, server.PublicKeyBase64(), "device-1", "test-mac")
	if err != nil {
		t.Fatalf("build config: %v", err)
	}

	cache, claims, err := activateLicense(context.Background(), ts.Client(), cfg, "xkit_dev_multi")
	if err != nil {
		t.Fatalf("activate license: %v", err)
	}
	if cache.Token == "" {
		t.Fatal("expected saved entitlement token")
	}
	if claims.XClientID != "vendor-client" {
		t.Fatalf("expected vendor-client, got %q", claims.XClientID)
	}
	if claims.CreditsRemaining != 3 {
		t.Fatalf("expected 3 credits, got %d", claims.CreditsRemaining)
	}
}

func TestRefreshEntitlementAgainstDevServer(t *testing.T) {
	now := time.Now().UTC()
	server := licenseserver.New(licenseserver.Config{
		Issuer:          "http://127.0.0.1:8787",
		VendorXClientID: "vendor-client",
		SigningSecret:   "test-secret",
		Now:             func() time.Time { return now },
	})
	ts := httptest.NewServer(server.Handler())
	defer ts.Close()

	cfg, err := buildLicenseClientConfig(ts.URL, server.PublicKeyBase64(), "device-1", "test-mac")
	if err != nil {
		t.Fatalf("build config: %v", err)
	}

	cache, _, err := activateLicense(context.Background(), ts.Client(), cfg, "xkit_dev_single")
	if err != nil {
		t.Fatalf("activate license: %v", err)
	}

	refreshedCache, refreshedClaims, err := refreshEntitlement(context.Background(), &http.Client{Timeout: 5 * time.Second}, cfg, cache)
	if err != nil {
		t.Fatalf("refresh entitlement: %v", err)
	}
	if refreshedCache.Token == "" {
		t.Fatal("expected refreshed token")
	}
	if refreshedClaims.Plan != "launch-single" {
		t.Fatalf("expected launch-single, got %q", refreshedClaims.Plan)
	}
}
