"""Verify that Markdown source text survives DOCX rendering in order."""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
import zipfile
import unicodedata
from pathlib import Path
from xml.etree import ElementTree as ET

import yaml


BULLET_PREFIX = re.compile(r"^[\-\u2022\u2023\u25E6\u2043\u2219\uf0b7]+\s*")
NUM_PREFIX = re.compile(r"^\d{1,3}[.)]\s+")
TABLE_BORDER_RE = re.compile(r"^[\s:=\-\|]+$")
WS = re.compile(r"\s+")

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture"


def run(cmd: list[str], *, cwd: Path | None = None) -> str:
    return subprocess.check_output(cmd, text=True, cwd=str(cwd) if cwd is not None else None)


def load_ignore_patterns(style_path: Path | None) -> list[str]:
    if style_path is None:
        return []
    raw = yaml.safe_load(style_path.read_text()) or {}
    if not isinstance(raw, dict):
        return []
    verification = raw.get("verification") or {}
    if not isinstance(verification, dict):
        return []
    patterns = verification.get("ignore_patterns") or []
    return [str(pattern) for pattern in patterns]


def q(namespace: str, tag: str) -> str:
    return f"{{{namespace}}}{tag}"


def text_from_drawing(node: ET.Element) -> str:
    descr = None
    for candidate in node.iter():
        if candidate.tag == q(WP, "docPr"):
            descr = descr or candidate.get("descr") or candidate.get("title")
        if candidate.tag == q(PIC, "cNvPr"):
            descr = descr or candidate.get("descr") or candidate.get("title")
    if descr:
        return f"[{descr}]"
    return ""


def text_from_paragraph(node: ET.Element) -> str:
    parts: list[str] = []

    def walk(el: ET.Element) -> None:
        if el.tag == q(W, "t"):
            parts.append(el.text or "")
        elif el.tag == q(W, "tab"):
            parts.append("\t")
        elif el.tag == q(W, "br"):
            parts.append("\n")
        elif el.tag == q(W, "drawing"):
            parts.append(text_from_drawing(el))
        else:
            for child in list(el):
                walk(child)

    walk(node)
    return "".join(parts)


def text_from_table(node: ET.Element) -> str:
    rows: list[str] = []
    for tr in node.findall(q(W, "tr")):
        cells: list[str] = []
        for tc in tr.findall(q(W, "tc")):
            cell_parts: list[str] = []
            for child in list(tc):
                if child.tag == q(W, "p"):
                    text = text_from_paragraph(child).strip()
                    if text:
                        cell_parts.append(text)
                elif child.tag == q(W, "tbl"):
                    nested = text_from_table(child).strip()
                    if nested:
                        cell_parts.append(nested)
            cells.append(" ".join(cell_parts).strip())
        rows.append("\t".join(cells))
    return "\n".join(rows)


def extract_docx_text(docx: Path) -> str:
    with zipfile.ZipFile(docx) as archive:
        document_xml = ET.fromstring(archive.read("word/document.xml"))

    body = document_xml.find(q(W, "body"))
    if body is None:
        return ""

    parts: list[str] = []
    for node in list(body):
        if node.tag == q(W, "p"):
            text = text_from_paragraph(node)
            if text:
                parts.append(text)
            else:
                parts.append("")
        elif node.tag == q(W, "tbl"):
            parts.append(text_from_table(node))
        else:
            continue
    return "\n\n".join(parts)


def normalize(text: str, ignore_patterns: list[str]) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\f", "\n")
    text = text.replace("’", "'").replace("“", '"').replace("”", '"')
    text = text.replace("–", "-").replace("—", "-").replace("×", "x")
    text = text.replace("•", "-")

    parts: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if TABLE_BORDER_RE.fullmatch(line):
            continue
        line = BULLET_PREFIX.sub("", line)
        line = NUM_PREFIX.sub("", line)
        line = re.sub(r"(?<=[).]) -$", "", line)
        line = re.sub(r"(?<=[).]) - (?=[A-Z])", " ", line)
        line = WS.sub(" ", line)
        parts.append(line)

    result = " ".join(parts)
    for pattern in ignore_patterns:
        result = re.sub(pattern, "", result)
    return WS.sub(" ", result).strip()


def compare_text(source: Path, docx: Path, *, style: Path | None = None, pdf: Path | None = None) -> int:
    ignore_patterns = load_ignore_patterns(style)

    source_plain = normalize(run(["pandoc", str(source.name), "-t", "plain"], cwd=source.parent), ignore_patterns)
    docx_plain = normalize(extract_docx_text(docx), ignore_patterns)

    if source_plain != docx_plain:
        print("docx text extraction mismatch", file=sys.stderr)
        print("source length:", len(source_plain), file=sys.stderr)
        print("docx length:", len(docx_plain), file=sys.stderr)
        print("\nsource excerpt:\n", source_plain[:1200], sep="", file=sys.stderr)
        print("\ndocx excerpt:\n", docx_plain[:1200], sep="", file=sys.stderr)
        return 1

    if pdf is not None:
        pdf_plain = normalize(run(["pdftotext", str(pdf), "-"]), ignore_patterns)
        if source_plain != pdf_plain:
            print("pdf text extraction mismatch", file=sys.stderr)
            print("source length:", len(source_plain), file=sys.stderr)
            print("pdf length:", len(pdf_plain), file=sys.stderr)
            print("\nsource excerpt:\n", source_plain[:1200], sep="", file=sys.stderr)
            print("\npdf excerpt:\n", pdf_plain[:1200], sep="", file=sys.stderr)
            return 1

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify DOCX text extraction against Markdown source.")
    parser.add_argument("source", help="Source Markdown file")
    parser.add_argument("docx", help="Rendered DOCX file")
    parser.add_argument("pdf", nargs="?", default=None, help="Optional PDF file to compare too")
    parser.add_argument("--style", default=None, help="Optional YAML style config with verification settings")
    args = parser.parse_args()

    source = Path(args.source)
    docx = Path(args.docx)
    pdf = Path(args.pdf) if args.pdf else None
    style = Path(args.style) if args.style else None

    return compare_text(source, docx, style=style, pdf=pdf)


if __name__ == "__main__":
    raise SystemExit(main())
