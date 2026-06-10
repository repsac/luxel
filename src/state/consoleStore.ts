import { create } from "zustand";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogSource = "app" | "renderer" | "shader" | "system" | "scene";

export interface ConsoleEvent {
  timestamp: string;
  level: LogLevel;
  source: LogSource;
  message: string;
  details?: string;
  file?: string;
  line?: number;
  column?: number;
}

interface ConsoleState {
  events: ConsoleEvent[];
  filterLevel: Record<LogLevel, boolean>;
  append: (event: ConsoleEvent) => void;
  clear: () => void;
  setFilter: (level: LogLevel, enabled: boolean) => void;
}

export const useConsoleStore = create<ConsoleState>((set) => ({
  events: [],
  filterLevel: { debug: true, info: true, warn: true, error: true },
  append: (event) =>
    set((s) => ({
      events: [...s.events.slice(-999), event],
    })),
  clear: () => set({ events: [] }),
  setFilter: (level, enabled) =>
    set((s) => ({ filterLevel: { ...s.filterLevel, [level]: enabled } })),
}));

export function visibleEvents(
  events: ConsoleEvent[],
  filter: Record<LogLevel, boolean>,
): ConsoleEvent[] {
  return events.filter((e) => filter[e.level]);
}
