// Pure completion logic for the Scratchpad input: figure out what's being
// typed at the cursor and produce ranked suggestions. Kept separate from the
// component so it's unit-testable.

import {
  BUILTIN_FUNCTIONS,
  BUILTIN_UNIFORMS,
  VECTOR_SIZES,
} from "../glsl/builtins";

export interface CompletionContext {
  kind: "ident" | "swizzle";
  /// The partial text being completed (after the dot, for swizzle).
  token: string;
  /// Index in the input where `token` starts (the replace range start).
  start: number;
  /// For swizzle: the identifier before the dot.
  base?: string;
}

/// Determine the completion context just left of the cursor, or null if there
/// is nothing completable there.
export function completionContextAt(
  text: string,
  cursor: number,
): CompletionContext | null {
  const left = text.slice(0, cursor);
  // `<ident>.<partial>` — swizzle (partial may be empty).
  const sw = left.match(/([A-Za-z_]\w*)\.([A-Za-z]*)$/);
  if (sw) {
    return {
      kind: "swizzle",
      base: sw[1],
      token: sw[2],
      start: cursor - sw[2].length,
    };
  }
  // A trailing identifier — complete it.
  const id = left.match(/([A-Za-z_]\w*)$/);
  if (id) {
    return { kind: "ident", token: id[1], start: cursor - id[1].length };
  }
  return null;
}

export interface Suggestion {
  /// Text shown in the list (swizzles show the leading dot).
  label: string;
  detail: string;
  /// Text inserted in place of the token.
  insert: string;
}

const TYPE_CONSTRUCTORS = ["vec2", "vec3", "vec4"];
const MAX_SUGGESTIONS = 12;

function vectorSizeOf(base: string, varSizes: Record<string, number>): number {
  return varSizes[base] ?? VECTOR_SIZES[base] ?? 0;
}

/// Suggestions for the given context. `varSizes` maps the user's variable
/// names to their component counts (1 for scalars).
export function suggestionsFor(
  ctx: CompletionContext,
  varSizes: Record<string, number>,
): Suggestion[] {
  if (ctx.kind === "swizzle") {
    return swizzleSuggestions(ctx.base ?? "", ctx.token, varSizes);
  }
  return identSuggestions(ctx.token, varSizes);
}

function identSuggestions(
  token: string,
  varSizes: Record<string, number>,
): Suggestion[] {
  const candidates: Suggestion[] = [
    ...Object.keys(varSizes).map((n) => ({ label: n, detail: "variable", insert: n })),
    ...BUILTIN_UNIFORMS.map((u) => ({ label: u.name, detail: u.signature, insert: u.name })),
    ...TYPE_CONSTRUCTORS.map((t) => ({
      label: t,
      detail: `${t} constructor`,
      insert: `${t}(`,
    })),
    ...BUILTIN_FUNCTIONS.map((f) => ({
      label: f.name,
      detail: f.signature,
      insert: `${f.name}(`,
    })),
  ];
  const lower = token.toLowerCase();
  const matches = candidates.filter((c) => c.label.toLowerCase().startsWith(lower));
  return matches.slice(0, MAX_SUGGESTIONS);
}

function swizzleSuggestions(
  base: string,
  token: string,
  varSizes: Record<string, number>,
): Suggestion[] {
  const size = vectorSizeOf(base, varSizes);
  if (size < 2) return [];
  const xyzw = ["x", "y", "z", "w"].slice(0, size);
  const rgba = ["r", "g", "b", "a"].slice(0, size);
  const opts: string[] = [...xyzw, ...rgba];
  // A few common multi-component swizzles.
  if (size >= 2) opts.push("xy", "rg");
  if (size >= 3) opts.push("xyz", "rgb");
  if (size >= 4) opts.push("xyzw", "rgba");
  const seen = new Set<string>();
  const lower = token.toLowerCase();
  const out: Suggestion[] = [];
  for (const sw of opts) {
    if (seen.has(sw) || !sw.startsWith(lower)) continue;
    seen.add(sw);
    out.push({ label: `.${sw}`, detail: "swizzle", insert: sw });
  }
  return out.slice(0, MAX_SUGGESTIONS);
}

/// Apply a suggestion to the input text, returning the new text and the cursor
/// position to place after the inserted text.
export function applySuggestion(
  text: string,
  ctx: CompletionContext,
  suggestion: Suggestion,
  cursor: number,
): { text: string; cursor: number } {
  const before = text.slice(0, ctx.start);
  const after = text.slice(cursor);
  const next = before + suggestion.insert + after;
  return { text: next, cursor: ctx.start + suggestion.insert.length };
}
