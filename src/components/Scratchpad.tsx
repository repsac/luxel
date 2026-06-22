import { useEffect, useRef, useState } from "react";
import { fontSizeForView, useAppStore } from "../state/appStore";
import { useSceneStore } from "../state/sceneStore";
import { evalExpression } from "../actions/eval";
import {
  buildPreamble,
  colorOf,
  enrichError,
  formatEvalResult,
  isColorResult,
  parseAssignment,
  parseMeta,
  type ScratchVar,
} from "./scratchpadFormat";
import { builtinsSummary, findBuiltin, isReservedName } from "../glsl/builtins";
import {
  applySuggestion,
  completionContextAt,
  suggestionsFor,
  type Suggestion,
} from "./scratchpadComplete";
import { formatError } from "../tauri/commands";

interface Entry {
  id: number;
  expr: string;
  value?: string;
  typeName?: string;
  color?: string | null;
  error?: string;
  note?: string;
}

/// A GLSL "REPL": type an expression, see its value at the pinned pixel. The
/// GLSL answer to print-debugging. Uniforms are prefilled from the scene (the
/// pixel comes from the shared pinned pixel, so it lines up with the Inspector
/// and crosshair) and iTime is overridable in the header.
export default function Scratchpad() {
  const file = useSceneStore((s) => s.file);
  const pinnedPixel = useAppStore((s) => s.pinnedPixel);
  const setPinnedPixel = useAppStore((s) => s.setPinnedPixel);
  const fontSize = useAppStore((s) => fontSizeForView(s.viewFontSizes, "scratchpad"));

  const [entries, setEntries] = useState<Entry[]>([]);
  const [vars, setVars] = useState<ScratchVar[]>([]);
  const [input, setInput] = useState("");
  const [timeText, setTimeText] = useState("");
  const historyRef = useRef<string[]>([]);
  const histIdxRef = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const idRef = useRef(0);

  // Autocomplete dropdown state.
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selIndex, setSelIndex] = useState(0);
  const completeOpen = suggestions.length > 0;

  // Keep the newest line in view as results come in.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [entries]);

  if (!file) return null;
  const t = file.scene.timeline;
  const sceneTime = t.targetFps > 0 ? t.currentFrame / t.targetFps : 0;

  const push = (e: Omit<Entry, "id">) =>
    setEntries((prev) => [...prev, { id: idRef.current++, ...e }]);

  const setPinX = (v: string) => {
    const x = parseInt(v, 10);
    if (Number.isNaN(x)) return;
    setPinnedPixel({ x, y: pinnedPixel?.y ?? 0 });
  };
  const setPinY = (v: string) => {
    const y = parseInt(v, 10);
    if (Number.isNaN(y)) return;
    setPinnedPixel({ x: pinnedPixel?.x ?? 0, y });
  };

  function timeOverride(): number | undefined {
    const override = timeText.trim() === "" ? undefined : Number(timeText);
    return override !== undefined && Number.isFinite(override) ? override : undefined;
  }

  const varSizes = () =>
    Object.fromEntries(vars.map((v) => [v.name, v.result.count]));

  /// Recompute the dropdown from the input text and cursor. Suppresses the
  /// list when the only match is exactly what's already typed.
  function refreshSuggestions(text: string, cursor: number) {
    const ctx = completionContextAt(text, cursor);
    if (!ctx) {
      setSuggestions([]);
      return;
    }
    const next = suggestionsFor(ctx, varSizes());
    if (next.length === 1 && next[0].label === ctx.token) {
      setSuggestions([]);
      return;
    }
    setSuggestions(next);
    setSelIndex(0);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    setInput(text);
    refreshSuggestions(text, e.target.selectionStart ?? text.length);
  }

  function accept(suggestion: Suggestion) {
    const el = inputRef.current;
    const cursor = el?.selectionStart ?? input.length;
    const ctx = completionContextAt(input, cursor);
    if (!ctx) return;
    const { text, cursor: nextCursor } = applySuggestion(input, ctx, suggestion, cursor);
    setInput(text);
    setSuggestions([]);
    // Restore focus + caret and re-offer (e.g. swizzle after a constructor).
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(nextCursor, nextCursor);
      refreshSuggestions(text, nextCursor);
    });
  }

  async function submit() {
    const line = input.trim();
    if (!line) return;
    historyRef.current.push(line);
    histIdxRef.current = historyRef.current.length;
    setInput("");
    setSuggestions([]);

    const meta = parseMeta(line);
    if (meta) {
      runMeta(meta, line);
      return;
    }

    // Assignment: `name = expr` snapshots the value for reuse on later lines.
    const assign = parseAssignment(line);
    const preamble = buildPreamble(vars);
    const time = timeOverride();
    if (assign) {
      if (isReservedName(assign.name)) {
        push({ expr: line, error: `'${assign.name}' is a built-in; pick another name.` });
        return;
      }
      try {
        const res = await evalExpression(assign.rhs, { time, preamble });
        setVars((prev) => {
          const next = prev.filter((v) => v.name !== assign.name);
          next.push({ name: assign.name, result: res });
          return next;
        });
        push({
          expr: line,
          value: `${assign.name} = ${formatEvalResult(res)}`,
          typeName: res.typeName,
          color: isColorResult(res) ? colorOf(res) : null,
        });
      } catch (e) {
        push({ expr: line, error: enrichError(formatError(e)) });
      }
      return;
    }

    try {
      const res = await evalExpression(line, { time, preamble });
      push({
        expr: line,
        value: formatEvalResult(res),
        typeName: res.typeName,
        color: isColorResult(res) ? colorOf(res) : null,
      });
    } catch (e) {
      push({ expr: line, error: enrichError(formatError(e)) });
    }
  }

  function runMeta(meta: ReturnType<typeof parseMeta>, line: string) {
    if (!meta) return;
    switch (meta.kind) {
      case "clear":
        setEntries([]);
        return;
      case "reset":
        setVars([]);
        push({ expr: line, note: "variables cleared" });
        return;
      case "vars":
        push({
          expr: line,
          note:
            vars.length === 0
              ? "no variables yet — assign one with e.g. a = vec2(3.0, 4.0)"
              : vars.map((v) => `${v.name} = ${formatEvalResult(v.result)}`).join("\n"),
        });
        return;
      case "builtins":
        push({ expr: line, note: builtinsSummary() });
        return;
      case "help": {
        if (meta.arg) {
          const b = findBuiltin(meta.arg);
          push({
            expr: line,
            note: b ? `${b.signature}\n  ${b.summary}` : `no help for '${meta.arg}'`,
          });
        } else {
          push({
            expr: line,
            note:
              "Type a GLSL expression to see its value at the pinned pixel.\n" +
              "  a = <expr>   store a variable for reuse\n" +
              "  :builtins    list available functions and uniforms\n" +
              "  :help <name> show a built-in's signature (e.g. :help mix)\n" +
              "  :vars        list your variables\n" +
              "  :reset       clear variables\n" +
              "  :clear       clear the scrollback",
          });
        }
        return;
      }
      default:
        push({ expr: line, note: `unknown command: ${line}` });
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // While the completion dropdown is open it owns Tab/Esc and the arrows.
    if (completeOpen) {
      if (e.key === "Tab" || (e.key === "Enter" && e.shiftKey)) {
        e.preventDefault();
        accept(suggestions[selIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSuggestions([]);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelIndex((i) => (i + 1) % suggestions.length);
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
      return;
    }
    const hist = historyRef.current;
    if (e.key === "ArrowUp") {
      if (hist.length === 0) return;
      e.preventDefault();
      histIdxRef.current = Math.max(0, histIdxRef.current - 1);
      setInput(hist[histIdxRef.current]);
    } else if (e.key === "ArrowDown") {
      if (hist.length === 0) return;
      e.preventDefault();
      if (histIdxRef.current >= hist.length - 1) {
        histIdxRef.current = hist.length;
        setInput("");
      } else {
        histIdxRef.current += 1;
        setInput(hist[histIdxRef.current]);
      }
    }
  }

  return (
    <section className="panel scratchpad-panel">
      <header>
        <span>Scratchpad</span>
        <span className="scratchpad-header-field">
          <label>Pixel</label>
          <input
            type="number"
            value={pinnedPixel?.x ?? ""}
            onChange={(e) => setPinX(e.target.value)}
            placeholder="x"
            aria-label="Pixel X"
          />
          <input
            type="number"
            value={pinnedPixel?.y ?? ""}
            onChange={(e) => setPinY(e.target.value)}
            placeholder="y"
            aria-label="Pixel Y"
          />
        </span>
        <span className="scratchpad-header-field">
          <label>iTime</label>
          <input
            type="number"
            className="sp-time-input"
            value={timeText}
            onChange={(e) => setTimeText(e.target.value)}
            placeholder={sceneTime.toFixed(3)}
            aria-label="iTime override"
          />
        </span>
      </header>

      <div className="scratchpad-list" ref={listRef} style={{ fontSize: `${fontSize}px` }}>
        {entries.length === 0 && (
          <div className="scratchpad-empty">
            Type a GLSL expression to see its value at the pinned pixel. Try{" "}
            <code>length(vec2(3.0, 4.0))</code> or{" "}
            <code>(gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y</code>.
            Store values with <code>a = vec2(3.0, 4.0)</code>; type{" "}
            <code>:help</code> for more.
          </div>
        )}
        {entries.map((e) => (
          <div className="scratchpad-entry" key={e.id}>
            <div className="sp-expr">
              <span className="sp-prompt">&gt;</span> {e.expr}
            </div>
            {e.error != null && <div className="sp-error">{e.error}</div>}
            {e.note != null && <div className="sp-note">{e.note}</div>}
            {e.value != null && (
              <div className="sp-result">
                {e.color && (
                  <span className="sp-swatch" style={{ background: e.color }} />
                )}
                <span className="sp-value">{e.value}</span>
                {e.typeName && <span className="sp-type">{e.typeName}</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="scratchpad-input-row">
        <span className="sp-prompt">&gt;</span>
        <input
          ref={inputRef}
          className="scratchpad-input"
          value={input}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          onBlur={() => setSuggestions([])}
          placeholder="GLSL expression… (Tab to complete)"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          style={{ fontSize: `${fontSize}px` }}
        />
        {completeOpen && (
          <ul className="scratchpad-complete" role="listbox">
            {suggestions.map((s, i) => (
              <li
                key={s.label}
                role="option"
                aria-selected={i === selIndex}
                className={i === selIndex ? "selected" : ""}
                // mousedown (not click) so it fires before the input's blur.
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  accept(s);
                }}
              >
                <span className="sc-label">{s.label}</span>
                <span className="sc-detail">{s.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
