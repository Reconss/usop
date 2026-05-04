# 数据库架构说明

## 架构概述

本项目使用双数据库架构：
- **PostgreSQL** (端口 5432) - 存储业务数据
- **TimescaleDB** (端口 5433) - 存储告警日志时序数据

## 数据库配置

### PostgreSQL (业务数据)
| 配置项 | 值 |
|--------|-----|
| 主机 | localhost |
| 端口 | 5432 |
| 数据库 | usop |
| 用户 | postgres |
| 容器名 | usop-db |

### TimescaleDB (告警日志)
| 配置项 | 值 |
|--------|-----|
| 主机 | localhost |
| 端口 | 5433 |
| 数据库 | alerts |
| 用户 | timescale |
| 密码 | timescale_pass |
| 容器名 | timescaledb |

## TimescaleDB 表结构

### alert_logs (时序表)
用于存储告警日志数据。

| 字段 | 类型 | 说明 |
|------|------|------|
| time | TIMESTAMPTZ | 时间戳（分区键） |
| alert_id | UUID | 告警唯一ID |
| rule_id | UUID | 关联规则ID |
| severity | VARCHAR | 严重程度 |
| source | VARCHAR | 来源 |
| title | TEXT | 标题 |
| message | TEXT | 消息内容 |
| raw_data | JSONB | 原始数据 |
| metadata | JSONB | 元数据 |

### 自动优化策略

1. **压缩策略**: 7天前的数据自动压缩
2. **保留策略**: 保留90天数据
3. **持续聚合**: 
   - `alert_stats_hourly` - 每小时统计
   - `alert_stats_daily` - 每日统计

## Docker 容器管理

```bash
# 查看容器状态
docker ps

# 查看 TimescaleDB 日志
docker logs timescaledb

# 连接 TimescaleDB
psql -h localhost -p 5433 -U timescale -d alerts

# 停止/启动 TimescaleDB
docker stop timescaledb
docker start timescaledb
```

## 数据查询示例

```sql
-- 查询最近24小时的告警
SELECT * FROM alert_logs 
WHERE time > NOW() - INTERVAL '24 hours'
ORDER BY time DESC;

-- 按严重程度统计
SELECT severity, COUNT(*) 
FROM alert_logs 
WHERE time > NOW() - INTERVAL '24 hours'
GROUP BY severity;

-- 查询每小时的告警趋势
SELECT time_bucket('1 hour', time) AS hour, COUNT(*)
FROM alert_logs
WHERE time > NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1;

-- 使用持续聚合视图（更快）
SELECT * FROM alert_stats_hourly
WHERE hour > NOW() - INTERVAL '7 days';
```

## 注意事项

1. TimescaleDB 本质上是 PostgreSQL + TimescaleDB 扩展
2. 告警数据会自动压缩和清理，无需手动管理
3. 建议定期监控磁盘使用情况
