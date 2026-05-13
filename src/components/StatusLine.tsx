import { useEffect, useState } from "react";
import { useAppStore } from "../state/appStore";
import { useSceneStore } from "../state/sceneStore";
import { invoke } from "../tauri/commands";

interface SystemStatus {
  cpu: { usage_percent: number; logical_cores: number | null };
  memory: { used_bytes: number; total_bytes: number };
  gpu: {
    name?: string;
    vendor?: string;
    backend?: string;
    deviceType?: string;
    driver?: string;
  };
}

const fmtMB = (b: number) => `${Math.round(b / (1024 * 1024))} MB`;

export default function StatusLine() {
  const file = useSceneStore((s) => s.file);
  const dirty = useSceneStore((s) => s.dirty);
  const status = useAppStore((s) => s.shaderStatus);
  const lastMs = useAppStore((s) => s.lastRender?.totalMs ?? null);
  const [sys, setSys] = useState<SystemStatus | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = (await invoke("get_system_status")) as SystemStatus;
        if (!cancelled) setSys(s);
      } catch {
        // Browser fallback: do nothing.
      }
      timer = window.setTimeout(tick, 1500);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const rs = file?.scene.renderSettings;
  return (
    <div className="status-line">
      <span>CPU {sys ? sys.cpu.usage_percent.toFixed(0) : "--"}%</span>
      <span>
        MEM{" "}
        {sys
          ? `${fmtMB(sys.memory.used_bytes)} / ${fmtMB(sys.memory.total_bytes)}`
          : "--"}
      </span>
      <span>GPU {sys?.gpu.name ?? "Unknown"}</span>
      <span>{sys?.gpu.backend ?? ""}</span>
      <span className="spacer" />
      <span>
        {rs ? `${rs.width}×${rs.height}` : "--"} • {rs?.aspectRatio ?? "--"}
      </span>
      <span>Shader: {status}</span>
      <span>{lastMs != null ? `Last ${lastMs} ms` : ""}</span>
      <span>{dirty ? "● Dirty" : "○ Saved"}</span>
    </div>
  );
}
