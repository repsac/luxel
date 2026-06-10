import { useEffect, useState } from "react";
import type {
  LayoutShape,
  LayoutState,
  SlotState,
  ViewId,
} from "./sceneStore";
import { SHAPE_SLOT_COUNT } from "./sceneStore";

function slot(view: ViewId): SlotState {
  return { view };
}

export function defaultLayout(): LayoutState {
  return {
    shape: "twoTopOneBottom",
    slots: [slot("render"), slot("editor"), slot("console")],
    sizes: { primary: 0.75, secondary: 0.55 },
    maximized: null,
  };
}

export function maximizeSlot(layout: LayoutState, index: number): LayoutState {
  if (index < 0 || index >= layout.slots.length) return layout;
  return { ...layout, maximized: index };
}

export function restoreLayout(layout: LayoutState): LayoutState {
  return { ...layout, maximized: null };
}

/// Resize the slot list to match a new shape's slot count, preserving the
/// user's view assignments by index. Missing entries default to "empty".
export function reshapeSlots(slots: SlotState[], shape: LayoutShape): SlotState[] {
  const want = SHAPE_SLOT_COUNT[shape];
  if (slots.length === want) return slots;
  if (slots.length > want) return slots.slice(0, want);
  const padded = slots.slice();
  while (padded.length < want) padded.push(slot("empty"));
  return padded;
}

export type LayoutPresetId =
  | "balanced"
  | "renderOnly"
  | "oneLeftTwoRight"
  | "twoLeftOneRight"
  | "oneTopTwoBottom"
  | "twoTopOneBottom"
  | "threeAcross"
  | "twoAcross";

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
    description: "Render + editor across the top, console below.",
    build: () => ({
      shape: "twoTopOneBottom",
      slots: [slot("render"), slot("editor"), slot("console")],
      sizes: { primary: 0.75, secondary: 0.55 },
      maximized: null,
    }),
  },
  {
    id: "renderOnly",
    name: "Render only",
    description: "Single render panel fills the screen.",
    build: () => ({
      shape: "single",
      slots: [slot("render")],
      sizes: { primary: 1.0, secondary: 0.5 },
      maximized: null,
    }),
  },
  {
    id: "oneLeftTwoRight",
    name: "1 Left, 2 Right",
    description: "Render on the left; editor over console on the right.",
    build: () => ({
      shape: "oneLeftTwoRight",
      slots: [slot("render"), slot("editor"), slot("console")],
      sizes: { primary: 0.6, secondary: 0.65 },
      maximized: null,
    }),
  },
  {
    id: "twoLeftOneRight",
    name: "2 Left, 1 Right",
    description: "Editor over console on the left; render on the right.",
    build: () => ({
      shape: "twoLeftOneRight",
      slots: [slot("editor"), slot("console"), slot("render")],
      sizes: { primary: 0.4, secondary: 0.65 },
      maximized: null,
    }),
  },
  {
    id: "oneTopTwoBottom",
    name: "1 Top, 2 Bottom",
    description: "Render up top; editor + console split below.",
    build: () => ({
      shape: "oneTopTwoBottom",
      slots: [slot("render"), slot("editor"), slot("console")],
      sizes: { primary: 0.55, secondary: 0.55 },
      maximized: null,
    }),
  },
  {
    id: "twoTopOneBottom",
    name: "2 Top, 1 Bottom",
    description: "Render + editor on top, console below — the classic default.",
    build: () => ({
      shape: "twoTopOneBottom",
      slots: [slot("render"), slot("editor"), slot("console")],
      sizes: { primary: 0.75, secondary: 0.55 },
      maximized: null,
    }),
  },
  {
    id: "threeAcross",
    name: "3 Across",
    description: "Render, editor, and console side by side.",
    build: () => ({
      shape: "threeAcross",
      slots: [slot("render"), slot("editor"), slot("console")],
      sizes: { primary: 0.4, secondary: 0.5 },
      maximized: null,
    }),
  },
  {
    id: "twoAcross",
    name: "2 Across",
    description: "Render + editor only; console hidden until you bring it back.",
    build: () => ({
      shape: "twoAcross",
      slots: [slot("render"), slot("editor")],
      sizes: { primary: 0.55, secondary: 0.5 },
      maximized: null,
    }),
  },
];

export const VIEW_LABELS: Record<ViewId, string> = {
  render: "Render",
  editor: "Editor",
  console: "Console",
  inspector: "Inspector",
  empty: "Empty",
};

// ---------- Custom layout persistence ----------

const CUSTOM_KEY = "luxel.customLayouts";

export interface CustomLayout {
  id: string;
  name: string;
  layout: LayoutState;
}

function readCustomLayouts(): CustomLayout[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is CustomLayout =>
        entry && typeof entry === "object" && typeof entry.id === "string" &&
        typeof entry.name === "string" && entry.layout,
    );
  } catch {
    return [];
  }
}

function writeCustomLayouts(list: CustomLayout[]): void {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  } catch {
    // Storage may be unavailable in private modes — silently skip.
  }
}

/// Persist a snapshot of the current layout under a user-chosen name.
export function saveCustomLayout(name: string, layout: LayoutState): CustomLayout {
  const existing = readCustomLayouts();
  const id = `custom-${Date.now().toString(36)}`;
  const entry: CustomLayout = { id, name, layout };
  writeCustomLayouts([...existing, entry]);
  return entry;
}

export function deleteCustomLayout(id: string): void {
  writeCustomLayouts(readCustomLayouts().filter((c) => c.id !== id));
}

export function listCustomLayouts(): CustomLayout[] {
  return readCustomLayouts();
}

/// React hook variant so components automatically re-render when customs
/// change. We also listen to the `storage` event so other windows / dev-tools
/// changes propagate.
export function useCustomLayouts(): {
  list: CustomLayout[];
  save: (name: string, layout: LayoutState) => CustomLayout;
  remove: (id: string) => void;
} {
  const [list, setList] = useState<CustomLayout[]>(() => readCustomLayouts());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CUSTOM_KEY) setList(readCustomLayouts());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return {
    list,
    save: (name, layout) => {
      const entry = saveCustomLayout(name, layout);
      setList(readCustomLayouts());
      return entry;
    },
    remove: (id) => {
      deleteCustomLayout(id);
      setList(readCustomLayouts());
    },
  };
}
