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

export async function invoke<T>(cmd: string, args?: AnyArgs): Promise<T> {
  const fn = await getInvoke();
  if (!fn) {
    throw new Error(
      `Tauri invoke unavailable (cmd=${cmd}); running outside the desktop shell.`,
    );
  }
  return (await fn(cmd, args)) as T;
}
