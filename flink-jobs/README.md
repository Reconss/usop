# Flink WAF 日志处理作业

## 当前状态
- Python WAF Consumer 正在运行（`server-python/app/utils/waf_consumer.py`）
- 处理流程: Kafka → Python Consumer → TimescaleDB

## Flink 部署方案

### 方案 1: Flink SQL（推荐用于规则分析）

1. 启动 SQL Gateway:
```bash
docker exec -d flink-jobmanager /opt/flink/bin/sql-gateway.sh
```

2. 执行 SQL 作业（文件: `waf-pipeline.sql`）

### 方案 2: Java/Python API（推荐用于复杂处理）

使用 Flink DataStream API 编写自定义处理逻辑。

## 文件说明

- `waf-pipeline.sql` - Flink SQL 定义
- `log_parser_job.py` - 日志解析 Flink 作业
- `alert_engine_job.py` - 告警引擎 Flink 作业（含规则分析）
- `deploy-waf-flink.sh` - 部署脚本

## 后续迁移步骤

1. 停止 Python WAF Consumer
2. 部署 Flink 作业
3. 验证数据处理
4. 监控性能

## 规则引擎

`alert_engine_job.py` 支持:
- 单事件规则匹配
- 关联规则匹配
- 时序规则 (CEP)
- 滑动窗口聚合
