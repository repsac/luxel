import type { LayoutState, SlotId, ViewId } from "./sceneStore";

export function defaultLayout(): LayoutState {
  return {
    slots: {
      topLeft: { view: "render", visible: true },
      topRight: { view: "editor", visible: true },
      bottom: { view: "console", visible: true },
    },
    sizes: { bottomFraction: 0.25, topLeftFraction: 0.55 },
    maximized: null,
  };
}

export function maximizeSlot(layout: LayoutState, slot: SlotId): LayoutState {
  return { ...layout, maximized: slot };
}

export function restoreLayout(layout: LayoutState): LayoutState {
  return { ...layout, maximized: null };
}

export type LayoutPresetId = "balanced" | "renderOnly" | "editorFocus" | "consoleFocus";

export interface LayoutPreset {
  id: LayoutPresetId;
  name: string;
  description: string;
  build: () => LayoutState;
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: "balanced",
    name: "Balanced",
    description: "Render + editor side-by-side, console below.",
    build: () => defaultLayout(),
  },
  {
    id: "renderOnly",
    name: "Render only",
    description: "Hide editor and console; render fills the screen.",
    build: () => ({
      slots: {
        topLeft: { view: "render", visible: true },
        topRight: { view: "editor", visible: false },
        bottom: { view: "console", visible: false },
      },
      sizes: { bottomFraction: 0.0, topLeftFraction: 1.0 },
      maximized: null,
    }),
  },
  {
    id: "editorFocus",
    name: "Editor focus",
    description: "Editor wide, render narrow, slim console.",
    build: () => ({
      slots: {
        topLeft: { view: "render", visible: true },
        topRight: { view: "editor", visible: true },
        bottom: { view: "console", visible: true },
      },
      sizes: { bottomFraction: 0.15, topLeftFraction: 0.35 },
      maximized: null,
    }),
  },
  {
    id: "consoleFocus",
    name: "Console focus",
    description: "Render + editor up top, large console below for debugging.",
    build: () => ({
      slots: {
        topLeft: { view: "render", visible: true },
        topRight: { view: "editor", visible: true },
        bottom: { view: "console", visible: true },
      },
      sizes: { bottomFraction: 0.5, topLeftFraction: 0.55 },
      maximized: null,
    }),
  },
];

export const VIEW_LABELS: Record<ViewId, string> = {
  render: "Render",
  editor: "Editor",
  console: "Console",
  empty: "Empty",
};
