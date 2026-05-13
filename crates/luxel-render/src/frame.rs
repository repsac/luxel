use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct RenderTiming {
    /// Total wall-clock ms from compile+upload through readback.
    pub total_ms: u32,
    /// GPU submit+render ms (best-effort; falls back to wall-clock on no timestamp).
    pub gpu_ms: u32,
}

/// A single rendered frame returned to the frontend as RGBA8 base64-encoded bytes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RenderResult {
    pub width: u32,
    pub height: u32,
    /// Length of pixel data in bytes (4 * width * height for RGBA8).
    #[serde(rename = "pixelBytes")]
    pub pixel_bytes: usize,
    /// Base64-encoded RGBA8 pixels, row-major, top-to-bottom.
    #[serde(rename = "pixelsBase64")]
    pub pixels_base64: String,
    pub timing: RenderTiming,
}
