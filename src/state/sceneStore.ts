import { create } from "zustand";

export type ViewId = "render" | "editor" | "console" | "empty";

export type LayoutShape =
  | "single"
  | "twoAcross"
  | "twoTopOneBottom"
  | "oneTopTwoBottom"
  | "oneLeftTwoRight"
  | "twoLeftOneRight"
  | "threeAcross";

export interface SlotState {
  view: ViewId;
}

export interface LayoutSizes {
  primary: number;
  secondary: number;
}

export interface LayoutState {
  shape: LayoutShape;
  slots: SlotState[];
  sizes: LayoutSizes;
  /// Index into `slots`. When set, that slot fills the entire main area.
  maximized: number | null;
}

export interface TimelineState {
  firstFrame: number;
  lastFrame: number;
  currentFrame: number;
  targetFps: number;
}

export const SHAPE_SLOT_COUNT: Record<LayoutShape, number> = {
  single: 1,
  twoAcross: 2,
  twoTopOneBottom: 3,
  oneTopTwoBottom: 3,
  oneLeftTwoRight: 3,
  twoLeftOneRight: 3,
  threeAcross: 3,
};

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fovYDegrees: number;
  near: number;
  far: number;
}

export interface CameraBookmark {
  id: string;
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fovYDegrees: number;
}

export interface ShaderSource {
  language: "glsl";
  source: string;
  entryPoint: string;
  compatibility: "shadertoy-fragment-v1";
}

export interface RenderSettings {
  mode: "single_frame";
  width: number;
  height: number;
  aspectRatio: string;
  showFrustumOverlay: boolean;
}

export interface Scene {
  name: string;
  shader: ShaderSource;
  renderSettings: RenderSettings;
  camera: CameraState;
  cameraBookmarks: CameraBookmark[];
  layout: LayoutState;
  timeline: TimelineState;
}

export interface SceneFile {
  schemaVersion: number;
  appVersion: string;
  scene: Scene;
}

interface SceneStore {
  file: SceneFile | null;
  dirty: boolean;
  path: string | null;
  replace: (file: SceneFile) => void;
  updateShaderSource: (source: string) => void;
  updateRenderSettings: (patch: Partial<RenderSettings>) => void;
  setCamera: (camera: CameraState) => void;
  addBookmark: (b: CameraBookmark) => void;
  removeBookmark: (id: string) => void;
  setLayout: (layout: LayoutState) => void;
  setSlotView: (slotIndex: number, view: ViewId) => void;
  setLayoutSizes: (patch: Partial<LayoutSizes>) => void;
  setMaximized: (slotIndex: number | null) => void;
  setTimeline: (patch: Partial<TimelineState>) => void;
  setCurrentFrame: (frame: number) => void;
  markSaved: (path: string) => void;
}

function patchLayout(file: SceneFile, patch: Partial<LayoutState>): SceneFile {
  return {
    ...file,
    scene: { ...file.scene, layout: { ...file.scene.layout, ...patch } },
  };
}

export const useSceneStore = create<SceneStore>((set) => ({
  file: null,
  dirty: false,
  path: null,
  replace: (file) => set({ file, dirty: false }),
  updateShaderSource: (source) =>
    set((s) =>
      s.file
        ? {
            file: {
              ...s.file,
              scene: {
                ...s.file.scene,
                shader: { ...s.file.scene.shader, source },
              },
            },
            dirty: true,
          }
        : s,
    ),
  updateRenderSettings: (patch) =>
    set((s) =>
      s.file
        ? {
            file: {
              ...s.file,
              scene: {
                ...s.file.scene,
                renderSettings: { ...s.file.scene.renderSettings, ...patch },
              },
            },
            dirty: true,
          }
        : s,
    ),
  setCamera: (camera) =>
    set((s) =>
      s.file
        ? {
            file: { ...s.file, scene: { ...s.file.scene, camera } },
            dirty: true,
          }
        : s,
    ),
  addBookmark: (b) =>
    set((s) =>
      s.file
        ? {
            file: {
              ...s.file,
              scene: {
                ...s.file.scene,
                cameraBookmarks: [
                  ...s.file.scene.cameraBookmarks.filter((x) => x.id !== b.id),
                  b,
                ],
              },
            },
            dirty: true,
          }
        : s,
    ),
  removeBookmark: (id) =>
    set((s) =>
      s.file
        ? {
            file: {
              ...s.file,
              scene: {
                ...s.file.scene,
                cameraBookmarks: s.file.scene.cameraBookmarks.filter(
                  (b) => b.id !== id,
                ),
              },
            },
            dirty: true,
          }
        : s,
    ),
  setLayout: (layout) =>
    set((s) =>
      s.file
        ? {
            file: { ...s.file, scene: { ...s.file.scene, layout } },
            dirty: true,
          }
        : s,
    ),
  setSlotView: (slotIndex, view) =>
    set((s) => {
      if (!s.file) return s;
      const slots = s.file.scene.layout.slots.slice();
      if (slotIndex < 0 || slotIndex >= slots.length) return s;
      slots[slotIndex] = { ...slots[slotIndex], view };
      return {
        file: patchLayout(s.file, { slots }),
        dirty: true,
      };
    }),
  setLayoutSizes: (patch) =>
    set((s) =>
      s.file
        ? {
            file: patchLayout(s.file, {
              sizes: { ...s.file.scene.layout.sizes, ...patch },
            }),
            dirty: true,
          }
        : s,
    ),
  setMaximized: (slotIndex) =>
    set((s) =>
      s.file
        ? {
            file: patchLayout(s.file, { maximized: slotIndex }),
            dirty: true,
          }
        : s,
    ),
  setTimeline: (patch) =>
    set((s) =>
      s.file
        ? {
            file: {
              ...s.file,
              scene: {
                ...s.file.scene,
                timeline: { ...s.file.scene.timeline, ...patch },
              },
            },
            dirty: true,
          }
        : s,
    ),
  setCurrentFrame: (frame) =>
    set((s) => {
      if (!s.file) return s;
      const t = s.file.scene.timeline;
      const clamped = Math.max(t.firstFrame, Math.min(t.lastFrame, Math.round(frame)));
      // Don't dirty the file for currentFrame motion during playback — it
      // would otherwise mark every saved scene as modified after a single
      // tick of the play loop. Only scrubs/edits originating from user
      // interaction should set dirty.
      return {
        file: {
          ...s.file,
          scene: {
            ...s.file.scene,
            timeline: { ...t, currentFrame: clamped },
          },
        },
      };
    }),
  markSaved: (path) => set({ dirty: false, path }),
}));
