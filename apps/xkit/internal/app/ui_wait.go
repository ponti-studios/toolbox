package app

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/progress"
	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
)

type authResultMsg struct {
	result authCodeResult
	err    error
}

type countdownTickMsg struct{}

type waitingModel struct {
	title     string
	detail    string
	total     time.Duration
	remaining time.Duration
	spinner   spinner.Model
	bar       progress.Model
	await     tea.Cmd
	doneErr   error
	result    authCodeResult
	err       error
}

func newWaitingModel(title, detail string, total time.Duration, await tea.Cmd, doneErr error) *waitingModel {
	sp := spinner.New()
	sp.Style = infoStyle
	bar := progress.New(
		progress.WithDefaultGradient(),
		progress.WithWidth(24),
		progress.WithoutPercentage(),
	)
	return &waitingModel{
		title:     title,
		detail:    detail,
		total:     total,
		remaining: total,
		spinner:   sp,
		bar:       bar,
		await:     await,
		doneErr:   doneErr,
	}
}

func (m *waitingModel) Init() tea.Cmd {
	cmds := []tea.Cmd{m.spinner.Tick, m.bar.Init(), countdownTickCmd()}
	if m.await != nil {
		cmds = append(cmds, m.await)
	}
	return tea.Batch(cmds...)
}

func (m *waitingModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case countdownTickMsg:
		if m.remaining <= time.Second {
			m.remaining = 0
			if m.doneErr != nil {
				m.err = m.doneErr
			}
			return m, tea.Quit
		}
		m.remaining -= time.Second
		pct := 1 - (float64(m.remaining) / float64(m.total))
		cmds := []tea.Cmd{countdownTickCmd()}
		if cmd := m.bar.SetPercent(pct); cmd != nil {
			cmds = append(cmds, cmd)
		}
		return m, tea.Batch(cmds...)
	case authResultMsg:
		if msg.err != nil {
			m.err = msg.err
			return m, tea.Quit
		}
		m.result = msg.result
		return m, tea.Quit
	case tea.WindowSizeMsg:
		return m, nil
	case progress.FrameMsg:
		updated, cmd := m.bar.Update(msg)
		if bar, ok := updated.(progress.Model); ok {
			m.bar = bar
		}
		return m, cmd
	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd
	}
	return m, nil
}

func (m *waitingModel) View() string {
	if m.total <= 0 {
		return ""
	}
	remaining := formatDuration(m.remaining)
	if m.remaining <= 0 {
		remaining = "done"
	}
	parts := []string{accentStyle.Render(m.title)}
	if m.detail != "" {
		parts = append(parts, m.detail)
	}
	parts = append(parts, fmt.Sprintf("%s %s %s", m.spinner.View(), m.bar.View(), countdownStyle.Render(remaining)))
	return strings.Join(parts, "\n")
}

func countdownTickCmd() tea.Cmd {
	return tea.Tick(time.Second, func(time.Time) tea.Msg { return countdownTickMsg{} })
}

func authResultCmd(ctx context.Context, callback <-chan authCodeResult) tea.Cmd {
	return func() tea.Msg {
		select {
		case <-ctx.Done():
			return authResultMsg{err: ctx.Err()}
		case result := <-callback:
			return authResultMsg{result: result}
		}
	}
}

func waitForAuthCode(ctx context.Context, callback <-chan authCodeResult, timeout time.Duration) (authCodeResult, error) {
	if !isTerminal() {
		return waitForAuthCodePlain(ctx, callback, timeout)
	}

	model := newWaitingModel(
		"Waiting for browser authorization",
		"Approve access in X to continue",
		timeout,
		authResultCmd(ctx, callback),
		context.DeadlineExceeded,
	)

	program := tea.NewProgram(model, tea.WithInput(os.Stdin), tea.WithOutput(os.Stderr))
	done := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			program.Kill()
		case <-done:
		}
	}()

	final, err := program.Run()
	close(done)
	if err != nil {
		return authCodeResult{}, err
	}
	wm, ok := final.(*waitingModel)
	if !ok {
		return authCodeResult{}, fmt.Errorf("unexpected UI model result")
	}
	if wm.err != nil {
		return authCodeResult{}, wm.err
	}
	return wm.result, nil
}

func waitForAuthCodePlain(ctx context.Context, callback <-chan authCodeResult, timeout time.Duration) (authCodeResult, error) {
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	remaining := timeout
	for {
		logInfo("waiting for browser authorization (%s remaining)", formatDuration(remaining))
		select {
		case <-ctx.Done():
			return authCodeResult{}, ctx.Err()
		case <-deadline.C:
			return authCodeResult{}, context.DeadlineExceeded
		case result := <-callback:
			return result, nil
		case <-ticker.C:
			if remaining > time.Second {
				remaining -= time.Second
			} else {
				remaining = 0
			}
		}
	}
}

func sleepWithCountdown(ctx context.Context, duration time.Duration, message string) error {
	if duration <= 0 {
		return nil
	}
	if !isTerminal() || duration > 2*time.Minute {
		return sleepWithCountdownPlain(ctx, duration, message)
	}

	model := newWaitingModel(message, "Retry scheduled automatically", duration, nil, nil)
	program := tea.NewProgram(model, tea.WithInput(os.Stdin), tea.WithOutput(os.Stderr))
	done := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			program.Kill()
		case <-done:
		}
	}()

	final, err := program.Run()
	close(done)
	if err != nil {
		return err
	}
	wm, ok := final.(*waitingModel)
	if !ok {
		return fmt.Errorf("unexpected UI model result")
	}
	return wm.err
}

func sleepWithCountdownPlain(ctx context.Context, duration time.Duration, message string) error {
	if duration <= 0 {
		return nil
	}
	interval := time.Second
	if duration > 10*time.Minute {
		interval = time.Minute
	} else if duration > 2*time.Minute {
		interval = 30 * time.Second
	} else if duration > 30*time.Second {
		interval = 10 * time.Second
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	deadline := time.NewTimer(duration)
	defer deadline.Stop()
	remaining := duration
	for {
		logInfo("%s (%s remaining)", message, formatDuration(remaining))
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-deadline.C:
			return nil
		case <-ticker.C:
			if remaining > interval {
				remaining -= interval
			} else {
				remaining = 0
			}
		}
	}
}

func formatDuration(d time.Duration) string {
	if d < 0 {
		d = 0
	}
	d = d.Round(time.Second)
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	m := int(d.Minutes())
	s := int(d.Seconds()) % 60
	return fmt.Sprintf("%02dm%02ds", m, s)
}

func isTerminal() bool {
	fi, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	return fi.Mode()&os.ModeCharDevice != 0
}
