-- ========================================
-- WAF 日志解析 Flink SQL 作业
-- Topic: waf-alert
-- 输出表: alert_logs (TimescaleDB)
-- ========================================

-- 1. 创建 Kafka Source 表 (消费 WAF 告警日志)
CREATE SOURCE TABLE waf_source (
    id          STRING,
    rule_name   STRING,
    threat_level INT,
    severity    STRING,
    src_ip      STRING,
    src_port    INT,
    dst_ip      STRING,
    dst_port    INT,
    protocol    STRING,
    action      STRING,
    url         STRING,
    message     STRING,
    timestamp   STRING
) WITH (
    'connector' = 'kafka',
    'topic' = 'waf-alert',
    'properties.bootstrap.servers' = 'kafka:29092',
    'properties.group.id' = 'flink-waf-parser',
    'scan.startup.mode' = 'earliest-offset',
    'format' = 'json',
    'json.fail-on-missing-field' = 'false',
    'json.ignore-parse-errors' = 'true'
);

-- 2. 创建 TimescaleDB Sink 表 (输出到安全告警表)
CREATE SINK TABLE alert_logs_sink (
    id          BIGINT,
    rule_id     INT,
    rule_name   STRING,
    severity    INT,
    alert_type  STRING,
    message     STRING,
    src_ip      STRING,
    dst_ip      STRING,
    username    STRING,
    source_id   INT,
    log_ids     ARRAY<BIGINT>,
    metadata    STRING,
    timestamp   TIMESTAMP(3)
) WITH (
    'connector' = 'jdbc',
    'url' = 'jdbc:postgresql://timescale:5432/postgres',
    'table-name' = 'alert_logs',
    'username' = 'postgres',
    'password' = 'postgres',
    'driver' = 'org.postgresql.Driver',
    'sink.buffer-flush.interval' = '1000',
    'sink.buffer-flush.max-rows' = '100'
);

-- 3. 数据处理逻辑
INSERT INTO alert_logs_sink
SELECT
    CAST(id AS BIGINT) AS id,
    0 AS rule_id,
    rule_name AS rule_name,
    CASE 
        WHEN threat_level = 1 THEN 1
        WHEN threat_level = 2 THEN 2
        WHEN threat_level = 3 THEN 3
        WHEN threat_level = 4 THEN 4
        WHEN threat_level = 5 THEN 5
        WHEN severity = 'low' THEN 1
        WHEN severity = 'medium' THEN 2
        WHEN severity = 'high' THEN 4
        WHEN severity = 'critical' THEN 5
        ELSE 3
    END AS severity,
    'WAF' AS alert_type,
    message AS message,
    src_ip AS src_ip,
    dst_ip AS dst_ip,
    NULL AS username,
    1 AS source_id,
    ARRAY[] AS log_ids,
    CONCAT('{"protocol":"', COALESCE(protocol, ''), '","action":"', COALESCE(action, ''), '","url":"', COALESCE(url, ''), '"}') AS metadata,
    TO_TIMESTAMP(COALESCE(timestamp, CURRENT_TIMESTAMP), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS timestamp
FROM waf_source
WHERE id IS NOT NULL;
