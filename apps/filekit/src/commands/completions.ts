import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeText } from "../lib/helpers.js";

export function completionPath(shell: string): string {
  const home = homedir();
  return shell === "zsh"
    ? join(home, ".zsh/completions/_filekit")
    : shell === "bash"
      ? join(home, ".local/share/bash-completion/completions/filekit")
      : shell === "fish"
        ? join(home, ".config/fish/completions/filekit.fish")
        : shell === "powershell"
          ? join(home, "Documents/PowerShell/Completions/_filekit.ps1")
          : join(home, ".local/share/filekit/completions/filekit");
}
export function generateCompletions(shell: string): void {
  const commands =
    "frontmatter walk aggregate validate migrate stage publish remove slug update set completions generate install files move merge-markdown find-duplicates bulk-rename convert xlsx-to-csv analyze";
  if (shell === "zsh")
    console.log("#compdef filekit\n_arguments '*: :(frontmatter docx files analyze completions)'");
  else if (shell === "fish") console.log("complete -c filekit -f -a '" + commands + "'");
  else console.log("# filekit completions for " + shell + "\n" + commands);
}
export function installCompletions(
  shell: string,
  options: { dryRun?: boolean; force?: boolean },
): void {
  const path = completionPath(shell);
  if (options.dryRun) {
    console.log(path);
    return;
  }
  if (existsSync(path) && !options.force)
    throw new Error("completion file already exists: " + path + " (use --force to overwrite)");
  writeText(path, "# filekit completions\n");
  console.log("installed completions to " + path);
}
