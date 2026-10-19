"""集成应用 API 路由（Shuffle / OpenAPI 规范导入与管理）。"""
from flask import Blueprint, request, jsonify
from app.routes.auth import login_required
from app.database import db
from app.models import IntegrationApp
from app.services.integrations.importer import parse_spec, render_request, SpecParseError

integrations_api_bp = Blueprint('integrations_api', __name__)

MAX_IMPORT_CHARS = 2_000_000


@integrations_api_bp.route('/apps', methods=['GET'])
@login_required
def list_apps():
    """集成应用列表（不含动作明细）"""
    apps = IntegrationApp.query.order_by(IntegrationApp.updated_at.desc()).all()
    return jsonify({
        'success': True,
        'data': {
            'items': [a.to_dict(include_actions=False) for a in apps],
            'total': len(apps),
        }
    })


@integrations_api_bp.route('/apps/<int:app_id>', methods=['GET'])
@login_required
def get_app(app_id):
    """集成应用详情（含动作列表）"""
    app = IntegrationApp.query.get(app_id)
    if not app:
        return jsonify({'success': False, 'error': '集成应用不存在'}), 404
    return jsonify({'success': True, 'data': app.to_dict()})


@integrations_api_bp.route('/apps/import', methods=['POST'])
@login_required
def import_app():
    """导入规范创建集成应用

    body: {text: 规范文本} 或 {url: 规范地址（后端代理拉取，避开 CORS）}
    """
    data = request.get_json() or {}
    text = data.get('text')
    if not text and data.get('url'):
        url = str(data['url']).strip()
        if not url.startswith(('http://', 'https://')):
            return jsonify({'success': False, 'error': '规范地址必须以 http(s):// 开头'}), 400
        try:
            import requests as http_requests
            resp = http_requests.get(url, timeout=30, verify=False)
            resp.raise_for_status()
            text = resp.text
        except Exception as e:
            return jsonify({'success': False, 'error': f'拉取规范失败: {str(e)[:200]}'}), 400
    if not text:
        return jsonify({'success': False, 'error': '请提供规范文本（text）或地址（url）'}), 400
    if len(text) > MAX_IMPORT_CHARS:
        return jsonify({'success': False, 'error': '规范过大（>2MB）'}), 400

    try:
        parsed = parse_spec(text)
    except SpecParseError as e:
        return jsonify({'success': False, 'error': str(e)}), 400

    # app_key 去重
    app_key = parsed['app_key']
    base, n = app_key, 2
    while IntegrationApp.query.filter_by(app_key=app_key).first():
        app_key = f'{base}_{n}'
        n += 1

    app = IntegrationApp(
        app_key=app_key,
        name=parsed['name'],
        description=parsed['description'],
        version=parsed['version'],
        categories=parsed['categories'],
        base_url=parsed['base_url'],
        auth_type=parsed['auth_type'],
        auth_config=parsed['auth_config'],
        actions=parsed['actions'],
        source=parsed['source'],
        spec_format=parsed['spec_format'],
    )
    db.session.add(app)
    db.session.commit()

    return jsonify({
        'success': True,
        'data': app.to_dict(),
        'message': f"导入成功：{app.name}（{len(app.actions or [])} 个动作）"
    }), 201


@integrations_api_bp.route('/apps/<int:app_id>', methods=['PUT'])
@login_required
def update_app(app_id):
    """更新集成应用（认证配置 / 启用开关 / base_url）"""
    app = IntegrationApp.query.get(app_id)
    if not app:
        return jsonify({'success': False, 'error': '集成应用不存在'}), 404

    data = request.get_json() or {}

    if 'auth_type' in data:
        if data['auth_type'] not in ('none', 'apiKey', 'bearer', 'basic'):
            return jsonify({'success': False, 'error': '不支持的认证类型'}), 400
        app.auth_type = data['auth_type']
    if 'auth_config' in data and isinstance(data['auth_config'], dict):
        app.auth_config = data['auth_config']
    if 'credential' in data:
        # 空串表示清除；'********' 掩码值表示保持不变
        cred = data['credential']
        if cred and set(str(cred)) <= {'*'}:
            pass
        else:
            app.credential = (str(cred)[:1000] if cred else None)
    if 'enabled' in data:
        app.enabled = bool(data['enabled'])
    if 'base_url' in data:
        app.base_url = str(data['base_url'])[:500]

    db.session.commit()
    return jsonify({'success': True, 'data': app.to_dict(include_actions=False)})


@integrations_api_bp.route('/apps/<int:app_id>', methods=['DELETE'])
@login_required
def delete_app(app_id):
    app = IntegrationApp.query.get(app_id)
    if not app:
        return jsonify({'success': False, 'error': '集成应用不存在'}), 404
    db.session.delete(app)
    db.session.commit()
    return jsonify({'success': True, 'message': '已删除'})


@integrations_api_bp.route('/apps/<int:app_id>/test-action', methods=['POST'])
@login_required
def test_action(app_id):
    """试运行单个动作（用当前保存的认证配置真实发请求）"""
    app = IntegrationApp.query.get(app_id)
    if not app:
        return jsonify({'success': False, 'error': '集成应用不存在'}), 404

    data = request.get_json() or {}
    action_id = data.get('action_id')
    values = data.get('values') or {}

    action = next((a for a in (app.actions or []) if a.get('id') == action_id), None)
    if not action:
        return jsonify({'success': False, 'error': f'动作不存在: {action_id}'}), 404

    # 必填参数校验（path/query/header 参数 + body required 字段，与引擎一致）
    missing = [p['name'] for p in (action.get('params') or [])
               if p.get('required') and not str(values.get(p['name']) or '').strip()]
    missing += [k for k in ((action.get('body') or {}).get('required') or [])
                if not str(values.get(k) or '').strip()]
    if missing:
        return jsonify({'success': False, 'error': f'缺少必填参数: {", ".join(missing)}'}), 400

    req = render_request(app.to_dict(), action, values)

    from app.engine.actions import HttpRequestAction, ActionContext
    ctx = ActionContext(event={}, alert={})
    result = HttpRequestAction.execute({
        'url': req['url'],
        'method': req['method'],
        'headers': req['headers'],
        'query': req['query'],
        'body': req['body'],
        'auth_app_id': app.id,
        'timeout': 20,
    }, ctx)

    resp_payload = None
    if result.items:
        resp_payload = result.items[0]['json'].get('response')

    return jsonify({
        'success': result.success,
        'message': result.message,
        'data': {
            'request': {k: v for k, v in req.items() if k != 'body' or v is not None},
            'status_code': (result.data or {}).get('status_code'),
            'response': resp_payload,
        }
    })
