/// Build-info constants. Actual values are substituted at build time by Vite's
/// `define` (see vite.config.ts / vitest.config.ts) — at runtime they're plain
/// string/boolean literals after the bundler is done.

export const APP_VERSION: string = __APP_VERSION__;
/// Monotonic commit count (`git rev-list --count HEAD`) or "dev" outside git.
export const BUILD_NUMBER: string = __BUILD_NUMBER__;
/// Short git SHA — secondary identifier kept for diagnostics in the help modal.
export const BUILD_HASH: string = __BUILD_HASH__;
/// True when the build was produced from a working tree with uncommitted or
/// untracked changes.
export const BUILD_DIRTY: boolean = __BUILD_DIRTY__;

const numberLabel = BUILD_NUMBER === "dev" ? "dev" : `#${BUILD_NUMBER}`;
const dirtySuffix = BUILD_DIRTY ? "-dirty" : "";

/// Compact identifier rendered in the toolbar and OS title bar:
///   "v0.1.0 · #127"
///   "v0.1.0 · #127-dirty"
///   "v0.1.0 · dev"
export const BUILD_LABEL = `v${APP_VERSION} · ${numberLabel}${dirtySuffix}`;

/// Expanded identifier including the commit hash — used by the help modal so
/// support requests can include enough info to pinpoint the exact commit.
export const FULL_BUILD_LABEL =
  BUILD_HASH === "dev" || BUILD_HASH === BUILD_NUMBER
    ? BUILD_LABEL
    : `${BUILD_LABEL} · ${BUILD_HASH}`;
