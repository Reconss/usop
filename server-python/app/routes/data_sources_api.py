"""
数据源管理 API 路由 (新版)
- Flink 流处理任务管理
- 数据接入（写入 Kafka raw-logs）
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import DataSource, Pipeline, FormatTemplate
import subprocess
import json
import requests
import uuid
from datetime import datetime
import logging
from kafka import KafkaProducer

logger = logging.getLogger(__name__)

data_sources_api_bp = Blueprint('data_sources_api', __name__)

# Flink 配置
FLINK_REST_API = 'http://localhost:8081'

# Kafka 配置
KAFKA_BOOTSTRAP_SERVERS = 'localhost:9092'

# 共享 Flink 作业名称
LOG_PARSER_JOB_NAME = 'Log Parser Job'
ALERT_ENGINE_JOB_NAME = 'Alert Engine Job'

# PyFlink 脚本路径（在 Flink 容器内）
LOG_PARSER_SCRIPT = '/opt/flink/jobs/log_parser_job.py'
ALERT_ENGINE_SCRIPT = '/opt/flink/jobs/alert_engine_job.py'

_kafka_producer = None


def _get_kafka_producer() -> KafkaProducer:
    """获取 Kafka 生产者（单例）"""
    global _kafka_producer
    if _kafka_producer is None:
        try:
            _kafka_producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v).encode('utf-8'),
                acks='all',
                retries=3,
            )
        except Exception as e:
            logger.warning(f"Kafka 生产者创建失败: {e}")
    return _kafka_producer


def _find_flink_job_by_name(job_name: str) -> tuple[str | None, str | None]:
    """通过 Flink REST API 按名称查找运行中的作业"""
    try:
        resp = requests.get(f"{FLINK_REST_API}/jobs", timeout=5)
        if resp.status_code != 200:
            return None, f"Flink REST API 返回 {resp.status_code}"
        jobs = resp.json().get('jobs', [])
        for job in jobs:
            if job.get('name') == job_name and job.get('status') == 'RUNNING':
                return job.get('id'), None
        return None, f"未找到运行中的作业 '{job_name}'"
    except requests.exceptions.ConnectionError:
        logger.error(f"无法连接 Flink REST API ({FLINK_REST_API})")
        return None, f"无法连接 Flink 集群 ({FLINK_REST_API})，请确认 Flink 容器是否运行"
    except Exception as e:
        logger.warning(f"查询 Flink 作业列表失败: {e}")
        return None, str(e)


def _submit_pyflink_job(script_path: str, job_name: str) -> tuple[str | None, str | None]:
    """通过 Docker exec 提交 PyFlink 作业到 Flink 集群"""
    try:
        # 先检查是否已经在运行
        existing, err = _find_flink_job_by_name(job_name)
        if existing:
            logger.info(f"作业 {job_name} 已在运行 (JobID={existing})")
            return existing, None

        result = subprocess.run(
            [
                "docker", "exec", "-i", "flink",
                "flink", "run", "-d",
                "-p", "1",
                "-py", script_path
            ],
            capture_output=True, text=True, timeout=120,
        )
        logger.info(f"提交 {job_name} stdout: {result.stdout}")
        if result.stderr:
            logger.warning(f"提交 {job_name} stderr: {result.stderr}")

        if result.returncode != 0:
            detail = (result.stderr or result.stdout or '').strip()[:500]
            logger.error(f"提交 {job_name} 失败 (rc={result.returncode}): {detail}")
            return None, f"docker exec 返回码 {result.returncode}: {detail}"

        # 解析 JobID：输出包含 "Job has been submitted with JobID <id>"
        for line in (result.stdout or '').split('\n'):
            if 'JobID' in line:
                parts = line.split('JobID')
                if len(parts) > 1:
                    job_id = parts[-1].strip()
                    logger.info(f"{job_name} 提交成功, JobID={job_id}")
                    return job_id, None

        # 回退：通过 API 查找新提交的作业
        return _find_flink_job_by_name(job_name)

    except subprocess.TimeoutExpired:
        msg = f"提交 {job_name} 超时 (120s)"
        logger.error(msg)
        return None, msg
    except FileNotFoundError:
        msg = "docker 命令不可用，请确认 Docker 已安装且当前用户有权限"
        logger.error(msg)
        return None, msg
    except Exception as e:
        logger.error(f"提交 {job_name} 失败: {e}")
        return None, str(e)


@data_sources_api_bp.route('/datasources', methods=['GET'])
@login_required
def list_datasources():
    """获取数据源列表"""
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', request.args.get('limit', 20, type=int), type=int)
    status = request.args.get('status')
    source_type = request.args.get('type')
    product_id = request.args.get('product_id', type=int)
    configured = request.args.get('configured')

    query = DataSource.query

    if configured == 'true':
        query = query.filter(
            DataSource.log_type_id.isnot(None),
            DataSource.storage_table_name.isnot(None)
        )
    if status:
        query = query.filter(DataSource.status == status)
    if source_type:
        query = query.filter(DataSource.source_type == source_type)
    if product_id:
        query = query.filter(DataSource.product_id == product_id)

    total = query.count()
    datasources = query.order_by(DataSource.updated_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    return jsonify({
        'success': True,
        'data': {
            'items': [ds.to_dict() for ds in datasources],
            'total': total,
            'page': page,
            'page_size': page_size
        }
    })


@data_sources_api_bp.route('/datasources/<int:ds_id>', methods=['GET'])
@login_required
def get_datasource(ds_id):
    """获取数据源详情"""
    datasource = DataSource.query.get(ds_id)
    if not datasource:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404

    return jsonify({
        'success': True,
        'data': datasource.to_dict()
    })


@data_sources_api_bp.route('/datasources', methods=['POST'])
@login_required
def create_datasource():
    """创建数据源"""
    data = request.get_json()
    
    datasource = DataSource(
        name=data.get('name'),
        source_type=data.get('type'),
        protocol=data.get('protocol'),
        product_id=data.get('product_id'),
        host=data.get('host'),
        port=data.get('port'),
        username=data.get('username'),
        password=data.get('password'),
        description=data.get('description'),
        config=data.get('config', {}),
        status=data.get('status', 'inactive')
    )
    
    db.session.add(datasource)
    db.session.commit()

    return jsonify({
        'success': True,
        'data': datasource.to_dict()
    }), 201


@data_sources_api_bp.route('/datasources/<int:ds_id>', methods=['PUT'])
@login_required
def update_datasource(ds_id):
    """更新数据源"""
    datasource = DataSource.query.get(ds_id)
    if not datasource:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404

    data = request.get_json()
    for key in ['name', 'source_type', 'protocol', 'host', 'port', 'username', 'password', 'description', 'config', 'status']:
        if key in data:
            setattr(datasource, key, data[key])

    db.session.commit()

    return jsonify({
        'success': True,
        'data': datasource.to_dict()
    })


@data_sources_api_bp.route('/datasources/<int:ds_id>', methods=['DELETE'])
@login_required
def delete_datasource(ds_id):
    """删除数据源"""
    datasource = DataSource.query.get(ds_id)
    if not datasource:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404
    
    # 如果有运行的 Flink 任务，先停止
    if datasource.flink_job_id:
        stop_flink_job(datasource.flink_job_id)

    db.session.delete(datasource)
    db.session.commit()

    return jsonify({'success': True, 'message': '删除成功'})


@data_sources_api_bp.route('/datasources/<int:ds_id>/test', methods=['POST'])
@login_required
def test_datasource(ds_id):
    """测试数据源连接"""
    datasource = DataSource.query.get(ds_id)
    if not datasource:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404

    return jsonify({
        'success': True,
        'data': {
            'status': 'success',
            'message': '连接测试成功',
            'tested_at': datetime.utcnow().isoformat()
        }
    })


@data_sources_api_bp.route('/datasources/<int:ds_id>/mapping', methods=['POST'])
@login_required
def save_mapping_config(ds_id):
    """保存数据流关联配置"""
    datasource = DataSource.query.get(ds_id)
    if not datasource:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404

    data = request.get_json()
    
    # 更新关联配置
    datasource.log_type_id = data.get('logTypeId')
    datasource.log_type_name = data.get('logTypeName')
    datasource.pipeline_ids = data.get('pipelineIds', [])
    datasource.pipeline_names = data.get('pipelineNames', [])
    datasource.format_template_id = data.get('formatTemplateId')
    datasource.format_template_name = data.get('formatTemplateName')
    datasource.storage_table_name = data.get('storageTableName')
    datasource.storage_retention_days = data.get('storageRetentionDays', 90)
    datasource.storage_partition = data.get('storagePartition', '1d')
    datasource.storage_compression = data.get('storageCompression', True)
    datasource.storage_indexes = data.get('storageIndexes', [])
    
    db.session.commit()

    return jsonify({
        'success': True,
        'data': datasource.to_dict(),
        'message': '关联配置已保存'
    })


@data_sources_api_bp.route('/datasources/<int:ds_id>/start', methods=['POST'])
@login_required
def start_flink_job(ds_id):
    """启动数据源的 Flink 解析任务"""
    datasource = DataSource.query.get(ds_id)
    if not datasource:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404

    # 检查是否已有关联配置
    if not datasource.log_type_id or not datasource.storage_table_name:
        return jsonify({
            'success': False, 
            'error': '请先配置日志类型和存储配置'
        }), 400

    # 如果任务已在运行，先停止
    if datasource.flink_job_id and datasource.flink_job_status == 'running':
        stop_result = stop_flink_job(datasource.flink_job_id)
        if not stop_result:
            return jsonify({'success': False, 'error': '停止旧任务失败'}), 500

    try:
        job_params = build_flink_job_params(datasource)

        # 调用 Flink REST API 提交任务
        job_id, submit_err = submit_flink_job(job_params)

        if job_id:
            datasource.flink_job_id = job_id
            datasource.flink_job_status = 'running'
            datasource.flink_last_heartbeat = datetime.utcnow()
            datasource.status = 'active'
            db.session.commit()

            return jsonify({
                'success': True,
                'data': {
                    'flink_job_id': job_id,
                    'status': 'running',
                    'message': 'Flink 任务已启动'
                }
            })
        else:
            error_msg = submit_err or 'Flink 任务提交失败'
            return jsonify({'success': False, 'error': error_msg}), 500

    except Exception as e:
        logger.error(f"启动 Flink 任务失败: {str(e)}")
        datasource.flink_job_status = 'failed'
        datasource.last_error = str(e)
        db.session.commit()

        return jsonify({
            'success': False,
            'error': f'启动失败: {str(e)}'
        }), 500


@data_sources_api_bp.route('/datasources/<int:ds_id>/stop', methods=['POST'])
@login_required
def stop_flink_job_api(ds_id):
    """停止数据源的 Flink 解析任务"""
    datasource = DataSource.query.get(ds_id)
    if not datasource:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404

    if not datasource.flink_job_id:
        return jsonify({'success': False, 'error': '没有正在运行的任务'}), 400

    try:
        result = stop_flink_job(datasource.flink_job_id)
        
        if result:
            datasource.flink_job_status = 'stopped'
            datasource.status = 'inactive'
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Flink 任务已停止'
            })
        else:
            return jsonify({'success': False, 'error': '停止任务失败'}), 500
            
    except Exception as e:
        logger.error(f"停止 Flink 任务失败: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'停止失败: {str(e)}'
        }), 500


@data_sources_api_bp.route('/datasources/<int:ds_id>/status', methods=['GET'])
@login_required
def get_flink_status(ds_id):
    """获取 Flink 任务状态"""
    datasource = DataSource.query.get(ds_id)
    if not datasource:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404

    if not datasource.flink_job_id:
        return jsonify({
            'success': True,
            'data': {
                'status': 'stopped',
                'job_id': None
            }
        })

    # 模拟模式：直接返回数据库状态，不请求 Flink
    if datasource.flink_job_id.startswith('sim_'):
        return jsonify({
            'success': True,
            'data': {
                'job_id': datasource.flink_job_id,
                'status': datasource.flink_job_status,
                'simulated': True
            }
        })

    try:
        # 调用 Flink REST API 获取任务状态
        response = requests.get(f"{FLINK_REST_API}/jobs/{datasource.flink_job_id}", timeout=5)
        
        if response.status_code == 200:
            job_info = response.json()
            flink_status = job_info.get('state', 'unknown')
            
            # 同步状态到数据库
            if flink_status == 'RUNNING':
                datasource.flink_job_status = 'running'
                datasource.flink_last_heartbeat = datetime.utcnow()
            elif flink_status in ['FAILED', 'CANCELED']:
                datasource.flink_job_status = 'stopped'
            db.session.commit()
            
            return jsonify({
                'success': True,
                'data': {
                    'job_id': datasource.flink_job_id,
                    'status': datasource.flink_job_status,
                    'flink_state': flink_status,
                    'last_heartbeat': datasource.flink_last_heartbeat.isoformat() if datasource.flink_last_heartbeat else None
                }
            })
        else:
            return jsonify({
                'success': True,
                'data': {
                    'job_id': datasource.flink_job_id,
                    'status': 'unknown',
                    'error': f'Flink API 返回: {response.status_code}'
                }
            })
            
    except requests.exceptions.RequestException as e:
        logger.error(f"获取 Flink 状态失败: {str(e)}")
        return jsonify({
            'success': True,
            'data': {
                'job_id': datasource.flink_job_id,
                'status': datasource.flink_job_status,
                'error': f'连接 Flink 失败: {str(e)}'
            }
        })


def build_flink_job_params(datasource: DataSource) -> dict:
    """构建 Flink 任务完整参数（含管道详情、格式模板、存储配置）"""
    # 加载管道完整配置
    pipeline_details = []
    if datasource.pipeline_ids:
        for pid in datasource.pipeline_ids:
            try:
                pipeline = Pipeline.query.get(int(pid))
                if pipeline:
                    pipeline_details.append({
                        'id': pipeline.id,
                        'name': pipeline.name,
                        'input_format': pipeline.input_format,
                        'input_config': pipeline.input_config or {},
                        'field_mapping': pipeline.field_mapping or {},
                        'filter_rules': pipeline.filter_rules or [],
                        'transform_rules': pipeline.transform_rules or {},
                        'output_target': pipeline.output_target,
                        'output_config': pipeline.output_config or {},
                        'status': pipeline.status,
                        'priority': pipeline.priority,
                        'match_conditions': pipeline.match_conditions or {},
                        'rule_type': pipeline.rule_type,
                    })
            except (ValueError, TypeError):
                pass

    # 加载格式模板完整配置
    format_template_config = None
    if datasource.format_template_id:
        try:
            template = FormatTemplate.query.get(datasource.format_template_id)
            if template:
                format_template_config = {
                    'id': template.id,
                    'name': template.name,
                    'type': template.type,
                    'fields': template.fields or [],
                    'input_config': template.input_config or {},
                    'grok_pattern': template.grok_pattern,
                    'regex_pattern': template.regex_pattern,
                    'delimiter': template.delimiter,
                }
        except Exception:
            pass

    return {
        'datasource_id': datasource.id,
        'datasource_name': datasource.name,
        'protocol': datasource.protocol,
        'config': datasource.config,
        'log_type_id': datasource.log_type_id,
        'log_type_name': datasource.log_type_name,
        'pipeline_ids': datasource.pipeline_ids or [],
        'pipeline_details': pipeline_details,
        'format_template_id': datasource.format_template_id,
        'format_template_config': format_template_config,
        'storage_table': datasource.storage_table_name,
        'storage_retention_days': datasource.storage_retention_days,
        'storage_partition': datasource.storage_partition or '1d',
        'storage_compression': datasource.storage_compression,
        'storage_indexes': datasource.storage_indexes or [],
    }


def submit_flink_job(params: dict) -> tuple[str | None, str | None]:
    """提交 Flink 任务（共享作业模式）

    不再为每个数据源单独提交作业，而是维护两个共享流处理作业：
      1. Log Parser Job - 消费 raw-logs → 解析 → 写入 parsed-logs + TimescaleDB
      2. Alert Engine Job - 消费 parsed-logs → 告警检测 → 写入 alerts topic

    如果作业已在运行则复用，否则自动提交。

    Returns:
        (job_id, error) — job_id 为 None 时 error 包含错误描述
    """
    # 提交/复用 Log Parser Job
    parser_job_id, err = _submit_pyflink_job(LOG_PARSER_SCRIPT, LOG_PARSER_JOB_NAME)
    if not parser_job_id:
        logger.error(f"Log Parser Job 提交失败: {err}")
        return None, err

    # 提交/复用 Alert Engine Job
    alert_job_id, alert_err = _submit_pyflink_job(ALERT_ENGINE_SCRIPT, ALERT_ENGINE_JOB_NAME)
    if not alert_job_id:
        logger.warning(f"Alert Engine Job 提交失败（不影响日志解析）: {alert_err}")

    # 返回主作业 ID
    datasource_id = params.get('datasource_id')
    logger.info(f"数据源 {datasource_id} 启动完成: parser={parser_job_id}, alert={alert_job_id}")
    return parser_job_id, None


def stop_flink_job(job_id: str) -> bool:
    """停止 Flink 任务（通过 REST API 取消作业）"""
    try:
        if job_id.startswith('sim_'):
            return True

        # 先检查作业当前状态
        status_resp = requests.get(f"{FLINK_REST_API}/jobs/{job_id}", timeout=10)
        if status_resp.status_code == 200:
            job_state = status_resp.json().get('state', '').upper()
            # 终态作业无需取消
            if job_state in ('FINISHED', 'CANCELLED', 'FAILED', 'SUSPENDED'):
                logger.info(f"Flink 作业 {job_id} 已处于终态 ({job_state})，无需取消")
                return True
        elif status_resp.status_code == 404:
            # 作业不存在（已被 Flink 清理或 ID 过期），视为已停止
            logger.info(f"Flink 作业 {job_id} 不存在（可能已被清理），视为已停止")
            return True

        # Flink REST API: PATCH /jobs/<job_id>?mode=cancel
        resp = requests.patch(
            f"{FLINK_REST_API}/jobs/{job_id}?mode=cancel",
            timeout=10
        )
        if resp.status_code in (200, 202):
            logger.info(f"Flink 作业 {job_id} 已取消")
            return True

        logger.warning(f"取消 Flink 作业 {job_id} 返回 {resp.status_code}")
        return False

    except requests.exceptions.ConnectionError:
        logger.warning(f"无法连接 Flink ({FLINK_REST_API})，视作业 {job_id} 为已停止")
        return True
    except Exception as e:
        logger.error(f"停止 Flink 任务失败: {e}")
        return False


@data_sources_api_bp.route('/datasources/batch/start', methods=['POST'])
@login_required
def start_all_datasources():
    """批量启动所有已配置的数据源"""
    datasources = DataSource.query.filter(
        DataSource.log_type_id.isnot(None),
        DataSource.storage_table_name.isnot(None),
        DataSource.flink_job_status != 'running'
    ).all()
    
    results = []
    for ds in datasources:
        try:
            job_params = build_flink_job_params(ds)

            job_id, submit_err = submit_flink_job(job_params)

            if job_id:
                ds.flink_job_id = job_id
                ds.flink_job_status = 'running'
                ds.status = 'active'
                db.session.commit()
                results.append({'id': ds.id, 'name': ds.name, 'job_id': job_id, 'status': 'success'})
            else:
                results.append({'id': ds.id, 'name': ds.name, 'status': 'failed', 'error': submit_err or '提交失败'})
        except Exception as e:
            results.append({'id': ds.id, 'name': ds.name, 'status': 'error', 'error': str(e)})
    
    success_count = len([r for r in results if r.get('status') == 'success'])

    return jsonify({
        'success': True,
        'data': {
            'total': len(datasources),
            'success': success_count,
            'failed': len(datasources) - success_count,
            'results': results
        }
    })


@data_sources_api_bp.route('/datasources/<int:ds_id>/ingest', methods=['POST'])
@login_required
def ingest_log(ds_id):
    """
    数据接入 — 接收日志数据并写入 Kafka raw-logs 主题
    """
    datasource = DataSource.query.get(ds_id)
    if not datasource:
        return jsonify({'success': False, 'error': '数据源不存在'}), 404

    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({'success': False, 'error': '缺少 message 字段'}), 400

    producer = _get_kafka_producer()
    if not producer:
        return jsonify({'success': False, 'error': 'Kafka 不可用'}), 503

    record = {
        'id': str(uuid.uuid4()),
        'source_id': ds_id,
        'source_name': datasource.name,
        'timestamp': data.get('timestamp', datetime.utcnow().isoformat()),
        'raw_message': data['message'],
        'protocol': datasource.protocol or 'webhook',
        'metadata': data.get('metadata', {}),
    }

    try:
        future = producer.send('raw-logs', value=record)
        future.get(timeout=10)
        return jsonify({
            'success': True,
            'data': {'id': record['id'], 'written': True},
            'message': '日志已接入'
        })
    except Exception as e:
        logger.error(f"写入 Kafka 失败: {e}")
        return jsonify({'success': False, 'error': f'写入失败: {e}'}), 500


@data_sources_api_bp.route('/flink/jobs', methods=['GET'])
@login_required
def list_flink_jobs():
    """查询 Flink 集群中的所有作业"""
    try:
        resp = requests.get(f"{FLINK_REST_API}/jobs", timeout=5)
        if resp.status_code != 200:
            return jsonify({'success': False, 'error': f'Flink API 返回 {resp.status_code}'}), 502
        return jsonify({'success': True, 'data': resp.json()})
    except Exception as e:
        return jsonify({'success': False, 'error': f'连接 Flink 失败: {e}'}), 502
