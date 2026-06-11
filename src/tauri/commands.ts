// Thin wrapper over @tauri-apps/api/core.invoke so the UI can run in a
// browser dev environment by falling back to no-op stubs when Tauri isn't
// present.

type AnyArgs = Record<string, unknown> | undefined;

let cachedInvoke:
  | ((cmd: string, args?: AnyArgs) => Promise<unknown>)
  | null
  | undefined;

async function getInvoke() {
  if (cachedInvoke !== undefined) return cachedInvoke;
  try {
    const mod = await import("@tauri-apps/api/core");
    cachedInvoke = mod.invoke;
  } catch {
    cachedInvoke = null;
  }
  return cachedInvoke;
}

/// Normalize an invoke() rejection for display. The Rust side's AppError
/// serializes as a tagged object ({ kind, message }), which `String(e)`
/// would render as "[object Object]".
export function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const o = e as { kind?: unknown; message?: unknown };
    if (typeof o.message === "string") {
      return typeof o.kind === "string" ? `${o.kind}: ${o.message}` : o.message;
    }
    return JSON.stringify(e);
  }
  return String(e);
}

export async function invoke<T>(cmd: string, args?: AnyArgs): Promise<T> {
  const fn = await getInvoke();
  if (!fn) {
    throw new Error(
      `Tauri invoke unavailable (cmd=${cmd}); running outside the desktop shell.`,
    );
  }
  return (await fn(cmd, args)) as T;
}
