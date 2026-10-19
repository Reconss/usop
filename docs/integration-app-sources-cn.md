# 国内安全编排常用 App 接入参考（USOP 集成应用）

> 更新：2026-10-18
> 适用：USOP「集成应用」功能（后端 `app/services/integrations/`、`app/routes/integrations_api.py`）

## 0. 已成功导入的 App

| App | app_key | 动作数 | 认证 | 状态 |
|---|---|---|---|---|
| 微步在线威胁情报 | `微步在线威胁情报` | 4（IP/域名/URL 查询） | apiKey（query `apikey`） | ✅ 已导入，配凭证即可用 |

导入方式：后端 `POST /api/integrations/apps/import`，或在 UI「集成应用 → 导入规范 → 粘贴规范」粘入 `docs/integration-specs/threatbook.yaml`。
导入后到卡片「凭证」里填你的微步 API Key（`apikey` 会自动作为 query 参数注入）。

## 0.1 内置节点的真实状态（2026-10-18 修复后）

剧本编辑器里的「数据 / 分析 / 动作」节点，此前 `enrich`(情报补全)、`notify`(发送通知) 是**空壳**，`block/isolate` 有字段名不匹配问题。本次已修复并实测：

| 节点 | 修复前 | 修复后 |
|---|---|---|
| **情报补全 enrich** | 只硬编码 VirusTotal IP；`type` 下拉被忽略；无 API Key 配置项；与已导入的「微步在线」完全脱钩 | 新增「情报源」(微步在线/VirusTotal) + 「API Key」配置项；`type` 真正区分 IP/域名/URL；凭证三级解析：节点 api_key → 已导入「微步在线」集成应用的凭证 → 环境变量；微步走 `https://api.threatbook.cn/v3/{ip\|domain\|url}/query` |
| **发送通知 notify** | 只写库内 Notification，渠道/webhook 全被忽略 | 按渠道真 POST 到 `webhook_url`（企业微信/钉钉 text、飞书 text、Slack text、通用 JSON）；保留库内记录。**注意**：钉钉/飞书加签模式不支持，机器人安全设置用「关键词/IP 白名单」 |
| **IP 封堵 block** | UI 字段 `api_url/api_token` 与 handler 读的 `device_api/device_token` 不一致 → 外部封堵路径是死代码 | 已对齐，配 `api_url`+`api_token` 即真实 POST 到防火墙设备 |
| **主机隔离 isolate** | 实际调用 `block_ip` 封 IP，并非隔离主机 | 配 `api_url` 走 EDR/SDN 隔离 API；未配则降级封 IP 并明确提示需接 EDR |

配套模板（导入即用，再填真实 base_url + 认证）：
- `docs/integration-specs/firewall-block-template.yaml` — 通用防火墙封堵
- `docs/integration-specs/edr-isolate-template.yaml` — 通用 EDR 主机隔离

> 仍真实可用：`query`(数据查询)、`create_ticket`(创建工单，写 EventAction 表 + 可选外部推送)。

## 1. 国内 App 与 Shuffle 国际 App 的本质区别

- **国际 app**：Shuffle/openapi-apps 仓库里有现成 OpenAPI 文件，可 `raw.githubusercontent.com/...` 直接拉。
- **国内 app**：安全厂商**几乎不把 OpenAPI 文件放到公开仓库**。要接入只能两条路：
  1. 厂商开发者门户/开放平台提供 `swagger.json` / `openapi.json` 下载 → 粘进 USOP 导入；
  2. 只有网页文档、没文件 → 按 `threatbook.yaml` 的骨架**手写 spec**（见第 4 节）。

## 2. 国内常用 App 分类与"找规范"入口

| 类别 | App | 编排用途 | 找 API/规范入口 |
|---|---|---|---|
| 通知协同 | 企业微信 群机器人 | 告警推群 | `open.work.weixin.qq.com`（搜"群机器人/消息推送"） |
| | 钉钉 自定义机器人 | 告警推群 | `open.dingtalk.com/document/development/custom-bot-to-send-group-chat-messages` |
| | 飞书 自定义机器人 | 告警推群/卡片 | `open.feishu.cn/document/uktmuktmuktm/uctm5yjl3eto24ynxkjn` |
| 威胁情报 | 微步在线 ThreatBook | IP/域名/URL/文件查情 | `x.threatbook.cn/apiDocs`（已导入） |
| | 360/腾讯/阿里云/绿盟/安恒/奇安信 威胁情报 | 情报富化 | 各厂商威胁情报中心开放 API 页 |
| 云安全 | 阿里云（云安全中心/WAF/RAM） | 云上资产/封禁/取证 | `help.aliyun.com/document_detail/`（搜"API 参考"） |
| | 腾讯云（主机安全/云镜/WAF） | 同上 | `cloud.tencent.com/document/api` |
| | 华为云（HSS/CFW/WAF） | 同上 | `support.huaweicloud.com/api`（CFW 有公开 API 参考） |
| 安全厂商 SOC/EDR/NDR | 奇安信（天眼/SOC）、深信服（AF/EDR/SIP）、绿盟、启明星辰、安恒 AiLPHA、天融信 | 拉告警/下发封禁/取证 | 各厂商产品"开放接口/REST API"文档 |
| 工单/CMDB | 蓝鲸 BlueKing、禅道、TAPD | 自动开处置工单 | 蓝鲸标准运维 API；禅道官方 API |

## 3. 协同机器人（企业微信/钉钉/飞书）：为什么走"手动 HTTP 节点"而非导入

USOP 集成应用的 body 是**扁平字段**（`importer.render_request` 拼扁平 JSON），而这三个机器人的消息体是**嵌套结构**
（如企业微信 `{"msgtype":"text","text":{"content":"..."}}`），导入后会拼成错误结构被对端拒绝。
且钉钉、飞书"加签"模式需**每次请求动态算 HMAC 签名**，USOP 当前只支持 `apiKey/bearer/basic` 静态注入，算不了。

**正确做法**：剧本里插入「手动 HTTP 节点」（模式 B），直接 POST 到 webhook。
- 企业微信：无需签名 → 直接用 `wecom-webhook-example.json`
- 钉钉：安全设置选「自定义关键词」→ 用 `dingtalk-webhook-example.json`
- 飞书：安全设置选「自定义关键词」或「IP 白名单」→ 用 `feishu-webhook-example.json`

（这三个示例文件在 `docs/integration-specs/` 下，含完整 URL/Body。）

## 4. 手写 spec 的最小骨架（适配国内只有网页文档的厂商）

```yaml
swagger: "2.0"
info:
  title: <厂商名> API
  version: "1.0"
  description: <一句话说明>
host: <api.host.com>
schemes: [https]
basePath: /api
securityDefinitions:
  apiKey:
    type: apiKey
    in: header
    name: Authorization
paths:
  /<path>:
    post:
      operationId: <actionId>
      summary: <动作名>
      parameters:
        - name: target
          in: query
          required: true
          type: string
```
认证（`auth_type`）支持：`none` / `apiKey`(header 或 query) / `bearer` / `basic`。
**不支持**：cookie-token 登录态、AK/SK 动态签名（华为云/阿里云 SDK 式鉴权）、HMAC 加签。这类需要厂商真实接口 + 后续给引擎加自定义动作。

## 5. 防火墙专题

**国内防火墙厂商（确实存在，编排里常用于"高危 IP 自动封禁"）：**
深信服 AF、奇安信网神、天融信、山石网科、华为云 CFW、启明星辰、绿盟。

**为什么不能像微步那样"直接导入"：**
1. **无公开 OpenAPI 文件**：深信服/天融信/山石是产品私有 API（文档在 support 站点/博客），没有可下载的规范；贸然按记忆写端点 = 编造接口，封禁类接口又是**安全敏感操作**，错端点会封错 IP 或静默失败，坚决不做。
2. **鉴权不被引擎支持**：深信服用「登录拿 token → Cookie 携带」两步鉴权；华为云 CFW 用 AK/SK 签名或 X-Auth-Token。均超出当前 `apiKey/bearer/basic` 静态模型。

**要导入某款防火墙，请给我：**
- 设备型号 + 版本；
- 该设备的**真实 API 文档或具体接口地址+字段**（最好是官方 swagger/openapi）；
- 鉴权方式（如"Bearer Token，从 /login 拿"）。

我据此写精确 spec 并导入；若鉴权是 Cookie/签名类，我会先给引擎补一个对应的自定义动作，再接入。

## 6. 已知代码改动（2026-10-18）

- `app/services/integrations/importer.py::_slugify` 已修改，**保留 CJK**。原实现会把中文标题整体清空成 fallback `app`，导致中文名 App 的 `app_key` 全部撞成 `app` 并触发 `_n` 后缀冲突；修复后中文 app_key 正常（如 `微步在线威胁情报`）。
