# Luxel

A local, developer-focused GLSL shader workbench: edit Shadertoy-style GLSL fragment shaders, render a single frame, and inspect the result with camera tools, debug console, and status monitoring.

## Current Status

Milestone 0 through 6 scaffolding is in place:

- Tauri 2 + React/TypeScript + Vite frontend.
- Rust workspace with `luxel-core`, `luxel-io`, `luxel-system`, `luxel-render`.
- `wgpu`-based offscreen renderer with `naga` GLSL → WGSL translation.
- Shadertoy-compatible `mainImage(out vec4, in vec2)` entry point with `iResolution`, `iTime`, `iFrame`, `iMouse` uniforms.
- Scene file format (`.luxel.json`) with `schemaVersion` and migration scaffolding.
- Camera orbit/pan/dolly/reset, bookmarks, frustum overlay, aspect-ratio control.
- Cross-platform Python helper scripts.

## Requirements

- Python 3.11+ (for the helper scripts)
- Rust toolchain (stable, via [rustup](https://rustup.rs))
- Node.js 18+ with npm
- macOS Apple Silicon (Metal) or Windows with a DX12/Vulkan capable GPU

Run `python scripts/doctor.py` to verify your environment.

## macOS setup

```bash
xcode-select --install
brew install node       # if you don't already have it
curl https://sh.rustup.rs -sSf | sh
python scripts/doctor.py
```

## Windows setup

1. Install [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload.
2. Install [Node.js LTS](https://nodejs.org).
3. Install Rust via [rustup](https://rustup.rs).
4. Run `python scripts/doctor.py`.

## Run the dev app

```bash
python scripts/launch.py
python scripts/launch.py --scene examples/default_scene.luxel.json
python scripts/launch.py --gpu-backend metal     # macOS
python scripts/launch.py --gpu-backend dx12      # Windows
python scripts/launch.py --gpu-backend vulkan
```

## Run the tests

```bash
python scripts/test.py
python scripts/test.py --rust-only
python scripts/test.py --frontend-only
python scripts/test.py --lint
```

## Build a release

```bash
python scripts/build.py --release
# or, identically:
python scripts/package.py --release
```

`--release` runs `tauri build`, which produces shippable platform bundles:

| Platform | Output |
| --- | --- |
| macOS | `target/release/bundle/macos/Luxel.app` (the app itself) + `target/release/bundle/dmg/Luxel_*.dmg` (installer for sharing) |
| Windows | `target/release/bundle/msi/Luxel_*.msi` + `target/release/bundle/nsis/Luxel_*-setup.exe` |

A debug build (`python scripts/build.py` with no flags) just produces `dist/` and `target/debug/luxel-app` — useful for `./target/debug/luxel-app` development runs but not packaged for sharing.

## Camera controls

Luxel's camera is a "look-at" rig: a `position`, `target`, and `up` vector with a vertical FOV. The Render view exposes it through these gestures (inside the render canvas):

| Input | What it does |
| --- | --- |
| Left-drag | Orbit around `target`, distance preserved |
| Shift-drag or middle-drag | Pan (both `position` and `target` slide together) |
| Scroll wheel | Dolly: move along the camera→target ray, can't cross the target |
| `F` | Reset to default `(0, 0, 5)` looking at the origin |
| **Reset cam** button | Same as `F` |
| **Bookmarks ▾** | Save the current camera, restore a saved one, or delete |
| Camera position readout | Top-right of the Render header shows `[x, y, z]` |

The camera is exposed to GLSL shaders through these uniforms:

```glsl
vec3  iCameraPosition    // world-space position
float iCameraFov         // vertical, radians
vec3  iCameraForward     // unit basis vector pointing into the scene
vec3  iCameraRight       // unit basis vector
vec3  iCameraUp          // unit basis vector
```

The canonical ray-direction formula for a raymarcher:

```glsl
vec2 uv = (fragCoord * 2.0 - iResolution.xy) / iResolution.y;
float h = tan(iCameraFov * 0.5);
vec3 rd = normalize(iCameraForward + uv.x * h * iCameraRight + uv.y * h * iCameraUp);
```

Press `?` in the toolbar for an in-app quick reference covering keyboard shortcuts and the full uniform list.

The toolbar's **FPS** button toggles a heads-up overlay in the top-left of the render view that reports rolling FPS, last frame time (ms), and the current render resolution. The setting persists across app restarts via `localStorage`.

## How rendering is driven

Luxel uses a single `requestAnimationFrame` loop ([`src/hooks/useRenderDriver.ts`](src/hooks/useRenderDriver.ts)) — same model as a DCC viewport. Each animation frame:

1. Checks whether the scene is "dirty" (camera, render size, iTime, iFrame, or render quality changed since the last render).
2. If dirty AND no render is in flight, kicks off a GPU render at the current preview resolution.
3. Serializes renders — at most one in flight at a time, so a slow shader naturally caps the loop's rate without manual throttling.

End-to-end latency from a drag event to a rendered frame is one animation frame (~16 ms at 60 Hz) instead of the 60 ms trailing debounce the older on-demand model used. The result: navigation feels native.

When the scene is idle (no inputs changing), the loop still ticks but does no GPU work — RAF callbacks with an early-out are essentially free.

`iTime` and `iFrame` are exposed as manual scrub controls in the toolbar; move the slider to see time-dependent shaders update.

## Performance notes

Dev builds are noticeably slower than release because `wgpu`, `naga`, and the Tauri shell run unoptimized debug code on a hot path (every camera drag triggers a render). Two ways to speed them up:

1. **The `[profile.dev]` tweak already applied** to `Cargo.toml` keeps Luxel's own crates fast to recompile but compiles every dependency at `opt-level = 3`. First build of new deps takes ~30s longer, then each subsequent dev run is much snappier. You don't need to do anything; just run `python scripts/launch.py` as usual.
2. **Render-quality multiplier** in the toolbar lets you scale the preview render down (¼× to 2×). On a heavy raymarcher or a slow GPU, dropping to ½× makes camera drags feel native; you can bump it back to 1× before exporting.

For maximum performance, run the release build:

```bash
python scripts/build.py --release
# then open the bundled binary from src-tauri/target/release/
```

The release build is typically 5–10× faster than the dev build for shader-heavy scenes.

## Open / save scenes

- Use the **Open…** button in the toolbar to load a `.luxel.json` file.
- Use **Save** to write the current scene; an unsaved scene prompts for a path.
- Scenes embed: GLSL source, render settings (resolution, aspect ratio, overlay), camera state, camera bookmarks, and panel layout.

## Window state

Luxel remembers its window size, position, and maximized/fullscreen state between launches via [`tauri-plugin-window-state`](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/window-state). State is written on exit and restored on startup; no per-scene configuration is involved. To reset to defaults, delete the plugin's state file (`.window-state.json` under the app's data directory).

## Known limitations (v1)

- Single-frame rendering only (no animation loop).
- Fragment shader only; no compute, no multipass buffers, no texture channels.
- GLSL is translated to WGSL via `naga`; some advanced GLSL features may not survive translation. Errors include line numbers mapped back to the user's source.
- NVIDIA support means DX12 or Vulkan, **not** CUDA.

## Architecture

```
luxel/
├── Cargo.toml                  # Rust workspace
├── package.json                # Frontend deps (Vite + React + TS)
├── src-tauri/                  # Tauri shell (Rust process)
│   └── src/
│       ├── lib.rs              # Entrypoint, plugin setup
│       ├── commands.rs         # #[tauri::command] surface
│       ├── app_state.rs        # AppState (renderer, sampler)
│       └── events.rs           # Console event emission
├── crates/
│   ├── luxel-core/             # Scene model, camera math, validation
│   ├── luxel-io/               # Scene JSON load/save + migrations
│   ├── luxel-system/           # CPU/memory/GPU sampling
│   └── luxel-render/           # wgpu pipeline, GLSL prelude, naga compile
├── src/                        # React frontend
│   ├── components/             # LayoutRoot, RenderView, ShaderEditor, ConsolePanel, …
│   ├── state/                  # Zustand stores (scene, console, app)
│   └── tauri/                  # invoke() and event subscription wrappers
├── scripts/                    # Python build/test/launch helpers
└── examples/                   # Default scene + GLSL fixtures
```

### Tauri command surface

- `load_scene(path) -> SceneFile`
- `save_scene(path, scene)`
- `validate_scene_cmd(scene)`
- `default_scene() -> SceneFile`
- `compile_shader(shader) -> ShaderCompileResult`
- `render_single_frame(scene) -> RenderResult`
- `get_system_status() -> SystemStatus`
- `get_gpu_info() -> GpuInfo`
- `set_gpu_backend(backend)`

Console messages are emitted on the `luxel://console` event channel.

## Reference projects

These were studied for organizational ideas only — no code was ported in:

- [Blender EEVEE](https://github.com/blender/blender/tree/main/source/blender/draw/engines/eevee) — render engine module boundaries
- [Servo](https://github.com/servo/servo) — Rust workspace structure
- [OpenMoonRay](https://github.com/OpenMoonRay/openmoonray) — scene/render separation
- [appleseed](https://github.com/appleseedhq/appleseed) — scene file concepts

## License

MIT OR Apache-2.0.
