# Universal Flink Processing Framework

## 概述

通用 Flink 处置框架旨在支持平台通过配置文件动态地为特定日志源执行解析、分析、过滤、存储逻辑，无需为每个新任务重复编写代码。

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                    Universal Flink Framework                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐ │
│  │   Kafka      │───▶│  Source      │───▶│  Parser          │ │
│  │   Source     │    │  Connector   │    │  (JSON/Syslog/..)│ │
│  └──────────────┘    └──────────────┘    └──────────────────┘ │
│                                                     │           │
│                                                     ▼           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐ │
│  │  TimescaleDB │◀───│  Sink        │◀───│  Filter &        │ │
│  │  /Kafka      │    │  Connector   │    │  Transform       │ │
│  └──────────────┘    └──────────────┘    └──────────────────┘ │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                     Configuration Layer                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐ │
│  │  Pipeline    │    │  Rule        │    │  Field           │ │
│  │  Config      │    │  Loader      │    │  Mapping         │ │
│  └──────────────┘    └──────────────┘    └──────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. UniversalFlinkJob (核心作业)
- 主入口，读取配置并构建 Flink 数据流
- 支持从数据库或 API 动态加载配置

### 2. RuleLoader (规则加载器)
- 从 PostgreSQL 数据库加载 Pipeline 配置
- 缓存配置并支持热更新

### 3. DynamicParser (动态解析器)
- 支持多种日志格式：JSON, Syslog, CEF, Key-Value, Grok, 自定义正则
- 可扩展的解析器注册机制

### 4. FilterProcessor (过滤处理器)
- 支持多种过滤条件：IP 黑白名单、正则匹配、数值范围、时间窗口
- 链式过滤逻辑

### 5. TransformProcessor (转换处理器)
- 字段映射、重命名、类型转换
- 数据 enrichment

### 6. SinkConnectors (输出连接器)
- TimescaleDB (时序数据)
- PostgreSQL (业务数据)
- Kafka (下游处理)
- Elasticsearch (搜索分析)

## 使用方式

### 方式一：通过命令行参数提交

```bash
python universal_flink_job.py \
    --pipeline-id 1 \
    --flink-rest-url http://flink:8081 \
    --job-name "nginx-access-log-parser"
```

### 方式二：通过平台 API 提交

```bash
curl -X POST http://api-server:5000/api/flink/jobs \
    -H "Content-Type: application/json" \
    -d '{
        "pipeline_id": 1,
        "job_name": "nginx-log-parser",
        " parallelism": 4
    }'
```

## 部署模式

推荐使用 **Application 模式**：
- 每个 Pipeline 独立作业
- 作业之间完全隔离
- 便于资源配额和故障隔离

## 配置示例

```json
{
    "pipeline_id": 1,
    "name": "Nginx Access Log Parser",
    "source": {
        "type": "kafka",
        "topic": "nginx-access-logs",
        "bootstrap_servers": "kafka:29092",
        "group_id": "flink-nginx-parser"
    },
    "parser": {
        "format": "grok",
        "pattern": "%{NGINX_ACCESS_LOG}"
    },
    "filter_rules": [
        {
            "type": "ip_whitelist",
            "ips": ["10.0.0.0/8", "192.168.0.0/16"]
        }
    ],
    "field_mapping": {
        "src_ip": "$remote_addr",
        "status": "$status",
        "bytes": "$body_bytes_sent"
    },
    "output": {
        "target": "timescaledb",
        "table": "nginx_access_logs"
    }
}
```

## 运维管理

### 作业监控
- Flink Web UI: http://flink:8081
- Metrics: Prometheus + Grafana

### 日志收集
- 作业日志收集到 Elasticsearch
- 通过 Kibana 查看

### 版本升级
- 配置版本化管理
- 支持滚动升级
