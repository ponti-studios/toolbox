class Voidline < Formula
  desc "Utility CLI for frontmatter, calendar, and local tooling workflows"
  homepage "https://github.com/charlesponti/cli-tools"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/charlesponti/cli-tools/releases/download/voidline-v0.1.0/voidline-aarch64-apple-darwin.tar.gz"
      sha256 "REPLACE_WITH_AARCH64_SHA256"
    end
  end

  def install
    bin.install "voidline"
  end

  test do
    assert_match "CLI utilities and tools", shell_output("#{bin}/voidline --help")
  end
end
