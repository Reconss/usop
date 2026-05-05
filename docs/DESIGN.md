# USOP - 统一安全运营平台设计文档

## 目录

1. [系统架构概览](#一系统架构概览)
2. [数据接入管理](#二数据接入管理)
3. [数据模型设计](#三数据模型设计)
4. [页面设计](#四页面设计)
5. [后端API接口规范](#五后端api接口规范)
6. [数据流与状态转换](#六数据流与状态转换)
7. [组件技术指南](#七组件技术指南)
8. [部署与实施](#八部署与实施)
9. [版本与定价](#九版本与定价)

---

## 一、系统架构概览

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              前端交互层                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ 仪表盘   │ │ 数据接入 │ │ 规则管理 │ │ 事件中心 │ │ 响应中心 │         │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘         │
└───────┼────────────┼────────────┼────────────┼────────────┼────────────────┘
        │            │            │            │            │
        ▼            ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FastAPI 后端服务层                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ 数据源   │ │ 规则引擎 │ │ 告警管理 │ │ 事件处理 │ │ 用户认证 │         │
│  │ 管理 API │ │  CRUD   │ │  API    │ │  API    │ │  API   │         │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘         │
└───────┼────────────┼────────────┼────────────┼────────────┼────────────────┘
        │            │            │            │            │
        ▼            ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            大数据处理层 (Flink)                                │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │                        Flink Cluster                                  │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │    │
│  │  │  Log Parser Job │  │ Alert Engine Job│  │ Metrics Job    │     │    │
│  │  │  ───────────────│  │  ───────────────│  │  ──────────────│     │    │
│  │  │ • JSON/Syslog   │  │ • Single Event  │  │ • Window Agg   │     │    │
│  │  │   Parsing       │  │ • Correlation   │  │ • Statistics   │     │    │
│  │  │ • Field Extract │  │ • Sequence CEP  │  │ • Trends       │     │    │
│  │  │ • Enrichment    │  │ • Threshold      │  │                │     │    │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘     │    │
│  └───────────┼────────────────────┼───────────────────┼───────────────┘    │
│              │                    │                    │                   │
│              ▼                    ▼                    ▼                   │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │                           Apache Kafka                               │    │
│  │  raw-logs │ parsed-logs │ alerts │ metrics │ dlq-logs               │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              数据存储层                                       │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │     Redis       │  │    PostgreSQL   │  │   TimescaleDB   │             │
│  │   (缓存)        │  │  (配置存储)      │  │  (时序数据)     │             │
│  │                 │  │                 │  │                 │             │
│  │ • 会话管理     │  │ • 用户配置     │  │ • 日志数据     │             │
│  │ • 热点数据     │  │ • 规则定义     │  │ • 告警事件     │             │
│  │ • 限流计数     │  │ • 资产信息     │  │ • 指标数据     │             │
│  │                 │  │ • 数据源配置   │  │ • 全文搜索     │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 数据流全链路

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           数据流全链路                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │  数据源管理  │───▶│  日志解析    │───▶│   告警生成   │───▶│  告警分诊   │ │
│  │ (DataSource)│    │ (Pipeline)  │    │  (Alerts)   │    │ (Triage)   │ │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘ │
│         │                   │                   │                   │        │
│         ▼                   ▼                   ▼                   ▼        │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                        数据存储层                                      │  │
│  │   数据源表 | 解析管道表 | 告警表 | 事件表 | 处置记录表 | 审计日志表   │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                   │
│  │  规则分析    │◀───│   告警聚合   │───▶│  事件工作台  │                   │
│  │ (RuleEngine)│    │(Aggregation)│    │ (Workspace) │                   │
│  └─────────────┘    └─────────────┘    └─────────────┘                   │
│         │                   │                   │                         │
│         ▼                   ▼                   ▼                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │  任务分派    │    │   状态流转   │    │   剧本执行   │                  │
│  │ (Assignment) │    │ (StatusFlow)│    │ (Playbooks) │                  │
│  └─────────────┘    └─────────────┘    └─────────────┘                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 组件职责划分

#### PostgreSQL (配置存储)
- 用户管理
- 数据源配置
- 解析规则
- 告警规则
- 日志类型
- 格式模板
- 通知渠道

#### TimescaleDB (时序数据)
- 原始日志存储
- 解析后日志存储
- 告警事件存储
- 全文搜索
- 实时统计
- 数据压缩

#### Kafka (消息队列)
- 原始日志 Topic
- 解析日志 Topic
- 告警 Topic
- 指标 Topic
- 死信队列

#### Flink (流处理)
- Log Parser Job: 日志解析、富化
- Alert Engine Job: 规则匹配、告警生成
- Metrics Job: 指标统计

#### Redis (缓存)
- 会话存储
- 热点数据缓存
- 限流计数

### 1.4 Flink 告警引擎支持的规则类型

```
┌─────────────────────────────────────────────────────────────────┐
│                     告警引擎支持的规则类型                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. 单事件规则 (Single Event)                                    │
│     └── 条件匹配 → 立即触发                                      │
│     示例: src_ip == "192.168.1.100" AND action == "login_fail" │
│                                                                  │
│  2. 关联规则 (Correlation)                                       │
│     └── 多事件关联分析                                           │
│     示例: user_id 相同的登录失败次数 >= 5 (任意 IP)              │
│                                                                  │
│  3. 时序规则 (Sequence/CEP)                                     │
│     └── 事件序列模式匹配                                         │
│     示例: [A 事件] → (5分钟内) → [B 事件]                       │
│                                                                  │
│  4. 阈值规则 (Threshold)                                        │
│     └── 滑动窗口聚合后触发                                       │
│     示例: 5分钟内的请求数 > 1000                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、数据接入管理

### 2.1 数据接入模式

#### Push 模式 (被动接收)

| 协议 | 端口 | 说明 | 使用场景 |
|------|------|------|----------|
| Syslog | 514 (UDP/TCP) | RFC 5424 标准 | 网络设备、安全设备 |
| Webhook | 8080+ | HTTP 回调 | 云服务、第三方应用 |
| Kafka | 9092 | 消息队列 | 高吞吐量场景 |
| gRPC | 50051 | RPC 框架 | 微服务架构 |
| TCP | 自定义 | 原始字节流 | 自定义协议 |
| UDP | 自定义 | 无连接传输 | 高速日志 |

#### Pull 模式 (主动拉取)

| 协议 | 配置项 | 说明 | 使用场景 |
|------|--------|------|----------|
| Kafka | brokers, topic, group | 消费已有 Topic | 日志聚合平台 |
| S3 | bucket, prefix, region | 对象存储 | 云存储日志 |
| JDBC | connection, query | 数据库 | 业务数据库 |
| HTTP | url, interval, auth | REST API | SaaS 服务 |
| Elasticsearch | hosts, index | ES 查询 | 旧系统迁移 |
| File | path, pattern | 本地文件 | 文件日志 |

### 2.2 解析管道设计

```
┌─────────────────────────────────────────────────────────────────┐
│                      原始日志 (Raw Log)                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      预过滤器 (Pre-filter)                       │
│  • 字段过滤 (去除不需要的字段)                                    │
│  • 噪声过滤 (过滤调试日志、心跳等)                               │
│  • 采样策略 (采样率、分层采样)                                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      格式识别 (Format Detection)                 │
│  • JSON 解析                                                     │
│  • Syslog RFC 5424/3164                                         │
│  • CEF (Common Event Format)                                    │
│  • LEAF (Log Event Extended Format)                             │
│  • 自定义 Grok/正则                                             │
│  • 智能识别 (ML-based)                                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      字段提取 (Field Extraction)                 │
│  • 时间戳标准化                                                  │
│  • IP 地址解析 (IPv4/IPv6)                                      │
│  • URL 解析                                                     │
│  • JSON 字段映射                                                │
│  • 正则捕获组                                                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      数据富化 (Enrichment)                       │
│  • IP → 地理位置 (GeoIP)                                        │
│  • IP → ASN 信息                                               │
│  • 用户名 → 部门信息                                            │
│  • 主机名 → 资产信息                                            │
│  • 威胁情报查询 (TI Lookup)                                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      日志分类 (Classification)                    │
│  • 日志类型 (Log Type)                                          │
│  • 严重等级 (Severity)                                          │
│  • 事件类别 (Category)                                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      解析后日志 (Parsed Log)                      │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 内置解析器

| 解析器 | 标识符 | 支持格式 | 说明 |
|--------|--------|---------|------|
| JSON | `json` | `{"key": "value"}` | 标准 JSON |
| Syslog RFC5424 | `syslog_rfc5424` | 带结构化数据 | 生产环境推荐 |
| Syslog RFC3164 | `syslog_rfc3164` | BSD syslog | 传统设备兼容 |
| CEF | `cef` | `CEF:Version|Device Vendor|...` | 安全设备标准 |
| Apache | `apache` | Combined Log Format | Web 服务器日志 |
| Nginx | `nginx` | Nginx 访问日志 | Web 服务器日志 |
| Windows Event | `winevent` | XML Event Log | Windows 事件 |
| Grok | `grok` | `%{PATTERN}` | 自定义正则 |
| CSV | `csv` | `field1,field2,...` | 分隔符格式 |
| Key-Value | `kv` | `key=value key2=value2` | 键值对格式 |

### 2.4 Kafka Topic 设计

| Topic 名称 | 分区数 | 副本数 | 保留时间 | 说明 |
|-----------|--------|--------|----------|------|
| `raw-logs` | 6 | 3 | 7 天 | 原始日志 |
| `parsed-logs` | 6 | 3 | 30 天 | 解析后日志 |
| `classified-logs` | 6 | 3 | 30 天 | 分类后日志 |
| `alerts` | 3 | 3 | 90 天 | 告警事件 |
| `metrics` | 3 | 3 | 7 天 | 指标数据 |
| `dlq-logs` | 3 | 1 | 30 天 | 死信队列 |

---

## 三、数据模型设计

### 3.1 数据源 (DataSource)

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | Integer | 主键 |
| name | String | 数据源名称 |
| source_type | String | 数据源类型(kafka/syslog/s3/webhook等) |
| protocol | String | 协议类型 |
| config | JSON | 连接配置 |
| status | String | 状态(active/inactive/error) |
| health | Integer | 健康度(0-100) |
| total_events | BigInteger | 总事件数 |
| last_sync | DateTime | 最后同步时间 |
| parse_pipelines | JSON | 关联的解析管道列表 |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

### 3.2 解析管道 (Pipeline)

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | Integer | 主键 |
| name | String | 管道名称 |
| product_id | Integer | 产品ID(可选) |
| format_id | String | 格式模板ID |
| input_format | String | 输入格式(json/syslog/keyvalue/csv/grok等) |
| input_config | JSON | 输入配置(解析规则) |
| field_mapping | JSON | 字段映射 |
| filter_rules | JSON | 过滤规则 |
| transform_rules | JSON | 转换规则 |
| output_target | String | 输出目标(alerts/events/logs) |
| output_config | JSON | 输出配置 |
| batch_size | Integer | 批处理大小 |
| parallel_workers | Integer | 并行工作线程数 |
| status | String | 状态(active/inactive) |
| priority | Integer | 优先级(数值越大优先级越高) |
| match_conditions | JSON | 匹配条件 |
| rule_type | String | 匹配类型(exclusive/inclusive) |
| next_pipeline_id | Integer | 下一管道ID(串联用) |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

### 3.2.1 解析管道字段映射 (PipelineFieldMapping)

存储每个解析管道的字段映射配置，将原始日志中的字段映射到标准告警字段。

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | Integer | 主键 |
| pipeline_id | Integer | 关联的解析管道ID |
| target_field | String | 目标标准字段名（对应 alert_field_definitions.name） |
| source_field | String | 源字段名（原始日志中的字段名） |
| field_type | String | 字段类型 |
| default_value | String | 默认值（当原始日志中无该字段时使用） |
| is_required | Boolean | 是否必填映射 |
| sort_order | Integer | 排序顺序 |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

### 3.2.2 解析管道配置 (PipelineConfig)

存储解析管道的解析配置、过滤规则等。

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | Integer | 主键 |
| pipeline_id | Integer | 关联的解析管道ID（唯一） |
| parser_type | String | 解析器类型(json/xml/csv/syslog/grok/regex) |
| parser_config | JSONB | 解析配置（存储解析规则、正则表达式等） |
| sample_log | Text | 样本日志（用于测试） |
| filter_rules | JSONB | 过滤规则 |
| transform_rules | JSONB | 转换规则 |
| detection_rule_ids | JSONB | 关联的检测规则ID列表 |
| format_template_id | Integer | 关联的格式模板ID |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

### 3.3 安全告警 (Alert)

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | Integer | 主键 |
| alert_code | String | 告警编号(如ALERT-2026-001) |
| title | String | 告警标题 |
| description | Text | 告警描述 |
| severity | String | 严重程度(critical/high/medium/low) |
| confidence | Integer | 置信度(0-100) |
| status | String | 状态(new/investigating/closed/false_positive) |
| source | String | 来源(数据源/管道名称) |
| source_ip | String | 源IP |
| dest_ip | String | 目标IP |
| category | String | 告警类别 |
| raw_log | Text | 原始日志 |
| parsed_data | JSON | 解析后的数据 |
| event_id | Integer | 关联的事件ID(已生成事件时) |
| event_code | String | 关联的事件编号 |
| aggregated | Boolean | 是否已聚合 |
| aggregated_ids | JSON | 聚合的告警ID列表 |
| first_seen | DateTime | 首次出现时间 |
| last_seen | DateTime | 最后出现时间 |
| hit_count | Integer | 命中次数 |
| extra_data | JSON | 扩展数据 |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

### 3.4 安全事件 (Event)

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | Integer | 主键 |
| event_code | String | 事件编号(如EVT-20260501-001) |
| title | String | 事件标题 |
| description | Text | 事件描述 |
| severity | String | 严重程度(critical/high/medium/low) |
| status | String | 状态(new/investigating/closed/false_positive) |
| category | String | 事件类别 |
| source | String | 来源(manual/rule/aggregation) |
| assignee_id | Integer | 处理人ID |
| assignee_name | String | 处理人名称 |
| raw_log | Text | 原始日志 |
| affected_assets | JSON | 影响资产列表 |
| extra_data | JSON | 扩展数据(包含关联告警信息) |
| timestamp | DateTime | 发生时间 |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

### 3.5 事件处置记录 (EventAction)

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | Integer | 主键 |
| event_id | Integer | 关联事件ID |
| event_code | String | 事件编号 |
| action | String | 动作类型 |
| content | Text | 内容/备注 |
| user_id | Integer | 操作人ID |
| user_name | String | 操作人名称 |
| previous_status | String | 变更前状态 |
| new_status | String | 变更后状态 |
| previous_severity | String | 变更前严重度 |
| new_severity | String | 变更后严重度 |
| assignee | String | 分派人 |
| attachments | JSON | 附件列表 |
| playbook_id | Integer | 剧本ID |
| playbook_name | String | 剧本名称 |
| playbook_execution_id | String | 剧本执行ID |
| playbook_result | JSON | 剧本执行结果 |
| extra_data | JSON | 扩展数据 |
| created_at | DateTime | 创建时间 |

### 3.6 处置动作类型

| 动作类型 | 说明 |
|----------|------|
| created | 创建事件 |
| status_changed | 状态变更 |
| severity_changed | 严重度变更 |
| assigned | 分配处理人 |
| comment | 添加评论 |
| attachment | 添加附件 |
| playbook_triggered | 触发剧本 |
| enriched | 事件丰富 |
| merged | 合并事件 |
| escalated | 升级处理 |
| closed | 关闭事件 |

### 3.7 TimescaleDB 时序表设计

```sql
-- 原始日志表
CREATE TABLE raw_logs (
    id BIGSERIAL,
    source_id INTEGER,
    timestamp TIMESTAMPTZ NOT NULL,
    raw_message TEXT NOT NULL,
    metadata JSONB,
    search_vector TSVECTOR,
    PRIMARY KEY (id, timestamp)
);
SELECT create_hypertable('raw_logs', 'timestamp');

-- 全文搜索索引
CREATE INDEX idx_raw_logs_search ON raw_logs USING GIN(search_vector);

-- 解析后日志表
CREATE TABLE parsed_logs (
    id BIGSERIAL,
    source_id INTEGER,
    log_type VARCHAR(50),
    timestamp TIMESTAMPTZ NOT NULL,
    src_ip VARCHAR(50),
    dst_ip VARCHAR(50),
    username VARCHAR(100),
    action VARCHAR(50),
    result VARCHAR(50),
    raw_message TEXT,
    details JSONB,
    search_vector TSVECTOR,
    PRIMARY KEY (id, timestamp)
);
SELECT create_hypertable('parsed_logs', 'timestamp');
CREATE INDEX idx_parsed_logs_search ON parsed_logs USING GIN(search_vector);

-- 告警事件表
CREATE TABLE alert_events (
    id BIGSERIAL,
    rule_id INTEGER,
    rule_name VARCHAR(200),
    severity INTEGER,
    message TEXT,
    src_ip VARCHAR(50),
    dst_ip VARCHAR(50),
    timestamp TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, timestamp)
);
SELECT create_hypertable('alert_events', 'timestamp');

-- 压缩策略
ALTER TABLE raw_logs SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'source_id'
);
ALTER TABLE raw_logs SET (
    timescaledb.compress_after = INTERVAL '7 days'
);

-- 告警统计 (5分钟窗口)
CREATE MATERIALIZED VIEW alert_stats_5m
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('5 minutes', timestamp) AS bucket,
    rule_name,
    severity,
    count(*) AS alert_count
FROM alert_events
GROUP BY bucket, rule_name, severity;

-- 日志摄入统计 (1小时窗口)
CREATE MATERIALIZED VIEW log_stats_1h
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 hour', timestamp) AS bucket,
    source_id,
    count(*) AS log_count
FROM raw_logs
GROUP BY bucket, source_id;
```

### 3.7.1 标准告警字段定义 (AlertFieldDefinition)

存储告警标准字段的元数据配置，供日志解析管道和前端展示使用。

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | Integer | 主键 |
| name | String | 字段名（与DB列名一致，如 src_ip） |
| label | String | 中文标签（如"源地址"） |
| field_type | String | 值类型（string/number/datetime/boolean） |
| category | String | 分类分组（如"网络-五元组"、"告警属性"） |
| required | Boolean | 是否必填 |
| description | Text | 字段说明 |
| aliases | JSON | 常见别名变体（用于自动映射匹配） |
| db_column | String | 对应的 alerts 表列名 |
| default_value | String | 默认值 |
| sort_order | Integer | 同分类内排序 |
| enabled | Boolean | 是否启用 |
| created_at | DateTime | 创建时间 |

### 3.7.2 数据库初始化脚本

PostgreSQL 表初始化脚本位置：

| 脚本文件 | 说明 |
|----------|------|
| `postgres/init.d/01-init-timescale.sql` | TimescaleDB 时序表（raw_logs, parsed_logs, alert_events） |
| `postgres/init.d/02-init-timescale-tables.sql` | 额外时序表 |
| `postgres/init.d/03-init-event-actions.sql` | 事件处置记录表 |
| `postgres/init.d/04-init-pipeline-mappings.sql` | 解析管道字段映射表 |

---

## 四、页面设计

### 4.1 数据源管理页面 (DataIngestion)

```
┌─────────────────────────────────────────────────────────────────┐
│  数据接入                                                         │
│  管理和监控所有日志数据源                                          │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│ │ 数据源  │ │ 智能解析 │ │ 日志类型 │ │ 格式模板 │ │ 存储配置 │   │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 统计卡片: 数据源总数 | 已连接 | 同步中 | 异常 | 总事件数    │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 数据源列表                                                  │ │
│ │ ┌─────────────────────────────────────────────────────────┐│ │
│ │ │ [勾选] 名称       │ 类型 │ 协议 │ 状态 │ 健康度 │ 操作 ││ │
│ │ ├─────────────────────────────────────────────────────────┤│ │
│ │ │ [ ] Kafka-安全日志 │ pull │ kafka│ ●   │ 99%   │ ⋮   ││ │
│ │ │ [ ] Syslog-网络   │ push │syslog│ ●   │ 95%   │ ⋮   ││ │
│ │ └─────────────────────────────────────────────────────────┘│ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 安全告警页面 (SecurityAlerts)

```
┌─────────────────────────────────────────────────────────────────┐
│  告警分诊                                                         │
│  实时监控和处理安全告警事件                                          │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│ │待分诊 5 │ │危急 2  │ │调查中 3 │ │误报 10 │ │已处理 8│   │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
├─────────────────────────────────────────────────────────────────┤
│ [搜索: 输入告警标题或ID...] [严重度▼] [状态▼] [排序▼]  [导出] [刷新] │
├─────────────────────────────────────────────────────────────────┤
│ 已选择 2 项: [确认为事件] [开始调查] [加入观察] [标记误报] [批量关闭] │
├─────────────────────────────────────────────────────────────────┤
│ 告警列表                                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │[勾选] 告警信息      │ 风险等级 │ 来源      │ 状态   │ 时间  │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │[x] SQL注入攻击尝试  │ 危急     │ IDS-01   │ 新告警 │ 10:28 │ │
│ │    ALERT-2026-045  │          │          │        │       │ │
│ │[ ] 可疑出站连接    │ 高危     │ FW-01    │ 新告警 │ 10:30 │ │
│ │    ALERT-2026-001  │          │          │        │       │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 事件工作台页面 (EventWorkspace)

```
┌─────────────────────────────────────────────────────────────────┐
│  事件工作台                                                         │
│  处理和管理安全事件，支持状态流转和批量操作                            │
├─────────────────────────────────────────────────────────────────┤
│ [搜索: 事件标题或ID...] [筛选▼] [导出] [+ 新建事件]                    │
├─────────────────────────────────────────────────────────────────┤
│ 事件列表                                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │[勾选] 事件ID      │ 事件信息        │ 严重 │ 状态   │ 操作 │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │[x] EVT-20260501-001│ SQL注入攻击事件  │ 危急 │ 调查中 │ 👁 📋 │ │
│ │    关联告警:3      │ Web攻击         │      │        │      │ │
│ │[ ] EVT-20260501-002│ 可疑出站连接    │ 高危 │ 新建   │ 👁 📋 │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 事件详情侧边栏                                                      │
├─────────────────────────────────────────────────────────────────┤
│ [关闭 X]                                                          │
│ SQL注入攻击事件                                                    │
│ [危急] [调查中]                                                    │
├─────────────────────────────────────────────────────────────────┤
│ 基本信息:                                                         │
│ 事件ID: EVT-20260501-001                                        │
│ 事件类型: Web攻击                                                 │
│ 源IP: 45.142.212.100                                           │
│ 置信度: 98%                                                      │
│ 发生时间: 2026-05-01 10:28:00                                   │
├─────────────────────────────────────────────────────────────────┤
│ 影响资产: [web-server-01] [web-server-02]                       │
├─────────────────────────────────────────────────────────────────┤
│ [开始调查] [关闭事件] [重新打开]                                    │
│ [选择剧本执行 ▼]                                                  │
├─────────────────────────────────────────────────────────────────┤
│ 处置记录 (5条)                                                    │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ● [状态变更] 2026-05-01 10:35:00                            │ │
│ │   admin: 状态从 新建 变更为 调查中                           │ │
│ │ ● [创建事件] 2026-05-01 10:28:00                           │ │
│ │   system: 创建了事件：SQL注入攻击事件                       │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ [添加处置记录...                    ] [发送]                      │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 告警聚合功能

**聚合规则**:

| 规则类型 | 说明 |
|----------|------|
| 同源IP聚合 | 相同源IP的告警聚合 |
| 同目标聚合 | 相同目标资产的告警聚合 |
| 关联时间聚合 | 短时间内(可配置)的告警聚合 |
| 相似度聚合 | 相似内容的告警聚合 |

**聚合操作流程**:
1. 选择要聚合的告警
2. 点击"聚合生成事件"
3. 系统自动分析关联告警
4. 生成事件并关联所有告警
5. 更新告警状态为"investigating"

---

## 五、后端API接口规范

### 5.1 数据源管理API

#### 获取数据源列表
```
GET /api/data-sources
Query: page, page_size, status, search
Response: {
  success: true,
  data: {
    items: [DataSource],
    total: number,
    page: number,
    page_size: number
  }
}
```

#### 创建数据源
```
POST /api/data-sources
Body: {
  name: string,
  source_type: string,
  protocol: string,
  config: object
}
Response: { success: true, data: DataSource }
```

#### 更新数据源
```
PUT /api/data-sources/{id}
Body: { name, config, status }
Response: { success: true, data: DataSource }
```

#### 删除数据源
```
DELETE /api/data-sources/{id}
Response: { success: true, message: string }
```

#### 测试数据源连接
```
POST /api/data-sources/{id}/test
Response: { success: true, data: { connected: boolean, message: string } }
```

### 5.2 解析管道API

#### 获取管道列表
```
GET /api/pipelines
Response: {
  success: true,
  data: {
    pipelines: [Pipeline],
    total: number
  }
}
```

#### 创建管道
```
POST /api/pipelines
Body: {
  name: string,
  input_format: string,
  field_mapping: object,
  filter_rules: array,
  output_target: string,
  priority: number
}
Response: { success: true, data: Pipeline }
```

#### 测试解析
```
POST /api/pipelines/parse/test
Body: { log: string, format: string, config: object }
Response: {
  success: true,
  data: {
    raw_log: string,
    parsed: object,
    available_fields: array
  }
}
```

### 5.3 告警API

#### 获取告警列表
```
GET /api/alerts
Query: page, page_size, severity, status, search, start_date, end_date
Response: {
  success: true,
  data: {
    items: [Alert],
    total: number,
    page: number,
    page_size: number
  }
}
```

#### 获取告警详情
```
GET /api/alerts/{alert_id}
Response: { success: true, data: Alert }
```

#### 更新告警状态
```
PUT /api/alerts/{alert_id}/status
Body: { status: string }
Response: { success: true, data: Alert }
```

#### 批量更新告警状态
```
PUT /api/alerts/batch/status
Body: { alert_ids: array, status: string }
Response: { success: true, data: { updated_count: number } }
```

#### 聚合告警生成事件
```
POST /api/alerts/aggregate
Body: { alert_ids: array, title: string, severity: string }
Response: {
  success: true,
  data: {
    event: Event,
    aggregated_count: number
  }
}
```

#### 获取告警统计
```
GET /api/alerts/stats
Response: {
  success: true,
  data: {
    total: number,
    today_new: number,
    by_severity: { critical, high, medium, low },
    by_status: { new, investigating, closed, false_positive }
  }
}
```

### 5.4 事件API

#### 获取事件列表
```
GET /api/events
Query: page, page_size, severity, status, search, start_date, end_date
Response: {
  success: true,
  data: {
    items: [Event],
    total: number,
    page: number,
    page_size: number
  }
}
```

#### 获取事件详情
```
GET /api/events/{event_id}
Response: { success: true, data: Event }
```

#### 创建事件
```
POST /api/events
Body: {
  title: string,
  description: string,
  severity: string,
  category: string,
  alert_ids: array,
  source_ip: string
}
Response: { success: true, data: Event }
```

#### 更新事件
```
PUT /api/events/{event_id}
Body: { title, description, severity, status, assignee_id }
Response: { success: true, data: Event }
```

#### 更新事件状态
```
PUT /api/events/{event_id}/status
Body: { status: string, reason: string }
Response: { success: true, data: Event }
```

#### 获取事件处置记录
```
GET /api/events/{event_id}/actions
Query: page, page_size
Response: {
  success: true,
  data: {
    items: [EventAction],
    total: number
  }
}
```

#### 添加处置记录
```
POST /api/events/{event_id}/actions
Body: {
  action: string,
  content: string,
  attachments: array
}
Response: { success: true, data: EventAction }
```

#### 执行剧本
```
POST /api/events/{event_id}/playbooks/{playbook_id}/execute
Body: { params: object }
Response: {
  success: true,
  data: {
    execution_id: string,
    status: string,
    started_at: string
  }
}
```

#### 获取事件统计
```
GET /api/events/stats
Response: {
  success: true,
  data: {
    total: number,
    today_new: number,
    by_severity: { critical, high, medium, low },
    by_status: { new, investigating, closed, false_positive }
  }
}
```

#### 批量更新事件状态
```
PUT /api/events/batch/status
Body: { event_ids: array, status: string }
Response: { success: true, data: { updated_count: number } }
```

### 5.5 任务分派API

#### 分配处理人
```
POST /api/events/{event_id}/assign
Body: { assignee_id: number, assignee_name: string }
Response: { success: true, data: Event }
```

#### 获取可分配用户列表
```
GET /api/users?role=analyst
Response: {
  success: true,
  data: [User]
}
```

---

## 六、数据流与状态转换

### 6.1 告警状态流转

```
                    ┌─────────────┐
                    │    new      │ (新告警)
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │investigating│  │false_positive│  │   closed    │
   │   (调查中)   │  │    (误报)    │  │  (已关闭)   │
   └──────┬──────┘  └─────────────┘  └─────────────┘
          │
          │ 生成事件
          ▼
   ┌─────────────┐
   │   关联事件   │
   │ (已聚合)    │
   └─────────────┘
```

### 6.2 事件状态流转

```
   ┌─────────────┐
   │    new      │ (新建)
   └──────┬──────┘
          │
          │ 开始调查
          ▼
   ┌─────────────┐
   │investigating│ (调查中)
   └──────┬──────┘
          │
    ┌─────┴─────┐
    │           │
    ▼           ▼
┌─────────┐  ┌─────────────┐
│ closed  │  │false_positive│
│(已关闭) │  │    (误报)    │
└─────────┘  └─────────────┘
    │
    │ 重新打开
    ▼
┌─────────────┐
│    new      │
└─────────────┘
```

### 6.3 完整数据流

```
数据源接入
    │
    ▼
日志解析管道 (Pipeline)
    │
    ├──▶ 解析成功 ──▶ 规则分析
    │                    │
    │                    ├──▶ 触发规则 ──▶ 生成告警 ──▶ 告警分诊
    │                    │                              │
    │                    │                              ├──▶ 确认为事件 ──▶ 事件工作台
    │                    │                              │              │
    │                    │                              │              ├──▶ 分配处理人
    │                    │                              │              ├──▶ 执行剧本
    │                    │                              │              ├──▶ 添加处置记录
    │                    │                              │              └──▶ 关闭事件
    │                    │                              │
    │                    │                              └──▶ 标记误报
    │                    │
    │                    └──▶ 无规则匹配 ──▶ 直接存储日志
    │
    └──▶ 解析失败 ──▶ 记录解析错误 ──▶ 日志查询

告警聚合
    │
    ├──▶ 选择相关告警
    ├──▶ 执行聚合规则
    └──▶ 生成事件并关联所有告警
```

### 6.4 API调用时序

#### 告警生成事件
```
前端                          后端                          数据库
 │                             │                              │
 │ POST /api/alerts/aggregate │                              │
 │ {alert_ids: [1,2,3]}       │                              │
 │────────────────────────────>│                              │
 │                             │ INSERT Event                │
 │                             │────────────────────────────>│
 │                             │ INSERT EventAction          │
 │                             │────────────────────────────>│
 │                             │ UPDATE Alert (event_id)     │
 │                             │────────────────────────────>│
 │                             │                              │
 │ {success: true, event}      │                              │
 │<────────────────────────────│                              │
```

#### 事件状态更新
```
前端                          后端                          数据库
 │                             │                              │
 │ PUT /api/events/{id}/status │                              │
 │ {status: "closed"}          │                              │
 │────────────────────────────>│                              │
 │                             │ UPDATE Event                 │
 │                             │────────────────────────────>│
 │                             │ INSERT EventAction           │
 │                             │────────────────────────────>│
 │                             │ INSERT AuditLog             │
 │                             │────────────────────────────>│
 │                             │                              │
 │ {success: true, event}      │                              │
 │<────────────────────────────│                              │
```

---

## 七、组件技术指南

### 7.1 组件说明

| 组件 | 类型 | 规格 | 说明 |
|------|------|------|------|
| **Kafka Cluster** | 消息队列 | 3 Broker | 高吞吐量日志摄入，支持多数据源 |
| **Zookeeper** | 协调服务 | 3 节点 | Kafka 集群协调 |
| **Kafka Connect** | 连接器 | 分布式 | 数据源集成 (S3, Database, etc.) |
| **Filebeat** | 代理 | 轻量级 | 日志文件采集 |
| **Syslog Agent** | 代理 | 轻量级 | Syslog/UDP/TCP 采集 |

| 组件 | Job 类型 | 并行度 | 功能说明 |
|------|----------|--------|----------|
| **Log Parser Job** | DataStream | 4 | 日志解析、字段提取、数据富化 |
| **Alert Engine Job** | DataStream + CEP | 4 | 实时告警检测、规则匹配 |
| **Metrics Job** | DataStream | 2 | 指标聚合、统计计算 |

### 7.2 为什么选择 Flink 而非 Python 多线程

| 对比项 | Python 多线程 | Flink |
|--------|--------------|-------|
| 吞吐量 | ~10K msg/s | 100K+ msg/s |
| 延迟 | 100-500ms | <10ms |
| 状态管理 | 需自行实现 | 内置 RocksDB |
| 容错 | 手动 | Checkpoint + Exactly-Once |
| 扩展性 | 有限 | 水平扩展 |
| 规则复杂度 | 简单 | 支持 CEP/时序/关联 |

### 7.3 服务端口

| 服务 | 地址 | 说明 |
|-----|------|-----|
| Kafka UI | http://localhost:8080 | Kafka 主题管理 |
| Flink UI | http://localhost:8081 | Flink 任务管理 |
| TimescaleDB | localhost:5432 | 时序数据库 |
| Redis | localhost:6379 | 缓存服务 |

### 7.4 快速开始

```bash
# 启动所有服务
./start-bigdata.sh up

# 检查服务状态
./start-bigdata.sh status

# 初始化 Kafka Topics
./start-bigdata.sh init-topics

# 测试日志摄入
./start-bigdata.sh test

# 停止服务
./start-bigdata.sh down
```

### 7.5 Python 后端集成

```python
from app.utils.kafka_client import get_kafka_client, LogIngestionService

# 获取客户端
client = get_kafka_client()

# 发送日志
client.send_message("raw-logs", {
    "id": "log-001",
    "raw": '{"timestamp": "2024-01-01", "src_ip": "192.168.1.1"}',
    "type": "json"
})

# 批量发送
service = LogIngestionService()
count = service.ingest_logs([log1, log2, log3])
print(f"已摄入 {count} 条日志")
```

### 7.6 Flink Job 提交

```bash
# 启动 Flink Job
./start-bigdata.sh flink-submit

# 或手动提交
flink run -d \
  -p 4 \
  --detached \
  flink-jobs/log_parser_job.py

flink run -d \
  -p 4 \
  --detached \
  flink-jobs/alert_engine_job.py
```

### 7.7 监控

#### Kafka 监控
1. 打开 http://localhost:8080 (Kafka UI)
2. 查看 Topic、Consumer Group、消息量

#### Flink 监控
1. 打开 http://localhost:8081
2. 查看 Jobs、Task Managers、Checkpoints

---

## 八、部署与实施

### 8.1 部署架构

#### 小规模部署 (基础版)
```
┌────────────────────────────────────────────────┐
│                   Docker Compose                │
│                                                │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │  API    │ │ Flink   │ │ Kafka  │           │
│  │ Server  │ │ Cluster │ │ (1 B)  │           │
│  └────┬────┘ └────┬────┘ └────┬────┘          │
│       │           │           │                │
│       └───────────┴───────────┘                │
│                   │                             │
│              ┌────┴────┐                        │
│              │ 存储层   │                        │
│              │(单节点) │                        │
│              └─────────┘                        │
└────────────────────────────────────────────────┘
```

#### 中等规模部署 (标准版)
```
┌─────────────────────────────────────────────────────────┐
│                      Kubernetes                          │
│                                                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │
│  │ API Pods    │ │ Flink       │ │ Kafka       │      │
│  │ (3副本)     │ │ Cluster     │ │ (3 Broker)  │      │
│  └─────────────┘ └─────────────┘ └─────────────┘      │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │              存储层 (分布式)                       │   │
│  │  TimescaleDB │ PostgreSQL │ Redis                │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 8.2 一键部署

```bash
# 1. 启动所有服务
./start-bigdata.sh up

# 2. 初始化 Kafka Topics
./scripts/init-kafka-topics.sh

# 3. 初始化 TimescaleDB 表
docker exec -i timescale psql -U postgres -d timescale < postgres/init.d/01-init-timescale.sql

# 4. 提交 Flink Jobs
./start-bigdata.sh flink-submit

# 5. 检查状态
./start-bigdata.sh status
```

### 8.3 验证

```bash
# 测试日志摄入
curl -X POST http://localhost:5000/api/ingestion/logs \
  -H "Content-Type: application/json" \
  -d '{"message": "test log", "source": "test"}'

# 检查 Kafka
docker exec kafka kafka-console-consumer --topic raw-logs --from-beginning --bootstrap-server localhost:9092

# 检查 TimescaleDB
docker exec timescale psql -U postgres -d timescale -c "SELECT COUNT(*) FROM raw_logs;"
```

### 8.4 后端启动

启动后端时会自动执行以下操作:
1. 检查 TimescaleDB 是否就绪
2. 检查 Kafka 是否就绪
3. 检查 Redis 是否就绪
4. 检查 Flink JobManager 是否就绪
5. 自动启动 Docker 服务 (如未运行)
6. 初始化 Kafka Topics
7. 初始化 TimescaleDB 表

```bash
cd server-python
python run.py
```

跳过组件检查:
```bash
SKIP_BIGDATA_CHECK=1 python run.py
```

### 8.5 健康检查API

```
GET /api/health
```

响应示例:
```json
{
  "status": "healthy",
  "service": "USOP Backend API (Python)",
  "version": "1.0.0",
  "databases": {
    "postgresql": "connected",
    "timescaledb": "connected"
  },
  "components": {
    "timescale": "healthy",
    "kafka": "healthy",
    "redis": "healthy",
    "flink": "healthy"
  },
  "timestamp": "2026-05-04T16:43:00"
}
```

### 8.6 监控指标

| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| kafka_consumer_lag | Kafka 消费延迟 | >10000 |
| flink_job_status | Flink Job 状态 | FAILED |
| timescale_connection | TimescaleDB 连接 | DISCONNECTED |
| redis_connection | Redis 连接 | DISCONNECTED |
| ingestion_rate | 日志摄入速率 | <100/s |

### 8.7 已完成功能清单

#### 架构文档
- [x] 系统架构设计 (ARCHITECTURE.md)
- [x] 数据接入管理详细设计 (DATA_INGESTION.md)
- [x] 大数据组件指南 (BIGDATA_SETUP.md)
- [x] 改造计划与待办事项 (IMPLEMENTATION_PLAN.md)

#### 容器配置
- [x] TimescaleDB 配置
- [x] Kafka 配置
- [x] Zookeeper 配置
- [x] Flink JobManager/TaskManager 配置
- [x] Redis 配置
- [x] Kafka UI 配置

#### 初始化脚本
- [x] TimescaleDB 表创建 (`postgres/init.d/01-init-timescale.sql`)
- [x] Kafka Topic 创建 (`scripts/init-kafka-topics.sh`)
- [x] 服务启动管理 (`start-bigdata.sh`)

#### TimescaleDB 表设计
- [x] raw_logs (原始日志)
- [x] parsed_logs (解析日志)
- [x] alert_events (告警事件)
- [x] alert_stats_5m (告警统计视图)
- [x] log_stats_5m (日志统计视图)

#### 前端功能
- [x] 检测规则页面 (保存、测试、Toast提示)
- [x] 告警分诊页面 (聚合生成事件)
- [x] API 服务层更新

---

## 九、版本与定价

### 9.1 版本分层

#### 基础版 (Basic)
| 组件 | 规格 | 单价/月 |
|------|------|---------|
| Kafka | 1 Broker, 6 分区 | ¥500 |
| Flink | 1 JobManager, 2 TaskManager | ¥800 |
| TimescaleDB | 2 vCPU, 8GB RAM, 500GB SSD | ¥600 |
| Redis | 1GB | ¥100 |
| PostgreSQL | 2 vCPU, 4GB RAM, 100GB | ¥300 |
| **合计** | | **¥2,300/月** |

#### 标准版 (Standard)
| 组件 | 规格 | 单价/月 |
|------|------|---------|
| Kafka | 3 Broker, 12 分区 | ¥1,200 |
| Zookeeper | 3 节点 | ¥300 |
| Flink | 1 JobManager, 4 TaskManager | ¥1,600 |
| TimescaleDB | 4 vCPU, 16GB RAM, 1TB SSD | ¥1,200 |
| Redis | 4GB | ¥300 |
| PostgreSQL | 4 vCPU, 8GB RAM, 200GB | ¥500 |
| **合计** | | **¥5,100/月** |

#### 企业版 (Enterprise)
| 组件 | 规格 | 单价/月 |
|------|------|---------|
| Kafka | 5 Broker, 24 分区, 副本 3 | ¥2,000 |
| Zookeeper | 5 节点 | ¥500 |
| Kafka Connect | 3 实例 | ¥800 |
| Flink HA | 2 JobManager, 8 TaskManager | ¥3,200 |
| TimescaleDB | 8 vCPU, 32GB RAM, 2TB SSD | ¥2,400 |
| Redis Cluster | 3 节点, 16GB | ¥800 |
| PostgreSQL | 8 vCPU, 16GB RAM, 500GB | ¥1,000 |
| **合计** | | **¥10,700/月** |

### 9.2 按量付费

| 指标 | 单价 |
|------|------|
| 日志摄入量 | ¥0.1 / 万条 |
| 告警触发次数 | ¥0.5 / 次 |
| 存储空间 (TimescaleDB) | ¥0.5 / GB/天 |
| API 请求次数 | ¥0.01 / 千次 |

### 9.3 功能模块定价

| 模块 | 基础版 | 标准版 | 企业版 |
|------|--------|--------|--------|
| 数据接入管理 | ✅ | ✅ | ✅ |
| 日志解析 (LogParser) | ✅ | ✅ | ✅ |
| 实时告警检测 | ❌ | ✅ | ✅ |
| 规则管理 (单事件) | ✅ | ✅ | ✅ |
| 规则管理 (关联规则) | ❌ | ✅ | ✅ |
| 规则管理 (时序/CEP) | ❌ | ❌ | ✅ |
| 事件调查 | 7天 | 30天 | 永久 |
| 报表分析 | 基础 | 高级 | 自定义 |
| 多租户 | ❌ | ❌ | ✅ |
| SSO 集成 | ❌ | ❌ | ✅ |
| SLA 保障 | 无 | 99.5% | 99.9% |
| 技术支持 | 社区 | 邮件 | 24/7 专属 |

### 9.4 性能指标对比

| 指标 | 基础版 | 标准版 | 企业版 |
|------|--------|--------|--------|
| 日志摄入速率 | 50K/s | 200K/s | 1M/s |
| 告警延迟 | <30s | <10s | <1s |
| 查询响应 (P99) | <5s | <2s | <500ms |
| 最大数据源 | 5 | 50 | 无限制 |
| 并发用户 | 10 | 100 | 1000 |
| 存储容量 | 500GB | 5TB | 50TB |
| 保留期 | 7天 | 90天 | 定制 |

---

## 附录

### A. 字段关联关系

#### 告警与事件的关联
```
Alert.event_id ──────▶ Event.id
Alert.event_code ───▶ Event.event_code
Alert.aggregated ────▶ Boolean (是否已聚合)
Alert.aggregated_ids ▶ JSON (聚合的告警ID列表)
```

#### 事件与处置记录的关联
```
EventAction.event_id ──▶ Event.id
EventAction.event_code ▶ Event.event_code
EventAction.user_id ──▶ User.id
```

#### 数据源与管道的关联
```
DataSource.parse_pipelines ──▶ JSON Array of Pipeline.id
Pipeline.data_sources ────────▶ 反向关联
```

### B. 关键功能实现

#### 告警分诊工作流
1. **告警接收**: 数据源接入 → 管道解析 → 规则匹配 → 生成告警
2. **告警分诊**: 查看告警详情 → 判断是否为真实威胁 → 执行操作
3. **操作选项**:
   - 确认为事件: 创建事件，关联告警
   - 开始调查: 更新状态为调查中
   - 加入观察: 持续监控
   - 标记误报: 分类为误报
   - 批量关闭: 批量处理

#### 事件处置工作流
1. **事件创建**: 从告警生成 或 手动创建
2. **事件分配**: 指定处理人
3. **调查处置**: 添加处置记录，执行剧本
4. **状态更新**: 根据进度更新状态
5. **事件关闭**: 完成处置，填写结论

#### 剧本执行
1. **剧本选择**: 从可用剧本列表选择
2. **参数配置**: 设置执行参数
3. **执行监控**: 查看执行进度
4. **结果记录**: 自动记录到处置历史

### C. 后续待完成工作

- [ ] 实现 Flink Log Parser Job (Python)
- [ ] 实现 Flink Alert Engine Job (Python)
- [ ] 完善规则同步机制
- [ ] 实现 TimescaleDB 全文搜索查询
- [ ] 添加监控告警
- [ ] 完善前端交互
- [ ] 集成测试
- [ ] 性能优化
