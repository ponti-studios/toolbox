package app

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os/exec"
	"runtime"
)

func startAuthCallbackServer(redirectURI, expectedState string) (<-chan authCodeResult, *http.Server, error) {
	parsed, err := url.Parse(redirectURI)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid redirect URI: %w", err)
	}
	if parsed.Scheme != "http" {
		return nil, nil, fmt.Errorf("redirect URI must use http:// for the local callback server")
	}
	if parsed.Host == "" {
		return nil, nil, fmt.Errorf("redirect URI must include a host and port")
	}

	ln, err := net.Listen("tcp", parsed.Host)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to listen on %s: %w", parsed.Host, err)
	}

	resultCh := make(chan authCodeResult, 1)
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != parsed.Path {
			http.NotFound(w, r)
			return
		}
		if r.URL.Query().Get("state") != expectedState {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte("state mismatch"))
			resultCh <- authCodeResult{Err: "state mismatch"}
			return
		}
		if authErr := r.URL.Query().Get("error"); authErr != "" {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte("authorization failed"))
			resultCh <- authCodeResult{Err: authErr, State: r.URL.Query().Get("state")}
			return
		}
		code := r.URL.Query().Get("code")
		if code == "" {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte("missing code"))
			resultCh <- authCodeResult{Err: "missing code"}
			return
		}
		resultCh <- authCodeResult{Code: code, State: r.URL.Query().Get("state")}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><body><h1>xkit connected</h1><p>You can close this tab and return to the terminal.</p></body></html>`))
	})}

	go func() {
		_ = server.Serve(ln)
	}()

	return resultCh, server, nil
}

func openBrowser(rawURL string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", rawURL).Start()
	case "linux":
		return exec.Command("xdg-open", rawURL).Start()
	case "windows":
		return exec.Command("cmd", "/c", "start", rawURL).Start()
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}
}
