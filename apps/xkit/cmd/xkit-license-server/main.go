package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/ponti-studios/toolbox/apps/xkit/internal/licenseserver"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "public-key" {
		cfg := serverConfigFromEnv()
		fmt.Println(licenseserver.New(cfg).PublicKeyBase64())
		return
	}

	fs := flag.NewFlagSet("xkit-license-server", flag.ExitOnError)
	addr := fs.String("addr", envOrDefault("XKIT_LICENSE_SERVER_ADDR", "127.0.0.1:8787"), "address to listen on")
	if err := fs.Parse(os.Args[1:]); err != nil {
		log.Fatal(err)
	}

	cfg := serverConfigFromEnv()
	srv := licenseserver.New(cfg)
	log.Printf("xkit dev license server listening on http://%s", *addr)
	log.Printf("public key: %s", srv.PublicKeyBase64())
	log.Printf("dev keys: xkit_dev_single, xkit_dev_multi, xkit_dev_empty, xkit_dev_revoked, xkit_dev_suspended")
	if err := http.ListenAndServe(strings.TrimSpace(*addr), srv.Handler()); err != nil {
		log.Fatal(err)
	}
}

func serverConfigFromEnv() licenseserver.Config {
	return licenseserver.Config{
		Issuer:          envOrDefault("XKIT_LICENSE_ISSUER", "http://127.0.0.1:8787"),
		VendorXClientID: envOrDefault("XKIT_VENDOR_X_CLIENT_ID", "xkit-dev-vendor-client-id"),
		SigningSecret:   envOrDefault("XKIT_LICENSE_SIGNING_SECRET", "xkit-dev-signing-secret"),
		TTL:             envDurationOrDefault("XKIT_LICENSE_TTL", 24*time.Hour),
	}
}

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envDurationOrDefault(key string, fallback time.Duration) time.Duration {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		if d, err := time.ParseDuration(value); err == nil {
			return d
		}
	}
	return fallback
}
