import { describe, expect, it } from "vitest";
import {
  EXAMPLES,
  defaultExampleFor,
  findExample,
  findPartnerExample,
  type ExampleShader,
} from "./examples";

describe("EXAMPLES library", () => {
  it("has at least one example for each compatibility mode", () => {
    const shadertoy = EXAMPLES.filter(
      (e) => e.compatibility === "shadertoy-fragment-v1",
    );
    const raw = EXAMPLES.filter((e) => e.compatibility === "raw-fragment-v1");
    expect(shadertoy.length).toBeGreaterThan(0);
    expect(raw.length).toBeGreaterThan(0);
  });

  it("ids are unique", () => {
    const ids = EXAMPLES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every example has a pairId, and every pairId has exactly one example per compatibility", () => {
    // Both halves of this matter: the dropdown's compatibility filter relies
    // on per-mode coverage, and the compatibility picker's auto-swap relies
    // on each side having exactly one partner.
    const seen: Record<string, Record<ExampleShader["compatibility"], number>> = {};
    for (const ex of EXAMPLES) {
      expect(ex.pairId, `example ${ex.id} is missing pairId`).toBeTruthy();
      const slot = seen[ex.pairId] ?? {
        "shadertoy-fragment-v1": 0,
        "raw-fragment-v1": 0,
      };
      slot[ex.compatibility]++;
      seen[ex.pairId] = slot;
    }
    for (const [pairId, counts] of Object.entries(seen)) {
      expect(
        counts["shadertoy-fragment-v1"],
        `pair ${pairId} missing or duplicated Shadertoy entry`,
      ).toBe(1);
      expect(
        counts["raw-fragment-v1"],
        `pair ${pairId} missing or duplicated raw entry`,
      ).toBe(1);
    }
  });

  it("Shadertoy examples reference mainImage, raw examples reference outColor + main()", () => {
    for (const ex of EXAMPLES) {
      if (ex.compatibility === "shadertoy-fragment-v1") {
        expect(
          ex.source.includes("void mainImage("),
          `Shadertoy example ${ex.id} must declare mainImage`,
        ).toBe(true);
      } else {
        expect(
          ex.source.includes("void main()"),
          `raw example ${ex.id} must declare main()`,
        ).toBe(true);
        expect(
          ex.source.includes("outColor"),
          `raw example ${ex.id} must assign to outColor`,
        ).toBe(true);
      }
    }
  });
});

describe("findExample", () => {
  it("returns the example by id", () => {
    const ex = findExample("gradient-raw");
    expect(ex).toBeDefined();
    expect(ex?.compatibility).toBe("raw-fragment-v1");
    expect(ex?.pairId).toBe("gradient");
  });

  it("returns undefined for unknown ids", () => {
    expect(findExample("does-not-exist")).toBeUndefined();
  });
});

describe("findPartnerExample", () => {
  it("returns the matching example in the other mode", () => {
    const rawGradient = findExample("gradient-raw")!;
    const partner = findPartnerExample(rawGradient, "shadertoy-fragment-v1");
    expect(partner).toBeDefined();
    expect(partner?.pairId).toBe("gradient");
    expect(partner?.compatibility).toBe("shadertoy-fragment-v1");
    expect(partner?.id).not.toBe(rawGradient.id);
  });

  it("returns the same example when asked for the same compatibility", () => {
    // Edge case: the lookup is keyed by (pairId, targetCompat). Asking for
    // the example's own compatibility yields itself, which is fine — the
    // ShaderEditor's switchCompatibility helper guards against this case
    // before it reaches us by checking `target === currentCompat`.
    const ex = findExample("plasma-raw")!;
    const partner = findPartnerExample(ex, "raw-fragment-v1");
    expect(partner?.id).toBe(ex.id);
  });
});

describe("defaultExampleFor", () => {
  it("returns the gradient for raw mode", () => {
    const ex = defaultExampleFor("raw-fragment-v1");
    expect(ex.compatibility).toBe("raw-fragment-v1");
    expect(ex.pairId).toBe("gradient");
  });

  it("returns the gradient for Shadertoy mode", () => {
    const ex = defaultExampleFor("shadertoy-fragment-v1");
    expect(ex.compatibility).toBe("shadertoy-fragment-v1");
    expect(ex.pairId).toBe("gradient");
  });
});
