import { describe, expect, it } from "vitest";
import {
  buildPreamble,
  colorOf,
  enrichError,
  formatEvalResult,
  formatNumber,
  glslDecl,
  isColorResult,
  parseAssignment,
  parseMeta,
} from "./scratchpadFormat";

describe("formatNumber", () => {
  it("trims trailing zeros and normalizes -0", () => {
    expect(formatNumber(5)).toBe("5");
    expect(formatNumber(0.6)).toBe("0.6");
    expect(formatNumber(-0)).toBe("0");
    expect(formatNumber(2.5)).toBe("2.5");
  });

  it("limits to ~6 significant digits", () => {
    expect(formatNumber(1 / 3)).toBe("0.333333");
  });
});

describe("formatEvalResult", () => {
  it("prints scalars bare", () => {
    expect(formatEvalResult({ typeName: "float", count: 1, components: [5, 0, 0, 0] })).toBe("5");
  });

  it("prints vectors as constructors", () => {
    expect(
      formatEvalResult({ typeName: "vec2", count: 2, components: [0.6, 0.8, 0, 0] }),
    ).toBe("vec2(0.6, 0.8)");
  });

  it("prints bools and ints", () => {
    expect(formatEvalResult({ typeName: "bool", count: 1, components: [1, 0, 0, 0] })).toBe("true");
    expect(formatEvalResult({ typeName: "bool", count: 1, components: [0, 0, 0, 0] })).toBe("false");
    expect(formatEvalResult({ typeName: "int", count: 1, components: [42.0, 0, 0, 0] })).toBe("42");
  });
});

describe("isColorResult / colorOf", () => {
  it("treats in-range vec3/vec4 as colors", () => {
    expect(isColorResult({ typeName: "vec3", count: 3, components: [1, 0.5, 0, 0] })).toBe(true);
    expect(isColorResult({ typeName: "vec4", count: 4, components: [0, 0, 0, 1] })).toBe(true);
  });

  it("rejects out-of-range or non-color types", () => {
    expect(isColorResult({ typeName: "vec3", count: 3, components: [2, 0, 0, 0] })).toBe(false);
    expect(isColorResult({ typeName: "vec2", count: 2, components: [0.5, 0.5, 0, 0] })).toBe(false);
    expect(isColorResult({ typeName: "float", count: 1, components: [0.5, 0, 0, 0] })).toBe(false);
  });

  it("maps components to a css rgb string", () => {
    expect(colorOf({ typeName: "vec3", count: 3, components: [1, 0, 0.5, 0] })).toBe(
      "rgb(255, 0, 128)",
    );
  });
});

describe("parseMeta", () => {
  it("recognizes the meta commands", () => {
    expect(parseMeta(":clear")).toEqual({ kind: "clear" });
    expect(parseMeta("  :clear  ")).toEqual({ kind: "clear" });
    expect(parseMeta(":reset")).toEqual({ kind: "reset" });
    expect(parseMeta(":vars")).toEqual({ kind: "vars" });
    expect(parseMeta(":builtins")).toEqual({ kind: "builtins" });
    expect(parseMeta(":funcs")).toEqual({ kind: "builtins" });
    expect(parseMeta(":help")).toEqual({ kind: "help", arg: undefined });
    expect(parseMeta(":help length")).toEqual({ kind: "help", arg: "length" });
  });

  it("flags unknown colon commands", () => {
    expect(parseMeta(":wat")).toEqual({ kind: "unknown", name: "wat" });
  });

  it("returns null for normal expressions", () => {
    expect(parseMeta("length(vec2(3.0, 4.0))")).toBeNull();
  });
});

describe("enrichError", () => {
  it("turns naga's 'unknown function' into a signature hint for known built-ins", () => {
    const msg = enrichError("Unknown function 'length'");
    expect(msg).toContain("length");
    expect(msg).toContain("float length(genType v)");
    expect(msg).not.toContain("Unknown function");
  });

  it("leaves genuinely unknown names and other errors alone", () => {
    expect(enrichError("Unknown function 'frobnicate'")).toBe(
      "Unknown function 'frobnicate'",
    );
    expect(enrichError("some other error")).toBe("some other error");
  });
});

describe("parseAssignment", () => {
  it("captures name and right-hand side", () => {
    expect(parseAssignment("a = vec2(3.0, 4.0)")).toEqual({
      name: "a",
      rhs: "vec2(3.0, 4.0)",
    });
    expect(parseAssignment("  myVar=length(b)  ")).toEqual({
      name: "myVar",
      rhs: "length(b)",
    });
  });

  it("does not treat comparisons as assignments", () => {
    expect(parseAssignment("a == b")).toBeNull();
    expect(parseAssignment("x <= 1.0")).toBeNull();
  });

  it("returns null for plain expressions", () => {
    expect(parseAssignment("length(vec2(3.0, 4.0))")).toBeNull();
  });
});

describe("glslDecl / buildPreamble", () => {
  it("reconstructs snapshots as GLSL literals", () => {
    expect(glslDecl("a", { typeName: "vec2", count: 2, components: [3, 4, 0, 0] })).toBe(
      "vec2 a = vec2(3.0, 4.0);",
    );
    expect(glslDecl("s", { typeName: "float", count: 1, components: [5, 0, 0, 0] })).toBe(
      "float s = 5.0;",
    );
    expect(glslDecl("b", { typeName: "bool", count: 1, components: [1, 0, 0, 0] })).toBe(
      "bool b = true;",
    );
    expect(glslDecl("n", { typeName: "int", count: 1, components: [42, 0, 0, 0] })).toBe(
      "int n = 42;",
    );
  });

  it("joins declarations and is empty for no vars", () => {
    expect(buildPreamble([])).toBe("");
    const pre = buildPreamble([
      { name: "a", result: { typeName: "vec2", count: 2, components: [1, 2, 0, 0] } },
      { name: "b", result: { typeName: "float", count: 1, components: [3, 0, 0, 0] } },
    ]);
    expect(pre).toBe("vec2 a = vec2(1.0, 2.0);\nfloat b = 3.0;\n");
  });
});
