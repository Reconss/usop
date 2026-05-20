# WAF 日志接入配置指南

## 概述
从本地 Kafka 接入 WAF 告警日志，通过 Flink 解析后存储到 TimescaleDB 的 `alert_logs` 表。

## 前提条件
- ✅ Kafka 已运行，topic `waf-alert` 存在
- ✅ Flink 集群已启动 (http://localhost:8081)
- ✅ TimescaleDB 已启动，表 `alert_logs` 已存在

## 页面配置步骤

### 步骤 1: 创建数据源
访问页面: **数据源管理** → **新建数据源**

| 字段 | 值 | 说明 |
|------|-----|------|
| 名称 | `WAF 日志数据源` | 自定义名称 |
| 协议 | `kafka` | 选择 Kafka |
| Host | `kafka` | 容器内使用 kafka，或本地用 localhost |
| Port | `29092` | Kafka 内部端口 |
| 状态 | `active` | 启用 |
| 额外配置 | `{"topic": "waf-alert", "group_id": "flink-waf-parser"}` | JSON 格式 |

### 步骤 2: 创建解析管道
访问页面: **解析管道** → **新建管道**

| 字段 | 值 | 说明 |
|------|-----|------|
| 名称 | `WAF 日志解析` | 任意名称 |
| 日志类型 | `fw_logs` | 防火墙日志 |
| 输入格式 | `json` | WAF 日志是 JSON |
| 字段映射 | 见下方 | |
| 过滤规则 | `[]` | 可选 |
| 输出目标 | `alerts` | 对应 alert_logs 表 |
| 状态 | `active` | 启用 |

**字段映射配置:**
```json
{
  "alert_id": "id",
  "rule_name": "rule_name",
  "severity": "threat_level",
  "src_ip": "src_ip",
  "src_port": "src_port",
  "dst_ip": "dst_ip",
  "dst_port": "dst_port",
  "protocol": "protocol",
  "action": "action",
  "message": "message",
  "timestamp": "timestamp"
}
```

### 步骤 3: 启动 Flink 作业
1. 在数据源列表中找到创建的 WAF 数据源
2. 点击 **启动 Flink** 按钮
3. 等待作业状态变为 RUNNING

### 步骤 4: 验证数据接入
```bash
# 查看 Flink 作业
# 访问 http://localhost:8081

# 检查 TimescaleDB 数据
docker exec -it timescale psql -U postgres -d postgres -c "SELECT * FROM alert_logs ORDER BY time DESC LIMIT 10;"
```

## WAF 日志格式
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

## 手动提交 Flink 作业 (备选)
如果页面启动失败，可手动提交:
```bash
# 复制 SQL 文件到 Flink jobs 目录
cp flink-jobs/waf_pipeline/waf_alert_job.sql flink-jobs/

# 或直接通过 API 提交
curl -X POST http://localhost:8081/jars/upload -F "file=@flink-jobs/waf_pipeline/waf_alert_job.sql"
```

## 故障排查
1. **作业启动失败**: 检查 Kafka topic 是否存在
2. **无数据写入**: 检查 Flink 作业日志，查看是否有解析错误
3. **查看作业状态**: http://localhost:8081
