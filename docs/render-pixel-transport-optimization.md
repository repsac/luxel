# Render Pixel Transport Optimization

## Goal

Replace the current render-frame transport path:

1. Rust reads GPU pixels into a `Vec<u8>`.
2. Rust base64-encodes the entire RGBA buffer.
3. Tauri serializes that base64 string into the frontend.
4. React synchronously calls `atob(...)`.
5. React copies the decoded bytes into `ImageData`.
6. Canvas receives the pixels with `putImageData(...)`.

This works, but it is expensive for interactive rendering. At 2048x2048, a single RGBA frame is 16 MiB before base64. Base64 increases payload size by roughly 33%, and the frontend then performs another large synchronous decode and copy on the UI thread.

The fix should reduce large string allocation, serialization overhead, and main-thread decode work while preserving the existing renderer behavior.

## Current Hot Path

Relevant files:

- `crates/luxel-render/src/renderer.rs`
  - `Renderer::render_single_frame_with(...)` reads back RGBA8 pixels.
  - `base64_encode(...)` encodes the full pixel buffer.
  - `RenderResult` receives `pixels_base64`.
- `crates/luxel-render/src/frame.rs`
  - Defines the render result payload shape.
- `src-tauri/src/commands.rs`
  - Tauri command `render_single_frame(...)` returns `luxel_render::RenderResult`.
- `src/actions/render.ts`
  - `RenderResultPayload` mirrors the Tauri result.
  - `renderScene(...)` stores `pixelsBase64` into app state.
- `src/state/appStore.ts`
  - `LastRender` stores the base64 pixel string.
- `src/components/RenderView.tsx`
  - Decodes `lastRender.pixelsBase64` with `atob`.
  - Converts decoded text to `Uint8ClampedArray`.
  - Calls `putImageData(...)`.

The backend already caches the render target and readback buffer in `Renderer::ensure_targets(...)`, so do not spend effort there first. The remaining avoidable cost is mostly transport/encoding/decoding.

## Recommended Fix

Prefer moving rendered frames over a binary or file-backed path instead of JSON/base64.

Use this order of preference:

1. Return binary bytes from the Tauri command if the current Tauri setup can serialize byte arrays without converting them into large JS strings.
2. If binary return still expands into slow JSON arrays, write each rendered frame to an app-local temporary file or custom protocol URL and let the frontend display it through an object URL or image source.
3. Only if both are impractical, keep base64 but move decoding off the UI thread with a Web Worker. This is a fallback, not the ideal fix, because payload size remains inflated.

The best final shape is:

- Rust returns `width`, `height`, `pixelBytes`, timing, and a binary frame payload or URL/handle.
- The frontend does not call `atob` for normal preview rendering.
- The frontend avoids storing large base64 strings in Zustand.

## Option A: Binary Tauri Payload

Use this if Tauri v2 in this project can return `Vec<u8>` as an efficient binary value to JS.

Implementation outline:

1. Change `crates/luxel-render/src/frame.rs`.
   - Replace or supplement `pixels_base64: String` with `pixels: Vec<u8>`.
   - Keep `pixel_bytes`, `width`, `height`, and `timing`.
   - Consider creating a separate result type if tests or export code still need base64 temporarily.

2. Change `crates/luxel-render/src/renderer.rs`.
   - Stop calling `base64_encode(&pixels)` in the main render path.
   - Return the raw `pixels` vector.
   - Delete `base64_encode(...)` and its tests if no longer used.

3. Change `src/actions/render.ts`.
   - Update `RenderResultPayload`.
   - Expect either `number[]`, `ArrayBuffer`, or `Uint8Array`, depending on how Tauri exposes `Vec<u8>`.
   - Normalize the payload once:

   ```ts
   function toClampedPixels(value: unknown): Uint8ClampedArray {
     if (value instanceof Uint8Array) return new Uint8ClampedArray(value.buffer);
     if (value instanceof ArrayBuffer) return new Uint8ClampedArray(value);
     if (Array.isArray(value)) return new Uint8ClampedArray(value);
     throw new Error("renderer returned an unsupported pixel payload");
   }
   ```

   - Do not store raw `number[]` in app state. Convert it before storing or store a stable typed-array-backed object.

4. Change `src/state/appStore.ts`.
   - Replace `pixelsBase64: string` with `pixels: Uint8ClampedArray` or another binary-friendly representation.
   - Keep `width`, `height`, and `totalMs`.

5. Change `src/components/RenderView.tsx`.
   - Remove `atob(...)`.
   - Validate `lastRender.pixels.length === width * height * 4`.
   - Call `ctx.putImageData(new ImageData(lastRender.pixels, width, height), 0, 0)`.

Important caution:

- If Tauri exposes `Vec<u8>` as a giant JSON `number[]`, this may remove base64 but still be slow and memory-heavy. Benchmark before accepting this as the final solution.

## Option B: File-Backed Frame Handle

Use this if binary command payloads are still serialized inefficiently.

Implementation outline:

1. Add an encoder or raw frame writer on the Rust side.
   - For preview frames, prefer a format the browser can display directly.
   - PNG reduces payload size but adds CPU encode cost.
   - Raw RGBA files avoid PNG encode cost but still require frontend decode/custom loading.
   - For a canvas-first app, a binary blob returned through a custom protocol is usually better than a filesystem path string.

2. Make the Tauri command return metadata plus a frame URL or handle:

   ```ts
   interface RenderResultPayload {
     width: number;
     height: number;
     pixelBytes: number;
     frameUrl: string;
     timing: { totalMs: number; gpuMs: number };
   }
   ```

3. In the frontend, fetch the URL as a `Blob` or `ArrayBuffer`.
   - Use `createImageBitmap(blob)` for image formats.
   - Draw with `ctx.drawImage(bitmap, 0, 0)`.
   - Revoke object URLs or delete temp files when superseded.

4. Add cleanup.
   - Keep only the newest preview frame.
   - Delete old temp files from Rust or expose a cleanup command.
   - Make stale render cancellation cooperate with cleanup.

Tradeoff:

- This can be faster across the Tauri boundary, but PNG encoding can dominate small/medium frames. Benchmark preview sizes before committing to PNG as the default.

## Option C: Worker Decode Fallback

Use this only if the Tauri boundary cannot reasonably avoid base64 yet.

Implementation outline:

1. Add a dedicated Web Worker for base64 decode and `ImageData` creation.
2. `renderScene(...)` stores only render metadata and dispatches the base64 payload to the worker.
3. The worker returns an `ImageBitmap` or transferable `ArrayBuffer`.
4. `RenderView.tsx` draws the decoded result without doing `atob(...)` on the main thread.

This improves responsiveness, but it does not reduce base64 payload size or Rust-side encoding cost.

## Preserve Existing Behavior

The implementation must preserve:

- `width` and `height` matching the effective preview render size.
- `pixelBytes === width * height * 4`.
- Existing shader compile diagnostics.
- Existing stale-render protection in `src/hooks/useRenderDriver.ts` and `src/actions/render.ts`.
- PNG export behavior through `exportCanvasAsPng(...)`.
- Render tests that verify non-empty and non-uniform output.

Do not rewrite camera controls, shader compilation, target caching, or layout code as part of this change.

## Tests To Update Or Add

Rust:

- Update `crates/luxel-render/tests/e2e_render.rs`.
  - Decode is no longer needed if raw pixels are returned.
  - Keep assertions for byte count, dimensions, default gradient variance, and raymarch center brightness.
- Update any unit tests in `crates/luxel-render/src/renderer.rs` if `base64_encode(...)` is removed.
- Run `cargo test -q`.

TypeScript:

- Update `src/actions/render.ts` payload typing.
- Add a small test for payload normalization if a helper is introduced.
- Run `npm test -- --run`.
- Run `npm run build`.

Manual performance check:

- Render at 512x512, 1024x1024, and 2048x2048 preview sizes.
- Confirm UI stays responsive while orbiting the camera.
- Check that stale renders do not flash older frames after rapid shader edits or camera movement.
- Compare total render/update time before and after using browser performance tools or simple timing logs.

## Acceptance Criteria

The change is complete when:

- Normal preview rendering no longer uses `pixelsBase64` or `atob(...)`.
- Large rendered frames are not stored as strings in Zustand.
- Existing render tests pass with the new payload shape.
- `npm test -- --run`, `npm run build`, and `cargo test -q` pass.
- The code keeps the render API clear: metadata is separate from the frame payload.
- Any temporary frame resources are cleaned up deterministically.

## Suggested First Implementation Path

Start with Option A and benchmark it.

If Tauri returns `Vec<u8>` to JS as an efficient typed array or `ArrayBuffer`, keep Option A. It is the smallest, cleanest change.

If Tauri returns a huge `number[]` and performance is still poor, stop and switch to Option B instead of adding more copies around the array representation.
