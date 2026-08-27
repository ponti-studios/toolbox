import path from "node:path";
import { checkCmd, resolveFiles, getFileSize, getSipsDims, fmtSize } from "../utils";

function padEnd(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 1) + "…" : s + " ".repeat(len - s.length);
}

export function cmdInfo(files: string[]): void {
  const inputs = resolveFiles(files);
  if (inputs.length === 0) {
    console.error("Error: no valid input files");
    process.exit(1);
  }

  checkCmd("sips", "part of macOS");

  console.log(`${padEnd("FILE", 40)} ${padEnd("DIMENSIONS", 12)} ${padEnd("SIZE", 12)}`);
  console.log(`${padEnd("", 40)} ${padEnd("", 12)} ${padEnd("", 12)}`.replace(/ /g, "─"));

  for (const f of inputs) {
    const dims = getSipsDims(f);
    const bytes = getFileSize(f);
    console.log(
      `${padEnd(path.basename(f), 40)} ${padEnd(dims, 12)} ${padEnd(fmtSize(bytes), 12)}`,
    );
  }
}
