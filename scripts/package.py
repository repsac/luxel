"""Create platform packages using Tauri.

This is an alias for `build.py --release`. Both run `tauri build` which
produces a shippable bundle (`.app` + `.dmg` on macOS, `.msi`/`.exe` on
Windows). The script exists separately for back-compat — feel free to use
either entry point.

Usage:
    python scripts/package.py --release
"""

from __future__ import annotations

import argparse
import sys

from _common import info, repo_root, run, which


def main() -> int:
    parser = argparse.ArgumentParser(description="Package Luxel (alias for build.py --release)")
    parser.add_argument("--release", action="store_true", default=True)
    parser.parse_args()

    npm = which("npm")
    if not npm:
        print("npm not found", file=sys.stderr)
        return 1
    info("Packaging Luxel via `tauri build` — see scripts/build.py --release for details")
    return run([npm, "run", "tauri", "--", "build"], cwd=repo_root(), check=False)


if __name__ == "__main__":
    sys.exit(main())
