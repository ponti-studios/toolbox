import { runCommand } from "./handlers.js";

export function runCliCommand(command: string, argv: string[]): Promise<void> {
  return runCommand([command, ...argv]);
}
