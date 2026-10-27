#!/usr/bin/env node
/**
 * 信任围栏离线测试(admitRequest)。内核 isTrustedApiRequest 同语义:
 * Host 回环必过、仅显式 cross-site 拒、Origin/Referer 附带才比对、缺省标记放行。
 * @module dsh-better_reminder/test-fence
 */
import assert from "node:assert/strict";
import { admitRequest } from "./lib/index.js";

const req = (headers) => ({ headers });
const PORT = String(process.env.PORT ?? "59639");

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`PASS  ${name}`); };

ok("桌面 WebView fetch:无 sec-fetch-site、无 origin(本次 403 事故的现场) → 放行", () => {
  assert.equal(admitRequest(req({ host: `127.0.0.1:${PORT}` })), true);
});

ok("浏览器同源 fetch(same-origin)→ 放行", () => {
  assert.equal(admitRequest(req({ host: `127.0.0.1:${PORT}`, "sec-fetch-site": "same-origin", origin: `http://127.0.0.1:${PORT}` })), true);
});

ok("cross-site 标记 → 拒", () => {
  assert.equal(admitRequest(req({ host: `127.0.0.1:${PORT}`, "sec-fetch-site": "cross-site" })), false);
});

ok("异源 Origin → 拒", () => {
  assert.equal(admitRequest(req({ host: `127.0.0.1:${PORT}`, origin: "http://evil.example:1234" })), false);
});

ok("同源 Origin(默认端口归一:origin 无端口 vs host 带端口)→ 放行", () => {
  assert.equal(admitRequest(req({ host: "127.0.0.1:80", origin: "http://127.0.0.1" })), true);
  assert.equal(admitRequest(req({ host: "127.0.0.1", origin: "http://127.0.0.1:80" })), true);
});

ok("localhost 与 127.0.0.1 混用 = 同一回环权限 → 放行", () => {
  assert.equal(admitRequest(req({ host: `localhost:${PORT}`, origin: `http://localhost:${PORT}` })), true);
});

ok("非回环 Host(DNS rebinding 面)→ 拒,标记全对也拒", () => {
  assert.equal(admitRequest(req({ host: "attacker.example:80", "sec-fetch-site": "same-origin", origin: "http://attacker.example:80" })), false);
});

ok("缺 Host / 空 Host → 拒(fail closed)", () => {
  assert.equal(admitRequest(req({})), false);
  assert.equal(admitRequest(req({ host: "" })), false);
});

ok("畸形 Origin → 拒", () => {
  assert.equal(admitRequest(req({ host: `127.0.0.1:${PORT}`, origin: "not a url" })), false);
  assert.equal(admitRequest(req({ host: `127.0.0.1:${PORT}`, origin: "javascript:alert(1)" })), false);
});

console.log(`\n围栏测试通过 ${n} 项`);
