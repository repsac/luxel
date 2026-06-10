use std::process::Command;

fn main() {
    let info = capture_git();
    println!("cargo:rustc-env=LUXEL_BUILD_NUMBER={}", info.number);
    println!("cargo:rustc-env=LUXEL_BUILD_HASH={}", info.hash);
    println!(
        "cargo:rustc-env=LUXEL_BUILD_DIRTY={}",
        if info.dirty { "true" } else { "false" }
    );

    // Be explicit about what should trigger a re-run. Once any rerun-if-changed
    // is emitted, cargo stops watching the whole package directory, so we have
    // to enumerate every input here.
    for path in [
        "src",
        "Cargo.toml",
        "build.rs",
        "tauri.conf.json",
        "capabilities",
        // Track git so a commit (or a stage operation) refreshes the embedded
        // build number even when no Rust source changed.
        "../.git/HEAD",
        "../.git/index",
    ] {
        println!("cargo:rerun-if-changed={path}");
    }

    tauri_build::build();
}

struct GitInfo {
    /// Monotonic commit count (`git rev-list --count HEAD`) or "dev" outside git.
    number: String,
    /// Short SHA, "dev" outside git.
    hash: String,
    /// True if tracked files differ from HEAD in content, or there are
    /// untracked files. Content-based (see `git_has_changes`) so a
    /// touched-but-unchanged file doesn't produce a false `-dirty`.
    dirty: bool,
}

fn capture_git() -> GitInfo {
    let number = run_git(&["rev-list", "--count", "HEAD"]).unwrap_or_else(|| "dev".to_string());
    let hash = run_git(&["rev-parse", "--short", "HEAD"]).unwrap_or_else(|| "dev".to_string());
    // Use a *content* comparison instead of `git status --porcelain`. Porcelain
    // keys off the stat cache, so any tool that merely touches a tracked file
    // marks it modified even when the bytes are unchanged — tauri-build touches
    // Cargo.toml on every compile and a system `core.autocrlf` re-filters its
    // line endings, which together stamped every build `-dirty` for no reason.
    // `git diff` re-hashes and compares to HEAD, ignoring that stat/EOL noise.
    let dirty = git_has_changes();
    GitInfo { number, hash, dirty }
}

/// Whether the working tree has real changes relative to HEAD.
///
/// For tracked files we use `git diff --quiet HEAD` (exit code 1 = changes): a
/// content comparison that re-hashes files, so it ignores the stat-cache
/// phantom `git status` reports when a file is merely touched. We still treat
/// genuinely untracked files as dirty. Any git error (no repo, no commits)
/// counts as clean.
fn git_has_changes() -> bool {
    let tracked_changed = Command::new("git")
        .args(["diff", "--quiet", "HEAD"])
        .status()
        .ok()
        .map(|s| s.code() == Some(1))
        .unwrap_or(false);
    let has_untracked = run_git(&["ls-files", "--others", "--exclude-standard"])
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    tracked_changed || has_untracked
}

fn run_git(args: &[&str]) -> Option<String> {
    Command::new("git")
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
}
