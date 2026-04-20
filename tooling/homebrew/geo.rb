class Geo < Formula
  desc "Geolocation lookup and CSV geocoding CLI"
  homepage "https://github.com/charlesponti/cli-tools"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/charlesponti/cli-tools/releases/download/geo-v0.1.0/geo-aarch64-apple-darwin.tar.gz"
      sha256 "REPLACE_WITH_AARCH64_SHA256"
    end
  end

  def install
    bin.install "geo"
  end

  test do
    assert_match "geolocation lookup", shell_output("#{bin}/geo --help")
  end
end
