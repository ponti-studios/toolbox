"""Render Markdown to DOCX using pandoc plus a YAML style config."""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
import zipfile
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET

import yaml


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
CP = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
DC = "http://purl.org/dc/elements/1.1/"
DCTERMS = "http://purl.org/dc/terms/"
XSI = "http://www.w3.org/2001/XMLSchema-instance"
XML = "http://www.w3.org/XML/1998/namespace"
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"

ET.register_namespace("w", W)

PAGEBREAK_HTML_RE = re.compile(r"^<!--\s*page(?:[- ]?break)?\s*-->$", re.IGNORECASE)
PAGEBREAK_TEX_RE = re.compile(r"^\\\\newpage$", re.IGNORECASE)
REMOTE_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")
TABLE_BORDER_RE = re.compile(r"^[\s:=\-\|]+$")
BULLET_PREFIX = re.compile(r"^[\-\u2022\u2023\u25E6\u2043\u2219\uf0b7]+\s*")
NUM_PREFIX = re.compile(r"^\d{1,3}[.)]\s+")
WS = re.compile(r"\s+")


class DocxRenderError(RuntimeError):
    pass


def q(name: str) -> str:
    return f"{{{W}}}{name}"


def ns(tag: str, namespace: str) -> str:
    return f"{{{namespace}}}{tag}"


def child(parent: ET.Element, tag: str) -> ET.Element | None:
    return parent.find(q(tag))


def ensure(parent: ET.Element, tag: str) -> ET.Element:
    found = child(parent, tag)
    if found is None:
        found = ET.SubElement(parent, q(tag))
    return found


def as_int(value: Any, *, default: int | None = None) -> int | None:
    if value is None:
        return default
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(round(value))
    if isinstance(value, str) and value.strip():
        return int(round(float(value)))
    return default


def inches_to_twips(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(round(float(value) * 1440))
    if isinstance(value, str) and value.strip():
        return int(round(float(value) * 1440))
    return None


def pt_to_half_points(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(round(float(value) * 2))
    if isinstance(value, str) and value.strip():
        return int(round(float(value) * 2))
    return None


def twips_from_pt(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(round(float(value) * 20))
    if isinstance(value, str) and value.strip():
        return int(round(float(value) * 20))
    return None


def merge_dict(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    result = dict(base)
    for key, value in overlay.items():
        if (
            key in result
            and isinstance(result[key], dict)
            and isinstance(value, dict)
        ):
            result[key] = merge_dict(result[key], value)
        else:
            result[key] = value
    return result


def normalize_config(raw: dict[str, Any]) -> dict[str, Any]:
    defaults = {
        "document": {},
        "page": {"size": "letter", "margins_in": {"top": 0.45, "right": 0.45, "bottom": 0.45, "left": 0.45, "header": 0, "footer": 0, "gutter": 0}},
        "defaults": {},
        "styles": {},
        "list": {"base_left_twips": 360, "level_step_twips": 360, "hanging_twips": 220},
        "images": {},
        "verification": {},
        "pandoc": {"from": "gfm"},
    }

    normalized = merge_dict(defaults, raw if raw else {})
    if "text" in raw and "defaults" not in raw:
        normalized["defaults"] = merge_dict(normalized["defaults"], raw["text"])
    return normalized


def load_config(path: Path) -> dict[str, Any]:
    raw = yaml.safe_load(path.read_text()) or {}
    if not isinstance(raw, dict):
        raise DocxRenderError(f"Style config must be a YAML mapping: {path}")
    return normalize_config(raw)


def run(cmd: list[str], *, cwd: Path | None = None) -> str:
    try:
        completed = subprocess.run(
            cmd,
            cwd=str(cwd) if cwd is not None else None,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        stdout = (exc.stdout or "").strip()
        details = "\n".join(part for part in [stderr, stdout] if part)
        raise DocxRenderError(
            f"Command failed: {' '.join(cmd)}" + (f"\n{details}" if details else "")
        ) from exc
    return completed.stdout


def pandoc_json(source: Path, *, from_format: str) -> dict[str, Any]:
    output = run(
        [
            "pandoc",
            "--from",
            from_format,
            "--to",
            "json",
            str(source.name),
        ],
        cwd=source.parent,
    )
    return json.loads(output)


def is_pagebreak_raw(fmt: str, text: str) -> bool:
    if fmt == "html":
        return bool(PAGEBREAK_HTML_RE.match(text.strip()))
    if fmt == "tex":
        return bool(PAGEBREAK_TEX_RE.match(text.strip()))
    return False


def is_remote_url(url: str) -> bool:
    scheme = urlsplit(url).scheme.lower()
    return scheme in {"http", "https", "ftp", "ftps", "data"}


def validate_ast(node: Any, *, source: Path, allow_remote_images: bool) -> None:
    if isinstance(node, dict):
        node_type = node.get("t")
        content = node.get("c")

        if node_type == "RawBlock" and isinstance(content, list) and len(content) == 2:
            fmt, text = content
            if not is_pagebreak_raw(fmt, text):
                raise DocxRenderError(
                    f"Unsupported raw block in {source.name!r}: {fmt} {text!r}. "
                    "Use <!-- pagebreak --> or \\newpage for manual breaks."
                )
        elif node_type == "RawInline" and isinstance(content, list) and len(content) == 2:
            fmt, text = content
            if not is_pagebreak_raw(fmt, text):
                raise DocxRenderError(
                    f"Unsupported raw inline in {source.name!r}: {fmt} {text!r}. "
                    "Remove raw HTML/TeX or convert it to plain Markdown."
                )
        elif node_type == "Image" and isinstance(content, list) and len(content) == 3:
            attr, caption, target = content
            url = target[0]
            if is_remote_url(url) and not allow_remote_images:
                raise DocxRenderError(
                    f"Remote image URLs are disabled: {url}. "
                    "Download the asset locally or enable remote media explicitly."
                )
            if not is_remote_url(url):
                image_path = (source.parent / urlsplit(url).path).resolve()
                if not image_path.exists():
                    raise DocxRenderError(f"Image not found: {url} (resolved to {image_path})")

        if isinstance(content, list):
            for item in content:
                validate_ast(item, source=source, allow_remote_images=allow_remote_images)
        elif isinstance(content, dict):
            validate_ast(content, source=source, allow_remote_images=allow_remote_images)

    elif isinstance(node, list):
        for item in node:
            validate_ast(item, source=source, allow_remote_images=allow_remote_images)


def write_lua_filter(path: Path) -> None:
    path.write_text(
        """
function RawBlock(el)
  local text = el.text:gsub("^%s+", ""):gsub("%s+$", "")
  local compact = text:lower():gsub("%s+", "")
  if el.format == "html" then
    if compact == "<!--pagebreak-->" or compact == "<!--page-break-->" then
      return pandoc.RawBlock('openxml', '<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
    end
  elseif el.format == "tex" then
    if compact == "\\\\newpage" then
      return pandoc.RawBlock('openxml', '<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
    end
  end
end
""".strip()
    )


def set_font(rpr: ET.Element, font: str | None) -> None:
    if not font:
        return
    fonts = ensure(rpr, "rFonts")
    for key in ("ascii", "hAnsi", "eastAsia", "cs"):
        fonts.set(q(key), font)


def set_size(rpr: ET.Element, size_pt: Any) -> None:
    half_points = pt_to_half_points(size_pt)
    if half_points is None:
        return
    for tag in ("sz", "szCs"):
        node = ensure(rpr, tag)
        node.set(q("val"), str(half_points))


def set_color(rpr: ET.Element, color: Any) -> None:
    if not color:
        return
    color = str(color).lstrip("#")
    node = ensure(rpr, "color")
    node.set(q("val"), color)


def set_underline(rpr: ET.Element, underline: Any) -> None:
    if not underline:
        return
    node = ensure(rpr, "u")
    if underline is True:
        node.set(q("val"), "single")
    else:
        node.set(q("val"), str(underline))


def set_spacing(
    ppr: ET.Element,
    *,
    before: Any = None,
    after: Any = None,
    line: Any = None,
    line_rule: str = "auto",
) -> None:
    spacing = ensure(ppr, "spacing")
    if before is not None:
        spacing.set(q("before"), str(as_int(before, default=0)))
    if after is not None:
        spacing.set(q("after"), str(as_int(after, default=0)))
    if line is not None:
        spacing.set(q("line"), str(as_int(line, default=240)))
        spacing.set(q("lineRule"), line_rule)


def set_indent(
    ppr: ET.Element,
    *,
    left: Any = None,
    hanging: Any = None,
    first_line: Any = None,
) -> None:
    if left is None and hanging is None and first_line is None:
        return
    indent = ensure(ppr, "ind")
    if left is not None:
        indent.set(q("left"), str(as_int(left, default=0)))
    if hanging is not None:
        indent.set(q("hanging"), str(as_int(hanging, default=0)))
    if first_line is not None:
        indent.set(q("firstLine"), str(as_int(first_line, default=0)))


def style_spec(flat: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(flat, dict):
        return {}
    result = dict(flat.get("run", {}) if isinstance(flat.get("run"), dict) else {})
    if isinstance(flat.get("paragraph"), dict):
        result = merge_dict(result, flat["paragraph"])
    for key, value in flat.items():
        if key not in {"run", "paragraph"}:
            result[key] = value
    return result


def apply_doc_defaults(styles_root: ET.Element, cfg: dict[str, Any]) -> None:
    defaults = style_spec(cfg.get("defaults", {}))
    doc_defaults = child(styles_root, "docDefaults")
    if doc_defaults is None:
        doc_defaults = ET.SubElement(styles_root, q("docDefaults"))

    rpr_default = doc_defaults.find(f".//{q('rPr')}")
    if rpr_default is None:
        rpr_default = ET.SubElement(doc_defaults, q("rPrDefault"))
        rpr_default = ET.SubElement(rpr_default, q("rPr"))
    ppr_default = doc_defaults.find(f".//{q('pPr')}")
    if ppr_default is None:
        ppr_default = ET.SubElement(doc_defaults, q("pPrDefault"))
        ppr_default = ET.SubElement(ppr_default, q("pPr"))

    set_font(rpr_default, defaults.get("font"))
    set_size(rpr_default, defaults.get("size_pt"))
    set_color(rpr_default, defaults.get("color"))
    set_underline(rpr_default, defaults.get("underline"))
    if defaults.get("bold"):
        ET.SubElement(rpr_default, q("b"))
        ET.SubElement(rpr_default, q("bCs"))
    if defaults.get("italic"):
        ET.SubElement(rpr_default, q("i"))
        ET.SubElement(rpr_default, q("iCs"))

    set_spacing(
        ppr_default,
        before=defaults.get("before_twips"),
        after=defaults.get("after_twips"),
        line=defaults.get("line_twips"),
        line_rule=defaults.get("line_rule", "auto"),
    )
    set_indent(
        ppr_default,
        left=defaults.get("left_twips"),
        hanging=defaults.get("hanging_twips"),
        first_line=defaults.get("first_line_twips"),
    )


def apply_style_node(style: ET.Element, cfg: dict[str, Any]) -> None:
    style_id = style.get(q("styleId")) or ""
    style_type = style.get(q("type")) or ""
    defaults = style_spec(cfg.get("defaults", {}))
    overrides = style_spec(cfg.get("styles", {}).get(style_id, {}))
    effective = merge_dict(defaults, overrides)

    if style_type in {"paragraph", "character", "table"}:
        rpr = child(style, "rPr")
        if rpr is None and style_type in {"paragraph", "character"}:
            rpr = ET.SubElement(style, q("rPr"))
        if rpr is not None:
            set_font(rpr, effective.get("font"))
            set_size(rpr, effective.get("size_pt"))
            set_color(rpr, effective.get("color"))
            set_underline(rpr, effective.get("underline"))
            if effective.get("bold"):
                ET.SubElement(rpr, q("b"))
                ET.SubElement(rpr, q("bCs"))
            if effective.get("italic"):
                ET.SubElement(rpr, q("i"))
                ET.SubElement(rpr, q("iCs"))

    if style_type == "paragraph":
        ppr = child(style, "pPr")
        if ppr is None:
            ppr = ET.SubElement(style, q("pPr"))
        set_spacing(
            ppr,
            before=effective.get("before_twips"),
            after=effective.get("after_twips"),
            line=effective.get("line_twips"),
            line_rule=effective.get("line_rule", "auto"),
        )
        set_indent(
            ppr,
            left=effective.get("left_twips"),
            hanging=effective.get("hanging_twips"),
            first_line=effective.get("first_line_twips"),
        )


def apply_list_indents(numbering_path: Path, cfg: dict[str, Any]) -> None:
    if not numbering_path.exists():
        return
    numbering = ET.parse(numbering_path)
    root = numbering.getroot()
    base_left = as_int(cfg.get("list", {}).get("base_left_twips"), default=360) or 360
    step = as_int(cfg.get("list", {}).get("level_step_twips"), default=360) or 360
    hanging = as_int(cfg.get("list", {}).get("hanging_twips"), default=220) or 220

    for lvl in root.findall(f".//{q('lvl')}"):
        level = as_int(lvl.get(q("ilvl")), default=0) or 0
        ind = lvl.find(f".//{q('ind')}")
        if ind is None:
            ppr = lvl.find(q("pPr"))
            if ppr is None:
                ppr = ET.SubElement(lvl, q("pPr"))
            ind = ET.SubElement(ppr, q("ind"))
        ind.set(q("left"), str(base_left + step * level))
        ind.set(q("hanging"), str(hanging))

    numbering.write(numbering_path, encoding="UTF-8", xml_declaration=True)


def set_core_props(core_path: Path, cfg: dict[str, Any], *, source: Path) -> None:
    metadata = cfg.get("document", {})
    title = metadata.get("title") or source.stem
    author = metadata.get("author") or ""
    creator = metadata.get("creator") or author
    modified_by = metadata.get("last_modified_by") or creator
    subject = metadata.get("subject") or ""
    keywords = metadata.get("keywords") or []
    if isinstance(keywords, str):
        keywords = [keywords]
    created = metadata.get("created") or "2026-01-01T00:00:00Z"
    modified = metadata.get("modified") or created

    root = ET.parse(core_path).getroot()
    for tag in ("title", "subject", "creator"):
        node = root.find(ns(tag, DC))
        if node is None:
            node = ET.SubElement(root, ns(tag, DC))
        if tag == "title":
            node.text = title
        elif tag == "subject":
            node.text = subject
        elif tag == "creator":
            node.text = author

    last_modified = root.find(ns("lastModifiedBy", CP))
    if last_modified is None:
        last_modified = ET.SubElement(root, ns("lastModifiedBy", CP))
    last_modified.text = modified_by

    created_node = root.find(ns("created", DCTERMS))
    if created_node is None:
        created_node = ET.SubElement(root, ns("created", DCTERMS), attrib={f"{{{XSI}}}type": "dcterms:W3CDTF"})
    created_node.text = created
    modified_node = root.find(ns("modified", DCTERMS))
    if modified_node is None:
        modified_node = ET.SubElement(root, ns("modified", DCTERMS), attrib={f"{{{XSI}}}type": "dcterms:W3CDTF"})
    modified_node.text = modified

    if keywords:
        keywords_node = root.find(ns("keywords", CP))
        if keywords_node is None:
            keywords_node = ET.SubElement(root, ns("keywords", CP))
        keywords_node.text = ", ".join(str(item) for item in keywords)

    ET.ElementTree(root).write(core_path, encoding="UTF-8", xml_declaration=True)


def set_app_props(app_path: Path, cfg: dict[str, Any], *, source: Path) -> None:
    metadata = cfg.get("document", {})
    title = metadata.get("title") or source.stem
    root = ET.parse(app_path).getroot()
    titles = root.find("TitlesOfParts")
    if titles is not None:
        vec = titles.find(".//{http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes}vector")
        if vec is not None:
            for child_node in list(vec):
                vec.remove(child_node)
            lpstr = ET.SubElement(vec, "{http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes}lpstr")
            lpstr.text = title
            vec.set("size", "1")
    ET.ElementTree(root).write(app_path, encoding="UTF-8", xml_declaration=True)


def set_page_layout(document_path: Path, cfg: dict[str, Any]) -> None:
    page = cfg.get("page", {})
    size = page.get("size", "letter")
    margins = page.get("margins_in", {})

    if isinstance(size, str):
        size_lc = size.lower()
        if size_lc == "letter":
            width_in, height_in = 8.5, 11.0
        elif size_lc == "a4":
            width_in, height_in = 8.27, 11.69
        else:
            raise DocxRenderError(f"Unsupported page size: {size}")
    elif isinstance(size, dict):
        width_in = float(size.get("width_in"))
        height_in = float(size.get("height_in"))
    else:
        raise DocxRenderError(f"Unsupported page size config: {size!r}")

    width_twips = inches_to_twips(width_in) or 12240
    height_twips = inches_to_twips(height_in) or 15840

    tree = ET.parse(document_path)
    root = tree.getroot()
    body = root.find(q("body"))
    if body is None:
        raise DocxRenderError("DOCX document is missing a body element")
    sect = child(body, "sectPr")
    if sect is None:
        sect = ET.SubElement(body, q("sectPr"))

    pg_sz = ensure(sect, "pgSz")
    pg_sz.set(q("w"), str(width_twips))
    pg_sz.set(q("h"), str(height_twips))

    pg_mar = ensure(sect, "pgMar")
    margin_keys = {
        "top": "top",
        "right": "right",
        "bottom": "bottom",
        "left": "left",
        "header": "header",
        "footer": "footer",
        "gutter": "gutter",
    }
    for key, attr in margin_keys.items():
        if key in margins:
            pg_mar.set(q(attr), str(inches_to_twips(margins[key]) or 0))
        elif attr not in pg_mar.attrib:
            pg_mar.set(q(attr), "0")

    tree.write(document_path, encoding="UTF-8", xml_declaration=True)


def scale_images(document_path: Path, cfg: dict[str, Any]) -> None:
    page = cfg.get("page", {})
    margins = page.get("margins_in", {})
    page_size = page.get("size", "letter")

    if isinstance(page_size, str):
        size_lc = page_size.lower()
        if size_lc == "letter":
            width_in = 8.5
        elif size_lc == "a4":
            width_in = 8.27
        else:
            width_in = 8.5
    elif isinstance(page_size, dict):
        width_in = float(page_size.get("width_in"))
    else:
        width_in = 8.5

    max_width_in = cfg.get("images", {}).get("max_width_in")
    if max_width_in is None:
        max_width_in = width_in - float(margins.get("left", 0.45)) - float(margins.get("right", 0.45))

    max_cx = int(round(float(max_width_in) * 914400))

    tree = ET.parse(document_path)
    root = tree.getroot()
    changed = False
    for frame in root.findall(f".//{ns('inline', WP)}") + root.findall(f".//{ns('anchor', WP)}"):
        extent = frame.find(f".//{ns('extent', WP)}")
        if extent is None:
            continue
        try:
            current_cx = int(extent.get("cx", "0"))
            current_cy = int(extent.get("cy", "0"))
        except ValueError:
            continue
        if current_cx <= 0 or current_cx <= max_cx:
            continue
        ratio = max_cx / current_cx
        new_cx = max_cx
        new_cy = int(round(current_cy * ratio))
        for node in frame.iter():
            if node.tag in {ns("extent", WP), ns("ext", A)}:
                if "cx" in node.attrib:
                    node.set("cx", str(new_cx))
                if "cy" in node.attrib:
                    node.set("cy", str(new_cy))
        changed = True
    if changed:
        tree.write(document_path, encoding="UTF-8", xml_declaration=True)


def patch_docx(docx_path: Path, cfg: dict[str, Any], *, source: Path) -> None:
    with tempfile.TemporaryDirectory() as td:
        rootdir = Path(td)
        with zipfile.ZipFile(docx_path) as zin:
            zin.extractall(rootdir)

        styles_path = rootdir / "word" / "styles.xml"
        styles = ET.parse(styles_path)
        styles_root = styles.getroot()
        apply_doc_defaults(styles_root, cfg)
        for style in styles_root.findall(q("style")):
            apply_style_node(style, cfg)
        styles.write(styles_path, encoding="UTF-8", xml_declaration=True)

        numbering_path = rootdir / "word" / "numbering.xml"
        apply_list_indents(numbering_path, cfg)

        document_path = rootdir / "word" / "document.xml"
        set_page_layout(document_path, cfg)
        scale_images(document_path, cfg)

        core_path = rootdir / "docProps" / "core.xml"
        if core_path.exists():
            set_core_props(core_path, cfg, source=source)
        app_path = rootdir / "docProps" / "app.xml"
        if app_path.exists():
            set_app_props(app_path, cfg, source=source)

        if docx_path.exists():
            docx_path.unlink()
        with zipfile.ZipFile(docx_path, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for path in rootdir.rglob("*"):
                if path.is_file():
                    zout.write(path, path.relative_to(rootdir).as_posix())


def render_with_pandoc(
    source: Path,
    rendered_docx: Path,
    cfg: dict[str, Any],
    *,
    from_format: str,
) -> None:
    with tempfile.TemporaryDirectory() as td:
        tempdir = Path(td)
        lua_filter = tempdir / "pagebreak.lua"
        write_lua_filter(lua_filter)

        cmd = [
            "pandoc",
            "--from",
            from_format,
            "--to",
            "docx",
            "--lua-filter",
            str(lua_filter),
            str(source.name),
            "-o",
            str(rendered_docx),
        ]

        resource_paths = [source.parent]
        extra_paths = cfg.get("pandoc", {}).get("resource_paths", [])
        if isinstance(extra_paths, list):
            resource_paths.extend(Path(p) for p in extra_paths)
        cmd.extend(["--resource-path", os.pathsep.join(str(p) for p in resource_paths)])

        run(cmd, cwd=source.parent)


def convert(source: Path, output: Path, style_path: Path, *, from_format: str) -> None:
    cfg = load_config(style_path)
    source = source.resolve()
    output = output.resolve()

    ast = pandoc_json(source, from_format=from_format)
    validate_ast(ast.get("blocks", []), source=source, allow_remote_images=bool(cfg.get("images", {}).get("allow_remote", False)))

    with tempfile.TemporaryDirectory() as td:
        rendered = Path(td) / "rendered.docx"
        render_with_pandoc(source, rendered, cfg, from_format=from_format)
        patch_docx(rendered, cfg, source=source)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(rendered.read_bytes())


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a Markdown file to DOCX using a YAML style config.")
    parser.add_argument("source", help="Source Markdown file")
    parser.add_argument("output", help="Output DOCX file")
    parser.add_argument("--style", required=True, help="YAML style config")
    parser.add_argument(
        "--from-format",
        default="gfm",
        help="Pandoc input format (default: gfm)",
    )
    args = parser.parse_args()

    try:
        convert(Path(args.source), Path(args.output), Path(args.style), from_format=args.from_format)
    except DocxRenderError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
