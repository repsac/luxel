import { describe, expect, it } from "vitest";
import {
  defaultLayout,
  LAYOUT_PRESETS,
  maximizeSlot,
  restoreLayout,
} from "./layoutStore";

describe("layoutStore", () => {
  it("default layout has render/editor/console assigned to slots", () => {
    const l = defaultLayout();
    expect(l.slots.topLeft.view).toBe("render");
    expect(l.slots.topRight.view).toBe("editor");
    expect(l.slots.bottom.view).toBe("console");
    expect(l.maximized).toBeNull();
  });

  it("maximize sets maximized slot", () => {
    const l = maximizeSlot(defaultLayout(), "topLeft");
    expect(l.maximized).toBe("topLeft");
  });

  it("restore clears maximized", () => {
    const l = restoreLayout(maximizeSlot(defaultLayout(), "bottom"));
    expect(l.maximized).toBeNull();
  });

  it("layout serializes round-trip via JSON", () => {
    const l = maximizeSlot(defaultLayout(), "topRight");
    expect(JSON.parse(JSON.stringify(l))).toEqual(l);
  });

  it("presets include the expected variants", () => {
    const ids = LAYOUT_PRESETS.map((p) => p.id).sort();
    expect(ids).toEqual(["balanced", "consoleFocus", "editorFocus", "renderOnly"].sort());
  });

  it("renderOnly preset hides editor and console", () => {
    const r = LAYOUT_PRESETS.find((p) => p.id === "renderOnly")!.build();
    expect(r.slots.topLeft.visible).toBe(true);
    expect(r.slots.topRight.visible).toBe(false);
    expect(r.slots.bottom.visible).toBe(false);
  });

  it("editorFocus preset enlarges editor relative to render", () => {
    const r = LAYOUT_PRESETS.find((p) => p.id === "editorFocus")!.build();
    expect(r.sizes.topLeftFraction).toBeLessThan(0.5);
  });
});
