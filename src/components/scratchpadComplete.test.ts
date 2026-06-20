import { describe, expect, it } from "vitest";
import {
  applySuggestion,
  completionContextAt,
  suggestionsFor,
} from "./scratchpadComplete";

describe("completionContextAt", () => {
  it("detects a trailing identifier", () => {
    expect(completionContextAt("leng", 4)).toEqual({
      kind: "ident",
      token: "leng",
      start: 0,
    });
  });

  it("detects an identifier mid-expression at the cursor", () => {
    const text = "a + len";
    expect(completionContextAt(text, text.length)).toEqual({
      kind: "ident",
      token: "len",
      start: 4,
    });
  });

  it("detects a swizzle after a dot", () => {
    expect(completionContextAt("a.xy", 4)).toEqual({
      kind: "swizzle",
      base: "a",
      token: "xy",
      start: 2,
    });
    expect(completionContextAt("gl_FragCoord.", 13)).toEqual({
      kind: "swizzle",
      base: "gl_FragCoord",
      token: "",
      start: 13,
    });
  });

  it("returns null with no completable token", () => {
    expect(completionContextAt("1.0 + ", 6)).toBeNull();
    expect(completionContextAt("", 0)).toBeNull();
  });
});

describe("suggestionsFor identifiers", () => {
  it("matches built-ins, uniforms, and variables by prefix", () => {
    const labels = suggestionsFor({ kind: "ident", token: "le", start: 0 }, {}).map(
      (s) => s.label,
    );
    expect(labels).toContain("length");
  });

  it("includes user variables and inserts function call parens", () => {
    const sugg = suggestionsFor({ kind: "ident", token: "no", start: 0 }, { noise: 1 });
    const labels = sugg.map((s) => s.label);
    expect(labels).toContain("noise"); // variable
    expect(labels).toContain("normalize"); // builtin
    const norm = sugg.find((s) => s.label === "normalize")!;
    expect(norm.insert).toBe("normalize(");
  });

  it("offers iResolution for the i-prefix", () => {
    const labels = suggestionsFor({ kind: "ident", token: "iR", start: 0 }, {}).map(
      (s) => s.label,
    );
    expect(labels).toContain("iResolution");
  });
});

describe("suggestionsFor swizzles", () => {
  it("offers components up to the vector size for a uniform", () => {
    const labels = suggestionsFor(
      { kind: "swizzle", base: "gl_FragCoord", token: "", start: 13 },
      {},
    ).map((s) => s.label);
    expect(labels).toContain(".x");
    expect(labels).toContain(".w"); // vec4
    expect(labels).toContain(".xy");
  });

  it("uses a variable's size and filters by partial", () => {
    // a is a vec2 variable: only x/y (no z), filtered to those starting with "x".
    const sugg = suggestionsFor(
      { kind: "swizzle", base: "a", token: "x", start: 2 },
      { a: 2 },
    );
    const labels = sugg.map((s) => s.label);
    expect(labels).toContain(".x");
    expect(labels).toContain(".xy");
    expect(labels).not.toContain(".z");
  });

  it("offers nothing for a scalar", () => {
    expect(suggestionsFor({ kind: "swizzle", base: "s", token: "", start: 2 }, { s: 1 })).toEqual([]);
  });
});

describe("applySuggestion", () => {
  it("replaces the token and returns the new cursor", () => {
    const ctx = { kind: "ident" as const, token: "len", start: 4 };
    const r = applySuggestion("a + len", ctx, { label: "length", detail: "", insert: "length(" }, 7);
    expect(r.text).toBe("a + length(");
    expect(r.cursor).toBe("a + length(".length);
  });

  it("inserts a swizzle after the dot, preserving trailing text", () => {
    const ctx = { kind: "swizzle" as const, base: "a", token: "", start: 2 };
    const r = applySuggestion("a. + 1.0", ctx, { label: ".xy", detail: "", insert: "xy" }, 2);
    expect(r.text).toBe("a.xy + 1.0");
    expect(r.cursor).toBe(4);
  });
});
