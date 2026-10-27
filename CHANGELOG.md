# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式,版本遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-10-27

首个公开版本。本项目重写自 [Sutera-Diffusus/dsh-windows-notify](https://github.com/Sutera-Diffusus/dsh-windows-notify)(MIT)v1.1.1/1.2.0:通知引擎与四套合成音效沿用其成果,其余按宿主 `0.2.1-rc.3` 现行插件规范全量重写。

### Added

- **待批准提醒** — 订阅官方 `approval/request` 事件(上游只覆盖提问场景)。
- **自定义提示音路径** — `soundPath` 指向任意 WAV 文件,优先于预设;路径失效告警并回落预设。
- **逐类开关与可配节流** — `enabled / completeEnabled / questionEnabled / approvalEnabled / minIntervalMs` 全部进配置(设置页可调)。
- **离线行为套件** — test-config(8)/ test-notify-core(11)/ test-fence(9):假 spawn、假时钟、假 io,零真实弹窗;`test.mjs` 静态 9 组 + 行为 3 组,含 lib import 纪律扫描(`@deepseek-ai/*` 只准在 adapter seam 动态 import)。
- **`lib/adapter/kernel.js` peer 解析 seam** — 对齐 dsh-pet 先例;宿主不可得时数据目录回落、不炸插件。
- 设置页「通知」四组:提醒开关 / 提示音与试听 / 自定义路径 / 免打扰与系统勿扰;配置归一化的 warnings 回显为黄条。
- locale(`meta.title`=「更好提醒」)与插件图标。

### Changed

- 配置权威源改为插件自有 `config.json`(宿主 `settings.register()` 已在 0.2.x 移除;HTTP 读写契约不变)。
- 路由挂自有前缀 `/dsh-better-reminder-7340/*`,**不挂 `/api`** — 插件前缀在最长前缀分发下会优先于内核 `/api`,等于绕过内核鉴权。
- 信任围栏与内核 `isTrustedApiRequest` 对齐:Host 回环必过、仅显式 `cross-site` 拒、Origin/Referer 附带才比对(桌面 WebView 的 fetch 不带 sec-fetch-site,要求必带会导致设置页全 403)。
- 提问提醒从猴补丁 `userQuestions.ask` 改为官方 `user-questions/request` 瀑布监听,恒 `return next()`。
- 完成提醒的 goal 续跑抑制按 `dsh-goal` 现行契约(`phase/activation/roundsStarted`)实现。
- 通知内核:`lastAt` 初始 `-Infinity`(修复刚启动进程第一条通知被节流误吞);构造时创建数据目录(修复 debug.log 静默丢弃);试听绕过节流/静音/免打扰并回传结果;新增 `dispose()`。
- 安装方式改为 dsh CLI/GUI 或真实目录两步登记(dependencies + bundles 双在位,悬空 bundles 条目会被宿主对账剪除)。

### Removed

- 任务栏角标(需要常驻 PowerShell 进程,与低占用目标冲突;上游实现保留在其仓库 git 历史)。
- junction 装机脚本与 apply-patch 时代的共存守卫、seed-config 一次性迁移。
- `completeMode: badge-only`(随角标移除)。
