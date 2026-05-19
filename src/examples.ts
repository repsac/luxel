// Built-in example shaders that ship with the app. The frontend swaps these
// into the current scene's shader source on demand; nothing else about the
// scene changes (camera, layout, render settings are preserved).
//
// Every example carries a `compatibility` field — when the user picks one,
// the Toolbar flips the scene's compatibility to match before loading the
// source. Examples come in matched Shadertoy/raw pairs that share a
// `pairId`, so when the user toggles compatibility on an unedited example
// scene we can swap to the equivalent in the new mode automatically.
//
// The 3D shaders are written to use Luxel's camera uniforms so that mouse
// orbit/pan/dolly in the render view actually moves the camera. The relevant
// uniforms are:
//
//   vec3  iCameraPosition
//   float iCameraFov      (vertical, radians)
//   vec3  iCameraForward  (normalized)
//   vec3  iCameraRight    (normalized)
//   vec3  iCameraUp       (normalized)
//
// The standard 3D ray-direction formula is:
//
//   vec2 uv = (fragCoord * 2.0 - iResolution.xy) / iResolution.y;
//   float h = tan(iCameraFov * 0.5);
//   vec3 rd = normalize(iCameraForward + uv.x * h * iCameraRight + uv.y * h * iCameraUp);

import type { ShaderCompatibility } from "./state/sceneStore";

export type ExampleKind = "2D" | "3D";

export interface ExampleShader {
  id: string;
  /// Shared identifier across the Shadertoy/raw pair for the same scene.
  /// When switching compatibility on an unedited example, the editor looks
  /// up the partner via this field.
  pairId: string;
  kind: ExampleKind;
  compatibility: ShaderCompatibility;
  name: string;
  description: string;
  source: string;
}

// ---------------- Shadertoy convention ----------------

const gradientST: ExampleShader = {
  id: "gradient-st",
  pairId: "gradient",
  kind: "2D",
  compatibility: "shadertoy-fragment-v1",
  name: "Gradient",
  description: "UV gradient with a time-driven blue channel.",
  source: `void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = fragCoord / iResolution.xy;
    vec3 color = vec3(uv.x, uv.y, 0.35 + 0.25 * sin(iTime));
    fragColor = vec4(color, 1.0);
}
`,
};

const plasmaST: ExampleShader = {
  id: "plasma-st",
  pairId: "plasma",
  kind: "2D",
  compatibility: "shadertoy-fragment-v1",
  name: "Plasma",
  description: "Layered sin waves — the canonical 80s demoscene effect.",
  source: `void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = (fragCoord * 2.0 - iResolution.xy) / iResolution.y;
    float t = iTime;
    float v = sin(uv.x * 3.0 + t);
    v += sin((uv.y + t) * 2.0);
    v += sin((uv.x + uv.y + t) * 1.5);
    v += sin(length(uv) * 4.0 - t * 2.0);
    v *= 0.25;
    vec3 color = 0.5 + 0.5 * vec3(sin(v * 3.14159), sin(v * 3.14159 + 2.094), sin(v * 3.14159 + 4.188));
    fragColor = vec4(color, 1.0);
}
`,
};

const checkerST: ExampleShader = {
  id: "checker-st",
  pairId: "checker",
  kind: "2D",
  compatibility: "shadertoy-fragment-v1",
  name: "Checkerboard",
  description: "Anti-aliased checkerboard pattern.",
  source: `void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = fragCoord / iResolution.xy * 12.0;
    vec2 g = abs(fract(uv) - 0.5);
    float check = step(0.0, (g.x - 0.5) * (g.y - 0.5));
    vec3 a = vec3(0.92, 0.92, 0.94);
    vec3 b = vec3(0.12, 0.13, 0.16);
    fragColor = vec4(mix(b, a, check), 1.0);
}
`,
};

const mandelbrotST: ExampleShader = {
  id: "mandelbrot-st",
  pairId: "mandelbrot",
  kind: "2D",
  compatibility: "shadertoy-fragment-v1",
  name: "Mandelbrot",
  description: "Iterate z² + c with a smooth coloring escape function.",
  source: `void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = (fragCoord * 2.0 - iResolution.xy) / iResolution.y;
    vec2 c = uv * 1.5 - vec2(0.6, 0.0);
    vec2 z = vec2(0.0);
    float n = 0.0;
    const float MAX = 96.0;
    for (int i = 0; i < 96; i++) {
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        if (dot(z, z) > 64.0) break;
        n += 1.0;
    }
    float m = n - log2(log2(dot(z, z))) + 4.0;
    float t = m / MAX;
    vec3 color = 0.5 + 0.5 * cos(6.2831 * t + vec3(0.0, 0.6, 1.0));
    if (n >= MAX) color = vec3(0.0);
    fragColor = vec4(color, 1.0);
}
`,
};

const sphereST: ExampleShader = {
  id: "sphere-st",
  pairId: "sphere",
  kind: "3D",
  compatibility: "shadertoy-fragment-v1",
  name: "Sphere",
  description: "Raymarched sphere with diffuse + specular lighting. Drag to orbit.",
  source: `float sphereSdf(vec3 p, float r) { return length(p) - r; }

vec3 sphereNormal(vec3 p)
{
    vec2 e = vec2(0.0015, 0.0);
    return normalize(vec3(
        sphereSdf(p + e.xyy, 1.0) - sphereSdf(p - e.xyy, 1.0),
        sphereSdf(p + e.yxy, 1.0) - sphereSdf(p - e.yxy, 1.0),
        sphereSdf(p + e.yyx, 1.0) - sphereSdf(p - e.yyx, 1.0)
    ));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = (fragCoord * 2.0 - iResolution.xy) / iResolution.y;
    float h = tan(iCameraFov * 0.5);
    vec3 ro = iCameraPosition;
    vec3 rd = normalize(iCameraForward + uv.x * h * iCameraRight + uv.y * h * iCameraUp);
    float t = 0.0;
    float hit = 0.0;
    vec3 p;
    for (int i = 0; i < 96; i++) {
        p = ro + rd * t;
        float d = sphereSdf(p, 1.0);
        if (d < 0.001) { hit = 1.0; break; }
        t += d;
        if (t > 50.0) break;
    }
    vec3 sky = mix(vec3(0.05, 0.07, 0.10), vec3(0.15, 0.20, 0.30), uv.y * 0.5 + 0.5);
    vec3 color = sky;
    if (hit > 0.5) {
        vec3 n = sphereNormal(p);
        vec3 l = normalize(vec3(0.6, 0.8, 0.4));
        float diff = max(dot(n, l), 0.0);
        float spec = pow(max(dot(reflect(-l, n), -rd), 0.0), 24.0);
        color = vec3(0.8, 0.55, 0.25) * (0.2 + diff) + vec3(1.0) * spec * 0.5;
    }
    fragColor = vec4(color, 1.0);
}
`,
};

const torusST: ExampleShader = {
  id: "torus-st",
  pairId: "torus",
  kind: "3D",
  compatibility: "shadertoy-fragment-v1",
  name: "Torus",
  description: "Rotating torus with a directional light. Drag to orbit.",
  source: `float torusSdf(vec3 p, vec2 t)
{
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

mat3 rotY(float a) { return mat3(cos(a), 0.0, sin(a), 0.0, 1.0, 0.0, -sin(a), 0.0, cos(a)); }

float scene(vec3 p)
{
    p = rotY(iTime * 0.4) * p;
    p.xy *= mat2(cos(0.5), -sin(0.5), sin(0.5), cos(0.5));
    return torusSdf(p, vec2(1.2, 0.35));
}

vec3 normalAt(vec3 p)
{
    vec2 e = vec2(0.0015, 0.0);
    return normalize(vec3(
        scene(p + e.xyy) - scene(p - e.xyy),
        scene(p + e.yxy) - scene(p - e.yxy),
        scene(p + e.yyx) - scene(p - e.yyx)
    ));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = (fragCoord * 2.0 - iResolution.xy) / iResolution.y;
    float h = tan(iCameraFov * 0.5);
    vec3 ro = iCameraPosition;
    vec3 rd = normalize(iCameraForward + uv.x * h * iCameraRight + uv.y * h * iCameraUp);
    float t = 0.0;
    float hit = 0.0;
    vec3 p;
    for (int i = 0; i < 128; i++) {
        p = ro + rd * t;
        float d = scene(p);
        if (d < 0.001) { hit = 1.0; break; }
        t += d;
        if (t > 60.0) break;
    }
    vec3 sky = mix(vec3(0.04, 0.05, 0.07), vec3(0.12, 0.18, 0.28), uv.y * 0.5 + 0.5);
    vec3 color = sky;
    if (hit > 0.5) {
        vec3 n = normalAt(p);
        vec3 l = normalize(vec3(0.4, 0.7, 0.5));
        float diff = max(dot(n, l), 0.0);
        float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
        color = vec3(0.85, 0.6, 0.2) * (0.15 + diff * 0.9) + fres * vec3(0.4, 0.6, 1.0);
    }
    fragColor = vec4(color, 1.0);
}
`,
};

const groundST: ExampleShader = {
  id: "ground-st",
  pairId: "ground",
  kind: "3D",
  compatibility: "shadertoy-fragment-v1",
  name: "Sphere on Ground",
  description: "Sphere casting a soft shadow on a checkerboard plane. Drag to orbit.",
  source: `float sphere(vec3 p, vec3 c, float r) { return length(p - c) - r; }
float plane(vec3 p) { return p.y + 1.0; }

float scene(vec3 p)
{
    return min(sphere(p, vec3(0.0, 0.0, 0.0), 1.0), plane(p));
}

vec3 normalAt(vec3 p)
{
    vec2 e = vec2(0.002, 0.0);
    return normalize(vec3(
        scene(p + e.xyy) - scene(p - e.xyy),
        scene(p + e.yxy) - scene(p - e.yxy),
        scene(p + e.yyx) - scene(p - e.yyx)
    ));
}

float softShadow(vec3 ro, vec3 rd)
{
    float res = 1.0;
    float t = 0.02;
    for (int i = 0; i < 40; i++) {
        float d = scene(ro + rd * t);
        if (d < 0.001) return 0.0;
        res = min(res, 8.0 * d / t);
        t += d;
        if (t > 25.0) break;
    }
    return clamp(res, 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = (fragCoord * 2.0 - iResolution.xy) / iResolution.y;
    float h = tan(iCameraFov * 0.5);
    vec3 ro = iCameraPosition;
    vec3 rd = normalize(iCameraForward + uv.x * h * iCameraRight + uv.y * h * iCameraUp);
    float t = 0.0;
    float hit = 0.0;
    vec3 p;
    for (int i = 0; i < 128; i++) {
        p = ro + rd * t;
        float d = scene(p);
        if (d < 0.001) { hit = 1.0; break; }
        t += d;
        if (t > 80.0) break;
    }
    vec3 sky = mix(vec3(0.4, 0.6, 0.8), vec3(0.1, 0.15, 0.25), max(rd.y, 0.0));
    vec3 color = sky;
    if (hit > 0.5) {
        vec3 n = normalAt(p);
        vec3 l = normalize(vec3(0.5, 0.8, 0.3));
        float diff = max(dot(n, l), 0.0);
        float shadow = softShadow(p + n * 0.002, l);
        bool onPlane = abs(p.y + 1.0) < 0.01;
        vec3 albedo = onPlane
            ? (mod(floor(p.x) + floor(p.z), 2.0) < 0.5 ? vec3(0.7) : vec3(0.3))
            : vec3(0.9, 0.5, 0.2);
        color = albedo * (0.2 + diff * shadow * 0.9);
    }
    fragColor = vec4(color, 1.0);
}
`,
};

const fractalST: ExampleShader = {
  id: "fractal-st",
  pairId: "fractal",
  kind: "3D",
  compatibility: "shadertoy-fragment-v1",
  name: "Mandelbulb (lite)",
  description: "Cheap mandelbulb fractal with iteration-count shading. Drag to orbit.",
  source: `float fractalDe(vec3 p)
{
    vec3 z = p;
    float dr = 1.0;
    float r = 0.0;
    const float power = 8.0;
    for (int i = 0; i < 6; i++) {
        r = length(z);
        if (r > 2.0) break;
        float theta = acos(z.z / r);
        float phi = atan(z.y, z.x);
        dr = pow(r, power - 1.0) * power * dr + 1.0;
        float zr = pow(r, power);
        theta *= power;
        phi *= power;
        z = zr * vec3(sin(theta) * cos(phi), sin(phi) * sin(theta), cos(theta)) + p;
    }
    return 0.5 * log(r) * r / dr;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = (fragCoord * 2.0 - iResolution.xy) / iResolution.y;
    float h = tan(iCameraFov * 0.5);
    vec3 ro = iCameraPosition;
    vec3 rd = normalize(iCameraForward + uv.x * h * iCameraRight + uv.y * h * iCameraUp);
    float t = 0.0;
    float steps = 0.0;
    bool hit = false;
    vec3 p;
    for (int i = 0; i < 120; i++) {
        p = ro + rd * t;
        float d = fractalDe(p);
        if (d < 0.0008) { hit = true; break; }
        t += d * 0.6;
        steps += 1.0;
        if (t > 30.0) break;
    }
    vec3 sky = mix(vec3(0.02, 0.03, 0.05), vec3(0.1, 0.12, 0.18), uv.y * 0.5 + 0.5);
    vec3 color = sky;
    if (hit) {
        float k = 1.0 - steps / 120.0;
        color = vec3(0.9, 0.6, 0.3) * k + vec3(0.1, 0.2, 0.5) * (1.0 - k);
    }
    fragColor = vec4(color, 1.0);
}
`,
};

// ---------------- Raw GLSL versions ----------------

const gradientRaw: ExampleShader = {
  id: "gradient-raw",
  pairId: "gradient",
  kind: "2D",
  compatibility: "raw-fragment-v1",
  name: "Gradient",
  description: "UV gradient with a time-driven blue channel.",
  source: `void main() {
    outColor = vec4(v_uv.x, v_uv.y, 0.35 + 0.25 * sin(iTime), 1.0);
}
`,
};

const plasmaRaw: ExampleShader = {
  id: "plasma-raw",
  pairId: "plasma",
  kind: "2D",
  compatibility: "raw-fragment-v1",
  name: "Plasma",
  description: "Layered sin waves — the canonical 80s demoscene effect.",
  source: `void main() {
    vec2 uv = (v_uv - 0.5) * 2.0;
    uv.x *= iResolution.x / iResolution.y;
    float t = iTime;
    float v = sin(uv.x * 3.0 + t);
    v += sin((uv.y + t) * 2.0);
    v += sin((uv.x + uv.y + t) * 1.5);
    v += sin(length(uv) * 4.0 - t * 2.0);
    v *= 0.25;
    vec3 color = 0.5 + 0.5 * vec3(
        sin(v * 3.14159),
        sin(v * 3.14159 + 2.094),
        sin(v * 3.14159 + 4.188)
    );
    outColor = vec4(color, 1.0);
}
`,
};

const checkerRaw: ExampleShader = {
  id: "checker-raw",
  pairId: "checker",
  kind: "2D",
  compatibility: "raw-fragment-v1",
  name: "Checkerboard",
  description: "Anti-aliased checkerboard pattern.",
  source: `void main() {
    vec2 uv = v_uv * 12.0;
    vec2 g = abs(fract(uv) - 0.5);
    float check = step(0.0, (g.x - 0.5) * (g.y - 0.5));
    vec3 a = vec3(0.92, 0.92, 0.94);
    vec3 b = vec3(0.12, 0.13, 0.16);
    outColor = vec4(mix(b, a, check), 1.0);
}
`,
};

const mandelbrotRaw: ExampleShader = {
  id: "mandelbrot-raw",
  pairId: "mandelbrot",
  kind: "2D",
  compatibility: "raw-fragment-v1",
  name: "Mandelbrot",
  description: "Iterate z² + c with a smooth coloring escape function.",
  source: `void main() {
    vec2 uv = (v_uv - 0.5) * 2.0;
    uv.x *= iResolution.x / iResolution.y;
    vec2 c = uv * 1.5 - vec2(0.6, 0.0);
    vec2 z = vec2(0.0);
    float n = 0.0;
    const float MAX = 96.0;
    for (int i = 0; i < 96; i++) {
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        if (dot(z, z) > 64.0) break;
        n += 1.0;
    }
    float m = n - log2(log2(dot(z, z))) + 4.0;
    float t = m / MAX;
    vec3 color = 0.5 + 0.5 * cos(6.2831 * t + vec3(0.0, 0.6, 1.0));
    if (n >= MAX) color = vec3(0.0);
    outColor = vec4(color, 1.0);
}
`,
};

const sphereRaw: ExampleShader = {
  id: "sphere-raw",
  pairId: "sphere",
  kind: "3D",
  compatibility: "raw-fragment-v1",
  name: "Sphere",
  description: "Raymarched sphere with diffuse + specular lighting. Drag to orbit.",
  source: `float sphereSdf(vec3 p, float r) { return length(p) - r; }

vec3 sphereNormal(vec3 p) {
    vec2 e = vec2(0.0015, 0.0);
    return normalize(vec3(
        sphereSdf(p + e.xyy, 1.0) - sphereSdf(p - e.xyy, 1.0),
        sphereSdf(p + e.yxy, 1.0) - sphereSdf(p - e.yxy, 1.0),
        sphereSdf(p + e.yyx, 1.0) - sphereSdf(p - e.yyx, 1.0)
    ));
}

void main() {
    vec2 uv = (v_uv - 0.5) * 2.0;
    uv.x *= iResolution.x / iResolution.y;
    float h = tan(iCameraFov * 0.5);
    vec3 ro = iCameraPosition;
    vec3 rd = normalize(iCameraForward + uv.x * h * iCameraRight + uv.y * h * iCameraUp);
    float t = 0.0;
    float hit = 0.0;
    vec3 p;
    for (int i = 0; i < 96; i++) {
        p = ro + rd * t;
        float d = sphereSdf(p, 1.0);
        if (d < 0.001) { hit = 1.0; break; }
        t += d;
        if (t > 50.0) break;
    }
    vec3 sky = mix(vec3(0.05, 0.07, 0.10), vec3(0.15, 0.20, 0.30), uv.y * 0.5 + 0.5);
    vec3 color = sky;
    if (hit > 0.5) {
        vec3 n = sphereNormal(p);
        vec3 l = normalize(vec3(0.6, 0.8, 0.4));
        float diff = max(dot(n, l), 0.0);
        float spec = pow(max(dot(reflect(-l, n), -rd), 0.0), 24.0);
        color = vec3(0.8, 0.55, 0.25) * (0.2 + diff) + vec3(1.0) * spec * 0.5;
    }
    outColor = vec4(color, 1.0);
}
`,
};

const torusRaw: ExampleShader = {
  id: "torus-raw",
  pairId: "torus",
  kind: "3D",
  compatibility: "raw-fragment-v1",
  name: "Torus",
  description: "Rotating torus with a directional light. Drag to orbit.",
  source: `float torusSdf(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}

mat3 rotY(float a) {
    return mat3(cos(a), 0.0, sin(a), 0.0, 1.0, 0.0, -sin(a), 0.0, cos(a));
}

float scene(vec3 p) {
    p = rotY(iTime * 0.4) * p;
    p.xy *= mat2(cos(0.5), -sin(0.5), sin(0.5), cos(0.5));
    return torusSdf(p, vec2(1.2, 0.35));
}

vec3 normalAt(vec3 p) {
    vec2 e = vec2(0.0015, 0.0);
    return normalize(vec3(
        scene(p + e.xyy) - scene(p - e.xyy),
        scene(p + e.yxy) - scene(p - e.yxy),
        scene(p + e.yyx) - scene(p - e.yyx)
    ));
}

void main() {
    vec2 uv = (v_uv - 0.5) * 2.0;
    uv.x *= iResolution.x / iResolution.y;
    float h = tan(iCameraFov * 0.5);
    vec3 ro = iCameraPosition;
    vec3 rd = normalize(iCameraForward + uv.x * h * iCameraRight + uv.y * h * iCameraUp);
    float t = 0.0;
    float hit = 0.0;
    vec3 p;
    for (int i = 0; i < 128; i++) {
        p = ro + rd * t;
        float d = scene(p);
        if (d < 0.001) { hit = 1.0; break; }
        t += d;
        if (t > 60.0) break;
    }
    vec3 sky = mix(vec3(0.04, 0.05, 0.07), vec3(0.12, 0.18, 0.28), uv.y * 0.5 + 0.5);
    vec3 color = sky;
    if (hit > 0.5) {
        vec3 n = normalAt(p);
        vec3 l = normalize(vec3(0.4, 0.7, 0.5));
        float diff = max(dot(n, l), 0.0);
        float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
        color = vec3(0.85, 0.6, 0.2) * (0.15 + diff * 0.9) + fres * vec3(0.4, 0.6, 1.0);
    }
    outColor = vec4(color, 1.0);
}
`,
};

const groundRaw: ExampleShader = {
  id: "ground-raw",
  pairId: "ground",
  kind: "3D",
  compatibility: "raw-fragment-v1",
  name: "Sphere on Ground",
  description: "Sphere casting a soft shadow on a checkerboard plane. Drag to orbit.",
  source: `float sphere(vec3 p, vec3 c, float r) { return length(p - c) - r; }
float plane(vec3 p) { return p.y + 1.0; }

float scene(vec3 p) {
    return min(sphere(p, vec3(0.0, 0.0, 0.0), 1.0), plane(p));
}

vec3 normalAt(vec3 p) {
    vec2 e = vec2(0.002, 0.0);
    return normalize(vec3(
        scene(p + e.xyy) - scene(p - e.xyy),
        scene(p + e.yxy) - scene(p - e.yxy),
        scene(p + e.yyx) - scene(p - e.yyx)
    ));
}

float softShadow(vec3 ro, vec3 rd) {
    float res = 1.0;
    float t = 0.02;
    for (int i = 0; i < 40; i++) {
        float d = scene(ro + rd * t);
        if (d < 0.001) return 0.0;
        res = min(res, 8.0 * d / t);
        t += d;
        if (t > 25.0) break;
    }
    return clamp(res, 0.0, 1.0);
}

void main() {
    vec2 uv = (v_uv - 0.5) * 2.0;
    uv.x *= iResolution.x / iResolution.y;
    float h = tan(iCameraFov * 0.5);
    vec3 ro = iCameraPosition;
    vec3 rd = normalize(iCameraForward + uv.x * h * iCameraRight + uv.y * h * iCameraUp);
    float t = 0.0;
    float hit = 0.0;
    vec3 p;
    for (int i = 0; i < 128; i++) {
        p = ro + rd * t;
        float d = scene(p);
        if (d < 0.001) { hit = 1.0; break; }
        t += d;
        if (t > 80.0) break;
    }
    vec3 sky = mix(vec3(0.4, 0.6, 0.8), vec3(0.1, 0.15, 0.25), max(rd.y, 0.0));
    vec3 color = sky;
    if (hit > 0.5) {
        vec3 n = normalAt(p);
        vec3 l = normalize(vec3(0.5, 0.8, 0.3));
        float diff = max(dot(n, l), 0.0);
        float shadow = softShadow(p + n * 0.002, l);
        bool onPlane = abs(p.y + 1.0) < 0.01;
        vec3 albedo = onPlane
            ? (mod(floor(p.x) + floor(p.z), 2.0) < 0.5 ? vec3(0.7) : vec3(0.3))
            : vec3(0.9, 0.5, 0.2);
        color = albedo * (0.2 + diff * shadow * 0.9);
    }
    outColor = vec4(color, 1.0);
}
`,
};

const fractalRaw: ExampleShader = {
  id: "fractal-raw",
  pairId: "fractal",
  kind: "3D",
  compatibility: "raw-fragment-v1",
  name: "Mandelbulb (lite)",
  description: "Cheap mandelbulb fractal with iteration-count shading. Drag to orbit.",
  source: `float fractalDe(vec3 p) {
    vec3 z = p;
    float dr = 1.0;
    float r = 0.0;
    const float power = 8.0;
    for (int i = 0; i < 6; i++) {
        r = length(z);
        if (r > 2.0) break;
        float theta = acos(z.z / r);
        float phi = atan(z.y, z.x);
        dr = pow(r, power - 1.0) * power * dr + 1.0;
        float zr = pow(r, power);
        theta *= power;
        phi *= power;
        z = zr * vec3(sin(theta) * cos(phi), sin(phi) * sin(theta), cos(theta)) + p;
    }
    return 0.5 * log(r) * r / dr;
}

void main() {
    vec2 uv = (v_uv - 0.5) * 2.0;
    uv.x *= iResolution.x / iResolution.y;
    float h = tan(iCameraFov * 0.5);
    vec3 ro = iCameraPosition;
    vec3 rd = normalize(iCameraForward + uv.x * h * iCameraRight + uv.y * h * iCameraUp);
    float t = 0.0;
    float steps = 0.0;
    bool hit = false;
    vec3 p;
    for (int i = 0; i < 120; i++) {
        p = ro + rd * t;
        float d = fractalDe(p);
        if (d < 0.0008) { hit = true; break; }
        t += d * 0.6;
        steps += 1.0;
        if (t > 30.0) break;
    }
    vec3 sky = mix(vec3(0.02, 0.03, 0.05), vec3(0.1, 0.12, 0.18), uv.y * 0.5 + 0.5);
    vec3 color = sky;
    if (hit) {
        float k = 1.0 - steps / 120.0;
        color = vec3(0.9, 0.6, 0.3) * k + vec3(0.1, 0.2, 0.5) * (1.0 - k);
    }
    outColor = vec4(color, 1.0);
}
`,
};

export const EXAMPLES: ExampleShader[] = [
  // Shadertoy
  gradientST,
  plasmaST,
  checkerST,
  mandelbrotST,
  sphereST,
  torusST,
  groundST,
  fractalST,
  // Raw GLSL
  gradientRaw,
  plasmaRaw,
  checkerRaw,
  mandelbrotRaw,
  sphereRaw,
  torusRaw,
  groundRaw,
  fractalRaw,
];

export function findExample(id: string): ExampleShader | undefined {
  return EXAMPLES.find((e) => e.id === id);
}

/// Find the partner example in the other compatibility mode that shares the
/// same `pairId`. Returns `undefined` when no partner exists for this pair —
/// in practice every built-in example is paired today, but custom additions
/// or one-off raw examples (e.g. a "Hello" intro that has no Shadertoy twin)
/// can choose not to define a pair.
export function findPartnerExample(
  example: ExampleShader,
  targetCompat: ShaderCompatibility,
): ExampleShader | undefined {
  return EXAMPLES.find(
    (e) => e.pairId === example.pairId && e.compatibility === targetCompat,
  );
}

/// The default example shown when a fresh `New Scene` is created in a given
/// compatibility mode. Both modes default to the "Gradient" pair.
export function defaultExampleFor(
  compat: ShaderCompatibility,
): ExampleShader {
  const match = EXAMPLES.find(
    (e) => e.pairId === "gradient" && e.compatibility === compat,
  );
  // Defensive: gradient/* always exists in EXAMPLES; we return the first
  // example matching `compat` if it somehow doesn't.
  return match ?? EXAMPLES.find((e) => e.compatibility === compat) ?? EXAMPLES[0];
}
