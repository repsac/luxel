use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct RenderTiming {
    /// Total wall-clock ms from compile+upload through readback.
    pub total_ms: u32,
    /// GPU submit+render ms (best-effort; falls back to wall-clock on no timestamp).
    pub gpu_ms: u32,
}

/// A single rendered frame.
///
/// `pixels` is the raw RGBA8 byte buffer, row-major, top-to-bottom. We
/// deliberately keep it as a `Vec<u8>` here — never base64-encoded — so the
/// renderer can stay agnostic to its transport. The Tauri command handler
/// wraps these bytes in a binary IPC response so the frontend gets them as an
/// `ArrayBuffer` without a string-encode/decode roundtrip on the hot path.
///
/// `Serialize`/`Deserialize` are intentionally not derived: a JSON encoding
/// of `Vec<u8>` becomes a giant array of numbers, which is exactly the path
/// we're trying to avoid. Anyone serializing a frame today should be reaching
/// for the binary IPC path in `src-tauri/src/commands.rs`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderResult {
    pub width: u32,
    pub height: u32,
    /// RGBA8 pixels, row-major, top-to-bottom. `len() == width * height * 4`.
    pub pixels: Vec<u8>,
    pub timing: RenderTiming,
}

impl RenderResult {
    /// Convenience accessor matching the older `pixel_bytes` field — equal to
    /// `pixels.len()`, kept so tests and downstream code don't have to inline
    /// the same trivial expression.
    pub fn pixel_bytes(&self) -> usize {
        self.pixels.len()
    }
}
