# 功能模块说明

> 前端路由与后端 API 蓝图对照。所有后端路由经 nginx 3266 反代，前缀 `/api/<蓝图前缀>`。

## 1. 检测与分析

### 安全告警 `/detection/alerts`（`alerts_api`）

- 告警列表 / 详情 / 状态流转 / 统计 / 聚合 / 导出；数据源为 ES `alerts-valid` / `alerts-invalid`
- 详情抽屉「研判协作」Tab：结构化研判（`structured_analysis` 写回 ES）+ IP 名单命中测试
- AI 批量研判入口（指向 `ai_judgment::run_batch_judgment`）
- 时间范围选择器（下拉内含完整预设 + 自定义范围 + 实时滚动）

### 事件工作台 `/detection/events`（`events_api`）

- 事件 CRUD + 五节点状态机（受理 / 调查 / 解决 / 重开 / 误报旁路），关闭必填处置总结
- 列表快捷动作 + 批量状态变更（返回 skipped 明细）
- 状态变化关联操作人；抽屉展示流转条与最近状态操作
- 事件由 Flink 关联分析 / 检测规则命中 / AI 研判（true_attack 高危）三类来源生成

### 威胁狩猎 `/detection/hunting`（`hunting_api`）

- 交互式查询构建器、狩猎任务管理与结果浏览

### AI 中心 `/detection/ai`（`ai_center` / `ai_api` / `ai_capabilities`）

- 模型管理、告警监控（流水线：筛选待研判 → STE 经验召回 → AI 结构化研判 → 结论写回 ES → 自动闭环）、智能调查（真实用户列表）
- 对话技能审批仍走 `/ai-api/approval/*`

### AI 研判 `/detection/ai-judgment`（`ai_judgment`）

- 批量研判任务、调度器开关（持久化 PG `ai_pipeline_state`）

## 2. 响应处置

### 响应剧本 `/response/playbooks`（`playbooks` / `playbooks_api`）

- 剧本编排（节点流）、执行、审批流（`PlaybookApproval` 11 列 + 通知中心联动）

### 检测规则 `/response/rules`（`rules_api`）

- 检测规则管理；引擎读 ES，**仅手动执行**（test / evaluate-all），无常驻调度；命中 → PG events
- 字段类型读索引映射；位置回退 顶层 → extra_data → parsed_data；数据源匹配不到时 match_none 不放宽

### IP 名单 `/response/ip-lists`（`resources`）

- 黑白名单；告警详情「IP 名单命中」实时测试

## 3. 资产与漏洞

| 模块 | 路由 | 蓝图 | 说明 |
|---|---|---|---|
| 资产盘点 | `/assets/inventory` | `assets_api` | 资产指纹、审计日志 |
| 扫描任务 | `/assets/scans` | `scans_api` | 扫描调度 |
| 漏洞总览/主机/应用 | `/vulnerabilities*` | `vulnerabilities_api` | 漏洞库管理 |
| 漏洞评估 | `/vulnerabilities/assessment` | `vulnerability_assessment_api` | 评估任务 |

## 4. 数据管理

### 数据采集 `/data/ingestion`（`data_sources_api` / `pipeline_api` / `alert_fields`）

- 数据源纳管：`POST /device-topics` 必建 DataSource；`DELETE` 只删 Kafka topic；暂停/恢复 `POST /pipeline/topics {datasource_id, action}`
- 解析管道：ParseProfile 9 种解析方式，`field_type` 真转换，入库前 `_normalize_alert_fields()`
- 字段管理：`template_fields` 字段池

### 存储表 `/data/templates`（`templates` / `storage_tables`）

- 「安全告警表 / 事件表」由 `alert_templates`（scene=alert/event）组合字段模板生成，默认模型 id=8（告警）/ id=9（事件）
- 渲染变量含 `structured_analysis.*` 平铺

### 资源中心 `/data/resources`（`resources`）

- IP 组等共享资源（被告警命中测试、剧本引用）

### 告警过滤 `/data/alert-filters`

- 分流过滤规则与白名单（pipeline 分流阶段消费；**AI 侧白名单已删**）

## 5. 运营与系统管理

| 模块 | 路由 | 蓝图 | 说明 |
|---|---|---|---|
| 运营 KPI | `/operations/kpi` | `kpi` | 运营指标 |
| 用户管理 | `/system/users` | `users_api` | 用户 CRUD（本地 / AD 域）、启停、重置密码（AD 用户禁用） |
| 角色管理 | `/system/roles` | `roles_api` | 角色/权限 |
| 审计日志 | `/system/audit` | `audit_logs_api` | 全局操作审计 |
| 备份 | `/system/backup` | `backup` | 备份管理 |
| 全局配置 | `/system/config` | `config` / `system_status_api` | 基础设置 / **AD 域认证** / 通知 / 安全 / 存储状态（真实探测）/ 高级 |
| 个人中心 | `/profile` | `auth` | 登录 / 改密（AD 用户禁改）/ 通知中心（按用户隔离，`read` 字段 + `data` JSON 载荷） |

## 6. 仪表盘

- 首页 `/`（`dashboard_api`）：告警趋势、严重度分布、资产状态等总览（数据取 ES 聚合与 PG 统计）
