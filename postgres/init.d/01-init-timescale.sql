-- ========================================
-- TimescaleDB 统一时序数据库初始化
-- 存储: 原始日志 + 解析日志 + 告警 + 指标
-- ========================================

-- 启用 TimescaleDB 扩展
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ========================================
-- 1. 原始日志表
-- ========================================

CREATE TABLE raw_logs (
    id BIGSERIAL,
    source_id    INTEGER,
    source_name  VARCHAR(100),
    timestamp    TIMESTAMPTZ NOT NULL,
    raw_message  TEXT NOT NULL,
    protocol     VARCHAR(50),
    metadata     JSONB,
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('raw_logs', 'timestamp');

CREATE INDEX idx_raw_logs_source_id ON raw_logs(source_id);
CREATE INDEX idx_raw_logs_timestamp ON raw_logs(timestamp DESC);

-- 压缩策略
ALTER TABLE raw_logs SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'source_id'
);
SELECT add_compression_policy('raw_logs', INTERVAL '7 days');
SELECT add_retention_policy('raw_logs', INTERVAL '30 days');

-- ========================================
-- 2. 解析后日志表
-- ========================================

CREATE TABLE parsed_logs (
    id BIGSERIAL,
    source_id    INTEGER,
    log_type     VARCHAR(50),
    timestamp    TIMESTAMPTZ NOT NULL,
    
    -- 网络字段
    src_ip       VARCHAR(50),
    dst_ip       VARCHAR(50),
    src_port     INTEGER,
    dst_port     INTEGER,
    protocol     VARCHAR(20),
    hostname     VARCHAR(200),
    username     VARCHAR(100),
    
    -- 事件字段
    action       VARCHAR(50),
    result       VARCHAR(50),
    
    -- 原始数据
    raw_message  TEXT,
    details      JSONB,
    
    -- 全文搜索
    search_vector TSVECTOR,
    
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('parsed_logs', 'timestamp');

CREATE INDEX idx_parsed_logs_src_ip ON parsed_logs(src_ip);
CREATE INDEX idx_parsed_logs_dst_ip ON parsed_logs(dst_ip);
CREATE INDEX idx_parsed_logs_username ON parsed_logs(username);
CREATE INDEX idx_parsed_logs_log_type ON parsed_logs(log_type);
CREATE INDEX idx_parsed_logs_timestamp ON parsed_logs(timestamp DESC);

-- 全文搜索索引
CREATE INDEX idx_parsed_logs_search ON parsed_logs USING GIN(search_vector);

-- 自动更新 search_vector
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('simple', COALESCE(NEW.raw_message, '') || ' ' || 
        COALESCE(NEW.src_ip, '') || ' ' || COALESCE(NEW.username, '') || ' ' ||
        COALESCE(NEW.action, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tsvector_update BEFORE INSERT OR UPDATE ON parsed_logs
FOR EACH ROW EXECUTE FUNCTION update_search_vector();

-- 压缩策略
ALTER TABLE parsed_logs SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'log_type'
);
SELECT add_compression_policy('parsed_logs', INTERVAL '7 days');
SELECT add_retention_policy('parsed_logs', INTERVAL '90 days');

-- ========================================
-- 3. 告警事件表
-- ========================================

CREATE TABLE alert_events (
    id BIGSERIAL,
    rule_id      INTEGER,
    rule_name    VARCHAR(200),
    severity     INTEGER,  -- 1-5
    alert_type   VARCHAR(100),
    
    -- 事件信息
    message      TEXT,
    src_ip       VARCHAR(50),
    dst_ip       VARCHAR(50),
    username     VARCHAR(100),
    
    -- 关联信息
    source_id    INTEGER,
    log_ids      BIGINT[],
    
    -- 元数据
    metadata     JSONB,
    
    timestamp    TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('alert_events', 'timestamp');

CREATE INDEX idx_alert_events_rule_id ON alert_events(rule_id);
CREATE INDEX idx_alert_events_severity ON alert_events(severity);
CREATE INDEX idx_alert_events_src_ip ON alert_events(src_ip);
CREATE INDEX idx_alert_events_timestamp ON alert_events(timestamp DESC);

-- 压缩策略
ALTER TABLE alert_events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'rule_id'
);
SELECT add_compression_policy('alert_events', INTERVAL '7 days');
SELECT add_retention_policy('alert_events', INTERVAL '180 days');

-- ========================================
-- 4. 指标数据表
-- ========================================

CREATE TABLE metrics (
    id BIGSERIAL,
    metric_name VARCHAR(100),
    value      DOUBLE PRECISION,
    unit       VARCHAR(20),
    tags       JSONB,
    timestamp  TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, timestamp)
);

SELECT create_hypertable('metrics', 'timestamp');

CREATE INDEX idx_metrics_name ON metrics(metric_name);
CREATE INDEX idx_metrics_timestamp ON metrics(timestamp DESC);

-- 保留策略（30天）
SELECT add_retention_policy('metrics', INTERVAL '30 days');

-- ========================================
-- 5. 持续聚合视图
-- ========================================

-- 告警统计 (5分钟)
CREATE MATERIALIZED VIEW alert_stats_5m
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('5 minutes', timestamp) AS bucket,
    rule_id,
    severity,
    COUNT(*) AS alert_count
FROM alert_events
GROUP BY bucket, rule_id, severity;

-- 告警统计 (1小时)
CREATE MATERIALIZED VIEW alert_stats_1h
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 hour', timestamp) AS bucket,
    severity,
    COUNT(*) AS alert_count
FROM alert_events
GROUP BY bucket, severity;

-- 日志摄入统计 (5分钟)
CREATE MATERIALIZED VIEW log_stats_5m
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('5 minutes', timestamp) AS bucket,
    source_id,
    COUNT(*) AS log_count
FROM raw_logs
GROUP BY bucket, source_id;

-- 解析统计 (5分钟)
CREATE MATERIALIZED VIEW parse_stats_5m
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('5 minutes', timestamp) AS bucket,
    log_type,
    COUNT(*) AS parse_count
FROM parsed_logs
GROUP BY bucket, log_type;

-- ========================================
-- 6. 持续聚合策略
-- ========================================

SELECT add_continuous_aggregate_policy('alert_stats_5m',
    start_offset => INTERVAL '20 minutes',
    end_offset => INTERVAL '5 minutes',
    schedule_interval => INTERVAL '5 minutes');

SELECT add_continuous_aggregate_policy('alert_stats_1h',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

SELECT add_continuous_aggregate_policy('log_stats_5m',
    start_offset => INTERVAL '20 minutes',
    end_offset => INTERVAL '5 minutes',
    schedule_interval => INTERVAL '5 minutes');

SELECT add_continuous_aggregate_policy('parse_stats_5m',
    start_offset => INTERVAL '20 minutes',
    end_offset => INTERVAL '5 minutes',
    schedule_interval => INTERVAL '5 minutes');

-- ========================================
-- 7. 全文搜索函数
-- ========================================

-- 搜索日志
CREATE OR REPLACE FUNCTION search_logs(query TEXT, limit_count INTEGER DEFAULT 100)
RETURNS TABLE (
    id BIGINT,
    timestamp TIMESTAMPTZ,
    src_ip VARCHAR(50),
    username VARCHAR(100),
    action VARCHAR(50),
    raw_message TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pl.id,
        pl.timestamp,
        pl.src_ip,
        pl.username,
        pl.action,
        pl.raw_message
    FROM parsed_logs pl
    WHERE pl.search_vector @@ plainto_tsquery('simple', query)
    ORDER BY pl.timestamp DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 8. 授予权限
-- ========================================

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
