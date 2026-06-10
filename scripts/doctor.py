"""Validate the local Luxel development environment.

Usage:
    python scripts/doctor.py
"""

from __future__ import annotations

import argparse
import platform
import sys

from _common import info, is_linux, is_macos, is_windows, warn, which


REQUIRED = [
    ("rustc", "Rust compiler (https://rustup.rs)"),
    ("cargo", "Cargo (ships with rustup)"),
    ("node", "Node.js 18+ (https://nodejs.org)"),
    ("npm", "npm (ships with Node)"),
]

OPTIONAL = [
    ("pnpm", "pnpm (only if you prefer it over npm)"),
    ("git", "git (recommended)"),
]


def check_python() -> bool:
    ok = sys.version_info >= (3, 11)
    info(
        f"Python {platform.python_version()} "
        f"{'OK' if ok else 'FAIL (need 3.11+)'}"
    )
    return ok


def check_program(name: str, hint: str, required: bool) -> bool:
    path = which(name)
    if path:
        info(f"{name}: {path}")
        return True
    msg = f"{name} not found — {hint}"
    if required:
        warn(f"REQUIRED missing: {msg}")
    else:
        info(f"(optional) {msg}")
    return not required


def platform_hints() -> None:
    if is_macos():
        info("macOS: ensure Xcode command-line tools (`xcode-select --install`).")
    elif is_windows():
        info(
            "Windows: install Visual Studio Build Tools (Desktop development with C++)."
        )
    elif is_linux():
        info(
            "Linux: install build-essential, libxdo-dev, libgtk-3-dev, libsoup-3.0-dev, "
            "libwebkit2gtk-4.1-dev (for Tauri)."
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Luxel doctor")
    parser.parse_args()

    ok = True
    ok &= check_python()
    for name, hint in REQUIRED:
        ok &= check_program(name, hint, required=True)
    for name, hint in OPTIONAL:
        check_program(name, hint, required=False)

    info(f"Platform: {platform.system()} {platform.release()} ({platform.machine()})")
    platform_hints()

    if ok:
        info("Environment looks good.")
        return 0
    warn("Environment has missing required tools.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
