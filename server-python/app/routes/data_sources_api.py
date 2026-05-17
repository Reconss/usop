"""
数据源管理 API 路由 (新版)
- Flink 流处理任务管理（通过 REST API）
- 数据接入（写入 Kafka raw-logs）
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import DataSource, Pipeline, FormatTemplate
import os
import json
import requests
import uuid
from datetime import datetime
import logging
from kafka import KafkaProducer

logger = logging.getLogger(__name__)

data_sources_api_bp = Blueprint('data_sources_api', __name__)

# Flink REST API 配置（支持远程连接）
FLINK_REST_API = os.getenv('FLINK_REST_API', 'http://flink-jobmanager:8081')

# Kafka 配置
KAFKA_BOOTSTRAP_SERVERS = os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'kafka:29092')

# 共享 Flink 作业名称
LOG_PARSER_JOB_NAME = 'Log Parser Job'
ALERT_ENGINE_JOB_NAME = 'Alert Engine Job'


def _check_flink_connection() -> tuple[bool, str]:
    """检查 Flink 连接状态"""
    try:
        resp = requests.get(f"{FLINK_REST_API}/overview", timeout=5)
        if resp.status_code == 200:
            return True, ""
        return False, f"Flink 返回状态码 {resp.status_code}"
    except requests.exceptions.ConnectionError:
        return False, f"无法连接 Flink 集群 ({FLINK_REST_API})，请确认 Flink 服务已启动"
    except requests.exceptions.Timeout:
        return False, f"Flink 连接超时 ({FLINK_REST_API})"
    except Exception as e:
        return False, f"Flink 连接错误: {str(e)}"


def _list_flink_jobs() -> tuple[list, str | None]:
    """获取 Flink 作业列表"""
    try:
        resp = requests.get(f"{FLINK_REST_API}/jobs", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            return data.get('jobs', []), None
        return [], f"Flink 返回状态码 {resp.status_code}"
    except Exception as e:
        logger.error(f"查询 Flink 作业列表失败: {e}")
        return [], str(e)


def _get_flink_job_status(job_id: str) -> tuple[str | None, str | None]:
    """获取 Flink 作业状态"""
    try:
        resp = requests.get(f"{FLINK_REST_API}/jobs/{job_id}", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get('state'), None
        return None, f"Flink 返回状态码 {resp.status_code}"
    except Exception as e:
        logger.error(f"查询 Flink 作业状态失败: {e}")
        return None, str(e)


def _cancel_flink_job(job_id: str) -> tuple[bool, str | None]:
    """取消 Flink 作业"""
    try:
        resp = requests.patch(
            f"{FLINK_REST_API}/jobs/{job_id}?mode=cancel",
            timeout=30
        )
        if resp.status_code in (204, 200):
            return True, None
        return False, f"取消失败，返回状态码 {resp.status_code}"
    except Exception as e:
        logger.error(f"取消 Flink 作业失败: {e}")
        return False, str(e)


def _submit_flink_job(jar_id: str, entry_class: str, args: str = "") -> tuple[str | None, str | None]:
    """提交 Flink 作业（通过 REST API）"""
    try:
        payload = {
            "entryClass": entry_class,
            "programArgs": args,
            "parallelism": 1
        }
        resp = requests.post(
            f"{FLINK_REST_API}/jars/{jar_id}/run",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=60
        )
        if resp.status_code == 200:
            data = resp.json()
            job_id = data.get('jobid')
            if job_id:
                logger.info(f"Flink 作业提交成功，JobID={job_id}")
                return job_id, None
        return None, f"提交失败，返回状态码 {resp.status_code}: {resp.text}"
    except requests.exceptions.Timeout:
        return None, "提交超时 (60s)"
    except Exception as e:
        logger.error(f"提交 Flink 作业失败: {e}")
        return None, str(e)


def _upload_flink_jar(jar_path: str) -> tuple[str | None, str | None]:
    """上传 JAR 文件到 Flink"""
    try:
        with open(jar_path, 'rb') as f:
            resp = requests.post(
                f"{FLINK_REST_API}/jars/upload",
                files={'jarfile': (jar_path, f, 'application/java-archive')},
                timeout=120
            )
        if resp.status_code == 200:
            data = resp.json()
            filename = data.get('filename', '')
            # 提取 jar_id
            jar_id = filename.split('/')[-1] if filename else None
            if jar_id:
                logger.info(f"JAR 上传成功: {jar_id}")
                return jar_id, None
        return None, f"上传失败: {resp.status_code}"
    except FileNotFoundError:
        return None, f"JAR 文件不存在: {jar_path}"
    except Exception as e:
        logger.error(f"上传 JAR 失败: {e}")
        return None, str(e)


@data_sources_api_bp.route('/datasources', methods=['GET'])
@login_required
def list_datasources():
    """获取数据源列表"""
    try:
        # 获取 PostgreSQL 数据源
        sources = DataSource.query.order_by(DataSource.created_at.desc()).all()
        
        # 获取关联的管道信息
        result = []
        for s in sources:
            item = {
                'id': s.id,
                'name': s.name,
                'protocol': s.protocol,
                'host': s.host,
                'port': s.port,
                'status': s.status,
                'created_at': s.created_at.isoformat() if s.created_at else None,
                # 关联配置
                'log_type_id': s.log_type_id,
                'log_type_name': s.log_type_name,
                'pipeline_ids': s.pipeline_ids or [],
                'pipeline_names': s.pipeline_names or [],
                'format_template_id': s.format_template_id,
                'format_template_name': s.format_template_name,
                'storage_table_name': s.storage_table_name,
                'storage_retention_days': s.storage_retention_days,
                # Flink
                'flink_job_status': s.flink_job_status if hasattr(s, 'flink_job_status') else None,
                'flink_job_id': s.flink_job_id if hasattr(s, 'flink_job_id') else None,
            }
            result.append(item)
        
        # 检查 Flink 连接状态
        flink_ok, flink_msg = _check_flink_connection()
        
        return jsonify({
            'success': True,
            'data': {
                'items': result,
                'total': len(result),
                'flink': {
                    'connected': flink_ok,
                    'message': flink_msg or '正常'
                }
            }
        })
    except Exception as e:
        logger.error(f"获取数据源列表失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@data_sources_api_bp.route('/datasources/<int:id>', methods=['GET'])
@login_required
def get_datasource(id):
    """获取单个数据源详情"""
    source = DataSource.query.get_or_404(id)
    return jsonify({
        'success': True,
        'data': {
            'id': source.id,
            'name': source.name,
            'protocol': source.protocol,
            'host': source.host,
            'port': source.port,
            'status': source.status,
            'config': source.config or {},
            'created_at': source.created_at.isoformat() if source.created_at else None,
            # 关联配置
            'log_type_id': source.log_type_id,
            'log_type_name': source.log_type_name,
            'pipeline_ids': source.pipeline_ids or [],
            'pipeline_names': source.pipeline_names or [],
            'format_template_id': source.format_template_id,
            'format_template_name': source.format_template_name,
            'storage_table_name': source.storage_table_name,
            'storage_retention_days': source.storage_retention_days,
        }
    })


@data_sources_api_bp.route('/datasources', methods=['POST'])
@login_required
def create_datasource():
    """创建数据源"""
    data = request.get_json()
    
    # 验证必填字段
    if not data.get('name'):
        return jsonify({'success': False, 'error': '名称不能为空'}), 400
    if not data.get('protocol'):
        return jsonify({'success': False, 'error': '协议类型不能为空'}), 400
    
    source = DataSource(
        name=data['name'],
        protocol=data['protocol'],
        host=data.get('host'),
        port=data.get('port'),
        status=data.get('status', 'inactive'),
        config=data.get('config', {}),
    )
    
    db.session.add(source)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': {
            'id': source.id,
            'name': source.name,
            'protocol': source.protocol,
        },
        'message': '数据源创建成功'
    }), 201


@data_sources_api_bp.route('/datasources/<int:id>', methods=['PUT'])
@login_required
def update_datasource(id):
    """更新数据源"""
    source = DataSource.query.get_or_404(id)
    data = request.get_json()
    
    if 'name' in data:
        source.name = data['name']
    if 'protocol' in data:
        source.protocol = data['protocol']
    if 'host' in data:
        source.host = data['host']
    if 'port' in data:
        source.port = data['port']
    if 'status' in data:
        source.status = data['status']
    if 'config' in data:
        source.config = data['config']
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '数据源更新成功'
    })


@data_sources_api_bp.route('/datasources/<int:id>', methods=['DELETE'])
@login_required
def delete_datasource(id):
    """删除数据源"""
    source = DataSource.query.get_or_404(id)
    
    # 检查是否有关联的管道
    if source.pipeline_ids and len(source.pipeline_ids) > 0:
        return jsonify({
            'success': False,
            'error': f'该数据源已关联 {len(source.pipeline_ids)} 个解析管道，请先删除或迁移'
        }), 400
    
    db.session.delete(source)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': '数据源已删除'
    })


@data_sources_api_bp.route('/datasources/<int:id>/start-flink', methods=['POST'])
@login_required
def start_flink_job(id):
    """启动 Flink 作业"""
    source = DataSource.query.get_or_404(id)
    
    # 检查 Flink 连接
    flink_ok, flink_msg = _check_flink_connection()
    if not flink_ok:
        return jsonify({
            'success': False,
            'error': f'无法连接 Flink 集群: {flink_msg}'
        }), 503
    
    try:
        job_name = f"{source.name} Job"
        
        # 获取作业列表
        jobs, err = _list_flink_jobs()
        if err:
            return jsonify({'success': False, 'error': err}), 500
        
        # 检查作业是否已存在
        existing_job = next((j for j in jobs if j.get('name') == job_name and j.get('state') != 'CANCELED'), None)
        if existing_job:
            return jsonify({
                'success': False,
                'error': f'作业已存在 (JobID={existing_job["id"]})，状态: {existing_job.get("state")}'
            }), 400
        
        # 提交作业
        # 注意：这里需要实际的 JAR 文件和入口类
        # 示例中使用占位符，实际使用时替换为真实的 JAR 路径和类名
        jar_path = f"/opt/flink/examples/streaming/LogParserJob.jar"
        entry_class = "com.usop.LogParserJob"
        
        jar_id, err = _upload_flink_jar(jar_path) if jar_path else None, None
        if err:
            return jsonify({'success': False, 'error': f'JOB 上传失败: {err}'}), 500
        
        if jar_id:
            job_id, err = _submit_flink_job(jar_id, entry_class, f"--source-id={source.id}")
        else:
            job_id, err = None, "JOB 文件未配置或上传失败"
        
        if job_id:
            source.flink_job_id = job_id
            source.flink_job_status = 'running'
            db.session.commit()
            
            return jsonify({
                'success': True,
                'data': {
                    'flink_job_id': job_id,
                    'flink_job_status': 'running'
                },
                'message': f'作业已启动 (JobID={job_id})'
            })
        else:
            return jsonify({
                'success': False,
                'error': err or '提交失败'
            }), 500
            
    except Exception as e:
        logger.error(f"启动 Flink 作业失败: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@data_sources_api_bp.route('/datasources/<int:id>/stop-flink', methods=['POST'])
@login_required
def stop_flink_job(id):
    """停止 Flink 作业"""
    source = DataSource.query.get_or_404(id)
    
    if not source.flink_job_id:
        return jsonify({'success': False, 'error': '该数据源没有关联的 Flink 作业'}), 400
    
    success, err = _cancel_flink_job(source.flink_job_id)
    
    if success:
        source.flink_job_status = 'stopped'
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'作业已停止 (JobID={source.flink_job_id})'
        })
    else:
        return jsonify({'success': False, 'error': err or '停止失败'}), 500


@data_sources_api_bp.route('/flink/status', methods=['GET'])
@login_required
def get_flink_status():
    """获取 Flink 集群状态"""
    flink_ok, flink_msg = _check_flink_connection()
    
    if not flink_ok:
        return jsonify({
            'success': True,
            'data': {
                'connected': False,
                'message': flink_msg,
                'jobs': []
            }
        })
    
    try:
        # 获取作业列表
        jobs, err = _list_flink_jobs()
        
        return jsonify({
            'success': True,
            'data': {
                'connected': True,
                'message': '正常',
                'jobs': [{
                    'id': j.get('id'),
                    'name': j.get('name'),
                    'state': j.get('state'),
                    'start_time': j.get('start_time'),
                } for j in jobs] if jobs else []
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@data_sources_api_bp.route('/flink/jobs/<job_id>', methods=['DELETE'])
@login_required
def cancel_flink_job(job_id):
    """取消 Flink 作业"""
    success, err = _cancel_flink_job(job_id)
    
    if success:
        return jsonify({
            'success': True,
            'message': f'作业已取消 (JobID={job_id})'
        })
    else:
        return jsonify({'success': False, 'error': err or '取消失败'}), 500


# Kafka 生产者
_producer = None

def get_kafka_producer():
    global _producer
    if _producer is None:
        try:
            _producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v).encode('utf-8'),
            )
        except Exception as e:
            logger.error(f"Kafka Producer 初始化失败: {e}")
    return _producer


@data_sources_api_bp.route('/datasources/<int:id>/test', methods=['POST'])
@login_required
def test_datasource(id):
    """测试数据源连接"""
    source = DataSource.query.get_or_404(id)
    
    try:
        if source.protocol == 'kafka':
            # 测试 Kafka 连接
            from kafka import KafkaProducer
            from kafka.errors import KafkaError
            producer = KafkaProducer(
                bootstrap_servers=f"{source.host}:{source.port}" if source.host else KAFKA_BOOTSTRAP_SERVERS,
                timeout=5,
            )
            producer.close()
            return jsonify({
                'success': True,
                'message': 'Kafka 连接测试成功'
            })
        elif source.protocol == 'http':
            # 测试 HTTP 连接
            resp = requests.get(f"http://{source.host}:{source.port}", timeout=5)
            return jsonify({
                'success': True,
                'message': f'HTTP 连接成功 (状态码: {resp.status_code})'
            })
        else:
            return jsonify({
                'success': True,
                'message': f'协议 {source.protocol} 连接测试通过'
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'连接测试失败: {str(e)}'
        }), 400


@data_sources_api_bp.route('/datasources/<int:id>/send-test', methods=['POST'])
@login_required
def send_test_message(id):
    """发送测试消息到数据源"""
    source = DataSource.query.get_or_404(id)
    data = request.get_json() or {}
    
    try:
        producer = get_kafka_producer()
        if not producer:
            return jsonify({
                'success': False,
                'error': 'Kafka Producer 未初始化'
            }), 500
        
        # 构造测试消息
        test_message = {
            'source_id': source.id,
            'source_name': source.name,
            'protocol': source.protocol,
            'timestamp': datetime.utcnow().isoformat(),
            'test': True,
            'data': data.get('data', {'message': 'test'})
        }
        
        # 发送到 raw-logs topic
        topic = data.get('topic', 'raw-logs')
        future = producer.send(topic, value=test_message)
        producer.flush()
        
        return jsonify({
            'success': True,
            'message': f'测试消息已发送到 topic: {topic}',
            'data': {
                'topic': topic,
                'message': test_message
            }
        })
    except Exception as e:
        logger.error(f"发送测试消息失败: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@data_sources_api_bp.route('/datasources/<int:id>/mapping', methods=['POST'])
@login_required
def save_datasource_mapping(id):
    """保存数据源的关联配置（日志类型、解析管道、存储表等）"""
    data_source = DataSource.query.get_or_404(id)
    data = request.get_json()
    
    try:
        # 更新日志类型关联
        if 'logTypeId' in data:
            data_source.log_type_id = data['logTypeId']
        if 'logTypeName' in data:
            data_source.log_type_name = data['logTypeName']
        
        # 更新解析管道关联
        if 'pipelineIds' in data:
            data_source.pipeline_ids = data['pipelineIds']
        if 'pipelineNames' in data:
            data_source.pipeline_names = data['pipelineNames']
        
        # 更新格式模板关联
        if 'formatTemplateId' in data:
            data_source.format_template_id = data['formatTemplateId']
        if 'formatTemplateName' in data:
            data_source.format_template_name = data['formatTemplateName']
        
        # 更新存储配置
        if 'storageTableName' in data:
            data_source.storage_table_name = data['storageTableName']
        if 'storageRetentionDays' in data:
            data_source.storage_retention_days = data['storageRetentionDays']
        if 'storagePartition' in data:
            data_source.storage_partition = data['storagePartition']
        if 'storageCompression' in data:
            data_source.storage_compression = data['storageCompression']
        if 'storageIndexes' in data:
            data_source.storage_indexes = data['storageIndexes']
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': '关联配置保存成功',
            'data': {
                'id': data_source.id,
                'log_type_id': data_source.log_type_id,
                'pipeline_ids': data_source.pipeline_ids,
                'storage_table_name': data_source.storage_table_name,
            }
        })
    except Exception as e:
        db.session.rollback()
        logger.error(f"保存关联配置失败: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
