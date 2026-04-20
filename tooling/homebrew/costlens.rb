class Costlens < Formula
  desc "LLM cost analysis CLI"
  homepage "https://github.com/charlesponti/cli-tools"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/charlesponti/cli-tools/releases/download/costlens-v0.1.0/costlens-aarch64-apple-darwin.tar.gz"
      sha256 "REPLACE_WITH_AARCH64_SHA256"
    end
  end

  def install
    bin.install "costlens"
  end

  test do
    assert_match "LLM cost analysis CLI", shell_output("#{bin}/costlens --help")
  end
end
