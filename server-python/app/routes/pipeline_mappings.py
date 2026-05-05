# ========================================
# 解析管道字段映射 API
# ========================================

from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import PipelineFieldMapping, PipelineConfig, Pipeline, AlertFieldDefinition

pipeline_mappings_bp = Blueprint('pipeline_mappings', __name__)


@pipeline_mappings_bp.route('/pipelines/<int:pipeline_id>/mappings', methods=['GET'])
@login_required
def get_pipeline_mappings(pipeline_id):
    """获取指定管道的所有字段映射"""
    # 验证管道存在
    pipeline = Pipeline.query.get_or_404(pipeline_id)
    
    # 获取字段映射
    mappings = PipelineFieldMapping.query.filter_by(pipeline_id=pipeline_id)\
        .order_by(PipelineFieldMapping.sort_order).all()
    
    return jsonify({
        'success': True,
        'data': {
            'pipeline_id': pipeline_id,
            'mappings': [m.to_dict() for m in mappings]
        }
    })


@pipeline_mappings_bp.route('/pipelines/<int:pipeline_id>/mappings', methods=['POST'])
@login_required
def create_pipeline_mapping(pipeline_id):
    """批量创建/更新管道字段映射"""
    # 验证管道存在
    pipeline = Pipeline.query.get_or_404(pipeline_id)
    data = request.get_json()
    
    mappings = data.get('mappings', [])
    
    # 删除现有映射
    PipelineFieldMapping.query.filter_by(pipeline_id=pipeline_id).delete()
    
    # 创建新映射
    created_mappings = []
    for idx, m in enumerate(mappings):
        mapping = PipelineFieldMapping(
            pipeline_id=pipeline_id,
            target_field=m.get('target_field'),
            source_field=m.get('source_field'),
            field_type=m.get('field_type', 'string'),
            default_value=m.get('default_value'),
            is_required=m.get('is_required', False),
            sort_order=m.get('sort_order', idx)
        )
        db.session.add(mapping)
        created_mappings.append(mapping)
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': {
            'pipeline_id': pipeline_id,
            'mappings': [m.to_dict() for m in created_mappings]
        }
    })


@pipeline_mappings_bp.route('/pipelines/<int:pipeline_id>/mappings/<int:mapping_id>', methods=['DELETE'])
@login_required
def delete_pipeline_mapping(pipeline_id, mapping_id):
    """删除单个字段映射"""
    mapping = PipelineFieldMapping.query.filter_by(
        id=mapping_id, 
        pipeline_id=pipeline_id
    ).first_or_404()
    
    db.session.delete(mapping)
    db.session.commit()
    
    return jsonify({'success': True})


@pipeline_mappings_bp.route('/pipelines/<int:pipeline_id>/config', methods=['GET'])
@login_required
def get_pipeline_config(pipeline_id):
    """获取管道配置"""
    pipeline = Pipeline.query.get_or_404(pipeline_id)
    
    config = PipelineConfig.query.filter_by(pipeline_id=pipeline_id).first()
    
    if not config:
        return jsonify({
            'success': True,
            'data': {
                'pipeline_id': pipeline_id,
                'parser_type': pipeline.input_format,
                'parser_config': pipeline.input_config,
                'sample_log': None,
                'filter_rules': pipeline.filter_rules,
                'transform_rules': pipeline.transform_rules,
                'mappings': []
            }
        })
    
    # 获取字段映射
    mappings = PipelineFieldMapping.query.filter_by(pipeline_id=pipeline_id)\
        .order_by(PipelineFieldMapping.sort_order).all()
    
    return jsonify({
        'success': True,
        'data': {
            **config.to_dict(),
            'mappings': [m.to_dict() for m in mappings]
        }
    })


@pipeline_mappings_bp.route('/pipelines/<int:pipeline_id>/config', methods=['PUT'])
@login_required
def update_pipeline_config(pipeline_id):
    """更新管道配置"""
    pipeline = Pipeline.query.get_or_404(pipeline_id)
    data = request.get_json()
    
    # 获取或创建配置
    config = PipelineConfig.query.filter_by(pipeline_id=pipeline_id).first()
    if not config:
        config = PipelineConfig(pipeline_id=pipeline_id)
        db.session.add(config)
    
    # 更新配置字段
    if 'parser_type' in data:
        config.parser_type = data['parser_type']
    if 'parser_config' in data:
        config.parser_config = data['parser_config']
    if 'sample_log' in data:
        config.sample_log = data['sample_log']
    if 'filter_rules' in data:
        config.filter_rules = data['filter_rules']
    if 'transform_rules' in data:
        config.transform_rules = data['transform_rules']
    if 'detection_rule_ids' in data:
        config.detection_rule_ids = data['detection_rule_ids']
    
    # 同时更新 Pipeline 的 input_format
    if 'parser_type' in data:
        pipeline.input_format = data['parser_type']
    if 'parser_config' in data:
        pipeline.input_config = data['parser_config']
    if 'filter_rules' in data:
        pipeline.filter_rules = data['filter_rules']
    if 'transform_rules' in data:
        pipeline.transform_rules = data['transform_rules']
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'data': config.to_dict()
    })


@pipeline_mappings_bp.route('/pipelines/<int:pipeline_id>/auto-map', methods=['POST'])
@login_required
def auto_map_fields(pipeline_id):
    """自动映射字段：根据解析样本自动匹配标准字段"""
    pipeline = Pipeline.query.get_or_404(pipeline_id)
    data = request.get_json()
    
    parsed_fields = data.get('parsed_fields', [])
    
    # 获取所有启用的标准字段及其别名
    std_fields = AlertFieldDefinition.query.filter_by(enabled=True).all()
    
    # 构建别名映射表
    alias_map = {}
    for sf in std_fields:
        alias_map[sf.name.lower()] = sf
        for alias in (sf.aliases or []):
            alias_map[alias.lower()] = sf
    
    # 智能匹配
    mappings = []
    for field in parsed_fields:
        field_name_lower = field.get('name', '').lower()
        
        # 精确匹配
        if field_name_lower in alias_map:
            std_field = alias_map[field_name_lower]
            mappings.append({
                'source_field': field.get('name'),
                'target_field': std_field.name,
                'field_type': field.get('type', 'string'),
                'mapping_label': std_field.label,
                'is_required': std_field.required,
                'confidence': 1.0
            })
        else:
            # 部分匹配
            for key, std_field in alias_map.items():
                if key in field_name_lower or field_name_lower in key:
                    mappings.append({
                        'source_field': field.get('name'),
                        'target_field': std_field.name,
                        'field_type': field.get('type', 'string'),
                        'mapping_label': std_field.label,
                        'is_required': std_field.required,
                        'confidence': 0.7
                    })
                    break
    
    return jsonify({
        'success': True,
        'data': {
            'mappings': mappings,
            'total': len(mappings),
            'parsed_fields': len(parsed_fields)
        }
    })


@pipeline_mappings_bp.route('/mappings/suggestions', methods=['GET'])
@login_required
def get_mapping_suggestions():
    """获取字段映射建议：根据标准字段获取可能的源字段名"""
    # 获取所有启用的标准字段及其别名
    std_fields = AlertFieldDefinition.query.filter_by(enabled=True)\
        .order_by(AlertFieldDefinition.category, AlertFieldDefinition.sort_order).all()
    
    suggestions = []
    for sf in std_fields:
        suggestions.append({
            'target_field': sf.name,
            'label': sf.label,
            'category': sf.category,
            'required': sf.required,
            'aliases': sf.aliases or [],
            'suggested_source_names': [sf.name] + (sf.aliases or [])
        })
    
    return jsonify({
        'success': True,
        'data': suggestions
    })
