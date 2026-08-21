import { Command } from "@oclif/core";
import { runLegacyCommand } from "../cli/run-legacy.js";

export default class Rollback extends Command {
  static strict = false;
  async run(): Promise<void> {
    await runLegacyCommand("rollback", this.argv);
  }
}
