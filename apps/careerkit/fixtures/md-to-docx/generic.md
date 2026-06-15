# Generic Document

This file exercises the common Markdown features the generic converter should keep working:
links, emphasis, lists, blockquotes, code blocks, tables, images, and manual page breaks.

## Lists

- First item
  - Nested item
    - Deeper nested item
- Second item with **bold text**

## Quote

> A blockquote should survive the round-trip in readable form.

## Code

```python
def hello(name):
    return f"Hello, {name}"
```

## Table

| Column A | Column B |
| --- | --- |
| Alpha | Beta |
| Gamma | Delta |

## Image

![Example image](../../../../_assets/llms-wont-lead-to-agi.png)

<!-- pagebreak -->

## After Break

This heading should start a new page in the DOCX output.
