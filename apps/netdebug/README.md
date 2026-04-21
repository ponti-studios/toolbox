# netdebug

Network debugging CLI with animated diagnostics for macOS.

## Installation

```bash
cargo install --path apps/netdebug
```

## Usage

```bash
netdebug [OPTIONS]
```

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-s, --sites <SITES>` | Sites to test (comma-separated) | `amazon.com,youtube.com,google.com` |
| `--no-dns-flush` | Skip DNS cache flush | `false` |
| `--no-traceroute` | Skip traceroute | `false` |

---

## Examples

```bash
# Default sites
netdebug

# Custom sites
netdebug -s example.com,test.com

# Multiple sites
netdebug -s google.com,github.com,stackoverflow.com,reddit.com

# Skip DNS flush
netdebug --no-dns-flush

# Custom sites without DNS flush
netdebug -s example.com --no-dns-flush

# Single site
netdebug -s google.com

# Many sites
netdebug -s google.com,facebook.com,twitter.com,linkedin.com,amazon.com

# International sites
netdebug -s google.co.uk,google.co.jp,google.com.au

# CDN endpoints
netdebug -s cdn.cloudflare.com,cdn.akamai.com

# API endpoints
netdebug -s api.github.com,api.openai.com
```

---

## Output Format

```
╔══════════════════════════════════════════╗
║         NETWORK DEBUG SCRIPT             ║
╚══════════════════════════════════════════╝

[*] Flushing DNS cache...
[✓] DNS cache flushed

[*] Building HTTP client...
[✓] Client ready

[*] Testing 3 sites...

═══ Results ═══

  ▸ google.com
    DNS Lookup:    12.345 ms
    TCP Connect:    0.000 ms
    Time to First:  50.123 ms
    Total Time:    100.246 ms

  ▸ github.com
    DNS Lookup:    15.678 ms
    TCP Connect:    0.000 ms
    Time to First:  75.456 ms
    Total Time:    150.912 ms

═══ Recommendations ═══

  1. If DNS lookup is slow (>50ms): Switch to Cloudflare DNS (1.1.1.1)
  2. If TCP connect is slow: ISP routing issue - call your ISP
  3. If time to first byte is slow (>200ms): CDN edge server issue
  4. If total varies wildly: Try Cloudflare WARP VPN
```

---

## Metrics Explained

| Metric | Description | Good | Slow |
|--------|-------------|------|------|
| **DNS Lookup** | Time to resolve domain name | < 50ms | > 50ms |
| **TCP Connect** | Time to establish TCP connection | < 50ms | > 100ms |
| **Time to First Byte** | Time until first response byte | < 200ms | > 500ms |
| **Total Time** | Complete request time | < 500ms | > 1000ms |

---

## Recommendations

Based on test results, the CLI provides these recommendations:

1. **Slow DNS (>50ms)** → Switch to Cloudflare DNS (1.1.1.1)
2. **Slow TCP Connect** → ISP routing issue, contact ISP
3. **Slow TTFB (>200ms)** → CDN edge server issue
4. **High Variance** → Try Cloudflare WARP VPN

---

## Build & Run

```bash
# Build
cargo build -p netdebug

# Run from source
cargo run -p netdebug -- -s google.com

# Run binary directly
./target/debug/netdebug -s google.com,github.com

# Install globally
cargo install --path apps/netdebug
```

---

## Testing Checklist

### Basic Functionality
- [ ] Default sites (amazon.com, youtube.com, google.com)
- [ ] Single site
- [ ] Two sites
- [ ] Multiple sites (5+)
- [ ] Custom site list

### Site Types
- [ ] Major tech sites (google.com, github.com)
- [ ] Social media (facebook.com, twitter.com)
- [ ] E-commerce (amazon.com)
- [ ] International sites (google.co.uk, google.co.jp)
- [ ] CDN endpoints
- [ ] API endpoints

### Options
- [ ] Default behavior
- [ ] Skip DNS flush (`--no-dns-flush`)
- [ ] Custom sites with skip DNS flush

### Error Cases
- [ ] Invalid domain name
- [ ] Non-existent domain
- [ ] Unreachable site

### Network Conditions
- [ ] Strong connection (WiFi)
- [ ] Weak connection
- [ ] High latency network
- [ ] VPN connection

---

## Platform-Specific Behavior

### macOS
- DNS flush uses `dscacheutil -flushcache` and `killall -HUP mDNSResponder`
- Default behavior includes DNS flush

### Linux
- DNS flush command may differ by distribution
- Consider systemd-resolved, nscd, etc.

### Windows
- DNS flush uses `ipconfig /flushdns`
- Not currently implemented

---

## Technical Details

### HTTP Client Configuration

```rust
reqwest::Client::builder()
    .tcp_keepalive(Duration::from_secs(10))
    .build()
```

### Progress Animation

- Uses `indicatif` for progress bars
- Multi-progress for concurrent site testing
- Custom spinner style with Unicode characters

### Concurrency

- All sites tested in parallel using `tokio::spawn`
- Results collected and displayed after all complete

---

## Troubleshooting

### Common Issues

**All sites timeout:**
- Check internet connection
- Verify firewall settings
- Check proxy configuration

**DNS lookup slow:**
- Try `--no-dns-flush` option
- Check DNS server configuration
- Consider switching to Cloudflare DNS (1.1.1.1)

**Inconsistent results:**
- Network congestion
- Server-side issues
- Geographic distance

---

## Requirements

- macOS (DNS flush uses macOS-specific commands)
- Rust 1.75+
- Network access for HTTP measurements

---

## Notes

- Requires internet connection
- DNS flush is macOS-specific
- All requests use HTTPS
- No data is stored or logged
- Requests are made in parallel for efficiency

---

## Technical Notes

- Tests sites in parallel using `tokio::spawn`
- Uses `reqwest` for HTTPS requests and `indicatif` for progress UI
- DNS flush behavior is macOS-specific and is skipped with `--no-dns-flush`
- Timing results are approximate and intended for diagnostics, not benchmarking

## Related Files

- Source: `apps/netdebug/src/main.rs`
- Tests: `apps/netdebug/src/main.rs` (inline tests)
