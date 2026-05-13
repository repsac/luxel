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
    /// True if `git status --porcelain` reports anything.
    dirty: bool,
}

fn capture_git() -> GitInfo {
    let number = run_git(&["rev-list", "--count", "HEAD"]).unwrap_or_else(|| "dev".to_string());
    let hash = run_git(&["rev-parse", "--short", "HEAD"]).unwrap_or_else(|| "dev".to_string());
    let dirty = run_git(&["status", "--porcelain"])
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    GitInfo { number, hash, dirty }
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
