import { Command } from "@oclif/core";
import { runCliCommand } from "../cli/run-command.js";

export default class Calendars extends Command {
  static strict = false;
  async run(): Promise<void> {
    await runCliCommand("calendars", this.argv);
  }
}
