import { beforeEach, describe, expect, it } from "vitest";
import { useSceneStore, type SceneFile } from "./sceneStore";
import { defaultLayout } from "./layoutStore";

function makeFile(overrides: Partial<SceneFile["scene"]> = {}): SceneFile {
  return {
    schemaVersion: 3,
    appVersion: "0.1.0",
    scene: {
      name: "Test",
      shader: {
        language: "glsl",
        source: "void main(){ outColor = vec4(1.0); }",
        entryPoint: "main",
        compatibility: "raw-fragment-v1",
      },
      renderSettings: {
        mode: "single_frame",
        width: 640,
        height: 360,
        aspectRatio: "16:9",
        showFrustumOverlay: false,
      },
      camera: {
        position: [0, 0, 5],
        target: [0, 0, 0],
        up: [0, 1, 0],
        fovYDegrees: 45,
        near: 0.1,
        far: 1000,
      },
      cameraBookmarks: [],
      layout: defaultLayout(),
      timeline: {
        firstFrame: 0,
        lastFrame: 240,
        currentFrame: 0,
        targetFps: 60,
      },
      object: { position: [0, 0, 0] },
      ...overrides,
    },
  };
}

describe("sceneStore example tracking", () => {
  beforeEach(() => {
    useSceneStore.setState({
      file: null,
      dirty: false,
      path: null,
      loadedExampleId: null,
    });
  });

  it("starts with no loaded example", () => {
    expect(useSceneStore.getState().loadedExampleId).toBeNull();
  });

  it("replaceFromExample records the example id and clears dirty + path", () => {
    useSceneStore.setState({ path: "/scenes/old.luxel.json", dirty: true });
    useSceneStore.getState().replaceFromExample(makeFile(), "gradient-raw");
    const s = useSceneStore.getState();
    expect(s.loadedExampleId).toBe("gradient-raw");
    expect(s.dirty).toBe(false);
    // The example load is fundamentally not "the same file" — clear the
    // path so the next Save prompts the user for a new location.
    expect(s.path).toBeNull();
  });

  it("updateShaderSource clears the loaded example marker", () => {
    useSceneStore.getState().replaceFromExample(makeFile(), "gradient-raw");
    expect(useSceneStore.getState().loadedExampleId).toBe("gradient-raw");
    useSceneStore.getState().updateShaderSource("// edited");
    expect(useSceneStore.getState().loadedExampleId).toBeNull();
    expect(useSceneStore.getState().dirty).toBe(true);
  });

  it("replace (file open) clears the loaded example marker", () => {
    useSceneStore.getState().replaceFromExample(makeFile(), "gradient-raw");
    useSceneStore.getState().replace(makeFile({ name: "Loaded" }));
    expect(useSceneStore.getState().loadedExampleId).toBeNull();
    expect(useSceneStore.getState().dirty).toBe(false);
  });

  it("markSaved clears the loaded example marker", () => {
    useSceneStore.getState().replaceFromExample(makeFile(), "plasma-raw");
    useSceneStore.getState().markSaved("/scenes/saved.luxel.json");
    const s = useSceneStore.getState();
    expect(s.loadedExampleId).toBeNull();
    expect(s.dirty).toBe(false);
    expect(s.path).toBe("/scenes/saved.luxel.json");
  });

  it("setCurrentFrame does not flip dirty or clear example marker", () => {
    // Playback advances currentFrame every tick — those updates must not
    // dirty the scene or clear the example association.
    useSceneStore.getState().replaceFromExample(makeFile(), "plasma-raw");
    useSceneStore.getState().setCurrentFrame(120);
    const s = useSceneStore.getState();
    expect(s.dirty).toBe(false);
    expect(s.loadedExampleId).toBe("plasma-raw");
    expect(s.file?.scene.timeline.currentFrame).toBe(120);
  });

  it("updateShaderCompatibility flips entryPoint to match the new mode", () => {
    useSceneStore.getState().replaceFromExample(makeFile(), "gradient-raw");
    useSceneStore.getState().updateShaderCompatibility("shadertoy-fragment-v1");
    const s = useSceneStore.getState().file!.scene.shader;
    expect(s.compatibility).toBe("shadertoy-fragment-v1");
    expect(s.entryPoint).toBe("mainImage");
  });

  it("setObjectPosition updates the object transform and dirties the scene", () => {
    useSceneStore.getState().replace(makeFile());
    useSceneStore.getState().setObjectPosition([1.5, -2, 3]);
    const s = useSceneStore.getState();
    expect(s.file?.scene.object.position).toEqual([1.5, -2, 3]);
    expect(s.dirty).toBe(true);
  });
});
