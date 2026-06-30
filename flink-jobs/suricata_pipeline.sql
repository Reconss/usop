CREATE TEMPORARY TABLE suricata_source (
    event_type STRING, flow_id BIGINT, src_ip STRING, src_port INT,
    dest_ip STRING, dest_port INT, proto STRING, ts STRING
) WITH (
    'connector' = 'kafka', 'topic' = 'suricata-alert',
    'properties.bootstrap.servers' = 'kafka:29092',
    'properties.group.id' = 'flink-suricata-v11',
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
    'SRT-' || CAST(flow_id AS STRING),
    'Suricata NIDS 告警', 'Suricata 检测到网络入侵',
    'medium', 'new', 'NIDS', 'Suricata', 'network', '网络入侵', 90.0,
    COALESCE(src_ip, ''), src_port, COALESCE(dest_ip, ''), dest_port,
    COALESCE(proto, ''), '',
    TO_TIMESTAMP_LTZ(UNIX_TIMESTAMP(), 3),
    TO_TIMESTAMP_LTZ(UNIX_TIMESTAMP(), 3),
    'flow:' || CAST(flow_id AS STRING), '{}', '{}', '[suricata,nids]',
    TO_TIMESTAMP_LTZ(UNIX_TIMESTAMP(), 3)
FROM suricata_source;
