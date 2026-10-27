// dsh-better_reminder —— 挂载层(v1 重写,lib/index.js)。
//
// 挂载点全部走 0.2.1-rc.3 的官方 seam(上游 1.1.1 的 settings.register/猴补丁包 ask()/
// apply-patch 守卫已按重构方案删除):
//   1. `agent/status` running→idle:根 Agent 回合结束 → 完成提醒(过滤子代理;goal 武装
//      续跑期不吵,读 ctx.goals —— 契约已对 dsh-goal 源码核验,phase/activation/roundsStarted);
//   2. `user-questions/request` 瀑布监听:提问选项卡 → 决策提醒;永不吞决策,恒 return next();
//   3. `approval/request` 瀑布监听:待批准 → 提醒;同上;
//   4. `webServer.register`:自有前缀路由(避开 /api —— 插件路由在最长前缀分发下会优先于
//      内核 /api,等于绕过内核鉴权,OFM issue 实录的坑)+ 结构化信任围栏;
//   5. 配置源 = lib/config.js(文件即改即生效;HTTP 面是 GUI 预留接口,README 架构一节)。
//
// 尽力而为原则:提醒失败绝不影响 Agent 主流程;监听器内的所有异常自吞并降级为一条 warn。
// peer 解析:本文件不得静态 import @deepseek-ai/*(profile node_modules 没有它们,只有
// 宿主能解析 app.asar)—— 唯一入口是 ./adapter/kernel.js 的动态解析。
import { resolveDataDir } from "./adapter/kernel.js";
import { createConfigStore, SOUND_PRESETS } from "./config.js";
import { createNotifyCore } from "./notify-core.js";

export const name = "dsh-better_reminder";
/** 静态依赖:agents 服务(完成过滤与 roots 判定);其余(webServer/goals)惰性获取。 */
export const inject = ["agents"];

// ---------- 会话信息提取(全部尽力而为) ----------

/** 会话标题:session.events 与 seq/eventAt 两种当代形状都兼容,读不到返回 undefined。 */
function sessionTitleOf(session) {
  try {
    const events = Array.isArray(session?.events) ? session.events : null;
    if (events !== null) {
      const event = events.findLast((item) => item?.type === "session/title");
      const title = event?.data?.title;
      if (typeof title === "string" && title.length > 0) return title;
    }
    if (typeof session?.seq === "number" && typeof session?.eventAt === "function") {
      for (let seq = session.seq - 1; seq >= 0 && seq >= session.seq - 400; seq -= 1) {
        const event = session.eventAt(seq);
        if (event?.type === "session/title") {
          const title = event?.data?.title;
          if (typeof title === "string" && title.length > 0) return title;
        }
      }
    }
    if (typeof session?.title === "string" && session.title.length > 0) return session.title;
  } catch { /* 标题可选 */ }
  return void 0;
}

/** 最后一条助手消息开头片段(完成 Toast 的正文);形状不合预期时返回空串。 */
function lastAssistantSnippet(session, maxChars) {
  try {
    const events = Array.isArray(session?.events) ? session.events : null;
    if (events === null) return "";
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event?.type !== "assistant/message") continue;
      const blocks = event?.data?.content;
      if (!Array.isArray(blocks)) continue;
      for (const block of blocks) {
        if (block?.type === "text" && typeof block.text === "string" && block.text.trim().length > 0) {
          const text = block.text.replace(/\s+/g, " ").trim();
          return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
        }
      }
    }
  } catch { /* 片段可选 */ }
  return "";
}

/** goal 自动续跑(armed + active + 轮次预算未尽)→ true = 本轮结束马上有下一轮,别吵。 */
function isGoalContinuing(ctx, agent) {
  try {
    const goals = ctx.get("goals");
    if (goals === void 0) return false;
    const goal = goals.get(agent);
    if (goal === void 0) return false;
    if (goal.phase !== "active" || goal.activation !== "armed") return false;
    // dsh-goal 契约:maxGoalRounds 恒为正整数(view 必有);保险起见保留无上限=继续的语义
    return goal.maxGoalRounds === void 0 || goal.roundsStarted < goal.maxGoalRounds;
  } catch {
    return false; // get() 对非 live agent throw GoalError
  }
}

// ---------- 信任围栏(结构化,fail-closed;不依赖 connection 服务的内部形状) ----------

const MAX_BODY_BYTES = 64 * 1024;

/**
 * 信任围栏,与内核 /api 的 isTrustedApiRequest 同语义(实测教训:第一版要求
 * sec-fetch-site 必须显式 same-origin/none,桌面 WebView 的 fetch 不带这个头 →
 * 设置页全 403)。规则:① Host 必须回环(挡 DNS rebinding);② sec-fetch-site
 * 仅显式 cross-site 才拒;③ Origin/Referer 附带时必须与本 Host 同权,缺省放行
 * ——内核注释原话:非浏览器客户端不带这些标记,Host 围栏是它唯一的、也是足够的关。
 * 本路由只读写通知配置(无凭据、无执行面),信任级与 /api 同级即可。
 */
export function admitRequest(req) {
  const host = req.headers.host;
  if (typeof host !== "string" || host.length === 0) return false;
  let hostUrl;
  try {
    hostUrl = new URL(`http://${host}`); // 默认端口归一:http://127.0.0.1 ≡ :80
  } catch {
    return false;
  }
  const hostname = hostUrl.hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "[::1]") return false;
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  for (const key of ["origin", "referer"]) {
    const value = req.headers[key];
    if (value === void 0) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      const originBare = url.port === "" || url.port === "80" || url.port === "443" ? url.hostname : url.host;
      if (originBare !== hostUrl.hostname && url.host !== hostUrl.host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function readBody(req) {
  let size = 0;
  let body = "";
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("请求体超过 64 KiB 上限");
      error.status = 413;
      throw error;
    }
    body += chunk;
  }
  return body.length > 0 ? JSON.parse(body) : {};
}

// ---------- 插件主体 ----------

export async function apply(ctx, config) {
  const stateDir = await resolveDataDir();
  ctx.logger.info(`dsh-better_reminder: 数据目录 ${stateDir}`);

  // ---- 配置 ----
  const store = createConfigStore({ dir: stateDir, logger: ctx.logger });
  const boot = store.reload();
  for (const message of boot.warnings) ctx.logger.warn(`dsh-better_reminder: ${message}`);

  // ---- 通知引擎 ----
  const core = createNotifyCore({ stateDir, configStore: store, logger: ctx.logger });

  // ---- 1. 完成提醒 ----
  const lastStatus = new Map();
  ctx.on("agent/status", ({ agent, status }) => {
    try {
      const previous = lastStatus.get(agent) ?? "idle";
      lastStatus.set(agent, status);
      if (status !== "idle" || previous === "idle") return;
      const agents = ctx.get("agents");
      if (agents !== void 0 && !agents.roots().includes(agent)) return; // 子代理完成不打扰
      if (isGoalContinuing(ctx, agent)) return;
      if (store.get().completeEnabled !== true) return;
      const title = sessionTitleOf(agent.session);
      core.notifyComplete(title, title !== void 0 ? `会话：${title}` : "回合结束，可以回来查看结果了", lastAssistantSnippet(agent.session, 100));
    } catch (error) {
      ctx.logger.warn(`dsh-better_reminder: 完成提醒失败:${String(error?.message ?? error)}`);
    }
  });
  ctx.effect(() => () => lastStatus.clear(), "dsh-better_reminder: 状态表");

  // ---- 2. 提问提醒(恒 pass-through)----
  ctx.on("user-questions/request", (request, next) => {
    if (store.get().questionEnabled === true) {
      try {
        const questions = Array.isArray(request?.questions) ? request.questions : [];
        const first = questions[0];
        if (first !== void 0) {
          const single = questions.length === 1;
          const options = single && first.multiSelect !== true ? first.options ?? [] : [];
          const isPlanReview = first.intent?.kind === "plan-review";
          let title = isPlanReview ? "DSH 计划等待审批 📋" : "DSH 需要你的决定 ❓";
          const sessionTitle = sessionTitleOf(request?.agent?.session);
          if (sessionTitle !== void 0) title += ` · ${sessionTitle}`;
          const question = typeof first.question === "string" && first.question.length > 0
            ? first.question : "等待你的回复，任务才会继续";
          const labels = options.map((option) => option.label).filter((label) => typeof label === "string" && label.length > 0);
          core.notifyWindows({
            title,
            message: question.length > 120 ? `${question.slice(0, 117)}…` : question,
            detail: labels.length > 0 ? `选项：${labels.join(" / ").slice(0, 160)}` : single ? "开放题，请到界面里回答" : "包含多个问题，请到界面里回答",
          });
        }
      } catch { /* 提醒尽力而为,绝不影响提问本身 */ }
    }
    return next();
  });

  // ---- 3. 待批准提醒(恒 pass-through)----
  ctx.on("approval/request", (req, next) => {
    if (store.get().approvalEnabled === true) {
      try {
        const toolName = typeof req?.toolName === "string" ? req.toolName : "工具调用";
        let title = "DSH 等待你的批准 🙋";
        const sessionTitle = sessionTitleOf(req?.agent?.session);
        if (sessionTitle !== void 0) title += ` · ${sessionTitle}`;
        const reason = typeof req?.reason === "string" && req.reason.length > 0
          ? (req.reason.length > 160 ? `${req.reason.slice(0, 157)}…` : req.reason)
          : `请求执行:${toolName}`;
        core.notifyWindows({ title, message: reason, detail: `工具:${toolName}` });
      } catch { /* 同上 */ }
    }
    return next();
  });

  // ---- 4. HTTP 面(GUI 预留接口;自有前缀,避开 /api 优先级绕过)----
  ctx.inject(["webServer"], (wctx) => {
    const webServer = wctx.get("webServer");
    if (webServer === void 0) return;
    const json = (res, status, value) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(value));
    };
    const soundsPayload = () => Object.values(SOUND_PRESETS).map(({ id, label, desc }) => ({ id, label, desc }));

    const disposeConfig = webServer.register({
      kind: "exact",
      path: "/dsh-better-reminder-7340/config",
      handler: async (req, res) => {
        if (!admitRequest(req)) { json(res, 403, { ok: false, error: "forbidden" }); return; }
        try {
          if (req.method === "GET") { json(res, 200, { ok: true, config: store.get(), sounds: soundsPayload() }); return; }
          if (req.method === "POST") {
            const parsed = await readBody(req);
            const patch = parsed?.patch;
            if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
              json(res, 400, { ok: false, error: "POST 需要 JSON:{ patch: { … } }" });
              return;
            }
            const result = store.applyPatch(patch);
            json(res, result.ok ? 200 : 500, {
              ok: result.ok, config: result.config, sounds: soundsPayload(),
              warnings: result.warnings, ...result.ok ? {} : { error: result.error },
            });
            return;
          }
          json(res, 405, { ok: false, error: "仅支持 GET / POST" });
        } catch (error) {
          json(res, error?.status ?? 400, { ok: false, error: String(error?.message ?? error) });
        }
      },
    });
    wctx.effect(() => disposeConfig, "dsh-better_reminder: config 路由");

    const disposePreview = webServer.register({
      kind: "exact",
      path: "/dsh-better-reminder-7340/preview",
      handler: async (req, res) => {
        if (!admitRequest(req)) { json(res, 403, { ok: false, error: "forbidden" }); return; }
        if (req.method !== "POST") { json(res, 405, { ok: false, error: "仅支持 POST" }); return; }
        try {
          await readBody(req); // 体积/JSON 合法性一并把关
          const result = core.previewSound();
          json(res, 200, { ok: result.ok === true, ...result.ok ? {} : { error: String(result.reason ?? "unknown") } });
        } catch (error) {
          json(res, error?.status ?? 400, { ok: false, error: String(error?.message ?? error) });
        }
      },
    });
    wctx.effect(() => disposePreview, "dsh-better_reminder: preview 路由");
  });

  ctx.logger.info("dsh-better_reminder: 已挂载(完成/提问/待批准 三类提醒,官方事件 seam)");
}
