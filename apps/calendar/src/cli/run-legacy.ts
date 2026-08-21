import { runLegacy } from "../legacy/dispatcher.js";

export function runLegacyCommand(command: string, argv: string[]): Promise<void> {
  return runLegacy([command, ...argv]);
}
