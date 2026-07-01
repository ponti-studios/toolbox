from __future__ import annotations

from pathlib import Path
from typing import Iterable

import internetarchive
import typer
from rich.console import Console

DEFAULT_QUERY = "collection:hiphopmixtapes"
DEFAULT_OUTPUT = Path("complete_datpiff_list.txt")

app = typer.Typer(
    add_completion=False,
    help="Crawl Internet Archive search results and emit archive.org detail URLs.",
)
scrape_app = typer.Typer(add_completion=False, help="Scrape archive.org-backed sources.")
console = Console()


@app.callback()
def main() -> None:
    """DatPiff Internet Archive crawler."""


app.add_typer(scrape_app, name="scrape")


def iter_urls(query: str) -> Iterable[str]:
    """Yield archive.org details URLs for every matching collection item."""
    seen: set[str] = set()
    for result in internetarchive.search_items(query):
        identifier = result.get("identifier")
        if not identifier or identifier in seen:
            continue
        seen.add(identifier)
        yield f"https://archive.org/details/{identifier}"


@scrape_app.command("archiveorg")
def scrape_archiveorg(
    query: str = typer.Option(
        DEFAULT_QUERY,
        "--query",
        "-q",
        help="Internet Archive search query.",
    ),
    output: Path = typer.Option(
        DEFAULT_OUTPUT,
        "--output",
        "-o",
        help="Output file path.",
    ),
) -> None:
    """Crawl archive.org for matching items and write detail URLs."""
    output.parent.mkdir(parents=True, exist_ok=True)

    console.print(f"[bold cyan]Starting crawl[/] for query: [green]{query}[/]")
    count = 0
    with console.status("[bold cyan]Fetching archive.org results...[/]"):
        with output.open("w", encoding="utf-8") as handle:
            for url in iter_urls(query):
                handle.write(url + "\n")
                count += 1
                if count % 1000 == 0:
                    console.log(f"Saved {count} URLs")

    if count == 0:
        console.print("[yellow]No matching URLs were found.[/]")
    console.print(f"[bold green]Finished[/] Saved {count} total URLs to {output}")
