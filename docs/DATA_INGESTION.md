# 数据接入管理模块详细设计

## 一、模块概述

数据接入管理是 USOP 平台的核心模块，负责从各种数据源采集日志和安全事件，并将其输送到后端流处理管道。

### 1.1 核心功能

| 功能 | 说明 |
|------|------|
| 多协议接入 | 支持 Kafka、Syslog、HTTP、Webhook、S3、JDBC 等 15+ 协议 |
| Push/Pull 模式 | 同时支持主动拉取和被动接收 |
| 解析管道 | 可配置的解析规则和数据转换 |
| 存储配置 |灵活的存储目标和保留策略 |
| 监控运维 | 连接状态、健康度、吞吐量监控 |

---

## 二、数据接入架构

### 2.1 整体数据流

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           数据接入层 (Data Ingestion Layer)                    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     数据源分类器 (Source Classifier)                  │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │    │
│  │  │ PUSH    │ │ PUSH    │ │ PULL    │ │ PULL    │ │ PULL    │       │    │
│  │  │ Kafka   │ │ Syslog  │ │ S3      │ │ JDBC    │ │ HTTP    │       │    │
│  │  │         │ │ TCP/UDP │ │         │ │         │ │ API     │       │    │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘       │    │
│  └───────┼───────────┼───────────┼───────────┼───────────┼─────────────┘    │
│          │           │           │           │           │                    │
│          └───────────┴───────────┼───────────┴───────────┘                    │
│                                  │                                           │
│                                  ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Kafka (原始日志 Topic: raw-logs)                    │    │
│  └────────────────────────────────┬────────────────────────────────────┘    │
│                                   │                                          │
│                                   ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      Flink Log Parser Job                             │    │
│  │                                                                       │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │
│  │  │ 预过滤器    │  │ 格式识别   │  │ 字段提取   │  │ 数据富化   │  │    │
│  │  │ (Pre-filter)│  │(Format ID) │  │(Extract)   │  │(Enrichment)│  │    │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │    │
│  └─────────┼───────────────┼───────────────┼───────────────┼──────────┘    │
│            │               │               │               │                 │
│            │               │               │               ▼                 │
│            │               │               │        ┌─────────────┐          │
│            │               │               │        │  日志分类   │          │
│            │               │               │        │(Log Type)  │          │
│            │               │               │        └──────┬──────┘          │
│            │               │               │               │                 │
│            └───────────────┴───────────────┴───────────────┘                 │
│                                                                              │
│                                   │                                          │
│                                   ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                   Kafka (解析后日志 Topic: parsed-logs)                 │    │
│  └────────────────────────────────┬────────────────────────────────────┘    │
│                                   │                                          │
│           ┌───────────────────────┼───────────────────────┐               │
│           │                       │
│           ▼                       │
│  ┌─────────────────────────────┐ │
│  │      TimescaleDB            │ │
│  │  (时序存储 + 全文搜索)     │ │
│  │                             │ │
│  │ • 日志数据                  │ │
│  │ • 告警事件                  │ │
│  │ • 全文搜索 (tsvector)       │ │
│  └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 数据接入模式

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

---

## 三、协议配置详解

### 3.1 Kafka 配置

```json
{
  "name": "Kafka-安全日志",
  "type": "pull",
  "protocol": "kafka",
  "config": {
    "brokers": ["kafka1:9092", "kafka2:9092", "kafka3:9092"],
    "topic": "security-logs",
    "consumer_group": "usop-log-parser",
    "auto_offset_reset": "latest",
    "enable_auto_commit": false,
    "max_poll_records": 500,
    "session_timeout_ms": 30000,
    "security_protocol": "PLAINTEXT"
  },
  "parse_pipelines": ["json-parser", "cef-parser"],
  "storage": {
    "target": "timescaledb",
    "table": "security_events",
    "retention_days": 90
  }
}
```

### 3.2 Syslog 配置

```json
{
  "name": "Syslog-网络设备",
  "type": "push",
  "protocol": "syslog",
  "config": {
    "host": "0.0.0.0",
    "port": 514,
    "protocol": "UDP",
    "buffer_size": 8192,
    "framing": "RFC6587",
    "codec": "RFC5424",
    "timeout": 30,
    "tls": {
      "enabled": false,
      "cert_path": "/path/to/cert.pem",
      "key_path": "/path/to/key.pem"
    }
  },
  "parse_pipelines": ["syslog-rfc5424", "cisco-parser"],
  "storage": {
    "target": "elasticsearch",
    "index": "network-devices"
  }
}
```

### 3.3 S3 配置

```json
{
  "name": "S3-审计日志",
  "type": "pull",
  "protocol": "s3",
  "config": {
    "endpoint": "https://s3.amazonaws.com",
    "region": "us-east-1",
    "bucket": "audit-logs",
    "prefix": "logs/2024/",
    "pattern": "*.json.gz",
    "access_key_id": "AKIA...",
    "secret_access_key": "***",
    "scan_interval": 300,
    "start_time": "2024-01-01T00:00:00Z",
    "compression": "gzip",
    "format": "json"
  },
  "parse_pipelines": ["json-parser"],
  "storage": {
    "target": "timescaledb",
    "table": "audit_logs",
    "retention_days": 365
  }
}
```

### 3.4 JDBC 配置

```json
{
  "name": "JDBC-业务数据库",
  "type": "pull",
  "protocol": "jdbc",
  "config": {
    "driver": "com.mysql.cj.jdbc.Driver",
    "url": "jdbc:mysql://db:3306/app_logs",
    "username": "readonly",
    "password": "***",
    "query": "SELECT id, timestamp, message, level, source FROM logs WHERE id > ?",
    "id_column": "id",
    "timestamp_column": "timestamp",
    "poll_interval": 60,
    "batch_size": 1000,
    "connection_pool_size": 5
  },
  "parse_pipelines": ["json-parser"],
  "storage": {
    "target": "timescaledb",
    "table": "app_logs"
  }
}
```

---

## 四、解析管道设计

### 4.1 解析管道架构

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

### 4.2 内置解析器

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

### 4.3 解析器配置示例

```json
{
  "id": "cef-parser",
  "name": "CEF 安全事件解析",
  "parser": "cef",
  "priority": 1,
  "config": {
    "cef_version": 1,
    "extensions": {
      "src": "sourceAddress",
      "dst": "destinationAddress",
      "spt": "sourcePort",
      "dpt": "destinationPort",
      "act": "action",
      "msg": "message",
      "cn1": "customField1"
    }
  },
  "field_mappings": {
    "deviceVendor": "vendor",
    "deviceProduct": "product",
    "deviceVersion": "version",
    "signatureId": "alert_id",
    "name": "alert_name",
    "severity": "severity"
  }
}
```

---

## 五、数据模型

### 5.1 数据源模型 (DataSource)

```python
class DataSource(db.Model):
    __tablename__ = 'data_sources'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(20), nullable=False)  # push / pull
    protocol = db.Column(db.String(50), nullable=False)  # kafka / syslog / http / s3 / jdbc ...
    status = db.Column(db.String(20), default='active')
    
    # 连接信息
    host = db.Column(db.String(255))
    port = db.Column(db.Integer)
    config = db.Column(JSON, default={})  # 协议特定配置
    
    # 统计信息
    total_events = db.Column(db.BigInteger, default=0)
    events_per_second = db.Column(db.Float, default=0)
    health = db.Column(db.Integer, default=100)  # 0-100
    last_sync = db.Column(db.DateTime)
    error_message = db.Column(db.Text)
    
    # 关联
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'))
    pipelines = db.relationship('Pipeline', secondary='data_source_pipelines', backref='data_sources')
    
    # 元数据
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

### 5.2 解析管道模型 (Pipeline)

```python
class Pipeline(db.Model):
    __tablename__ = 'pipelines'
    
    id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    status = db.Column(db.String(20), default='active')
    
    # 解析配置
    parser_type = db.Column(db.String(50))  # json / syslog / cef / grok / auto
    parser_config = db.Column(JSON, default={})
    
    # 过滤规则
    pre_filters = db.Column(JSON, default=[])
    
    # 字段映射
    field_mappings = db.Column(JSON, default={})
    
    # 富化配置
    enrichments = db.Column(JSON, default=[])
    
    # 分类配置
    log_type_id = db.Column(db.String(50), db.ForeignKey('log_types.id'))
    severity_field = db.Column(db.String(50))  # 从哪个字段提取严重等级
    severity_mapping = db.Column(JSON, default={})
    
    # 存储配置
    storage_config = db.Column(JSON, default={})
    
    # 性能配置
    parallelism = db.Column(db.Integer, default=1)
    buffer_size = db.Column(db.Integer, default=1000)
    
    # 统计
    parsed_count = db.Column(db.BigInteger, default=0)
    failed_count = db.Column(db.BigInteger, default=0)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

### 5.3 Kafka Topic 设计

| Topic 名称 | 分区数 | 副本数 | 保留时间 | 说明 |
|-----------|--------|--------|----------|------|
| `raw-logs` | 6 | 3 | 7 天 | 原始日志 |
| `parsed-logs` | 6 | 3 | 30 天 | 解析后日志 |
| `classified-logs` | 6 | 3 | 30 天 | 分类后日志 |
| `alerts` | 3 | 3 | 90 天 | 告警事件 |
| `metrics` | 3 | 3 | 7 天 | 指标数据 |
| `dlq-logs` | 3 | 1 | 30 天 | 死信队列 |

---

## 六、Flink 集成设计

### 6.1 Flink Log Parser Job

```java
// Flink 流处理作业架构
public class LogParserJob {
    
    public static void main(String[] args) throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        
        // 启用检查点和状态后端
        env.enableCheckpointing(60000); // 1分钟检查点
        env.setStateBackend(new RocksDBStateBackend("file:///checkpoints"));
        
        // 从 Kafka 消费原始日志
        DataStream<String> rawLogs = env
            .addSource(new KafkaSource<String>()
                .setBootstrapServers("kafka:29092")
                .setTopics("raw-logs")
                .setGroupId("flink-log-parser")
                .setValueOnlyDeserializer(new SimpleStringSchema()))
            .uid("kafka-source-raw-logs");
        
        // 应用解析管道
        DataStream<ParsedLog> parsedLogs = rawLogs
            .process(new LogParserProcessFunction())
                .uid("log-parser-process")
            .filter(log -> log != null)
                .uid("log-parser-filter");
        
        // 数据富化
        DataStream<EnrichedLog> enrichedLogs = parsedLogs
            .process(new EnrichmentProcessFunction())
                .uid("enrichment-process")
            .filter(log -> log != null)
                .uid("enrichment-filter");
        
        // 输出到 Kafka
        enrichedLogs
            .addSink(new KafkaSink<EnrichedLog>()
                .setBootstrapServers("kafka:29092")
                .setRecordSerializer(new JSONKeyValueSerializationSchema("parsed-logs")))
            .uid("kafka-sink-parsed-logs");
        
        env.execute("USOP Log Parser Job");
    }
}
```

### 6.2 并行度配置

| 组件 | 并行度 | 说明 |
|------|--------|------|
| Kafka Source | 6 | 与 Topic 分区数一致 |
| Parser Process | 6 | 并行解析 |
| Enrichment Process | 4 | 富化通常更耗时 |
| Kafka Sink | 6 | 与 Topic 分区数一致 |

---

## 七、监控与运维

### 7.1 监控指标

| 指标 | 类型 | 说明 | 告警阈值 |
|------|------|------|----------|
| `ingestion.events.total` | Counter | 总事件数 | - |
| `ingestion.events.rate` | Gauge | 事件速率 (events/s) | <100 |
| `ingestion.parser.success` | Counter | 解析成功数 | - |
| `ingestion.parser.failed` | Counter | 解析失败数 | >100/min |
| `ingestion.parser.latency` | Histogram | 解析延迟 | P99 > 100ms |
| `ingestion.datasource.health` | Gauge | 数据源健康度 | <80% |
| `ingestion.kafka.lag` | Gauge | Kafka 消费延迟 | >10000 |
| `ingestion.storage.latency` | Histogram | 存储写入延迟 | P99 > 500ms |

### 7.2 健康检查

```yaml
# 数据源健康检查配置
health_checks:
  - type: connection_test
    interval: 60  # 秒
    timeout: 10
    max_retries: 3
    
  - type: throughput_test
    interval: 300
    expected_rate: 100  # events/s
    
  - type: error_rate_test
    interval: 60
    max_error_rate: 0.05  # 5%
```

### 7.3 告警规则

```yaml
# 告警规则示例
alerts:
  - name: datasource_disconnected
    condition: health < 50
    severity: high
    action: notify + auto_retry
    
  - name: parse_error_rate_high
    condition: error_count > 100 AND error_rate > 0.05
    severity: medium
    action: notify
    
  - name: kafka_lag_high
    condition: consumer_lag > 10000
    severity: high
    action: scale_up + notify
    
  - name: storage_latency_high
    condition: p99_latency > 1000
    severity: medium
    action: notify
```

---

## 八、API 接口

### 8.1 数据源管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/datasources` | 获取数据源列表 |
| GET | `/api/v1/datasources/{id}` | 获取数据源详情 |
| POST | `/api/v1/datasources` | 创建数据源 |
| PUT | `/api/v1/datasources/{id}` | 更新数据源 |
| DELETE | `/api/v1/datasources/{id}` | 删除数据源 |
| POST | `/api/v1/datasources/{id}/test` | 测试连接 |
| POST | `/api/v1/datasources/{id}/enable` | 启用数据源 |
| POST | `/api/v1/datasources/{id}/disable` | 禁用数据源 |
| GET | `/api/v1/datasources/{id}/stats` | 获取统计数据 |

### 8.2 解析管道管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/pipelines` | 获取解析管道列表 |
| GET | `/api/v1/pipelines/{id}` | 获取管道详情 |
| POST | `/api/v1/pipelines` | 创建解析管道 |
| PUT | `/api/v1/pipelines/{id}` | 更新解析管道 |
| DELETE | `/api/v1/pipelines/{id}` | 删除解析管道 |
| POST | `/api/v1/pipelines/{id}/test` | 测试解析管道 |
| GET | `/api/v1/pipelines/{id}/stats` | 获取管道统计 |

---

## 九、性能规划

### 9.1 容量规划

| 规模 | 日活事件 | 峰值 QPS | Kafka 分区 | Flink 并行度 | 存储 |
|------|----------|----------|------------|--------------|------|
| 小型 | 1000 万 | 500 | 6 | 4 | 500GB |
| 中型 | 1 亿 | 5000 | 12 | 8 | 5TB |
| 大型 | 10 亿 | 50000 | 24 | 16 | 50TB |
| 超大型 | 100 亿+ | 500000+ | 48+ | 32+ | 500TB+ |

### 9.2 性能优化建议

1. **Kafka 优化**
   - 批量发送：linger.ms = 10
   - 批次大小：batch.size = 512KB
   - 压缩：lz4

2. **Flink 优化**
   - 状态后端：RocksDB
   - 检查点间隔：1 分钟
   - 缓冲区超时：100ms

3. **存储优化**
   - TimescaleDB：启用压缩 + 全文搜索索引

---

## 十、部署架构

### 10.1 Docker Compose 部署 (开发/测试)

```yaml
# docker-compose.yml (数据接入相关服务)
services:
  # Kafka Connect 用于外部数据源
  kafka-connect:
    image: confluentinc/cp-kafka-connect:7.5.0
    environment:
      CONNECT_BOOTSTRAP_SERVERS: kafka:29092
      CONNECT_REST_PORT: 8083
    ports:
      - "8083:8083"
```

### 10.2 Kubernetes 部署 (生产)

```yaml
# Flink Log Parser Job
apiVersion: flink.apache.org/v1beta1
kind: FlinkDeployment
metadata:
  name: log-parser-job
spec:
  image: usop/flink-log-parser:1.0
  flinkVersion: v1_18
  flinkConfiguration:
    state.backend: rocksdb
    state.checkpoints.dir: s3://checkpoints/
  jobManager:
    resource:
      memory: 1024m
      cpu: 1
  taskManager:
    resource:
      memory: 2048m
      cpu: 2
    replicas: 4
```
