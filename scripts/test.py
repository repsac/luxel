"""Run Luxel tests.

Usage:
    python scripts/test.py
    python scripts/test.py --rust-only
    python scripts/test.py --frontend-only
    python scripts/test.py --lint
"""

from __future__ import annotations

import argparse
import sys

from _common import info, repo_root, run, which


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Luxel tests")
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--rust-only", action="store_true")
    scope.add_argument("--frontend-only", action="store_true")
    parser.add_argument("--lint", action="store_true")
    args = parser.parse_args()

    root = repo_root()
    do_rust = not args.frontend_only
    do_front = not args.rust_only

    failed = []
    if do_rust:
        cargo = which("cargo")
        if not cargo:
            print("cargo not found", file=sys.stderr)
            return 1
        info("Running cargo test --workspace")
        rc = run([cargo, "test", "--workspace"], cwd=root, check=False)
        if rc != 0:
            failed.append("cargo test")
        if args.lint:
            info("Running cargo fmt --check")
            rc = run([cargo, "fmt", "--all", "--", "--check"], cwd=root, check=False)
            if rc != 0:
                failed.append("cargo fmt --check")
            info("Running cargo clippy")
            rc = run(
                [cargo, "clippy", "--workspace", "--", "-D", "warnings"],
                cwd=root,
                check=False,
            )
            if rc != 0:
                failed.append("cargo clippy")

    if do_front:
        npm = which("npm")
        if not npm:
            print("npm not found", file=sys.stderr)
            return 1
        info("Running npm test (vitest)")
        rc = run([npm, "test", "--", "--run"], cwd=root, check=False)
        if rc != 0:
            failed.append("vitest")
        if args.lint:
            info("Running tsc --noEmit")
            rc = run([npm, "exec", "--", "tsc", "--noEmit"], cwd=root, check=False)
            if rc != 0:
                failed.append("tsc")

    if failed:
        print(f"!! failed: {', '.join(failed)}", file=sys.stderr)
        return 1
    info("All tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
