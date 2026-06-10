"""Clean Luxel build artifacts.

Usage:
    python scripts/clean.py
    python scripts/clean.py --deep
"""

from __future__ import annotations

import argparse
import shutil
import sys

from _common import info, repo_root, run, which


def remove(path) -> None:
    if path.exists():
        info(f"removing {path}")
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=True)
        else:
            path.unlink()


def main() -> int:
    parser = argparse.ArgumentParser(description="Clean Luxel build artifacts")
    parser.add_argument("--deep", action="store_true", help="Also remove node_modules and dist")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation for --deep")
    args = parser.parse_args()

    root = repo_root()
    cargo = which("cargo")
    if cargo:
        run([cargo, "clean"], cwd=root, check=False)
    if args.deep:
        if not args.yes:
            reply = input("Deep clean removes node_modules and dist. Continue? [y/N] ")
            if reply.strip().lower() not in ("y", "yes"):
                info("aborted")
                return 0
        remove(root / "node_modules")
        remove(root / "dist")
        remove(root / "package-lock.json")
        remove(root / "src-tauri" / "gen")
    info("clean complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
