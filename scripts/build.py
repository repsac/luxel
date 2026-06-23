"""Build frontend and Rust/Tauri app.

Usage:
    python scripts/build.py                # dev: frontend bundle + cargo build (debug)
    python scripts/build.py --release      # tauri build: bundles .app/.dmg/.msi
    python scripts/build.py --frontend-only
    python scripts/build.py --backend-only
"""

from __future__ import annotations

import argparse
import sys

from _common import info, print_bundle_checksums, repo_root, run, warn, which


def install_js_deps(npm: str, root) -> None:
    """Install JS deps, preferring `npm ci` for a clean lockfile-driven install
    and falling back to `npm install` if `ci` rejects the tree.
    """
    if (root / "package-lock.json").exists():
        info("Trying `npm ci` (strict lockfile install)")
        rc = run([npm, "ci"], cwd=root, check=False)
        if rc == 0:
            return
        warn("`npm ci` failed; falling back to `npm install`")
    else:
        info("No package-lock.json; running `npm install` to generate one")
    rc = run([npm, "install"], cwd=root, check=False)
    if rc != 0:
        warn("`npm install` also failed — frontend deps may be incomplete")
        sys.exit(rc)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Luxel")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--debug", action="store_true", default=True)
    mode.add_argument(
        "--release",
        action="store_true",
        help="Run `tauri build` to produce shippable bundles (.app + .dmg on macOS, "
        ".msi/.exe on Windows). Outputs land in src-tauri/target/release/bundle/...",
    )
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--frontend-only", action="store_true")
    scope.add_argument("--backend-only", action="store_true")
    parser.add_argument(
        "--skip-install",
        action="store_true",
        help="Skip the npm install step (useful if deps are already up to date)",
    )
    args = parser.parse_args()

    root = repo_root()
    release = args.release
    do_frontend = not args.backend_only
    do_backend = not args.frontend_only

    npm = which("npm")
    if (do_frontend or release) and not npm:
        print("npm not found — install Node.js", file=sys.stderr)
        return 1

    # The release path uses `tauri build`, which internally runs the frontend's
    # `npm run build` (via beforeBuildCommand) AND produces a bundled .app/.dmg.
    # That makes the separate frontend/cargo steps redundant in release mode,
    # so we short-circuit straight to it.
    if release:
        if not args.skip_install:
            install_js_deps(npm, root)
        info("Running `tauri build` — produces .app/.dmg (macOS), .msi/.exe (Windows)")
        rc = run([npm, "run", "tauri", "--", "build"], cwd=root, check=False)
        if rc != 0:
            return rc
        bundle = root / "src-tauri" / "target" / "release" / "bundle"
        # `tauri build` actually emits to the workspace `target/release/bundle/`
        # because Cargo.toml declares a workspace; fall back to that if the
        # legacy path is missing.
        if not bundle.exists():
            bundle = root / "target" / "release" / "bundle"
        if bundle.exists():
            info(f"Bundles in: {bundle}")
            print_bundle_checksums(bundle)
        else:
            warn("tauri build finished but no bundle/ directory was found.")
        return 0

    # Dev path: frontend bundle + cargo build (debug).
    if do_frontend:
        if not args.skip_install:
            install_js_deps(npm, root)
        info("Building frontend")
        run([npm, "run", "build"], cwd=root)

    if do_backend:
        info("Building Rust workspace (debug)")
        cargo = which("cargo")
        if not cargo:
            print("cargo not found — install rustup", file=sys.stderr)
            return 1
        run([cargo, "build", "--workspace"], cwd=root)

    info("Build complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
