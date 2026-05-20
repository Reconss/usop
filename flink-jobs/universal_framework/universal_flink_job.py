#!/usr/bin/env python3
"""
Universal Flink Job - 通用 Flink 处置框架

根据 Pipeline 配置动态执行日志解析、过滤、转换和存储

Usage:
    python universal_flink_job.py --pipeline-id 1
    python universal_flink_job.py --config-file config.json
    python universal_flink_job.py --job-name "nginx-parser"
"""

import os
import sys
import json
import logging
import argparse
from typing import Dict, Any, Optional
from datetime import datetime

# 添加当前目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.rule_loader import RuleLoader, rule_loader
from parsers import get_parser
from processors import FilterProcessor, TransformProcessor
from connectors import KafkaSourceConnector, KafkaSinkConnector, TimescaleDBSinkConnector

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class UniversalFlinkJob:
    """通用 Flink 作业"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.pipeline_id = config.get('pipeline_id')
        self.job_name = config.get('job_name', f'flink-pipeline-{self.pipeline_id}')
        
        # 组件
        self.parser = None
        self.filter_processor = None
        self.transform_processor = None
        self.source_connector = None
        self.sink_connectors = []
        
        # 初始化
        self._init_components()
    
    def _init_components(self):
        """初始化组件"""
        # 加载 Pipeline 配置
        pipeline_config = rule_loader.load_pipeline(self.pipeline_id)
        if not pipeline_config:
            raise ValueError(f"Pipeline {self.pipeline_id} not found or inactive")
        
        self.pipeline_config = pipeline_config
        logger.info(f"Loaded pipeline: {pipeline_config.get('name')}")
        
        # 1. 初始化解析器
        self._init_parser(pipeline_config)
        
        # 2. 初始化过滤器
        self._init_filter(pipeline_config)
        
        # 3. 初始化转换器
        self._init_transform(pipeline_config)
        
        # 4. 初始化 Source
        self._init_source(pipeline_config)
        
        # 5. 初始化 Sink
        self._init_sinks(pipeline_config)
    
    def _init_parser(self, config: Dict[str, Any]):
        """初始化解析器"""
        input_format = config.get('input_format', 'json')
        input_config = config.get('input_config', {})
        
        # 如果有格式模板，使用模板配置
        format_template = config.get('format_template')
        if format_template:
            input_format = format_template.get('format_type', input_format)
            template_config = format_template.get('config', {})
            input_config = {**input_config, **template_config}
        
        self.parser = get_parser(input_format, input_config)
        logger.info(f"Parser initialized: {input_format}")
    
    def _init_filter(self, config: Dict[str, Any]):
        """初始化过滤器"""
        filter_rules = config.get('filter_rules', [])
        if filter_rules:
            self.filter_processor = FilterProcessor(filter_rules)
            logger.info(f"Filter initialized with {len(filter_rules)} rules")
        else:
            logger.info("No filter rules configured")
    
    def _init_transform(self, config: Dict[str, Any]):
        """初始化转换器"""
        field_mapping = config.get('field_mapping', {})
        transform_rules = config.get('transform_rules', [])
        
        self.transform_processor = TransformProcessor(field_mapping, transform_rules)
        logger.info(f"Transform initialized: {len(field_mapping)} mappings, {len(transform_rules)} rules")
    
    def _init_source(self, config: Dict[str, Any]):
        """初始化 Source"""
        source_config = config.get('input_config', {}).get('source', {})
        
        # 默认 Kafka Source
        if not source_config:
            source_config = {
                'type': 'kafka',
                'topic': f'raw-{config.get("log_type_id", "logs")}',
                'bootstrap_servers': os.environ.get('KAFKA_BOOTSTRAP_SERVERS', 'kafka:29092'),
                'group_id': f'flink-{self.pipeline_id}'
            }
        
        if source_config.get('type') == 'kafka':
            self.source_connector = KafkaSourceConnector(source_config)
            logger.info(f"Source initialized: Kafka topic={source_config.get('topic')}")
    
    def _init_sinks(self, config: Dict[str, Any]):
        """初始化 Sink"""
        output_target = config.get('output_target', 'timescaledb')
        output_config = config.get('output_config', {})
        
        # TimescaleDB Sink
        if output_target == 'timescaledb' or output_target == 'alerts':
            ts_config = {
                'host': os.environ.get('TIMESCALE_HOST', 'timescale'),
                'port': int(os.environ.get('TIMESCALE_PORT', 5432)),
                'database': os.environ.get('TIMESCALE_DB', 'postgres'),
                'user': os.environ.get('TIMESCALE_USER', 'postgres'),
                'password': os.environ.get('TIMESCALE_PASSWORD', 'postgres'),
                'table_name': output_config.get('table_name', 'alerts'),
                'time_column': output_config.get('time_column', 'time'),
            }
            self.sink_connectors.append(TimescaleDBSinkConnector(ts_config))
            logger.info(f"TimescaleDB Sink initialized: table={ts_config['table_name']}")
        
        # Kafka Sink (用于下游处理)
        kafka_output = output_config.get('kafka')
        if kafka_output:
            self.sink_connectors.append(KafkaSinkConnector(kafka_output))
            logger.info(f"Kafka Sink initialized: topic={kafka_output.get('topic')}")
    
    def process_log(self, raw_log: str) -> Optional[Dict[str, Any]]:
        """处理单条日志"""
        try:
            # 1. 解析
            parse_result = self.parser.parse(raw_log)
            if not parse_result.success:
                logger.warning(f"Parse failed: {parse_result.error}")
                return None
            
            data = parse_result.data
            
            # 2. 过滤
            if self.filter_processor:
                filtered = self.filter_processor.process(data)
                if filtered is None:
                    return None
                data = filtered
            
            # 3. 转换
            if self.transform_processor:
                data = self.transform_processor.transform(data)
            
            # 4. 添加元数据
            data['pipeline_id'] = self.pipeline_id
            data['processed_at'] = datetime.utcnow().isoformat()
            
            return data
            
        except Exception as e:
            logger.error(f"Process error: {e}")
            return None
    
    def get_flink_sql(self) -> str:
        """生成 Flink SQL 语句"""
        sql_parts = []
        
        # Source
        if self.source_connector:
            sql_parts.append(self.source_connector.to_flink_config())
        
        # Sink
        for sink in self.sink_connectors:
            sql_parts.append(sink.to_flink_config())
        
        # 处理逻辑 SQL
        sql_parts.append(f"""
-- Pipeline: {self.pipeline_config.get('name')}
-- Job: {self.job_name}

INSERT INTO sink_{self.sink_connectors[0].table_name if self.sink_connectors else 'output'}
SELECT 
    *,
    CURRENT_TIMESTAMP as {self.sink_connectors[0].time_column if self.sink_connectors else 'time'}
FROM source_{self.source_connector.topic if self.source_connector else 'logs'}
""")
        
        return '\n\n'.join(sql_parts)


def load_config_from_file(config_file: str) -> Dict[str, Any]:
    """从文件加载配置"""
    with open(config_file, 'r') as f:
        return json.load(f)


def main():
    parser = argparse.ArgumentParser(
        description='Universal Flink Job - 通用 Flink 处置框架'
    )
    
    # 方式1: 指定 Pipeline ID
    parser.add_argument('--pipeline-id', type=int, 
                        help='Pipeline ID in database')
    
    # 方式2: 指定配置文件
    parser.add_argument('--config-file', type=str,
                        help='Path to configuration file')
    
    # 通用参数
    parser.add_argument('--job-name', type=str,
                        help='Flink job name')
    parser.add_argument('--flink-rest-url', type=str,
                        default=os.environ.get('FLINK_REST_URL', 'http://flink:8081'),
                        help='Flink REST API URL')
    parser.add_argument('--parallelism', type=int,
                        default=int(os.environ.get('JOB_PARALLELISM', '1')),
                        help='Job parallelism')
    parser.add_argument('--dry-run', action='store_true',
                        help='Dry run: only print Flink SQL')
    parser.add_argument('--debug', action='store_true',
                        help='Enable debug logging')
    
    args = parser.parse_args()
    
    # 调试模式
    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # 加载配置
    config = {}
    
    if args.pipeline_id:
        config['pipeline_id'] = args.pipeline_id
    elif args.config_file:
        config = load_config_from_file(args.config_file)
    else:
        parser.error('Either --pipeline-id or --config-file must be specified')
    
    if args.job_name:
        config['job_name'] = args.job_name
    
    # 创建作业
    try:
        job = UniversalFlinkJob(config)
        
        if args.dry_run:
            # 仅打印 SQL
            print("=" * 60)
            print("Flink SQL:")
            print("=" * 60)
            print(job.get_flink_sql())
        else:
            # 执行作业
            logger.info(f"Starting Flink Job: {job.job_name}")
            # TODO: 实际提交到 Flink 集群
            logger.info("Job execution not implemented in this demo")
            
    except Exception as e:
        logger.error(f"Job initialization failed: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
