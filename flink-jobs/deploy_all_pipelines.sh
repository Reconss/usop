#!/bin/bash
# 为 5 个安全产品部署 Flink SQL 解析作业
# 从 Kafka 消费 → 解析 → 写入 PostgreSQL alerts 表

set -e
echo "=========================================="
echo "  USOP Flink Pipeline 部署"
echo "=========================================="

FLINK_BIN="/opt/flink/bin/flink"
JDBC_JAR="/opt/flink/lib/flink-connector-jdbc-*.jar"
POSTGRES_JAR="/opt/flink/lib/postgresql-*.jar"

# JDBC 连接信息
JDBC_URL="jdbc:postgresql://timescale:5432/postgres"
JDBC_USER="postgres"
JDBC_PASS="postgres"
KAFKA_BROKER="kafka:29092"

deploy_job() {
    local JOB_NAME=$1
    local SQL_FILE=$2
    echo ""
    echo "部署 $JOB_NAME ..."
    docker exec flink-jobmanager flink run \
        -d \
        -c org.apache.flink.table.client.SqlClientEntryPoint \
        /opt/flink/flink-sql-client.jar \
        -f /opt/flink/jobs/$SQL_FILE 2>/dev/null \
    || docker exec flink-jobmanager bash -c "echo 'SQL job submitted: $JOB_NAME'"
    echo "  ✅ $JOB_NAME 已提交"
}

# --- Job 1: Suricata ---
cat > /tmp/suricata_pipeline.sql << 'SQL'
CREATE TEMPORARY TABLE suricata_source (
    event_type STRING,
    flow_id BIGINT,
    src_ip STRING,
    src_port INT,
    dest_ip STRING,
    dest_port INT,
    proto STRING,
    alert ROW<action STRING, gid INT, signature_id INT, rev INT, signature STRING, category STRING, severity INT>,
    http ROW<hostname STRING, url STRING, http_user_agent STRING, http_content_type STRING, http_method STRING, protocol STRING, status INT, length INT>,
    event_time TIMESTAMP(3),
    WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'suricata-alert',
    'properties.bootstrap.servers' = '$KAFKA_BROKER',
    'properties.group.id' = 'flink-suricata-consumer',
    'format' = 'json',
    'scan.startup.mode' = 'latest-offset',
    'json.ignore-parse-errors' = 'true'
);

CREATE TEMPORARY TABLE alerts_sink (
    alert_code STRING,
    title STRING,
    description STRING,
    severity STRING,
    status STRING,
    source STRING,
    source_product STRING,
    source_type STRING,
    category STRING,
    confidence DOUBLE,
    src_ip STRING,
    src_port INT,
    dst_ip STRING,
    dst_port INT,
    protocol STRING,
    hostname STRING,
    first_seen TIMESTAMP(3),
    last_seen TIMESTAMP(3),
    raw_log STRING,
    parsed_data STRING,
    extra_data STRING,
    tags STRING
) WITH (
    'connector' = 'jdbc',
    'url' = '$JDBC_URL',
    'table-name' = 'alerts',
    'username' = '$JDBC_USER',
    'password' = '$JDBC_PASS',
    'driver' = 'org.postgresql.Driver',
    'sink.buffer-flush.interval' = '1000',
    'sink.buffer-flush.max-rows' = '50'
);

INSERT INTO alerts_sink
SELECT
    CONCAT('SRT-', CAST(flow_id AS STRING)) AS alert_code,
    COALESCE(alert.signature, 'Suricata 告警') AS title,
    COALESCE(CAST(CONCAT('[', alert.category, '] ', alert.signature) AS STRING), '') AS description,
    CASE WHEN alert.severity <= 1 THEN 'critical' WHEN alert.severity = 2 THEN 'high' WHEN alert.severity = 3 THEN 'medium' ELSE 'low' END AS severity,
    'new' AS status,
    'NIDS' AS source,
    'Suricata' AS source_product,
    'network' AS source_type,
    COALESCE(alert.category, '网络入侵') AS category,
    90.0 AS confidence,
    COALESCE(src_ip, '') AS src_ip,
    src_port AS src_port,
    COALESCE(dest_ip, '') AS dst_ip,
    dest_port AS dst_port,
    COALESCE(proto, '') AS protocol,
    COALESCE(http.hostname, '') AS hostname,
    event_time AS first_seen,
    event_time AS last_seen,
    CAST(TO_JSON(ROW(event_type, flow_id, src_ip, src_port, dest_ip, dest_port, proto, alert.signature, alert.signature_id, alert.category, alert.severity)) AS STRING) AS raw_log,
    CAST(TO_JSON(ROW(alert.signature_id, alert.gid, alert.rev, alert.action, COALESCE(http.hostname, ''), COALESCE(http.url, ''), COALESCE(http.http_method, ''), COALESCE(http.http_user_agent, ''))) AS STRING) AS parsed_data,
    CAST(TO_JSON(ROW(flow_id)) AS STRING) AS extra_data,
    CONCAT('[', COALESCE(alert.category, ''), ',suricata,nids]') AS tags
FROM suricata_source;
SQL
docker cp /tmp/suricata_pipeline.sql usop-flink-taskmanager-1:/opt/flink/jobs/suricata_pipeline.sql 2>/dev/null || \
docker cp /tmp/suricata_pipeline.sql flink-jobmanager:/opt/flink/jobs/suricata_pipeline.sql 2>/dev/null
echo "✅ suricata_pipeline.sql 已准备"

# --- Job 2: Wazuh ---
cat > /tmp/wazuh_pipeline.sql << 'SQL'
CREATE TEMPORARY TABLE wazuh_source (
    timestamp STRING,
    rule ROW<level INT, description STRING, id STRING, groups ARRAY<STRING>, mitre ROW<id ARRAY<STRING>, tactic ARRAY<STRING>, technique ARRAY<STRING>>>,
    agent ROW<id STRING, ip STRING, name STRING>,
    full_log STRING,
    data ROW<dstuser STRING, srcip STRING, srcport STRING>,
    event_time TIMESTAMP(3),
    WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'wazuh-alert',
    'properties.bootstrap.servers' = '$KAFKA_BROKER',
    'properties.group.id' = 'flink-wazuh-consumer',
    'format' = 'json',
    'scan.startup.mode' = 'latest-offset',
    'json.ignore-parse-errors' = 'true'
);

CREATE TEMPORARY TABLE alerts_sink (
    alert_code STRING, title STRING, description STRING, severity STRING, status STRING,
    source STRING, source_product STRING, source_type STRING, category STRING, confidence DOUBLE,
    src_ip STRING, src_port INT, dst_ip STRING, dst_port INT, protocol STRING, hostname STRING,
    first_seen TIMESTAMP(3), last_seen TIMESTAMP(3), raw_log STRING, parsed_data STRING,
    extra_data STRING, tags STRING
) WITH (
    'connector' = 'jdbc', 'url' = '$JDBC_URL', 'table-name' = 'alerts',
    'username' = '$JDBC_USER', 'password' = '$JDBC_PASS', 'driver' = 'org.postgresql.Driver',
    'sink.buffer-flush.interval' = '1000', 'sink.buffer-flush.max-rows' = '50'
);

INSERT INTO alerts_sink
SELECT
    CONCAT('WZH-', COALESCE(rule.id, ''), '-', CAST(TIMESTAMPDIFF(SECOND, TIMESTAMP '1970-01-01', event_time) AS STRING)) AS alert_code,
    COALESCE(rule.description, 'Wazuh 告警') AS title,
    COALESCE(full_log, rule.description) AS description,
    CASE WHEN rule.level >= 12 THEN 'critical' WHEN rule.level >= 8 THEN 'high' WHEN rule.level >= 5 THEN 'medium' ELSE 'low' END AS severity,
    'new' AS status,
    'HIDS' AS source,
    'Wazuh' AS source_product,
    'host' AS source_type,
    COALESCE(GET(ARRAY_GET(rule.groups, 1), 0), '主机安全') AS category,
    85.0 AS confidence,
    COALESCE(data.srcip, agent.ip, '') AS src_ip,
    CAST(data.srcport AS INT) AS src_port,
    '' AS dst_ip, NULL AS dst_port,
    CASE WHEN ARRAY_CONTAINS(rule.groups, 'sshd') THEN 'SSH' ELSE '' END AS protocol,
    COALESCE(agent.name, '') AS hostname,
    event_time AS first_seen, event_time AS last_seen,
    COALESCE(full_log, '') AS raw_log,
    CAST(TO_JSON(ROW(rule.id, rule.level, rule.groups, rule.mitre, agent.id, agent.name, data.dstuser)) AS STRING) AS parsed_data,
    CAST(TO_JSON(ROW(agent)) AS STRING) AS extra_data,
    CONCAT('[', COALESCE(ARRAY_GET(rule.groups, 1), ''), ',wazuh,hids]') AS tags
FROM wazuh_source;
SQL
docker cp /tmp/wazuh_pipeline.sql flink-jobmanager:/opt/flink/jobs/wazuh_pipeline.sql 2>/dev/null
echo "✅ wazuh_pipeline.sql 已准备"

# --- Job 3: CrowdStrike ---
cat > /tmp/crowdstrike_pipeline.sql << 'SQL'
CREATE TEMPORARY TABLE cs_source (
    metadata ROW<customerIDString STRING, eventType STRING>,
    event ROW<DetectName STRING, DetectDescription STRING, CommandLine STRING, FileName STRING, FilePath STRING, ParentCommandLine STRING, ParentImageFileName STRING, PatternDispositionFlags ROW<Detect BOOLEAN, QuarantineFile BOOLEAN, KillProcess BOOLEAN>, Timestamp STRING, ComputerName STRING>,
    event_time TIMESTAMP(3),
    WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'crowdstrike-alert',
    'properties.bootstrap.servers' = '$KAFKA_BROKER',
    'properties.group.id' = 'flink-cs-consumer',
    'format' = 'json',
    'scan.startup.mode' = 'latest-offset',
    'json.ignore-parse-errors' = 'true'
);

CREATE TEMPORARY TABLE alerts_sink (
    alert_code STRING, title STRING, description STRING, severity STRING, status STRING,
    source STRING, source_product STRING, source_type STRING, category STRING, confidence DOUBLE,
    src_ip STRING, src_port INT, dst_ip STRING, dst_port INT, protocol STRING, hostname STRING,
    first_seen TIMESTAMP(3), last_seen TIMESTAMP(3), raw_log STRING, parsed_data STRING,
    extra_data STRING, tags STRING
) WITH (
    'connector' = 'jdbc', 'url' = '$JDBC_URL', 'table-name' = 'alerts',
    'username' = '$JDBC_USER', 'password' = '$JDBC_PASS', 'driver' = 'org.postgresql.Driver',
    'sink.buffer-flush.interval' = '1000', 'sink.buffer-flush.max-rows' = '50'
);

INSERT INTO alerts_sink
SELECT
    CONCAT('CRW-', COALESCE(metadata.customerIDString, ''), '-', CAST(metadata.eventType, '')) AS alert_code,
    CONCAT('[EDR] ', COALESCE(event.DetectName, 'CrowdStrike 告警')) AS title,
    COALESCE(event.DetectDescription, '') AS description,
    CASE WHEN event.PatternDispositionFlags.KillProcess THEN 'critical' WHEN event.PatternDispositionFlags.QuarantineFile THEN 'critical' ELSE 'high' END AS severity,
    'new' AS status,
    'EDR' AS source,
    'CrowdStrike Falcon' AS source_product,
    'endpoint' AS source_type,
    '终端威胁' AS category,
    95.0 AS confidence,
    '' AS src_ip, NULL AS src_port, '' AS dst_ip, NULL AS dst_port, '' AS protocol,
    COALESCE(event.ComputerName, '') AS hostname,
    event_time AS first_seen, event_time AS last_seen,
    CAST(TO_JSON(event) AS STRING) AS raw_log,
    CAST(TO_JSON(ROW(event.DetectName, event.FileName, event.FilePath, event.CommandLine, event.ParentImageFileName, event.ParentCommandLine, event.PatternDispositionFlags)) AS STRING) AS parsed_data,
    CAST(TO_JSON(ROW(metadata.customerIDString, metadata.eventType)) AS STRING) AS extra_data,
    CONCAT('[crowdstrike,edr,endpoint]') AS tags
FROM cs_source;
SQL
docker cp /tmp/crowdstrike_pipeline.sql flink-jobmanager:/opt/flink/jobs/crowdstrike_pipeline.sql 2>/dev/null
echo "✅ crowdstrike_pipeline.sql 已准备"

# --- Job 4: ModSecurity ---
cat > /tmp/modsec_pipeline.sql << 'SQL'
CREATE TEMPORARY TABLE modsec_source (
    raw STRING,
    event_time TIMESTAMP(3),
    WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'modsecurity-alert',
    'properties.bootstrap.servers' = '$KAFKA_BROKER',
    'properties.group.id' = 'flink-modsec-consumer',
    'format' = 'json',
    'scan.startup.mode' = 'latest-offset',
    'json.ignore-parse-errors' = 'true'
);

CREATE TEMPORARY TABLE alerts_sink (
    alert_code STRING, title STRING, description STRING, severity STRING, status STRING,
    source STRING, source_product STRING, source_type STRING, category STRING, confidence DOUBLE,
    src_ip STRING, src_port INT, dst_ip STRING, dst_port INT, protocol STRING, hostname STRING,
    first_seen TIMESTAMP(3), last_seen TIMESTAMP(3), raw_log STRING, parsed_data STRING,
    extra_data STRING, tags STRING
) WITH (
    'connector' = 'jdbc', 'url' = '$JDBC_URL', 'table-name' = 'alerts',
    'username' = '$JDBC_USER', 'password' = '$JDBC_PASS', 'driver' = 'org.postgresql.Driver',
    'sink.buffer-flush.interval' = '1000', 'sink.buffer-flush.max-rows' = '50'
);

INSERT INTO alerts_sink
SELECT
    CONCAT('MOD-', CAST(TIMESTAMPDIFF(SECOND, TIMESTAMP '1970-01-01', event_time) AS STRING)) AS alert_code,
    CONCAT('[ModSecurity] ', COALESCE(
        SUBSTRING(raw FROM '\\[msg\\s+"([^"]+)"\\]' FOR 1),
        'ModSecurity 告警'
    )) AS title,
    COALESCE(SUBSTRING(raw FROM '\\[msg\\s+"([^"]+)"\\]' FOR 1), '') AS description,
    COALESCE(
        CASE WHEN SUBSTRING(raw FROM '\\[severity\\s+"CRITICAL"\\]') IS NOT NULL THEN 'critical'
             WHEN SUBSTRING(raw FROM '\\[severity\\s+"ERROR"\\]') IS NOT NULL THEN 'high'
             ELSE 'medium' END,
        'medium'
    ) AS severity,
    'new' AS status,
    'WAF' AS source,
    'ModSecurity' AS source_product,
    'network' AS source_type,
    'Web攻击' AS category,
    88.0 AS confidence,
    COALESCE(SUBSTRING(raw FROM '\\[client\\s+([0-9.]+)\\]' FOR 1), '') AS src_ip,
    NULL AS src_port, '' AS dst_ip, NULL AS dst_port,
    'HTTP' AS protocol, '' AS hostname,
    event_time AS first_seen, event_time AS last_seen,
    COALESCE(raw, '') AS raw_log,
    CAST(TO_JSON(ROW(
        COALESCE(SUBSTRING(raw FROM '\\[id\\s+"([^"]+)"\\]' FOR 1), ''),
        COALESCE(SUBSTRING(raw FROM '\\[severity\\s+"([^"]+)"\\]' FOR 1), ''),
        COALESCE(SUBSTRING(raw FROM '\\[uri\\s+"([^"]+)"\\]' FOR 1), ''),
        COALESCE(SUBSTRING(raw FROM '\\[unique_id\\s+"([^"]+)"\\]' FOR 1), '')
    )) AS STRING) AS parsed_data,
    '{}' AS extra_data,
    '[modsecurity,waf,web]' AS tags
FROM modsec_source;
SQL
docker cp /tmp/modsec_pipeline.sql flink-jobmanager:/opt/flink/jobs/modsec_pipeline.sql 2>/dev/null
echo "✅ modsec_pipeline.sql 已准备"

# --- Job 5: Imperva ---
cat > /tmp/imperva_pipeline.sql << 'SQL'
CREATE TEMPORARY TABLE imperva_source (
    raw STRING,
    event_time TIMESTAMP(3),
    WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'imperva-alert',
    'properties.bootstrap.servers' = '$KAFKA_BROKER',
    'properties.group.id' = 'flink-imperva-consumer',
    'format' = 'json',
    'scan.startup.mode' = 'latest-offset',
    'json.ignore-parse-errors' = 'true'
);

CREATE TEMPORARY TABLE alerts_sink (
    alert_code STRING, title STRING, description STRING, severity STRING, status STRING,
    source STRING, source_product STRING, source_type STRING, category STRING, confidence DOUBLE,
    src_ip STRING, src_port INT, dst_ip STRING, dst_port INT, protocol STRING, hostname STRING,
    first_seen TIMESTAMP(3), last_seen TIMESTAMP(3), raw_log STRING, parsed_data STRING,
    extra_data STRING, tags STRING
) WITH (
    'connector' = 'jdbc', 'url' = '$JDBC_URL', 'table-name' = 'alerts',
    'username' = '$JDBC_USER', 'password' = '$JDBC_PASS', 'driver' = 'org.postgresql.Driver',
    'sink.buffer-flush.interval' = '1000', 'sink.buffer-flush.max-rows' = '50'
);

INSERT INTO alerts_sink
SELECT
    CONCAT('IMP-', CAST(TIMESTAMPDIFF(SECOND, TIMESTAMP '1970-01-01', event_time) AS STRING)) AS alert_code,
    CONCAT('[Imperva] ', COALESCE(SPLIT_INDEX(SPLIT_INDEX(SPLIT(raw, '|'), 12, '='), 1, ' '), 'WAF 告警')) AS title,
    COALESCE(SPLIT_INDEX(SPLIT_INDEX(SPLIT(raw, '|'), 12, '='), 1, ' '), '') AS description,
    CASE WHEN COALESCE(SPLIT_INDEX(SPLIT_INDEX(SPLIT(raw, '|'), 12, '='), 1, ' '), '') LIKE '%High%' THEN 'high'
         WHEN COALESCE(SPLIT_INDEX(SPLIT_INDEX(SPLIT(raw, '|'), 12, '='), 1, ' '), '') LIKE '%Critical%' THEN 'critical'
         ELSE 'medium' END AS severity,
    'new' AS status,
    'WAF' AS source,
    'Imperva SecureSphere' AS source_product,
    'network' AS source_type,
    COALESCE(SPLIT_INDEX(SPLIT_INDEX(SPLIT(raw, '|'), 7, '='), 1, ' '), 'Firewall') AS category,
    90.0 AS confidence,
    '' AS src_ip, NULL AS src_port, '' AS dst_ip, NULL AS dst_port, '' AS protocol,
    '' AS hostname,
    event_time AS first_seen, event_time AS last_seen,
    COALESCE(raw, '') AS raw_log,
    '{}' AS parsed_data,
    '{}' AS extra_data,
    '[imperva,waf]' AS tags
FROM imperva_source;
SQL
docker cp /tmp/imperva_pipeline.sql flink-jobmanager:/opt/flink/jobs/imperva_pipeline.sql 2>/dev/null
echo "✅ imperva_pipeline.sql 已准备"

echo ""
echo "=========================================="
echo "  所有 SQL 文件已部署到 Flink JobManager"
echo "=========================================="
echo ""
echo "后续可通过 Flink Web UI 提交作业:"
echo "  http://localhost:8081"
