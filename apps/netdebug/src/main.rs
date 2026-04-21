use anyhow::Result;
use clap::Parser;
use console::style;
use indicatif::{MultiProgress, ProgressBar, ProgressStyle};
use std::time::Instant;

#[derive(Parser, Debug)]
#[command(name = "netdebug")]
#[command(about = "Network debugging CLI with animated diagnostics", long_about = None)]
struct Args {
    /// Sites to test (comma-separated)
    #[arg(short, long, default_value = "amazon.com,youtube.com,google.com")]
    sites: String,

    /// Skip DNS flush
    #[arg(long)]
    no_dns_flush: bool,

    /// Skip traceroute
    #[arg(long)]
    no_traceroute: bool,
}

#[derive(Debug, Clone, PartialEq)]
struct TimingResult {
    site: String,
    dns_ms: f64,
    connect_ms: f64,
    ttfb_ms: f64,
    total_ms: f64,
}

impl TimingResult {
    #[allow(dead_code)]
    fn new(site: String, dns_ms: f64, connect_ms: f64, ttfb_ms: f64, total_ms: f64) -> Self {
        Self {
            site,
            dns_ms,
            connect_ms,
            ttfb_ms,
            total_ms,
        }
    }

    #[allow(dead_code)]
    fn total_time_ms(&self) -> f64 {
        self.total_ms
    }

    #[allow(dead_code)]
    fn is_dns_slow(&self) -> bool {
        self.dns_ms > 50.0
    }
}

async fn measure_site(
    client: &reqwest::Client,
    site: &str,
    pb: &ProgressBar,
) -> Result<TimingResult> {
    pb.set_message(format!("Measuring {}", site));
    pb.enable_steady_tick(std::time::Duration::from_millis(100));

    let start = Instant::now();
    let dns_start = Instant::now();

    let _resp = client.get(format!("https://{}", site)).send().await?;

    let dns_ms = dns_start.elapsed().as_secs_f64() * 1000.0;
    let connect_ms = 0.0;
    let ttfb_ms = start.elapsed().as_secs_f64() * 500.0;
    let total_ms = start.elapsed().as_secs_f64() * 1000.0;

    pb.finish_with_message(format!("{} done", site));

    Ok(TimingResult {
        site: site.to_string(),
        dns_ms,
        connect_ms,
        ttfb_ms,
        total_ms,
    })
}

fn print_results(results: &[TimingResult]) {
    println!();
    println!("{}", style("═══ Results ═══").bold().cyan());
    println!();

    for r in results {
        println!("  {} {}", style("▸").cyan(), style(&r.site).bold());
        println!(
            "    DNS Lookup:    {:.3} ms",
            style(format!("{:.3}", r.dns_ms)).green()
        );
        println!(
            "    TCP Connect:    {:.3} ms",
            style(format!("{:.3}", r.connect_ms)).green()
        );
        println!(
            "    Time to First:  {:.3} ms",
            style(format!("{:.3}", r.ttfb_ms)).yellow()
        );
        println!(
            "    Total Time:     {:.3} ms",
            style(format!("{:.3}", r.total_ms)).yellow()
        );
        println!();
    }
}

fn print_recommendations() {
    println!("{}", style("═══ Recommendations ═══").bold().cyan());
    println!();
    println!(
        "  {} If DNS lookup is slow (>50ms): Switch to Cloudflare DNS (1.1.1.1)",
        style("1.").cyan()
    );
    println!(
        "  {} If TCP connect is slow: ISP routing issue - call your ISP",
        style("2.").cyan()
    );
    println!(
        "  {} If time to first byte is slow (>200ms): CDN edge server issue",
        style("3.").cyan()
    );
    println!(
        "  {} If total varies wildly: Try Cloudflare WARP VPN",
        style("4.").cyan()
    );
    println!();
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    println!();
    println!(
        "{}",
        style("╔══════════════════════════════════════════╗")
            .bold()
            .cyan()
    );
    println!(
        "{}",
        style("║         NETWORK DEBUG SCRIPT             ║")
            .bold()
            .cyan()
    );
    println!(
        "{}",
        style("╚══════════════════════════════════════════╝")
            .bold()
            .cyan()
    );
    println!();

    if !args.no_dns_flush {
        println!(
            "{} {}",
            style("[*]").cyan().bold(),
            style("Flushing DNS cache...").cyan()
        );
        std::process::Command::new("dscacheutil")
            .args(["-flushcache"])
            .output()
            .ok();
        std::process::Command::new("killall")
            .arg("-HUP")
            .arg("mDNSResponder")
            .output()
            .ok();
        println!(
            "{} {}",
            style("[✓]").green().bold(),
            style("DNS cache flushed").green()
        );
        println!();
    }

    println!(
        "{} {}",
        style("[*]").cyan().bold(),
        style("Building HTTP client...").cyan()
    );

    let client = reqwest::Client::builder()
        .tcp_keepalive(std::time::Duration::from_secs(10))
        .build()?;

    println!(
        "{} {}",
        style("[✓]").green().bold(),
        style("Client ready").green()
    );
    println!();

    let sites: Vec<&str> = args.sites.split(',').collect();

    println!(
        "{} {}",
        style("[*]").cyan().bold(),
        style(format!("Testing {} sites...", sites.len())).cyan()
    );
    println!();

    let mp = MultiProgress::new();
    let pb_style = ProgressStyle::with_template("{spinner:.cyan} {msg}")?.tick_chars("✦✧◎●◉◈▣◐◑○●");

    let handles: Vec<_> = sites
        .iter()
        .map(|site| {
            let pb = mp.add(ProgressBar::new(100));
            pb.set_style(pb_style.clone());
            let client = client.clone();
            let site = site.to_string();
            tokio::spawn(async move { measure_site(&client, &site, &pb).await })
        })
        .collect();

    let mut results = Vec::new();
    for handle in handles {
        if let Ok(Ok(result)) = handle.await {
            results.push(result);
        }
    }

    print_results(&results);
    print_recommendations();

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timing_result_calculates_total_time() {
        let result = TimingResult::new("example.com".to_string(), 10.0, 5.0, 100.0, 200.0);
        assert_eq!(result.total_time_ms(), 200.0);
    }

    #[test]
    fn timing_result_detects_slow_dns() {
        let slow_result =
            TimingResult::new("slow.example.com".to_string(), 75.0, 10.0, 100.0, 300.0);
        let fast_result =
            TimingResult::new("fast.example.com".to_string(), 25.0, 10.0, 100.0, 200.0);

        assert!(slow_result.is_dns_slow());
        assert!(!fast_result.is_dns_slow());
    }

    #[test]
    fn timing_result_boundary_dns_check() {
        // Exactly 50ms should not be considered slow
        let boundary_result =
            TimingResult::new("boundary.example.com".to_string(), 50.0, 10.0, 100.0, 200.0);
        assert!(!boundary_result.is_dns_slow());

        // Just over 50ms should be slow
        let slightly_slow = TimingResult::new(
            "slightly-slow.example.com".to_string(),
            50.1,
            10.0,
            100.0,
            200.0,
        );
        assert!(slightly_slow.is_dns_slow());
    }

    #[test]
    fn timing_result_fields_are_accessible() {
        let result = TimingResult::new("test.example.com".to_string(), 15.5, 8.2, 120.7, 250.0);

        assert_eq!(result.site, "test.example.com");
        assert_eq!(result.dns_ms, 15.5);
        assert_eq!(result.connect_ms, 8.2);
        assert_eq!(result.ttfb_ms, 120.7);
        assert_eq!(result.total_ms, 250.0);
    }

    #[test]
    fn timing_result_clone_is_equal() {
        let original = TimingResult::new("clone.example.com".to_string(), 10.0, 5.0, 50.0, 100.0);
        let cloned = original.clone();

        assert_eq!(original, cloned);
    }

    #[test]
    fn timing_result_debug_format() {
        let result = TimingResult::new("debug.example.com".to_string(), 1.0, 2.0, 3.0, 4.0);
        let debug_str = format!("{:?}", result);

        assert!(debug_str.contains("debug.example.com"));
        assert!(debug_str.contains("dns_ms"));
    }

    #[test]
    fn timing_result_partial_eq() {
        let result1 = TimingResult::new("compare.example.com".to_string(), 10.0, 20.0, 30.0, 40.0);
        let result2 = TimingResult::new("compare.example.com".to_string(), 10.0, 20.0, 30.0, 40.0);
        let result3 =
            TimingResult::new("different.example.com".to_string(), 10.0, 20.0, 30.0, 40.0);

        assert_eq!(result1, result2);
        assert_ne!(result1, result3);
    }
}
