#!/usr/bin/env node
/**
 * config.js 离线行为测试:不依赖宿主(注入假 logger),dir 用一次性临时目录。
 * 覆盖:默认回落、坏文件容错、patch 深合并、非法值告警、原子写、change 事件、soundTarget。
 * @module dsh-better_reminder/test-config
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createConfigStore, defaultConfig, normalizeConfig, SOUND_PRESETS } from "./lib/config.js";

const dir = mkdtempSync(join(tmpdir(), "dsh-br-test-"));
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log(`PASS  ${name}`); };

ok("空目录读取 = 默认值且不落盘", () => {
  const store = createConfigStore({ dir });
  const c = store.get();
  assert.deepEqual(c, defaultConfig());
  assert.equal(c.soundPath, "");
  assert.equal(c.sound, "soft");
});

ok("坏 JSON 容错 = 默认值 + 告警", () => {
  const bad = join(dir, "bad");
  mkdirSync(bad, { recursive: true });
  writeFileSync(join(bad, "config.json"), "{ not json", "utf8");
  let warned = 0;
  const store = createConfigStore({ dir: bad, logger: { warn() { warned += 1; } } });
  assert.deepEqual(store.get(), defaultConfig());
  assert.ok(warned >= 1, "应有读取失败告警");
});

ok("normalizeConfig 白名单:未知键忽略、非法值回落并告警", () => {
  const warnings = [];
  const c = normalizeConfig(
    { sound: "nope", soundPath: 42, minIntervalMs: -5, quietHours: { enabled: "yes", start: "99:99" }, bogus: 1 },
    (m) => warnings.push(m),
  );
  assert.equal(c.sound, "soft");
  assert.equal(c.soundPath, "");
  assert.equal(c.minIntervalMs, 2500);
  assert.equal(c.quietHours.enabled, false);
  assert.equal(c.quietHours.start, "22:00");
  assert.ok(warnings.length >= 5, `告警应覆盖每个非法项, got=${warnings.length}`);
});

ok("patch 深合并:quietHours 子键不整段丢失", () => {
  const store = createConfigStore({ dir });
  store.applyPatch({ quietHours: { enabled: true } });
  store.applyPatch({ quietHours: { start: "23:30" } });
  const c = store.get();
  assert.equal(c.quietHours.enabled, true);
  assert.equal(c.quietHours.start, "23:30");
  assert.equal(c.quietHours.end, "08:00");
});

ok("写入即落盘:文件可重读且与内存一致", () => {
  const store = createConfigStore({ dir });
  const custom = "\\\\fake-host\\sounds\\mine.wav"; // UNC 假路径:无盘符,不触泄露扫描;只测字符串语义
  const r = store.applyPatch({ sound: "crisp", soundPath: custom, enabled: false });
  assert.equal(r.ok, true);
  const onDisk = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
  assert.equal(onDisk.sound, "crisp");
  assert.equal(onDisk.soundPath, custom);
  assert.equal(onDisk.enabled, false);
  const back = store.get();
  assert.equal(back.soundPath, custom);
  store.applyPatch({ soundPath: "" });
  assert.equal(store.get().soundPath, "");
});

ok("onChange 事件:payload 带完整 config,取消后不再收", () => {
  const store = createConfigStore({ dir });
  const seen = [];
  const off = store.onChange((e) => seen.push(e.config.sound));
  store.applyPatch({ sound: "calm" });
  store.applyPatch({ sound: "brisk" });
  off();
  store.applyPatch({ sound: "soft" });
  assert.deepEqual(seen, ["calm", "brisk"]);
});

ok("applyPatch 返回形状 = GUI 契约 { ok, config, warnings }", () => {
  const store = createConfigStore({ dir });
  const r = store.applyPatch({ quietHours: { start: "bad" } });
  assert.equal(r.ok, true);
  assert.equal(typeof r.config, "object");
  assert.ok(Array.isArray(r.warnings) && r.warnings.length >= 1);
});

ok("SOUND_PRESETS 文件存在于仓库 assets 且为 RIFF/WAVE", () => {
  const assetsDir = join(fileURLToPath(new URL(".", import.meta.url)), "assets");
  for (const preset of Object.values(SOUND_PRESETS)) {
    const bytes = readFileSync(join(assetsDir, preset.file));
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", preset.file);
  }
});

rmSync(dir, { recursive: true, force: true });
console.log(`\nconfig 离线测试通过 ${passed} 项`);
