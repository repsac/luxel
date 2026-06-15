// Scene save action, shared by the toolbar Save button, Cmd/Ctrl+S, and the
// unsaved-changes close guard.

import { useSceneStore } from "../state/sceneStore";
import { useConsoleStore } from "../state/consoleStore";
import { formatError, invoke } from "../tauri/commands";

/// Save the current scene to disk. Writes back to the open file when there is
/// one; otherwise (or when `forceSaveAs` is set, e.g. Shift+Save) prompts for
/// a destination. Returns true if the scene was written, false if the user
/// cancelled the Save-As dialog or the write failed — callers (e.g. the close
/// guard) use this to decide whether it's safe to proceed.
export async function saveCurrentScene(forceSaveAs = false): Promise<boolean> {
  const current = useSceneStore.getState().file;
  if (!current) return false;
  const append = useConsoleStore.getState().append;
  try {
    let savePath = forceSaveAs ? null : useSceneStore.getState().path;
    if (!savePath) {
      const dialogMod = await import("@tauri-apps/plugin-dialog");
      const chosen = await dialogMod.save({
        filters: [{ name: "Luxel Scene", extensions: ["luxel.json", "json"] }],
      });
      if (!chosen) return false;
      savePath = chosen as string;
    }
    await invoke("save_scene", { path: savePath, scene: current });
    useSceneStore.getState().markSaved(savePath);
    return true;
  } catch (e) {
    append({
      timestamp: new Date().toISOString(),
      level: "error",
      source: "scene",
      message: `save failed: ${formatError(e)}`,
    });
    return false;
  }
}
