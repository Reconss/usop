-- USOP 关联分析 Flink 作业（由「响应与自动化 → 规则管理 → 关联分析规则」自动生成）
-- 规则数：6
-- 窗口时间属性：处理时间 PROCTIME（不依赖 first_seen 字段解析）
-- 目标：Kafka valid-alerts → 窗口聚合 → PG events 表（JDBC sink）

CREATE TABLE corr_src (
  `alert_id`       STRING,
  `alert_code`     STRING,
  `title`          STRING,
  `description`    STRING,
  `severity`       STRING,
  `category`       STRING,
  `source`         STRING,
  `source_product` STRING,
  `source_type`    STRING,
  `src_ip`         STRING,
  `dst_ip`         STRING,
  `src_port`       INT,
  `dst_port`       INT,
  `protocol`       STRING,
  `hostname`       STRING,
  `username`       STRING,
  `operation`      STRING,
  `confidence`     DOUBLE,
  `proc_time`      AS PROCTIME()
) WITH (
  'connector' = 'kafka',
  'topic' = 'valid-alerts',
  'properties.bootstrap.servers' = 'kafka:29092',
  'properties.group.id' = 'usop-flink-correlation',
  'scan.startup.mode' = 'latest-offset',
  'format' = 'json',
  'json.ignore-parse-errors' = 'true',
  'json.fail-on-missing-field' = 'false'
);

CREATE TABLE corr_events (
  `event_code`  STRING,
  `title`       STRING,
  `description` STRING,
  `severity`    STRING,
  `category`    STRING,
  `source`      STRING,
  `status`      STRING,
  `src_ip`      STRING,
  `raw_log`     STRING,
  `extra_data`  STRING,
  `timestamp`   TIMESTAMP(3),
  `created_at`  TIMESTAMP(3),
  `updated_at`  TIMESTAMP(3)
) WITH (
  'connector' = 'jdbc',
  'url' = 'jdbc:postgresql://postgres:5432/usop_security?stringtype=unspecified',
  'table-name' = 'events',
  'username' = 'usop',
  'password' = 'usop_password',
  'sink.buffer-flush.max-rows' = '1',
  'sink.buffer-flush.interval' = '2s',
  'sink.max-retries' = '3'
);

EXECUTE STATEMENT SET
BEGIN
INSERT INTO corr_events
SELECT
  CONCAT('CE', CAST(2 AS STRING), '-', DATE_FORMAT(`w_start`, 'yyMMddHHmm'), '-', SUBSTR(MD5(CAST(`grp` AS STRING)), 1, 4)),
  '同源 IP 高频告警',
  CONCAT('关联分析「同源 IP 高频告警」：', '源 IP', ' = ',
         COALESCE(CAST(`grp` AS STRING), '-'), ' 在 20 秒窗口内触发 ',
         CAST(`hit_cnt` AS STRING), ' 次（阈值 ', CAST(3.0 AS STRING), '）；样本告警 ',
         COALESCE(`sample_code`, '-'), ' / ', COALESCE(`sample_title`, '-')),
  'high',
  'correlation',
  'flink-correlation', 'new', CAST(`grp` AS STRING),
  CONCAT('rule_id=', CAST(2 AS STRING), '; type=frequency; group=', 'src_ip',
         '; window_start=', CAST(`w_start` AS STRING), '; window_end=', CAST(`w_end` AS STRING),
         '; count=', CAST(`hit_cnt` AS STRING), '; threshold=', CAST(3.0 AS STRING)),
  CAST(NULL AS STRING),
  `w_end`, `w_end`, `w_end`
FROM (
  SELECT
    TUMBLE_START(`proc_time`, INTERVAL '20' SECOND(2)) AS `w_start`,
    TUMBLE_END(`proc_time`, INTERVAL '20' SECOND(2))   AS `w_end`,
    `src_ip` AS `grp`,
    COUNT(*)             AS `hit_cnt`,
    MIN(`src_ip`)     AS `sample_src_ip`,
    MIN(`alert_code`)    AS `sample_code`,
    MIN(`title`)         AS `sample_title`
  FROM corr_src
  WHERE `src_ip` IS NOT NULL
  GROUP BY TUMBLE(`proc_time`, INTERVAL '20' SECOND(2)), `src_ip`
)
WHERE `hit_cnt` >= 3.0;

INSERT INTO corr_events
SELECT
  CONCAT('CE', CAST(3 AS STRING), '-', DATE_FORMAT(`w_start`, 'yyMMddHHmm'), '-', SUBSTR(MD5(CAST(`grp` AS STRING)), 1, 4)),
  '同源多规则命中',
  CONCAT('关联分析「同源多规则命中」：', '源 IP', ' = ',
         COALESCE(CAST(`grp` AS STRING), '-'), ' 在 60 秒窗口内命中 ',
         CAST(`hit_cnt` AS STRING), ' 个不同的 ', '告警编号', '（阈值 ', CAST(3.0 AS STRING), '）'),
  'high',
  'correlation',
  'flink-correlation', 'new', CAST(`grp` AS STRING),
  CONCAT('rule_id=', CAST(3 AS STRING), '; type=distinct; group=', 'src_ip',
         '; distinct_field=', 'alert_code', '; window_start=', CAST(`w_start` AS STRING),
         '; window_end=', CAST(`w_end` AS STRING), '; distinct_count=', CAST(`hit_cnt` AS STRING),
         '; threshold=', CAST(3.0 AS STRING)),
  CAST(NULL AS STRING),
  `w_end`, `w_end`, `w_end`
FROM (
  SELECT
    TUMBLE_START(`proc_time`, INTERVAL '1' MINUTE) AS `w_start`,
    TUMBLE_END(`proc_time`, INTERVAL '1' MINUTE)   AS `w_end`,
    `src_ip` AS `grp`,
    COUNT(DISTINCT `alert_code`) AS `hit_cnt`,
    MIN(`src_ip`)     AS `sample_src_ip`
  FROM corr_src
  WHERE `src_ip` IS NOT NULL AND `alert_code` IS NOT NULL
  GROUP BY TUMBLE(`proc_time`, INTERVAL '1' MINUTE), `src_ip`
)
WHERE `hit_cnt` >= 3.0;

INSERT INTO corr_events
SELECT
  CONCAT('CE', CAST(4 AS STRING), '-', DATE_FORMAT(`w_start`, 'yyMMddHHmm'), '-', SUBSTR(MD5(CAST(`grp` AS STRING)), 1, 4)),
  '源端口聚合异常',
  CONCAT('关联分析「源端口聚合异常」：', '源 IP', ' = ',
         COALESCE(CAST(`grp` AS STRING), '-'), ' 在 60 秒窗口内 ', '目的端口',
         ' 的 ', 'SUM', ' 为 ', CAST(ROUND(`agg_val`, 3) AS STRING),
         '（阈值 ', CAST(100.0 AS STRING), '）'),
  'medium',
  'correlation',
  'flink-correlation', 'new', CAST(`grp` AS STRING),
  CONCAT('rule_id=', CAST(4 AS STRING), '; type=aggregation; group=', 'src_ip',
         '; agg_func=', 'sum', '; agg_field=', 'dst_port',
         '; window_start=', CAST(`w_start` AS STRING), '; window_end=', CAST(`w_end` AS STRING),
         '; value=', CAST(ROUND(`agg_val`, 4) AS STRING), '; threshold=', CAST(100.0 AS STRING),
         '; compare=', '>='),
  CAST(NULL AS STRING),
  `w_end`, `w_end`, `w_end`
FROM (
  SELECT
    TUMBLE_START(`proc_time`, INTERVAL '1' MINUTE) AS `w_start`,
    TUMBLE_END(`proc_time`, INTERVAL '1' MINUTE)   AS `w_end`,
    `src_ip` AS `grp`,
    SUM(CAST(`dst_port` AS DOUBLE)) AS `agg_val`,
    MIN(`src_ip`)     AS `sample_src_ip`
  FROM corr_src
  WHERE `src_ip` IS NOT NULL AND `dst_port` IS NOT NULL
  GROUP BY TUMBLE(`proc_time`, INTERVAL '1' MINUTE), `src_ip`
)
WHERE `agg_val` >= 100.0;

INSERT INTO corr_events
SELECT
  CONCAT('CE', CAST(5 AS STRING), '-', DATE_FORMAT(`w_start`, 'yyMMddHHmm'), '-', SUBSTR(MD5(CAST(`grp` AS STRING)), 1, 4)),
  '先扫后打时序',
  CONCAT('时序关联「先扫后打时序」：', '源 IP', ' = ',
         COALESCE(CAST(`grp` AS STRING), '-'), ' 在 120 秒窗口内同时出现 ',
         '告警分类 包含 scan', '（', CAST(`a_cnt` AS STRING), ' 次）与 ',
         '告警分类 包含 attempted', '（', CAST(`b_cnt` AS STRING), ' 次）'),
  'critical',
  'correlation',
  'flink-correlation', 'new', CAST(`grp` AS STRING),
  CONCAT('rule_id=', CAST(5 AS STRING), '; type=sequence; group=', 'src_ip',
         '; stage_a=', '告警分类 包含 scan', '; stage_b=', '告警分类 包含 attempted',
         '; window_start=', CAST(`w_start` AS STRING), '; window_end=', CAST(`w_end` AS STRING),
         '; a_count=', CAST(`a_cnt` AS STRING), '; b_count=', CAST(`b_cnt` AS STRING)),
  CAST(NULL AS STRING),
  `w_end`, `w_end`, `w_end`
FROM (
  SELECT
    TUMBLE_START(`proc_time`, INTERVAL '2' MINUTE) AS `w_start`,
    TUMBLE_END(`proc_time`, INTERVAL '2' MINUTE)   AS `w_end`,
    `src_ip` AS `grp`,
    SUM(CASE WHEN `category` LIKE '%scan%' THEN 1 ELSE 0 END) AS `a_cnt`,
    SUM(CASE WHEN `category` LIKE '%attempted%' THEN 1 ELSE 0 END) AS `b_cnt`,
    MIN(`src_ip`)     AS `sample_src_ip`,
    MIN(CASE WHEN `category` LIKE '%scan%' THEN `proc_time` END) AS `a_at`,
    MIN(CASE WHEN `category` LIKE '%attempted%' THEN `proc_time` END) AS `b_at`
  FROM corr_src
  WHERE `src_ip` IS NOT NULL
  GROUP BY TUMBLE(`proc_time`, INTERVAL '2' MINUTE), `src_ip`
)
-- A 不晚于 B 即算命中：PROCTIME 是毫秒精度，同毫秒到达的消息按并列处理，
-- 用严格 < 会把「同一批上报里的先扫后打」全部漏掉
WHERE `a_cnt` >= 1 AND `b_cnt` >= 1 AND `a_at` <= `b_at`;

INSERT INTO corr_events
SELECT
  CONCAT('CE', CAST(7 AS STRING), '-', DATE_FORMAT(`w_start`, 'yyMMddHHmm'), '-', SUBSTR(MD5(CAST(`grp` AS STRING)), 1, 4)),
  '目标主机高频告警聚合事件',
  CONCAT('关联分析「同目标高频告警聚合」：', '目的 IP', ' = ',
         COALESCE(CAST(`grp` AS STRING), '-'), ' 在 300 秒窗口内触发 ',
         CAST(`hit_cnt` AS STRING), ' 次（阈值 ', CAST(10.0 AS STRING), '）；样本告警 ',
         COALESCE(`sample_code`, '-'), ' / ', COALESCE(`sample_title`, '-')),
  'high',
  'correlation',
  'flink-correlation', 'new', CAST(`sample_src_ip` AS STRING),
  CONCAT('rule_id=', CAST(7 AS STRING), '; type=frequency; group=', 'dst_ip',
         '; window_start=', CAST(`w_start` AS STRING), '; window_end=', CAST(`w_end` AS STRING),
         '; count=', CAST(`hit_cnt` AS STRING), '; threshold=', CAST(10.0 AS STRING)),
  CAST(NULL AS STRING),
  `w_end`, `w_end`, `w_end`
FROM (
  SELECT
    TUMBLE_START(`proc_time`, INTERVAL '5' MINUTE) AS `w_start`,
    TUMBLE_END(`proc_time`, INTERVAL '5' MINUTE)   AS `w_end`,
    `dst_ip` AS `grp`,
    COUNT(*)             AS `hit_cnt`,
    MIN(`src_ip`)     AS `sample_src_ip`,
    MIN(`alert_code`)    AS `sample_code`,
    MIN(`title`)         AS `sample_title`
  FROM corr_src
  WHERE `dst_ip` IS NOT NULL
  GROUP BY TUMBLE(`proc_time`, INTERVAL '5' MINUTE), `dst_ip`
)
WHERE `hit_cnt` >= 10.0;

INSERT INTO corr_events
SELECT
  CONCAT('CE', CAST(8 AS STRING), '-', DATE_FORMAT(`w_start`, 'yyMMddHHmm'), '-', SUBSTR(MD5(CAST(`grp` AS STRING)), 1, 4)),
  '高威胁源 IP 聚合事件',
  CONCAT('关联分析「同源高频告警聚合」：', '源 IP', ' = ',
         COALESCE(CAST(`grp` AS STRING), '-'), ' 在 300 秒窗口内触发 ',
         CAST(`hit_cnt` AS STRING), ' 次（阈值 ', CAST(10.0 AS STRING), '）；样本告警 ',
         COALESCE(`sample_code`, '-'), ' / ', COALESCE(`sample_title`, '-')),
  'high',
  'correlation',
  'flink-correlation', 'new', CAST(`grp` AS STRING),
  CONCAT('rule_id=', CAST(8 AS STRING), '; type=frequency; group=', 'src_ip',
         '; window_start=', CAST(`w_start` AS STRING), '; window_end=', CAST(`w_end` AS STRING),
         '; count=', CAST(`hit_cnt` AS STRING), '; threshold=', CAST(10.0 AS STRING)),
  CAST(NULL AS STRING),
  `w_end`, `w_end`, `w_end`
FROM (
  SELECT
    TUMBLE_START(`proc_time`, INTERVAL '5' MINUTE) AS `w_start`,
    TUMBLE_END(`proc_time`, INTERVAL '5' MINUTE)   AS `w_end`,
    `src_ip` AS `grp`,
    COUNT(*)             AS `hit_cnt`,
    MIN(`src_ip`)     AS `sample_src_ip`,
    MIN(`alert_code`)    AS `sample_code`,
    MIN(`title`)         AS `sample_title`
  FROM corr_src
  WHERE `src_ip` IS NOT NULL
  GROUP BY TUMBLE(`proc_time`, INTERVAL '5' MINUTE), `src_ip`
)
WHERE `hit_cnt` >= 10.0;
END;
