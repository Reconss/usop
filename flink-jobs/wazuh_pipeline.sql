CREATE TEMPORARY TABLE wazuh_source (
    rule_level INT, rule_description STRING, rule_id STRING,
    agent_name STRING, full_log STRING, data_srcip STRING, data_srcport STRING, ts STRING
) WITH (
    'connector' = 'kafka', 'topic' = 'wazuh-alert',
    'properties.bootstrap.servers' = 'kafka:29092',
    'properties.group.id' = 'flink-wazuh-v11',
    'format' = 'json', 'scan.startup.mode' = 'latest-offset',
    'json.ignore-parse-errors' = 'true', 'json.fail-on-missing-field' = 'false'
);

CREATE TEMPORARY TABLE alerts_sink (
    alert_code STRING, title STRING, description STRING, severity STRING, status STRING,
    source STRING, source_product STRING, source_type STRING, category STRING, confidence DOUBLE,
    src_ip STRING, src_port INT, dst_ip STRING, dst_port INT, protocol STRING, hostname STRING,
    first_seen TIMESTAMP(3), last_seen TIMESTAMP(3), raw_log STRING, parsed_data STRING,
    extra_data STRING, tags STRING, created_at TIMESTAMP(3)
) WITH (
    'connector' = 'jdbc', 'url' = 'jdbc:postgresql://timescale:5432/postgres',
    'table-name' = 'alerts', 'username' = 'postgres', 'password' = 'postgres',
    'driver' = 'org.postgresql.Driver', 'sink.buffer-flush.interval' = '1000'
);

INSERT INTO alerts_sink
SELECT
    'WZH-' || COALESCE(rule_id, ''),
    COALESCE(rule_description, 'Wazuh 告警'), COALESCE(full_log, ''),
    CASE WHEN rule_level >= 12 THEN 'critical' WHEN rule_level >= 8 THEN 'high' ELSE 'medium' END,
    'new', 'HIDS', 'Wazuh', 'host', '主机安全', 85.0,
    COALESCE(data_srcip, ''), CAST(COALESCE(data_srcport, '0') AS INT),
    '', CAST(NULL AS INT), '', COALESCE(agent_name, ''),
    TO_TIMESTAMP_LTZ(UNIX_TIMESTAMP(), 3), TO_TIMESTAMP_LTZ(UNIX_TIMESTAMP(), 3),
    COALESCE(full_log, ''), 'rule:' || COALESCE(rule_id, ''), '{}', '[wazuh,hids]',
    TO_TIMESTAMP_LTZ(UNIX_TIMESTAMP(), 3)
FROM wazuh_source;
