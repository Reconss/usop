"""
TimescaleDB 连接模块 - 用于存储告警日志时序数据

数据库端口说明:
  ┌──────────────┬──────────┬──────────────────────────────────────┐
  │ 数据库       │ 端口     │ 说明                                 │
  ├──────────────┼──────────┼──────────────────────────────────────┤
  │ PostgreSQL   │ 5432     │ 业务数据 (用户/事件/资产/规则等)      │
  │ TimescaleDB  │ 5433     │ 时序数据 (告警日志/统计/聚合)         │
  │ Redis        │ 6379     │ 缓存                                 │
  └──────────────┴──────────┴──────────────────────────────────────┘

功能:
    - 原始日志存储 (raw_logs)
    - 解析日志存储 (parsed_logs)
    - 告警事件存储 (alert_events)
    - 指标数据存储 (metrics)
    - 全文搜索支持
    - 持续聚合查询
"""

import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.pool import QueuePool


class TimescaleDB:
    """TimescaleDB 数据库连接管理"""
    
    _instance = None
    _engine = None
    _session_factory = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._engine is None:
            self._connect()
    
    def _connect(self):
        """建立数据库连接"""
        user = os.getenv('TSDB_USER', 'postgres')
        password = os.getenv('TSDB_PASSWORD', 'postgres')  # TimescaleDB 默认密码
        database = os.getenv('TSDB_NAME', 'postgres')    # 默认数据库
        
        env_host = os.getenv('TSDB_HOST')
        env_port = os.getenv('TSDB_PORT')
        
        if env_host and env_port:
            host = env_host
            port = int(env_port)
        elif os.path.exists('/.dockerenv') or os.getenv('DOCKER_CONTAINER', '').lower() == 'true':
            host = 'timescale'
            port = 5432
        else:
            host = 'localhost'
            port = 5433  # TimescaleDB 实际端口 (docker映射)
        
        database_url = f'postgresql://{user}:{password}@{host}:{port}/{database}'
        
        self._engine = create_engine(
            database_url,
            poolclass=QueuePool,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
            pool_recycle=3600,
            echo=False
        )
        
        self._session_factory = scoped_session(
            sessionmaker(bind=self._engine)
        )
    
    @property
    def engine(self):
        """获取数据库引擎"""
        return self._engine
    
    @property
    def session(self):
        """获取数据库会话"""
        return self._session_factory()
    
    def get_session(self):
        """获取新的数据库会话"""
        return self._session_factory()
    
    def execute(self, query, params=None):
        """执行原生 SQL"""
        with self._engine.connect() as conn:
            result = conn.execute(text(query), params or {})
            conn.commit()
            return result
    
    def close_session(self, session):
        """关闭会话"""
        if session:
            session.close()
    
    def test_connection(self):
        """测试数据库连接"""
        try:
            with self._engine.connect() as conn:
                result = conn.execute(text('SELECT 1'))
                return result.scalar() == 1
        except Exception as e:
            print(f"TimescaleDB connection failed: {e}")
            return False


# 全局实例
tsdb = TimescaleDB()


def get_tsdb():
    """获取 TimescaleDB 实例"""
    return tsdb


def insert_alert_log(session, alert_data: dict) -> int:
    """
    插入告警日志到 TimescaleDB
    
    Args:
        session: 数据库会话
        alert_data: 告警数据字典
    
    Returns:
        插入的记录 ID
    """
    query = text("""
        INSERT INTO alert_logs (
            time, alert_id, rule_id, severity, source,
            title, message, raw_data, metadata
        ) VALUES (
            :time, :alert_id, :rule_id, :severity, :source,
            :title, :message, :raw_data, :metadata
        )
        RETURNING id
    """)
    
    result = session.execute(query, {
        'time': alert_data.get('time'),
        'alert_id': str(alert_data.get('alert_id', '')),
        'rule_id': str(alert_data.get('rule_id', '')) if alert_data.get('rule_id') else None,
        'severity': alert_data.get('severity', 'medium'),
        'source': alert_data.get('source', ''),
        'title': alert_data.get('title', ''),
        'message': alert_data.get('message', ''),
        'raw_data': alert_data.get('raw_data'),
        'metadata': alert_data.get('metadata', {})
    })
    
    return result.scalar()


def batch_insert_alert_logs(session, alerts: list) -> int:
    """
    批量插入告警日志
    
    Args:
        session: 数据库会话
        alerts: 告警数据列表
    
    Returns:
        插入的记录数
    """
    if not alerts:
        return 0
    
    query = text("""
        INSERT INTO alert_logs (
            time, alert_id, rule_id, severity, source,
            title, message, raw_data, metadata
        ) VALUES (
            :time, :alert_id, :rule_id, :severity, :source,
            :title, :message, :raw_data, :metadata
        )
    """)
    
    params = [{
        'time': alert.get('time'),
        'alert_id': str(alert.get('alert_id', '')),
        'rule_id': str(alert.get('rule_id', '')) if alert.get('rule_id') else None,
        'severity': alert.get('severity', 'medium'),
        'source': alert.get('source', ''),
        'title': alert.get('title', ''),
        'message': alert.get('message', ''),
        'raw_data': alert.get('raw_data'),
        'metadata': alert.get('metadata', {})
    } for alert in alerts]
    
    result = session.execute(query, params)
    return result.rowcount


def query_alert_logs(session, start_time, end_time=None, severity=None, 
                     rule_id=None, source=None, limit=100, offset=0) -> list:
    """
    查询告警日志
    
    Args:
        session: 数据库会话
        start_time: 开始时间
        end_time: 结束时间
        severity: 严重程度过滤
        rule_id: 规则ID过滤
        source: 来源过滤
        limit: 返回数量限制
        offset: 偏移量
    
    Returns:
        告警日志列表
    """
    conditions = ["time >= :start_time"]
    params = {'start_time': start_time, 'limit': limit, 'offset': offset}
    
    if end_time:
        conditions.append("time <= :end_time")
        params['end_time'] = end_time
    
    if severity:
        conditions.append("severity = :severity")
        params['severity'] = severity
    
    if rule_id:
        conditions.append("rule_id = :rule_id")
        params['rule_id'] = str(rule_id)
    
    if source:
        conditions.append("source = :source")
        params['source'] = source
    
    where_clause = " AND ".join(conditions)
    
    query = text(f"""
        SELECT id, time, alert_id, rule_id, severity, source,
               title, message, raw_data, metadata
        FROM alert_logs
        WHERE {where_clause}
        ORDER BY time DESC
        LIMIT :limit OFFSET :offset
    """)
    
    result = session.execute(query, params)
    
    return [dict(row._mapping) for row in result]


def get_alert_stats(session, start_time, end_time=None, group_by='severity') -> dict:
    """
    获取告警统计
    
    Args:
        session: 数据库会话
        start_time: 开始时间
        end_time: 结束时间
        group_by: 分组字段 (severity, source, rule_id)
    
    Returns:
        统计结果字典
    """
    conditions = ["time >= :start_time"]
    params = {'start_time': start_time}
    
    if end_time:
        conditions.append("time <= :end_time")
        params['end_time'] = end_time
    
    where_clause = " AND ".join(conditions)
    
    # 总数统计
    total_query = text(f"""
        SELECT COUNT(*) as total FROM alert_logs WHERE {where_clause}
    """)
    total_result = session.execute(total_query, params).scalar()
    
    # 分组统计
    group_query = text(f"""
        SELECT {group_by}, COUNT(*) as count
        FROM alert_logs
        WHERE {where_clause}
        GROUP BY {group_by}
        ORDER BY count DESC
    """)
    
    group_result = session.execute(group_query, params)
    
    return {
        'total': total_result,
        'by_group': {str(row[0]): row[1] for row in group_result}
    }


def get_alert_trend(session, start_time, end_time=None, 
                    bucket='1 hour', group_by='severity') -> list:
    """
    获取告警趋势数据
    
    Args:
        session: 数据库会话
        start_time: 开始时间
        end_time: 结束时间
        bucket: 时间桶大小 (1 hour, 1 day, 1 week)
        group_by: 分组字段
    
    Returns:
        趋势数据列表
    """
    conditions = ["time >= :start_time"]
    params = {'start_time': start_time, 'bucket': bucket}
    
    if end_time:
        conditions.append("time <= :end_time")
        params['end_time'] = end_time
    
    where_clause = " AND ".join(conditions)
    
    query = text(f"""
        SELECT 
            time_bucket(:bucket, time) as bucket,
            {group_by},
            COUNT(*) as count
        FROM alert_logs
        WHERE {where_clause}
        GROUP BY bucket, {group_by}
        ORDER BY bucket
    """)
    
    result = session.execute(query, params)
    
    return [dict(row._mapping) for row in result]


# ==========================================
# 新增: parsed_logs 全文字段搜索功能
# ==========================================

def full_text_search(session, search_query: str, 
                    start_time=None, end_time=None,
                    log_type=None, src_ip=None, username=None,
                    limit: int = 100, offset: int = 0) -> dict:
    """
    全文搜索解析后的日志
    
    Args:
        session: 数据库会话
        search_query: 搜索关键词
        start_time: 开始时间
        end_time: 结束时间
        log_type: 日志类型过滤
        src_ip: 源 IP 过滤
        username: 用户名过滤
        limit: 返回数量限制
        offset: 偏移量
    
    Returns:
        搜索结果字典
    """
    conditions = ["search_vector @@ plainto_tsquery('simple', :query)"]
    params = {
        'query': search_query,
        'limit': limit,
        'offset': offset
    }
    
    if start_time:
        conditions.append("timestamp >= :start_time")
        params['start_time'] = start_time
    
    if end_time:
        conditions.append("timestamp <= :end_time")
        params['end_time'] = end_time
    
    if log_type:
        conditions.append("log_type = :log_type")
        params['log_type'] = log_type
    
    if src_ip:
        conditions.append("src_ip = :src_ip")
        params['src_ip'] = src_ip
    
    if username:
        conditions.append("username = :username")
        params['username'] = username
    
    where_clause = " AND ".join(conditions)
    
    # 查询结果
    count_query = text(f"""
        SELECT COUNT(*) FROM parsed_logs WHERE {where_clause}
    """)
    total = session.execute(count_query, params).scalar()
    
    # 查询数据
    data_query = text(f"""
        SELECT 
            id, timestamp, source_id, log_type,
            src_ip, dst_ip, src_port, dst_port,
            protocol, hostname, username,
            action, result, raw_message,
            ts_rank(search_vector, plainto_tsquery('simple', :query)) as rank
        FROM parsed_logs
        WHERE {where_clause}
        ORDER BY rank DESC, timestamp DESC
        LIMIT :limit OFFSET :offset
    """)
    
    result = session.execute(data_query, params)
    
    return {
        'total': total,
        'limit': limit,
        'offset': offset,
        'results': [dict(row._mapping) for row in result]
    }


def query_parsed_logs(session, start_time, end_time=None,
                     log_type=None, src_ip=None, username=None,
                     action=None, limit: int = 100, offset: int = 0) -> dict:
    """
    查询解析后的日志
    
    Args:
        session: 数据库会话
        start_time: 开始时间
        end_time: 结束时间
        log_type: 日志类型过滤
        src_ip: 源 IP 过滤
        username: 用户名过滤
        action: 动作过滤
        limit: 返回数量限制
        offset: 偏移量
    
    Returns:
        日志列表
    """
    conditions = ["timestamp >= :start_time"]
    params = {
        'start_time': start_time,
        'limit': limit,
        'offset': offset
    }
    
    if end_time:
        conditions.append("timestamp <= :end_time")
        params['end_time'] = end_time
    
    if log_type:
        conditions.append("log_type = :log_type")
        params['log_type'] = log_type
    
    if src_ip:
        conditions.append("src_ip = :src_ip")
        params['src_ip'] = src_ip
    
    if username:
        conditions.append("username = :username")
        params['username'] = username
    
    if action:
        conditions.append("action = :action")
        params['action'] = action
    
    where_clause = " AND ".join(conditions)
    
    # 查询总数
    count_query = text(f"""
        SELECT COUNT(*) FROM parsed_logs WHERE {where_clause}
    """)
    total = session.execute(count_query, params).scalar()
    
    # 查询数据
    data_query = text(f"""
        SELECT 
            id, timestamp, source_id, log_type,
            src_ip, dst_ip, src_port, dst_port,
            protocol, hostname, username,
            action, result, raw_message
        FROM parsed_logs
        WHERE {where_clause}
        ORDER BY timestamp DESC
        LIMIT :limit OFFSET :offset
    """)
    
    result = session.execute(data_query, params)
    
    return {
        'total': total,
        'limit': limit,
        'offset': offset,
        'logs': [dict(row._mapping) for row in result]
    }


def insert_parsed_log(session, log_data: dict) -> int:
    """
    插入解析后的日志
    
    Args:
        session: 数据库会话
        log_data: 日志数据字典
    
    Returns:
        插入的记录 ID
    """
    query = text("""
        INSERT INTO parsed_logs (
            source_id, log_type, timestamp, src_ip, dst_ip, src_port, dst_port,
            protocol, hostname, username, action, result, raw_message, details
        ) VALUES (
            :source_id, :log_type, :timestamp, :src_ip, :dst_ip, :src_port, :dst_port,
            :protocol, :hostname, :username, :action, :result, :raw_message, :details
        )
        RETURNING id
    """)
    
    result = session.execute(query, {
        'source_id': log_data.get('source_id'),
        'log_type': log_data.get('log_type', 'unknown'),
        'timestamp': log_data.get('timestamp'),
        'src_ip': log_data.get('src_ip'),
        'dst_ip': log_data.get('dst_ip'),
        'src_port': log_data.get('src_port'),
        'dst_port': log_data.get('dst_port'),
        'protocol': log_data.get('protocol'),
        'hostname': log_data.get('hostname'),
        'username': log_data.get('username'),
        'action': log_data.get('action'),
        'result': log_data.get('result'),
        'raw_message': log_data.get('raw_message'),
        'details': log_data.get('details', {})
    })
    
    return result.scalar()


def insert_alert_event(session, alert_data: dict) -> int:
    """
    插入告警事件
    
    Args:
        session: 数据库会话
        alert_data: 告警数据字典
    
    Returns:
        插入的记录 ID
    """
    query = text("""
        INSERT INTO alert_events (
            rule_id, rule_name, severity, alert_type,
            message, src_ip, dst_ip, username,
            source_id, log_ids, metadata, timestamp
        ) VALUES (
            :rule_id, :rule_name, :severity, :alert_type,
            :message, :src_ip, :dst_ip, :username,
            :source_id, :log_ids, :metadata, :timestamp
        )
        RETURNING id
    """)
    
    result = session.execute(query, {
        'rule_id': alert_data.get('rule_id'),
        'rule_name': alert_data.get('rule_name'),
        'severity': alert_data.get('severity', 3),
        'alert_type': alert_data.get('alert_type', 'single'),
        'message': alert_data.get('message'),
        'src_ip': alert_data.get('src_ip'),
        'dst_ip': alert_data.get('dst_ip'),
        'username': alert_data.get('username'),
        'source_id': alert_data.get('source_id'),
        'log_ids': alert_data.get('log_ids', []),
        'metadata': alert_data.get('metadata', {}),
        'timestamp': alert_data.get('timestamp')
    })
    
    return result.scalar()


def get_continuous_aggregate_stats(session, view_name: str, 
                                   start_time=None, end_time=None) -> list:
    """
    获取持续聚合统计
    
    Args:
        session: 数据库会话
        view_name: 聚合视图名 (alert_stats_5m, alert_stats_1h, log_stats_5m, parse_stats_5m)
        start_time: 开始时间
        end_time: 结束时间
    
    Returns:
        统计结果列表
    """
    conditions = []
    params = {}
    
    if start_time:
        conditions.append("bucket >= :start_time")
        params['start_time'] = start_time
    
    if end_time:
        conditions.append("bucket <= :end_time")
        params['end_time'] = end_time
    
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    query = text(f"""
        SELECT * FROM {view_name}
        WHERE {where_clause}
        ORDER BY bucket DESC
        LIMIT 1000
    """)
    
    result = session.execute(query, params)
    
    return [dict(row._mapping) for row in result]


def get_log_summary(session, start_time, end_time=None) -> dict:
    """
    获取日志摘要统计
    
    Args:
        session: 数据库会话
        start_time: 开始时间
        end_time: 结束时间
    
    Returns:
        摘要统计字典
    """
    params = {'start_time': start_time}
    time_condition = "timestamp >= :start_time"
    
    if end_time:
        time_condition += " AND timestamp <= :end_time"
        params['end_time'] = end_time
    
    # 原始日志统计
    raw_query = text(f"""
        SELECT COUNT(*) as total FROM raw_logs WHERE {time_condition}
    """)
    raw_total = session.execute(raw_query, params).scalar()
    
    # 解析日志统计
    parsed_query = text(f"""
        SELECT COUNT(*) as total FROM parsed_logs WHERE {time_condition}
    """)
    parsed_total = session.execute(parsed_query, params).scalar()
    
    # 解析日志类型分布
    type_query = text(f"""
        SELECT log_type, COUNT(*) as count 
        FROM parsed_logs 
        WHERE {time_condition}
        GROUP BY log_type 
        ORDER BY count DESC
    """)
    type_result = session.execute(type_query, params)
    type_distribution = {row[0]: row[1] for row in type_result}
    
    # 告警统计
    alert_query = text(f"""
        SELECT COUNT(*) as total, 
               AVG(severity::float) as avg_severity 
        FROM alert_events 
        WHERE {time_condition}
    """)
    alert_result = session.execute(alert_query, params)
    alert_row = alert_result.fetchone()
    
    return {
        'time_range': {
            'start': start_time,
            'end': end_time
        },
        'raw_logs': raw_total,
        'parsed_logs': parsed_total,
        'parse_rate': round(parsed_total / raw_total * 100, 2) if raw_total > 0 else 0,
        'log_types': type_distribution,
        'alerts': {
            'total': alert_row[0] if alert_row else 0,
            'avg_severity': round(alert_row[1], 2) if alert_row and alert_row[1] else 0
        }
    }


# ==========================================
# Alert 表 (TimescaleDB Hypertable)
# ==========================================

def create_alerts_hypertable(session):
    """
    创建 alerts 表并转换为 TimescaleDB hypertable
    
    Args:
        session: 数据库会话
    
    Returns:
        是否成功
    """
    try:
        # 检查 TimescaleDB 扩展是否启用
        result = session.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'"))
        if not result.fetchone():
            print("Warning: TimescaleDB extension not enabled, creating regular table")
            # 如果 TimescaleDB 未启用，创建普通表
            session.execute(text("""
                CREATE TABLE IF NOT EXISTS alerts (
                    id SERIAL PRIMARY KEY,
                    alert_code VARCHAR(20) UNIQUE NOT NULL,
                    title VARCHAR(200) NOT NULL,
                    description TEXT,
                    severity VARCHAR(20) DEFAULT 'medium',
                    status VARCHAR(20) DEFAULT 'new',
                    source VARCHAR(100),
                    source_product VARCHAR(50),
                    source_type VARCHAR(50),
                    category VARCHAR(100),
                    confidence DECIMAL(5,2) DEFAULT 100.0,
                    src_ip VARCHAR(50),
                    src_port INTEGER,
                    dst_ip VARCHAR(50),
                    dst_port INTEGER,
                    protocol VARCHAR(20),
                    asset_id INTEGER,
                    asset_name VARCHAR(100),
                    hostname VARCHAR(100),
                    affected_assets JSONB DEFAULT '[]'::jsonb,
                    event_ids JSONB DEFAULT '[]'::jsonb,
                    assigned_to INTEGER,
                    raw_log TEXT,
                    parsed_data JSONB DEFAULT '{}'::jsonb,
                    extra_data JSONB DEFAULT '{}'::jsonb,
                    first_seen TIMESTAMPTZ NOT NULL,
                    last_seen TIMESTAMPTZ NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    tags JSONB DEFAULT '[]'::jsonb
                )
            """))
            session.commit()
            print("Alerts table created (without TimescaleDB)")
            return True
        
        # 检查表是否已存在
        result = session.execute(text("""
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'alerts' AND table_schema = 'public'
        """))
        table_exists = result.fetchone() is not None
        
        if not table_exists:
            # 创建 alerts 表
            session.execute(text("""
                CREATE TABLE alerts (
                    id SERIAL PRIMARY KEY,
                    alert_code VARCHAR(20) UNIQUE NOT NULL,
                    title VARCHAR(200) NOT NULL,
                    description TEXT,
                    severity VARCHAR(20) DEFAULT 'medium',
                    status VARCHAR(20) DEFAULT 'new',
                    source VARCHAR(100),
                    source_product VARCHAR(50),
                    source_type VARCHAR(50),
                    category VARCHAR(100),
                    confidence DECIMAL(5,2) DEFAULT 100.0,
                    src_ip VARCHAR(50),
                    src_port INTEGER,
                    dst_ip VARCHAR(50),
                    dst_port INTEGER,
                    protocol VARCHAR(20),
                    asset_id INTEGER,
                    asset_name VARCHAR(100),
                    hostname VARCHAR(100),
                    affected_assets JSONB DEFAULT '[]'::jsonb,
                    event_ids JSONB DEFAULT '[]'::jsonb,
                    assigned_to INTEGER,
                    raw_log TEXT,
                    parsed_data JSONB DEFAULT '{}'::jsonb,
                    extra_data JSONB DEFAULT '{}'::jsonb,
                    first_seen TIMESTAMPTZ NOT NULL,
                    last_seen TIMESTAMPTZ NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    tags JSONB DEFAULT '[]'::jsonb
                )
            """))
            
            # 转换为 hypertable
            session.execute(text("""
                SELECT create_hypertable('alerts', 'first_seen', 
                    if_not_exists => TRUE,
                    migrate_data => TRUE
                )
            """))
            
            # 创建索引
            session.execute(text("CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity)"))
            session.execute(text("CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status)"))
            session.execute(text("CREATE INDEX IF NOT EXISTS idx_alerts_source ON alerts(source)"))
            session.execute(text("CREATE INDEX IF NOT EXISTS idx_alerts_src_ip ON alerts(src_ip)"))
            session.execute(text("CREATE INDEX IF NOT EXISTS idx_alerts_dst_ip ON alerts(dst_ip)"))
            
            # 添加压缩策略 (使用异常处理，因为可能已存在)
            try:
                session.execute(text("""
                    ALTER TABLE alerts SET (
                        timescaledb.compress,
                        timescaledb.compress_segmentby = 'source'
                    )
                """))
                session.execute(text("""
                    SELECT add_compression_policy('alerts', INTERVAL '7 days')
                """))
            except Exception as e:
                print(f"Compression policy already exists or error: {e}")
        else:
            # 表已存在，检查是否是 hypertable
            result = session.execute(text("""
                SELECT 1 FROM timescaledb_information.hypertables 
                WHERE table_name = 'alerts'
            """))
            if not result.fetchone():
                # 不是 hypertable，尝试转换
                try:
                    session.execute(text("""
                        SELECT create_hypertable('alerts', 'first_seen', 
                            if_not_exists => TRUE,
                            migrate_data => TRUE
                        )
                    """))
                except Exception as e:
                    print(f"Could not convert to hypertable: {e}")
        
        session.commit()
        print("Alerts hypertable ready")
        return True
    except Exception as e:
        session.rollback()
        print(f"Error creating alerts hypertable: {e}")
        import traceback
        traceback.print_exc()
        return False


def insert_alert(session, alert_data: dict) -> int:
    """
    插入告警到 TimescaleDB
    
    Args:
        session: 数据库会话
        alert_data: 告警数据字典
    
    Returns:
        插入的记录 ID
    """
    from psycopg2.extras import Json
    
    query = text("""
        INSERT INTO alerts (
            alert_code, title, description, severity, status,
            source, source_product, source_type, category, confidence,
            src_ip, src_port, dst_ip, dst_port, protocol,
            asset_id, asset_name, hostname, affected_assets,
            event_ids, assigned_to, raw_log, parsed_data, extra_data,
            first_seen, last_seen, tags
        ) VALUES (
            :alert_code, :title, :description, :severity, :status,
            :source, :source_product, :source_type, :category, :confidence,
            :src_ip, :src_port, :dst_ip, :dst_port, :protocol,
            :asset_id, :asset_name, :hostname, :affected_assets,
            :event_ids, :assigned_to, :raw_log, :parsed_data, :extra_data,
            :first_seen, :last_seen, :tags
        )
        RETURNING id
    """)
    
    # 使用 psycopg2.extras.Json 处理 JSONB 字段
    params = {
        'alert_code': alert_data.get('alert_code'),
        'title': alert_data.get('title'),
        'description': alert_data.get('description'),
        'severity': alert_data.get('severity', 'medium'),
        'status': alert_data.get('status', 'new'),
        'source': alert_data.get('source'),
        'source_product': alert_data.get('source_product'),
        'source_type': alert_data.get('source_type'),
        'category': alert_data.get('category'),
        'confidence': alert_data.get('confidence', 100.0),
        'src_ip': alert_data.get('src_ip'),
        'src_port': alert_data.get('src_port'),
        'dst_ip': alert_data.get('dst_ip'),
        'dst_port': alert_data.get('dst_port'),
        'protocol': alert_data.get('protocol'),
        'asset_id': alert_data.get('asset_id'),
        'asset_name': alert_data.get('asset_name'),
        'hostname': alert_data.get('hostname'),
        'affected_assets': Json(alert_data.get('affected_assets', [])),
        'event_ids': Json(alert_data.get('event_ids', [])),
        'assigned_to': alert_data.get('assigned_to'),
        'raw_log': alert_data.get('raw_log'),
        'parsed_data': Json(alert_data.get('parsed_data', {})),
        'extra_data': Json(alert_data.get('extra_data', {})),
        'first_seen': alert_data.get('first_seen'),
        'last_seen': alert_data.get('last_seen'),
        'tags': Json(alert_data.get('tags', []))
    }
    
    result = session.execute(query, params)
    
    session.commit()
    return result.scalar()


def update_alert_status(session, alert_id: int, status: str) -> bool:
    """
    更新告警状态
    
    Args:
        session: 数据库会话
        alert_id: 告警 ID
        status: 新状态
    
    Returns:
        是否成功
    """
    query = text("""
        UPDATE alerts 
        SET status = :status, 
            updated_at = NOW(),
            last_seen = GREATEST(last_seen, NOW())
        WHERE id = :id
    """)
    
    result = session.execute(query, {'id': alert_id, 'status': status})
    session.commit()
    return result.rowcount > 0


def query_alerts(session, start_time=None, end_time=None,
                severity=None, status=None, source=None,
                src_ip=None, dst_ip=None,
                search=None, limit: int = 20, offset: int = 0) -> dict:
    """
    查询告警列表
    
    Args:
        session: 数据库会话
        start_time: 开始时间
        end_time: 结束时间
        severity: 严重程度过滤
        status: 状态过滤
        source: 来源过滤
        src_ip: 源 IP 过滤
        dst_ip: 目标 IP 过滤
        search: 搜索关键词
        limit: 返回数量限制
        offset: 偏移量
    
    Returns:
        告警列表和总数
    """
    conditions = []
    params = {'limit': limit, 'offset': offset}
    
    if start_time:
        conditions.append("first_seen >= :start_time")
        params['start_time'] = start_time
    
    if end_time:
        conditions.append("first_seen <= :end_time")
        params['end_time'] = end_time
    
    if severity:
        conditions.append("severity = :severity")
        params['severity'] = severity
    
    if status:
        conditions.append("status = :status")
        params['status'] = status
    
    if source:
        conditions.append("source = :source")
        params['source'] = source
    
    if src_ip:
        conditions.append("src_ip = :src_ip")
        params['src_ip'] = src_ip
    
    if dst_ip:
        conditions.append("dst_ip = :dst_ip")
        params['dst_ip'] = dst_ip
    
    if search:
        conditions.append("(title ILIKE :search OR alert_code ILIKE :search)")
        params['search'] = f'%{search}%'
    
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    # 查询总数
    count_query = text(f"SELECT COUNT(*) FROM alerts WHERE {where_clause}")
    total = session.execute(count_query, params).scalar()
    
    # 查询数据
    data_query = text(f"""
        SELECT * FROM alerts
        WHERE {where_clause}
        ORDER BY first_seen DESC
        LIMIT :limit OFFSET :offset
    """)
    
    result = session.execute(data_query, params)
    
    return {
        'total': total,
        'items': [dict(row._mapping) for row in result],
        'limit': limit,
        'offset': offset
    }


def get_alert_stats(session, start_time=None, end_time=None) -> dict:
    """
    获取告警统计
    
    Args:
        session: 数据库会话
        start_time: 开始时间
        end_time: 结束时间
    
    Returns:
        统计结果字典
    """
    conditions = []
    params = {}
    
    if start_time:
        conditions.append("first_seen >= :start_time")
        params['start_time'] = start_time
    
    if end_time:
        conditions.append("first_seen <= :end_time")
        params['end_time'] = end_time
    
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    # 总数统计
    total_query = text(f"SELECT COUNT(*) FROM alerts WHERE {where_clause}")
    total = session.execute(total_query, params).scalar()
    
    # 按严重程度统计
    severity_query = text(f"""
        SELECT severity, COUNT(*) as count 
        FROM alerts WHERE {where_clause}
        GROUP BY severity
    """)
    severity_result = session.execute(severity_query, params)
    by_severity = {row[0]: row[1] for row in severity_result}
    
    # 按状态统计
    status_query = text(f"""
        SELECT status, COUNT(*) as count 
        FROM alerts WHERE {where_clause}
        GROUP BY status
    """)
    status_result = session.execute(status_query, params)
    by_status = {row[0]: row[1] for row in status_result}
    
    # 按来源统计
    source_query = text(f"""
        SELECT source, COUNT(*) as count 
        FROM alerts WHERE {where_clause}
        GROUP BY source
        ORDER BY count DESC
        LIMIT 10
    """)
    source_result = session.execute(source_query, params)
    by_source = {row[0]: row[1] for row in source_result}
    
    # 今日新增
    today_start = "DATE_TRUNC('day', NOW())"
    today_query = text(f"""
        SELECT COUNT(*) FROM alerts 
        WHERE {where_clause} AND first_seen >= {today_start}
    """)
    today_count = session.execute(today_query, params).scalar()
    
    return {
        'total': total,
        'today_new': today_count,
        'by_severity': by_severity,
        'by_status': by_status,
        'by_source': by_source
    }


def aggregate_alerts(session, alert_ids: list, title: str, 
                     severity: str = None, description: str = None) -> dict:
    """
    聚合告警（用于创建事件前的告警合并）
    
    Args:
        session: 数据库会话
        alert_ids: 告警 ID 列表
        title: 聚合标题
        severity: 严重程度（可自动计算）
        description: 描述
    
    Returns:
        聚合后的告警信息
    """
    if not alert_ids:
        return None
    
    # 查询所有告警 (处理字符串ID转整数)
    try:
        int_ids = [int(i) for i in alert_ids]
    except (ValueError, TypeError):
        int_ids = alert_ids
    query = text("""
        SELECT * FROM alerts 
        WHERE id = ANY(:alert_ids)
    """)
    result = session.execute(query, {'alert_ids': int_ids})
    alerts = [dict(row._mapping) for row in result]
    
    if not alerts:
        return None
    
    # 自动计算最严重的级别
    severity_order = {'critical': 4, 'high': 3, 'medium': 2, 'low': 1}
    if not severity:
        max_severity = max(alerts, key=lambda x: severity_order.get(x.get('severity', 'low'), 0))
        severity = max_severity.get('severity', 'medium')
    
    # 收集所有来源
    sources = list(set([a.get('source') for a in alerts if a.get('source')]))
    
    # 收集所有涉及的 IP
    src_ips = list(set([a.get('src_ip') for a in alerts if a.get('src_ip')]))
    dst_ips = list(set([a.get('dst_ip') for a in alerts if a.get('dst_ip')]))
    
    return {
        'alert_count': len(alerts),
        'title': title,
        'severity': severity,
        'description': description or f"聚合了 {len(alerts)} 条告警",
        'sources': sources,
        'src_ips': src_ips,
        'dst_ips': dst_ips,
        'first_seen': min([a.get('first_seen') for a in alerts if a.get('first_seen')]),
        'last_seen': max([a.get('last_seen') for a in alerts if a.get('last_seen')]),
        'alerts': alerts
    }


def get_alert_trend(session, bucket: str = '1 hour', 
                    start_time=None, end_time=None) -> list:
    """
    获取告警趋势数据
    
    Args:
        session: 数据库会话
        bucket: 时间桶大小
        start_time: 开始时间
        end_time: 结束时间
    
    Returns:
        趋势数据列表
    """
    conditions = []
    params = {'bucket': bucket}
    
    if start_time:
        conditions.append("first_seen >= :start_time")
        params['start_time'] = start_time
    
    if end_time:
        conditions.append("first_seen <= :end_time")
        params['end_time'] = end_time
    
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    query = text(f"""
        SELECT 
            time_bucket(:bucket, first_seen) as bucket,
            severity,
            COUNT(*) as count
        FROM alerts
        WHERE {where_clause}
        GROUP BY bucket, severity
        ORDER BY bucket
    """)
    
    result = session.execute(query, params)
    return [dict(row._mapping) for row in result]
