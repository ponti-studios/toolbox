"""Render a cover letter markdown file into an ATS-friendly DOCX."""
from __future__ import annotations

import re
import sys
import zipfile
from pathlib import Path

from lxml import etree as ET

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
CP = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
DC = "http://purl.org/dc/elements/1.1/"
DCTERMS = "http://purl.org/dc/terms/"
XSI = "http://www.w3.org/2001/XMLSchema-instance"
XML = "http://www.w3.org/XML/1998/namespace"


def w(tag: str) -> str:
    return f"{{{W}}}{tag}"


def cp_tag(tag: str) -> str:
    return f"{{{CP}}}{tag}"


def dc(tag: str) -> str:
    return f"{{{DC}}}{tag}"


def dcterms(tag: str) -> str:
    return f"{{{DCTERMS}}}{tag}"


def inline_runs(text: str, *, bold_default: bool = False) -> list[tuple[str, bool]]:
    runs: list[tuple[str, bool]] = []
    i = 0
    bold = bold_default
    while i < len(text):
        if text.startswith("**", i):
            bold = not bold
            i += 2
            continue
        end = text.find("**", i)
        if end == -1:
            runs.append((text[i:], bold))
            break
        runs.append((text[i:end], bold))
        i = end
    return [(chunk, is_bold) for chunk, is_bold in runs if chunk]


def make_paragraph(
    text: str,
    *,
    size: int = 22,
    bold: bool = False,
    before: int = 0,
    after: int = 0,
    italic: bool = False,
) -> ET._Element:
    p = ET.Element(w("p"))
    ppr = ET.SubElement(p, w("pPr"))
    spacing = ET.SubElement(ppr, w("spacing"))
    spacing.set(w("before"), str(before))
    spacing.set(w("after"), str(after))
    spacing.set(w("line"), "276")
    spacing.set(w("lineRule"), "auto")

    for chunk, is_bold in inline_runs(text, bold_default=bold):
        r_el = ET.SubElement(p, w("r"))
        rpr = ET.SubElement(r_el, w("rPr"))
        fonts = ET.SubElement(rpr, w("rFonts"))
        for attr in ("ascii", "hAnsi", "eastAsia", "cs"):
            fonts.set(w(attr), "Georgia")
        sz = ET.SubElement(rpr, w("sz"))
        sz.set(w("val"), str(size))
        szcs = ET.SubElement(rpr, w("szCs"))
        szcs.set(w("val"), str(size))
        if is_bold:
            ET.SubElement(rpr, w("b"))
            ET.SubElement(rpr, w("bCs"))
        if italic:
            ET.SubElement(rpr, w("i"))
        t = ET.SubElement(r_el, w("t"))
        if chunk.startswith(" ") or chunk.endswith(" "):
            t.set(f"{{{XML}}}space", "preserve")
        t.text = chunk
    return p


def empty_paragraph(*, before: int = 0, after: int = 0) -> ET._Element:
    p = ET.Element(w("p"))
    ppr = ET.SubElement(p, w("pPr"))
    spacing = ET.SubElement(ppr, w("spacing"))
    spacing.set(w("before"), str(before))
    spacing.set(w("after"), str(after))
    return p


def document_xml(lines: list[str]) -> bytes:
    doc = ET.Element(w("document"), nsmap={"w": W})
    body = ET.SubElement(doc, w("body"))

    for raw in lines:
        line = raw.rstrip()

        if not line.strip():
            body.append(empty_paragraph(after=40))
            continue

        # horizontal rule → small vertical gap
        if re.match(r"^-{3,}$", line.strip()):
            body.append(empty_paragraph(before=40, after=40))
            continue

        if line.startswith("# "):
            body.append(make_paragraph(line[2:].strip(), size=28, bold=True, after=40))
            continue

        if line.startswith("## "):
            body.append(make_paragraph(line[3:].strip(), size=24, bold=True, before=40, after=40))
            continue

        # plain paragraph
        body.append(make_paragraph(line, size=22, after=40))

    sect = ET.SubElement(body, w("sectPr"))
    pg_sz = ET.SubElement(sect, w("pgSz"))
    pg_sz.set(w("w"), "12240")
    pg_sz.set(w("h"), "15840")
    pg_mar = ET.SubElement(sect, w("pgMar"))
    for attr in ("top", "right", "bottom", "left"):
        pg_mar.set(w(attr), "1080")  # 0.75 inches
    pg_mar.set(w("header"), "0")
    pg_mar.set(w("footer"), "0")
    pg_mar.set(w("gutter"), "0")

    return ET.tostring(doc, xml_declaration=True, encoding="UTF-8", standalone=False)


def styles_xml() -> bytes:
    styles = ET.Element(w("styles"), nsmap={"w": W})
    normal = ET.SubElement(
        styles, w("style"),
        attrib={w("type"): "paragraph", w("default"): "1", w("styleId"): "Normal"}
    )
    ET.SubElement(normal, w("name"), attrib={w("val"): "Normal"})
    ppr = ET.SubElement(normal, w("pPr"))
    spacing = ET.SubElement(ppr, w("spacing"))
    spacing.set(w("before"), "0")
    spacing.set(w("after"), "0")
    spacing.set(w("line"), "240")
    spacing.set(w("lineRule"), "auto")
    rpr = ET.SubElement(normal, w("rPr"))
    fonts = ET.SubElement(rpr, w("rFonts"))
    for attr in ("ascii", "hAnsi", "eastAsia", "cs"):
        fonts.set(w(attr), "Georgia")
    for tag in ("sz", "szCs"):
        node = ET.SubElement(rpr, w(tag))
        node.set(w("val"), "22")
    return ET.tostring(styles, xml_declaration=True, encoding="UTF-8", standalone=False)


def content_types_xml() -> bytes:
    root = ET.Element("Types", nsmap={None: "http://schemas.openxmlformats.org/package/2006/content-types"})
    ET.SubElement(root, "Default", Extension="rels", ContentType="application/vnd.openxmlformats-package.relationships+xml")
    ET.SubElement(root, "Default", Extension="xml", ContentType="application/xml")
    ET.SubElement(root, "Override", PartName="/word/document.xml", ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml")
    ET.SubElement(root, "Override", PartName="/word/styles.xml", ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml")
    ET.SubElement(root, "Override", PartName="/docProps/core.xml", ContentType="application/vnd.openxmlformats-package.core-properties+xml")
    ET.SubElement(root, "Override", PartName="/docProps/app.xml", ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml")
    return ET.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=False)


def rels_root() -> bytes:
    root = ET.Element("Relationships", nsmap={None: "http://schemas.openxmlformats.org/package/2006/relationships"})
    ET.SubElement(root, "Relationship", Id="rId1", Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", Target="word/document.xml")
    ET.SubElement(root, "Relationship", Id="rId2", Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", Target="docProps/core.xml")
    ET.SubElement(root, "Relationship", Id="rId3", Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties", Target="docProps/app.xml")
    return ET.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=False)


def rels_document() -> bytes:
    root = ET.Element("Relationships", nsmap={None: "http://schemas.openxmlformats.org/package/2006/relationships"})
    ET.SubElement(root, "Relationship", Id="rId1", Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles", Target="styles.xml")
    return ET.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=False)


def core_props_xml() -> bytes:
    root = ET.Element(
        cp_tag("coreProperties"),
        nsmap={"cp": CP, "dc": DC, "dcterms": DCTERMS, "xsi": XSI},
    )
    ET.SubElement(root, dc("title")).text = "Charles Ponti Cover Letter"
    ET.SubElement(root, dc("creator")).text = "Charles Ponti"
    ET.SubElement(root, cp_tag("lastModifiedBy")).text = "Charles Ponti"
    ET.SubElement(root, dcterms("created"), attrib={f"{{{XSI}}}type": "dcterms:W3CDTF"}).text = "2026-06-08T00:00:00Z"
    ET.SubElement(root, dcterms("modified"), attrib={f"{{{XSI}}}type": "dcterms:W3CDTF"}).text = "2026-06-08T00:00:00Z"
    return ET.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=False)


def app_xml() -> bytes:
    VT = "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"
    root = ET.Element(
        "Properties",
        nsmap={None: "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties", "vt": VT},
    )
    ET.SubElement(root, "Application").text = "Microsoft Office Word"
    ET.SubElement(root, "DocSecurity").text = "0"
    ET.SubElement(root, "ScaleCrop").text = "false"
    ET.SubElement(root, "Company").text = ""
    ET.SubElement(root, "LinksUpToDate").text = "false"
    ET.SubElement(root, "SharedDoc").text = "false"
    ET.SubElement(root, "HyperlinksChanged").text = "false"
    ET.SubElement(root, "AppVersion").text = "16.0000"
    return ET.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=False)


_STANDALONE_RE = re.compile(r'^\[([^\]]+)\]$')


def resolve_lines(
    raw: str,
    *,
    date: str,
    manager: str | None,
    company: str | None,
    address: str | None,
    role: str | None,
) -> list[str]:
    # Standalone placeholder lines are removed when the value is not provided.
    standalone: dict[str, str | None] = {
        "Date": date,
        "Hiring Manager Name": manager,
        "Company Name": company,
        "Company Address": address,
    }
    # Inline placeholders always resolve — fall back to generic text.
    inline: dict[str, str] = {
        'Hiring Manager Name or "Hiring Team"': manager or "Hiring Team",
        "Company": company or "your company",
        "Role Phrase": f"the {role} position" if role else "the role",
    }

    result = []
    for line in raw.splitlines():
        m = _STANDALONE_RE.match(line.strip())
        if m:
            value = standalone.get(m.group(1))
            if value:
                result.append(value)
            # no value → drop the line entirely
        else:
            for key, value in inline.items():
                line = line.replace(f"[{key}]", value)
            result.append(line)
    return result


def build_docx(lines: list[str], dst: Path) -> None:
    if dst.exists():
        dst.unlink()
    with zipfile.ZipFile(dst, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types_xml())
        z.writestr("_rels/.rels", rels_root())
        z.writestr("docProps/core.xml", core_props_xml())
        z.writestr("docProps/app.xml", app_xml())
        z.writestr("word/document.xml", document_xml(lines))
        z.writestr("word/styles.xml", styles_xml())
        z.writestr("word/_rels/document.xml.rels", rels_document())


def main() -> int:
    import argparse
    from datetime import date

    parser = argparse.ArgumentParser(description="Render a cover letter markdown to DOCX.")
    parser.add_argument("source", help="Source .md file")
    parser.add_argument("output", help="Output .docx file")
    parser.add_argument("--date", default=None, help="Letter date (default: today)")
    parser.add_argument("--hiring-manager", default=None, metavar="NAME", help="Hiring manager name")
    parser.add_argument("--company", default=None, help="Company name")
    parser.add_argument("--address", default=None, help="Company address")
    parser.add_argument("--role", default=None, help="Role title")
    args = parser.parse_args()

    letter_date = args.date or date.today().strftime("%B %-d, %Y")
    lines = resolve_lines(
        Path(args.source).read_text(),
        date=letter_date,
        manager=args.hiring_manager,
        company=args.company,
        address=args.address,
        role=args.role,
    )
    build_docx(lines, Path(args.output))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
