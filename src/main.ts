import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

type WorkState = "idle" | "thinking" | "tool" | "output" | "waiting" | "done" | "unknown";

interface ActivitySnapshot {
  state: WorkState;
  label: string;
  source: string;
  updatedAt?: number;
}

interface CreditSnapshot {
  ok: boolean;
  left?: number;
  total?: number;
  used?: number;
  percent?: number;
  plan?: string;
  updatedAt?: number;
  source?: string;
  error?: string;
}

interface PluginStatus {
  hostInstalled: boolean;
  pluginConfigured: boolean;
  marketplaceAvailable: boolean;
  restartRequired: boolean;
  message: string;
}

interface Snapshot {
  activity: ActivitySnapshot;
  credits: CreditSnapshot;
  plugin: PluginStatus;
}

const stage = document.querySelector<HTMLElement>("#pet-stage")!;
const panel = document.querySelector<HTMLElement>("#credit-panel")!;
const petCard = document.querySelector<HTMLElement>("#pet-card")!;
const stateBadge = document.querySelector<HTMLElement>("#state-badge")!;
const statusText = document.querySelector<HTMLElement>("#status-text")!;
const creditLeft = document.querySelector<HTMLElement>("#credit-left")!;
const creditProgress = document.querySelector<HTMLElement>("#credit-progress")!;
const metricLeft = document.querySelector<HTMLElement>("#metric-left")!;
const metricPercent = document.querySelector<HTMLElement>("#metric-percent")!;
const metricTotal = document.querySelector<HTMLElement>("#metric-total")!;
const metricState = document.querySelector<HTMLElement>("#metric-state")!;
const metricPlan = document.querySelector<HTMLElement>("#metric-plan")!;
const metricUpdated = document.querySelector<HTMLElement>("#metric-updated")!;
const setupRow = document.querySelector<HTMLElement>("#setup-row")!;
const setupMessage = document.querySelector<HTMLElement>("#setup-message")!;
const installPlugin = document.querySelector<HTMLButtonElement>("#install-plugin")!;

const windowRef = getCurrentWindow();
let latestSnapshot: Snapshot | null = null;

function fmtNumber(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "--";
  if (Math.abs(value) >= 100) return Math.round(value).toString();
  return value.toFixed(1).replace(/\.0$/, "");
}

function fmtPercent(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "--";
  return `${Math.round(value)}%`;
}

function fmtTime(epochSeconds?: number): string {
  if (!epochSeconds) return "--";
  return new Date(epochSeconds * 1000).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function stateMeta(state: WorkState): { label: string; icon: string; className: string } {
  switch (state) {
    case "thinking":
      return { label: "思考中", icon: "🧠", className: "thinking" };
    case "tool":
      return { label: "调工具", icon: "🛠", className: "tool" };
    case "output":
      return { label: "输出中", icon: "✍", className: "output" };
    case "waiting":
      return { label: "待确认", icon: "!", className: "waiting" };
    case "done":
      return { label: "已完成", icon: "✓", className: "done" };
    case "unknown":
      return { label: "等待事件", icon: "?", className: "unknown" };
    case "idle":
    default:
      return { label: "待命", icon: "Zz", className: "idle" };
  }
}

function applySnapshot(snapshot: Snapshot) {
  latestSnapshot = snapshot;
  const meta = stateMeta(snapshot.activity.state);
  stage.dataset.state = meta.className;
  statusText.textContent = meta.label;
  stateBadge.textContent = meta.icon;
  metricState.textContent = meta.label;

  const credits = snapshot.credits;
  creditLeft.textContent = fmtNumber(credits.left);
  metricLeft.textContent = fmtNumber(credits.left);
  metricTotal.textContent = fmtNumber(credits.total);
  metricPercent.textContent = fmtPercent(credits.percent);
  metricPlan.textContent = credits.plan || "--";
  metricUpdated.textContent = fmtTime(credits.updatedAt);
  creditProgress.style.width = `${Math.max(0, Math.min(100, credits.percent ?? 0))}%`;

  setupRow.hidden = snapshot.plugin.pluginConfigured;
  setupMessage.textContent = snapshot.plugin.message;
}

async function refreshSnapshot() {
  try {
    const snapshot = await invoke<Snapshot>("workbuddy_snapshot");
    applySnapshot(snapshot);
  } catch (error) {
    console.error(error);
  }
}

function reportHitRect() {
  const bodyRect = document.body.getBoundingClientRect();
  const rects = [petCard.getBoundingClientRect()];
  if (panel.matches(":hover") || petCard.matches(":hover")) rects.push(panel.getBoundingClientRect());
  const left = Math.min(...rects.map((rect) => rect.left)) - bodyRect.left;
  const top = Math.min(...rects.map((rect) => rect.top)) - bodyRect.top;
  const right = Math.max(...rects.map((rect) => rect.right)) - bodyRect.left;
  const bottom = Math.max(...rects.map((rect) => rect.bottom)) - bodyRect.top;
  void invoke("set_hit_rect", { x: left, y: top, w: right - left, h: bottom - top });
}

petCard.addEventListener("mousedown", async (event) => {
  if (event.button !== 0) return;
  await windowRef.startDragging();
});

installPlugin.addEventListener("click", async () => {
  installPlugin.disabled = true;
  setupMessage.textContent = "正在启用状态插件…";
  try {
    const status = await invoke<PluginStatus>("install_workbuddy_status_plugin");
    setupMessage.textContent = status.message;
    await refreshSnapshot();
  } catch (error) {
    setupMessage.textContent = String(error);
  } finally {
    installPlugin.disabled = false;
  }
});

panel.addEventListener("mouseenter", reportHitRect);
panel.addEventListener("mouseleave", reportHitRect);
petCard.addEventListener("mouseenter", reportHitRect);
petCard.addEventListener("mouseleave", reportHitRect);
window.addEventListener("resize", reportHitRect);

setInterval(refreshSnapshot, 800);
setInterval(reportHitRect, 120);

void refreshSnapshot();
reportHitRect();

document.addEventListener("contextmenu", (event) => event.preventDefault());

// Keep a tiny debug breadcrumb in devtools without exposing tokens or paths.
Object.defineProperty(window, "agentBuddySnapshot", {
  get() {
    return latestSnapshot;
  },
});
