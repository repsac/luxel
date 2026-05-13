# Video 1 — Introducing Luxel

> A local, developer-focused GLSL shader workbench.

Estimated runtime: 5–7 minutes.

---

## Cold open (0:00 – 0:15)

**Visual:** Luxel running fullscreen, the Mandelbulb example animating gently as the camera orbits. Title card overlay: *"Luxel — a local GLSL shader workbench."*

**Narration:**
> Today I want to show you a little tool I've been building called Luxel. It's a desktop app for writing GLSL shaders — basically a local, offline version of Shadertoy with some extras for navigating 3D scenes. But before we get into the app, let's talk about what GLSL actually is, because that's the whole thing this tool exists to edit.

---

## What is GLSL? (0:15 – 1:30)

**Visual:** Static slide / on-screen text reveals the bullets one at a time. Cut occasionally to Shadertoy.com browsing, the Blender viewport, a Unity game, a WebGL demo — concrete examples of GLSL or shader-language code in use.

**Narration:**
> GLSL stands for **OpenGL Shading Language**. It's a small, C-like programming language — but unlike most languages, it doesn't run on your CPU. It runs on your GPU.

> That distinction matters because a GLSL program — which we call a **shader** — doesn't just run once. It runs *per pixel*, or *per vertex*, hundreds of thousands of times in parallel, every single frame. That's how a modern GPU paints a screen full of pixels in milliseconds.

> GLSL was created by the Khronos Group as part of OpenGL, and today it's everywhere in real-time graphics. Game engines use it — Unity, Unreal, Godot. The web uses it through WebGL and WebGPU. Creative-coding tools like Shadertoy and TouchDesigner are built around it. Even Blender's EEVEE viewport renderer is, at heart, a giant collection of GLSL shaders.

> There are a few main flavors of shader you'll run into:
>
> - **Vertex shaders** run once per triangle corner. They decide where geometry lands on screen.
> - **Fragment shaders** — sometimes called *pixel shaders* — run once per output pixel. They decide what color that pixel should be.
> - **Compute shaders** run on arbitrary grids of work. They're used for simulations, image processing, and general-purpose GPU programming.

> Luxel — and Shadertoy, where most people first encounter shader programming — focuses on **fragment shaders**, because a single fragment shader is surprisingly powerful. With a technique called *raymarching*, one fragment shader can produce entire 3D scenes — geometry, lighting, shadows, materials — without any triangles at all. That's what makes shader art so fascinating: a few hundred lines of math, no 3D model, full scene.

**On-screen text recap (lower-third or full-screen):**
- GLSL = **OpenGL Shading Language**
- A *shader* = a program that runs on the GPU
- Runs **per pixel** (fragment) or **per vertex**, massively in parallel
- Used in: games, web (WebGL/WebGPU), Shadertoy, Blender, etc.
- Luxel focuses on **fragment shaders**

---

## Why Luxel? (1:30 – 2:30)

**Visual:** Split screen — Shadertoy.com on the left, Luxel on the right. Highlight the differences: local file, real save/load, debug console, multiple panels.

**Narration:**
> If you've used Shadertoy, you already know most of what Luxel does — but with a few key differences:
>
> - **It's local.** Your shaders live on your filesystem as `.luxel.json` files. No account, no internet required, no fear of a website going down with five years of your work on it.
> - **It runs natively** via Tauri + wgpu, so it's not boxed into a browser tab.
> - **It has a real debug console** that surfaces shader-compile errors with line numbers, not just a vague red glow on the screen.
> - **It has a navigable 3D camera** with orbit, pan, dolly, bookmarks, and frustum overlays — which most shader playgrounds don't.
> - **It has a customizable layout** with resizable panels and presets, so you can set it up to suit your workflow.

---

## Quick tour (2:30 – 5:00)

**Visual:** Live walkthrough of the app — toolbar, render panel, editor, console, status line. Hit each control briefly.

**Narration:**
> Let me give you a quick tour. Up top is the toolbar with **New**, **Open**, **Save**, an **Examples** dropdown of built-in shaders, the **Render** button, **Export PNG**, an **FPS** overlay toggle, a **Quality** multiplier for the preview render, and a few iTime controls.
>
> On the left is the **render viewport**, where you can drag to orbit, scroll to dolly, shift-drag to pan, and press `F` to reset. There's also an aspect-ratio guide overlay and a camera bookmark menu.
>
> On the right is the **GLSL editor** with syntax highlighting, error squigglies fed from the actual shader compiler, and zoom controls — Cmd-plus and Cmd-minus work the way you'd expect.
>
> At the bottom is the **debug console** — every shader compile, every render, every error shows up here with a timestamp.
>
> And underneath everything is the **status line** — CPU, memory, GPU adapter, render size, last frame time, and whether the scene is dirty or saved.

---

## Examples to play with (5:00 – 6:00)

**Visual:** Open the Examples dropdown, load Plasma, then Mandelbulb, then Sphere on Ground. Drag the camera in each.

**Narration:**
> Luxel ships with eight built-in examples — four 2D shaders and four 3D ones. The 2D ones — Gradient, Plasma, Checkerboard, Mandelbrot — are pure pixel math, no camera involved. The 3D ones — Sphere, Torus, Sphere on Ground, and a lightweight Mandelbulb — use Luxel's camera uniforms so you can actually navigate around them.
>
> The 3D ones are great starting points if you want to learn raymarching; the 2D ones are great for understanding how a fragment shader produces an image from nothing but a pixel coordinate.

---

## Wrap (6:00 – end)

**Visual:** Repo page or GitHub link, brief outro card.

**Narration:**
> Luxel is open source — the link's in the description. In the next video I'll walk through writing a shader from scratch in Luxel, so subscribe if you want to follow along. Thanks for watching.
