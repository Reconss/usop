# WAF 日志接入配置指南

## 概述

本文档说明如何在 USOP 平台中配置从本地 Kafka 接入 WAF 日志，通过 Flink 解析后存储到 TimescaleDB 的安全告警表中。

## 系统预置表

系统已预置两个存储表：

| 表名 | 说明 | 类型 |
|------|------|------|
| `alert_logs` | 安全告警表 | TimescaleDB |
| `security_events` | 安全事件表 | PostgreSQL |

## 配置步骤

### 步骤 1: 创建 Kafka Topic

```bash
# 进入 Kafka 容器创建 topic
docker exec -it kafka kafka-topics.sh \
  --create \
  --topic waf-alert \
  --bootstrap-server localhost:9092 \
  --partitions 3 \
  --replication-factor 1
```

### 步骤 2: 在页面配置数据源

访问页面: **数据源管理** → **新建数据源**

配置如下：

| 字段 | 值 |
|------|-----|
| 名称 | `WAF 日志数据源` |
| 协议 | `kafka` |
| 源类型 | `push` (流式) |
| Host | `localhost` (本地) 或 `kafka` (容器内) |
| Port | `9092` |
| Topic | `waf-alert` |
| 消费者组 | `flink-waf-parser` |
| 状态 | `active` |

### 步骤 3: 在页面配置解析管道

访问页面: **解析管道** → **新建管道**

配置如下：

| 字段 | 值 |
|------|-----|
| 名称 | `WAF 日志解析管道` |
| 日志类型 | `fw_logs` (防火墙日志) |
| 输入格式 | `json` |
| 字段映射 | 见下方 |
| 过滤规则 | 可选 |
| 输出目标 | `alerts` (告警表) |
| 状态 | `active` |

**字段映射配置：**

```json
{
  "alert_id": "id",
  "title": "rule_name",
  "severity": "threat_level",
  "src_ip": "src_ip",
  "dst_ip": "dst_ip",
  "src_port": "src_port",
  "dst_port": "dst_port",
  "protocol": "protocol",
  "action": "action",
  "message": "message",
  "timestamp": "timestamp"
}
```

### 步骤 4: 提交 Flink 作业

访问页面: **数据源管理** → 选择 WAF 数据源 → **启动 Flink**

或者通过 API:

```bash
curl -X POST http://localhost:5000/api/data_sources/datasources/1/start-flink \
  -H "Content-Type: application/json"
```

### 步骤 5: 验证数据接入

1. 发送测试日志到 Kafka:

```bash
# 生产者发送测试数据
docker exec -it kafka kafka-console-producer.sh \
  --topic waf-alert \
  --bootstrap-server localhost:9092

# 输入测试 JSON
{"id": 1001, "rule_name": "SQL注入攻击", "threat_level": 3, "src_ip": "192.168.1.100", "dst_ip": "10.0.0.5", "protocol": "HTTP", "action": "BLOCK", "message": "检测到SQL注入攻击"}
```

2. 检查 Flink 作业日志

3. 查询 TimescaleDB 数据:

```sql
SELECT * FROM alert_logs ORDER BY time DESC LIMIT 10;
```

## WAF 日志格式示例

```json
{
  "id": 1001,
  "rule_name": "SQL注入攻击",
  "threat_level": 3,
  "severity": "high",
  "src_ip": "192.168.1.100",
  "src_port": 54321,
  "dst_ip": "10.0.0.5",
  "dst_port": 443,
  "protocol": "HTTP",
  "action": "BLOCK",
  "url": "/admin/login.php",
  "message": "检测到SQL注入攻击",
  "timestamp": "2024-01-01T10:00:00Z"
}
```

## 故障排查

1. **Flink 作业启动失败**
   - 检查 Kafka 是否正常运行
   - 检查 Flink 集群状态 http://localhost:8081
   
2. **数据未写入**
   - 检查 Pipeline 配置是否正确
   - 检查字段映射是否匹配日志格式
   
3. **查看作业日志**
   - Flink UI: http://localhost:8081 → Jobs → Task Manager → Log
