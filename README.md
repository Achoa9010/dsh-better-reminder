# dsh-better_reminder · 更好提醒

**Windows 级任务提醒,随 DeepSeek Harness 而来。** 回合结束、Agent 抛出选项卡、工具调用等待批准——三种时刻各弹一条系统 Toast,并播放**你指定的提示音**。免打扰时段、跟随系统勿扰、完成合并摘要、全局节流,全部在设置页调整,保存即生效。

以 DeepSeek Harness 原生 profile bundle 形态安装,**零侵入**:不修改任何内置包文件、不用符号链接、事件全部订阅宿主官方 seam。与其他插件(dsh-pet 等)的和平共处机制见下文[共存](#与其他插件共存--coexistence)。

> English: system toasts with a custom notification sound for task completion, decision prompts, and pending approvals — a native DSH profile plugin with zero patching of built-in packages.

## 功能特性 / Features

- **三类提醒** — 回合完成(`agent/status` running→idle,仅根 Agent,子代理不打扰)、提问选项卡(`user-questions/request`)、待批准(`approval/request`)。全部为官方瀑布事件监听,恒 `return next()`,不吞决策、不改写别人的行为。
- **自定义提示音** — 四套自制合成音(柔和/轻快/舒缓/清脆,零版权风险)任选,或指向你自己的 WAV 文件;设置页可试听;路径失效自动回落预设并在日志留痕。
- **完成合并摘要** — 5 秒窗口内的多个完成合并为一条 `DSH 任务完成 ✅(N)`,列出各会话标题。
- **打扰控制** — 全局节流(默认 2500 ms)、免打扰时段(支持跨午夜)、跟随 Windows 专注助手自动静音、三类提醒独立开关、goal 自动续跑期静默。
- **低占用** — 无常驻进程:提醒瞬间按需拉起一个 PowerShell,播完即退(百毫秒级)。

## 与其他插件共存 / Coexistence

DSH 的插件生态很小,但插件之间抢事件、抢路由、抢资源是真的会发生。本插件的"零侵入"不是口号,逐条可查:

- **事件当旁观者,不当拦路者** — 三类提醒全部是官方瀑布事件(`agent/status`、`user-questions/request`、`approval/request`)的监听器,恒 `return next()`:不吞事件、不改载荷、不决定别人的回合。同一个"提问"事件,[dsh-pet](https://www.npmjs.com/package/dsh-pet) 之类的插件若也想反应,拿到的载荷与本插件互不影响。
- **零猴补丁** — 不覆写宿主或任何其他插件的服务与属性。早期形态对 `userQuestions.ask` 的打补丁写法在 1.0 已废弃,改为纯官方事件订阅。
- **全部资源自带命名空间** — 路由挂 `/dsh-better-reminder-7340/*`、配置在 `~\.dsh\dsh-better_reminder\`、设置页只加自己的「通知」分区、bundle 行 `better-reminder`——与 dsh-free-search、dsh-our-free-model、dsh-workspace-memory 等的挂载点两两不重叠,插件更新互不重写。
- **不抢常驻与帧率** — 无常驻进程、无后台轮询;与 dsh-pet 这种带桌面动画的插件各干各的,本插件只在提醒瞬间拉起一次性 PowerShell,几百毫秒即退。
- **声音互不占道** — 提示音经独立子进程播放(`SoundPlayer.PlaySync`),不占用宿主音频通道;GUI 内其他音效照常。
- **实测并存** — 作者桌面 profile 上,与 dsh-pet / dsh-our-free-model / dsh-free-search / dsh-workspace-memory 长期同场运行至发布。

唯一要注意的**功能撞车**(不是冲突,是双份提醒):若同时启用另一个通知类插件(例如旧版 `dsh-windows-notify`),同一事件会响两次——二选一,或把另一插件的提醒关掉。

## 安装 / Install

要求:Windows 10/11;DeepSeek Harness `0.2.1-rc.3`(其他 0.2.x 未验证,接口有兼容性声明提示)。

### 方式一:dsh CLI(web profile,推荐)

```powershell
dsh plugin --profile web add dsh-better_reminder
```

包已发布到 npm(`npm view dsh-better_reminder` 可查)。桌面端(Electron)profile 由应用独占,CLI 会被拒——桌面端请用 GUI 或方式二。

### 方式二:手工安装(web / desktop 通用)

1. 把发布包(`npm pack` 的 tgz 或 Release zip)的文件放入
   `<DSH_HOME>\profiles\<profile>\node_modules\dsh-better_reminder\` —— **必须是真实目录**,不能是 symlink/junction(桌面端启动闸门会拒绝);
2. 在 profile 的 `package.json` 登记两处:`dependencies["dsh-better_reminder"]` 与 `dsh.profile.bundles` 各加一项。**两处都要**——只写 bundles 会被宿主对账剪掉;
3. 重启 DSH(bundle/client 声明不热加载)。

注意事项:在应用运行中保存 profile 的 `package.json` 会触发组合热重载,请确认第 1 步已完成;PowerShell 写回该文件时保持 UTF-8 **无 BOM**。

### 卸载 / Uninstall

GUI 停用,或删 `node_modules\dsh-better_reminder` 与 `package.json` 里的两处登记,重启。配置与日志留在 `$DSH_HOME\dsh-better_reminder\`;彻底清除即删掉该目录,重装后继续生效。

## 配置 / Configuration

设置页 → 通知,保存即生效。权威源是 `$DSH_HOME\dsh-better_reminder\config.json`,直接改文件也生效(下次通知读取时)。

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `completeEnabled` / `questionEnabled` / `approvalEnabled` | `true` | 三类提醒独立开关 |
| `sound` | `soft` | 预设:`soft` / `brisk` / `calm` / `crisp` |
| `soundPath` | `""` | 自定义 WAV **绝对路径**,优先于预设;非 WAV 格式(mp3 等)系统播放器不认,请先转 WAV |
| `soundEnabled` | `true` | 只弹不出声设 `false` |
| `minIntervalMs` | `2500` | 全局节流,0~60000 |
| `completeMerge` | `true` | 5 秒合并摘要 |
| `quietHours.enabled` / `start` / `end` | `false` / `22:00` / `08:00` | 免打扰时段,支持跨午夜 |
| `respectSystemDnd` | `true` | 跟随 Windows 专注助手/勿扰 |

环境变量:`DSH_NOTIFY=0` 整体禁用(最高优先级)。

## DSH 更新后怎么体检

宿主还在 0.x,rc 之间改事件与服务形状不是没发生过。更新后按序自查,十几分钟定论:

```powershell
node test.mjs          # ① 离线全套件,不依赖宿主:围栏/配置/节流/合并/资产/编码
# ② GUI 插件页确认本插件 enabled;宿主日志 grep "dsh-better_reminder"
#    激活成功会打一行「已挂载」,没有 = fiber 失败,日志里有原因
# ③ 设置页点「试听」出声 = 端到端通;④ 让 Agent 跑一个回合等完成音
```

对宿主版本的依赖按"更新时会不会碎"排序(碎也是这个顺序):兼容性声明(故意设的告警牌)→ 事件/服务契约(`agent/status`、`user-questions/request`、`approval/request`、`agents.roots()`、`goals.get()`)→ `settings.section` 插槽 → 主题 token → 通知引擎(依赖 Windows/Node,**不依赖 DSH**)。升级后先对齐 `package.json` 的 `peerDependencies` 与 `dsh.compatibility.dshReleases`,再跑清单。

## 架构 / How it works

- **`cordis.patch.yml`** — bundle 补丁,向 profile 组合插一行 `better-reminder`;`dsh.client` 声明浏览器半侧(`web`/`immediately`)。
- **`lib/index.js`(宿主半边)** — 三个事件监听 + 两条自有路由(`GET/POST /dsh-better-reminder-7340/config`、`POST /preview`)。前缀**故意不用 `/api`**:插件路由在最长前缀分发下会优先于内核 `/api`,挂 /api 等于绕过内核鉴权。路由自带信任围栏,与内核 `isTrustedApiRequest` 同语义(Host 回环必过、仅显式 cross-site 拒、Origin 附带才比对)。
- **`lib/adapter/kernel.js`** — 唯一允许 `import("@deepseek-ai/*")` 的 seam:这些包由宿主提供、不在 profile 树里,ESM 静态 import 按包位置解析不到,所以动态 + 必带降级。
- **`lib/config.js`** — 配置权威源:任何半残配置折叠成完整形状并逐项告警;patch 深合并 → 原子落盘(tmp+rename)→ 广播变更;坏文件回落默认,绝不让宿主启动失败。
- **`lib/notify-core.js`** — 副作用全部收敛:Base64 载荷(Windows 命令行不转义 `&`)、PowerShell 绝对路径、不用 detached/unref(实测子进程会被秒杀)、一切 best-effort;节流、5s 合并、免打扰跨午夜、试听穿透。
- **`scripts/toast.ps1`** — WinRT Toast + `SoundPlayer.PlaySync`(`Play()` 会随进程退出被掐断);专注助手状态读注册表(主路径+备用扫描)。
- **`lib/client.js`** — 设置页「通知」:只 `require("react")`,控件全自绘(`role="switch"`+`aria-checked`),样式只用 `--dsw-alias-*` token(亮暗主题自动跟随)。

## 数据与隐私 / Data & privacy

- 配置与日志仅本机 `$DSH_HOME\dsh-better_reminder\`,纯 JSON;卸载即删,不留痕;
- **不联网、无遥测、不读取任何凭据**;插件自身零外发;
- Toast 正文含会话标题与最后一条助手回复的前 100 字符(经 Windows 通知中心落盘)——介意就关 `completeEnabled`;
- 仅 Windows:非 win32 平台所有路径自动跳过。

## 已知限制 / Known limitations

- 仅 Windows 10/11(Toast 依赖 WinRT);
- 自定义音效仅 WAV(`System.Media.SoundPlayer` 限制),mp3 静默不响;
- Toast 无按钮(Windows 对未打包应用不支持激活回调);
- 无任务栏角标:角标需要常驻进程,与"低占用"取舍冲突,故不在 v1(见 CHANGELOG);
- 安装/升级后需重启 DSH。

## 开发 / Development

```bash
pnpm install --ignore-scripts   # dev 依赖仅 js-yaml;peer 由宿主提供(.npmrc 已禁自动装)
node test.mjs                   # 静态 9 组 + 离线行为 29 项(假 spawn/假时钟,零真实弹窗)
node pack.mjs                   # dist/ 生成 npm tgz 与完整源码 zip
```

约定见 [CONTRIBUTING](CONTRIBUTING.md)。CI:push/PR 跑校验,tag `v*` 自动 Release(tgz + zip + SHA256SUMS)。

## 来源与许可证

本项目重写自 [Sutera-Diffusus/dsh-windows-notify](https://github.com/Sutera-Diffusus/dsh-windows-notify)(MIT,© 2026 Sutera-Diffusus):通知引擎(`notify-core`/`toast.ps1` 的 Windows 坑位经验)与四套合成音效沿用其成果;挂载层、设置页与工程骨架按宿主现行插件规范全部重写(差异清单见 [CHANGELOG](CHANGELOG.md))。

[MIT](LICENSE) © 2026 Sutera-Diffusus(上游)与 Achoa(重写部分)
