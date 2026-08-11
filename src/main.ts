import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
  pluginInstalled: boolean;
  marketplaceAvailable: boolean;
  restartRequired: boolean;
  message: string;
}

interface PluginInstallFeedback {
  status?: PluginStatus;
  error?: string;
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
const stand = document.querySelector<HTMLElement>("#stand")!;
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

const hasTauriRuntime = "__TAURI_INTERNALS__" in window;
const windowRef = hasTauriRuntime ? getCurrentWindow() : null;
let latestSnapshot: Snapshot | null = null;
let refreshInFlight = false;
let installInProgress = false;
let pluginFeedback: PluginStatus | null = null;
let pluginFeedbackError: string | null = null;
let pluginFeedbackUntil = 0;
let feedbackTimer: number | undefined;

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

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function pluginIsReady(status: PluginStatus): boolean {
  return status.pluginConfigured && status.pluginInstalled && status.marketplaceAvailable;
}

function currentPluginStatus(): PluginStatus | null {
  if (pluginFeedback && Date.now() < pluginFeedbackUntil) return pluginFeedback;
  pluginFeedback = null;
  if (Date.now() >= pluginFeedbackUntil) pluginFeedbackError = null;
  return latestSnapshot?.plugin ?? null;
}

function renderPluginStatus(status: PluginStatus) {
  if (installInProgress) {
    renderPluginWorking();
    return;
  }

  const ready = pluginIsReady(status);
  setupRow.hidden = false;
  installPlugin.removeAttribute("aria-busy");
  setupRow.dataset.status = ready ? (status.restartRequired ? "restart" : "enabled") : "disabled";
  installPlugin.disabled = ready;
  installPlugin.textContent = ready ? "✓ 实时状态已启用" : "启用实时状态";
  setupMessage.textContent = status.message;
}

function renderPluginWorking() {
  setupRow.hidden = false;
  setupRow.dataset.status = "working";
  installPlugin.disabled = true;
  installPlugin.textContent = "正在启用…";
  installPlugin.setAttribute("aria-busy", "true");
  setupMessage.textContent = "正在通过 WorkBuddy 插件管理器完成安装和校验…";
}

function renderPluginError(error: string) {
  setupRow.hidden = false;
  setupRow.dataset.status = "error";
  installPlugin.disabled = false;
  installPlugin.textContent = "重试启用";
  installPlugin.removeAttribute("aria-busy");
  setupMessage.textContent = error;
}

function showPluginFeedback(status?: PluginStatus, error?: string) {
  window.clearTimeout(feedbackTimer);
  stage.classList.add("feedback-visible");
  feedbackTimer = window.setTimeout(() => stage.classList.remove("feedback-visible"), 8000);

  if (status) {
    pluginFeedback = status;
    pluginFeedbackError = null;
    pluginFeedbackUntil = Date.now() + 8000;
    renderPluginStatus(status);
    return;
  }

  if (error) {
    pluginFeedbackError = error;
    pluginFeedbackUntil = Date.now() + 8000;
    renderPluginError(error);
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

  const status = currentPluginStatus() ?? snapshot.plugin;
  if (pluginFeedbackError && Date.now() < pluginFeedbackUntil) {
    renderPluginError(pluginFeedbackError);
  } else {
    renderPluginStatus(status);
  }
}

async function refreshSnapshot() {
  if (!hasTauriRuntime) return;
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    const snapshot = await invoke<Snapshot>("workbuddy_snapshot");
    applySnapshot(snapshot);
  } catch (error) {
    console.error(error);
  } finally {
    refreshInFlight = false;
  }
}

function unionRect(rects: DOMRect[], padding: number, bodyRect: DOMRect) {
  const left = Math.min(...rects.map((rect) => rect.left)) - bodyRect.left - padding;
  const top = Math.min(...rects.map((rect) => rect.top)) - bodyRect.top - padding;
  const right = Math.max(...rects.map((rect) => rect.right)) - bodyRect.left + padding;
  const bottom = Math.max(...rects.map((rect) => rect.bottom)) - bodyRect.top + padding;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function reportHitRegions() {
  if (!hasTauriRuntime) return;
  const bodyRect = document.body.getBoundingClientRect();
  const pet = unionRect(
    [petCard.getBoundingClientRect(), stateBadge.getBoundingClientRect(), stand.getBoundingClientRect()],
    8,
    bodyRect,
  );
  const panelRegion = unionRect([panel.getBoundingClientRect()], 20, bodyRect);
  void invoke("set_hit_regions", {
    petX: pet.x,
    petY: pet.y,
    petW: pet.w,
    petH: pet.h,
    panelX: panelRegion.x,
    panelY: panelRegion.y,
    panelW: panelRegion.w,
    panelH: panelRegion.h,
  });
}

petCard.addEventListener("mousedown", async (event) => {
  if (event.button !== 0 || !windowRef) return;
  await windowRef.startDragging();
});

installPlugin.addEventListener("click", async () => {
  installInProgress = true;
  renderPluginWorking();
  stage.classList.add("feedback-visible");
  let status: PluginStatus | undefined;
  let errorMessage: string | undefined;
  try {
    if (!hasTauriRuntime) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      throw new Error("仅可在 Agent Buddy 桌面应用中启用实时状态。");
    }
    status = await invoke<PluginStatus>("install_workbuddy_status_plugin");
  } catch (error) {
    errorMessage = errorText(error);
  } finally {
    installInProgress = false;
    showPluginFeedback(status, errorMessage);
  }
});

window.addEventListener("resize", reportHitRegions);

if (hasTauriRuntime) {
  void listen<PluginInstallFeedback>("workbuddy-plugin-status", ({ payload }) => {
    installInProgress = false;
    showPluginFeedback(payload.status, payload.error);
  });
}

setInterval(refreshSnapshot, 800);
setInterval(reportHitRegions, 120);

void refreshSnapshot();
reportHitRegions();

document.addEventListener("contextmenu", (event) => event.preventDefault());

// Keep a tiny debug breadcrumb in devtools without exposing tokens or paths.
Object.defineProperty(window, "agentBuddySnapshot", {
  get() {
    return latestSnapshot;
  },
});
