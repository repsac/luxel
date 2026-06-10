//! Integration: load a fixture, validate, save a copy, reopen, compare.

use luxel_io::{load_scene_file, save_scene_file, parse_scene_file};

#[test]
fn load_valid_fixture_and_round_trip() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let fixture = std::path::Path::new(manifest_dir)
        .ancestors()
        .nth(2)
        .unwrap()
        .join("tests/fixtures/valid_scene.luxel.json");
    let file = load_scene_file(&fixture).expect("fixture should load");

    let tmp = std::env::temp_dir().join("luxel-roundtrip.luxel.json");
    save_scene_file(&tmp, &file).unwrap();
    let reloaded = load_scene_file(&tmp).unwrap();
    assert_eq!(file, reloaded);
    assert_eq!(file.scene.shader.entry_point, "mainImage");
    assert_eq!(file.scene.camera_bookmarks.len(), 1);
}

#[test]
fn missing_version_fixture_rejected() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let fixture = std::path::Path::new(manifest_dir)
        .ancestors()
        .nth(2)
        .unwrap()
        .join("tests/fixtures/invalid_scene_missing_version.luxel.json");
    let text = std::fs::read_to_string(&fixture).unwrap();
    assert!(parse_scene_file(&text).is_err());
}
