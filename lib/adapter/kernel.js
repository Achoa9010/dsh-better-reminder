// dsh-better_reminder —— 宿主 seam 接线层(v1)。
//
// 为什么单独有这个文件:本包对 @deepseek-ai/* 只声明 peerDependencies(由宿主运行时提供),
// 但 ESM 静态 import 的解析按「本文件位置」找 node_modules,profile 树里没有这些包
// (它们在 app.asar 内,只有宿主自身能解析)。官方先例 dsh-pet 0.3.8 同款形态,其解法是
// adapter/kernel.js 内唯一的动态 import。本文件即该 seam:全包只有这里允许出现
// `import("@deepseek-ai/*")`,且全部动态。
//
// 失败语义:每个解析器在宿主不可提供时返回 undefined,调用方必须优雅降级 ——
//   dsh-home-paths 缺失 → 数据目录回落 <os home>/.dsh/dsh-better_reminder;
//   (agent/session 等对象服务不经这里,走 ctx.inject,由 Cordis 处理缺失=不激活)。
import os from "node:os";
import path from "node:path";

export const PEER_PACKAGES = {
  homePaths: "@deepseek-ai/dsh-home-paths",
};

const cache = new Map();

/** 动态解析 peer 包;不可得返回 undefined(不抛)。 */
export async function requirePeer(name) {
  if (cache.has(name)) return cache.get(name);
  let value;
  try {
    value = await import(name);
  } catch {
    value = void 0;
  }
  cache.set(name, value);
  return value;
}

/** 解析插件数据目录 = <DSH_HOME>/dsh-better_reminder;宿主不可得时回落 os home。 */
export async function resolveDataDir() {
  const home = await resolveDshHomeSafe();
  return path.join(home, "dsh-better_reminder");
}

/** $DSH_HOME:宿主 dsh-home-paths 优先,失败回落 os home/.dsh。 */
async function resolveDshHomeSafe() {
  const mod = await requirePeer(PEER_PACKAGES.homePaths);
  if (mod?.resolveDshHome === void 0) return path.join(os.homedir(), ".dsh");
  try {
    return mod.resolveDshHome();
  } catch {
    return path.join(os.homedir(), ".dsh");
  }
}
