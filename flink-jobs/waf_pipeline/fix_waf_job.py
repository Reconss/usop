#!/usr/bin/env python3
"""
根据实际的 WAF 日志格式自动生成 Flink SQL
"""

# WAF 日志格式 (请根据实际日志调整)
WAF_LOG_FIELDS = {
    'id': 'INTEGER',
    'rule_name': 'STRING',      # 规则名称
    'threat_level': 'INTEGER',  # 威胁等级 1-5
    'severity': 'STRING',       # low/medium/high/critical
    'src_ip': 'STRING',         # 源IP
    'src_port': 'INTEGER',      # 源端口
    'dst_ip': 'STRING',         # 目标IP
    'dst_port': 'INTEGER',      # 目标端口
    'protocol': 'STRING',       # 协议
    'action': 'STRING',         # 动作 ALLOW/BLOCK
    'url': 'STRING',            # 请求URL
    'message': 'STRING',        # 告警消息
    'timestamp': 'STRING'       # 时间戳
}

def generate_flink_sql(topic_name='waf-alert', output_table='alert_logs'):
    """生成 Flink SQL"""
    
    # 构建 Source 字段定义
    source_fields = []
    for field, ftype in WAF_LOG_FIELDS.items():
        source_fields.append(f"    {field} {ftype}")
    
    sql = f"""-- ========================================
-- WAF 日志解析 Flink SQL 作业
-- Topic: {topic_name}
-- 输出表: {output_table}
-- 生成时间: 
-- ========================================

-- 1. 创建 Kafka Source 表
CREATE SOURCE TABLE waf_source (
{','.join(source_fields)}
) WITH (
    'connector' = 'kafka',
    'topic' = '{topic_name}',
    'properties.bootstrap.servers' = 'kafka:29092',
    'properties.group.id' = 'flink-waf-parser-{topic_name}',
    'scan.startup.mode' = 'earliest-offset',
    'format' = 'json',
    'json.fail-on-missing-field' = 'false',
    'json.ignore-parse-errors' = 'true'
);

-- 2. 创建 TimescaleDB Sink 表
CREATE SINK TABLE {output_table}_sink (
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
    'table-name' = '{output_table}',
    'username' = 'postgres',
    'password' = 'postgres',
    'driver' = 'org.postgresql.Driver',
    'sink.buffer-flush.interval' = '1000',
    'sink.buffer-flush.max-rows' = '100'
);

-- 3. 数据处理逻辑
INSERT INTO {output_table}_sink
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
    CONCAT('{{"protocol":"', COALESCE(protocol, ''), '","action":"', COALESCE(action, ''), '","url":"', COALESCE(url, ''), '"}}') AS metadata,
    TO_TIMESTAMP(COALESCE(timestamp, CURRENT_TIMESTAMP), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS timestamp
FROM waf_source
WHERE id IS NOT NULL;
"""
    return sql


if __name__ == '__main__':
    sql = generate_flink_sql()
    print(sql)
    
    # 保存到文件
    with open('flink-jobs/waf_pipeline/waf_alert_job.sql', 'w') as f:
        f.write(sql)
    print("\n✅ SQL 已保存到 flink-jobs/waf_pipeline/waf_alert_job.sql")
