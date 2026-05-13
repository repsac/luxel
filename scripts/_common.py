"""Shared helpers for Luxel's build scripts. Pure stdlib; no third-party deps."""

from __future__ import annotations

import os
import pathlib
import platform
import shutil
import subprocess
import sys
from typing import Iterable, Sequence


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


def info(msg: str) -> None:
    print(f"-- {msg}")


def warn(msg: str) -> None:
    print(f"!! {msg}", file=sys.stderr)
