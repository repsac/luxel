import { describe, expect, it } from "vitest";
import { builtinsSummary, findBuiltin, isReservedName, CATALOG } from "./builtins";

describe("builtin catalog", () => {
  it("looks up functions and uniforms by name", () => {
    expect(findBuiltin("length")?.signature).toContain("length");
    expect(findBuiltin("iResolution")?.summary).toContain("Viewport");
    expect(findBuiltin("nope")).toBeUndefined();
  });

  it("every entry has a signature and summary", () => {
    for (const e of CATALOG) {
      expect(e.signature.length).toBeGreaterThan(0);
      expect(e.summary.length).toBeGreaterThan(0);
    }
  });

  it("reserves built-ins, uniforms, type keywords, and internals", () => {
    expect(isReservedName("length")).toBe(true);
    expect(isReservedName("iTime")).toBe(true);
    expect(isReservedName("vec3")).toBe(true);
    expect(isReservedName("_luxel_r")).toBe(true);
    expect(isReservedName("gl_FragCoord")).toBe(true);
  });

  it("allows ordinary names", () => {
    expect(isReservedName("a")).toBe(false);
    expect(isReservedName("myColor")).toBe(false);
  });

  it("summarizes functions and uniforms for :builtins", () => {
    const s = builtinsSummary();
    expect(s).toContain("length");
    expect(s).toContain("iResolution");
    expect(s).toContain("Functions:");
    expect(s).toContain("Uniforms:");
  });
});
