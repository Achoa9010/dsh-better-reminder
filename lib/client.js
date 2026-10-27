/**
 * dsh-better_reminder 浏览器半侧(v1,T5):设置页「通知」区段。
 *
 * 纪律(cordis skill 现行规范):
 *   · 只 require react —— 不 require dsh-client-ui-primitives(框架原语随版本变、
 *     且被明令禁止);按钮/开关/输入框全部自绘,样式只引用 --dsw-alias-* token
 *     (白名单 = Theme.listTokens;亮暗自动跟随,token 改名最多退化外观、不崩渲染)。
 *   · 工厂零副作用;数据只在组件挂载后经 fetch 拉取。
 *   · 文案硬编码中文(上游同款;该插槽不强制 locale 服务)。
 *
 * 数据面(README「架构」一节契约,与宿主 webServer 同源):
 *   GET  /dsh-better-reminder-7340/config   → { ok, config, sounds }
 *   POST /dsh-better-reminder-7340/config   { patch:{…} } → { ok, config, sounds, warnings }
 *   POST /dsh-better-reminder-7340/preview  {}            → { ok } | { ok:false, error }
 */
window.__ModuleLoader__.load({
  id: "dsh-better_reminder",
  factory(require) {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");
    const h = React.createElement;

    // ── 样式:全部走 theme token,字号/间距抄宿主设置页 ──
    const style = {
      root: { boxSizing: "border-box", flexDirection: "column", gap: 10, padding: 20, display: "flex", overflowY: "auto", maxHeight: "100%" },
      hint: { margin: 0, color: "var(--dsw-alias-label-secondary)", fontSize: 12, lineHeight: "18px" },
      group: { flexDirection: "column", gap: 6, display: "flex" },
      groupTitle: { color: "var(--dsw-alias-label-secondary)", fontSize: 11, fontWeight: 600, lineHeight: "16px", letterSpacing: ".02em", padding: "0 2px" },
      divider: { height: 1, background: "var(--dsw-alias-border-l1)", margin: "2px 0", border: "none" },
      card: { boxSizing: "border-box", alignItems: "center", justifyContent: "space-between", gap: 12, background: "var(--dsw-alias-bg-layer-1)", borderRadius: 12, padding: "10px 16px", display: "flex" },
      cardCol: { alignItems: "flex-start", flexDirection: "column", gap: 4 },
      label: { color: "var(--dsw-alias-label-primary)", fontSize: 14, lineHeight: "22px" },
      desc: { color: "var(--dsw-alias-label-secondary)", fontSize: 12, lineHeight: "18px" },
      body: { flex: 1, minWidth: 0, flexDirection: "column", display: "flex" },
      row: { boxSizing: "border-box", alignItems: "center", gap: 12, border: "1px solid transparent", borderRadius: 12, padding: "8px 12px", display: "flex", cursor: "pointer", background: "transparent" },
      rowSelected: { borderColor: "var(--dsw-alias-brand-primary)", background: "var(--dsw-alias-bg-layer-1)" },
      dot: { flex: "none", border: "1.5px solid var(--dsw-alias-label-secondary)", borderRadius: "50%", width: 14, height: 14, boxSizing: "border-box", display: "inline-block" },
      dotOn: { borderColor: "var(--dsw-alias-brand-primary)", background: "var(--dsw-alias-brand-primary)" },
      current: { flex: "none", color: "var(--dsw-alias-brand-primary)", fontSize: 11, lineHeight: "16px" },
      btn: { boxSizing: "border-box", flex: "none", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-primary)", fontSize: 12, lineHeight: "18px", padding: "4px 12px", cursor: "pointer", font: "inherit" },
      track: { flex: "none", width: 40, height: 22, borderRadius: 11, border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-2)", position: "relative", cursor: "pointer", padding: 0, transition: "background 150ms ease", display: "block" },
      trackOn: { background: "var(--dsw-alias-brand-primary)", borderColor: "var(--dsw-alias-brand-primary)" },
      knob: { position: "absolute", top: 2, left: 2, width: 16, height: 16, borderRadius: "50%", background: "var(--dsw-alias-bg-overlay)", transition: "left 150ms ease", display: "block" },
      knobOn: { left: 20 },
      input: { boxSizing: "border-box", border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-primary)", borderRadius: 8, padding: "5px 8px", fontSize: 12, lineHeight: "18px", fontFamily: "inherit", width: "100%", minWidth: 0 },
      timeInput: { width: 72, textAlign: "center" },
      timeRow: { alignItems: "center", gap: 8, padding: "2px 0 0 30px", display: "flex" },
      error: { color: "var(--dsw-alias-state-error-primary)", fontSize: 12, lineHeight: "18px", display: "flex", alignItems: "center", gap: 8 },
      warn: { color: "var(--dsw-alias-state-warn-primary)", fontSize: 12, lineHeight: "18px" },
      ok: { color: "var(--dsw-alias-state-success-primary)", fontSize: 12, lineHeight: "18px" },
    };

    const API = "/dsh-better-reminder-7340";
    const TIME_PATTERN = /^\d{1,2}:\d{2}$/;

    async function fetchConfig() {
      const res = await fetch(`${API}/config`);
      const data = await res.json();
      if (!data || data.ok !== true) throw new Error(data && data.error ? data.error : `配置读取失败(${res.status})`);
      return data;
    }
    async function patchConfig(patch) {
      const res = await fetch(`${API}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch }),
      });
      const data = await res.json();
      if (!data || data.ok !== true) throw new Error(data && data.error ? data.error : `配置保存失败(${res.status})`);
      return data;
    }
    async function postPreview() {
      try {
        const res = await fetch(`${API}/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        return await res.json();
      } catch (error) {
        return { ok: false, error: String(error && error.message ? error.message : error) };
      }
    }

    function Switch(props) {
      return h("button", {
        type: "button", role: "switch", "aria-checked": props.checked === true, "aria-label": props.aria,
        style: props.checked === true ? Object.assign({}, style.track, style.trackOn) : style.track,
        onClick: props.disabled === true ? undefined : props.onToggle,
        disabled: props.disabled === true,
      }, h("span", { style: props.checked === true ? Object.assign({}, style.knob, style.knobOn) : style.knob }));
    }

    function SwitchRow(props) {
      return h("div", { style: Object.assign({}, style.card, props.disabled === true ? { opacity: 0.5 } : null) }, [
        h("div", { key: "b", style: style.body }, [
          h("div", { key: "l", style: style.label }, props.label),
          props.hint != null ? h("div", { key: "h", style: style.desc }, props.hint) : null,
        ]),
        h(Switch, { key: "s", checked: props.checked, disabled: props.disabled, onToggle: props.onToggle, aria: props.label }),
      ]);
    }

    function NotifySection() {
      const [config, setConfig] = React.useState(null);
      const [sounds, setSounds] = React.useState([]);
      const [error, setError] = React.useState(null);
      const [warnings, setWarnings] = React.useState([]);
      const [busy, setBusy] = React.useState(false);
      const [note, setNote] = React.useState(null);

      const load = React.useCallback(() => {
        setError(null);
        fetchConfig().then(
          (data) => { setConfig(data.config); setSounds(Array.isArray(data.sounds) ? data.sounds : []); },
          (reason) => setError(reason instanceof Error ? reason.message : String(reason)),
        );
      }, []);
      React.useEffect(() => { load(); }, [load]);

      const update = React.useCallback(async (patch) => {
        if (busy) return config;
        setError(null); setBusy(true);
        try {
          const data = await patchConfig(patch);
          setConfig(data.config);
          setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
          return data.config;
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason));
          return null;
        } finally { setBusy(false); }
      }, [busy, config]);

      const preview = React.useCallback(async () => {
        const result = await postPreview();
        setNote(result && result.ok === true ? "已播放当前音效" : `未播放:${result && result.error ? result.error : "未知原因"}`);
      }, []);

      const selectSound = React.useCallback(async (id) => {
        const next = await update({ sound: id });
        if (next !== null) { await preview(); }
      }, [update, preview]);

      if (config === null) {
        return h("div", { style: style.root }, error !== null ? [
          h("div", { key: "e", style: style.error, role: "alert" }, [
            h("span", { key: "m" }, error),
            h("button", { key: "r", type: "button", style: style.btn, onClick: load }, "重试"),
          ]),
        ] : h("p", { style: style.hint }, "加载中…"));
      }

      const qh = config.quietHours || { enabled: false, start: "22:00", end: "08:00" };
      const masterOff = config.enabled !== true;
      const children = [
        h("p", { key: "intro", style: style.hint }, "任务完成 / 需要你决策时弹 Windows 通知并播提示音。改动保存即生效。"),
        error !== null ? h("div", { key: "err", style: style.error, role: "alert" }, [h("span", { key: "m" }, error), h("button", { key: "r", type: "button", style: style.btn, onClick: load }, "重试")]) : null,

        h("div", { key: "g1", style: style.group }, [
          h("div", { key: "t", style: style.groupTitle }, "提醒"),
          h(SwitchRow, { label: "总开关", hint: "关闭后所有提醒静默。", checked: config.enabled, onToggle: () => update({ enabled: !config.enabled }) }),
          h(SwitchRow, { label: "任务完成", hint: "回合结束(running→idle)时提醒;5 秒内多个完成合并为一条摘要。", checked: config.completeEnabled, disabled: masterOff, onToggle: () => update({ completeEnabled: !config.completeEnabled }) }),
          h(SwitchRow, { label: "提问选项卡", hint: "Agent 抛出选择问题等你回答时提醒。", checked: config.questionEnabled, disabled: masterOff, onToggle: () => update({ questionEnabled: !config.questionEnabled }) }),
          h(SwitchRow, { label: "待批准", hint: "工具调用等待你批准时提醒。", checked: config.approvalEnabled, disabled: masterOff, onToggle: () => update({ approvalEnabled: !config.approvalEnabled }) }),
          h("div", { key: "mi", style: Object.assign({}, style.card, style.cardCol) }, [
            h("div", { key: "l", style: style.label }, "提醒节流(毫秒)"),
            h("div", { key: "h", style: style.desc }, "此间隔内最多弹一条通知,防止连环轰炸(默认 2500)。"),
            h("input", { key: "i", type: "number", min: 0, max: 60000, step: 500, defaultValue: config.minIntervalMs, style: Object.assign({}, style.input, { width: 120 }), disabled: busy, onBlur: (e) => { const v = Number.parseInt(e.target.value, 10); if (Number.isInteger(v) && v >= 0 && v <= 60000 && v !== config.minIntervalMs) update({ minIntervalMs: v }); } }),
          ]),
        ]),
        h("hr", { key: "d1", style: style.divider }),

        h("div", { key: "g2", style: style.group }, [
          h("div", { key: "t", style: style.groupTitle }, "提示音"),
          h(SwitchRow, { label: "播放提示音", hint: "关闭 = 只弹通知不出声。", checked: config.soundEnabled, disabled: masterOff, onToggle: () => update({ soundEnabled: !config.soundEnabled }) }),
          h("div", { key: "list", style: { flexDirection: "column", gap: 8, display: "flex" } }, sounds.map((sound) => {
            const selected = sound.id === config.sound;
            return h("div", { key: sound.id, style: selected ? Object.assign({}, style.row, style.rowSelected) : style.row, onClick: () => selectSound(sound.id) }, [
              h("span", { key: "d", style: selected ? Object.assign({}, style.dot, style.dotOn) : style.dot, role: "radio", "aria-checked": selected }),
              h("div", { key: "b", style: style.body }, [
                h("div", { key: "l", style: style.label }, sound.label),
                h("div", { key: "s", style: style.desc }, sound.desc),
              ]),
              selected ? h("span", { key: "c", style: style.current }, "当前") : null,
            ]);
          })),
          h("div", { key: "cp", style: Object.assign({}, style.card, style.cardCol) }, [
            h("div", { key: "l", style: style.label }, "自定义音效文件(可选)"),
            h("div", { key: "h", style: style.desc }, "填 WAV 文件的绝对路径,优先于上方预设;文件无效时自动回落预设并记入日志。MP3 等格式不支持(系统播放器仅认 WAV),请先转成 WAV。留空 = 用预设。"),
            h("input", { key: "i", type: "text", placeholder: "例如 C:\\Windows\\Media\\chimes.wav", defaultValue: config.soundPath, style: style.input, disabled: busy, onBlur: (e) => { const v = e.target.value.trim(); if (v !== (config.soundPath || "")) update({ soundPath: v }); } }),
            h("button", { key: "p", type: "button", style: style.btn, onClick: preview }, "试听当前音效"),
            note !== null ? h("div", { key: "n", style: note.indexOf("未") === 0 ? style.warn : style.ok }, note) : null,
          ]),
          warnings.length > 0 ? h("div", { key: "w", style: style.warn }, `配置提示:${warnings.join("；")}`) : null,
        ]),
        h("hr", { key: "d2", style: style.divider }),

        h("div", { key: "g3", style: style.group }, [
          h("div", { key: "t", style: style.groupTitle }, "打扰控制"),
          h(SwitchRow, { label: "免打扰时段", hint: "时段内不弹通知、不响铃(支持跨午夜)。", checked: qh.enabled, onToggle: () => update({ quietHours: { enabled: !(qh.enabled === true), start: qh.start, end: qh.end } }) }),
          qh.enabled === true ? h("div", { key: "tr", style: style.timeRow }, [
            h("span", { key: "a", style: style.desc }, "开始"),
            h("input", { key: "s", type: "text", defaultValue: qh.start, style: Object.assign({}, style.input, style.timeInput), onBlur: (e) => { if (TIME_PATTERN.test(e.target.value) && e.target.value !== qh.start) update({ quietHours: { enabled: true, start: e.target.value, end: qh.end } }); } }),
            h("span", { key: "b", style: style.desc }, "结束"),
            h("input", { key: "en", type: "text", defaultValue: qh.end, style: Object.assign({}, style.input, style.timeInput), onBlur: (e) => { if (TIME_PATTERN.test(e.target.value) && e.target.value !== qh.end) update({ quietHours: { enabled: true, start: qh.start, end: e.target.value } }); } }),
          ]) : null,
          h(SwitchRow, { label: "跟随系统勿扰", hint: "Windows 专注助手/勿扰开启时自动静音。", checked: config.respectSystemDnd, onToggle: () => update({ respectSystemDnd: !config.respectSystemDnd }) }),
        ]),
      ];
      return h("div", { style: style.root }, children);
    }

    exports.apply = function apply(ctx) {
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section", id: "better-reminder", order: 80, label: "通知",
      }, NotifySection));
    };
    exports.inject = ["slots"];
    return exports;
  },
});
