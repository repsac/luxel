//! Luxel render engine: wgpu-based single-frame GLSL renderer.

pub mod errors;
pub mod eval;
pub mod frame;
pub mod gpu;
pub mod overlay;
pub mod pipeline;
pub mod renderer;
pub mod shader;
pub mod shader_prelude;

pub use errors::{RenderError, ShaderCompileError, ShaderDiagnostic};
pub use eval::{EvalInputs, EvalResult};
pub use frame::{RenderResult, RenderTiming};
pub use gpu::{select_backend, GpuBackend};
pub use renderer::{FrameInputs, Renderer};
pub use shader::{compile_full_fragment, compile_glsl_fragment, ShaderCompileResult};
