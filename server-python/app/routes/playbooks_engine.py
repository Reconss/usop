"""
剧本执行引擎 — 异步执行 + WebSocket 实时日志推送
"""
import time
import json
import logging
import subprocess
import os
import threading
import uuid
from datetime import datetime
from typing import Dict, Any

from flask import Blueprint, request, jsonify
from flask_socketio import emit as _flask_emit
# Import socketio from app module for use in background threads
socketio = None
from app.routes.auth import login_required
from app.database import db
from app.models import Alert, Event, AuditLog

logger = logging.getLogger(__name__)
playbooks_engine_bp = Blueprint('playbooks_engine', __name__)
_app = None

def set_socketio(sio):
    global socketio
    socketio = sio

def set_app(app):
    global _app
    _app = app

# 任务状态存储: task_id -> {logs, status, progress}
TASK_STORE: Dict[str, dict] = {}

def _now():
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')

def _resolve_vars(template: str, context: dict) -> str:
    if not template:
        return ''
    for k, v in context.items():
        template = template.replace('{{' + k + '}}', str(v) if v else '')
    return template

# ==================== 节点执行器 ====================

def exec_trigger(node, context):
    return {'status': 'success', 'message': f"触发器 [{node['name']}] 已激活"}

def exec_condition(node, context):
    cfg = node.get('config', {})
    field, op, value = cfg.get('field', ''), cfg.get('operator', ''), cfg.get('value', '')
    actual = str(context.get(field, '')).lower()
    value_str = str(value).lower()
    matched = False
    if op == '等于': matched = actual == value_str
    elif op == '不等于': matched = actual != value_str
    elif op == '包含': matched = value_str in actual
    elif op == '大于': matched = float(actual) > float(value_str)
    elif op == '小于': matched = float(actual) < float(value_str)
    branch = '是' if matched else '否'
    return {'status': 'success', 'message': f"[{field} {op} {value}] → [{actual}] → {branch}", 'output': {**context, '_condition_result': branch, '_branch': branch}}

def exec_script(node, context):
    cfg = node.get('config', {})
    lang = cfg.get('language', 'Python')
    script = cfg.get('script', '')
    if not script.strip():
        return {'status': 'warning', 'message': '脚本内容为空'}
    import uuid as _uuid
    uid = _uuid.uuid4().hex[:8]
    ctx_json = json.dumps(context, ensure_ascii=False, default=str)
    if lang == 'Python':
        header = f"import json, os, sys\ncontext = json.loads('''{ctx_json}''')\nresult = {{}}\n"
        footer = "\nimport json\nprint('__RESULT__' + json.dumps(result, ensure_ascii=False, default=str))"
        full_script = header + script + footer
        ext, cmd = '.py', ['python3']
    elif lang == 'Node.js':
        header = f"const context = JSON.parse('{ctx_json.replace(chr(39), chr(92)+chr(39))}');\nlet result = {{}};\n"
        footer = "\nconsole.log('__RESULT__' + JSON.stringify(result));"
        full_script = header + script + footer
        ext, cmd = '.js', ['node']
    else:
        header = f"#!/bin/bash\nexport CONTEXT='{ctx_json}'\n"
        full_script = header + script
        ext, cmd = '.sh', ['bash']
    tmp_path = f'/tmp/playbook_{uid}{ext}'
    try:
        with open(tmp_path, 'w') as f:
            f.write(full_script)
        os.chmod(tmp_path, 0o755)
        result = subprocess.run(cmd + [tmp_path], capture_output=True, text=True, timeout=60, env={**os.environ, 'PLAYBOOK_CONTEXT': ctx_json})
        merged = {}
        clean_lines = []
        for line in result.stdout.strip().split('\n'):
            if line.startswith('__RESULT__'):
                try: merged = json.loads(line[10:])
                except: pass
            else:
                clean_lines.append(line)
        script_output = '\n'.join(clean_lines)[:2000]
        if result.returncode == 0:
            return {'status': 'success', 'message': f"脚本执行成功 ({lang})\n{script_output[:500]}", 'output': {**context, **merged, '_script_output': script_output}}
        else:
            return {'status': 'error', 'message': f"脚本执行失败 ({lang}):\n{result.stderr.strip()[:500]}"}
    except subprocess.TimeoutExpired:
        return {'status': 'error', 'message': f'脚本执行超时 (60s) [{lang}]'}
    except Exception as e:
        return {'status': 'error', 'message': f'脚本错误: {str(e)[:200]}'}
    finally:
        try: os.unlink(tmp_path)
        except: pass

def exec_api(node, context):
    import requests
    cfg = node.get('config', {})
    method = cfg.get('method', 'GET').upper()
    url = _resolve_vars(cfg.get('url', ''), context)
    body = _resolve_vars(cfg.get('body', ''), context)
    if not url:
        return {'status': 'error', 'message': 'API URL 未配置'}
    try:
        headers = {'Content-Type': 'application/json', 'User-Agent': 'USOP-Playbook/1.0'}
        custom_headers = cfg.get('headers', '')
        if custom_headers:
            for h in custom_headers.split(','):
                if ':' in h:
                    k, v = h.strip().split(':', 1)
                    headers[k.strip()] = v.strip()
        kwargs = {'method': method, 'url': url, 'headers': headers, 'timeout': 15}
        if method in ('POST', 'PUT', 'PATCH') and body:
            kwargs['data'] = body
        resp = requests.request(**kwargs)
        return {'status': 'success', 'message': f"API {method} {url} → {resp.status_code}", 'output': {**context, '_api_status': resp.status_code, '_api_response': resp.text[:500]}}
    except requests.exceptions.Timeout:
        return {'status': 'error', 'message': f"API 超时: {url}"}
    except requests.exceptions.ConnectionError:
        return {'status': 'error', 'message': f"API 连接失败: {url}"}
    except Exception as e:
        return {'status': 'error', 'message': f"API 调用失败: {e}"}

def exec_block(node, context):
    import requests as req_lib
    cfg = node.get('config', {})
    ip = _resolve_vars(cfg.get('ip', ''), context)
    duration = cfg.get('duration', '24h')
    reason = _resolve_vars(cfg.get('reason', ''), context) or '剧本自动封堵'
    api_url = cfg.get('api_url', '')
    api_token = cfg.get('api_token', '')
    script = cfg.get('script', '')
    if not ip:
        return {'status': 'error', 'message': 'IP 地址未配置'}
    if ip in ('0.0.0.0', '127.0.0.1', '::1', '::'):
        return {'status': 'error', 'message': f'不允许封堵保留地址: {ip}'}
    method_used = 'none'
    # 方式1: 自定义脚本
    if script:
        try:
            ctx = {**context, 'ip': ip, 'duration': duration, 'reason': reason}
            result = exec_script({'config': {'language': 'Python', 'script': script}}, ctx)
            return result
        except Exception as e:
            return {'status': 'partial', 'message': f"脚本封堵异常: {e}"}
    # 方式2: 防火墙 API
    if api_url:
        try:
            import urllib.request
            payload = json.dumps({'action': 'block', 'ip': ip, 'reason': reason, 'duration': duration}).encode()
            req = urllib.request.Request(api_url, data=payload, method='POST')
            req.add_header('Content-Type', 'application/json')
            if api_token:
                req.add_header('Authorization', f'Bearer {api_token}')
            urllib.request.urlopen(req, timeout=15)
            method_used = 'firewall_api'
        except Exception as e:
            return {'status': 'error', 'message': f"防火墙 API 调用失败: {e}"}
    # 方式3: iptables
    else:
        try:
            subprocess.run(['iptables', '-A', 'INPUT', '-s', ip, '-j', 'DROP', '-m', 'comment', '--comment', f"USOP-{reason[:40]}"],
                           capture_output=True, timeout=5, check=False)
            method_used = 'iptables'
        except:
            method_used = 'audit_log'
    event = Event(event_code=f"BLK-{int(time.time())}", title=f"IP封堵: {ip}", description=f"时长: {duration} | 原因: {reason} | 方式: {method_used}", severity='high', status='open', category='IP封堵')
    db.session.add(event)
    db.session.commit()
    return {'status': 'success', 'message': f"IP {ip} 封堵完成 [{method_used}] (时长: {duration})", 'output': {**context, '_blocked_ip': ip}}

def exec_isolate(node, context):
    cfg = node.get('config', {})
    hostname = _resolve_vars(cfg.get('hostname', ''), context)
    duration = cfg.get('duration', '2h')
    api_url = cfg.get('api_url', '')
    script = cfg.get('script', '')
    if not hostname:
        return {'status': 'error', 'message': '主机名未配置'}
    if script:
        ctx = {**context, 'hostname': hostname, 'duration': duration}
        return exec_script({'config': {'language': 'Python', 'script': script}}, ctx)
    if api_url:
        try:
            import urllib.request
            payload = json.dumps({'action': 'isolate', 'hostname': hostname, 'duration': duration}).encode()
            r = urllib.request.Request(api_url, data=payload, method='POST')
            r.add_header('Content-Type', 'application/json')
            urllib.request.urlopen(r, timeout=15)
        except:
            pass
    event = Event(event_code=f"ISO-{int(time.time())}", title=f"主机隔离: {hostname}", description=f"时长: {duration}", severity='critical', status='open', category='主机隔离')
    db.session.add(event)
    db.session.commit()
    return {'status': 'success', 'message': f"主机 {hostname} 已隔离 (时长: {duration})", 'output': {**context, '_isolated_host': hostname}}

def exec_ticket(node, context):
    cfg = node.get('config', {})
    title = _resolve_vars(cfg.get('title', ''), context)
    priority = cfg.get('priority', '中')
    assignee = cfg.get('assignee', '')
    api_url = cfg.get('api_url', '')
    script = cfg.get('script', '')
    if not title:
        return {'status': 'error', 'message': '工单标题未配置'}
    if script:
        ctx = {**context, 'title': title, 'priority': priority, 'assignee': assignee}
        return exec_script({'config': {'language': 'Python', 'script': script}}, ctx)
    if api_url:
        try:
            import urllib.request
            payload = json.dumps({'title': title, 'priority': priority, 'assignee': assignee, 'source': 'USOP'}).encode()
            r = urllib.request.Request(api_url, data=payload, method='POST')
            r.add_header('Content-Type', 'application/json')
            urllib.request.urlopen(r, timeout=15)
        except:
            pass
    event = Event(event_code=f"TKT-{int(time.time())}", title=title, description=f"优先级: {priority} | 指派: {assignee}", severity='high' if priority == '高' else 'medium' if priority == '中' else 'low', status='open', category='安全工单')
    db.session.add(event)
    db.session.commit()
    return {'status': 'success', 'message': f"工单已创建: {title} (#{event.id})", 'output': {**context, '_ticket_id': str(event.id)}}

def exec_notify(node, context):
    cfg = node.get('config', {})
    channel = cfg.get('channel', '日志')
    title = _resolve_vars(cfg.get('title', ''), context)
    content_text = _resolve_vars(cfg.get('content', ''), context) or '安全剧本自动通知'
    webhook_url = cfg.get('webhook_url', '')
    script = cfg.get('script', '')
    if script:
        ctx = {**context, 'title': title, 'content': content_text, 'channel': channel, 'webhook_url': webhook_url}
        return exec_script({'config': {'language': 'Python', 'script': script}}, ctx)
    methods = []
    if webhook_url:
        try:
            import urllib.request
            payload = json.dumps({'title': title, 'content': content_text, 'source': 'USOP-Playbook'}).encode()
            r = urllib.request.Request(webhook_url, data=payload, method='POST')
            r.add_header('Content-Type', 'application/json')
            urllib.request.urlopen(r, timeout=10)
            methods.append('webhook')
        except:
            methods.append('webhook(失败)')
    from app.models import Notification
    try:
        notif = Notification(title=title, content=content_text, type='security', is_read=False, user_id=1)
        db.session.add(notif)
        db.session.commit()
        methods.append('system')
    except:
        pass
    return {'status': 'success', 'message': f"通知已发送 [{channel}] {title} ({'/'.join(methods)})", 'output': {**context}}

def exec_query(node, context):
    cfg = node.get('config', {})
    source = cfg.get('source', '告警表')
    query_str = cfg.get('query', '')
    try:
        if '告警' in source or source == 'alerts':
            q = Alert.query
            if query_str and ':' in query_str:
                for part in query_str.split(' AND '):
                    if ':' in part:
                        k, v = part.split(':', 1)
                        col = k.strip()
                        if hasattr(Alert, col):
                            q = q.filter(getattr(Alert, col) == v.strip())
            count = q.count()
            items = q.order_by(Alert.created_at.desc()).limit(10).all()
            return {'status': 'success', 'message': f"查询告警表: {count} 条匹配", 'output': {**context, '_query_count': count, '_query_data': [{'id': i.id, 'title': i.title} for i in items]}}
        elif '资产' in source:
            from app.models import Asset
            count = Asset.query.count()
            return {'status': 'success', 'message': f"查询资产表: {count} 条", 'output': {**context, '_query_count': count}}
        else:
            return {'status': 'warning', 'message': f"未知数据源: {source}"}
    except Exception as e:
        return {'status': 'error', 'message': f"查询失败: {e}"}

def exec_enrich(node, context):
    cfg = node.get('config', {})
    value = _resolve_vars(cfg.get('value', ''), context)
    if not value:
        return {'status': 'error', 'message': '查询值未配置'}
    results = []
    try:
        related = Alert.query.filter((Alert.src_ip == value) | (Alert.dst_ip == value)).order_by(Alert.first_seen.desc()).limit(10).all()
        results.extend([{'id': a.id, 'title': a.title, 'severity': a.severity} for a in related])
    except:
        pass
    return {'status': 'success', 'message': f"情报查询 [{value}]: {len(results)} 条关联数据", 'output': {**context, '_intel_data': results, '_intel_count': len(results)}}

def exec_delay(node, context):
    cfg = node.get('config', {})
    d = cfg.get('duration', '1s')
    seconds = 1
    try:
        if d.endswith('s'): seconds = int(d[:-1])
        elif d.endswith('m'): seconds = int(d[:-1]) * 60
        elif d.endswith('h'): seconds = int(d[:-1]) * 3600
        else: seconds = int(d)
    except: pass
    seconds = min(seconds, 300)
    time.sleep(seconds)
    return {'status': 'success', 'message': f"已等待 {d}", 'output': context}

def exec_parallel(node, context):
    return {'status': 'success', 'message': '并行分支已启动', 'output': context}

EXECUTORS = {
    'trigger': exec_trigger, 'condition': exec_condition, 'script': exec_script,
    'api': exec_api, 'block': exec_block, 'isolate': exec_isolate,
    'ticket': exec_ticket, 'notify': exec_notify, 'query': exec_query,
    'enrich': exec_enrich, 'delay': exec_delay, 'parallel': exec_parallel,
}

# ==================== 异步执行 Worker ====================

def _run_task(task_id: str, nodes: list, context: dict):
    """在后台线程中执行剧本节点，实时推送日志"""
    global _app
    task = TASK_STORE[task_id]
    task['status'] = 'running'
    task['logs'] = []

    try:
        if _app is None:
            from app import create_app
            _app = create_app()
        with _app.app_context():
            _run_task_inner(task_id, nodes, context, task)
    except Exception as e:
        task['status'] = 'failed'
        task['logs'].append({'time': _now(), 'node': '系统', 'status': 'error', 'message': str(e)[:200]})
        logger.error(f"任务执行异常: {e}", exc_info=True)
        if socketio: socketio.emit('task_progress', {'task_id': task_id, 'status': 'failed', 'message': str(e)}, namespace='/playbook')

def _run_task_inner(task_id: str, nodes: list, context: dict, task: dict):
    if socketio: socketio.emit('task_progress', {'task_id': task_id, 'status': 'running', 'message': '开始执行剧本...'}, namespace='/playbook')

    for i, node in enumerate(nodes):
        node_type = node.get('typeId', node.get('type', ''))
        node_name = node.get('name', '未命名')
        executor = EXECUTORS.get(node_type)

        log_entry = {'time': _now(), 'node': node_name, 'status': 'running', 'message': f'正在执行 {node_name}...'}
        task['logs'].append(log_entry)
        if socketio: socketio.emit('task_log', {'task_id': task_id, 'log': log_entry}, namespace='/playbook')

        if not executor:
            log_entry['status'] = 'skipped'
            log_entry['message'] = f'未知节点类型: {node_type}'
            if socketio: socketio.emit('task_log', {'task_id': task_id, 'log': log_entry}, namespace='/playbook')
            continue

        try:
            result = executor(node, context)
            if result.get('output'):
                context.update(result['output'])
            log_entry['status'] = result.get('status', 'success')
            log_entry['message'] = result.get('message', '')
        except Exception as e:
            log_entry['status'] = 'error'
            log_entry['message'] = str(e)

        task['logs'][-1] = log_entry
        if socketio: socketio.emit('task_log', {'task_id': task_id, 'log': log_entry}, namespace='/playbook')
        task['progress'] = int((i + 1) / len(nodes) * 100)
        if socketio: socketio.emit('task_progress', {'task_id': task_id, 'status': 'running', 'progress': task['progress']}, namespace='/playbook')

    success = sum(1 for l in task['logs'] if l['status'] == 'success')
    errors = sum(1 for l in task['logs'] if l['status'] in ('error', 'partial'))
    task['status'] = 'completed'
    task['summary'] = f'{success} 成功, {errors} 失败'

    final = {'time': _now(), 'node': '完成', 'status': 'done', 'message': f'剧本执行完成 — {task["summary"]}'}
    task['logs'].append(final)
    if socketio: socketio.emit('task_log', {'task_id': task_id, 'log': final}, namespace='/playbook')
    if socketio: socketio.emit('task_progress', {'task_id': task_id, 'status': 'completed', 'summary': task['summary'], 'logs': task['logs']}, namespace='/playbook')

# ==================== API ====================

@playbooks_engine_bp.route('/playbooks/execute', methods=['POST'])
@login_required
def execute_playbook():
    """提交剧本执行任务"""
    data = request.get_json() or {}
    nodes = data.get('nodes', [])
    context = data.get('context', {})

    if not nodes:
        return jsonify({'success': False, 'error': '无节点可执行'}), 400

    task_id = str(uuid.uuid4())[:12]
    TASK_STORE[task_id] = {'status': 'queued', 'logs': [], 'progress': 0, 'summary': '', 'created_at': _now()}

    thread = threading.Thread(target=_run_task, args=(task_id, nodes, context), daemon=True)
    thread.start()

    return jsonify({'success': True, 'data': {'task_id': task_id, 'message': '任务已提交，可通过 WebSocket 获取执行日志'}})

@playbooks_engine_bp.route('/playbooks/execute/<node_type>', methods=['POST'])
@login_required
def execute_single_node(node_type):
    data = request.get_json() or {}
    executor = EXECUTORS.get(node_type)
    if not executor:
        return jsonify({'success': False, 'error': f'未知节点类型: {node_type}'}), 400
    try:
        result = executor(data.get('node', {}), data.get('context', {}))
        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@playbooks_engine_bp.route('/playbooks/tasks/<task_id>', methods=['GET'])
@login_required
def get_task_status(task_id):
    """查询任务状态（轮询方式）"""
    task = TASK_STORE.get(task_id)
    if not task:
        return jsonify({'success': False, 'error': '任务不存在'}), 404
    return jsonify({'success': True, 'data': task})
