-- ========================================
-- TimescaleDB 告警日志存储过程函数
-- ========================================

-- 告警日志已经通过 01-init-timescale.sql 创建了表结构
-- 这里添加一些有用的视图和函数

-- 1. 创建告警统计视图
CREATE OR REPLACE VIEW alert_stats_view AS
SELECT 
    time_bucket('1 hour', time) AS hour,
    severity,
    COUNT(*) AS count,
    COUNT(DISTINCT source) AS unique_sources,
    COUNT(DISTINCT rule_id) AS unique_rules
FROM alert_logs
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- 2. 创建每日统计视图
CREATE OR REPLACE VIEW alert_daily_stats AS
SELECT 
    time_bucket('1 day', time) AS day,
    severity,
    COUNT(*) AS total_count,
    COUNT(DISTINCT alert_id) AS unique_alerts
FROM alert_logs
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- 3. 创建活跃规则统计视图
CREATE OR REPLACE VIEW active_rules_stats AS
SELECT 
    rule_id,
    COUNT(*) AS alert_count,
    COUNT(DISTINCT severity) AS severity_types,
    COUNT(DISTINCT source) AS source_count,
    MIN(time) AS first_seen,
    MAX(time) AS last_seen
FROM alert_logs
WHERE rule_id IS NOT NULL
GROUP BY rule_id
ORDER BY alert_count DESC;

-- 4. 创建数据源统计视图
CREATE OR REPLACE VIEW source_stats AS
SELECT 
    source,
    severity,
    COUNT(*) AS count,
    MIN(time) AS first_seen,
    MAX(time) AS last_seen
FROM alert_logs
GROUP BY source, severity
ORDER BY count DESC;

-- 授予权限
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO timescale;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO timescale;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT ALL PRIVILEGES ON ALL VIEWS IN SCHEMA public TO timescale;
GRANT ALL PRIVILEGES ON ALL VIEWS IN SCHEMA public TO PUBLIC;
