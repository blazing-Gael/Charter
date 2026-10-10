package main

import (
	"encoding/json"
	"net"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	dcms "github.com/blazing-Gael/dcms"
)

// rateLimiter is a tiny per-key fixed-window limiter for the public feedback route
// (the raw API create is admin-only, so this is the only unauthenticated write
// path). In-memory, so it resets on restart and is per-instance — fine at docs scale.
type rateLimiter struct {
	mu     sync.Mutex
	hits   map[string][]time.Time
	max    int
	window time.Duration
}

func newRateLimiter(max int, window time.Duration) *rateLimiter {
	return &rateLimiter{hits: map[string][]time.Time{}, max: max, window: window}
}

func (l *rateLimiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cut := now.Add(-l.window)
	kept := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= l.max {
		l.hits[key] = kept
		return false
	}
	l.hits[key] = append(kept, now)
	return true
}

var emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// handleFeedback accepts a public "How is this guide?" submission: rate-limited per
// IP, email policy from the site's feedback_email, stored via the privileged route
// store. The record is never read back to the caller.
func (s *Site) handleFeedback(req *dcms.Request) {
	if !s.feedbackRL.allow(clientIP(req.R)) {
		http.Error(req.W, "too many submissions — try again later", http.StatusTooManyRequests)
		return
	}
	var in struct {
		Page    string `json:"page"`
		Rating  string `json:"rating"`
		Comment string `json:"comment"`
		Email   string `json:"email"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(req.W, req.R.Body, 8<<10)).Decode(&in); err != nil {
		http.Error(req.W, "bad request", http.StatusBadRequest)
		return
	}
	if in.Rating != "good" && in.Rating != "bad" {
		http.Error(req.W, "rating must be good or bad", http.StatusBadRequest)
		return
	}
	if in.Page == "" {
		http.Error(req.W, "page is required", http.StatusBadRequest)
		return
	}

	ctx := req.R.Context()
	in.Email = strings.TrimSpace(in.Email)
	switch str(firstSite(ctx, req.Store)["feedback_email"]) {
	case "none":
		in.Email = ""
	case "required":
		if !emailRe.MatchString(in.Email) {
			http.Error(req.W, "a valid email is required", http.StatusBadRequest)
			return
		}
	default: // optional
		if in.Email != "" && !emailRe.MatchString(in.Email) {
			http.Error(req.W, "that email doesn't look valid", http.StatusBadRequest)
			return
		}
	}

	comment := strings.TrimSpace(in.Comment)
	if len(comment) > 4000 {
		comment = comment[:4000]
	}
	if _, err := req.Store.Create(ctx, dcms.WriteInput{Collection: "feedback", Data: dcms.Record{
		"page": in.Page, "rating": in.Rating, "comment": comment, "email": in.Email, "hidden": false,
	}}); err != nil {
		http.Error(req.W, "could not save feedback", http.StatusInternalServerError)
		return
	}
	req.W.WriteHeader(http.StatusNoContent)
}
