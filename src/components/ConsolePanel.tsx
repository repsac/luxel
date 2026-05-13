import { useConsoleStore, visibleEvents } from "../state/consoleStore";
import type { LogLevel } from "../state/consoleStore";

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

export default function ConsolePanel() {
  const events = useConsoleStore((s) => s.events);
  const filter = useConsoleStore((s) => s.filterLevel);
  const clear = useConsoleStore((s) => s.clear);
  const setFilter = useConsoleStore((s) => s.setFilter);
  const list = visibleEvents(events, filter);

  return (
    <section className="panel console-panel">
      <header>
        <span>Console</span>
        <div className="filters">
          {LEVELS.map((lvl) => (
            <label key={lvl}>
              <input
                type="checkbox"
                checked={filter[lvl]}
                onChange={(e) => setFilter(lvl, e.target.checked)}
              />
              {lvl}
            </label>
          ))}
        </div>
        <button onClick={clear}>Clear</button>
      </header>
      <ol className="console-list">
        {list.map((e, i) => (
          <li key={i} className={`level-${e.level}`}>
            <time>{e.timestamp.slice(11, 19)}</time>
            <span className="src">[{e.source}]</span>
            <span className="msg">{e.message}</span>
            {e.line != null && (
              <span className="loc">
                line {e.line}
                {e.column != null ? `:${e.column}` : ""}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
