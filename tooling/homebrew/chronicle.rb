class Chronicle < Formula
  desc "Calendar intelligence CLI for local-first Google Calendar enrichment"
  homepage "https://github.com/charlesponti/cli-tools"
  license "MIT"
  url "https://files.pythonhosted.org/packages/source/c/chronicle/chronicle-0.1.0.tar.gz"
  sha256 "REPLACE_WITH_SHA256"

  depends_on "python@3.12"

  def install
    system "python3", "-m", "pip", "install", ".", "--prefix=#{prefix}"
  end

  test do
    assert_match "Calendar intelligence CLI", shell_output("#{bin}/chronicle --help")
  end
end