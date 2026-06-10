import { useEffect } from "react";
import LayoutRoot from "./components/LayoutRoot";
import { subscribeConsole } from "./tauri/events";
import { invoke } from "./tauri/commands";
import { useSceneStore } from "./state/sceneStore";
import { useConsoleStore } from "./state/consoleStore";
import { useRenderDriver } from "./hooks/useRenderDriver";

export default function App() {
  const setScene = useSceneStore((s) => s.replace);
  const append = useConsoleStore((s) => s.append);

  useEffect(() => {
    let unsub: undefined | (() => void);
    (async () => {
      try {
        let loaded: unknown = null;
        try {
          const initial = (await invoke("initial_scene_path")) as string | null;
          if (initial) {
            loaded = await invoke("load_scene", { path: initial });
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
            message: `initial scene load failed, falling back to default: ${String(e)}`,
          });
        }
        if (!loaded) {
          loaded = await invoke("default_scene");
        }
        if (loaded) setScene(loaded as never);
      } catch (e) {
        append({
          timestamp: new Date().toISOString(),
          level: "error",
          source: "app",
          message: `failed to load default scene: ${String(e)}`,
        });
      }
      unsub = await subscribeConsole((event) => append(event));
    })();
    return () => {
      if (unsub) unsub();
    };
  }, [setScene, append]);

  // Drive continuous rendering — replaces the old 60ms debounced auto-render.
  useRenderDriver();

  return <LayoutRoot />;
}
