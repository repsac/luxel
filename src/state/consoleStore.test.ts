import { describe, it, expect, beforeEach } from "vitest";
import { useConsoleStore, visibleEvents } from "./consoleStore";

beforeEach(() => {
  useConsoleStore.setState({
    events: [],
    filterLevel: { debug: true, info: true, warn: true, error: true },
  });
});

describe("consoleStore", () => {
  it("appends events", () => {
    useConsoleStore.getState().append({
      timestamp: "2026-05-11T00:00:00Z",
      level: "info",
      source: "app",
      message: "hi",
    });
    expect(useConsoleStore.getState().events).toHaveLength(1);
  });

  it("caps at 1000 events", () => {
    const append = useConsoleStore.getState().append;
    for (let i = 0; i < 1200; i++) {
      append({
        timestamp: String(i),
        level: "info",
        source: "app",
        message: String(i),
      });
    }
    expect(useConsoleStore.getState().events.length).toBeLessThanOrEqual(1000);
  });

  it("filters by level", () => {
    const append = useConsoleStore.getState().append;
    append({ timestamp: "", level: "info", source: "app", message: "i" });
    append({ timestamp: "", level: "error", source: "app", message: "e" });
    const { events, filterLevel } = useConsoleStore.getState();
    expect(visibleEvents(events, filterLevel)).toHaveLength(2);
    const filtered = visibleEvents(events, { ...filterLevel, info: false });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].level).toBe("error");
  });

  it("clears events", () => {
    useConsoleStore.getState().append({
      timestamp: "",
      level: "info",
      source: "app",
      message: "x",
    });
    useConsoleStore.getState().clear();
    expect(useConsoleStore.getState().events).toHaveLength(0);
  });
});
