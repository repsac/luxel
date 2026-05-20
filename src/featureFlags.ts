/// Build-time feature flags for in-progress / experimental features.
///
/// These gate *entry points* (buttons, menu items) while leaving the full
/// implementation in the tree, so a feature can be parked without bit-rot and
/// re-exposed by flipping a single boolean.

/// Move-gizmo POC. The implementation is fully wired and tested
/// (`gizmoMath.ts`, the `iObjectPosition` uniform, RenderView drag handling,
/// the "Gizmo demo (glass)" examples). This flag only controls whether the
/// "Move" button and the gizmo demo examples are visible. Flip to `true` to
/// resume work on it.
///
/// Typed as `boolean` (not the literal `false`) so the `&&` guards that
/// reference it aren't treated as dead branches by TypeScript's unused checks.
export const GIZMO_POC_ENABLED: boolean = false;
