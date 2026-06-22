// A small catalog of the GLSL built-ins and Luxel uniforms available in the
// Scratchpad, used by `:help` (and, later, autocomplete). Not exhaustive — it
// covers the common math/vector functions a learner reaches for.

export interface CatalogEntry {
  name: string;
  /// A readable signature (genType means "float or vecN").
  signature: string;
  summary: string;
}

/// Pure math/vector built-ins. These all evaluate cleanly in the Scratchpad.
export const BUILTIN_FUNCTIONS: CatalogEntry[] = [
  { name: "length", signature: "float length(genType v)", summary: "Magnitude (Euclidean length) of a vector." },
  { name: "distance", signature: "float distance(genType a, genType b)", summary: "Distance between two points." },
  { name: "dot", signature: "float dot(genType a, genType b)", summary: "Dot product." },
  { name: "cross", signature: "vec3 cross(vec3 a, vec3 b)", summary: "Cross product of two 3D vectors." },
  { name: "normalize", signature: "genType normalize(genType v)", summary: "Vector scaled to length 1." },
  { name: "mix", signature: "genType mix(genType a, genType b, genType t)", summary: "Linear blend: a*(1-t) + b*t." },
  { name: "clamp", signature: "genType clamp(genType x, min, max)", summary: "Constrain x to [min, max]." },
  { name: "step", signature: "genType step(edge, x)", summary: "0 if x < edge, else 1." },
  { name: "smoothstep", signature: "genType smoothstep(e0, e1, x)", summary: "Smooth 0→1 ramp between e0 and e1." },
  { name: "abs", signature: "genType abs(genType x)", summary: "Absolute value." },
  { name: "sign", signature: "genType sign(genType x)", summary: "-1, 0, or 1 by sign of x." },
  { name: "floor", signature: "genType floor(genType x)", summary: "Largest integer <= x." },
  { name: "ceil", signature: "genType ceil(genType x)", summary: "Smallest integer >= x." },
  { name: "fract", signature: "genType fract(genType x)", summary: "Fractional part: x - floor(x)." },
  { name: "mod", signature: "genType mod(genType x, genType y)", summary: "Modulo: x - y*floor(x/y)." },
  { name: "min", signature: "genType min(genType a, genType b)", summary: "Per-component minimum." },
  { name: "max", signature: "genType max(genType a, genType b)", summary: "Per-component maximum." },
  { name: "pow", signature: "genType pow(genType x, genType y)", summary: "x raised to the power y." },
  { name: "exp", signature: "genType exp(genType x)", summary: "e^x." },
  { name: "log", signature: "genType log(genType x)", summary: "Natural logarithm." },
  { name: "sqrt", signature: "genType sqrt(genType x)", summary: "Square root." },
  { name: "sin", signature: "genType sin(genType x)", summary: "Sine (radians)." },
  { name: "cos", signature: "genType cos(genType x)", summary: "Cosine (radians)." },
  { name: "tan", signature: "genType tan(genType x)", summary: "Tangent (radians)." },
  { name: "atan", signature: "genType atan(y, x) | atan(y_over_x)", summary: "Arc tangent; the 2-arg form gives the angle of (x, y)." },
  { name: "radians", signature: "genType radians(genType degrees)", summary: "Degrees → radians." },
  { name: "degrees", signature: "genType degrees(genType radians)", summary: "Radians → degrees." },
  { name: "reflect", signature: "genType reflect(I, N)", summary: "Reflect incident I about normal N." },
  { name: "refract", signature: "genType refract(I, N, eta)", summary: "Refract I through normal N with ratio eta." },
];

/// Uniforms and built-in variables Luxel injects.
export const BUILTIN_UNIFORMS: CatalogEntry[] = [
  { name: "iResolution", signature: "vec3 iResolution", summary: "Viewport size in pixels (x, y, 1)." },
  { name: "iTime", signature: "float iTime", summary: "currentFrame / targetFps." },
  { name: "iFrame", signature: "int iFrame", summary: "Current frame number." },
  { name: "iMouse", signature: "vec4 iMouse", summary: "xy = drag pos, zw = click pos." },
  { name: "iCameraPosition", signature: "vec3 iCameraPosition", summary: "World-space camera position." },
  { name: "iCameraFov", signature: "float iCameraFov", summary: "Vertical field of view, radians." },
  { name: "iCameraForward", signature: "vec3 iCameraForward", summary: "Camera forward axis (normalized)." },
  { name: "iCameraRight", signature: "vec3 iCameraRight", summary: "Camera right axis (normalized)." },
  { name: "iCameraUp", signature: "vec3 iCameraUp", summary: "Camera up axis (normalized)." },
  { name: "iObjectPosition", signature: "vec3 iObjectPosition", summary: "Move-gizmo object position." },
  { name: "gl_FragCoord", signature: "vec4 gl_FragCoord", summary: "Pixel coord; faked to the pinned pixel here (xy meaningful)." },
];

export const CATALOG: CatalogEntry[] = [...BUILTIN_FUNCTIONS, ...BUILTIN_UNIFORMS];

export function findBuiltin(name: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.name === name);
}

/// A compact, multi-line listing of everything available, for the Scratchpad's
/// `:builtins` command. Names only; `:help <name>` gives the signature.
export function builtinsSummary(): string {
  const funcs = BUILTIN_FUNCTIONS.map((f) => f.name).join(", ");
  const unis = BUILTIN_UNIFORMS.map((u) => u.name).join(", ");
  return (
    `Functions: ${funcs}\n` +
    `Uniforms: ${unis}\n` +
    "Use :help <name> for a signature (e.g. :help mix)."
  );
}

/// GLSL type keywords that can't be used as variable names.
const TYPE_KEYWORDS = [
  "float", "int", "uint", "bool", "void",
  "vec2", "vec3", "vec4",
  "ivec2", "ivec3", "ivec4",
  "uvec2", "uvec3", "uvec4",
  "bvec2", "bvec3", "bvec4",
  "mat2", "mat3", "mat4",
];

/// Names a Scratchpad variable may not take: built-in functions, uniforms,
/// type keywords, and our internal helpers. Declaring one would shadow or
/// collide with the generated shader.
export const RESERVED_NAMES: Set<string> = new Set([
  ...CATALOG.map((e) => e.name),
  ...TYPE_KEYWORDS,
  "outColor",
  "v_uv",
  "main",
]);

export function isReservedName(name: string): boolean {
  return RESERVED_NAMES.has(name) || name.startsWith("_luxel");
}

function leadingTypeSize(signature: string): number {
  if (signature.startsWith("vec2")) return 2;
  if (signature.startsWith("vec3")) return 3;
  if (signature.startsWith("vec4")) return 4;
  return 1; // float/int scalars
}

/// Component count of each uniform/built-in variable, for swizzle completion
/// (e.g. `gl_FragCoord.` → 4 components).
export const VECTOR_SIZES: Record<string, number> = Object.fromEntries(
  BUILTIN_UNIFORMS.map((u) => [u.name, leadingTypeSize(u.signature)]),
);
