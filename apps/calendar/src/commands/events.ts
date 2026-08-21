import { Command } from "@oclif/core";
import { runCliCommand } from "../cli/run-command.js";

export default class Events extends Command {
  static strict = false;
  async run(): Promise<void> {
    await runCliCommand("events", this.argv);
  }
}
