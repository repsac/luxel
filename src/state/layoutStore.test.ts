import { describe, expect, it } from "vitest";
import {
  defaultLayout,
  LAYOUT_PRESETS,
  maximizeSlot,
  reshapeSlots,
  restoreLayout,
} from "./layoutStore";
import { SHAPE_SLOT_COUNT } from "./sceneStore";

describe("layoutStore", () => {
  it("default layout assigns render/editor/console to the three slots", () => {
    const l = defaultLayout();
    expect(l.shape).toBe("twoTopOneBottom");
    expect(l.slots).toHaveLength(3);
    expect(l.slots[0].view).toBe("render");
    expect(l.slots[1].view).toBe("editor");
    expect(l.slots[2].view).toBe("console");
    expect(l.maximized).toBeNull();
  });

  it("maximize sets slot index", () => {
    const l = maximizeSlot(defaultLayout(), 0);
    expect(l.maximized).toBe(0);
  });

  it("maximize rejects out-of-range index", () => {
    const l = maximizeSlot(defaultLayout(), 99);
    expect(l.maximized).toBeNull();
  });

  it("restore clears maximized", () => {
    const l = restoreLayout(maximizeSlot(defaultLayout(), 2));
    expect(l.maximized).toBeNull();
  });

  it("layout serializes round-trip via JSON", () => {
    const l = maximizeSlot(defaultLayout(), 1);
    expect(JSON.parse(JSON.stringify(l))).toEqual(l);
  });

  it("includes every requested preset", () => {
    const ids = LAYOUT_PRESETS.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "balanced",
        "renderOnly",
        "oneLeftTwoRight",
        "twoLeftOneRight",
        "oneTopTwoBottom",
        "twoTopOneBottom",
        "threeAcross",
        "twoAcross",
      ]),
    );
  });

  it("every preset produces a slot list matching its shape's slot count", () => {
    for (const p of LAYOUT_PRESETS) {
      const l = p.build();
      expect(l.slots).toHaveLength(SHAPE_SLOT_COUNT[l.shape]);
    }
  });

  it("renderOnly preset is shape:single with one slot", () => {
    const r = LAYOUT_PRESETS.find((p) => p.id === "renderOnly")!.build();
    expect(r.shape).toBe("single");
    expect(r.slots).toHaveLength(1);
    expect(r.slots[0].view).toBe("render");
  });

  it("twoAcross preset hides the console (only 2 slots)", () => {
    const r = LAYOUT_PRESETS.find((p) => p.id === "twoAcross")!.build();
    expect(r.shape).toBe("twoAcross");
    expect(r.slots).toHaveLength(2);
  });

  describe("reshapeSlots", () => {
    it("returns the same list when count already matches", () => {
      const slots = [{ view: "render" as const }, { view: "editor" as const }];
      const r = reshapeSlots(slots, "twoAcross");
      expect(r).toBe(slots);
    });

    it("truncates when the target shape has fewer slots", () => {
      const slots = [
        { view: "render" as const },
        { view: "editor" as const },
        { view: "console" as const },
      ];
      const r = reshapeSlots(slots, "single");
      expect(r).toHaveLength(1);
      expect(r[0].view).toBe("render");
    });

    it("pads with empty slots when the target shape has more", () => {
      const slots = [{ view: "render" as const }];
      const r = reshapeSlots(slots, "threeAcross");
      expect(r).toHaveLength(3);
      expect(r[1].view).toBe("empty");
      expect(r[2].view).toBe("empty");
    });
  });
});
