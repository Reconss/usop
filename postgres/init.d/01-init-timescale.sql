-- ========================================
-- TimescaleDB 告警日志数据库初始化
-- ========================================

-- 启用 TimescaleDB 扩展
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ========================================
-- 时序表（告警日志）
-- ========================================

CREATE TABLE alert_logs (
    time        TIMESTAMPTZ   NOT NULL,
    alert_id    UUID          NOT NULL,
    rule_id     UUID,
    severity    VARCHAR(20)   NOT NULL,
    source      VARCHAR(100) NOT NULL,
    title       TEXT          NOT NULL,
    message     TEXT,
    raw_data    JSONB,
    metadata    JSONB
);

-- 转换为时序表
SELECT create_hypertable('alert_logs', 'time');

-- 创建索引
CREATE INDEX idx_alert_logs_rule_id ON alert_logs(rule_id);
CREATE INDEX idx_alert_logs_severity ON alert_logs(severity);
CREATE INDEX idx_alert_logs_source ON alert_logs(source);
CREATE INDEX idx_alert_logs_time ON alert_logs(time DESC);

-- ========================================
-- 持续聚合视图（每小时统计）
-- ========================================

CREATE MATERIALIZED VIEW alert_stats_hourly
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 hour', time) AS hour,
    rule_id,
    severity,
    COUNT(*) AS count
FROM alert_logs
GROUP BY 1, 2, 3;

-- 每日统计
CREATE MATERIALIZED VIEW alert_stats_daily
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 day', time) AS day,
    rule_id,
    severity,
    COUNT(*) AS count
FROM alert_logs
GROUP BY 1, 2, 3;

-- ========================================
-- 自动优化策略
-- ========================================

-- 压缩策略（7天前的数据自动压缩）
ALTER TABLE alert_logs SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'rule_id'
);

SELECT add_compression_policy('alert_logs', INTERVAL '7 days');

-- 数据保留策略（保留90天）
SELECT add_retention_policy('alert_logs', INTERVAL '90 days');

-- 持续聚合策略（每小时更新）
SELECT add_continuous_aggregate_policy('alert_stats_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

-- 每日聚合策略
SELECT add_continuous_aggregate_policy('alert_stats_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day');

-- ========================================
-- 授予权限
-- ========================================

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO timescale;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO timescale;
