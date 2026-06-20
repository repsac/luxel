// Pure formatting + command parsing for the Scratchpad. Kept separate from the
// component so the display logic is unit-testable.

import { findBuiltin } from "../glsl/builtins";

export interface EvalResult {
  typeName: string;
  count: number;
  components: number[];
}

/// Make compiler errors more teachable. naga reports a built-in called with
/// the wrong number/type of arguments as "Unknown function 'name'", which
/// reads as if the function doesn't exist. When the name is actually a known
/// built-in, point at its real signature instead.
export function enrichError(message: string): string {
  const m = message.match(/unknown function '([^']+)'/i);
  if (m) {
    const b = findBuiltin(m[1]);
    if (b) {
      return `'${m[1]}' doesn't accept those arguments. Signature: ${b.signature}`;
    }
  }
  return message;
}

/// Format one number for display: up to 6 significant digits, trailing zeros
/// trimmed, with -0 normalized to 0.
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const r = Number(n.toPrecision(6));
  return Object.is(r, -0) ? "0" : String(r);
}

/// Render an eval result as a GLSL-ish literal: scalars print bare, vectors as
/// `vecN(a, b, ...)`, bools as true/false, ints rounded.
export function formatEvalResult(res: EvalResult): string {
  const vals = res.components.slice(0, Math.max(1, res.count));
  if (res.typeName === "bool") return vals[0] >= 0.5 ? "true" : "false";
  if (res.typeName === "int" || res.typeName === "uint") {
    return String(Math.round(vals[0]));
  }
  if (res.count === 1) return formatNumber(vals[0]);
  return `${res.typeName}(${vals.map(formatNumber).join(", ")})`;
}

/// Whether a result looks like a displayable color: a vec3/vec4 whose RGB
/// components are all within [0, 1].
export function isColorResult(res: EvalResult): boolean {
  if (res.typeName !== "vec3" && res.typeName !== "vec4") return false;
  const rgb = res.components.slice(0, 3);
  return rgb.every((v) => v >= 0 && v <= 1);
}

/// CSS color for a color-like result (caller should gate on isColorResult).
export function colorOf(res: EvalResult): string {
  const [r, g, b] = res.components;
  const to255 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgb(${to255(r)}, ${to255(g)}, ${to255(b)})`;
}

export type MetaCommand =
  | { kind: "clear" }
  | { kind: "reset" }
  | { kind: "vars" }
  | { kind: "builtins" }
  | { kind: "help"; arg?: string }
  | { kind: "unknown"; name: string };

/// Parse a leading-colon meta command (e.g. `:clear`, `:help length`). Returns
/// null for a normal GLSL expression.
export function parseMeta(input: string): MetaCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith(":")) return null;
  const [cmd, ...rest] = trimmed.slice(1).trim().split(/\s+/);
  const name = cmd.toLowerCase();
  switch (name) {
    case "clear":
      return { kind: "clear" };
    case "reset":
      return { kind: "reset" };
    case "vars":
      return { kind: "vars" };
    case "builtins":
    case "funcs":
      return { kind: "builtins" };
    case "help":
      return { kind: "help", arg: rest[0] };
    default:
      return { kind: "unknown", name };
  }
}

/// Detect a variable assignment `name = expr`. Avoids matching comparisons
/// (`==`, `<=`, ...) via the negative lookahead, and member assignment is not
/// supported (treated as an expression, which will simply fail to compile).
export function parseAssignment(
  input: string,
): { name: string; rhs: string } | null {
  const m = input.match(/^\s*([A-Za-z_]\w*)\s*=(?!=)\s*(.+)$/s);
  if (!m) return null;
  return { name: m[1], rhs: m[2].trim() };
}

/// Format a number as a GLSL float literal (always has a decimal point), with
/// enough precision to preserve an f32 read back from the GPU.
function glslFloat(n: number): string {
  if (!Number.isFinite(n)) return "0.0";
  let s = String(Number(n.toPrecision(8)));
  if (!s.includes(".") && !s.includes("e") && !s.includes("E")) s += ".0";
  return s;
}

/// Build a GLSL declaration that reconstructs a snapshotted value, e.g.
/// `vec2 a = vec2(3.0, 4.0);`. Snapshots are literals, so replaying them needs
/// no GPU state and is order-independent.
export function glslDecl(name: string, res: EvalResult): string {
  const vals = res.components.slice(0, Math.max(1, res.count));
  let ctor: string;
  if (res.typeName === "bool") {
    ctor = vals[0] >= 0.5 ? "true" : "false";
  } else if (res.typeName === "int" || res.typeName === "uint") {
    ctor = String(Math.round(vals[0]));
  } else if (res.count === 1) {
    ctor = glslFloat(vals[0]);
  } else {
    ctor = `${res.typeName}(${vals.map(glslFloat).join(", ")})`;
  }
  return `${res.typeName} ${name} = ${ctor};`;
}

export interface ScratchVar {
  name: string;
  result: EvalResult;
}

/// Join variable declarations into a preamble for the evaluator. Emitted in
/// insertion order.
export function buildPreamble(vars: ScratchVar[]): string {
  if (vars.length === 0) return "";
  return vars.map((v) => glslDecl(v.name, v.result)).join("\n") + "\n";
}
