import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import kittyBuddyCompleted from "./assets/desktop-pet/kitty-buddy/KittyBuddyCompleted.png";
import kittyBuddyFailed from "./assets/desktop-pet/kitty-buddy/KittyBuddyFailed.png";
import kittyBuddyGenerating from "./assets/desktop-pet/kitty-buddy/KittyBuddyGenerating.png";
import kittyBuddyIdle from "./assets/desktop-pet/kitty-buddy/KittyBuddyIdle.png";
import kittyBuddyPlanning from "./assets/desktop-pet/kitty-buddy/KittyBuddyPlanning.png";
import kittyBuddyRunningTool from "./assets/desktop-pet/kitty-buddy/KittyBuddyRunningTool.png";
import kittyBuddyThinking from "./assets/desktop-pet/kitty-buddy/KittyBuddyThinking.png";
import kittyBuddyWaiting from "./assets/desktop-pet/kitty-buddy/KittyBuddyWaiting.png";
import emberSageCompleted from "./assets/desktop-pet/ember-sage/EmberSageCompleted.png";
import emberSageFailed from "./assets/desktop-pet/ember-sage/EmberSageFailed.png";
import emberSageGenerating from "./assets/desktop-pet/ember-sage/EmberSageGenerating.png";
import emberSageIdle from "./assets/desktop-pet/ember-sage/EmberSageIdle.png";
import emberSagePlanning from "./assets/desktop-pet/ember-sage/EmberSagePlanning.png";
import emberSageRunningTool from "./assets/desktop-pet/ember-sage/EmberSageRunningTool.png";
import emberSageThinking from "./assets/desktop-pet/ember-sage/EmberSageThinking.png";
import emberSageWaiting from "./assets/desktop-pet/ember-sage/EmberSageWaiting.png";
import prismaticBadgeCompleted from "./assets/desktop-pet/prismatic-blade/Badge_Completed.png";
import prismaticBadgeFailed from "./assets/desktop-pet/prismatic-blade/Badge_Failed.png";
import prismaticBadgeGenerating from "./assets/desktop-pet/prismatic-blade/Badge_Generating.png";
import prismaticBadgeIdle from "./assets/desktop-pet/prismatic-blade/Badge_Idle.png";
import prismaticBadgePlanning from "./assets/desktop-pet/prismatic-blade/Badge_Planning.png";
import prismaticBadgeRunningTool from "./assets/desktop-pet/prismatic-blade/Badge_RunningTool.png";
import prismaticBadgeThinking from "./assets/desktop-pet/prismatic-blade/Badge_Thinking.png";
import prismaticBadgeWaiting from "./assets/desktop-pet/prismatic-blade/Badge_Waiting.png";
import prismaticBladeCompleted from "./assets/desktop-pet/prismatic-blade/PrismaticBladeCompleted.png";
import prismaticBladeFailed from "./assets/desktop-pet/prismatic-blade/PrismaticBladeFailed.png";
import prismaticBladeGenerating from "./assets/desktop-pet/prismatic-blade/PrismaticBladeGenerating.png";
import prismaticBladeIdle from "./assets/desktop-pet/prismatic-blade/PrismaticBladeIdle.png";
import prismaticBladePlanning from "./assets/desktop-pet/prismatic-blade/PrismaticBladePlanning.png";
import prismaticBladeRunningTool from "./assets/desktop-pet/prismatic-blade/PrismaticBladeRunningTool.png";
import prismaticBladeThinking from "./assets/desktop-pet/prismatic-blade/PrismaticBladeThinking.png";
import prismaticBladeWaiting from "./assets/desktop-pet/prismatic-blade/PrismaticBladeWaiting.png";

type WorkState = "idle" | "thinking" | "tool" | "output" | "waiting" | "done" | "unknown" | "failed";
type Theme = "workbuddy" | "kitty-buddy" | "prismatic-blade" | "ember-sage";
type CustomTheme = Exclude<Theme, "workbuddy">;

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

interface ActivityAndPluginSnapshot {
  activity: ActivitySnapshot;
  plugin: PluginStatus;
}

const stage = document.querySelector<HTMLElement>("#pet-stage")!;
const panel = document.querySelector<HTMLElement>("#credit-panel")!;
const petCard = document.querySelector<HTMLElement>("#pet-card")!;
const stateBadge = document.querySelector<HTMLElement>("#state-badge")!;
const stand = document.querySelector<HTMLElement>("#stand")!;
const themePetImage = document.querySelector<HTMLImageElement>("#theme-pet-image")!;
const themeBadgeImage = document.querySelector<HTMLImageElement>("#theme-badge-image")!;
const themeMenu = document.querySelector<HTMLElement>("#theme-menu")!;
const themeOptions = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-theme-value]"));
const statusText = document.querySelector<HTMLElement>("#status-text")!;
const creditLeft = document.querySelector<HTMLElement>("#credit-left")!;
const creditProgress = document.querySelector<HTMLElement>("#credit-progress")!;
const metricLeft = document.querySelector<HTMLElement>("#metric-left")!;
const metricPercent = document.querySelector<HTMLElement>("#metric-percent")!;
const metricTotal = document.querySelector<HTMLElement>("#metric-total")!;
const metricState = document.querySelector<HTMLElement>("#metric-state")!;
const metricPlan = document.querySelector<HTMLElement>("#metric-plan")!;
const metricUpdated = document.querySelector<HTMLElement>("#metric-updated")!;
const creditFeedback = document.querySelector<HTMLElement>("#credit-feedback")!;
const setupRow = document.querySelector<HTMLElement>("#setup-row")!;
const setupMessage = document.querySelector<HTMLElement>("#setup-message")!;
const installPlugin = document.querySelector<HTMLButtonElement>("#install-plugin")!;

const hasTauriRuntime = "__TAURI_INTERNALS__" in window;
const windowRef = hasTauriRuntime ? getCurrentWindow() : null;
const CREDIT_VISIBLE_REFRESH_MS = 10_000;
const CREDIT_BACKGROUND_REFRESH_MS = 120_000;
const CREDIT_HOVER_STALE_MS = 5_000;
const CREDIT_AFTER_COMPLETION_DELAY_MS = 2_500;
let latestSnapshot: ActivityAndPluginSnapshot | null = null;
let latestCredits: CreditSnapshot | null = null;
let lastSuccessfulCredits: CreditSnapshot | null = null;
let activityRefreshInFlight = false;
let creditRefreshInFlight = false;
let lastCreditRequestAt = 0;
let completionCreditRefreshTimer: number | undefined;
let installInProgress = false;
let pluginFeedback: PluginStatus | null = null;
let pluginFeedbackError: string | null = null;
let pluginFeedbackUntil = 0;
let feedbackTimer: number | undefined;

const themeImageByState: Record<CustomTheme, Record<WorkState, string>> = {
  "kitty-buddy": {
    idle: kittyBuddyIdle,
    thinking: kittyBuddyThinking,
    tool: kittyBuddyRunningTool,
    output: kittyBuddyGenerating,
    waiting: kittyBuddyWaiting,
    done: kittyBuddyCompleted,
    unknown: kittyBuddyPlanning,
    failed: kittyBuddyFailed,
  },
  "prismatic-blade": {
    idle: prismaticBladeIdle,
    thinking: prismaticBladeThinking,
    tool: prismaticBladeRunningTool,
    output: prismaticBladeGenerating,
    waiting: prismaticBladeWaiting,
    done: prismaticBladeCompleted,
    unknown: prismaticBladePlanning,
    failed: prismaticBladeFailed,
  },
  "ember-sage": {
    idle: emberSageIdle,
    thinking: emberSageThinking,
    tool: emberSageRunningTool,
    output: emberSageGenerating,
    waiting: emberSageWaiting,
    done: emberSageCompleted,
    unknown: emberSagePlanning,
    failed: emberSageFailed,
  },
};

const prismaticBadgeByState: Record<WorkState, string> = {
  idle: prismaticBadgeIdle,
  thinking: prismaticBadgeThinking,
  tool: prismaticBadgeRunningTool,
  output: prismaticBadgeGenerating,
  waiting: prismaticBadgeWaiting,
  done: prismaticBadgeCompleted,
  unknown: prismaticBadgePlanning,
  failed: prismaticBadgeFailed,
};

function toTheme(value: string | undefined | null): Theme {
  if (value === "kitty-buddy" || value === "prismatic-blade" || value === "ember-sage") return value;
  return "workbuddy";
}

function applyTheme(theme: Theme) {
  stage.dataset.theme = theme;
  for (const option of themeOptions) {
    option.setAttribute("aria-checked", String(option.dataset.themeValue === theme));
  }
  localStorage.setItem("agent-buddy-theme", theme);
  setThemeImages(latestSnapshot?.activity.state ?? "unknown");
}

function setThemeImages(state: WorkState) {
  const theme = toTheme(stage.dataset.theme);
  themePetImage.src = theme === "workbuddy" ? "" : themeImageByState[theme][state];
  themeBadgeImage.src = theme === "prismatic-blade" ? prismaticBadgeByState[state] : "";
}

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
    case "failed":
      return { label: "连接失败", icon: "×", className: "failed" };
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

function applyCredits(snapshot: CreditSnapshot) {
  latestCredits = snapshot;
  if (snapshot.ok) lastSuccessfulCredits = snapshot;

  const credits = snapshot.ok ? snapshot : lastSuccessfulCredits ?? snapshot;
  creditLeft.textContent = fmtNumber(credits.left);
  metricLeft.textContent = fmtNumber(credits.left);
  metricTotal.textContent = fmtNumber(credits.total);
  metricPercent.textContent = fmtPercent(credits.percent);
  metricPlan.textContent = credits.plan || "--";
  metricUpdated.textContent = fmtTime(credits.updatedAt);
  creditProgress.style.width = `${Math.max(0, Math.min(100, credits.percent ?? 0))}%`;

  panel.dataset.creditStatus = snapshot.ok ? "ready" : "error";
  creditFeedback.hidden = snapshot.ok;
  creditFeedback.textContent = snapshot.ok
    ? ""
    : `${lastSuccessfulCredits ? "额度刷新失败，当前显示上次成功数据：" : "额度获取失败："}${snapshot.error || "未知错误"}`;
}

function scheduleCompletionCreditRefresh() {
  window.clearTimeout(completionCreditRefreshTimer);
  completionCreditRefreshTimer = window.setTimeout(() => {
    void refreshCredits(0);
  }, CREDIT_AFTER_COMPLETION_DELAY_MS);
}

function applySnapshot(snapshot: ActivityAndPluginSnapshot) {
  const previousState = latestSnapshot?.activity.state;
  latestSnapshot = snapshot;
  const meta = stateMeta(snapshot.activity.state);
  stage.dataset.state = meta.className;
  setThemeImages(snapshot.activity.state);
  statusText.textContent = meta.label;
  stateBadge.textContent = meta.icon;
  metricState.textContent = meta.label;

  const status = currentPluginStatus() ?? snapshot.plugin;
  if (pluginFeedbackError && Date.now() < pluginFeedbackUntil) {
    renderPluginError(pluginFeedbackError);
  } else {
    renderPluginStatus(status);
  }

  if (snapshot.activity.state === "done" && previousState !== "done") {
    scheduleCompletionCreditRefresh();
  }
}

async function refreshActivitySnapshot() {
  if (!hasTauriRuntime) return;
  if (activityRefreshInFlight) return;
  activityRefreshInFlight = true;
  try {
    const snapshot = await invoke<ActivityAndPluginSnapshot>("workbuddy_activity_snapshot");
    applySnapshot(snapshot);
  } catch (error) {
    console.error(error);
    stage.dataset.state = "failed";
    setThemeImages("failed");
  } finally {
    activityRefreshInFlight = false;
  }
}

async function refreshCredits(minimumAgeMs: number) {
  if (!hasTauriRuntime || creditRefreshInFlight) return;
  if (Date.now() - lastCreditRequestAt < minimumAgeMs) return;

  creditRefreshInFlight = true;
  lastCreditRequestAt = Date.now();
  try {
    applyCredits(await invoke<CreditSnapshot>("workbuddy_credit_snapshot"));
  } catch (error) {
    applyCredits({
      ok: false,
      updatedAt: Math.floor(Date.now() / 1000),
      error: errorText(error),
    });
  } finally {
    creditRefreshInFlight = false;
  }
}

function unionRect(rects: DOMRect[], padding: number, bodyRect: DOMRect) {
  const left = Math.min(...rects.map((rect) => rect.left)) - bodyRect.left - padding;
  const top = Math.min(...rects.map((rect) => rect.top)) - bodyRect.top - padding;
  const right = Math.max(...rects.map((rect) => rect.right)) - bodyRect.left + padding;
  const bottom = Math.max(...rects.map((rect) => rect.bottom)) - bodyRect.top + padding;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function closeThemeMenu() {
  if (themeMenu.hidden) return;
  themeMenu.hidden = true;
  stage.classList.remove("theme-menu-open");
  reportHitRegions();
}

function openThemeMenu(clientX: number, clientY: number) {
  const stageRect = stage.getBoundingClientRect();
  themeMenu.hidden = false;
  stage.classList.add("theme-menu-open");

  const menuRect = themeMenu.getBoundingClientRect();
  const edge = 12;
  const preferredLeft = clientX - stageRect.left + 12;
  const preferredTop = clientY - stageRect.top + 12;
  const left = Math.max(edge, Math.min(preferredLeft, stageRect.width - menuRect.width - edge));
  const top = Math.max(edge, Math.min(preferredTop, stageRect.height - menuRect.height - edge));
  themeMenu.style.left = `${left}px`;
  themeMenu.style.top = `${top}px`;
  reportHitRegions();
}

async function syncOverlayLayout() {
  const fallbackHeight = window.screen.availHeight || window.innerHeight || 900;
  let workAreaHeight = fallbackHeight;

  if (hasTauriRuntime) {
    const monitor = await currentMonitor();
    if (monitor) workAreaHeight = monitor.workArea.size.toLogical(monitor.scaleFactor).height;
  }

  const layoutScale = Math.max(0.72, Math.min(1, workAreaHeight / 900));
  const stageWidth = Math.round(400 * layoutScale);
  const stageHeight = Math.round(440 * layoutScale);
  const layoutKey = `${stageWidth}:${stageHeight}`;

  if (stage.dataset.layoutKey === layoutKey) return;
  stage.dataset.layoutKey = layoutKey;
  stage.style.setProperty("--layout-scale", String(layoutScale));

  if (windowRef) await windowRef.setSize(new LogicalSize(stageWidth, stageHeight));
  reportHitRegions();
}

function reportHitRegions() {
  if (!hasTauriRuntime) return;
  const bodyRect = document.body.getBoundingClientRect();
  const petElements: HTMLElement[] = toTheme(stage.dataset.theme) === "workbuddy"
    ? [petCard, stateBadge, stand]
    : [petCard];
  if (!themeMenu.hidden) petElements.push(themeMenu);
  const pet = unionRect(
    petElements.map((element) => element.getBoundingClientRect()),
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
  closeThemeMenu();
  await windowRef.startDragging();
});

petCard.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  event.stopPropagation();
  openThemeMenu(event.clientX, event.clientY);
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

for (const option of themeOptions) {
  option.addEventListener("click", () => {
    applyTheme(toTheme(option.dataset.themeValue));
    closeThemeMenu();
  });
}

document.addEventListener("pointerdown", (event) => {
  if (themeMenu.hidden || themeMenu.contains(event.target as Node)) return;
  closeThemeMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeThemeMenu();
});

window.addEventListener("resize", reportHitRegions);
stage.addEventListener("pointerenter", () => {
  void refreshCredits(CREDIT_HOVER_STALE_MS);
});

if (hasTauriRuntime) {
  void listen<PluginInstallFeedback>("workbuddy-plugin-status", ({ payload }) => {
    installInProgress = false;
    showPluginFeedback(payload.status, payload.error);
  });
  void windowRef?.onScaleChanged(() => void syncOverlayLayout());
  void windowRef?.onMoved(() => void syncOverlayLayout());
}

setInterval(refreshActivitySnapshot, 800);
setInterval(() => {
  void refreshCredits(
    stage.matches(":hover") ? CREDIT_VISIBLE_REFRESH_MS : CREDIT_BACKGROUND_REFRESH_MS,
  );
}, CREDIT_VISIBLE_REFRESH_MS);
setInterval(reportHitRegions, 120);

applyTheme(toTheme(localStorage.getItem("agent-buddy-theme")));
void refreshActivitySnapshot();
void refreshCredits(CREDIT_BACKGROUND_REFRESH_MS);
void syncOverlayLayout();

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (!themeMenu.contains(event.target as Node)) closeThemeMenu();
});

// Keep a tiny debug breadcrumb in devtools without exposing tokens or paths.
Object.defineProperty(window, "agentBuddySnapshot", {
  get() {
    return latestSnapshot ? { ...latestSnapshot, credits: latestCredits } : null;
  },
});
