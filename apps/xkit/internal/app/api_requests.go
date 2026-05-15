package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

func fetchAllPostIDs(ctx context.Context, client *http.Client, cfg deletePostsConfig, bearer, userID string) ([]string, error) {
	var ids []string
	nextToken := ""

	for {
		endpoint, err := buildListPostsURL(cfg.BaseURL, userID, cfg.MaxResults, nextToken, cfg.Exclude)
		if err != nil {
			return nil, err
		}

		var resp listPostsResponse
		status, err := doJSON(ctx, client, http.MethodGet, endpoint, bearer, nil, &resp)
		if err != nil {
			if status == http.StatusUnauthorized {
				return nil, errUnauthorized
			}
			return nil, err
		}

		for _, post := range resp.Data {
			if post.ID != "" {
				ids = append(ids, post.ID)
			}
		}

		nextToken = strings.TrimSpace(resp.Meta.NextToken)
		if nextToken == "" {
			break
		}
	}

	return ids, nil
}

func buildListPostsURL(baseURL, userID string, maxResults int, paginationToken string, exclude []string) (string, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return "", fmt.Errorf("--base-url cannot be empty")
	}

	u, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("invalid --base-url: %w", err)
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/users/" + url.PathEscape(userID) + "/tweets"

	q := u.Query()
	q.Set("max_results", strconv.Itoa(maxResults))
	if paginationToken != "" {
		q.Set("pagination_token", paginationToken)
	}
	if len(exclude) > 0 {
		q.Set("exclude", strings.Join(exclude, ","))
	}
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func buildDeletePostURL(baseURL, postID string) (string, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return "", fmt.Errorf("--base-url cannot be empty")
	}

	u, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("invalid --base-url: %w", err)
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/tweets/" + url.PathEscape(postID)
	return u.String(), nil
}

func deletePost(ctx context.Context, client *http.Client, cfg deletePostsConfig, bearer, postID string) error {
	endpoint, err := buildDeletePostURL(cfg.BaseURL, postID)
	if err != nil {
		return err
	}

	var resp deletePostResponse
	status, err := doJSON(ctx, client, http.MethodDelete, endpoint, bearer, nil, &resp)
	if err != nil {
		if status == http.StatusUnauthorized {
			return errUnauthorized
		}
		return err
	}
	return nil
}

func doJSON(ctx context.Context, client *http.Client, method, endpoint, bearer string, body io.Reader, dest any) (int, error) {
	var bodyBytes []byte
	if body != nil {
		var err error
		bodyBytes, err = io.ReadAll(body)
		if err != nil {
			return 0, err
		}
	}

	for attempt := 1; attempt <= retryMaxAttempts; attempt++ {
		var reqBody io.Reader
		if bodyBytes != nil {
			reqBody = bytes.NewReader(bodyBytes)
		}

		req, err := http.NewRequestWithContext(ctx, method, endpoint, reqBody)
		if err != nil {
			return 0, err
		}
		if bearer != "" {
			req.Header.Set("Authorization", "Bearer "+bearer)
		}
		req.Header.Set("Accept", "application/json")
		if bodyBytes != nil {
			req.Header.Set("Content-Type", "application/json")
		}

		resp, err := client.Do(req)
		if err != nil {
			if attempt < retryMaxAttempts && isRetryableError(err) {
				if waitErr := sleepWithCountdown(ctx, backoffDelay(attempt, nil), "retrying after transient error"); waitErr != nil {
					return 0, waitErr
				}
				continue
			}
			return 0, err
		}

		payload, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			return resp.StatusCode, readErr
		}

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			if dest != nil && len(payload) > 0 {
				if err := json.Unmarshal(payload, dest); err != nil {
					return resp.StatusCode, err
				}
			}
			return resp.StatusCode, nil
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			resetAt, source := rateLimitResetDetails(resp)
			return resp.StatusCode, rateLimitError{
				ResetAt:    resetAt,
				RetryAfter: parseRetryAfter(resp.Header.Get("Retry-After")),
				Source:     source,
			}
		}

		if attempt < retryMaxAttempts && isRetryableStatus(resp.StatusCode) {
			if waitErr := sleepWithCountdown(ctx, backoffDelay(attempt, resp), fmt.Sprintf("retrying after %s", resp.Status)); waitErr != nil {
				return resp.StatusCode, waitErr
			}
			continue
		}

		return resp.StatusCode, fmt.Errorf("%s %s failed (%s): %s", method, endpoint, resp.Status, summarizeHTTPError(payload))
	}

	return 0, fmt.Errorf("%s %s failed after retries", method, endpoint)
}
