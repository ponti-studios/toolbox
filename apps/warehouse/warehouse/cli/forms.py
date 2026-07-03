"""Interactive form helpers for CLI add commands."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import questionary
from rich.console import Console
from rich.table import Table

console = Console()


@dataclass
class Field:
    """A single form field."""

    name: str
    message: str
    required: bool = False
    default: str = ""
    validator: Callable[[str], str | None] | None = None


def run_form(title: str, fields: list[Field]) -> dict[str, str]:
    """Prompt the user for each field and return collected values.

    Required fields loop until a non-empty value is entered. Optional
    fields can be skipped with Enter. After all fields, a summary table
    is shown and the user confirms before the values are returned.
    """

    while True:
        values: dict[str, str] = {}
        for f in fields:
            msg = f.message
            if not f.required:
                msg += " (Enter to skip)"

            while True:
                answer = questionary.text(
                    msg, default=f.default
                ).unsafe_ask()

                if answer is None:
                    raise KeyboardInterrupt

                if f.required and not answer.strip():
                    console.print("[red]This field is required.[/red]")
                    continue

                if f.validator:
                    error = f.validator(answer.strip())
                    if error:
                        console.print(f"[red]{error}[/red]")
                        continue

                values[f.name] = answer.strip()
                break

        # Show summary and confirm
        table = Table(title=title)
        table.add_column("Field", style="cyan")
        table.add_column("Value", style="green")
        for row in fields:
            table.add_row(row.name, values[row.name] or "—")
        console.print(table)

        confirmed = questionary.confirm("Save?", default=True).unsafe_ask()
        if confirmed:
            return values
        console.print("[yellow]Let's try again.[/yellow]\n")
