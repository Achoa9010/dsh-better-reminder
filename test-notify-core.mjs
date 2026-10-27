#!/usr/bin/env node
/**
 * notify-core 离线行为测试:假 spawn(收集调用、不弹真 toast)、假时钟、假 io。
 * 覆盖:resolveSoundFile 回落链、节流、force、config-off、合并窗口、payload 形状。
 * 路径一律用 POSIX 风格假路径(/fake/assets),不含盘符,不触泄露扫描。
 * @module dsh-better_reminder/test-notify-core
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNotifyCore, resolveSoundFile, inQuietHours } from "./lib/notify-core.js";

let passed = 0;
const tests = [];
const ok = (name, fn) => tests.push({ name, fn });
const run = async () => {
  for (const { name, fn } of tests) {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  }
};

const fakeStore = (config) => ({ get: () => config });
const recorder = () => {
  const calls = [];
  const spawnImpl = (cmd, args) => { calls.push({ cmd, args }); return { once() {}, pid: 4242 }; };
  return { calls, spawnImpl };
};
const tmp = () => mkdtempSync(join(tmpdir(), "dn-test-"));
const decode = (args) => JSON.parse(Buffer.from(args.at(-1), "base64").toString("utf8"));
const baseConfig = {
  enabled: true, soundEnabled: true, sound: "soft", soundPath: "",
  completeEnabled: true, questionEnabled: true, approvalEnabled: true,
  completeMerge: false, minIntervalMs: 2500,
  quietHours: { enabled: false, start: "22:00", end: "08:00" }, respectSystemDnd: true,
};

// ---- resolveSoundFile ----
ok("空 soundPath = 预设文件,custom=false", () => {
  const r = resolveSoundFile({ soundPath: "", sound: "brisk" }, () => {},
    { assetsDir: "/fake/assets", exists: () => true, isFile: () => false });
  assert.match(r.file, /dsh-notify-brisk\.wav$/);
  assert.equal(r.custom, false);
  assert.equal(r.fellBack, false);
});

ok("自定义文件存在 = custom 生效", () => {
  const r = resolveSoundFile({ soundPath: "/fake/my.wav", sound: "soft" }, () => {},
    { assetsDir: "/fake/assets", exists: () => true, isFile: (p) => p === "/fake/my.wav" });
  assert.equal(r.file, "/fake/my.wav");
  assert.equal(r.custom, true);
});

ok("自定义路径无效 = 回落预设 + 告警", () => {
  const warnings = [];
  const r = resolveSoundFile({ soundPath: "/fake/gone.wav", sound: "calm" }, (m) => warnings.push(m),
    { assetsDir: "/fake/assets", exists: () => true, isFile: () => false });
  assert.match(r.file, /dsh-notify-calm\.wav$/);
  assert.equal(r.fellBack, true);
  assert.equal(warnings.length, 1);
});

ok("非法预设 id 落 soft", () => {
  const r = resolveSoundFile({ soundPath: "", sound: "nope" }, () => {},
    { assetsDir: "/fake/assets", exists: () => true, isFile: () => false });
  assert.match(r.file, /dsh-notify-soft\.wav$/);
});

// ---- inQuietHours 边界(解析层,不依赖当前时刻)----
ok("inQuietHours: 相等窗口=关闭;非法文本=false", () => {
  assert.equal(inQuietHours({ start: "00:00", end: "00:00" }), false);
  assert.equal(inQuietHours({ start: "bad", end: "time" }), false);
});

// ---- notifyWindows 行为矩阵 ----
ok("platform 非 win32 → 不 spawn,reason=disabled(CI 的 Linux runner 靠它显式注入)", () => {
  const { calls, spawnImpl } = recorder();
  const core = createNotifyCore({ platform: "linux", stateDir: tmp(), configStore: fakeStore(baseConfig), spawnImpl, now: () => 10000 });
  const r = core.notifyWindows({ title: "t" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "disabled");
  assert.equal(calls.length, 0);
});

ok("config.enabled=false → 不 spawn,reason=config-off", () => {
  const { calls, spawnImpl } = recorder();
  const core = createNotifyCore({ platform: "win32", stateDir: tmp(), configStore: fakeStore({ ...baseConfig, enabled: false }), spawnImpl, now: () => 10000 });
  const r = core.notifyWindows({ title: "t" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "config-off");
  assert.equal(calls.length, 0);
});

ok("节流 + force 试听穿透", () => {
  const { calls, spawnImpl } = recorder();
  let clock = 100000;
  const core = createNotifyCore({ platform: "win32", stateDir: tmp(), configStore: fakeStore(baseConfig), spawnImpl, now: () => clock });
  assert.equal(core.notifyWindows({ title: "a" }).ok, true);
  clock += 2499;
  assert.equal(core.notifyWindows({ title: "b" }).reason, "throttled");
  clock += 2;
  assert.equal(core.notifyWindows({ title: "c" }).ok, true);
  clock += 100;
  assert.equal(core.previewSound().ok, true, "试听必须绕过节流");
  assert.equal(calls.length, 3);
});

ok("payload 形状:Base64 → JSON 全字段", () => {
  const { calls, spawnImpl } = recorder();
  const core = createNotifyCore({ platform: "win32", stateDir: tmp(), configStore: fakeStore(baseConfig), spawnImpl, now: () => 7 });
  core.notifyWindows({ title: "完成 ✅", message: "会话：demo", detail: "摘要" });
  assert.equal(calls[0].args.includes("-PayloadB64"), true);
  const p = decode(calls[0].args);
  assert.equal(p.line1, "完成 ✅");
  assert.equal(p.line2, "会话：demo");
  assert.equal(p.line3, "摘要");
  assert.match(p.sound, /dsh-notify-soft\.wav$/);
  assert.equal(p.mute, false);
  assert.equal(p.custom, false);
  assert.equal(p.quiet, "none");
  assert.deepEqual(p.actions, []);
});

ok("soundEnabled=false → sound 空、mute=true 仍弹", () => {
  const { calls, spawnImpl } = recorder();
  const core = createNotifyCore({ platform: "win32", stateDir: tmp(), configStore: fakeStore({ ...baseConfig, soundEnabled: false }), spawnImpl, now: () => 7 });
  core.notifyWindows({ title: "x" });
  const p = decode(calls[0].args);
  assert.equal(p.sound, "");
  assert.equal(p.mute, true);
});

ok("完成合并:5s 内两次 → 一条摘要", async () => {
  const { calls, spawnImpl } = recorder();
  const core = createNotifyCore({ platform: "win32", stateDir: tmp(), configStore: fakeStore({ ...baseConfig, completeMerge: true }), spawnImpl, now: () => 50 });
  core.notifyComplete("任务A", "会话：A", "");
  core.notifyComplete("任务B", "会话：B", "");
  await new Promise((resolve) => setTimeout(resolve, 5300));
  assert.equal(calls.length, 1);
  assert.match(decode(calls[0].args).line1, /（2）/);
  core.dispose();
});

ok("dispose 清空计时器,不再 flush", async () => {
  const { calls, spawnImpl } = recorder();
  const core = createNotifyCore({ platform: "win32", stateDir: tmp(), configStore: fakeStore({ ...baseConfig, completeMerge: true }), spawnImpl, now: () => 50 });
  core.notifyComplete("任务A", "会话：A", "");
  core.dispose();
  await new Promise((resolve) => setTimeout(resolve, 5300));
  assert.equal(calls.length, 0);
});

await run();
console.log(`\nnotify-core 离线测试通过 ${passed} 项`);
