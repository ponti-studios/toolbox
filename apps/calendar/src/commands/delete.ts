import { Command } from "@oclif/core";
import { runCliCommand } from "../cli/run-command.js";

export default class Delete extends Command {
  static strict = false;
  async run(): Promise<void> {
    await runCliCommand("delete", this.argv);
  }
}
