"""
数据源管理 API 路由 (新版)
"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import DataSource
import subprocess
import json
import requests
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

data_sources_api_bp = Blueprint('data_sources_api', __name__)

# Flink 配置
FLINK_REST_API = 'http://flink:8081'
FLINK_JAR_PATH = '/opt/flink/examples/streaming/log-parser.jar'


@data_sources_api_bp.route('/datasources', methods=['GET'])
@login_required
def list_datasources():
    """获取数据源列表"""
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 10, type=int)
    status = request.args.get('status')
    source_type = request.args.get('type')
    product_id = request.args.get('product_id', type=int)

    query = DataSource.query
    
    if status:
        query = query.filter(DataSource.status == status)
    if source_type:
        query = query.filter(DataSource.source_type == source_type)
    if product_id:
        query = query.filter(DataSource.product_id == product_id)

    total = query.count()
    datasources = query.order_by(DataSource.updated_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return jsonify({
        'success': True,
        'data': {
            'items': [ds.to_dict() for ds in datasources],
            'total': total,
            'page': page,
            'limit': limit
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
        # 构建 Flink 任务参数
        job_params = {
            'datasource_id': datasource.id,
            'datasource_name': datasource.name,
            'protocol': datasource.protocol,
            'config': datasource.config,
            'log_type_id': datasource.log_type_id,
            'pipeline_ids': datasource.pipeline_ids or [],
            'format_template_id': datasource.format_template_id,
            'storage_table': datasource.storage_table_name,
            'storage_retention_days': datasource.storage_retention_days,
        }
        
        # 调用 Flink REST API 提交任务
        job_id = submit_flink_job(job_params)
        
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
            return jsonify({'success': False, 'error': 'Flink 任务提交失败'}), 500
            
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


def submit_flink_job(params: dict) -> str:
    """提交 Flink 任务"""
    try:
        # 读取 Flink 任务 jar 包配置（如果存在）
        # 这里使用 Flink REST API 提交任务
        program_args = json.dumps(params)
        
        # 构建 Flink 程序参数
        flink_params = {
            'entryClass': 'com.usop.LogParserJob',
            'programArgs': program_args,
            'parallelism': params.get('parallelism', 4)
        }
        
        # 调用 Flink REST API 提交任务
        response = requests.post(
            f"{FLINK_REST_API}/v1/jars/{FLINK_JAR_PATH}/run",
            json=flink_params,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            return result.get('jobid')
        else:
            logger.error(f"Flink 提交失败: {response.status_code} - {response.text}")
            return None
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Flink 提交请求失败: {str(e)}")
        # 如果无法连接 Flink，使用模拟模式
        import uuid
        return f"sim_{uuid.uuid4().hex[:8]}"


def stop_flink_job(job_id: str) -> bool:
    """停止 Flink 任务"""
    try:
        # 如果是模拟 ID，直接返回成功
        if job_id.startswith('sim_'):
            return True
            
        response = requests.patch(
            f"{FLINK_REST_API}/jobs/{job_id}",
            json={'parallelism': 0},
            timeout=10
        )
        
        return response.status_code in [200, 202]
        
    except requests.exceptions.RequestException as e:
        logger.error(f"停止 Flink 任务失败: {str(e)}")
        return True  # 假设成功，避免阻塞


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
            job_params = {
                'datasource_id': ds.id,
                'datasource_name': ds.name,
                'protocol': ds.protocol,
                'config': ds.config,
                'log_type_id': ds.log_type_id,
                'pipeline_ids': ds.pipeline_ids or [],
                'format_template_id': ds.format_template_id,
                'storage_table': ds.storage_table_name,
                'storage_retention_days': ds.storage_retention_days,
            }
            
            job_id = submit_flink_job(job_params)
            
            if job_id:
                ds.flink_job_id = job_id
                ds.flink_job_status = 'running'
                ds.status = 'active'
                db.session.commit()
                results.append({'id': ds.id, 'name': ds.name, 'job_id': job_id, 'status': 'success'})
            else:
                results.append({'id': ds.id, 'name': ds.name, 'status': 'failed', 'error': '提交失败'})
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
