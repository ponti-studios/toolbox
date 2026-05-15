package app

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	keyring "github.com/zalando/go-keyring"
)

const (
	sessionKeyringService = "xkit"
	sessionKeyringUser    = "current-session"
)

func loadSession() (session, error) {
	data, err := keyring.Get(sessionKeyringService, sessionKeyringUser)
	if err != nil {
		return session{}, err
	}
	var sess session
	if err := json.Unmarshal([]byte(data), &sess); err != nil {
		return session{}, err
	}
	return sess, nil
}

func saveSession(sess session) error {
	data, err := json.MarshalIndent(sess, "", "  ")
	if err != nil {
		return err
	}
	return keyring.Set(sessionKeyringService, sessionKeyringUser, string(data))
}

func clearSession() error {
	return keyring.Delete(sessionKeyringService, sessionKeyringUser)
}

func waitForDeleteCooldown(ctx context.Context, sess session) (session, error) {
	if sess.DeleteCooldownUntil.IsZero() {
		return sess, nil
	}
	if time.Until(sess.DeleteCooldownUntil) <= 0 {
		sess.DeleteCooldownUntil = time.Time{}
		return sess, nil
	}

	remaining := time.Until(sess.DeleteCooldownUntil)
	logInfo("delete cooldown active; resume at %s (%s remaining)", sess.DeleteCooldownUntil.Format(time.RFC3339), formatDuration(remaining))
	if err := sleepWithCountdown(ctx, remaining, "waiting for X delete window to reset"); err != nil {
		return session{}, err
	}
	sess.DeleteCooldownUntil = time.Time{}
	return sess, nil
}

func persistDeleteCooldown(sess session, until time.Time) error {
	sess.DeleteCooldownUntil = until
	return saveSession(sess)
}

func confirmDeletionPreview(sess session, userID string, ids []string, previewCount int, cfg deletePostsConfig) error {
	logInfo("about to delete %d posts for @%s (%s)", len(ids), sess.Username, userID)
	if len(cfg.Exclude) > 0 {
		logInfo("excluded: %s", strings.Join(cfg.Exclude, ", "))
	}
	if cfg.Limit > 0 {
		logInfo("limit: %d", cfg.Limit)
	}

	show := previewCount
	if show > len(ids) {
		show = len(ids)
	}
	if show > 0 {
		logInfo("previewing first %d post IDs", show)
		for i := 0; i < show; i++ {
			logInfo("  %d. %s", i+1, ids[i])
		}
		if len(ids) > show {
			logInfo("  ... and %d more", len(ids)-show)
		}
	}

	fmt.Print("Type DELETE to continue: ")
	reader := bufio.NewReader(os.Stdin)
	line, err := reader.ReadString('\n')
	if err != nil && !errorsIsEOF(err) {
		return err
	}
	if strings.TrimSpace(line) != "DELETE" {
		return fmt.Errorf("aborted")
	}
	return nil
}

func errorsIsEOF(err error) bool {
	return err == io.EOF
}
