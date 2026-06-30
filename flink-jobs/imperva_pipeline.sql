CREATE TEMPORARY TABLE imperva_src (log_raw STRING) WITH (
    'connector' = 'kafka', 'topic' = 'imperva-alert',
    'properties.bootstrap.servers' = 'kafka:29092',
    'properties.group.id' = 'flink-imperva-v11',
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
    'IMP-' || CAST(UNIX_TIMESTAMP() AS STRING),
    '[Imperva] WAF 告警', COALESCE(log_raw, ''),
    'medium', 'new', 'WAF', 'Imperva SecureSphere', 'network', 'Firewall', 90.0,
    '', CAST(NULL AS INT), '', CAST(NULL AS INT), '', '',
    TO_TIMESTAMP_LTZ(UNIX_TIMESTAMP(), 3), TO_TIMESTAMP_LTZ(UNIX_TIMESTAMP(), 3),
    COALESCE(log_raw, ''), '{}', '{}', '[imperva,waf]',
    TO_TIMESTAMP_LTZ(UNIX_TIMESTAMP(), 3)
FROM imperva_src;
