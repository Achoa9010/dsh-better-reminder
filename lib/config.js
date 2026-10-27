// dsh-better_reminder —— 配置层(v1 重写,lib/config.js)。
//
// 职责:config.json 的权威读写(宿主唯一配置源)、字段归一化、变更事件广播。
// 非目标:不决定通知怎么弹(那是 notify-core);不做 HTTP(那是 index.js 的路由层)。
// 依赖:node:fs / node:path(零 peer import —— 数据目录由调用方经 adapter/kernel.js 传入)。
// 不变量:
//   · 读出的配置永远是 normalizeConfig 折叠后的完整形状(缺字段取默认、错字段告警回落);
//   · 写路径 = 深合并 patch → normalizeConfig → 原子落盘(tmp+rename) → emit change;
//   · 文件不存在/坏 JSON 不致命:回落默认并记录(只有显式 reset 或首次成功写入才落盘);
//   · 配置路径固定 <dir>/config.json:dir 由调用方(index.js)用宿主 dsh-home-paths 解析后传入 ——
//     本模块保持零 peer import,离线测试可直接跑;GUI 不碰文件系统,只走 /dsh-better-reminder-7340/config。
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/** 四套自带提示音(assets/ 下 RIFF/WAVE;id 稳定,是配置里的持久标识)。 */
export const SOUND_PRESETS = {
  soft: { id: "soft", label: "柔和（默认）", desc: "叮—咚双音，马林巴音色，平稳舒缓", file: "dsh-notify-soft.wav" },
  brisk: { id: "brisk", label: "轻快", desc: "三连音上行，节奏明快", file: "dsh-notify-brisk.wav" },
  calm: { id: "calm", label: "舒缓", desc: "低八度双音，更慢更长", file: "dsh-notify-calm.wav" },
  crisp: { id: "crisp", label: "清脆", desc: "明亮短促，高音为主", file: "dsh-notify-crisp.wav" },
};

const TIME_PATTERN = /^\d{1,2}:\d{2}$/;

/** 出厂配置。新增字段必须同时进 normalizeConfig(白名单校验)与本对象。 */
export function defaultConfig() {
  return {
    enabled: true,                       // 总开关:false = 一切提醒静默
    soundEnabled: true,                  // 提示音开关(Toast 弹窗不受影响)
    sound: "soft",                       // 预设 id;soundPath 非空时此项仅作回退
    soundPath: "",                       // 自定义音效绝对路径(T1.2 核心需求):空=用预设
    completeEnabled: true,               // 回合完成提醒
    questionEnabled: true,               // 提问选项卡提醒
    approvalEnabled: true,               // 待批准提醒
    completeMerge: true,                 // 5 秒合并摘要
    minIntervalMs: 2500,                 // 全局节流(ms):连环事件只响第一条
    quietHours: { enabled: false, start: "22:00", end: "08:00" },
    respectSystemDnd: true,              // Windows 专注助手/勿扰激活时自动静音
  };
}

/** 把任何半残配置折叠成完整形状;非法值 → 告警 + 回落默认。 */
export function normalizeConfig(parsed, warn = (m) => m) {
  const base = defaultConfig();
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    warn("config 根不是对象,全部取默认");
    return base;
  }
  const bool = (key) => {
    if (typeof parsed[key] === "boolean") base[key] = parsed[key];
    else if (parsed[key] !== void 0) warn(`config.${key} 非布尔,取默认`);
  };
  for (const key of ["enabled", "soundEnabled", "completeEnabled", "questionEnabled",
    "approvalEnabled", "completeMerge", "respectSystemDnd"]) bool(key);
  if (typeof parsed.sound === "string" && SOUND_PRESETS[parsed.sound] !== void 0) base.sound = parsed.sound;
  else if (parsed.sound !== void 0) warn(`config.sound 未知预设 ${String(parsed.sound)},取默认`);
  if (typeof parsed.soundPath === "string") base.soundPath = parsed.soundPath.trim();
  else if (parsed.soundPath !== void 0) warn("config.soundPath 非字符串,取默认");
  if (typeof parsed.minIntervalMs === "number" && Number.isInteger(parsed.minIntervalMs)
    && parsed.minIntervalMs >= 0 && parsed.minIntervalMs <= 60000) base.minIntervalMs = parsed.minIntervalMs;
  else if (parsed.minIntervalMs !== void 0) warn("config.minIntervalMs 非法(需 0~60000 整数),取默认");
  if (parsed.quietHours !== null && typeof parsed.quietHours === "object") {
    if (typeof parsed.quietHours.enabled === "boolean") base.quietHours.enabled = parsed.quietHours.enabled;
    else if (parsed.quietHours.enabled !== void 0) warn(`config.quietHours.enabled 非布尔,取默认`);
    for (const key of ["start", "end"]) {
      if (typeof parsed.quietHours[key] === "string" && TIME_PATTERN.test(parsed.quietHours[key])) {
        base.quietHours[key] = parsed.quietHours[key];
      } else if (parsed.quietHours[key] !== void 0) warn(`config.quietHours.${key} 非法(HH:mm),取默认`);
    }
    for (const key of ["start", "end"]) {
      const [h, m] = base.quietHours[key].split(":").map(Number);
      if (h > 23 || m > 59) { base.quietHours[key] = defaultConfig().quietHours[key]; warn(`config.quietHours.${key} 越界,取默认`); }
    }
  } else if (parsed.quietHours !== void 0) warn("config.quietHours 非对象,取默认");
  return base;
}

/** patch 深合并一层(quietHours 是唯一的嵌套对象)。 */
function mergePatch(current, patch) {
  const next = { ...current, ...patch };
  if (patch.quietHours !== null && typeof patch.quietHours === "object") {
    next.quietHours = { ...current.quietHours, ...patch.quietHours };
  }
  return next;
}

/**
 * 创建配置 store。
 * @param {{ dir: string, logger?: { warn(msg: string): void } }} options dir = 数据目录(必填,由宿主侧解析后传入)。
 *   warn 走宿主 logger(尽力而为),同时留 lastWarnings 供 /config 路由回显——GUI 期做「配置有问题」的黄条用。
 */
export function createConfigStore({ dir, logger } = {}) {
  if (typeof dir !== "string" || dir.length === 0) throw new Error("createConfigStore 需要 dir(数据目录)");
  const stateDir = dir;
  const file = path.join(stateDir, "config.json");
  const listeners = new Set();
  let warnSink = null;
  const warn = (message) => {
    try { logger?.warn(`dsh-better_reminder: ${message}`); } catch { /* 日志尽力而为 */ }
    if (warnSink) warnSink.push(message);
  };

  let current = defaultConfig();
  let loaded = false;

  /** 从磁盘重读(容错:坏文件 → 默认值,绝不让宿主启动失败)。 */
  function reload() {
    const warnings = [];
    warnSink = warnings;
    try {
      let raw = readFileSync(file, "utf8");
      if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
      current = normalizeConfig(JSON.parse(raw), warn);
    } catch (error) {
      const code = error?.code;
      if (code !== "ENOENT") warn(`config.json 读取失败(${String(error?.message ?? error)}),用默认值`);
      current = defaultConfig();
    }
    warnSink = null;
    loaded = true;
    return { config: { ...current }, warnings };
  }

  /** 原子落盘:写 tmp 再 rename;失败则不发 change 事件、返回错误。 */
  function persist() {
    mkdirSync(stateDir, { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(current, null, 2), "utf8");
    renameSync(tmp, file);
  }

  /** 应用 patch(深合并 + 归一化),成功才落盘并发 change。 */
  function applyPatch(patch) {
    if (!loaded) reload();
    const warnings = [];
    warnSink = warnings;
    const next = normalizeConfig(mergePatch(current, patch ?? {}), warn);
    warnSink = null;
    const previous = current;
    current = next;
    try {
      persist();
    } catch (error) {
      current = previous;
      warn(`配置写入失败,保持原值:${String(error?.message ?? error)}`);
      return { ok: false, error: `写入失败:${String(error?.message ?? error)}`, config: { ...previous }, warnings };
    }
    for (const listener of listeners) {
      try { listener({ config: { ...current }, warnings }); } catch { /* 一个监听炸不连坐 */ }
    }
    return { ok: true, config: { ...current }, warnings };
  }

  return {
    get path() { return file; },
    get directory() { return stateDir; },
    /** 当前配置(浅拷贝)。 */
    get() {
      if (!loaded) reload();
      return { ...current };
    },
    reload,
    applyPatch,
    /** 变更订阅(README 预留接口):返回取消函数。 */
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
