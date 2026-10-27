# Contributing

感谢关注!这是一个小而精的 Windows 通知插件,欢迎提 Issue 与 PR。

## 开发环境 / Setup

- Node ≥ 22.12(无第三方运行时依赖;唯一 dev 依赖是 js-yaml,供校验脚本用);
- Windows 10/11(Toast 与音效需要实测);
- 一台可重启的 DSH 实例(插件经 profile bundle 接入,改动后需重启验证)。

```bash
pnpm install --ignore-scripts
node test.mjs   # 静态 9 组 + 行为 29 项(全离线,不弹真实 toast)
node pack.mjs   # dist/ 下生成分发产物(npm tgz + 源码 zip)
```

## 本地安装调试 / Local install

把包目录(或解包后的 tgz)拷进目标 profile:

```text
<DSH_HOME>\profiles\<profile>\node_modules\dsh-better_reminder\
```

然后在 profile 的 `package.json` 里登记 `dependencies` 与 `dsh.profile.bundles` 两处,**重启 DSH**(bundle 与 client 声明都不热加载)。桌面端 profile 由 Electron 独占,请走 GUI 或在应用退出时改文件。

冒烟检查(重启后):

```text
GET  http://127.0.0.1:<port>/dsh-better-reminder-7340/config     (同源浏览器请求应 200;裸 curl 无 Host 回环会被围栏拒)
POST …/dsh-better-reminder-7340/preview                          ({"ok":true} 并播放当前音效)
```

宿主日志里应有 `dsh-better_reminder: 已挂载(…)` 一行。

## 编码规则 / Conventions

- **`.ps1` 必须 UTF-8 BOM**(Windows PowerShell 5.1 会把无 BOM 的中文按 GBK 读);**profile 的 `package.json` 必须无 BOM**——方向相反,`node test.mjs` 两条都钉死;
- 通知路径全程 best-effort:任何失败静默降级,绝不打断 DSH 主流程;
- 事件监听(瀑布)必须 `return next()`——吞决策 = 事故;不包装、不改写任何内置服务的对象;
- 子进程规则:PowerShell 绝对路径、载荷 Base64、不用 detached/unref(Windows 实测子进程会被立即杀死);
- `@deepseek-ai/*` 只允许在 `lib/adapter/kernel.js` 动态 import(ESM 静态解析按包位置找不到宿主包);
- 新增配置项:同步改 `lib/config.js`(默认值 + normalizeConfig 白名单)、`lib/client.js`(设置页 UI)、README 配置表,并补 test-config 断言。

## 提交规范 / Commits

- 一条提交做一件事;`type: 描述`(`fix:`、`feat:`、`docs:`、`ci:`);
- 不提交 `node_modules/`、`dist/`、日志与任何含本机绝对路径的文件(套件会拦路径泄露)。

## 发布流程 / Release

打 `vX.Y.Z` 标签推送后,`.github/workflows/release.yml` 自动校验、构建并创建 Release(npm tgz + 源码 zip + SHA256SUMS)。用户从 Release 下 zip 走「手工安装」,或 `dsh plugin add dsh-better_reminder`(已发 npm 时)。
