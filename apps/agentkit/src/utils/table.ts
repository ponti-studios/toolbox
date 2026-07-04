// Unicode box-drawing table formatter.
// No dependencies — writes directly to string arrays.

type Align = "left" | "right";

interface Column {
  label: string;
  align?: Align;
  width?: number; // fixed width, or auto from content
}

interface Row {
  cells: string[]; // one per column
  indent?: number; // indent level (for sub-rows)
}

function measure(v: string): number {
  // Simple char-width: count printable chars (not ANSI escapes)
  return v.length;
}

function pad(text: string, width: number, align: Align): string {
  const diff = width - measure(text);
  if (diff <= 0) return text;
  return align === "right" ? " ".repeat(diff) + text : text + " ".repeat(diff);
}

/** Build a full table string. */
export function renderTable(columns: Column[], rows: Row[]): string {
  const colCount = columns.length;
  if (colCount === 0) return "";

  // Measure column widths from content + header
  const widths = columns.map((col, i) => {
    const headerW = measure(col.label);
    const contentW = rows.reduce((max, row) => {
      const cell = row.cells[i] ?? "";
      return Math.max(max, measure(cell) + (row.indent ?? 0) * 2);
    }, 0);
    return Math.max(headerW, Math.min(contentW, col.width ?? 60));
  });

  // Top border
  const top = "┌" + widths.map((w) => "─".repeat(w + 2)).join("┬") + "┐";

  // Header row
  const header = "│" + columns.map((col, i) => ` ${pad(col.label, widths[i], col.align ?? "left")} `).join("│") + "│";

  // Separator
  const sep = "├" + widths.map((w) => "─".repeat(w + 2)).join("┼") + "┤";

  // Data rows
  const dataLines: string[] = [];
  for (const row of rows) {
    const indent = (row.indent ?? 0) * 2;
    const line =
      "│" +
      row.cells
        .map((cell, i) => {
          const col = columns[i] ?? { label: "", align: "left" as const };
          const w = widths[i];
          const display = " ".repeat(indent) + cell;
          return ` ${pad(display, w, col.align ?? "left")} `;
        })
        .join("│") +
      "│";
    dataLines.push(line);
  }

  // Bottom border
  const bottom = "└" + widths.map((w) => "─".repeat(w + 2)).join("┴") + "┘";

  return [top, header, sep, ...dataLines, bottom].join("\n");
}

/** Render a simple horizontal rule line (for section breaks). */
export function rule(label?: string): string {
  const width = 72;
  if (!label) return "─".repeat(width);
  const padded = ` ${label} `;
  const dashCount = Math.max(3, width - measure(padded));
  const left = Math.floor(dashCount / 2);
  const right = dashCount - left;
  return "─".repeat(left) + padded + "─".repeat(right);
}

/** Render a summary line with label + value, right-aligned on the second part. */
export function summaryLine(label: string, value: string, width = 72): string {
  const labelW = measure(label);
  const valueW = measure(value);
  const dots = Math.max(1, width - labelW - valueW - 2);
  return `${label} ${"·".repeat(dots)} ${value}`;
}
