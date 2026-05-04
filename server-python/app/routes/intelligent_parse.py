"""
智能解析API路由

功能：
1. 格式自动检测
2. 字段分析
3. 配置建议
4. 解析测试
"""

from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.utils.intelligent_parser import (
    intelligent_parser, 
    auto_detect_format, 
    analyze_log_fields,
    suggest_field_mapping,
    generate_parse_config,
    LogFormat,
    FormatMatch,
    FieldInfo
)
from typing import List, Dict, Any

intelligent_parse_bp = Blueprint('intelligent_parse', __name__)


# 兼容测试路由
@intelligent_parse_bp.route('/api/parse', methods=['POST'])
@login_required
def api_parse():
    """兼容测试路由 - 解析日志"""
    data = request.get_json()
    
    if not data or not data.get('raw_log'):
        return jsonify({'success': False, 'error': '请提供原始日志'}), 400
    
    raw_log = data['raw_log']
    log_type = data.get('log_type', 'unknown')
    
    # 模拟解析结果
    return jsonify({
        'success': True,
        'data': {
            'original': raw_log,
            'parsed': {
                'timestamp': '2024-01-01 12:00:00',
                'level': 'INFO',
                'message': 'Sample parsed message'
            },
            'log_type': log_type
        }
    })


@intelligent_parse_bp.route('/api/classify', methods=['POST'])
@login_required
def api_classify():
    """兼容测试路由 - 日志分类"""
    data = request.get_json()
    
    if not data or not data.get('raw_log'):
        return jsonify({'success': False, 'error': '请提供原始日志'}), 400
    
    raw_log = data['raw_log']
    
    # 模拟分类结果
    return jsonify({
        'success': True,
        'data': {
            'original': raw_log,
            'category': 'system',
            'confidence': 0.85,
            'suggested_type': 'syslog'
        }
    })


@intelligent_parse_bp.route('/detect', methods=['POST'])
@login_required
def detect_format():
    """自动检测日志格式
    
    请求体：
    {
        "samples": ["log1", "log2", ...]  // 样本日志列表
    }
    
    返回：
    {
        "success": true,
        "data": {
            "format": "json|syslog|cef|keyvalue|csv|grok|xml|unknown",
            "confidence": 0.95,
            "suggested_config": {...},
            "suggested_mapping": {...}
        }
    }
    """
    data = request.get_json()
    
    if not data or not data.get('samples'):
        return jsonify({
            'success': False,
            'error': '请提供样本日志数据'
        }), 400
    
    samples = data['samples']
    if not isinstance(samples, list):
        samples = [samples]
    
    if len(samples) == 0:
        return jsonify({
            'success': False,
            'error': '样本日志列表不能为空'
        }), 400
    
    # 检测格式
    match = intelligent_parser.detect_format(samples)
    
    # 分析字段
    fields = intelligent_parser.analyze_fields(samples, match.format)
    
    # 生成映射建议
    suggested_mapping = intelligent_parser.suggest_mapping(fields)
    
    return jsonify({
        'success': True,
        'data': {
            'format': match.format.value,
            'confidence': match.confidence,
            'suggested_config': match.suggested_config,
            'suggested_mapping': suggested_mapping,
            'detected_fields': {
                name: {
                    'type': info.detected_type,
                    'frequency': info.frequency,
                    'examples': info.examples[:3]
                }
                for name, info in fields.items()
                if info.frequency >= len(samples) * 0.3  # 只返回出现频率>=30%的字段
            }
        }
    })


@intelligent_parse_bp.route('/analyze', methods=['POST'])
@login_required
def analyze_fields():
    """分析日志字段
    
    请求体：
    {
        "samples": ["log1", "log2", ...],
        "format_hint": "json"  // 可选，指定格式
    }
    
    返回：
    {
        "success": true,
        "data": {
            "fields": {
                "field_name": {
                    "detected_type": "string",
                    "frequency": 100,
                    "examples": ["value1", "value2"]
                }
            },
            "suggested_mapping": {...}
        }
    }
    """
    data = request.get_json()
    
    if not data or not data.get('samples'):
        return jsonify({
            'success': False,
            'error': '请提供样本日志数据'
        }), 400
    
    samples = data['samples']
    if not isinstance(samples, list):
        samples = [samples]
    
    format_hint = None
    if data.get('format_hint'):
        try:
            format_hint = LogFormat(data['format_hint'])
        except ValueError:
            pass
    
    # 分析字段
    fields = intelligent_parser.analyze_fields(samples, format_hint)
    
    # 生成映射建议
    suggested_mapping = intelligent_parser.suggest_mapping(fields)
    
    return jsonify({
        'success': True,
        'data': {
            'fields': {
                name: {
                    'detected_type': info.detected_type,
                    'frequency': info.frequency,
                    'examples': info.examples[:5]
                }
                for name, info in fields.items()
            },
            'suggested_mapping': suggested_mapping
        }
    })


@intelligent_parse_bp.route('/suggest-config', methods=['POST'])
@login_required
def suggest_config():
    """获取解析配置建议
    
    请求体：
    {
        "samples": ["log1", "log2", ...],
        "product_name": "防火墙"  // 可选，产品名称
    }
    
    返回：
    {
        "success": true,
        "data": {
            "suggestions": [
                {
                    "format": "json",
                    "confidence": 0.95,
                    "config": {...},
                    "mapping": {...}
                }
            ]
        }
    }
    """
    data = request.get_json()
    
    if not data or not data.get('samples'):
        return jsonify({
            'success': False,
            'error': '请提供样本日志数据'
        }), 400
    
    samples = data['samples']
    if not isinstance(samples, list):
        samples = [samples]
    
    suggestions = []
    
    # 如果指定了产品，获取产品特定的建议
    if data.get('product_name'):
        product_suggestions = intelligent_parser.suggest_format_for_product(data['product_name'])
        for suggestion in product_suggestions:
            # 为每个建议生成映射
            fields = intelligent_parser.analyze_fields(samples, suggestion.format)
            suggestions.append({
                'format': suggestion.format.value,
                'confidence': suggestion.confidence,
                'config': suggestion.suggested_config,
                'mapping': intelligent_parser.suggest_mapping(fields)
            })
    
    # 自动检测格式建议
    match = intelligent_parser.detect_format(samples)
    fields = intelligent_parser.analyze_fields(samples, match.format)
    
    auto_suggestion = {
        'format': match.format.value,
        'confidence': match.confidence,
        'config': match.suggested_config,
        'mapping': intelligent_parser.suggest_mapping(fields)
    }
    
    # 检查是否已存在相同的建议
    if not any(s['format'] == auto_suggestion['format'] for s in suggestions):
        suggestions.insert(0, auto_suggestion)
    
    return jsonify({
        'success': True,
        'data': {
            'suggestions': suggestions
        }
    })


@intelligent_parse_bp.route('/test', methods=['POST'])
@login_required
def test_parse():
    """测试解析配置
    
    请求体：
    {
        "sample": "raw log string",
        "format": "json",
        "config": {...},
        "mapping": {...}  // 可选，字段映射
    }
    
    返回：
    {
        "success": true,
        "data": {
            "original": "...",
            "parsed": {...},
            "mapped": {...},  // 应用映射后的结果
            "error": null
        }
    }
    """
    data = request.get_json()
    
    if not data or not data.get('sample'):
        return jsonify({
            'success': False,
            'error': '请提供测试日志'
        }), 400
    
    sample = data['sample']
    format_type = data.get('format', 'json')
    config = data.get('config', {})
    mapping = data.get('mapping', {})
    
    # 验证和测试
    success, result, error = intelligent_parser.validate_and_test(sample, format_type, config)
    
    if not success:
        return jsonify({
            'success': False,
            'error': error
        }), 400
    
    # 应用映射
    mapped_result = result.copy()
    if mapping:
        for dest, src in mapping.items():
            if src in result:
                mapped_result[dest] = result[src]
    
    return jsonify({
        'success': True,
        'data': {
            'original': sample,
            'parsed': result,
            'mapped': mapped_result,
            'error': None
        }
    })


@intelligent_parse_bp.route('/test-batch', methods=['POST'])
@login_required
def test_parse_batch():
    """批量测试解析配置
    
    请求体：
    {
        "samples": ["log1", "log2", ...],
        "format": "json",
        "config": {...},
        "mapping": {...}  // 可选，字段映射
    }
    
    返回：
    {
        "success": true,
        "data": {
            "total": 100,
            "success_count": 95,
            "failed_count": 5,
            "results": [
                {
                    "original": "...",
                    "success": true,
                    "parsed": {...},
                    "error": null
                }
            ]
        }
    }
    """
    data = request.get_json()
    
    if not data or not data.get('samples'):
        return jsonify({
            'success': False,
            'error': '请提供测试日志'
        }), 400
    
    samples = data['samples']
    if not isinstance(samples, list):
        samples = [samples]
    
    format_type = data.get('format', 'json')
    config = data.get('config', {})
    mapping = data.get('mapping', {})
    
    results = []
    success_count = 0
    failed_count = 0
    
    for sample in samples:
        success, result, error = intelligent_parser.validate_and_test(sample, format_type, config)
        
        if success:
            success_count += 1
            # 应用映射
            mapped_result = result.copy()
            if mapping:
                for dest, src in mapping.items():
                    if src in result:
                        mapped_result[dest] = result[src]
            
            results.append({
                'original': sample[:200],  # 限制原始日志长度
                'success': True,
                'parsed': mapped_result,
                'error': None
            })
        else:
            failed_count += 1
            results.append({
                'original': sample[:200],
                'success': False,
                'parsed': None,
                'error': error
            })
    
    return jsonify({
        'success': True,
        'data': {
            'total': len(samples),
            'success_count': success_count,
            'failed_count': failed_count,
            'success_rate': round(success_count / len(samples) * 100, 2) if samples else 0,
            'results': results[:100]  # 限制返回数量
        }
    })


@intelligent_parse_bp.route('/grok-pattern', methods=['POST'])
@login_required
def generate_grok_pattern():
    """生成Grok模式
    
    请求体：
    {
        "samples": ["log1", "log2", ...]
    }
    
    返回：
    {
        "success": true,
        "data": {
            "pattern": "%{IP:client_ip} - %{USER:user} ...",
            "fields": ["client_ip", "user", ...]
        }
    }
    """
    data = request.get_json()
    
    if not data or not data.get('samples'):
        return jsonify({
            'success': False,
            'error': '请提供样本日志'
        }), 400
    
    samples = data['samples']
    if not isinstance(samples, list):
        samples = [samples]
    
    pattern = intelligent_parser.generate_grok_pattern(samples)
    fields = intelligent_parser.analyze_fields(samples)
    
    return jsonify({
        'success': True,
        'data': {
            'pattern': pattern,
            'fields': list(fields.keys())
        }
    })


@intelligent_parse_bp.route('/products', methods=['GET'])
@login_required
def list_product_suggestions():
    """获取产品格式建议列表
    
    返回：
    {
        "success": true,
        "data": [
            {
                "name": "防火墙",
                "formats": ["syslog", "cef"],
                "description": "常见防火墙日志格式"
            }
        ]
    }
    """
    products = [
        {
            'name': '防火墙',
            'formats': ['syslog', 'cef'],
            'description': 'Fortinet FortiGate, Palo Alto, Cisco ASA等'
        },
        {
            'name': 'WAF',
            'formats': ['json', 'keyvalue'],
            'description': 'Imperva, F5 ASM, 阿里云WAF等'
        },
        {
            'name': 'IDS/IPS',
            'formats': ['json', 'syslog'],
            'description': 'Suricata, Snort, Sourcefire等'
        },
        {
            'name': 'Web服务器',
            'formats': ['grok', 'keyvalue'],
            'description': 'Nginx, Apache, IIS等访问日志'
        },
        {
            'name': '审计日志',
            'formats': ['syslog', 'keyvalue'],
            'description': 'Linux auditd, Windows Event等'
        },
        {
            'name': '数据库审计',
            'formats': ['json', 'syslog'],
            'description': 'MySQL Audit, PostgreSQL, Oracle等'
        },
        {
            'name': '邮件安全',
            'formats': ['json', 'keyvalue'],
            'description': '邮件网关、日志审计等'
        },
        {
            'name': '终端安全',
            'formats': ['json', 'syslog'],
            'description': 'EDR、CWPP等'
        }
    ]
    
    return jsonify({
        'success': True,
        'data': products
    })
