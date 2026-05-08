class Costkit < Formula
  desc "LLM cost analysis CLI"
  homepage "https://github.com/ponti-studios/toolbox"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/ponti-studios/toolbox/releases/download/costkit-v0.1.0/costkit-aarch64-apple-darwin.tar.gz"
      sha256 "REPLACE_WITH_AARCH64_SHA256"
    end
  end

  def install
    bin.install "costkit"
  end

  test do
    assert_match "LLM cost analysis CLI", shell_output("#{bin}/costkit --help")
  end
end
