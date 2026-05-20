"""
Rule Loader - 从数据库加载 Pipeline 配置
"""

import os
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
import threading

logger = logging.getLogger(__name__)


class RuleLoader:
    """规则加载器 - 从数据库加载 Pipeline 配置"""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        
        self._cache: Dict[int, Dict[str, Any]] = {}
        self._cache_lock = threading.RLock()
        self._last_update: Dict[int, datetime] = {}
        
        # 数据库配置
        self._db_config = {
            'host': os.environ.get('POSTGRES_HOST', 'postgres'),
            'port': int(os.environ.get('POSTGRES_PORT', 5432)),
            'database': os.environ.get('POSTGRES_DB', 'usop_security'),
            'user': os.environ.get('POSTGRES_USER', 'usop'),
            'password': os.environ.get('POSTGRES_PASSWORD', 'usop_password')
        }
        
        self._cache_ttl = int(os.environ.get('RULE_CACHE_TTL', 60))  # 缓存60秒
    
    def _get_connection(self):
        """获取数据库连接"""
        return psycopg2.connect(
            **self._db_config,
            cursor_factory=RealDictCursor
        )
    
    def load_pipeline(self, pipeline_id: int, force_refresh: bool = False) -> Optional[Dict[str, Any]]:
        """加载 Pipeline 配置"""
        with self._cache_lock:
            # 检查缓存
            if not force_refresh and pipeline_id in self._cache:
                last_update = self._last_update.get(pipeline_id)
                if last_update:
                    age = (datetime.utcnow() - last_update).total_seconds()
                    if age < self._cache_ttl:
                        logger.debug(f"Pipeline {pipeline_id} from cache")
                        return self._cache[pipeline_id]
            
            # 从数据库加载
            try:
                config = self._load_from_db(pipeline_id)
                if config:
                    self._cache[pipeline_id] = config
                    self._last_update[pipeline_id] = datetime.utcnow()
                    logger.info(f"Pipeline {pipeline_id} loaded from DB")
                return config
            except Exception as e:
                logger.error(f"Failed to load pipeline {pipeline_id}: {e}")
                # 返回缓存数据（如果存在）
                return self._cache.get(pipeline_id)
    
    def _load_from_db(self, pipeline_id: int) -> Optional[Dict[str, Any]]:
        """从数据库加载配置"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            
            # 查询 Pipeline 配置
            cursor.execute("""
                SELECT 
                    id, name, description,
                    log_type_id, format_id, output_table_id,
                    input_format, input_config,
                    field_mapping, filter_rules, transform_rules,
                    output_target, output_config,
                    batch_size, parallel_workers,
                    status, priority
                FROM pipelines 
                WHERE id = %s AND status = 'active'
            """, (pipeline_id,))
            
            row = cursor.fetchone()
            if not row:
                logger.warning(f"Pipeline {pipeline_id} not found or inactive")
                return None
            
            # 转换 PostgreSQL JSON 字段
            pipeline = dict(row)
            for field in ['input_config', 'field_mapping', 'filter_rules', 
                          'transform_rules', 'output_config']:
                if pipeline.get(field) and isinstance(pipeline[field], str):
                    pipeline[field] = json.loads(pipeline[field])
                elif pipeline.get(field) is None:
                    pipeline[field] = {} if field in ['input_config', 'field_mapping', 'output_config'] else []
            
            # 加载关联的配置
            pipeline['log_type'] = self._load_log_type(cursor, pipeline.get('log_type_id'))
            pipeline['format_template'] = self._load_format_template(cursor, pipeline.get('format_id'))
            pipeline['output_table'] = self._load_output_table(cursor, pipeline.get('output_table_id'))
            
            cursor.close()
            return pipeline
            
        finally:
            conn.close()
    
    def _load_log_type(self, cursor, log_type_id: str) -> Optional[Dict]:
        """加载日志类型配置"""
        if not log_type_id:
            return None
        cursor.execute("SELECT * FROM log_types WHERE id = %s", (log_type_id,))
        row = cursor.fetchone()
        return dict(row) if row else None
    
    def _load_format_template(self, cursor, format_id: str) -> Optional[Dict]:
        """加载格式模板"""
        if not format_id:
            return None
        cursor.execute("SELECT * FROM format_templates WHERE id = %s", (format_id,))
        row = cursor.fetchone()
        return dict(row) if row else None
    
    def _load_output_table(self, cursor, table_id: str) -> Optional[Dict]:
        """加载输出表配置"""
        if not table_id:
            return None
        cursor.execute("SELECT * FROM data_tables WHERE id = %s", (table_id,))
        row = cursor.fetchone()
        return dict(row) if row else None
    
    def load_all_active_pipelines(self) -> List[Dict[str, Any]]:
        """加载所有活跃的 Pipeline"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id FROM pipelines WHERE status = 'active'
                ORDER BY priority DESC
            """)
            pipeline_ids = [row['id'] for row in cursor.fetchall()]
            cursor.close()
            
            return [
                self.load_pipeline(pid) 
                for pid in pipeline_ids
                if self.load_pipeline(pid)
            ]
        finally:
            conn.close()
    
    def invalidate_cache(self, pipeline_id: int = None):
        """清除缓存"""
        with self._cache_lock:
            if pipeline_id:
                self._cache.pop(pipeline_id, None)
                self._last_update.pop(pipeline_id, None)
            else:
                self._cache.clear()
                self._last_update.clear()


# 全局实例
rule_loader = RuleLoader()
