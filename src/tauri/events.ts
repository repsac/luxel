import type { ConsoleEvent } from "../state/consoleStore";
import { useAppStore } from "../state/appStore";

export async function subscribeConsole(
  handler: (event: ConsoleEvent) => void,
): Promise<() => void> {
  try {
    const mod = await import("@tauri-apps/api/event");
    const unlisten = await mod.listen<ConsoleEvent>(
      "luxel://console",
      (event) => {
        handler(event.payload);
        promoteShaderDiagnostic(event.payload);
      },
    );
    return unlisten;
  } catch {
    return () => {};
  }
}

/// Mirror shader-source error events into the appStore's diagnostics list so
/// the editor can render gutters/markers without duplicating event plumbing.
function promoteShaderDiagnostic(event: ConsoleEvent) {
  if (event.source !== "shader" || event.level !== "error") return;
  const state = useAppStore.getState();
  const next = [
    ...state.shaderDiagnostics,
    {
      message: event.message,
      line: event.line ?? null,
      column: event.column ?? null,
    },
  ].slice(-32);
  state.setShaderDiagnostics(next);
}
