#!/usr/bin/env node
/**
 * 发布前校验套件(v1 重写线;CI 与本地共用):
 *   1. 全部 JS/MJS 语法(node --check);
 *   2. cordis.patch.yml 结构(bundle 补丁:单条 insert,better-reminder 行);
 *   3. package.json 插件声明(bundle 双面;client 声明在 T5 GUI 期归还);
 *   4. 音频资产存在且为 RIFF/WAVE;
 *   5. PowerShell 脚本为 UTF-8 BOM(中文文本硬性要求);
 *   6. 路径泄露扫描:仓库文本文件不得含盘符绝对路径;
 *   7. lib 静态 import 纪律:@deepseek-ai/* 只允许出现在 adapter/kernel.js,且必须是动态 import;
 *   8. 离线行为测试:test-config.mjs。
 * 任一项失败退出码非 0。
 * @module dsh-better_reminder/test
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const ROOT = dirname(fileURLToPath(import.meta.url));
const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${message}`);
  if (!ok) failures.push(message);
};

// ---- 1. JS/MJS 语法 ----
const JS_FILES = ["lib/index.js", "lib/config.js", "lib/notify-core.js", "lib/adapter/kernel.js", "pack.mjs", "test.mjs", "test-config.mjs", "test-notify-core.mjs", "test-fence.mjs"];
for (const rel of JS_FILES) {
  const file = join(ROOT, rel);
  check(existsSync(file), `存在 ${rel}`);
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  check(result.status === 0, `node --check ${rel}`);
}

// ---- 2. cordis.patch.yml ----
const patch = yaml.load(readFileSync(join(ROOT, "cordis.patch.yml"), "utf8"));
check(Array.isArray(patch), "cordis.patch.yml 顶层为数组");
if (Array.isArray(patch)) {
  const row = patch?.[0]?.insert?.[0];
  check(patch.length === 1 && patch[0]?.insert?.length === 1, "cordis.patch.yml 恰好一条 insert");
  check(row?.id === "better-reminder", "行 id 为 better-reminder");
  check(row?.name === "dsh-better_reminder", "行 name 为 dsh-better_reminder");
}

// ---- 3. package.json ----
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
check(pkg.name === "dsh-better_reminder", "包名 dsh-better_reminder");
check(pkg.dsh?.bundle?.patch === "./cordis.patch.yml", "声明 dsh.bundle.patch");
check(pkg.dsh?.client === void 0 || pkg.dsh?.client?.platform === "web", "dsh.client 未声明或为 web(T5 期应为 web)");
check(pkg.dsh?.compatibility?.dshReleases?.["0.2.1-rc.3"] === "compatible", "兼容性声明 0.2.1-rc.3 compatible");
check(typeof pkg.exports?.["./cordis.patch.yml"] === "string" && existsSync(join(ROOT, pkg.exports["./cordis.patch.yml"])), "exports ./cordis.patch.yml 指向存在的文件");
check(/^\d+\.\d+\.\d+/.test(pkg.version), `版本号 ${pkg.version} 为发布 SemVer`);
check(pkg.license === "MIT", "许可证 MIT");

// ---- 4. 音频资产 ----
for (const name of ["dsh-notify-soft.wav", "dsh-notify-brisk.wav", "dsh-notify-calm.wav", "dsh-notify-crisp.wav", "dsh-notify.wav"]) {
  const file = join(ROOT, "assets", name);
  const ok = existsSync(file) && readFileSync(file).subarray(0, 4).toString("ascii") === "RIFF";
  check(ok, `资产 ${name} 为 RIFF/WAVE`);
}

// ---- 5. PowerShell 脚本 UTF-8 BOM ----
for (const rel of ["scripts/toast.ps1"]) {
  const bytes = readFileSync(join(ROOT, rel));
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  check(bom, `${rel} 为 UTF-8 BOM`);
}

// ---- 6. 路径泄露扫描 ----
const TEXT_EXTS = new Set([".js", ".mjs", ".ps1", ".yml", ".yaml", ".json", ".md"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "docs"]);
const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (TEXT_EXTS.has(extname(entry.name)) || entry.name === "LICENSE" || entry.name === ".gitignore") out.push(path);
  }
  return out;
};
// 盘符绝对路径:前面不能是字母(排除 https:// 这类 URL 里的 s:/)
const DRIVE_PATH = /(?<![A-Za-z])[A-Za-z]:[\\/]/;
// 合法豁免:系统目录常量(C:\WINDOWS 在所有 Windows 机器上一致,非机器泄露)
const LEGIT_SYSTEM_DIR = /C:[\\/]+WINDOWS/gi;
const leaks = [];
for (const file of walk(ROOT)) {
  if (file.endsWith("test.mjs")) continue; // 扫描器自身的模式除外
  if (file.endsWith("TASKS.md")) continue; // 内部账本(如存在)含机器路径,不入发布
  const content = readFileSync(file, "utf8").replace(LEGIT_SYSTEM_DIR, "");
  if (DRIVE_PATH.test(content)) leaks.push(file.replace(ROOT + "\\", ""));
}
check(leaks.length === 0, `无盘符绝对路径泄露${leaks.length > 0 ? `: ${leaks.join(", ")}` : ""}`);

// ---- 7. lib import 纪律 ----
const libFiles = [];
const walkLib = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkLib(path);
    else if (extname(entry.name) === ".js") libFiles.push(path);
  }
};
walkLib(join(ROOT, "lib"));
let importViolations = [];
for (const file of libFiles) {
  const content = readFileSync(file, "utf8");
  // 静态 import/export ... from "@deepseek-ai/..." —— 任何 lib 文件禁止
  if (/from\s+["']@deepseek-ai\//.test(content)) importViolations.push(`${file.replace(ROOT + "\\", "")}: 静态 import @deepseek-ai`);
  // 动态 import 仅 adapter/kernel.js 允许
  const dynamic = [...content.matchAll(/import\(\s*["']@deepseek-ai\//g)];
  if (dynamic.length > 0 && !file.endsWith(join("adapter", "kernel.js"))) {
    importViolations.push(`${file.replace(ROOT + "\\", "")}: 动态 import 出现在 seam 之外`);
  }
}
check(importViolations.length === 0, `lib import 纪律${importViolations.length > 0 ? `: ${importViolations.join("; ")}` : "(@deepseek-ai 仅 seam 动态)"}`);

// ---- 8. 离线行为测试 ----
const cfg = spawnSync(process.execPath, [join(ROOT, "test-config.mjs")], { encoding: "utf8" });
check(cfg.status === 0, "test-config.mjs 全绿");
const core = spawnSync(process.execPath, [join(ROOT, "test-notify-core.mjs")], { encoding: "utf8" });
check(core.status === 0, `test-notify-core.mjs 全绿${core.status === 0 ? "" : `\n${core.stdout ?? ""}${core.stderr ?? ""}`}`);
const fence = spawnSync(process.execPath, [join(ROOT, "test-fence.mjs")], { encoding: "utf8" });
check(fence.status === 0, `test-fence.mjs 全绿${fence.status === 0 ? "" : `\n${fence.stdout ?? ""}${fence.stderr ?? ""}`}`);

// ---- 汇总 ----
if (failures.length > 0) {
  console.error(`\n${failures.length} 项校验失败`);
  process.exit(1);
}
console.log(`\n全部校验通过(${JS_FILES.length} JS + YAML + JSON + 资产 + 编码 + 路径 + import 纪律 + 行为)`);
