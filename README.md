# USOP — 统一安全运营平台

USOP（Unified Security Operations Platform）是一套前后端分离的一体化安全运营平台，覆盖从**日志接入、解析标准化、检测关联、AI 研判到事件处置闭环**的完整安全运营链路。

> 核心数据流：`日志源 → Kafka → 解析管道（标准化/过滤/去重）→ Elasticsearch（告警唯一真相源）→ Flink 关联分析 → PostgreSQL（事件/业务）`

---

## 功能总览

| 模块     | 路由                       | 说明                                                                      |
| ------ | ------------------------ | ----------------------------------------------------------------------- |
| 安全告警   | `/detection/alerts`      | 告警检索、详情研判、聚合分析、AI 批量研判（告警唯一真相源 = ES）                                    |
| 事件工作台  | `/detection/events`      | 安全事件处置，五节点状态机流转（new → acknowledged → investigating → resolved → closed） |
| 威胁狩猎   | `/detection/hunting`     | 交互式查询构建与狩猎任务                                                            |
| AI 中心  | `/detection/ai`          | 模型管理、告警监控流水线、智能调查                                                       |
| AI 研判  | `/detection/ai-judgment` | 批量研判任务与结果查看                                                             |
| 响应剧本   | `/response/playbooks`    | 自动化响应剧本编排（含审批流）                                                         |
| 检测规则   | `/response/rules`        | 检测规则管理（手动执行，命中生成事件）                                                     |
| IP 名单  | `/response/ip-lists`     | 黑白名单管理                                                                  |
| 资产盘点   | `/assets/inventory`      | 资产指纹与管理                                                                 |
| 扫描任务   | `/assets/scans`          | 资产扫描调度                                                                  |
| 漏洞管理   | `/vulnerabilities*`      | 主机/应用漏洞、漏洞评估                                                            |
| 数据采集   | `/data/ingestion`        | 数据源纳管（Kafka topic）、解析管道、字段模板                                            |
| 存储表    | `/data/templates`        | 告警/事件字段模板与存储表                                                           |
| 资源中心   | `/data/resources`        | IP 组、资源等共享资源                                                            |
| 告警过滤   | `/data/alert-filters`    | 分流过滤规则与白名单                                                              |
| 运营 KPI | `/operations/kpi`        | 运营指标总览                                                                  |
| 系统管理   | `/system/*`              | 用户（含 AD 域账号）、角色、审计、备份、全局配置                                              |

## 技术栈

| 层   | 技术                                                                                       |
| --- | ---------------------------------------------------------------------------------------- |
| 前端  | React 18 + TypeScript + Webpack 5 + Tailwind CSS 3 + framer-motion + ECharts（HashRouter） |
| 后端  | Python Flask（蓝图模块化）+ SQLAlchemy + JWT                                                    |
| 消息  | Apache Kafka（KRaft 模式）                                                                   |
| 检索  | Elasticsearch（告警唯一真相源）                                                                   |
| 流计算 | Apache Flink（关联分析常驻作业）                                                                   |
| 业务库 | PostgreSQL                                                                               |
| 缓存  | Redis（去重窗口）                                                                              |

## 快速开始

```bash
# 1. 启动全部容器（usop_all / usop_postgres / redis / kafka / elasticsearch / flink*）
./start.sh

# 2. 访问
#    前端（nginx）:  http://localhost:3266
#    后端 API:       http://localhost:5001（经 3266 反代 /api/*）
#    Flink UI:       http://localhost:8081
#    Elasticsearch:  http://localhost:9200

# 3. 前端开发模式（热更新）
cd web && npm run dev    # webpack dev server :9000

# 4. 前端生产构建发版
cd web && ./node_modules/.bin/webpack --mode production
docker exec usop_all sh -c 'rm -rf /app/static/*'
docker cp web/dist/. usop_all:/app/static/
```

默认登录：`admin`（本地账号）。支持 AD 域账号登录，在「全局配置 → AD 域认证」中配置 LDAP 域控。

## 目录结构

```
usop/
├── web/                    # 前端 React + TS（webpack 构建，产物部署到容器 /app/static）
├── server-python/          # Flask 后端
│   ├── app/
│   │   ├── routes/         # 30 个 API 蓝图（alerts_api / events_api / ai_judgment / ...）
│   │   ├── models/         # SQLAlchemy 模型
│   │   ├── utils/          # es_alerts.py（告警统一入口）/ ldap_auth.py（AD 认证）等
│   │   └── engine/         # playbook 引擎 / 检测动作
│   └── migrations/         # 手写幂等迁移脚本（无 Alembic）
├── flink-jobs/             # Flink 作业（关联分析 / 告警引擎 / 日志解析）
├── docs/                   # 系统文档
├── postgres/               # 数据库初始化脚本
└── docker-compose.yml      # 基础设施编排
```

## 文档索引

- [系统架构](docs/ARCHITECTURE.md) — 容器拓扑、数据流水线、存储底座、认证体系
- [功能模块](docs/MODULES.md) — 各模块功能与前后端对应关系
- [部署运维](docs/OPERATIONS.md) — 构建、发版、迁移、常见问题

---

## 数据采集接入（Beats / Logstash → Kafka）

平台采集入口是 **Kafka**。采集端（Filebeat / Logstash / 其它生产者）把日志发到**设备 topic**，平台纳管该 topic 后经解析管道自动完成：标准化 → 过滤/去重 → 存入 ES（`valid-alerts` / `invalid-alerts`）。

```
日志源 → Filebeat/Logstash → Kafka(设备topic) → 标准化(ParseProfile) → 过滤/去重 → valid/invalid-alerts → ES
                                                                                    └→ Flink 关联分析 → PG events
```

### 1. Kafka 连接信息

| 参数      | 值                                        |
| ------- | ---------------------------------------- |
| 主机侧地址   | `localhost:9092`（PLAINTEXT，容器映射宿主机 9092） |
| 容器网络内地址 | `kafka:29092`                            |
| 协议      | PLAINTEXT（无 TLS/SASL，本地部署默认）             |

### 2. Topic 约定

- **设备 topic 自由命名**，建议 `<设备类型>-<数据类型>`，如 `waf-alert`、`ids-raw`、`winlogbeat-event`。
- **系统 topic 禁止作为采集目标**（平台自用，建/写都会被拒绝）：  
  `raw-logs`、`standardized-alerts`、`valid-alerts`、`invalid-alerts`（及 `processed-alerts`）。

### 3. Filebeat 直发 Kafka

`filebeat.yml` 最小可用配置（一行一条 JSON，平台可直接解析）：

```yaml
filebeat.inputs:
  - type: filestream
    id: waf-log
    paths:
      - /var/log/waf/access.log

output.kafka:
  hosts: ["localhost:9092"]        # 容器网络内部署填 kafka:29092
  topic: "waf-alert"               # 设备 topic，需与平台纳管名一致
  required_acks: 1
  compression: gzip
  worker: 2
  max_message_bytes: 10485760      # 10MB，超长日志调大

# 建议关掉自带 metadata，发裸消息，减少平台解析负担
processors:
  - drop_fields:
      fields: ["agent", "ecs", "input", "log.offset"]
```

其它 Beat 同理（`winlogbeat` / `auditbeat` / `metricbeat` 都支持 `output.kafka`），改 `topic` 即可。注意：Beats 发出的消息默认带 `@timestamp`、`message` 字段，平台解析时按 JSON 提取即可。

### 4. Logstash 转发（多源汇聚场景）

设备多、格式杂时，用 Logstash 做汇聚层：`beats/syslog/tcp 输入 → 过滤 → kafka 输出`。

```ruby
# logstash.conf
input {
  beats  { port => 5044 }                 # 各类 Beat 汇聚
  syslog { port => 5514 }                 # 传统设备 syslog 直发
  tcp    { port => 5140  codec => json }  # 脚本/探针 JSON 直推
}

filter {
  # 可选：补字段、打标。不要过度加工，解析交给平台 ParseProfile
  mutate { add_field => { "[@metadata][topic]" => "ids-alert" } }
}

output {
  kafka {
    bootstrap_servers => "localhost:9092"
    topic_id => "%{[@metadata][topic]}"
    codec => json_lines                 # 一行一条 JSON，平台首选
    compression_type => "gzip"
  }
}
```

> 若设备只能发 syslog/原始文本，直接发文本也可以——在平台「数据采集 → 解析配置」里按样本配置解析方式（支持 `auto / json / regex / template / syslog / cef / keyvalue / csv / grok` 9 种），无需采集端做格式化。

### 5. 平台侧纳管步骤

1. 「数据采集 → 数据源管理」新建数据源：协议 `kafka`，填写 topic 名（即上一步采集端发送的 topic）；保存即自动创建并纳管该 topic。
2. 为该数据源配置**解析方式**（ParseProfile）：提供一条真实样本，选 JSON/regex/grok 等方式并映射到平台标准字段（`rule_name / severity / src_ip / dst_ip / attack_type ...`）。
3. 保存后管道自动运行：设备 topic → 标准化 → 过滤/去重 → ES。可在「告警过滤」配置分流规则，在「安全告警」页面验证数据到达。
4. 暂停/恢复消费：`POST /api/pipeline/topics {datasource_id, action: pause|resume}`。

### 6. 消息格式建议

- **首选**：一行一条 JSON 对象（`codec => json_lines` / Filebeat 默认 JSON），字段名与平台标准字段对齐时零解析成本。
- **兼容**：原始单行文本 / syslog / CEF —— 交给 ParseProfile 解析。
- 时间字段建议 ISO8601（`2026-10-18T19:30:00`），缺省时平台按入库时间兜底。

---

## 剧本「数据查询」节点条件语法

数据查询节点查询的数据源 = 存储表管理注册的表（ES 索引 / PG 表）+ 内部业务表（告警/资产/漏洞/事件）。选中数据源后面板会显示**查询位置**（物理索引名/表名），条件在数据源侧过滤后按「返回条数」截取。

### 1. 查询条件（结构化构建器）

每行一条：`字段 运算符 值`，行间 **AND**。

| 运算符       | ES 数据源行为             | PostgreSQL 数据源行为              |
| --------- | -------------------- | ----------------------------- |
| 等于        | `field:"值"`          | `field = 值`                   |
| 不等于       | `NOT field:"值"`      | `field != 值`                  |
| 包含        | `field:*值*`          | `field ILIKE '%值%'`           |
| 不包含       | `NOT field:*值*`      | `NOT field ILIKE '%值%'`       |
| 前缀        | `field:值*`           | `field ILIKE '值%'`            |
| 正则        | `field:/正则/`         | `field ~ '正则'`                |
| 大于 / 大于等于 | `field:>值` / `>=`    | 数值走 `CAST(numeric)` 比较，其余文本比较 |
| 小于 / 小于等于 | `field:<值` / `<=`    | 同上                            |
| 存在        | `_exists_:field`     | `field IS NOT NULL`           |
| 不存在       | `NOT _exists_:field` | `field IS NULL`               |

- **值支持数据引用**：`{{ $json.src_ip }}` / `{{ 上游节点.字段 }}` / `{{事件.src_ip}}`，执行时先替换再查询（典型用法：把当前告警的 IP 去历史表里查）。
- 字段输入框联想自存储表注册的 columns；未知字段在 PG 侧自动跳过，不报错。
- 「存在/不存在」不需要填值。

### 2. 高级查询（lucene，可选）

与上方条件**叠加 AND**，仅 ES 数据源完整生效（PG 数据源只识别 `field:value` 等值片段）：

```
severity:critical AND NOT src_ip:10.0.0.1      # 布尔组合（AND/OR/NOT，空格默认 AND）
rule_name:*SQL*                                # 通配符
risk_score:>=80                                # 数值/时间范围比较
attack_type:/.*注入.*/                         # 正则
src_ip:(1.1.1.1 OR 2.2.2.2)                    # 同字段多值
_exists_:event_code                            # 字段存在
title:"暴力破解 登录"                           # 短语（引号整体匹配）
```

### 3. 时间窗口与返回条数

- **时间窗口（小时）**：`24` = 只查最近 24 小时；留空/0 = 不限。ES 按 `first_seen`、PG 按 `created_at` 过滤。
- **返回条数**：默认 20，条件命中后截取前 N 条，输出到下游 `items`（下游用 `{{ $json.字段 }}` / `{{ 节点名.字段 }}` 引用）。

### 4. 典型示例

查询「最近 24h 同一源 IP 的全部高危告警」：

| 配置项  | 值                                      |
| ---- | -------------------------------------- |
| 数据源  | 告警表（查询位置：alerts-valid · Elasticsearch） |
| 条件 1 | `severity` 等于 `high`                   |
| 条件 2 | `src_ip` 等于 `{{ $json.src_ip }}`       |
| 时间窗口 | `24`                                   |
| 返回条数 | `50`                                   |

也可以用通用动作节点以行式字符串传参：`severity\|等于\|high`（每行一条）。

---

## 剧本运行时入参（声明式）

执行剧本 = 提供剧本声明的「入参」，仅此而已。节点配置（封堵时长/通知渠道/提示词/查询条件等）是剧本本身的一部分，由作者在画布上配置，**执行时不向操作人收集、也不接受执行期覆盖**。

- **声明入参**：在剧本画布的触发器节点 →「运行时入参」中添加，每条 = 参数名（key）+ 显示名 + 是否必填 + **默认值** + 输入提示。数据存在触发器 `config.inputs`。
- **入参注入**：执行时入参进入引擎上下文，下游节点用 `{{ $json.参数名 }}` 或 `{{ 参数名 }}` 引用（触发器快照已合并入参，n8n 语法可直接取）。
- **取值优先级**：显式提交值 > 事件/告警上下文预填（如 攻击源 IP ← 事件源 IP）> 触发器声明的**默认值** > 留空。试运行弹窗里未手动改过的入参不随请求提交，由服务端按此优先级解析，且弹窗会随模拟告警上下文联动刷新显示——保证「界面看到的值 = 实际执行值」。
- **无需入参的剧本**：触发器未声明入参时（如「事件分析」「每日威胁运营日报」），执行弹窗提示直接执行，全程零输入。
- 参数清单接口：`GET /api/playbooks-api/playbooks/<id>/params?event_id=<事件编号>`（返回 `{mode: 'declared'|'none', inputs: [...]}`，每个入参带 `prefill`/`prefill_source`/`default`）；实现见 `app/engine/node_params.py`。

## 剧本执行前置校验（触发上下文 + 入参）

服务端强制（`app/engine/node_params.py::validate_execution_request`），前端只做提示。所有执行入口  
—— 剧本页手动执行 `POST /api/playbooks-api/playbooks/<id>/execute`、规则引擎自动触发 `/playbooks/trigger`、  
事件工作台 `POST /api/event-actions-api/events/<id>/playbooks/<pid>/execute`、审批通过后自动执行 —— 都先过这两条：

1. **事件触发剧本必须有上下文**：触发器类型归一为 `alert`（告警事件）的剧本，若请求里既没有事件  
   （`event_code`/`title`/`src_ip`/`related_alerts`…）也没有告警（`src_ip`/`dst_ip`/`alert_code`…），  
   直接 `400 code=trigger_context_required` —— 手动执行没有可传递的数据，`$json.*` 全是空，跑了也是假成功。  
   这类剧本请在**事件工作台**执行；调试用编辑器「试运行」，会先弹窗要求填写模拟事件/告警上下文与入参。  
   手动触发 / 定时 / Webhook 类型的剧本不受此限制。
2. **入参不全不许执行**：声明的必填入参为空（提交值 → 事件预填值都取不到）或 `type=ip` 格式非法时，  
   `400 code=invalid_inputs`，响应带 `missing[]` / `invalid[]` / `schema`，前端可直接定位到缺哪个字段。  
   入参留空时仍会回退事件上下文预填（如 `src_ip` ← 事件源 IP），所以自动化路径不会因为没提交参数而失败。

前端对应处理：剧本卡片与编辑器「运行」按钮对事件触发剧本置灰（提示到事件工作台执行）；  
声明了必填入参的剧本在卡片直跑时引导到编辑器填写；事件工作台执行弹窗按同一规则校验后才发出请求。

## 告警源 IP 语义（主机类 vs 网络类）

主机类告警（HIDS/EDR，`source_type=host|endpoint`）中受控主机是**告警目标**而非攻击来源：

- **解析器**（`app/utils/alert_parsers.py`）：Wazuh 不再把 `agent.ip` 回退进 `src_ip`  
  （受控主机 IP 进 `dst_ip`）；CrowdStrike 的 `LocalIP/SensorIP` 同样进 `dst_ip`，`src_ip` 留空。
- **详情面板**（SecurityAlerts）：主机类告警网络区显示「涉及主机」（中性色）+  
  真实远程来源「来源地址」（红色，存在且不同于主机 IP 时）；网络类告警保持  
  「源地址/目的地址」原语义。
- **存量修正**：青藤 HIDS 种子告警本机 IP 已从 `src_ip` 迁到 `dst_ip`（一次性脚本执行）。

## 安全告警列选择持久化

MessageTable 列选择与列宽持久化到 localStorage（`usop.alerts.visible-columns` /  
`usop.alerts.col-widths`），刷新与重进后保留；列选择器带「重置」恢复默认列。

## 告警 ↔ 事件 状态联动

告警转成事件后，其状态跟随事件生命周期自动流转（唯一实现 `app/utils/event_alert_link.py`），  
避免已转事件的告警反复出现在「待分析」队列被重复研判：

- **建事件即联动**（`link_alerts_to_event`）：所有建事件入口 —— 人工聚合 `/alerts-api/alerts/aggregate`、  
  人工创建 `POST /event-actions-api/events`、检测规则引擎 `rule_engine`、AI 批量研判、剧本 `create_event`  
  动作 —— 统一做两件事：关联告警状态 → `investigating`（人工已终态的不覆盖），事件编号追加进  
  告警 ES 文档的 `event_ids`（keyword 数组，前端据此显示「已转事件」徽标）。
- **事件状态 → 告警状态**（`sync_alerts_on_event_status`）：`update_event` / `update_event_status` /  
  `batch_update_status` 三个端点接入。映射：closed→closed、resolved→resolved、false_positive→false_positive、  
  重开/推进→investigating；审批中间态不联动。每次同步写处置记录（action=alert_sync）。
- **防误关**：一条告警可能挂在多个事件上。推向终态前检查其 `event_ids` 里其它事件——  
  只要还有未终态事件就不动；重开事件也不会拉起已因其它终态事件关闭的告警。
- **防重复分析**：AI 批量研判选取集排除 `event_ids` 非空的告警；规则引擎收集命中告警时也排除  
  已关联/已终态的（同一批告警不会被反复生成的事件再次拉回 investigating）。
- 检测规则（阈值/聚合/关联）命中建事件时，会取各条件组窗口内的命中告警 id（上限 100）写入  
  `event.extra_data.alert_ids` 并联动状态，事件落 `investigating`。


## 剧本审批流程

剧本执行的完整审批闭环（数据表 `playbook_approvals`，实现见 `app/engine/playbook_engine.py::process_approval_result`）：

1. **审批是剧本配置项**：在剧本编辑器头部勾选「执行需审批」（存 `playbooks.approval_required`，列表卡片带徽标）。执行人**不能也不需要**在执行弹窗勾选——配置了审批的剧本，事件工作台弹窗自动显示提示条、执行原因变为必填、按钮变「提交审批」；服务端执行端点同样强制（直执返回 403 `need_approval`，防绕过）。
2. **提交申请**：事件工作台「选择剧本执行」→ 填入参 + 执行原因 → `POST /api/playbooks-api/playbooks/<id>/approve-request`，落 `PlaybookApproval(pending)`，申请时保存入参与事件上下文，剧本不执行。
3. **审批人收到通知**：申请通知发给 admin / senior_analyst 角色用户（排除申请人自己），顶栏通知中心可直接批准/拒绝。
4. **审批中心**：剧本编排页右上角「审批中心」（角标显示待审批数）——待审批/已处理两个 Tab，展示申请人、关联事件、原因、入参，待审批单可批准/拒绝。
5. **批准后自动执行**：进程内以申请时保存的入参（留空的声明入参回退事件预填值）+ 事件上下文执行剧本，执行摘要（状态/节点数/失败节点）写回审批单并展示在「已处理」列表；关联事件自动写入处置记录。
6. **结果通知**：批准/拒绝均向申请人发站内信；拒绝则剧本不执行。
7. 画布中的「审批节点」用于剧本中途需要审批的危险动作（IP 封禁/主机隔离等）：按动作类型自动定级创建审批单并暂停该分支，审批通过后继续执行该动作。

## 事件源 IP 与事件描述富化

事件（PG `events`）过去只有标题/描述两列文本：源 IP 无处可存（前端「源IP」恒为 `-`），  
由告警生成的事件描述也只有一句手填话术。现在统一由 `app/utils/event_enrichment.py` 富化：

- **主责源 IP**：`events.src_ip` 列（迁移 `migrations/add_event_src_ip.py`，幂等 + 存量回填）。  
  取值 = 最高危告警中出现次数最多的源 IP；规则引擎取分组/匹配 IP；Flink 关联事件由  
  `app/flink_sql/correlation.py` 在 sink 中写入（按 `src_ip` 分组时取分组值，否则取窗口内样本源 IP）。  
  `Event.to_dict()` 同时输出 `src_ip` 与 `source_ip`（兼容旧前端键名），列为空时回退  
  `extra_data.summary.src_ips[0]` → `related_alerts[0].src_ip`，存量事件也能读到值。
- **结构化描述**：`render_description()` 按关联告警生成多行描述——告警条数、时间跨度、  
  主要源 IP / 目标 IP、涉及资产（hostname）、严重级别分布、告警类型与名称 Top、来源产品、  
  前 N 条告警明细（级别/标题/源→目的/时间/告警编号），用户手填内容作为「补充说明」附在末尾。  
  AI 研判生成的事件额外附带结论、处置建议与证据链。
- **统计摘要**：`extra_data.summary`（src_ips / dst_ips / assets / severity_distribution /  
  category_top / alert_name_top / first_seen / last_seen / duration），事件详情的「目标IP」  
  「涉及资产」与列表的资产列都从这里取。
- **覆盖的建事件入口**：人工聚合（`POST /api/alerts-api/alerts/aggregate`）、  
  AI 批量研判（`ai_judgment._create_event_from_judgment`）、剧本 `create_event` 动作、  
  检测规则引擎、事件工作台手动创建（`POST /api/event-actions-api/events`，现按 ES 取告警，  
  不再走已废弃的 PG `alerts` 表）。
- 存量回填：`docker exec usop_all bash -c "cd /app && PYTHONPATH=/app python3 migrations/add_event_src_ip.py"`，  
  依次从 `extra_data` → 描述文本「源 IP = x.x.x.x」→ `raw_log` 提取。

## 剧本执行记录与封堵名单

剧本编排页顶部「剧本列表 / 执行记录」切换（实现见 `web/src/pages/PlaybookExecutions.tsx` + `GET /api/playbooks-api/playbooks/executions`）：

- **执行记录列表**：每次执行的 开始时间 / 剧本 / 触发方式（事件·告警·手动·定时·Webhook·审批执行）/ 执行人（审批执行的展示「审批通过（审批人: xxx）」）/ 关联事件编号与标题 / **关键动作摘要**（封禁了哪些 IP、隔离了哪些主机、发了什么通知，失败动作划线展示）/ 状态 / 耗时。支持按剧本、状态、触发方式筛选，关键字可搜执行人、事件编号、处置目标 IP/主机（命中 trigger_data 全文）。
- **执行详情**：弹窗展示基本信息、执行入参（申请人提交的声明入参）、关键处置动作明细（目标 + 引擎返回消息）、节点执行时间线（每节点成败/输出项数/消息）。
- **关键动作识别**：引擎在通用动作节点执行结果里标记 `data.action = <动作名>`（`playbook_engine.py`），记录页据此把 `block_ip`/`unblock_ip`/`quarantine_host`/`create_ticket`/`notify`/`http_request` 提炼为摘要；专用节点类型（notify 等）直接按 typeId 识别。
- **当前封堵名单**：`block_ip` 动作的持久化名单（SystemConfig `blocked_ips`，`IPBlockManager` 管理）——展示封禁中的 IP、时长/到期时间（到期自动解封）、封堵原因与方式，可手动解封（`DELETE /api/playbooks-api/playbooks/blocked-ips/<ip>`，同步清除 iptables 规则）。
- 数据表：`playbook_executions`（trigger_data 存事件上下文与入参，result_summary 存节点级结果），随剧本删除级联清理。

## 漏洞管理（主机漏洞 / 应用漏洞）

参考常规漏洞管理系统（Tenable/Qualys 的 RBVM 体系）实现的全生命周期管理，页面 `web/src/pages/VulnerabilityManagement.tsx`（`/vulnerabilities/host`、`/vulnerabilities/application` 两个 Tab 复用同一组件），API `app/routes/vulnerabilities_api.py`：

- **双表模型**：`vulnerabilities`（漏洞定义/知识库：CVE/CNVD/CNNVD/CWE、CVSS v3/v2 评分与向量、漏洞类别、修复建议、参考链接）+ `asset_vulnerabilities`（资产漏洞实例：编号 VH-/VA-、位置（IP/端口/协议/URL/组件版本）、处置跟踪、重评信息、时间线）。字段迁移见 `migrations/add_vuln_fields.py`（幂等，含 `vuln_class` 列）。
- **录入**：页面「录入漏洞」弹窗（`POST /vulnerabilities`）——按名称/CVE 自动复用或创建漏洞定义；资产按 IP 自动匹配，不存在则自动创建；`source=manual`。Nessus 导入（`/nessus/import`）走同一实例表。
- **状态机**（`VULN_STATUS_FLOW`，服务端强校验）：`open → in_progress → fixed → closed`；旁路 `ignored` / `risk_accepted`；`fixed` 可退回 `in_progress`（复测不通过）；`closed/ignored/risk_accepted` 可重开。每次流转写时间线并记录说明；关闭记录复测人/时间/结果。批量流转走 `/batch-status`（逐条校验，失败返回原因）。
- **重新评级（双轨制）**：原始 CVSS 评级保留不动；重评 = 业务因子加权（资产重要性 0.3 + 可利用性 0.4 + 修复难度 0.3，10 分制）→ ≥9 危急 / ≥7 高危 / ≥4 中危 / 其余低危；支持人工覆盖分数；必须填重评理由；历史重评留在 `assess_history`。评级配置页（`vulnerability_assessment_api.py`）的六因子权重体系独立存在。
- **防重复**：列表按「重评等级 ?? 原始等级」排序（危急→低危），服务端分页 + search（编号/CVE/名称/IP）+ severity/status 过滤；`/stats` 按类型返回等级/状态分布。
- **处置跟踪**：责任人/处置方案/计划完成时间/备注（`PUT /vulnerabilities/<id>`），详情弹窗展示处置跟踪块 + 重评历史 + 完整时间线。
- **附件（截图/报告）**：漏洞详情弹窗可上传多个附件（`POST /vulnerabilities/<id>/attachments`，multipart 字段 `file`）——图片（png/jpg/jpeg/gif/webp/bmp）自动归类为「截图」并生成缩略图与大图预览，其余（pdf/word/excel/csv/txt/md/log/json/zip）归为「报告」，限 20MB。落盘目录 `server-python/app/uploads/vuln_attachments/`（容器内 `/app/app/uploads/...`，bind mount 持久化），下载/预览走 `GET .../attachments/<att_id>`（带 JWT，前端 fetch+blob）。上传/删除写入处置时间线；删除漏洞时级联清理附件文件与记录（`vulnerability_attachments` 表）。
