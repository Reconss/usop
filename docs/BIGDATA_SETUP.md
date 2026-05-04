# 日志分析平台 - 大数据组件指南

## 概述

本项目集成了 Kafka + Flink 大数据组件，用于高性能日志采集和实时分析。核心处理引擎采用 Flink，提供比 Python 多线程方案更高的吞吐量（100K+ msg/s）和更低的延迟（<10ms）。

## 为什么选择 Flink 而非 Python 多线程？

| 对比项 | Python 多线程 | Flink |
|--------|--------------|-------|
| **吞吐量** | ~10K msg/s | 100K+ msg/s |
| **延迟** | 100-500ms | <10ms |
| **状态管理** | 需自行实现 | 内置 RocksDB |
| **容错** | 手动处理 | Checkpoint + Exactly-Once |
| **规则复杂度** | 简单匹配 | 支持 CEP/时序/关联 |
| **扩展性** | 有限 | 水平扩展 |

## 组件架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        数据采集层                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Webhook  │ │ Kafka    │ │ Filebeat │ │ Syslog   │         │
│  │ (Flask)  │ │ Producer │ │          │ │ (TCP/UDP)│         │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘         │
└───────┼────────────┼────────────┼────────────┼────────────────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
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
│ ───────────── │      │ ───────────── │      │ ───────────── │
│ • JSON/Syslog │      │ • Single      │      │ • Window Agg  │
│   Parsing     │      │ • Correlation │      │ • Statistics  │
│ • Field       │      │ • Sequence    │      │ • Trends      │
│   Extract     │      │   (CEP)       │      │               │
│ • Enrichment  │      │ • Threshold   │      │               │
└───────┬───────┘      └───────┬───────┘      └───────┬───────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         TimescaleDB                              │
│              (时序存储 + 告警事件 + 全文搜索)                     │
│                                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                        │
│  │ 原始日志 │  │解析日志 │  │  告警   │                        │
│  └─────────┘  └─────────┘  └─────────┘                        │
│                                                                 │
│  • 时序分区 (按时间自动分片)                                     │
│  • 压缩策略 (热数据 → 冷数据 10:1)                              │
│  • 全文搜索 (tsvector 列式存储)                                 │
│  • 连续聚合 (实时统计)                                           │
└─────────────────────────────────────────────────────────────────┘
```

## 告警引擎支持的规则类型

Flink CEP (Complex Event Processing) 支持以下高级规则：

1. **单事件规则 (Single Event)** - 条件匹配，立即触发
2. **关联规则 (Correlation)** - 多事件关联分析
3. **时序规则 (Sequence/CEP)** - 事件序列模式匹配，如 `[A 事件] → (5分钟内) → [B 事件]`
4. **阈值规则 (Threshold)** - 滑动窗口聚合后触发

## 快速开始

### 1. 启动所有服务

```bash
# 启动大数据组件
./start-bigdata.sh up

# 或使用 docker-compose 直接启动
docker-compose up -d
```

### 2. 检查服务状态

```bash
./start-bigdata.sh status
```

### 3. 初始化 Kafka Topics

```bash
./start-bigdata.sh init-topics
```

### 4. 访问管理界面

| 服务 | 地址 | 说明 |
|-----|------|-----|
| Kafka UI | http://localhost:8080 | Kafka 主题管理 |
| Flink UI | http://localhost:8081 | Flink 任务管理 |
| TimescaleDB | localhost:5432 | 时序数据库 |
| Redis | localhost:6379 | 缓存服务 |

## 服务组件

### Kafka
- **版本**: Confluent Kafka 7.5.0
- **端口**: 9092 (外部), 29092 (内部)
- **用途**: 高吞吐量消息队列

### Zookeeper
- **端口**: 2181
- **用途**: Kafka 集群协调

### Flink
- **版本**: 1.18.1
- **JobManager**: http://localhost:8081
- **TaskManager**: 2 个实例
- **用途**: 实时流处理

### Redis
- **端口**: 6379
- **用途**: 结果缓存、会话存储

## Kafka Topics

| Topic | 分区数 | 用途 |
|-------|-------|-----|
| raw-logs | 6 | 原始日志摄入 |
| parsed-logs | 6 | 解析后日志 |
| alerts | 3 | 告警信息 |
| metrics | 3 | 指标数据 |
| dlq-logs | 3 | 死信队列 |

## Python 后端集成

### 安装依赖

```bash
pip install kafka-python
```

### 使用 Kafka 客户端

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

### Flask API 示例

```python
from flask import Flask, request
from app.utils.kafka_client import LogIngestionService

app = Flask(__name__)
ingestion_service = LogIngestionService()

@app.route('/api/ingest', methods=['POST'])
def ingest_logs():
    logs = request.json.get('logs', [])
    count = ingestion_service.ingest_logs(logs, source='api')
    return {'success': True, 'count': count}
```

## Flink 任务部署

### 打包 Flink Job

```bash
cd flink-jobs
pip install apache-flink kafka-python
```

### 提交到 Flink

```bash
# 通过 Flink UI 提交
# 1. 打开 http://localhost:8081
# 2. 导航到 Submit New Job
# 3. 上传 Python 文件或通过 CLI 提交

# 或使用命令行
flink run -d flink-jobs/log_parser_job.py
```

## 性能调优

### Kafka 调优

```yaml
# docker-compose.yml 中的 Kafka 配置
KAFKA_NUM_PARTITIONS: 6        # 根据消费者数量调整
KAFKA_BATCH_SIZE_BYTES: 524288 # 批次大小 (512KB)
KAFKA_LINGER_MS: 10            # 批次等待时间
KAFKA_COMPRESSION_TYPE: lz4    # 压缩类型
```

### Flink 调优

```properties
# Flink 配置
taskmanager.numberOfTaskSlots: 4
parallelism.default: 2
state.backend: rocksdb
state.backend.rocksdb.writebuffer.size: 128mb
```

## 监控

### Kafka 监控

1. 打开 http://localhost:8080 (Kafka UI)
2. 查看 Topic、Consumer Group、消息量

### Flink 监控

1. 打开 http://localhost:8081
2. 查看 Jobs、Task Managers、Checkpoints

## 常见问题

### Q: Kafka 连接失败
```bash
# 检查 Kafka 是否正常运行
docker logs kafka

# 检查端口
netstat -an | grep 9092
```

### Q: Flink Job 无法启动
```bash
# 检查 JobManager 日志
docker logs flink-jobmanager

# 检查内存配置
```

### Q: 消息消费延迟
```bash
# 增加消费者并行度
# 增加 TaskManager 实例数量
docker-compose up -d --scale taskmanager=3
```

## 清理

```bash
# 停止服务
./start-bigdata.sh down

# 清理所有数据
./start-bigdata.sh clean
```

## 下一步

1. ✅ 集成 Kafka 日志摄入
2. ✅ 部署 Flink 日志解析任务
3. ⬜ 配置 TimescaleDB 全文搜索
4. ⬜ 开发 Flink 告警引擎 (CEP 支持)
5. ⬜ 配置日志可视化仪表板
