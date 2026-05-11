# GLSL Desktop Renderer — Claude Build Plan

## Project Intent

Build a cross-platform desktop application that works like a local, developer-focused version of Shadertoy: a GLSL editor, single-frame renderer, render viewport, debug console, status monitor, camera controls, camera bookmarks, frustum overlay, scene saving, and flexible dockable/maximizable views.

The user plans to use **Claude primarily for implementation** and **Codex primarily for code review**. Claude should build this incrementally, with tests at each stage, and avoid large speculative rewrites.

Target platforms:

- macOS on Apple Silicon
- Windows with NVIDIA GPU support

Preferred stack:

- Rust backend
- Tauri desktop application shell
- Frontend in TypeScript
- GPU rendering through a Rust-native abstraction where possible
- Pre-made Python helper scripts for building, launching, testing, and packaging

This is not intended to be a full DCC renderer at first. The first major version is a **single-frame GLSL renderer with interactive camera/view tools** and a solid project/scene format.

---

## Reference Projects

Claude should study the following projects for architecture, terminology, pipeline organization, and rendering-engine design patterns. These are references, not source material to copy.

### Blender EEVEE

Reference:

<https://github.com/blender/blender/tree/main/source/blender/draw/engines/eevee>

Use for:

- Render-engine organization
- Camera handling concepts
- Debug overlay concepts
- Render pass separation
- Material/shader pipeline naming conventions
- How real-time renderers organize film/output/light/probe/camera components

Do not attempt to port Blender code. Use this only to inspire internal module boundaries such as camera, film/output, debug overlays, shader compilation, and render passes.

### Servo

Reference:

<https://github.com/servo/servo>

Use for:

- Rust project organization at scale
- Platform abstraction ideas
- Event loop and windowing separation
- Cross-platform build discipline
- Testing patterns for a large Rust application

Do not copy Servo subsystems. Use it as an example of how to structure a serious Rust codebase.

### OpenMoonRay

Reference:

<https://github.com/OpenMoonRay/openmoonray>

Use for:

- Renderer terminology
- Scene representation ideas
- Renderer configuration concepts
- Production renderer separation between scene data, render settings, and execution

This application is not a path tracer in v1. OpenMoonRay should be used as a design reference for scene/render separation, not as a rendering model to implement.

### appleseed

Reference:

<https://github.com/appleseedhq/appleseed>

Use for:

- Scene/project file concepts
- Renderer settings organization
- Production-friendly naming of camera, frame, output, and rendering configuration
- Validation patterns for renderer inputs

Do not copy appleseed code. Treat it as an architecture reference.

---

## Product Name Placeholder

Use the temporary internal project name:

```text
ShaderForge Desktop
```

Do not over-optimize branding. The name can change later.

---

## Core User Stories

### Render and Edit GLSL

As a user, I want to edit GLSL code in an IDE-style editor and render the output in a viewport so I can quickly develop shader scenes locally.

Acceptance criteria:

- The app opens with a default GLSL shader.
- The render view displays a single-frame result.
- The user can edit GLSL and trigger a re-render.
- Shader compile errors are shown in the console.
- Runtime/render errors are shown in the console.
- The editor supports syntax highlighting.
- The editor supports basic find, line numbers, and error line hints.

### Render View

As a user, I want a render viewport that supports navigation and inspection.

Acceptance criteria:

- Render view shows the shader output.
- Viewport can be maximized/restored.
- Camera can be navigated using basic controls.
- Camera position can be reset.
- Camera position can be bookmarked and restored.
- A camera frustum overlay can be shown/hidden.
- The overlay respects the configured aspect ratio.

### Console

As a user, I want a console panel that shows application, renderer, shader compiler, and debug output.

Acceptance criteria:

- Console panel receives structured log messages from the Rust backend.
- Logs have levels: debug, info, warning, error.
- Shader compile errors are formatted clearly.
- Console can be cleared.
- Console can be maximized/restored.
- Console can be filtered by severity.

### Status Line

As a user, I want a status line that shows system and render status.

Acceptance criteria:

- Shows CPU usage.
- Shows memory usage.
- Shows GPU name when available.
- Shows GPU adapter/backend where available.
- Shows render resolution/aspect ratio.
- Shows shader compile status.
- Shows current scene dirty/saved state.
- Shows last render time.

### Scene Saving

As a user, I want to save a scene so that GLSL code, layout, render settings, and camera state are restored later.

Acceptance criteria:

- Scene file stores GLSL source.
- Scene file stores window/view layout.
- Scene file stores current camera position/orientation.
- Scene file stores camera bookmarks.
- Scene file stores aspect ratio and render resolution settings.
- Scene file can be opened on macOS and Windows.
- Scene format is human-readable.
- Scene format has a version field.

### View Layout

As a user, I want to resize and maximize panels so I can focus on the editor, viewport, or console.

Acceptance criteria:

- Main views: render, editor, console, status line.
- Render, editor, and console panels can be maximized.
- Maximized panel can be restored.
- Layout state is saved with the scene.
- Layout state survives app restart when reopening a scene.

---

## Technical Direction

### Recommended Rendering Backend

Use `wgpu` as the primary Rust GPU abstraction.

Rationale:

- Cross-platform Rust-native GPU API.
- Supports Vulkan, Metal, DX12, and other backends depending on platform.
- Fits macOS Apple Silicon through Metal.
- Fits Windows NVIDIA through DX12/Vulkan backend selection.
- Has strong ecosystem alignment with modern Rust graphics work.

Important note:

The app is described as a GLSL renderer, but `wgpu` primarily works with WGSL/SPIR-V workflows depending on toolchain and version. Claude should implement a shader ingestion pipeline that accepts GLSL from the user and translates/validates it into a backend-compatible representation.

Recommended path:

1. Accept Shadertoy-like GLSL fragment shader text from the editor.
2. Wrap it with a small compatibility prelude.
3. Compile/translate GLSL using `naga` or another Rust-friendly shader translation path supported by the selected `wgpu` version.
4. Send structured compiler errors back to the frontend console.
5. Keep the public user-facing language as GLSL.

Claude must verify the current `wgpu`/`naga` GLSL support before implementation. If direct GLSL-to-wgpu support is inadequate, implement an explicit compatibility layer and document limitations.

### Tauri Boundary

The Tauri frontend should own:

- UI layout
- Editor view
- Console rendering
- Status-line rendering
- View maximization/restoration
- File dialogs
- User commands

The Rust backend should own:

- Scene model
- Shader compilation/validation
- Render engine lifecycle
- GPU adapter discovery
- Render timing
- System status sampling
- Scene save/load serialization
- Log event emission

Avoid burying renderer logic inside frontend components.

---

## Proposed Workspace Structure

Use a Rust workspace with a Tauri app and internal crates.

```text
shaderforge-desktop/
  README.md
  LICENSE
  package.json
  pnpm-lock.yaml or package-lock.json
  src-tauri/
    Cargo.toml
    tauri.conf.json
    src/
      main.rs
      commands.rs
      app_state.rs
      events.rs
  crates/
    shaderforge-core/
      Cargo.toml
      src/
        lib.rs
        scene.rs
        layout.rs
        camera.rs
        bookmarks.rs
        settings.rs
        validation.rs
    shaderforge-render/
      Cargo.toml
      src/
        lib.rs
        renderer.rs
        gpu.rs
        shader.rs
        shader_prelude.rs
        pipeline.rs
        frame.rs
        overlay.rs
        errors.rs
    shaderforge-system/
      Cargo.toml
      src/
        lib.rs
        status.rs
        cpu.rs
        memory.rs
        gpu_info.rs
    shaderforge-io/
      Cargo.toml
      src/
        lib.rs
        scene_file.rs
        migrations.rs
  src/
    main.tsx
    App.tsx
    components/
      LayoutRoot.tsx
      RenderView.tsx
      ShaderEditor.tsx
      ConsolePanel.tsx
      StatusLine.tsx
      Toolbar.tsx
      CameraBookmarks.tsx
      AspectRatioControl.tsx
    state/
      appStore.ts
      sceneStore.ts
      consoleStore.ts
      layoutStore.ts
    tauri/
      commands.ts
      events.ts
    styles/
      app.css
  scripts/
    build.py
    launch.py
    test.py
    clean.py
    doctor.py
    package.py
  examples/
    default_scene.shaderforge.json
    shaders/
      default.glsl
      gradient.glsl
      raymarch_sphere.glsl
  tests/
    fixtures/
      valid_scene.shaderforge.json
      invalid_scene_missing_version.shaderforge.json
      shader_compile_error.glsl
```

---

## Scene File Format

Use JSON for v1 because it is human-readable, easy to diff, and simple to validate.

File extension:

```text
.shaderforge.json
```

Example:

```json
{
  "schemaVersion": 1,
  "appVersion": "0.1.0",
  "scene": {
    "name": "Untitled Shader Scene",
    "shader": {
      "language": "glsl",
      "source": "void mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(0.0, 0.2, 0.4, 1.0); }",
      "entryPoint": "mainImage",
      "compatibility": "shadertoy-fragment-v1"
    },
    "renderSettings": {
      "mode": "single_frame",
      "width": 1920,
      "height": 1080,
      "aspectRatio": "16:9",
      "showFrustumOverlay": true
    },
    "camera": {
      "position": [0.0, 0.0, 5.0],
      "target": [0.0, 0.0, 0.0],
      "up": [0.0, 1.0, 0.0],
      "fovYDegrees": 45.0,
      "near": 0.1,
      "far": 1000.0
    },
    "cameraBookmarks": [
      {
        "id": "default",
        "name": "Default",
        "position": [0.0, 0.0, 5.0],
        "target": [0.0, 0.0, 0.0],
        "up": [0.0, 1.0, 0.0],
        "fovYDegrees": 45.0
      }
    ],
    "layout": {
      "maximizedView": null,
      "panels": {
        "render": { "visible": true, "size": 0.5 },
        "editor": { "visible": true, "size": 0.35 },
        "console": { "visible": true, "size": 0.15 }
      }
    }
  }
}
```

Rules:

- Always include `schemaVersion`.
- Add migrations before changing the scene shape.
- Never silently discard unknown fields during save/load if the file may have been created by a newer version.
- Validate all numeric camera fields.
- Validate render width/height bounds.
- Validate aspect ratio syntax.
- Preserve line endings in shader source where reasonable.

---

## GLSL Compatibility Target

Implement a Shadertoy-inspired fragment shader compatibility mode.

Support v1 uniforms:

```glsl
uniform vec3 iResolution;
uniform float iTime;
uniform int iFrame;
uniform vec4 iMouse;
```

Even though v1 renders a single frame, include `iTime` and `iFrame` in the compatibility interface for future animation support.

Support user entry point:

```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord)
```

The app should internally wrap this into the target shader entrypoint required by the rendering backend.

Initial restrictions:

- Fragment-shader-only v1.
- No multipass buffers in v1.
- No texture channels in v1 unless implemented as a later milestone.
- No audio input.
- No network shader includes.

Console should clearly explain unsupported features instead of failing silently.

---

## Camera Model

Implement camera state in Rust core and mirror it in the frontend.

Minimum camera state:

```rust
pub struct CameraState {
    pub position: [f32; 3],
    pub target: [f32; 3],
    pub up: [f32; 3],
    pub fov_y_degrees: f32,
    pub near: f32,
    pub far: f32,
}
```

Navigation controls:

- Orbit around target
- Pan left/right/up/down
- Dolly/zoom toward target
- Reset camera
- Save current camera bookmark
- Restore camera bookmark

Suggested controls:

- Left mouse drag: orbit
- Middle mouse drag or Shift + left mouse drag: pan
- Scroll wheel: dolly/zoom
- `F`: frame/reset to default target
- `B`: bookmark current camera
- Number keys or bookmark list: restore saved bookmarks

The frontend may handle input events, but core camera math should be testable in Rust.

Camera tests:

- Orbit preserves distance to target.
- Pan moves position and target together.
- Dolly changes camera distance without crossing target.
- Reset restores default camera.
- Bookmark serialization/deserialization round trips.
- Invalid camera values are rejected.

---

## Frustum Overlay

The render view should support a camera frustum overlay.

For v1, overlay can be drawn in frontend canvas/SVG over the render area or rendered as a GPU overlay pass. Choose the simpler robust approach first.

Requirements:

- Toggle overlay on/off.
- Show current aspect-ratio frame inside the render view.
- Allow aspect-ratio edit through UI.
- Common presets: 1:1, 4:3, 16:9, 21:9, custom.
- Overlay must update when viewport size or aspect ratio changes.
- Overlay state must save in the scene file.

Tests:

- Aspect-ratio parser accepts valid ratios.
- Aspect-ratio parser rejects invalid values.
- Frustum rectangle calculation fits within viewport.
- Frustum rectangle calculation preserves selected aspect ratio.

---

## UI Layout

Use a dockable/resizable layout.

Candidate approaches:

- CSS Grid with explicit state model for v1.
- A React split-pane library if it is lightweight and stable.
- Avoid overbuilding full docking in v1 unless necessary.

Views:

- Render View
- Shader Editor
- Console
- Status Line
- Toolbar

Required behavior:

- Maximize Render View.
- Maximize Shader Editor.
- Maximize Console.
- Restore layout.
- Save layout with scene.
- Load layout with scene.

State model:

```ts
type ViewId = 'render' | 'editor' | 'console';

type LayoutState = {
  maximizedView: ViewId | null;
  panels: {
    render: { visible: boolean; size: number };
    editor: { visible: boolean; size: number };
    console: { visible: boolean; size: number };
  };
};
```

Frontend tests:

- Maximize sets `maximizedView`.
- Restore clears `maximizedView`.
- Layout serialization round trips.
- Hidden panels are not destroyed if they contain state.

---

## Status Line

Status line should poll or subscribe to backend status events.

Fields:

- CPU usage
- Memory used/available
- GPU adapter name
- GPU backend/API
- Render size
- Aspect ratio
- Last render time
- Shader status: clean, compiling, compiled, error
- Scene state: saved/dirty

Rust crates to evaluate:

- `sysinfo` for CPU/memory
- `wgpu` adapter info for GPU name/backend
- platform-specific fallback where needed

Testing:

- Status structs serialize to frontend format.
- Missing GPU info degrades gracefully.
- CPU/memory sampler does not panic on unsupported platform data.

---

## Logging and Console

Use structured Rust logs and forward important events to the Tauri frontend.

Recommended crates:

- `tracing`
- `tracing-subscriber`
- Tauri event emission for frontend console

Log event shape:

```ts
type ConsoleEvent = {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: 'app' | 'renderer' | 'shader' | 'system' | 'scene';
  message: string;
  details?: string;
  file?: string;
  line?: number;
  column?: number;
};
```

Requirements:

- Shader compile errors must include line/column if available.
- Backend panics should not crash silently.
- Console should display backend initialization details.
- Console should show selected GPU adapter and backend.

---

## Python Helper Scripts

Put scripts in `scripts/`.

All scripts must work on macOS and Windows.

Use Python 3.11+.

Avoid shell-specific assumptions.

Use:

```python
subprocess.run([...], check=True)
pathlib.Path
platform.system()
argparse
```

Do not require bash, zsh, PowerShell, or GNU-only tools.

### `scripts/doctor.py`

Purpose:

Validate local development environment.

Checks:

- Python version
- Rust toolchain installed
- Cargo available
- Node installed
- npm/pnpm available depending on chosen package manager
- Tauri CLI available or install instructions shown
- macOS: Xcode command-line tools likely available
- Windows: Visual Studio Build Tools likely available
- Print GPU/platform hints

Command:

```bash
python scripts/doctor.py
```

### `scripts/build.py`

Purpose:

Build frontend and Rust/Tauri app.

Options:

```bash
python scripts/build.py --debug
python scripts/build.py --release
python scripts/build.py --frontend-only
python scripts/build.py --backend-only
```

### `scripts/launch.py`

Purpose:

Start the app in development mode.

Options:

```bash
python scripts/launch.py
python scripts/launch.py --scene examples/default_scene.shaderforge.json
python scripts/launch.py --gpu-backend auto
python scripts/launch.py --gpu-backend dx12
python scripts/launch.py --gpu-backend vulkan
python scripts/launch.py --gpu-backend metal
```

The script should pass arguments through to the app where practical.

### `scripts/test.py`

Purpose:

Run all tests.

Should run:

- Rust unit tests
- Rust integration tests
- Frontend tests
- Formatting checks if enabled
- Lints if enabled

Options:

```bash
python scripts/test.py
python scripts/test.py --rust-only
python scripts/test.py --frontend-only
python scripts/test.py --lint
```

### `scripts/clean.py`

Purpose:

Clean generated build artifacts.

Options:

```bash
python scripts/clean.py
python scripts/clean.py --deep
```

Deep clean may remove `target/`, frontend build output, and package manager caches if explicitly confirmed.

### `scripts/package.py`

Purpose:

Create platform packages using Tauri.

Options:

```bash
python scripts/package.py --release
```

---

## Unit Test Requirements

Claude must write tests while implementing, not after the fact.

### Rust Tests

Core scene tests:

- Valid scene loads.
- Missing schema version fails.
- Unsupported future schema version fails with useful error.
- Scene save/load round trip preserves shader source.
- Scene save/load round trip preserves layout.
- Scene save/load round trip preserves camera.
- Scene save/load round trip preserves bookmarks.

Camera tests:

- Default camera is valid.
- Reset camera restores default.
- Orbit changes position but preserves distance.
- Pan moves target and position together.
- Dolly changes distance.
- Bookmark restore applies expected camera.

Aspect ratio tests:

- `16:9`, `4:3`, `1:1`, `21:9` parse.
- Custom ratio parses.
- Zero/negative values fail.
- Invalid syntax fails.
- Fit-rectangle calculation preserves ratio.

Shader tests:

- Default shader compiles or validates.
- Syntax error returns structured error.
- Unsupported features return clear error.
- Shader prelude generation is deterministic.
- User source is not mutated unexpectedly.

System status tests:

- Status sampler returns a struct.
- Missing GPU info is handled.
- Serialization to frontend shape works.

### Frontend Tests

Use Vitest or equivalent.

Tests:

- Layout maximize/restore reducer.
- Console event append/filter/clear.
- Scene dirty state updates after editor changes.
- Aspect ratio control validates values.
- Camera bookmark list displays saved bookmarks.
- Tauri command wrappers handle errors.

### Integration Tests

At minimum:

- Load example scene.
- Validate scene.
- Compile default shader.
- Save copy of scene.
- Reopen saved copy and compare important fields.

---

## Development Milestones

### Milestone 0 — Project Skeleton

Deliverables:

- Tauri app boots on macOS and Windows.
- Rust workspace created.
- Frontend layout placeholder created.
- Python scripts added.
- `doctor.py` implemented.
- CI-friendly `test.py` implemented.

Acceptance:

- `python scripts/doctor.py` runs.
- `python scripts/test.py` runs.
- `python scripts/launch.py` starts the app.

### Milestone 1 — Scene Model and Layout State

Deliverables:

- Scene structs in Rust.
- JSON load/save.
- Layout state model.
- Camera state model.
- Unit tests.

Acceptance:

- Example scene loads.
- Scene save/load round trip works.
- Layout maximize/restore works in frontend.

### Milestone 2 — Editor, Console, and Backend Events

Deliverables:

- GLSL editor component.
- Console component.
- Rust logging/event bridge.
- Shader source can be sent to backend.
- Shader validation placeholder exists.

Acceptance:

- Editing shader marks scene dirty.
- Compile action emits console messages.
- Errors are displayed in console.

### Milestone 3 — GPU Renderer Prototype

Deliverables:

- `wgpu` renderer initializes.
- GPU adapter info shown.
- Default shader renders a single frame.
- Render timing is reported.
- Shader compile failures are reported.

Acceptance:

- Default gradient shader renders.
- Syntax error appears in console.
- Status line shows GPU adapter/backend.

### Milestone 4 — Camera Navigation

Deliverables:

- Orbit/pan/dolly camera controls.
- Reset camera.
- Camera bookmarks.
- Camera saved in scene file.

Acceptance:

- User can navigate render view.
- User can save and restore camera bookmarks.
- Reopened scene restores camera state.

### Milestone 5 — Frustum and Aspect Ratio Tools

Deliverables:

- Frustum/aspect overlay.
- Aspect ratio presets.
- Custom aspect ratio input.
- Overlay saved in scene.

Acceptance:

- Overlay accurately fits viewport.
- Aspect ratio can be changed.
- Scene reopens with correct overlay setting.

### Milestone 6 — Cross-Platform Hardening

Deliverables:

- macOS Apple Silicon build verified.
- Windows NVIDIA build verified.
- GPU backend selection tested where available.
- Packaging script implemented.
- README updated.

Acceptance:

- `python scripts/build.py --release` works on both platforms.
- `python scripts/package.py --release` produces installer/app bundle where supported.
- Known limitations are documented.

---

## Claude Implementation Rules

Claude should follow these rules while building:

1. Build incrementally by milestone.
2. Do not skip tests.
3. Keep Rust rendering logic out of React components.
4. Keep frontend state explicit and serializable.
5. Keep scene files versioned.
6. Do not hard-code OS-specific paths.
7. Do not assume Windows shell commands work on macOS or vice versa.
8. Use Python scripts for repeatable build/test/launch flows.
9. Prefer small modules with clear boundaries.
10. Add logging before adding complex rendering behavior.
11. Return structured errors instead of strings where possible.
12. Keep unsafe Rust out of the project unless absolutely necessary.
13. Use references for architecture inspiration only; do not copy licensed code.
14. Document any GPU/backend limitations discovered during implementation.
15. When uncertain, implement the smaller testable version first.

---

## Suggested Rust Data Types

### Scene

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SceneFile {
    pub schema_version: u32,
    pub app_version: String,
    pub scene: Scene,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Scene {
    pub name: String,
    pub shader: ShaderSource,
    pub render_settings: RenderSettings,
    pub camera: CameraState,
    pub camera_bookmarks: Vec<CameraBookmark>,
    pub layout: LayoutState,
}
```

### Shader Source

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ShaderSource {
    pub language: ShaderLanguage,
    pub source: String,
    pub entry_point: String,
    pub compatibility: ShaderCompatibility,
}
```

### Render Settings

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RenderSettings {
    pub mode: RenderMode,
    pub width: u32,
    pub height: u32,
    pub aspect_ratio: AspectRatio,
    pub show_frustum_overlay: bool,
}
```

### Console Event

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ConsoleEvent {
    pub timestamp: String,
    pub level: LogLevel,
    pub source: LogSource,
    pub message: String,
    pub details: Option<String>,
    pub file: Option<String>,
    pub line: Option<u32>,
    pub column: Option<u32>,
}
```

---

## Suggested Frontend Components

### `LayoutRoot.tsx`

Responsible for:

- Main app grid
- View sizing
- View maximization/restoration
- Passing layout state to child views

### `RenderView.tsx`

Responsible for:

- Displaying render output
- Handling camera input gestures
- Showing frustum/aspect overlay
- Sending camera updates to backend or shared state

### `ShaderEditor.tsx`

Responsible for:

- GLSL editing
- Syntax highlighting
- Compile/render command
- Dirty state notification
- Error markers if compiler line/column is available

Use Monaco or CodeMirror. Prefer the simpler integration that works reliably with Tauri.

### `ConsolePanel.tsx`

Responsible for:

- Displaying structured logs
- Filtering by level/source
- Clear button
- Copy selected log/details

### `StatusLine.tsx`

Responsible for:

- Rendering compact system/render status
- Polling or subscribing to backend status
- Showing scene dirty/saved state

### `CameraBookmarks.tsx`

Responsible for:

- Add bookmark
- Rename bookmark
- Restore bookmark
- Delete bookmark

### `AspectRatioControl.tsx`

Responsible for:

- Preset selection
- Custom ratio input
- Validation errors
- Updating render settings

---

## Suggested Tauri Commands

```rust
#[tauri::command]
fn load_scene(path: String) -> Result<SceneFile, AppError>;

#[tauri::command]
fn save_scene(path: String, scene: SceneFile) -> Result<(), AppError>;

#[tauri::command]
fn validate_scene(scene: SceneFile) -> Result<(), AppError>;

#[tauri::command]
fn compile_shader(source: ShaderSource, settings: RenderSettings) -> Result<ShaderCompileResult, AppError>;

#[tauri::command]
fn render_single_frame(scene: SceneFile) -> Result<RenderResult, AppError>;

#[tauri::command]
fn get_system_status() -> Result<SystemStatus, AppError>;

#[tauri::command]
fn get_gpu_info() -> Result<GpuInfo, AppError>;
```

Errors should serialize cleanly to the frontend.

---

## GPU Backend Notes

Claude should expose a backend selection option but default to `auto`.

Possible backend names:

- `auto`
- `metal`
- `dx12`
- `vulkan`

Expected behavior:

- macOS Apple Silicon should default to Metal.
- Windows NVIDIA should default to DX12 or Vulkan depending on `wgpu` behavior and reliability.
- Unsupported backend choices should produce a clear error.
- The selected adapter/backend should appear in the console and status line.

Do not promise CUDA support. NVIDIA GPU support means using the GPU through a graphics API such as DX12 or Vulkan, not CUDA.

---

## README Requirements

Claude should maintain a README with:

- Project overview
- Current milestone status
- Requirements
- macOS setup
- Windows setup
- How to run doctor script
- How to launch dev app
- How to run tests
- How to build release
- How to open/save scenes
- Known limitations
- Architecture overview
- Reference project links

---

## Codex Review Instructions

When handing code to Codex for review, ask Codex to focus on:

- Rust ownership/lifetime mistakes
- Error handling quality
- Test coverage gaps
- Cross-platform assumptions
- Tauri command serialization issues
- GPU initialization edge cases
- Unsafe code avoidance
- Scene migration/versioning problems
- Frontend state bugs
- Build script portability

Codex should not be asked to rewrite the entire project. Use it as a reviewer and targeted patch generator.

Suggested review prompt:

```text
Review this milestone implementation for correctness, test coverage, cross-platform assumptions, and Rust/Tauri architecture issues. Do not rewrite the whole project. Identify specific bugs, risky assumptions, missing tests, and targeted fixes. Pay special attention to scene serialization, shader error handling, camera math, GPU backend selection, and Python build-script portability.
```

---

## Initial Default Shader

Use this as the default user-facing GLSL fragment shader:

```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = fragCoord / iResolution.xy;
    vec3 color = vec3(uv.x, uv.y, 0.35 + 0.25 * sin(iTime));
    fragColor = vec4(color, 1.0);
}
```

For single-frame mode, `iTime` can default to `0.0` unless the app later adds animation.

---

## Initial Example Shader: Raymarch Sphere

```glsl
float sphereSdf(vec3 p, float r)
{
    return length(p) - r;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = (fragCoord * 2.0 - iResolution.xy) / iResolution.y;

    vec3 ro = vec3(0.0, 0.0, 3.0);
    vec3 rd = normalize(vec3(uv, -1.5));

    float t = 0.0;
    float hit = 0.0;

    for (int i = 0; i < 64; i++) {
        vec3 p = ro + rd * t;
        float d = sphereSdf(p, 1.0);
        if (d < 0.001) {
            hit = 1.0;
            break;
        }
        t += d;
        if (t > 20.0) {
            break;
        }
    }

    vec3 color = mix(vec3(0.02, 0.02, 0.04), vec3(0.8, 0.55, 0.25), hit);
    fragColor = vec4(color, 1.0);
}
```

---

## Definition of Done for v1

The project reaches v1 when:

- The app launches on macOS Apple Silicon and Windows.
- The editor can edit GLSL.
- The renderer can render a single frame from a Shadertoy-style fragment shader.
- Compile errors are shown in the console.
- Render view supports camera orbit/pan/dolly/reset.
- Camera bookmarks work.
- Frustum/aspect overlay works.
- Layout panels can be maximized/restored.
- Status line shows CPU, memory, GPU, render size, shader state, and scene state.
- Scene save/load preserves shader, layout, camera, bookmarks, and render settings.
- Python helper scripts exist and are documented.
- Unit tests cover core scene, camera, aspect ratio, shader prelude, system status serialization, and frontend state.
- README documents setup, build, test, launch, and limitations.
