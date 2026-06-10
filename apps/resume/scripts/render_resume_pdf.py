"""Render the ATS resume source into a simple, readable PDF."""
from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

from fpdf import FPDF


BLUE = (31, 86, 124)
BLACK = (20, 20, 20)
FIELD_RE = re.compile(r"^(Company|Title|Location|Dates):\s*(.*)$")


def asciiish(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("’", "'").replace("“", '"').replace("”", '"')
    text = text.replace("–", "-").replace("—", "-").replace("×", "x")
    text = text.replace("•", "-")
    return text


def strip_md(text: str) -> str:
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    return text.replace("`", "")


class ResumePDF(FPDF):
    def __init__(self):
        super().__init__(orientation="P", unit="pt", format="letter")
        self.set_auto_page_break(True, margin=48)
        self.set_margins(48, 48, 48)
        self.set_title("Charles Ponti Resume")
        self.set_author("Charles Ponti")

    def section(self, title: str) -> None:
        self.ln(7)
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(*BLUE)
        self.cell(0, 16, title, new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(*BLACK)

    def role(self, title: str) -> None:
        self.ln(2)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(*BLUE)
        self.multi_cell(0, 13, title, align="L")
        self.set_text_color(*BLACK)

    def body(self, text: str, indent: float = 0, size: int = 10) -> None:
        self.set_x(self.l_margin + indent)
        self.set_font("Helvetica", "", size)
        self.multi_cell(0, 12, text, align="L")

    def bullet(self, text: str) -> None:
        self.set_font("Helvetica", "", 10)
        self.set_x(self.l_margin)
        self.multi_cell(0, 12, f"- {text}", align="L", new_x="LMARGIN", new_y="NEXT")

    def field(self, label: str, value: str) -> None:
        self.set_font("Helvetica", "B", 10)
        self.write(12, f"{label}:")
        self.set_font("Helvetica", "", 10)
        self.write(12, f" {value}")
        self.ln(12)


def render(src: Path, dst: Path) -> None:
    pdf = ResumePDF()
    pdf.add_page()
    pdf.set_text_color(*BLACK)

    for raw in src.read_text().splitlines():
        line = asciiish(strip_md(raw.rstrip()))
        if not line:
            pdf.ln(5)
            continue
        if line.startswith("# "):
            pdf.set_font("Helvetica", "", 22)
            pdf.cell(0, 24, line[2:].strip(), new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "", 11)
            continue
        if line.startswith("## "):
            pdf.section(line[3:].strip())
            continue
        if line.startswith("### "):
            pdf.role(line[4:].strip())
            continue
        match = FIELD_RE.match(line)
        if match:
            pdf.field(match.group(1), match.group(2))
            continue
        if line.startswith("- "):
            pdf.bullet(line[2:].strip())
            continue
        pdf.body(line)

    pdf.output(str(dst))


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: render_resume_pdf.py SOURCE.md OUTPUT.pdf", file=sys.stderr)
        return 2
    render(Path(sys.argv[1]), Path(sys.argv[2]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
