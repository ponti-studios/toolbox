import { Command } from "@oclif/core";
import { runCliCommand } from "../cli/run-command.js";

export default class Normalize extends Command {
  static strict = false;
  async run(): Promise<void> {
    await runCliCommand("normalize", this.argv);
  }
}
