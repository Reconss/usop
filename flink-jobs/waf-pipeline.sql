-- WAF 日志处理 Flink SQL 作业
-- 功能: 从 Kafka 读取 WAF 日志，解析并写入 TimescaleDB

-- 1. 创建 Kafka 表，读取 waf-alert topic
CREATE TEMPORARY TABLE waf_source (
    timestamp STRING,
    alert_id STRING,
    src_ip STRING,
    dst_ip STRING,
    src_port INT,
    dst_port INT,
    protocol STRING,
    method STRING,
    host STRING,
    uri STRING,
    attack_type STRING,
    risk_level STRING,
    status_code INT,
    rule_id STRING,
    message STRING,
    action STRING,
    event_time TIMESTAMP(3),
    WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'waf-alert',
    'properties.bootstrap.servers' = 'kafka:29092',
    'properties.group.id' = 'flink-waf-consumer',
    'format' = 'json',
    'scan.startup.mode' = 'earliest-offset'
);

-- 2. 创建输出到 Kafka 的告警 topic
CREATE TEMPORARY TABLE alert_sink (
    alert_code STRING,
    title STRING,
    description STRING,
    severity STRING,
    status STRING,
    source STRING,
    src_ip STRING,
    src_port INT,
    dst_ip STRING,
    dst_port INT,
    protocol STRING,
    hostname STRING,
    raw_log STRING,
    first_seen TIMESTAMP,
    last_seen TIMESTAMP,
    tags ARRAY<STRING>
) WITH (
    'connector' = 'kafka',
    'topic' = 'processed-alerts',
    'properties.bootstrap.servers' = 'kafka:29092',
    'format' = 'json'
);

-- 3. 处理并写入
INSERT INTO alert_sink
SELECT 
    alert_id AS alert_code,
    CONCAT('[WAF] ', attack_type, ' - ', src_ip) AS title,
    message AS description,
    CASE 
        WHEN risk_level = '严重' THEN 'critical'
        WHEN risk_level IN ('高危', '高') THEN 'high'
        WHEN risk_level = '中' THEN 'medium'
        ELSE 'low'
    END AS severity,
    'new' AS status,
    'waf' AS source,
    src_ip,
    src_port,
    dst_ip,
    dst_port,
    protocol,
    host AS hostname,
    CAST(TO_JSON(ROW(timestamp, alert_id, src_ip, dst_ip, protocol, method, host, uri, attack_type, risk_level, status_code, rule_id, message, action)) AS STRING) AS raw_log,
    event_time AS first_seen,
    event_time AS last_seen,
    ARRAY[attack_type, 'waf-alert'] AS tags
FROM waf_source;
