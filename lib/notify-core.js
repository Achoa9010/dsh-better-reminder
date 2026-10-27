// dsh-better_reminder —— 通知引擎(v1 重写,lib/notify-core.js)。
// 上游 v1.1.1 的 notify-core 平移改造:
//   · 保留:Base64 载荷、PowerShell 绝对路径、Toast/SoundPlayer 分工、节流、5s 合并、
//     免打扰跨午夜、试听语义 —— 这些全是实测换来的坑位知识;
//   · 删除:托盘角标全家族(tray 状态文件/锁/ensureTray/updateTrayPending/addTrayCompleted/
//     clearTrayCompleted)与 resolveInstallRoot(v1 无托盘,文件在 git 历史里可找回);
//   · 改造:配置从 configStore 读(T1);自定义音效路径在此解析 —— soundPath 非空则
//     校验存在性,缺失/非文件时告警并回落预设(T1.3 的 stat 侧:「该播哪个文件」是
//     播放决策,归引擎;config 层只管存取与形状);
//   · 新增:spawn 注入(spawnImpl/toastScript 参数)——离线测试不真弹 toast;
//   · 修正:previewSound 带 force 绕过节流(原版试听被 2.5s 节流吞掉),直接返回生效结果。
// 关键经验(照旧遵守,勿回退):
//   · 载荷经 Base64 传递(node spawn 在 Windows 不转义参数,`&` 会截断命令行);
//   · powershell 用绝对路径(宿主 PATH 可能不含 System32);
//   · 不用 detached/unref(本机实测 detached+unref 子进程会被立即杀死);
//   · 一切副作用尽力而为:失败进 debug.log + 宿主 warn,绝不打断主流程。
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOUND_PRESETS } from "./config.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ASSETS = path.join(HERE, "..", "assets");
const DEFAULT_TOAST_SCRIPT = path.join(HERE, "..", "scripts", "toast.ps1");
const COMPLETE_MERGE_WINDOW_MS = 5000;
const POWERSHELL = process.env.SystemRoot
  ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  : "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const ENV_DISABLED = ["0", "false", "off"].includes(String(process.env.DSH_NOTIFY ?? "").toLowerCase());

/** 是否处于免打扰时段(支持跨午夜窗口)。 */
export function inQuietHours(quietHours) {
  try {
    const [sh, sm] = quietHours.start.split(":").map(Number);
    const [eh, em] = quietHours.end.split(":").map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    if (start === end) return false;
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    if (start < end) return current >= start && current < end;
    return current >= start || current < end;
  } catch {
    return false;
  }
}

/** 预设 id → 资产内文件名(缺失/非法一律落 soft,与 normalizeConfig 的白名单一致)。 */
function presetFile(sound) {
  const preset = SOUND_PRESETS[sound] ?? SOUND_PRESETS.soft;
  return preset.file;
}

/**
 * 解析当前应播放的音频绝对路径 + 回落链。
 * @param {{ soundPath: string, sound: string }} config
 * @param {(msg: string) => void} warn
 * @param {{ assetsDir?: string, exists?: (p: string) => boolean, isFile?: (p: string) => boolean }} io
 * @returns {{ file: string, custom: boolean, fellBack: boolean }}
 */
export function resolveSoundFile(config, warn, io = {}) {
  const assetsDir = io.assetsDir ?? DEFAULT_ASSETS;
  const exists = io.exists ?? existsSync;
  const isFile = io.isFile ?? ((p) => { try { return statSync(p).isFile(); } catch { return false; } });
  const presetPath = path.join(assetsDir, presetFile(config.sound));
  const softPath = path.join(assetsDir, SOUND_PRESETS.soft.file);
  const fallback = () => (exists(presetPath) ? { file: presetPath, custom: false, fellBack: false }
    : { file: softPath, custom: false, fellBack: true });
  if (typeof config.soundPath === "string" && config.soundPath.length > 0) {
    if (isFile(config.soundPath)) return { file: config.soundPath, custom: true, fellBack: false };
    warn(`自定义音效路径不是文件:${config.soundPath},回落预设`);
    return exists(presetPath) ? { file: presetPath, custom: false, fellBack: true }
      : { file: softPath, custom: false, fellBack: true };
  }
  return fallback();
}

/**
 * 创建通知内核。所有副作用(Toast 进程、合并缓冲、日志)收敛在这里。
 * @param {{ stateDir: string, configStore: {get(): object}, logger?: { warn(msg: string): void },
 *   spawnImpl?, assetsDir?, toastScript?, now?: () => number, platform?: string }} options
 *   spawnImpl/assetsDir/toastScript/now/platform 仅测试注入;生产用默认。
 */
export function createNotifyCore({
  stateDir, configStore, logger = null,
  spawnImpl = spawn, assetsDir = DEFAULT_ASSETS, toastScript = DEFAULT_TOAST_SCRIPT,
  now = () => Date.now(), platform = process.platform,
} = {}) {
  const LOG_FILE = path.join(stateDir, "debug.log");
  // 构造即建目录:log 走 appendFileSync,目录缺失会静默失败(首响实测踩中——
  // 通知能弹但 debug.log 无声丢弃)。mkdirSync 幂等;不可写则日志继续尽力而为。
  try { mkdirSync(stateDir, { recursive: true }); } catch { /* 尽力而为 */ }
  // 初始 -Infinity:刚启动的进程第一次通知永远不被节流误吞(上游 1.1.1 用 0,
  // 与假时钟/未来时钟组合时会产生"距 epoch 不足间隔"的荒谬判定)。
  let lastAt = Number.NEGATIVE_INFINITY;
  let completeBuffer = [];
  let completeTimer = null;

  const log = (message) => {
    try {
      appendFileSync(LOG_FILE, `${new Date(now()).toISOString()} notify ${message}\n`);
    } catch { /* 日志失败不影响提醒 */ }
  };
  const warn = (message) => {
    try { logger?.warn(`dsh-better_reminder: ${message}`); } catch { /* 忽略 */ }
  };

  /** 弹一个 Windows 级 Toast 并播提示音;返回本次的生效描述(供路由回显)。 */
  function notifyWindows({ title = "DeepSeek Harness", message = "", detail = void 0, soundOn = void 0, ignoreQuiet = false, force = false } = {}) {
    if (platform !== "win32" || ENV_DISABLED) return { ok: false, reason: "disabled" };
    const config = configStore.get();
    if (config.enabled !== true) return { ok: false, reason: "config-off" };
    const stamp = now();
    if (!force && stamp - lastAt < Math.max(0, config.minIntervalMs)) return { ok: false, reason: "throttled" };
    lastAt = stamp;
    try {
      const enabled = soundOn === void 0 ? config.soundEnabled : soundOn;
      const { file, custom, fellBack } = resolveSoundFile(config, warn, { assetsDir });
      const quietHours = config.quietHours ?? {};
      const quiet = !ignoreQuiet && quietHours.enabled === true && inQuietHours(quietHours) ? "badge-only" : "none";
      const payload = {
        line1: String(title).slice(0, 200),
        line2: String(message).slice(0, 300),
        line3: detail !== void 0 && String(detail).length > 0 ? String(detail).slice(0, 300) : "",
        sound: enabled ? file : "",
        mute: !enabled,
        custom,
        quiet,
        respectSystemDnd: config.respectSystemDnd === true,
        actions: [],
        logFile: LOG_FILE,
      };
      const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
      const child = spawnImpl(POWERSHELL, [
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
        "-WindowStyle", "Hidden", "-File", toastScript,
        "-PayloadB64", payloadB64,
      ], { stdio: "ignore", windowsHide: true });
      if (child?.once) child.once("error", (error) => log(`spawn error: ${String(error?.message ?? error)}`));
      log(`spawn ok pid=${child?.pid ?? "?"} quiet=${quiet} fellBack=${fellBack}`);
      return { ok: true, payload, quiet: quiet !== "none", fellBack };
    } catch (error) {
      log(`notifyWindows threw: ${String(error?.message ?? error)}`);
      return { ok: false, reason: `spawn-failed:${String(error?.message ?? error)}` };
    }
  }

  // ---------- 完成通知(合并摘要) ----------
  function queueComplete(item) {
    completeBuffer.push(item);
    if (completeBuffer.length > 20) completeBuffer = completeBuffer.slice(-20);
    if (completeTimer !== null) clearTimeout(completeTimer);
    completeTimer = setTimeout(flushComplete, COMPLETE_MERGE_WINDOW_MS);
  }
  function flushComplete() {
    completeTimer = null;
    const items = completeBuffer.splice(0);
    if (items.length === 0) return;
    if (items.length === 1) {
      notifyWindows({ title: "DSH 任务完成 ✅", message: items[0].line2, detail: items[0].line3 });
      return;
    }
    const titles = items.map((item) => item.itemTitle).filter((t) => t.length > 0);
    notifyWindows({
      title: `DSH 任务完成 ✅（${items.length}）`,
      message: `${items.length} 个任务已完成`,
      detail: titles.length > 0 ? titles.join(" / ").slice(0, 160) : "回到界面查看",
    });
  }

  /** 完成提醒入口(agent/status→idle 触发);completeEnabled=false 时整条链路静默。 */
  function notifyComplete(itemTitle, line2, line3) {
    const config = configStore.get();
    if (config.completeEnabled !== true) return;
    if (config.completeMerge) {
      queueComplete({ itemTitle: String(itemTitle ?? ""), line2: String(line2 ?? ""), line3: String(line3 ?? "") });
      return;
    }
    notifyWindows({ title: "DSH 任务完成 ✅", message: String(line2 ?? ""), detail: String(line3 ?? "") });
  }

  /**
   * 试听(路由 POST /preview 消费):忽略静音配置、免打扰与节流(force),
   * 结果尽力而为地回报 —— ok=false 时带 reason,GUI 据此提示「稍后再试」。
   */
  function previewSound() {
    return notifyWindows({
      title: "DSH 提示音试听",
      message: "试听:当前生效的提示音",
      soundOn: true,
      ignoreQuiet: true,
      force: true,
    });
  }

  /** 待 flush 的合并计时器句柄,供 dispose(测试与热重载用)。 */
  function dispose() {
    if (completeTimer !== null) { clearTimeout(completeTimer); completeTimer = null; }
    completeBuffer = [];
  }

  return { notifyWindows, notifyComplete, previewSound, dispose, inQuietHours, resolveSoundFile };
}
