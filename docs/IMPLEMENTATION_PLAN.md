# USOP 平台改造计划

## 一、简化架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         PostgreSQL                              │
│  数据源配置 | 解析规则 | 告警规则 | 通知渠道 | 模板 | 用户    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       TimescaleDB                               │
│                                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                          │
│  │ 原始日志 │  │解析日志 │  │  告警   │                          │
│  └─────────┘  └─────────┘  └─────────┘                          │
│                                                                 │
│  - 时序分区 (按时间自动分片)                                     │
│  • 压缩策略 (热数据 → 冷数据压缩比 10:1)                         │
│  • 全文搜索 (tsvector 列式存储)                                 │
│  • 连续聚合 (实时统计)                                           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Apache Kafka (消息队列)                        │
│  Topic: raw-logs | parsed-logs | alerts | metrics | dlq-logs  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│ Apache Flink  │      │ Apache Flink  │      │ Apache Flink  │
│ Log Parser    │      │ Alert Engine  │      │  Metrics      │
└───────────────┘      └───────────────┘      └───────────────┘
```

## 二、改造模块清单

### 2.1 数据接入管理 ✅ 已有

| 功能 | 状态 | 说明 |
|------|------|------|
| 数据源管理 | ✅ 已有 | DataSourceManager |
| 解析管道 | ✅ 已有 | Pipeline 配置 |
| 日志类型 | ✅ 已有 | LogTypeManager |
| 格式模板 | ✅ 已有 | FormatTemplate |
| 存储配置 | ✅ 已有 | StorageConfig |

**待完善：**
- [ ] Kafka Topic 自动创建脚本
- [ ] 数据源连接测试 API
- [ ] 实时状态监控

### 2.2 规则管理 🔄 进行中

| 功能 | 状态 | 说明 |
|------|------|------|
| 规则列表 | ✅ 已有 | DetectionRules.tsx |
| 规则类型 | ✅ 已有 | single/correlation/sequence |
| 响应动作 | ✅ 已有 | alert/block/notify/ticket |

**待完善：**
- [ ] 规则保存到 PostgreSQL
- [ ] 规则同步到 Flink
- [ ] 规则测试功能

### 2.3 威胁狩猎 🔄 进行中

| 功能 | 状态 | 说明 |
|------|------|------|
| 狩猎查询 | ✅ 已有 | HuntingQuery 模型 |
| 查询历史 | ✅ 已有 | 后端 API |

**待完善：**
- [ ] TimescaleDB 全文搜索集成
- [ ] 狩猎结果展示
- [ ] 查询模板

### 2.4 告警管理 🔄 进行中

| 功能 | 状态 | 说明 |
|------|------|------|
| 告警列表 | ✅ 已有 | Alert 模型 |
| 告警日志 | ✅ 已有 | AlertLog (TimescaleDB) |

**待完善：**
- [ ] Flink 告警引擎集成
- [ ] 告警统计面板

### 2.5 仪表盘 🔄 进行中

| 功能 | 状态 | 说明 |
|------|------|------|
| 概览统计 | ✅ 已有 | Dashboard 页面 |
| 趋势图 | ✅ 已有 | 后端 API |

**待完善：**
- [ ] TimescaleDB 实时统计
- [ ] 告警趋势

## 三、Flink 作业设计

### 3.1 Log Parser Job

```python
# flink-jobs/log_parser_job.py
from pyflink.datastream import StreamExecutionEnvironment
from pyflink.connector.kafka import KafkaSource, KafkaOffsetsInitializer

def main():
    env = StreamExecutionEnvironment.get_execution_environment()
    
    # Kafka Source
    source = KafkaSource.builder() \
        .set_bootstrap_servers("kafka:29092") \
        .set_topics("raw-logs") \
        .set_group_id("flink-log-parser") \
        .set_starting_offsets(KafkaOffsetsInitializer.earliest()) \
        .build()
    
    # 解析逻辑
    stream = env.from_source(source, WatermarkStrategy.no_watermarks(), "Kafka Source")
    
    # JSON 解析
    stream.map(parse_json)
    
    # 字段提取
    stream.map(extract_fields)
    
    # 输出到 TimescaleDB
    stream.add_sink(jdbc_sink)
    
    env.execute("Log Parser Job")
```

### 3.2 Alert Engine Job

```python
# flink-jobs/alert_engine_job.py
from pyflink.datastream import StreamExecutionEnvironment
from pyflink.cep import Pattern, CEP

def main():
    env = StreamExecutionEnvironment.get_execution_environment()
    
    # 从 Kafka 消费解析后日志
    stream = env.add_source(kafka_source("parsed-logs"))
    
    # 单事件规则
    single_rules = stream.filter(single_event_filter)
    
    # 关联规则 (滑动窗口)
    correlation_rules = stream \
        .key_by("user_id") \
        .window(SlidingEventTimeWindows.of(Time.minutes(5))) \
        .aggregate(count_aggregate)
    
    # 时序规则 (CEP)
    cep_pattern = Pattern.begin("failed") \
        .where(lambda e: e.action == "login_fail") \
        .next("success") \
        .where(lambda e: e.action == "login_success") \
        .within(Time.minutes(5))
    
    # 输出告警
    alerts = ...
    alerts.add_sink(kafka_sink("alerts"))
    
    env.execute("Alert Engine Job")
```

## 四、TimescaleDB 表设计

### 4.1 时序表

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
```

### 4.2 连续聚合

```sql
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

## 五、API 设计

### 5.1 数据接入 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/datasources` | 获取数据源列表 |
| POST | `/api/datasources` | 创建数据源 |
| PUT | `/api/datasources/{id}` | 更新数据源 |
| DELETE | `/api/datasources/{id}` | 删除数据源 |
| POST | `/api/datasources/{id}/test` | 测试连接 |
| POST | `/api/datasources/{id}/enable` | 启用数据源 |
| POST | `/api/datasources/{id}/disable` | 禁用数据源 |

### 5.2 规则管理 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/rules` | 获取规则列表 |
| POST | `/api/rules` | 创建规则 |
| PUT | `/api/rules/{id}` | 更新规则 |
| DELETE | `/api/rules/{id}` | 删除规则 |
| POST | `/api/rules/{id}/enable` | 启用规则 |
| POST | `/api/rules/{id}/disable` | 禁用规则 |
| POST | `/api/rules/{id}/test` | 测试规则 |

### 5.3 威胁狩猎 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/hunting/queries` | 获取查询列表 |
| POST | `/api/hunting/queries` | 执行查询 |
| GET | `/api/hunting/results/{id}` | 获取查询结果 |
| POST | `/api/hunting/search` | 全文搜索 |

### 5.4 告警 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/alerts` | 获取告警列表 |
| GET | `/api/alerts/{id}` | 获取告警详情 |
| PUT | `/api/alerts/{id}/status` | 更新告警状态 |
| GET | `/api/alerts/stats` | 获取告警统计 |

## 六、容器配置

### 6.1 服务启动顺序

```yaml
# docker-compose.yml 服务依赖
services:
  # 1. 数据库 (最先启动)
  timescale:
    ...
    
  # 2. 消息队列
  zookeeper:
    ...
  kafka:
    depends_on: zookeeper
    ...
    
  # 3. 缓存
  redis:
    ...
    
  # 4. Flink (需要 Kafka)
  jobmanager:
    depends_on: kafka
    ...
  taskmanager:
    depends_on: jobmanager
    ...
    
  # 5. 后端 API
  backend:
    depends_on: [timescale, kafka, redis]
    ...
    
  # 6. 前端
  frontend:
    depends_on: backend
    ...
```

### 6.2 Flink Job 提交

```bash
# 启动 Flink Job
./start-bigdata.sh flink-submit

# 或手动提交
flink run -d \
  -p 4 \
  -- detachment \
  flink-jobs/log_parser_job.py

flink run -d \
  -p 4 \
  -- detachment \
  flink-jobs/alert_engine_job.py
```

## 七、监控配置

### 7.1 监控指标

| 指标 | 说明 | 告警阈值 |
|------|------|----------|
| kafka_consumer_lag | Kafka 消费延迟 | >10000 |
| flink_job_status | Flink Job 状态 | FAILED |
| timescale_connection | TimescaleDB 连接 | DISCONNECTED |
| redis_connection | Redis 连接 | DISCONNECTED |
| ingestion_rate | 日志摄入速率 | <100/s |

### 7.2 健康检查

```bash
# 检查所有服务状态
./start-bigdata.sh status

# 检查 Kafka
docker exec kafka kafka-topics --list --bootstrap-server localhost:9092

# 检查 Flink
curl http://localhost:8081/jobmanager/config

# 检查 TimescaleDB
docker exec timescale psql -U postgres -d timescale -c "\\dt"
```

## 八、部署步骤

### 8.1 一键部署

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

### 8.2 验证

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

## 九、待办事项

- [ ] 完善 Kafka Topic 自动创建
- [ ] 实现 Flink Log Parser Job
- [ ] 实现 Flink Alert Engine Job
- [ ] 集成 TimescaleDB 全文搜索
- [ ] 实现规则同步机制
- [ ] 添加监控告警
- [ ] 完善前端交互
