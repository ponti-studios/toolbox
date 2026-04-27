class Timekit < Formula
  desc "Apple Calendar intelligence CLI for local-first enrichment"
  homepage "https://github.com/charlesponti/cli-tools"
  license "MIT"
  url "https://github.com/charlesponti/cli-tools/archive/refs/tags/timekit-v0.1.0.tar.gz"
  sha256 "REPLACE_WITH_SHA256"

  def install
    system "swift", "build", "-c", "release"
    bin.install ".build/release/timekit"
  end

  test do
    assert_match "Calendar intelligence CLI", shell_output("#{bin}/timekit --help")
  end
end
