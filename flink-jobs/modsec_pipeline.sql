CREATE TEMPORARY TABLE modsec_src (log_raw STRING) WITH (
    'connector' = 'kafka', 'topic' = 'modsecurity-alert',
    'properties.bootstrap.servers' = 'kafka:29092',
    'properties.group.id' = 'flink-modsec-v11',
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
    'MOD-' || CAST(UNIX_TIMESTAMP() AS STRING),
    '[ModSecurity] WAF 告警', COALESCE(log_raw, ''),
    'medium', 'new', 'WAF', 'ModSecurity', 'network', 'Web攻击', 88.0,
    '', CAST(NULL AS INT), '', CAST(NULL AS INT), 'HTTP', '',
    TO_TIMESTAMP_LTZ(UNIX_TIMESTAMP(), 3), TO_TIMESTAMP_LTZ(UNIX_TIMESTAMP(), 3),
    COALESCE(log_raw, ''), '{}', '{}', '[modsecurity,waf]',
    TO_TIMESTAMP_LTZ(UNIX_TIMESTAMP(), 3)
FROM modsec_src;
