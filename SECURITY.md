# Security Policy

## 支持版本 / Supported Versions

| 版本 | 支持 |
| --- | --- |
| 1.x | ✅ |

## 数据处理 / Data handling

dsh-better_reminder 的设计边界是**本机提醒**,不收集、不上传任何数据:

- **配置**:仅本机 `$DSH_HOME/dsh-better_reminder/config.json`;调试日志同目录 `debug.log`;
- **通知正文**:含会话标题与最后一条助手回复的前 100 字符(与你屏幕所见同级),经 Windows 通知中心落盘——介意可关 `completeEnabled`;
- **凭据**:不读取任何凭据、令牌或环境密钥;
- **网络**:运行期**零网络请求**,插件自身不外发任何数据;
- **平台边界**:非 Windows 平台所有提醒路径自动跳过。

## 攻击面与缓解 / Surface & mitigations

- **HTTP 面**:仅两条路由(`/dsh-better-reminder-7340/config`、`/preview`),自带与内核 `/api` 同语义的信任围栏:Host 必须回环(防 DNS rebinding)、`sec-fetch-site` 显式 `cross-site` 拒、Origin/Referer 附带则比对同源;不挂 `/api` 前缀(插件路由在最长前缀分发下优先于内核 `/api`,挂 /api 会绕过内核鉴权);请求体上限 64 KiB。
- **Toast 注入**:载荷经 Base64 JSON 传递(规避命令行转义差异),文本入 Toast XML 前做转义与长度截断(`toast.ps1` 的 `To-XmlText`)。
- **自定义音效路径**:用户显式配置的 WAV 才播放;路径失效只回落内置资产,不猜测、不遍历目录。
- **事件监听**:全部为瀑布 pass-through,不吞、不改写任何决策;无猴补丁,插件卸载零残留。

## 报告漏洞 / Reporting a Vulnerability

发现安全问题请通过 [GitHub Security Advisory](https://github.com/Achoa9010/dsh-better-reminder/security/advisories/new) 私下报告,或开 Issue 标注 `security`。请勿公开利用细节;确认后会在下个版本修复并在 CHANGELOG 致谢。
