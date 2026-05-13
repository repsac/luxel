"""Launch Luxel in development mode (Tauri dev shell + Vite).

Usage:
    python scripts/launch.py
    python scripts/launch.py --scene examples/default_scene.luxel.json
    python scripts/launch.py --gpu-backend auto|metal|dx12|vulkan
"""

from __future__ import annotations

import argparse
import sys

from _common import info, repo_root, run, which


def main() -> int:
    parser = argparse.ArgumentParser(description="Launch Luxel (dev)")
    parser.add_argument("--scene", default=None, help="Path to a .luxel.json scene to open at startup")
    parser.add_argument(
        "--gpu-backend",
        choices=["auto", "metal", "dx12", "vulkan", "gl"],
        default="auto",
    )
    args = parser.parse_args()

    npm = which("npm")
    if not npm:
        print("npm not found", file=sys.stderr)
        return 1

    env = {
        "LUXEL_GPU_BACKEND": args.gpu_backend,
    }
    if args.scene:
        env["LUXEL_INITIAL_SCENE"] = args.scene

    info(f"Launching Luxel (backend={args.gpu_backend}, scene={args.scene or 'default'})")
    return run([npm, "run", "tauri", "--", "dev"], cwd=repo_root(), env=env, check=False)


if __name__ == "__main__":
    sys.exit(main())
