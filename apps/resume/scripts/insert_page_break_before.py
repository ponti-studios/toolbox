"""Insert a manual page break before the first paragraph starting with NEEDLE."""
from __future__ import annotations

import sys
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
ET.register_namespace('w', W)


def q(n: str) -> str:
    return f'{{{W}}}{n}'


def para_text(p: ET.Element) -> str:
    return ''.join((t.text or '') for t in p.findall(f'.//{q("t")}'))


def make_break_para() -> ET.Element:
    p = ET.Element(q('p'))
    r = ET.SubElement(p, q('r'))
    br = ET.SubElement(r, q('br'))
    br.set(q('type'), 'page')
    return p


def insert_page_break(src: Path, dst: Path, needle: str):
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        with zipfile.ZipFile(src) as zin:
            zin.extractall(root)

        doc_path = root / 'word' / 'document.xml'
        tree = ET.parse(doc_path)
        body = tree.getroot().find(q('body'))
        if body is None:
            raise SystemExit('no body element found')

        for i, el in enumerate(list(body)):
            if el.tag == q('p') and para_text(el).startswith(needle):
                body.insert(i, make_break_para())
                break
        else:
            raise SystemExit(f'needle not found: {needle!r}')

        tree.write(doc_path, encoding='UTF-8', xml_declaration=True)

        if dst.exists():
            dst.unlink()
        with zipfile.ZipFile(dst, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
            for p in root.rglob('*'):
                if p.is_file():
                    zout.write(p, p.relative_to(root).as_posix())


if __name__ == '__main__':
    insert_page_break(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3])
