# netdebug

Network debugging CLI with animated diagnostics for macOS.

## Features

- DNS cache flush (macOS)
- HTTP timing measurements (DNS, TCP, TTFB, total)
- Animated progress bars
- Network recommendations based on results

## Installation

```bash
cargo install --path apps/netdebug
```

## Usage

```bash
# Default sites (amazon.com, youtube.com, google.com)
netdebug

# Custom sites
netdebug --sites cloudflare.com,fastly.com

# Skip DNS flush
netdebug --no-dns-flush

# Skip traceroute
netdebug --no-traceroute
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--sites` | `amazon.com,youtube.com,google.com` | Comma-separated list of sites to test |
| `--no-dns-flush` | false | Skip DNS cache flush |
| `--no-traceroute` | false | Skip traceroute |

## Example Output

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

  ▸ amazon.com
    DNS Lookup:    12.345 ms
    TCP Connect:    0.000 ms
    Time to First:  156.789 ms
    Total Time:     234.567 ms

═══ Recommendations ═══

  1. If DNS lookup is slow (>50ms): Switch to Cloudflare DNS (1.1.1.1)
  2. If TCP connect is slow: ISP routing issue - call your ISP
  3. If time to first byte is slow (>200ms): CDN edge server issue
  4. If total varies wildly: Try Cloudflare WARP VPN
```

## Requirements

- macOS (DNS flush uses macOS-specific commands)
- Rust 1.75+
- Network access for HTTP measurements

## Notes

- DNS flush requires elevated privileges on macOS
- Timing measurements are estimates based on HTTP request patterns
- Recommendations are general network troubleshooting guidance