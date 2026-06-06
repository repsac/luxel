//! Offscreen single-frame renderer.
//!
//! Maintains a long-lived wgpu device/queue and renders into an RGBA8 texture
//! that is read back to host memory so the frontend can display it as an image.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;
use std::time::Instant;

use bytemuck::{Pod, Zeroable};
use luxel_core::{Scene, ShaderSource};
use luxel_system::GpuInfo;
use wgpu::util::DeviceExt;

use crate::errors::RenderError;
use crate::frame::{RenderResult, RenderTiming};
use crate::gpu::{select_backend, GpuBackend};
use crate::pipeline::FULLSCREEN_VS_WGSL;
use crate::shader::compile_glsl_fragment;

/// Per-frame inputs that map to the GLSL prelude uniforms.
#[derive(Debug, Clone, Copy)]
pub struct FrameInputs {
    pub time: f32,
    pub frame: i32,
    pub mouse: [f32; 4],
}

impl Default for FrameInputs {
    fn default() -> Self {
        Self {
            time: 0.0,
            frame: 0,
            mouse: [0.0; 4],
        }
    }
}

struct CachedPipeline {
    pipeline: wgpu::RenderPipeline,
    bgl: wgpu::BindGroupLayout,
}

/// Render-target + readback buffer pair, keyed by (width, height). Reusing
/// these between frames avoids two allocations and one big buffer mapping per
/// render, which dominates per-frame cost during camera navigation.
struct CachedTargets {
    width: u32,
    height: u32,
    target: wgpu::Texture,
    target_view: wgpu::TextureView,
    readback: wgpu::Buffer,
    padded_bpr: u32,
}

/// std140-layout uniform block matching the prelude. Layout:
///
/// ```text
///   0:  vec3 iResolution
///  12:  float iTime          (fits in vec3 padding)
///  16:  int  iFrame
///  20:  pad x3
///  32:  vec4 iMouse
///  48:  vec3 iCameraPosition
///  60:  float iCameraFov     (fits in vec3 padding)
///  64:  vec3 iCameraForward
///  76:  pad
///  80:  vec3 iCameraRight
///  92:  pad
///  96:  vec3 iCameraUp
/// 108:  pad
/// 112:  vec3 iObjectPosition
/// 124:  pad
/// 128: end
/// ```
#[repr(C)]
#[derive(Copy, Clone, Debug, Pod, Zeroable)]
struct ShaderUniforms {
    i_resolution: [f32; 3],
    i_time: f32,
    i_frame: i32,
    _pad0: [i32; 3],
    i_mouse: [f32; 4],
    i_camera_position: [f32; 3],
    i_camera_fov: f32,
    i_camera_forward: [f32; 3],
    _pad1: f32,
    i_camera_right: [f32; 3],
    _pad2: f32,
    i_camera_up: [f32; 3],
    _pad3: f32,
    i_object_position: [f32; 3],
    _pad4: f32,
}

const COPY_ROW_ALIGN: u32 = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;

pub struct Renderer {
    device: wgpu::Device,
    queue: wgpu::Queue,
    gpu_info: GpuInfo,
    /// Cache keyed by hash(wrapped GLSL source) → compiled WGSL + pipeline.
    /// Lets back-to-back renders with the same shader skip naga + pipeline build.
    pipeline_cache: Mutex<Option<(u64, CachedPipeline)>>,
    targets_cache: Mutex<Option<CachedTargets>>,
}

impl Renderer {
    /// Create a renderer. Falls back to the platform-default backend.
    pub fn new(backend: GpuBackend) -> Result<Self, RenderError> {
        pollster::block_on(Self::new_async(backend))
    }

    pub async fn new_async(backend: GpuBackend) -> Result<Self, RenderError> {
        let backends = select_backend(backend);
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends,
            ..Default::default()
        });
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                force_fallback_adapter: false,
                compatible_surface: None,
            })
            .await
            .ok_or(RenderError::NoAdapter)?;
        let info = adapter.get_info();
        let gpu_info = GpuInfo {
            name: Some(info.name.clone()),
            vendor: Some(format!("0x{:04x}", info.vendor)),
            backend: Some(format!("{:?}", info.backend)),
            device_type: Some(format!("{:?}", info.device_type)),
            driver: Some(info.driver.clone()),
        };
        let limits = wgpu::Limits::downlevel_defaults().using_resolution(adapter.limits());
        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: Some("luxel-device"),
                    required_features: wgpu::Features::empty(),
                    required_limits: limits,
                    memory_hints: wgpu::MemoryHints::Performance,
                },
                None,
            )
            .await
            .map_err(|e| RenderError::RequestDevice(e.to_string()))?;
        Ok(Self {
            device,
            queue,
            gpu_info,
            pipeline_cache: Mutex::new(None),
            targets_cache: Mutex::new(None),
        })
    }

    pub fn gpu_info(&self) -> &GpuInfo {
        &self.gpu_info
    }

    /// Render a single frame for the given scene and return RGBA8 pixels (base64-encoded).
    pub fn render_single_frame(&self, scene: &Scene) -> Result<RenderResult, RenderError> {
        self.render_single_frame_with(scene, FrameInputs::default())
    }

    /// Like [`render_single_frame`], but lets the caller override `iTime` and `iFrame`.
    pub fn render_single_frame_with(
        &self,
        scene: &Scene,
        inputs: FrameInputs,
    ) -> Result<RenderResult, RenderError> {
        let start = Instant::now();

        let width = scene.render_settings.width.max(1);
        let height = scene.render_settings.height.max(1);
        let gpu_start = Instant::now();

        let cache_key = shader_key(&scene.shader);
        self.ensure_pipeline(cache_key, &scene.shader)?;

        let basis = CameraBasis::from(&scene.camera);
        let u = ShaderUniforms {
            i_resolution: [width as f32, height as f32, 1.0],
            i_time: inputs.time,
            i_frame: inputs.frame,
            _pad0: [0; 3],
            i_mouse: inputs.mouse,
            i_camera_position: scene.camera.position,
            i_camera_fov: scene.camera.fov_y_degrees.to_radians(),
            i_camera_forward: basis.forward,
            _pad1: 0.0,
            i_camera_right: basis.right,
            _pad2: 0.0,
            i_camera_up: basis.up,
            _pad3: 0.0,
            i_object_position: scene.object.position,
            _pad4: 0.0,
        };
        let ubuf = self
            .device
            .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("luxel-uniforms"),
                contents: bytemuck::bytes_of(&u),
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            });

        let format = wgpu::TextureFormat::Rgba8UnormSrgb;
        let cache_guard = self.pipeline_cache.lock().expect("pipeline cache poisoned");
        let entry = cache_guard
            .as_ref()
            .expect("pipeline must be initialized by ensure_pipeline");
        let pipeline = &entry.1.pipeline;
        let bgl = &entry.1.bgl;
        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("luxel-bg"),
            layout: bgl,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: ubuf.as_entire_binding(),
            }],
        });

        self.ensure_targets(width, height, format);
        let targets_guard = self.targets_cache.lock().expect("targets cache poisoned");
        let targets = targets_guard
            .as_ref()
            .expect("targets must be initialized by ensure_targets");
        let target = &targets.target;
        let target_view = &targets.target_view;
        let readback = &targets.readback;
        let unpadded_bpr = 4 * width;
        let padded_bpr = targets.padded_bpr;

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("luxel-encoder"),
            });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("luxel-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: target_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.draw(0..3, 0..1);
        }
        encoder.copy_texture_to_buffer(
            wgpu::ImageCopyTexture {
                texture: target,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::ImageCopyBuffer {
                buffer: readback,
                layout: wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_bpr),
                    rows_per_image: Some(height),
                },
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
        self.queue.submit(Some(encoder.finish()));

        let slice = readback.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read, move |r| {
            let _ = tx.send(r);
        });
        let _ = self.device.poll(wgpu::Maintain::Wait);
        rx.recv()
            .map_err(|e| RenderError::Readback(e.to_string()))?
            .map_err(|e| RenderError::Readback(format!("{e:?}")))?;
        let data = slice.get_mapped_range();
        let mut pixels = Vec::with_capacity((unpadded_bpr as usize) * (height as usize));
        // Read rows in reverse so gl_FragCoord follows OpenGL convention:
        // Y = 0 at the bottom of the screen, increasing upward.
        for row in (0..height).rev() {
            let start = (row * padded_bpr) as usize;
            let end = start + unpadded_bpr as usize;
            pixels.extend_from_slice(&data[start..end]);
        }
        drop(data);
        readback.unmap();

        let gpu_ms = gpu_start.elapsed().as_millis().min(u32::MAX as u128) as u32;
        let total_ms = start.elapsed().as_millis().min(u32::MAX as u128) as u32;

        Ok(RenderResult {
            width,
            height,
            pixels,
            timing: RenderTiming { total_ms, gpu_ms },
        })
    }

    /// Build or reuse the cached render target + readback buffer for this size.
    fn ensure_targets(&self, width: u32, height: u32, format: wgpu::TextureFormat) {
        let mut guard = self.targets_cache.lock().expect("targets cache poisoned");
        if let Some(t) = guard.as_ref() {
            if t.width == width && t.height == height {
                return;
            }
        }
        let target = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("luxel-target"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let target_view = target.create_view(&Default::default());
        let unpadded_bpr = 4 * width;
        let padded_bpr = align_up(unpadded_bpr, COPY_ROW_ALIGN);
        let readback_size = (padded_bpr as u64) * (height as u64);
        let readback = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("luxel-readback"),
            size: readback_size,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });
        *guard = Some(CachedTargets {
            width,
            height,
            target,
            target_view,
            readback,
            padded_bpr,
        });
    }

    /// Build or reuse the cached pipeline for this shader source.
    fn ensure_pipeline(&self, key: u64, src: &ShaderSource) -> Result<(), RenderError> {
        let mut guard = self.pipeline_cache.lock().expect("pipeline cache poisoned");
        if guard.as_ref().map(|(k, _)| *k) == Some(key) {
            return Ok(());
        }
        let res = compile_glsl_fragment(src)?;
        let wgsl = res.wgsl.ok_or_else(|| {
            RenderError::ShaderCompile(crate::errors::ShaderCompileError {
                diagnostics: vec![crate::errors::ShaderDiagnostic {
                    message: "shader compiler produced no output".to_string(),
                    line: None,
                    column: None,
                }],
            })
        })?;
        let vs_module = self
            .device
            .create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("luxel-vs"),
                source: wgpu::ShaderSource::Wgsl(FULLSCREEN_VS_WGSL.into()),
            });
        let fs_module = self
            .device
            .create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("luxel-fs"),
                source: wgpu::ShaderSource::Wgsl(wgsl.into()),
            });
        let bgl = self
            .device
            .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("luxel-bgl"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                }],
            });
        let pipeline_layout =
            self.device
                .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                    label: Some("luxel-pl"),
                    bind_group_layouts: &[&bgl],
                    push_constant_ranges: &[],
                });
        let format = wgpu::TextureFormat::Rgba8UnormSrgb;
        let pipeline = self
            .device
            .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                label: Some("luxel-pipeline"),
                layout: Some(&pipeline_layout),
                vertex: wgpu::VertexState {
                    module: &vs_module,
                    entry_point: "vs_main",
                    compilation_options: Default::default(),
                    buffers: &[],
                },
                fragment: Some(wgpu::FragmentState {
                    module: &fs_module,
                    entry_point: "main",
                    compilation_options: Default::default(),
                    targets: &[Some(wgpu::ColorTargetState {
                        format,
                        blend: None,
                        write_mask: wgpu::ColorWrites::ALL,
                    })],
                }),
                primitive: wgpu::PrimitiveState {
                    topology: wgpu::PrimitiveTopology::TriangleList,
                    ..Default::default()
                },
                depth_stencil: None,
                multisample: wgpu::MultisampleState::default(),
                multiview: None,
                cache: None,
            });
        *guard = Some((key, CachedPipeline { pipeline, bgl }));
        Ok(())
    }
}

/// Right-handed orthonormal basis derived from a camera's position/target/up.
struct CameraBasis {
    forward: [f32; 3],
    right: [f32; 3],
    up: [f32; 3],
}

impl CameraBasis {
    fn from(cam: &luxel_core::CameraState) -> Self {
        let f = normalize(sub(cam.target, cam.position));
        let up_in = normalize(cam.up);
        let mut r = normalize(cross(f, up_in));
        // If target-position is parallel to up_in, pick an arbitrary right axis
        // so the camera doesn't collapse — this matches what GLSL raymarchers
        // do defensively.
        if (r[0].abs() + r[1].abs() + r[2].abs()) < 1.0e-5 {
            r = [1.0, 0.0, 0.0];
        }
        let u = cross(r, f);
        Self {
            forward: f,
            right: r,
            up: u,
        }
    }
}

fn sub(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn normalize(v: [f32; 3]) -> [f32; 3] {
    let l = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    if l < 1.0e-12 {
        [0.0, 0.0, 0.0]
    } else {
        [v[0] / l, v[1] / l, v[2] / l]
    }
}
fn cross(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn shader_key(src: &ShaderSource) -> u64 {
    let mut h = DefaultHasher::new();
    (src.language as u32).hash(&mut h);
    (src.compatibility as u32).hash(&mut h);
    src.source.hash(&mut h);
    src.entry_point.hash(&mut h);
    h.finish()
}

fn align_up(value: u32, align: u32) -> u32 {
    (value + align - 1) / align * align
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn align_up_works() {
        assert_eq!(align_up(0, 256), 0);
        assert_eq!(align_up(1, 256), 256);
        assert_eq!(align_up(256, 256), 256);
        assert_eq!(align_up(257, 256), 512);
    }
}
