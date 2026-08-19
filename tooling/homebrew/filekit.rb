class Filekit < Formula
  desc "Utility CLI for frontmatter and local tooling workflows"
  homepage "https://github.com/ponti-studios/toolbox"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/ponti-studios/toolbox/releases/download/filekit-v0.1.0/filekit-aarch64-apple-darwin.tar.gz"
      sha256 "REPLACE_WITH_AARCH64_SHA256"
    end
  end

  def install
    bin.install "filekit"
  end

  test do
    assert_match "CLI utilities and tools", shell_output("#{bin}/filekit --help")
  end
end
