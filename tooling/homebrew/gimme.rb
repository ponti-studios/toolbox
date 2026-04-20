class Gimme < Formula
  desc "Copy files from GitHub to the local filesystem"
  homepage "https://github.com/charlesponti/cli-tools"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/charlesponti/cli-tools/releases/download/gimme-v0.1.1/gimme-aarch64-apple-darwin.tar.gz"
      sha256 "REPLACE_WITH_AARCH64_SHA256"
    end
  end

  def install
    bin.install "gimme"
  end

  test do
    assert_match "Copy files from GitHub", shell_output("#{bin}/gimme --help")
  end
end
