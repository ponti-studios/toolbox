"""MLX model management — download and cache profiles."""

from __future__ import annotations

from pathlib import Path

from rich.console import Console

from timekit_engine.config import cache_root

console = Console()

# Model profiles: name → HuggingFace repo id
PROFILES: dict[str, str] = {
    "fast": "mlx-community/gemma-4-26b-a4b-it-4bit",
    "deep": "mlx-community/gemma-4-31b-it-4bit",
}


def model_dir(profile: str) -> Path:
    return cache_root() / profile


def is_downloaded(profile: str) -> bool:
    d = model_dir(profile)
    return d.exists() and any(d.iterdir())


def pull(profile: str) -> Path:
    """Download the model for the given profile to the timekit cache.

    Returns the local directory path.
    """
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        raise RuntimeError("huggingface-hub is not installed. Run: pip install huggingface-hub")

    repo_id = PROFILES[profile]
    dest = model_dir(profile)
    dest.mkdir(parents=True, exist_ok=True)

    console.print(f"[dim]Downloading [bold]{repo_id}[/bold] → {dest}[/dim]")
    console.print("[dim]This may take several minutes on first download.[/dim]")

    snapshot_download(
        repo_id=repo_id,
        local_dir=str(dest),
        local_dir_use_symlinks=False,
        ignore_patterns=["*.msgpack", "*.h5", "flax_model*", "tf_model*", "rust_model*"],
    )

    return dest
