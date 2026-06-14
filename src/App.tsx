import { useEffect } from "react";
import LayoutRoot from "./components/LayoutRoot";
import { subscribeConsole } from "./tauri/events";
import { formatError, invoke } from "./tauri/commands";
import { useSceneStore, type SceneFile } from "./state/sceneStore";
import { useConsoleStore } from "./state/consoleStore";
import { withDefaultLayout } from "./state/layoutStore";
import { useRenderDriver } from "./hooks/useRenderDriver";
import CloseGuard from "./components/CloseGuard";

export default function App() {
  const setScene = useSceneStore((s) => s.replace);
  const append = useConsoleStore((s) => s.append);

  useEffect(() => {
    let unsub: undefined | (() => void);
    let cancelled = false;
    (async () => {
      // Subscribe before loading the scene: the load_scene command emits
      // console events during the invoke, which would otherwise fire before
      // any listener exists and be lost.
      unsub = await subscribeConsole((event) => append(event));
      if (cancelled) {
        // Cleanup ran while we were awaiting (StrictMode mount/unmount/
        // remount does this) — release immediately or the listener leaks.
        unsub();
        return;
      }
      try {
        let loaded: unknown = null;
        // An explicitly opened scene file carries its own layout, so we only
        // apply the user's pinned default layout to the fresh default scene.
        let fromExplicitFile = false;
        let loadedPath: string | null = null;
        try {
          const initial = (await invoke("initial_scene_path")) as string | null;
          if (initial) {
            loaded = await invoke("load_scene", { path: initial });
            fromExplicitFile = true;
            loadedPath = initial;
            append({
              timestamp: new Date().toISOString(),
              level: "info",
              source: "app",
              message: `loaded initial scene from LUXEL_INITIAL_SCENE: ${initial}`,
            });
          }
        } catch (e) {
          append({
            timestamp: new Date().toISOString(),
            level: "warn",
            source: "app",
            message: `initial scene load failed, falling back to default: ${formatError(e)}`,
          });
        }
        if (!loaded) {
          loaded = await invoke("default_scene");
        }
        if (!cancelled && loaded) {
          const file = fromExplicitFile
            ? (loaded as SceneFile)
            : withDefaultLayout(loaded as SceneFile);
          setScene(file, loadedPath);
        }
      } catch (e) {
        append({
          timestamp: new Date().toISOString(),
          level: "error",
          source: "app",
          message: `failed to load default scene: ${formatError(e)}`,
        });
      }
    })();
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [setScene, append]);

  // Drive continuous rendering — replaces the old 60ms debounced auto-render.
  useRenderDriver();

  return (
    <>
      <LayoutRoot />
      <CloseGuard />
    </>
  );
}
