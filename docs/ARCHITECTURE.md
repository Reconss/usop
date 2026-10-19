# 系统架构

> 更新时间：2026-10-17。本文档描述当前生产实际运行状态，所有事实均经过运行环境核对。

## 1. 总体架构

```
┌─────────────┐   ┌──────────────┐   ┌─────────────────────────┐   ┌──────────────────┐
│  日志源/设备  │ → │ Kafka        │ → │ 解析管道（usop_all）      │ → │ Elasticsearch    │
│  WAF/IDS/…  │   │ raw-logs     │   │ 标准化 → 过滤 → 去重 → 分流 │   │ alerts-valid     │
└─────────────┘   └──────────────┘   └─────────────────────────┘   │ alerts-invalid   │
                                                                    └────────┬─────────┘
                             ┌────────────────────────────────────────────────┤
                             ▼                                                ▼
                   ┌──────────────────┐                            ┌──────────────────┐
                   │ Flink 关联分析    │                            │ 查询/聚合/研判     │
                   │ USOP-Correlation │                            │ （usop_all 后端）  │
                   │ -Analysis        │                            └────────┬─────────┘
                   └────────┬─────────┘                                     ▼
                            ▼                                      ┌──────────────────┐
                   ┌──────────────────┐                            │ PostgreSQL       │
                   │ PG events（事件） │                            │ 用户/事件/规则/审计│
                   └──────────────────┘                            └──────────────────┘
```

## 2. 容器拓扑与端口

| 容器 | 端口 | 职责 |
|---|---|---|
| `usop_all` | **3266**（nginx 前端）/ **5001**（Flask API） | 前端静态资源 + 后端服务 + 解析管道，`server-python/app` bind mount 到 `/app/app` |
| `usop_postgres` | 5432 | 业务库 `usop_security`（用户/事件/规则/审计/剧本） |
| `redis` | 6379 | 去重窗口与缓存 |
| `kafka` | 9092 / 29092 | 消息总线（KRaft 模式，无 ZooKeeper） |
| `elasticsearch` | 9200 | **告警唯一真相源**（`alerts-valid` / `alerts-invalid`） |
| `flink-jobmanager` | 8081（UI）/ 6123 | 常驻作业 `USOP-Correlation-Analysis` |
| `flink-sql-gateway` | 8083 | SQL 作业提交入口 |
| `usop-flink-taskmanager-1/2` | — | TaskManager ×2 |

## 3. 数据流水线

### 3.1 物理订阅链路（单向单层）

1. **设备 topic → 标准化线程**：数据源纳管后，标准化线程按 `ParseProfile`（9 种解析方式）解析原始日志，产出标准化告警 → `standardized-alerts`
2. **dispatch 消费 standardized**：按告警过滤规则分流（含白名单过滤）、Redis 去重 → 产出 `valid-alerts` / `invalid-alerts`
3. **存储路由**：消费 valid/invalid 按存储策略写入 ES 对应索引

### 3.2 Topic 语义约定

- **Topic 纳管** = 存在对应 `DataSource.kafka_topic`；`GET /pipeline/device-topics` 只返回纳管列表
- `SYSTEM_TOPICS`（raw-logs / standardized-alerts / valid-alerts / invalid-alerts 等）系统 topic 禁建、禁改、禁删
- 告警过滤规则里的 `source_topic: "*"` 是**逻辑匹配**（匹配告警文档字段），不会物理订阅系统 topic
- ⚠️ 存储路由的 `AlertStorageRoute.source_topic` 是**物理订阅** topic（种子值为 valid/invalid-alerts），手配 `*` 会产生物理订阅星号 topic 的隐患（待加校验）

### 3.3 告警唯一真相源 = Elasticsearch

- `alerts-valid` / `alerts-invalid` 是告警唯一存储；PG `alerts` 表仅为历史遗留壳，**`Alert.query` 是死路**
- 告警 id 为字符串：`ALT-{dedup_hash}`（= ES `_id`）
- 后端统一入口 `app/utils/es_alerts.py`：search / get / count / index / update / set_status / bulk / 聚合 quick_values / field_stats / histogram / ESAlertRef 等，**禁止业务代码自拼 ES 查询**
- `ALERT_MAPPING` 显式 mapping；新增字段必须同步修改；ip 字段 terms 聚合不能带 missing，TopN 需自行过滤 `'N/A'`

## 4. Flink 作业

| 作业 | 模式 | 说明 |
|---|---|---|
| `USOP-Correlation-Analysis` | **常驻** | 消费 `valid-alerts`，按关联分析规则生成安全事件写入 PG events |
| `alert_engine_job.py` | 手动 | 检测规则引擎（读 ES，命中→PG events；前端「检测规则」页手动执行） |
| `log_parser_job.py` / `waf_flink_job.py` | 按需 | 日志解析 / WAF 直连接入 |

## 5. 认证体系

- **JWT**：`Authorization: Bearer <token>`；开发环境签发方式见《部署运维》
- **账号双类型**（`users.auth_type`）：
  - `local`：平台本地密码（werkzeug hash）
  - `ad`：登录走 LDAP（`app/utils/ldap_auth.py`，ldap3）。两段式：配服务账号 → 先搜 DN 再以用户 DN bind；未配 → 直接以登录名 bind
- **平台用户名即域登录名**：登录名直接填入过滤器 `(sAMAccountName={username})`，认证不使用独立字段；`users.ad_upn` 由后端自动以 username 回填
- AD 用户本地密码为不可验证占位符（防绕过域认证直登）；AD 用户禁平台改密/重置
- AD 配置持久化于 `system_config(key='ad_ldap_config')`，管理入口「全局配置 → AD 域认证」，服务账号密码读时打码 `******`

## 6. 事件状态机

`events_api.py::STATUS_TRANSITIONS` 是唯一权威（单条与批量端点均走 `validate_transition`）：

```
new → acknowledged → investigating → resolved → closed
              │
              └── 旁路：非终态均可 → false_positive
重开：resolved / closed / false_positive → investigating
```

- `closed` 必填处置总结（400 拦截）
- 批量 `/events/batch/status` 返回 skipped 明细，不整单失败
- 状态变化记录操作人（`request.current_user` → event_actions / audit_logs）

## 7. AI 研判链路

- **批量研判唯一核心**：`ai_judgment.py::run_batch_judgment(limit, create_events=True)`
  选取未闭环告警（status ∈ new/open/active/investigating 且无 `structured_analysis`）→ STE 经验召回 + 提示词渲染 → LLM（不可用时规则兜底）→ 写回 `structured_analysis` → 自动闭环（误报 → false_positive；true_attack 高危 → 建事件 + closed）
- 所有入口统一指向它：`/ai-judgment/analyze-batch`、`/ai-api/alerts/analyze-batch`、`/ai-api/cron/analyze-alerts`、orchestrate 批量意图、60s 调度器
- 调度器开关跨进程持久化于 PG `system_config(key='ai_pipeline_state')`
- 提示词按 `prompt_key` 组织（`resolve_prompt` + `render_prompt`，回退 `BUILTIN_PROMPTS`）；经验库 `STEExperience`；禁止把提示词硬编码回业务代码

## 8. 数据库约定

- **无 Alembic**：启动时 `db.create_all()` + `migrations/` 手写幂等 ALTER 脚本；新模型必须在 `create_all()` 前 import
- JSON 列写入 Python 对象（**不要 `json.dumps`**，会双重编码）
- 模型如有名为 `query` 的列会顶掉 `Model.query`，禁止此类命名
