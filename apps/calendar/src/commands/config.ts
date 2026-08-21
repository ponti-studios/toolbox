import { Command } from "@oclif/core";
import { runLegacyCommand } from "../cli/run-legacy.js";

export default class Config extends Command {
  static strict = false;
  async run(): Promise<void> {
    await runLegacyCommand("config", this.argv);
  }
}
