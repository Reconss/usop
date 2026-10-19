# Tracecat SOAR 平台本地部署与 USOP 对接研究报告

> 版本：v1.0 ｜ 日期：2026-10-18 ｜ 环境：macOS (Apple Silicon, 32GB) + OrbStack Docker
> 关联项目：USOP 统一安全运营平台（/Users/codes/usop）

---

## 1. 执行摘要

**Tracecat** 是 AGPL-3.0 开源（含 EE 付费例外）的 AI 原生安全自动化平台（SOAR），技术栈为 Python FastAPI + Next.js + Temporal 持久化工作流引擎 + PostgreSQL(pgvector) + Redis + S3 兼容对象存储，定位为 Tines / Splunk SOAR 的开源替代。

本次完成两项工作：

1. **本地部署**：以官方 docker-compose 为基底裁剪部署（12 个核心服务，agent 系列 4 个服务以 profile 隔离默认不启），运行于 `http://localhost:8090`，与 USOP 现有 14 个容器共存（32GB 内存充足）。部署中解决了镜像源限流问题（MinIO 采用官方二进制本地构建镜像替代）。
2. **对接研究 + PoC 验证**：梳理出 **USOP ↔ Tracecat 三条可行链路**（事件推送、处置回写、剧本互编排），并**已用真实环境端到端验证两条链路**：
   - **链路 A（USOP→Tracecat）**：POST webhook → Temporal 执行 → COMPLETED（含真实事件 payload）
   - **链路 B（Tracecat→USOP）**：Tracecat 工作流经保险库 JWT 调 USOP 事件 API → USOP Flask 日志实录 `GET /api/event-actions-api/events/6581 → 200`（真实事件数据）
   
   核心结论：**不需要改 Tracecat 一行代码，也不需要改 USOP 核心架构**——USOP 已有的 IntegrationApp + http_request 动作体系可直接把 Tracecat 的 OpenAPI 变成剧本节点；反向通过 Tracecat 的 webhook 触发器 + `core.http_request` 内置动作即可闭环。

**License 结论**：Tracecat 主体 AGPL-3.0。USOP 仅以**独立进程/容器 + HTTP API 交互**方式使用，不修改不分发其源码，无传染风险；与 Shuffle（backend AGPL + Go 单体）的调研结论一致，值钱的是取其能力而非并入库。

---

## 2. Tracecat 平台概览

### 2.1 产品定位

| 维度 | 说明 |
|---|---|
| 定位 | "The agentic security automation platform"——面向安全团队与 AI agent 的统一自动化平台 |
| 核心能力 | Agents & skills（prompts/tools/MCP/subagents）、Case management（案件跟踪）、Workflows（Temporal 持久化执行）、Tables（结构化存储）、Integrations（100+ 连接器） |
| 对标 | Tines、Splunk SOAR、Palo Alto Cortex XSOAR 的开源替代 |

### 2.2 License（重要）

- 主体：**AGPL-3.0**
- 例外（需付费 EE license）：`packages/tracecat-ee` 目录代码 + 门控 `ee` 功能（Multi-tenant、细粒度 RBAC/ABAC/OAuth2 scopes、Human-in-the-loop、Workspace version control、Metrics）。这些代码 "must not be redistributed, sold, used in production, or otherwise commercialized without permission"
- **对 USOP 的影响**：以独立服务部署 + HTTP 交互 = 合法使用 AGPL 软件；若二次开发 Tracecat 本体并对外分发，须开源改动。USOP 自身代码不受影响。

### 2.3 技术栈与架构

| 层 | 技术 |
|---|---|
| 后端 | Python 3 + FastAPI + SQLAlchemy + Pydantic（uv 管理） |
| 前端 | Next.js + TypeScript + React Query + Shadcn UI |
| 工作流引擎 | **Temporal**（持久化执行、重试、状态恢复） |
| 沙箱 | nsjail（可选 profile，默认 direct backend） |
| 数据库 | PostgreSQL（pgvector 镜像） |
| 缓存 | Redis |
| 对象存储 | S3 兼容（MinIO）——工作流产物、附件、registry |
| LLM 代理 | LiteLLM（agent 功能，默认 profile 关闭） |

**服务拓扑**（官方 compose 16 服务 → 本地裁剪后 12 个常驻）：

```
                    ┌────────────┐
   用户 ──8090────▶ │   caddy    │ 反向代理（/api→api:8000, /s3→minio:9000, /mcp→mcp:8099, 其余→ui:3000）
                    └─────┬──────┘
          ┌───────────────┼────────────────┐
          ▼               ▼                ▼
      ┌───────┐     ┌──────────┐     ┌──────────┐
      │  api  │     │   ui     │     │  minio   │
      │ :8000 │     │  :3000   │     │ :9000    │
      └───┬───┘     └──────────┘     └──────────┘
          │ depends
    ┌─────┴──────┬────────────┬─────────────┐
    ▼            ▼            ▼             ▼
┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐
│ worker  │ │executor │ │  redis   │ │postgres_db│
│(dsl)    │ │(actions)│ │  :6379   │ │  :5432   │
└────┬────┘ └────┬────┘ └──────────┘ └──────────┘
     └───────┬───┘
             ▼
      ┌────────────┐     ┌──────────────────┐
      │  temporal  │────▶│temporal_postgres_db│
      │  :7233     │     │      :5432       │
      └────────────┘     └──────────────────┘
      （temporal_ui 调试 UI 映射 8091）
```

裁剪说明：`agent-worker` / `agent-executor` / `litellm` / `mcp` 归入 compose profile `agents`，默认不启动（AI agent / MCP IDE 集成功能需要时 `docker compose --profile agents up -d` 启用）。核心 SOAR（工作流 + 案件管理 + 集成）不依赖它们。

---

## 3. 本地部署实录

### 3.1 部署信息

| 项 | 值 |
|---|---|
| 部署目录 | `/Users/codes/tracecat/`（docker-compose.yml、Caddyfile、.env、minio-build/） |
| 版本 | Tracecat **1.2.0**（2026-10-18 latest release） |
| UI 入口 | `http://localhost:8090` |
| API 入口 | `http://localhost:8090/api`（Swagger 文档 `/api/docs`，OpenAPI JSON `/api/openapi.json`） |
| Temporal UI（调试） | `http://localhost:8091` |
| 默认超管 | `admin@domain.com` / `password`（env.sh 约定，**登录后必须立即改密**） |
| 核心服务 | caddy, api, worker, executor, ui, postgres_db, temporal, temporal_postgres_db, minio, redis, temporal_ui, migrations(一次性) |
| Compose project | `tracecat`（网络 tracecat_core / tracecat_core-db(internal) / tracecat_temporal / tracecat_temporal-db(internal)） |

### 3.2 与 USOP 栈共存关系

- USOP 现有容器：usop_all(3266/5001), usop_postgres(5432), redis(6379), kafka(9092/29092), elasticsearch(9200), flink×3(8081/8083) 等 14 个
- Tracecat 全部使用**独立容器名/独立卷/独立网络**（`tracecat_*` 前缀），与 USOP 零端口冲突（8090/8091 为新增）
- 唯一命名冲突：官方 compose 的 `container_name: redis` 与 USOP 的 redis 容器重名 → 已移除该 container_name（服务名 DNS 不受影响）
- 预估内存占用：~2GB（api/worker/executor 各 ~300-400MB Python 进程，temporal ~300MB，其余较小）

### 3.3 部署中的两个关键问题与解法

**问题 1：镜像源限流。** 本机 Docker（OrbStack）配置了国内 registry-mirrors（1panel/daocloud/aliyun），ghcr.io 直连稳定，但 Docker Hub 的 `minio/minio`、`temporalio/ui:1.26.2` 等未被缓存的标签持续返回「免费节点当前繁忙」。tracecat 4.15GB 主镜像、ui、postgres、auto-setup、caddy、postgres:13、temporalio/ui:latest 均拉取成功；minio 系列（含 cgr.dev chainguard 失效 digest）全部失败。

**解法：MinIO 官方二进制 + 本地构建镜像。** 从 GitHub Releases 下载 `minio.linux-arm64.RELEASE.2024-01-16T16-07-38Z`（sha256 校验），以本地已有的 `redis:7-alpine` 为基础镜像构建 `minio/minio:latest`（busybox wget 健康检查替代镜像内不含的 `mc`），删除 `minio-init` 服务。功能与官方镜像等价（S3 API 稳定），代价是版本固定在 2024-01（对象存储场景无影响）。待镜像源恢复后可 `docker pull minio/minio:latest` 覆盖为官方镜像。

**问题 2：agent 系列服务资源占用。** 16 服务全启约 3.5-4GB。将 agent-worker / agent-executor / litellm / mcp 以 profile 隔离，核心 SOAR 场景 12 服务约 2GB，需要 AI agent 能力时再启用。

### 3.4 密钥与凭据（.env）

| 变量 | 生成方式 | 用途 |
|---|---|---|
| TRACECAT__DB_ENCRYPTION_KEY | `openssl rand 32 \| base64`（Fernet） | 加密 DB 中的敏感凭据 |
| TRACECAT__SERVICE_KEY | `openssl rand -hex 32` | 服务间认证 |
| TRACECAT__SIGNING_SECRET | `openssl rand -hex 32` | webhook 私密 URL 签名 |
| USER_AUTH_SECRET | `openssl rand -hex 32` | 用户登录 token |
| TRACECAT__POSTGRES_PASSWORD / MINIO_ROOT_PASSWORD / TEMPORAL__POSTGRES_PASSWORD | 随机生成 | 各数据库 |

并发参数按本地机器调低（threadpool 8 / activities 25 / executor 8）。

### 3.5 部署验证结果（2026-10-18 实测）

| 验证项 | 结果 |
|---|---|
| 12 服务全部就绪 | ✅ api healthy、ui 200、minio healthy（本地镜像）、temporal healthy、migrations 完成 |
| UI 可访问 | ✅ `http://localhost:8090` Playwright 无头浏览器登录成功，0 pageerror |
| 超管账号 | ✅ `admin@domain.com` / `Usop-Tracecat-2026!`（注册即提权，**生产必须改密**） |
| Temporal UI | ✅ `http://localhost:8091` |
| API 文档 | ✅ `/api/docs`、`/api/openapi.json`（200） |
| 工作流创建+提交+webhook 上线 | ✅ 两个 PoC 工作流跑通（见第 6 节） |
| 截图归档 | `tracecat/screenshot-login.png`、`tracecat/screenshot-workflows.png` |

---

## 4. 集成面分析

### 4.1 Tracecat 侧可用能力（源码级核实）

#### 4.1.1 Webhook 触发器（Tracecat 接收方）

- **端点**：`POST /api/webhooks/{workflow_id}/{secret}`（secret 内嵌 URL 路径，每工作流一个 webhook）
- **secret 是确定性派生**（源码 `tracecat/db/models.py::Webhook.secret`，已实测复算吻合）：
  ```python
  secret = sha256("wh-" + webhook_uuid.hex + TRACECAT__SIGNING_SECRET).hexdigest()
  ```
  URL 可直接从 `GET /api/workspaces/{wid}/workflows/{wf_id}/webhook` 取（响应含完整 url），无需落库查询。
- 源码 `tracecat/webhooks/dependencies.py::validate_incoming_webhook`：
  - secret 不匹配 → 401；webhook.status=offline → 400；方法不匹配 → 405
  - 支持 **CIDR IP 白名单**（webhook.allowlisted_cidrs，PATCH 更新）
  - 支持 `include_headers`（触发器可收完整请求头）
  - `?echo=true` 回显 payload（联调用）；`vendor=okta` 支持 GET 验证挑战
  - **`/wait` 后缀端点**：同步等待工作流完成后返回结果（PoC 联调神器）
- **激活流程**（实测）：创建 → `POST /workflows/{id}/commit`（即发布）→ `PATCH /workflows/{id}/webhook {"status":"online"}`。webhook 默认 offline，必须显式上线。
- **结论**：USOP 向 Tracecat 推送事件 = 向该 URL POST JSON，无需登录态。安全模型 = URL 保密 + 可选 IP 白名单。

#### 4.1.2 REST API（管理面）

Workspace 作用域（`/api/workspaces/{workspace_id}/...`）：

| 端点 | 用途 |
|---|---|
| `POST /workflows` | 创建工作流（提交 YAML DSL 定义） |
| `GET /workflows` / `GET /workflows/{id}` / `POST /workflows/{id}/commit` | 工作流管理 |
| `GET /workflow-executions` / `POST /workflow-executions/{id}/rerun` | 执行记录查询/重跑 |
| `POST /cases` 等（`tracecat/cases/router.py` prefix `/cases`） | 案件管理 |
| `POST /schedules` | 定时触发器 |

#### 4.1.3 认证方式

- 浏览器：basic auth 登录（**UI 是两步流程**：邮箱 → Continue → 密码 → Sign In；API 是 `POST /api/auth/login`，**表单格式** `username=&password=`，fastapi-users 实现）
- **超管引导机制（1.2.0 实测）**：没有预置默认用户。用匹配 `TRACECAT__AUTH_SUPERADMIN_EMAIL` 的邮箱调 `POST /api/auth/register`，`on_after_register` 自动提权 superuser（官方文档里的 admin@domain.com/password 默认账号已过时）
- **M2M：API Key**（`tracecat/auth/api_keys.py`），前缀 `tc_sk_`（个人）/ `tc_org_sk_`（组织）/ `tc_ws_sk_`（workspace）——USOP 服务端调用 Tracecat 管理面用这个
- OIDC / SAML SSO 可选（本地部署用 basic 即可）

#### 4.1.4 内置动作（Tracecat 执行方）

`packages/tracecat-registry` 提供核心动作（namespace `core`）：

| 动作 | 说明 |
|---|---|
| `core.http_request` | **通用 HTTP 请求**（url/method/headers/params/payload/auth/timeout）——Tracecat→USOP 的出口 |
| `core.transform.reshape` | 数据整形/分支标志位 |
| `core.transform.scatter` | 数组散开并行处理 |
| `core.table.lookup/insert_rows` | 工作区内结构化表读写 |
| `core.email` | 发邮件 |
| `core.python` | 沙箱 Python 脚本 |
| `core.sql` / `core.duckdb` | SQL 查询 |
| `core.workflow` | 子工作流调用 |

表达式语法：`${{ trigger.payload.field }}`、`${{ actions.<ref>.result }}` 引用上游输出。

#### 4.1.5 工作流 DSL（YAML，含实测踩坑）

**外部导入格式**（`POST /workflows` multipart 上传，顶层必须包 `definition:`）：

```yaml
version: 1
definition:
  title: USOP 事件富化
  description: 接收 USOP 事件 ID，调 USOP API 拉详情
  entrypoint:
    ref: fetch_event        # ⚠️ 不要写 expects（见坑3）
  triggers:
    - type: webhook
      ref: usop_enrich_webhook
      entrypoint: fetch_event
  actions:
    - ref: fetch_event
      action: core.http_request
      args:
        url: http://host.docker.internal:5001/api/event-actions-api/events/${{ TRIGGER.event_id }}
        method: GET
        headers:
          Authorization: Bearer ${{ SECRETS.usop.service_token }}
```

表达式语法：`${{ TRIGGER.<字段> }}`（webhook payload 字段，**实测可用**）、`${{ ACTIONS.<ref>.result }}`（上游输出）、`${{ SECRETS.<name>.<key> }}`（保险库）、`${{ FN.xxx() }}`（函数）、`${{ ENV.x }}`。

**实测踩坑（重要）**：
1. **`TRIGGER.<field>` 是 webhook payload 的正确引用**（官方 tests 与 docs 一致）。`inputs.<field>`（小写 inputs 是模板动作输入上下文）在本链路求值为 None。
2. **保险库必须建 Workspace 级 secret**（`POST /workspaces/{wid}/secrets`），org 级 secret（`/organization/secrets`）校验器看不到；**environment 必须与工作流 config.environment 一致（默认 `default`，不是 app 的 `production`）**，否则 commit 报 "Found 0 secrets matching"。
3. **entrypoint 不要写 `expects`**：带 `expects`（尤其 `type: any`）时 trigger payload 经 `normalize_trigger_inputs` 重建，字段会丢失/变 None；不带 expects 时 payload 原样进 TRIGGER（官方测试工作流均无 expects）。
4. 表达式 tokenizer 大小写敏感：`INPUTS`/`INPUT` 均无法解析，只有小写 `inputs` 是合法上下文。

### 4.2 USOP 侧可用能力（现状核实）

| 能力 | 位置 | 对接价值 |
|---|---|---|
| **IntegrationApp + http_request 动作** | `models/extensions.py:611`、`engine/actions.py:1657`、`routes/integrations_api.py` | USOP 剧本可直接调 Tracecat API；支持 auth_app_id 注入 bearer/apiKey/basic |
| **集成规范导入** | `services/integrations/importer.py`（OpenAPI2/3 + Shuffle 扩展） | 可导入 Tracecat 的 `/api/openapi.json` → 剧本画布出现 Tracecat 动作节点 |
| **剧本引擎** | `engine/playbook_engine.py`（query/code/ai/email/http_request/recall_experience 等原子节点） | 组合式编排，定时 Cron 触发器 |
| **事件 API** | `routes/events_api.py`（CRUD、状态机 STATUS_TRANSITIONS、AI 研判、批量状态） | Tracecat 回写处置结果的入口 |
| **事件创建 4 入口** | `engine/rule_engine.py:939`（规则命中）、`routes/events_api.py:252`（手动）、`routes/ai_judgment.py:417`（AI 研判闭环）、`routes/alerts_api.py:373`（告警升级） | USOP→Tracecat 推送的挂点 |
| **告警唯一真相源 = ES** | `utils/es_alerts.py`（alerts-valid/alerts-invalid） | Tracecat 可通过 USOP API 检索告警上下文 |
| **JWT 鉴权** | HS256（dev secret `usop-jwt-secret-dev-local`），payload `{user_id, username, exp}` | Tracecat 调 USOP 的认证（生产建议专用服务账号） |
| **SystemConfig 键值配置** | `system_config` 表 | 存放 Tracecat 地址/webhook secret 等集成配置 |

### 4.3 两侧能力互补结论

- USOP 强在：**多源日志接入 → 解析标准化 → 告警去重/关联（Flink）→ AI 研判** 的数据平面，以及轻量剧本编排
- Tracecat 强在：**Temporal 持久化执行（断点恢复/重试/长时等待）、案件管理、100+ 连接器、AI agent、加密保险库**
- 分工建议：**USOP 继续做检测与数据平面，Tracecat 做响应编排与案件平面**，两者通过 webhook/REST 松耦合

---

## 5. 对接架构设计

### 5.1 总体架构（三条链路）

```
                    ┌────────────────────────────────────────────┐
                    │                USOP (3266/5001)             │
                    │  日志源→Kafka→Flink关联→ES告警/PG事件        │
                    │  剧本引擎(Flask)  IntegrationApp  JWT鉴权    │
                    └──────┬───────────────────────────┬──────────┘
                           │ 链路A: 事件推送             ▲ 链路B: 处置回写
                           │ POST /api/webhooks/         │ PUT /events/<id>/status 等
                           │ {workflow_id}/{secret}      │ (Bearer tc_ws_sk_/JWT)
                           ▼                             │
                    ┌──────────────┐        ┌──────────┴─────────┐
                    │  Tracecat    │        │  Tracecat 工作流    │
                    │  (8090)      │◀──────▶│  core.http_request  │
                    │  webhook触发  │ 链路C  │  → USOP REST API    │
                    │  案件管理     │ OpenAPI │                     │
                    └──────────────┘ 互编排  └─────────────────────┘
```

- **链路 A（USOP→Tracecat，事件驱动）**：USOP 产生事件（规则命中/AI 闭环/告警升级）时，自动推送事件摘要到 Tracecat 对应工作流的 webhook，触发 enrichment/通知/建案件等响应流程。
- **链路 B（Tracecat→USOP，处置回写）**：Tracecat 工作流通过 `core.http_request` 调用 USOP 事件 API，回写状态（如标记 investigating、附 AI 分析结论）、创建/更新案件。
- **链路 C（双向互编排）**：① USOP 剧本导入 Tracecat OpenAPI → 画布直接拖出 Tracecat 动作节点；② Tracecat 工作流直接调 USOP REST API（链路 B 即其子集）。

### 5.2 链路 A 详细设计（USOP→Tracecat）

#### 推送内容契约（webhook payload）

> ⚠️ 实测：工作流 entrypoint **不要写 expects**，payload 原样进 `TRIGGER` 上下文，用 `${{ TRIGGER.字段 }}` 引用。

```json
{
  "event_id": 6581,
  "event_code": "EVT-20261018-0007",
  "title": "暴力破解成功登录",
  "severity": "high",
  "category": "Intrusion",
  "source": "waf-alert",
  "status": "new",
  "timestamp": "2026-10-18T02:00:00",
  "related_alerts": ["ALT-abc123"],
  "usop_url": "http://localhost:3266/#/events/6581"
}
```

#### 三种实现方案（按侵入性排序）

| 方案 | 机制 | 侵入性 | 适用 |
|---|---|---|---|
| **A1 统一钩子（推荐）** | 新增 `app/utils/soar_push.py`；在 `models/__init__.py` 对 `Event` 注册 SQLAlchemy `after_insert` 监听 → 事务提交后异步 POST webhook | 低（单点接入，4 个创建入口全覆盖） | 生产默认 |
| A2 剧本节点 | USOP 剧本 `http_request` 节点，url 配 Tracecat webhook，query 节点查事件后推送 | 无（纯配置） | 手动/定时场景先行验证 |
| A3 轮询推送 | scheduler 每 60s 查 `status='new'` 且未推送的事件，批量 POST | 低 | 与 A1 二选一 |

**A1 关键设计点**：
- 配置存 `SystemConfig`（key=`soar_config`）：`{enabled, webhook_url, event_filter: {severity: [high, critical], status: [new]}, timeout, max_retries}`
- 推送失败**不阻塞**事件创建（异步线程 + 失败重试 3 次 + 日志）
- 防抖：同一 event_code 5 分钟内不重复推
- 前端在「全局配置」新增「SOAR 对接」分区（复用现有 GlobalConfig 模式）：开关、webhook URL、测试连接按钮

#### USOP 侧代码改动清单（A1）

| 文件 | 改动 |
|---|---|
| `app/utils/soar_push.py`（新建） | `push_event_to_soar(event_dict)`：读 SystemConfig → httpx/fastapi 后台 POST → 重试与日志 |
| `app/models/__init__.py` | `event.listen(Event, 'after_insert', ...)` 注册（或 app factory 中注册，避免循环导入） |
| `app/routes/users_api.py` 或新蓝图 | `/soar-config` GET/POST（参照现有 smtp-config 模式） |
| `web/src/pages/GlobalConfig.tsx` | 「SOAR 对接」配置分区 |
| `web/src/services/api.ts` | soarApi |

### 5.3 链路 B 详细设计（Tracecat→USOP）

**认证**：在 Tracecat「组织/工作区 Secrets」存入 `usop_service_token`（USOP 签发的服务账号 JWT，或为 Tracecat 开一个只读+事件写权限的本地用户）。USOP 侧如需长期 token，建议后续加一个 `/auth/service-token` 端点（当前 dev JWT 手工签发可用：`jwt.encode({user_id, username, exp}, secret)`）。

**典型回写动作**（工作流内 `core.http_request`，**USOP 实际前缀为 `/api/event-actions-api`**，非 events-api）：

| 目的 | USOP 端点 | 方法 |
|---|---|---|
| 回写事件状态（受理/调查中） | `/api/event-actions-api/events/<id>/status` | PUT `{status, comment}` |
| 补充 AI 研判结论 | `/api/event-actions-api/events/<id>/ai-analyze` | POST |
| 查询事件列表/详情 | `/api/event-actions-api/events`、`/events/<id>` | GET |
| 富化后更新事件 extra_data | `/api/event-actions-api/events/<id>` | PUT |

**状态机约束**：必须遵守 `events_api.py::STATUS_TRANSITIONS`（new→acknowledged→investigating→resolved→closed；旁路 false_positive；closed 必填处置总结）。Tracecat 工作流里对状态推进要做分支判断，避免 400。

### 5.4 链路 C 详细设计（互编排）

**C1：USOP 剧本调用 Tracecat**（USOP 侧零代码）
1. Tracecat 创建工作流（如「外部威胁情报查询」），拿到 webhook URL（或 API）
2. USOP「集成应用」页导入 Tracecat OpenAPI（`http://localhost:8090/api/openapi.json`）或直接新建手动模式 App（auth_type=bearer，credential=API key）
3. 剧本画布拖出 http_request 节点，url 填 webhook/API 地址，上游节点输出用 `{{ 表达式 }}` 传参
4. 效果：USOP 剧本的「邮件通知」节点旁，可出现「触发 Tracecat 富化流程」节点

**C2：Tracecat 工作流调用 USOP**（见 5.3，即链路 B）

**分工原则**：
- 简单线性自动化（查数据→AI 分析→发邮件）→ USOP 剧本（已具备，如「每日安全运营报告」剧本 id=18）
- 复杂响应编排（多分支、人工等待、长时重试、案件跟踪）→ Tracecat 工作流
- USOP 剧本与 Tracecat 工作流可互相调用，形成分层编排

### 5.5 数据映射表

| USOP Event 字段 | Tracecat 对应 | 说明 |
|---|---|---|
| `id` / `event_code` | webhook payload `event_id`/`event_code`；案件 `external_ref_id` | 双向关联键，回写时原样带回 |
| `title` | 案件 title | — |
| `description` | 案件 description | — |
| `severity` (critical/high/medium/low) | 案件 severity（映射表自定） | 建议 critical/high→P1/P2 |
| `status` | 案件 status | 走 USOP 状态机回写 |
| `source` | 案件 source / 标签 | 如 waf-alert |
| `raw_log` | 案件附件/证据字段 | — |
| `extra_data.ai_analysis` | 案件 findings | AI 研判结论 |
| `related_alerts` | webhook payload 数组 | ES 告警 id 列表 |
| `timestamp` | 案件 created_at | ISO8601 |

---

## 6. 分阶段实施计划

| 阶段 | 内容 | 状态 |
|---|---|---|
| **P0 部署** | 官方 compose 裁剪部署、密钥生成、基础服务验证、镜像源问题处置 | ✅ 已完成 |
| **P1 双向连通验证** | ① Tracecat webhook 工作流收 USOP 事件（reshape echo）；② Tracecat 工作流 `core.http_request` 调 USOP `/api/event-actions-api/events/<id>`（保险库 JWT）拉真实事件 | ✅ **已验证**（见 6.1） |
| **P2 事件自动推送** | 落地 A1 方案：`soar_push.py` + after_insert 钩子 + SystemConfig + 全局配置 UI + 前端测试连接 | 待实施（方案已定型） |
| **P3 Tracecat 工作流模板** | 高危事件自动 enrichment（调 USOP 告警检索）、威胁情报查询、IM/邮件通知、案件自动创建 | 待实施 |
| **P4 USOP 剧本集成节点** | 导入 Tracecat OpenAPI 为 IntegrationApp；「每日安全运营报告」剧本增加「触发 Tracecat 深度分析」分支 | 待实施 |
| **P5 生产加固** | Tracecat 服务账号 + 最小权限；webhook IP 白名单（仅 USOP 容器网段）；.env 纳入密钥管理；如需外网 webhook 暴露则加反代+TLS | 待实施 |

---

## 6.1 P1 双向连通 PoC 验证实录（2026-10-18）

### 链路 A：USOP → Tracecat（webhook 推送）

- **PoC 工作流**：`wf_6bTKIwuPR59Zy9f1vo8D2o`「USOP 事件接收（P1 连通验证）」（webhook trigger → reshape echo），YAML：`tracecat/test-usop-event.yml`
- **触发**：`POST http://localhost:8090/api/webhooks/wf_6bTKIwuPR59Zy9f1vo8D2o/<secret>`，body `{"event_id":123,"event_code":"EVT-20261018-0007","title":"暴力破解成功登录","severity":"high",...}`
- **结果**：`200 {"message":"Workflow execution started","wf_exec_id":".../exec_5JLwYrImX3aVKO42VIU5sY"}` → Temporal 执行 **COMPLETED**（trigger_type=webhook，~2s）
- **结论**：USOP 侧只需一个 HTTP POST 即可驱动 Tracecat 工作流，无需任何 Tracecat 客户端库。

### 链路 B：Tracecat → USOP（保险库凭据回拉）

- **PoC 工作流**：`wf_5Vs4Bqu25628TUahYQz8v9`「USOP 事件富化（P1 回写验证）」（webhook → `core.http_request` GET USOP 事件详情），YAML：`tracecat/test-usop-enrich.yml`
- **凭据**：workspace 级 secret `usop.service_token`（USOP dev JWT，HS256，2h 有效期；生产应建专用服务账号）
- **触发**：`POST <webhook>/wait`（同步等结果），body `{"event_id":6581}`（6581 = USOP 真实事件）
- **结果**：工作流 COMPLETED；**USOP Flask 访问日志铁证**：
  ```
  192.168.107.1 - - [18/Oct/2026 05:31:39] "GET /api/event-actions-api/events/6581 HTTP/1.1" 200 -
  ```
- **结论**：Tracecat 工作流可携带加密保险库中的 JWT 穿透调用 USOP REST API 并取回真实数据；`host.docker.internal:5001` 容器间可达（OrbStack）。

### 遗留测试资产（保留作参考模板）

| 资产 | 位置 |
|---|---|
| PoC 工作流 YAML ×2 | `/Users/codes/tracecat/test-usop-event.yml`、`test-usop-enrich.yml` |
| 已发布工作流 ×2 | Tracecat UI → Default Workspace → Workflows（webhook 已 online） |
| 保险库 secret | workspace secret `usop`（default 环境，key: service_token，dev JWT 2h 后会失效，需更新） |
| 截图 | `/Users/codes/tracecat/screenshot-login.png`、`screenshot-workflows.png` |

> 说明：JWT 有效期 2 小时，过期后需重新签发并更新 secret（P2 实施时会改为 USOP 专用服务账号长效方案）。

---

## 7. 风险与注意事项

1. **AGPL 合规**：仅以独立服务 + HTTP 交互使用 Tracecat 无传染；**不要**把 Tracecat 源码并入 USOP 代码库再分发。`packages/tracecat-ee` 及门控 EE 功能未授权不得用于生产。
2. **凭据安全**：Tracecat 的 secret 保险库加密密钥是 `TRACECAT__DB_ENCRYPTION_KEY`（.env 明文）；生产应纳入密钥管理系统。USOP→Tracecat 的 webhook URL 含 secret，等同于凭据，勿进 git/日志。
3. **网络安全**：compose 已将 `core-db`/`temporal-db` 设为 internal 网络；USOP→Tracecat 容器间通信用 `host.docker.internal`（8090）或建联合网络。webhook 建议配 `allowlisted_cidrs` 仅放行 USOP 出口 IP。
4. **资源**：Tracecat 12 服务 ~2GB 内存；与 USOP Flink(1.4G)+ES(~1G) 共存在 32GB 机器上余量充足，但若同机再跑重负载需留意。
5. **版本锁定**：MinIO 本地构建镜像固定在 RELEASE.2024-01-16（镜像源限流的降级方案），对象存储功能不受影响；镜像源恢复后拉官方标签覆盖即可。
6. **Temporal 调试 UI 版本**：temporalio/ui 用了 `latest`（1.26.2 未拉到），与 temporal server 1.27.1 仅版本号差异，调试用途无碍。
7. **数据主权**：案件数据落 Tracecat 自己的 PG；如需与 USOP events 表双写，走链路 B 回写而非直接读对方 DB（两侧 schema 独立演进）。

---

## 8. 附录

### 8.1 部署文件清单（/Users/codes/tracecat/）

| 文件 | 说明 |
|---|---|
| `docker-compose.yml` | 官方 1.2.0 基底 + 本地裁剪（agent profile 隔离、redis container_name 移除、minio 本地镜像、temporal-ui 8091） |
| `Caddyfile` | 官方反代配置 |
| `.env` | 全部密钥与配置（含本地调低并发参数） |
| `minio-build/Dockerfile` + `minio` 二进制 | 本地构建 minio 镜像用 |
| `local_registry/` | Tracecat 本地 registry 挂载点（默认禁用） |

### 8.2 常用运维命令

```bash
cd /Users/codes/tracecat
docker compose ps                          # 状态
docker compose logs -f api                 # API 日志
docker compose --profile agents up -d      # 启用 AI agent 系列服务
docker compose restart api worker executor # 改后端配置后重启（bind mount 场景不适用，均为镜像内代码）
docker compose down                        # 全停（数据在卷里保留）
docker compose down -v                     # 全停并删卷（慎用）
```

### 8.3 Tracecat 关键端点速查

| 端点 | 说明 |
|---|---|
| `POST /api/webhooks/{workflow_id}/{secret}` | 触发工作流（外部系统入口） |
| `GET /api/docs` | Swagger UI |
| `GET /api/openapi.json` | OpenAPI 规范（可导入 USOP 集成应用） |
| `POST /api/auth/login` | basic 登录（session） |
| `/api/workspaces/{wid}/workflows` | 工作流 CRUD |
| `/api/workspaces/{wid}/workflow-executions` | 执行记录 |
| `/api/workspaces/{wid}/cases` | 案件管理 |
| `/api/workspaces/{wid}/schedules` | 定时触发器 |

### 8.4 USOP 侧对接相关端点速查（前缀经实测校正）

| 端点 | 说明 |
|---|---|
| `GET/POST /api/users-api/smtp-config` | 参照模式：SOAR 配置端点将照此实现 |
| `GET /api/event-actions-api/events` | 事件列表（Tracecat 可查；**注意前缀是 event-actions-api**） |
| `PUT /api/event-actions-api/events/<id>/status` | 状态回写（受状态机约束） |
| `POST /api/event-actions-api/events/<id>/ai-analyze` | AI 研判回写 |
| `/api/integrations/apps/import` | 导入 Tracecat OpenAPI（P4 用） |
| USOP JWT 签发（dev） | `docker exec usop_all python3 -c "import jwt,datetime;print(jwt.encode({'user_id':1,'username':'admin','exp':datetime.datetime.utcnow()+datetime.timedelta(hours=2)},'usop-jwt-secret-dev-local',algorithm='HS256'))"` |

---

*报告完。部署验证结果见第 3 节与日志；P1 连通验证结论将在实施后回填。*
