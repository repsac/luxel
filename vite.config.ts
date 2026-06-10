import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

interface GitInfo {
  /// Monotonic commit count on the current branch (`git rev-list --count HEAD`).
  /// We display this with a leading `#` so it reads as a build number. Falls
  /// back to the literal string "dev" when this isn't a git checkout.
  number: string;
  /// Short SHA — useful for diagnostics in the help modal even though it's
  /// not the primary identifier.
  hash: string;
  /// True if tracked files differ from HEAD in content, or there are untracked
  /// files. Content-based (`git diff`) rather than `git status --porcelain` so a
  /// file that's merely touched — tauri-build touches Cargo.toml, core.autocrlf
  /// re-filters line endings — doesn't falsely tag the build `-dirty`.
  dirty: boolean;
}

function captureGit(): GitInfo {
  const run = (args: string[]): string =>
    execSync(`git ${args.join(" ")}`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  // `git diff --quiet HEAD` exits non-zero when tracked files differ in
  // content. We use it instead of `git status --porcelain`, which keys off the
  // stat cache and reports a phantom "modified" whenever a tool merely touches
  // a tracked file (tauri-build touches Cargo.toml; core.autocrlf re-filters its
  // line endings) — that would otherwise stamp every build `-dirty`.
  const hasTrackedChanges = (): boolean => {
    try {
      execSync("git diff --quiet HEAD", { stdio: "ignore" });
      return false;
    } catch {
      return true;
    }
  };
  try {
    return {
      number: run(["rev-list", "--first-parent", "--count", "HEAD"]),
      hash: run(["rev-parse", "--short", "HEAD"]),
      dirty:
        hasTrackedChanges() ||
        run(["ls-files", "--others", "--exclude-standard"]).length > 0,
    };
  } catch {
    return { number: "dev", hash: "dev", dirty: false };
  }
}

const git = captureGit();

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_NUMBER__: JSON.stringify(git.number),
    __BUILD_HASH__: JSON.stringify(git.hash),
    __BUILD_DIRTY__: JSON.stringify(git.dirty),
  },
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
  },
});
