"""Shared helpers for Luxel's build scripts. Pure stdlib; no third-party deps."""

from __future__ import annotations

import hashlib
import os
import pathlib
import platform
import shutil
import subprocess
import sys
from typing import Iterable, Sequence

# Installer/deliverable extensions worth checksumming after a release build.
DELIVERABLE_EXTS = (".dmg", ".msi", ".exe", ".appimage", ".deb", ".rpm")


def repo_root() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parent.parent


def is_windows() -> bool:
    return platform.system() == "Windows"


def is_macos() -> bool:
    return platform.system() == "Darwin"


def is_linux() -> bool:
    return platform.system() == "Linux"


def which(name: str) -> str | None:
    return shutil.which(name)


def run(
    cmd: Sequence[str],
    cwd: pathlib.Path | None = None,
    env: dict[str, str] | None = None,
    check: bool = True,
) -> int:
    """Run a subprocess, streaming output to the terminal."""
    pretty = " ".join(cmd)
    print(f">> {pretty}")
    full_env = os.environ.copy()
    if env:
        full_env.update(env)
    completed = subprocess.run(
        list(cmd),
        cwd=str(cwd) if cwd else None,
        env=full_env,
        check=False,
    )
    if check and completed.returncode != 0:
        print(f"!! command failed (exit {completed.returncode}): {pretty}", file=sys.stderr)
        sys.exit(completed.returncode)
    return completed.returncode


def join_paths(parts: Iterable[pathlib.Path | str]) -> str:
    return os.pathsep.join(str(p) for p in parts)


def find_bundle_dir(root: pathlib.Path) -> pathlib.Path | None:
    """Locate the tauri bundle output dir (workspace or crate-local)."""
    for candidate in (
        root / "src-tauri" / "target" / "release" / "bundle",
        root / "target" / "release" / "bundle",
    ):
        if candidate.exists():
            return candidate
    return None


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def print_bundle_checksums(bundle_dir: pathlib.Path | None) -> None:
    """Print the SHA256 of each installer deliverable under `bundle_dir`."""
    if not bundle_dir or not bundle_dir.exists():
        return
    files = sorted(
        p
        for p in bundle_dir.rglob("*")
        if p.is_file() and p.suffix.lower() in DELIVERABLE_EXTS
    )
    if not files:
        info("No installer deliverables (.dmg/.msi/.exe/...) found to checksum.")
        return
    info("SHA256 checksums:")
    for p in files:
        print(f"  {sha256_file(p)}  {p.name}")


def info(msg: str) -> None:
    print(f"-- {msg}")


def warn(msg: str) -> None:
    print(f"!! {msg}", file=sys.stderr)
