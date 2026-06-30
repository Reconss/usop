#!/usr/bin/env python3
"""
ClickHouse 分析引擎 - 复杂分析报表
"""

import os
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
from dataclasses import dataclass
import json

try:
    from clickhouse_driver import Client
except ImportError:
    Client = None

logger = logging.getLogger(__name__)


@dataclass
class ClickHouseConfig:
    host: str = os.getenv('CLICKHOUSE_HOST', 'clickhouse')
    port: int = int(os.getenv('CLICKHOUSE_PORT', '9000'))
    database: str = os.getenv('CLICKHOUSE_DB', 'usop_analytics')
    user: str = os.getenv('CLICKHOUSE_USER', 'default')
    password: str = os.getenv('CLICKHOUSE_PASSWORD', '')


class ClickHouseEngine:
    """ClickHouse 分析引擎"""
    
    def __init__(self, config: ClickHouseConfig):
        self.config = config
        self.client: Optional[Client] = None
    
    def connect(self) -> bool:
        try:
            if Client is None:
                logger.error("clickhouse-driver 未安装: pip install clickhouse-driver")
                return False
            
            self.client = Client(
                host=self.config.host,
                port=self.config.port,
                database=self.config.database,
                user=self.config.user,
                password=self.config.password
            )
            self.client.execute("SELECT 1")
            logger.info(f"ClickHouse 连接成功: {self.config.host}")
            return True
        except Exception as e:
            logger.error(f"ClickHouse 连接失败: {e}")
            return False
    
    def close(self):
        if self.client:
            self.client.disconnect()
    
    # ========== 表结构 ==========
    
    def create_tables(self):
        """创建分析表"""
        # 告警日志表
        self.client.execute("""
            CREATE TABLE IF NOT EXISTS alert_logs (
                time                DateTime64(3),
                source_id           UInt32,
                log_type            String,
                src_ip              IPv4,
                dst_ip              IPv4,
                src_port            UInt16,
                dst_port            UInt16,
                protocol            String,
                hostname            String,
                username            String,
                action              String,
                result              String,
                severity            String,
                category            String,
                raw_log             String,
                details             JSON,
                src_ip_country      String,
                src_ip_city         String,
                src_ip_asn          UInt32
            )
            ENGINE = MergeTree()
            PARTITION BY toYYYYMM(time)
            ORDER BY (log_type, src_ip, time)
            TTL time + INTERVAL 90 DAY
            SETTINGS index_granularity = 8192
        """)
        
        # 聚合表
        self.client.execute("""
            CREATE TABLE IF NOT EXISTS alerts_hourly (
                time                DateTime,
                log_type            String,
                severity            String,
                category            String,
                src_ip              IPv4,
                action              String,
                count               UInt64,
                unique_src_ips      UInt64,
                unique_dst_ips      UInt64
            )
            ENGINE = SummingMergeTree()
            PARTITION BY toYYYYMM(time)
            ORDER BY (log_type, severity, src_ip, time)
        """)
        
        # 资产风险表
        self.client.execute("""
            CREATE TABLE IF NOT EXISTS asset_risk (
                asset_ip            IPv4,
                first_seen          DateTime,
                last_seen           DateTime,
                total_alerts        UInt64,
                high_severity_cnt   UInt64,
                risk_score          Float32,
                risk_level          String,
                updated_at          DateTime DEFAULT now()
            )
            ENGINE = ReplacingMergeTree(updated_at)
            ORDER BY asset_ip
        """)
        
        logger.info("ClickHouse 表创建完成")
    
    # ========== 写入 ==========
    
    def write_logs(self, logs: List[Dict]) -> bool:
        """批量写入"""
        if not self.client or not logs:
            return False
        
        try:
            self.client.execute(
                """INSERT INTO alert_logs (
                    time, source_id, log_type, src_ip, dst_ip,
                    src_port, dst_port, protocol, hostname,
                    username, action, result, severity, category,
                    raw_log, details, src_ip_country, src_ip_city, src_ip_asn
                ) VALUES""",
                [
                    (
                        log.get('time', datetime.utcnow()),
                        log.get('source_id', 0),
                        log.get('log_type', 'unknown'),
                        log.get('src_ip'),
                        log.get('dst_ip'),
                        log.get('src_port', 0),
                        log.get('dst_port', 0),
                        log.get('protocol', ''),
                        log.get('hostname', ''),
                        log.get('username', ''),
                        log.get('action', ''),
                        log.get('result', ''),
                        log.get('severity', 'low'),
                        log.get('category', ''),
                        log.get('raw_log', '')[:10000],
                        json.dumps(log.get('details', {})),
                        log.get('src_ip_country', ''),
                        log.get('src_ip_city', ''),
                        log.get('src_ip_asn', 0)
                    )
                    for log in logs
                ]
            )
            return True
        except Exception as e:
            logger.error(f"写入失败: {e}")
            return False
    
    # ========== 分析查询 ==========
    
    def get_event_trend(self, hours: int = 24) -> Dict:
        query = f"""
            SELECT toStartOfHour(time) as hour, severity, count() as cnt
            FROM alert_logs
            WHERE time >= now() - INTERVAL {hours} HOUR
            GROUP BY hour, severity
            ORDER BY hour
        """
        try:
            result = self.client.execute(query)
            timestamps, data = [], {'critical': [], 'high': [], 'medium': [], 'low': []}
            current_hour, hour_data = None, {}
            for hour, severity, count in result:
                if hour != current_hour:
                    if hour_data:
                        timestamps.append(current_hour.strftime('%H:%M') if current_hour else '')
                        for s in ['critical', 'high', 'medium', 'low']:
                            data[s].append(hour_data.get(s, 0))
                    current_hour, hour_data = hour, {}
                hour_data[severity] = count
            if hour_data:
                timestamps.append(current_hour.strftime('%H:%M') if current_hour else '')
                for s in ['critical', 'high', 'medium', 'low']:
                    data[s].append(hour_data.get(s, 0))
            return {'timestamps': timestamps, **data}
        except Exception as e:
            logger.error(f"查询失败: {e}")
            return {'timestamps': [], 'critical': [], 'high': [], 'medium': [], 'low': []}
    
    def get_event_distribution(self) -> List[Dict]:
        query = """
            SELECT category, count() as value, any(severity) as severity
            FROM alert_logs
            WHERE time >= now() - INTERVAL 24 HOUR AND category != ''
            GROUP BY category ORDER BY value DESC LIMIT 10
        """
        color_map = {'critical': '#EF4444', 'high': '#F97316', 'medium': '#EAB308', 'low': '#3B82F6'}
        try:
            return [{'name': r[0] or '未知', 'value': r[1], 'color': color_map.get(r[2], '#6366F1')} 
                    for r in self.client.execute(query)]
        except:
            return []
    
    def get_top_attack_sources(self, limit: int = 10) -> List[Dict]:
        query = f"""
            SELECT src_ip, src_ip_country, count() as cnt, uniqExact(dst_ip) as targets
            FROM alert_logs
            WHERE time >= now() - INTERVAL 24 HOUR AND src_ip IS NOT NULL
            GROUP BY src_ip, src_ip_country ORDER BY cnt DESC LIMIT {limit}
        """
        try:
            return [{'ip': str(r[0]) if r[0] else '-', 'country': r[1] or '未知', 'count': r[2], 'target_count': r[3]}
                    for r in self.client.execute(query)]
        except:
            return []
    
    def get_asset_risk_ranking(self, limit: int = 20) -> List[Dict]:
        query = f"""
            SELECT dst_ip, count() as total, 
                   countIf(severity='critical' OR severity='high') as high_cnt,
                   uniqExact(action) as unique_actions,
                   (countIf(severity='critical' OR severity='high')*10 + countIf(action IN ('attack','exploit'))*8) as risk_score
            FROM alert_logs
            WHERE time >= now() - INTERVAL 30 DAY AND dst_ip IS NOT NULL
            GROUP BY dst_ip HAVING total >= 10
            ORDER BY risk_score DESC LIMIT {limit}
        """
        try:
            return [{'ip': str(r[0]) if r[0] else '-', 'total_alerts': r[1], 'high_severity_cnt': r[2],
                     'unique_actions': r[3], 'risk_score': r[4]} for r in self.client.execute(query)]
        except:
            return []
    
    def get_dashboard_metrics(self) -> Dict:
        metrics = {}
        queries = {
            'total_alerts_24h': "SELECT count() FROM alert_logs WHERE time >= now() - INTERVAL 24 HOUR",
            'critical_24h': "SELECT count() FROM alert_logs WHERE time >= now() - INTERVAL 24 HOUR AND severity IN ('critical','high')",
            'unique_attackers': "SELECT uniqExact(src_ip) FROM alert_logs WHERE time >= now() - INTERVAL 24 HOUR",
            'unique_targets': "SELECT uniqExact(dst_ip) FROM alert_logs WHERE time >= now() - INTERVAL 24 HOUR",
        }
        for k, q in queries.items():
            try:
                metrics[k] = self.client.execute(q)[0][0]
            except:
                metrics[k] = 0
        return metrics
    
    def get_threat_intel(self) -> Dict:
        query = """
            SELECT src_ip, src_ip_country, count() as cnt, uniqExact(dst_ip) as targets, max(severity) as max_sev
            FROM alert_logs
            WHERE time >= now() - INTERVAL 7 DAY
            GROUP BY src_ip, src_ip_country
            HAVING cnt >= 5
            ORDER BY cnt DESC LIMIT 50
        """
        try:
            results = self.client.execute(query)
            return {
                'total': len(results),
                'high_risk': len([r for r in results if r[4] in ('critical', 'high')]),
                'threats': [{'ip': str(r[0]), 'country': r[1], 'count': r[2], 'targets': r[3], 'severity': r[4]} 
                           for r in results[:20]]
            }
        except:
            return {'total': 0, 'high_risk': 0, 'threats': []}
    
    def execute_query(self, query: str) -> List:
        try:
            return self.client.execute(query)
        except Exception as e:
            logger.error(f"执行失败: {e}")
            return []
