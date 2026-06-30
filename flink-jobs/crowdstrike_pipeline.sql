CREATE TEMPORARY TABLE cs_source (
    event ROW<DetectName STRING, DetectDescription STRING, ComputerName STRING, FileName STRING>,
    event_time TIMESTAMP(3),
    WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
) WITH (
    'connector' = 'kafka', 'topic' = 'crowdstrike-alert',
    'properties.bootstrap.servers' = 'kafka:29092',
    'properties.group.id' = 'flink-cs-v11',
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
    'CRW-' || CAST(TIMESTAMPDIFF(SECOND, TIMESTAMP '1970-01-01', event_time) AS STRING),
    '[EDR] ' || COALESCE(event.DetectName, 'CrowdStrike'),
    COALESCE(event.DetectDescription, ''),
    'high', 'new', 'EDR', 'CrowdStrike Falcon', 'endpoint', '终端威胁', 95.0,
    '', CAST(NULL AS INT), '', CAST(NULL AS INT), '', COALESCE(event.ComputerName, ''),
    COALESCE(event_time, TO_TIMESTAMP_LTZ(UNIX_TIMESTAMP(), 3)),
    COALESCE(event_time, TO_TIMESTAMP_LTZ(UNIX_TIMESTAMP(), 3)),
    'file:' || COALESCE(event.FileName, ''), '{}', '{}', '[crowdstrike,edr]',
    TO_TIMESTAMP_LTZ(UNIX_TIMESTAMP(), 3)
FROM cs_source;
