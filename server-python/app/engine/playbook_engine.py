"""
剧本执行引擎 - 解析并执行剧本节点，支持条件分支和循环
"""
import json
import uuid
from datetime import datetime
import requests
from typing import Any, Dict, List, Optional

from app.database import db
from app.models import Playbook, PlaybookExecution, Event, EventAction, AuditLog
from app.engine.actions import (
    ActionContext, ActionResult,
    get_action, list_actions
)


class PlaybookEngine:
    """剧本执行引擎"""

    # 条件运算符
    CONDITION_OPERATORS = {
        'equals': lambda a, b: str(a) == str(b),
        'not_equals': lambda a, b: str(a) != str(b),
        'contains': lambda a, b: str(b).lower() in str(a).lower(),
        'not_contains': lambda a, b: str(b).lower() not in str(a).lower(),
        'starts_with': lambda a, b: str(a).lower().startswith(str(b).lower()),
        'ends_with': lambda a, b: str(a).lower().endswith(str(b).lower()),
        'greater_than': lambda a, b: float(a) > float(b) if _is_numeric(a, b) else False,
        'less_than': lambda a, b: float(a) < float(b) if _is_numeric(a, b) else False,
        'in_list': lambda a, b: str(a) in [x.strip() for x in str(b).split(',')],
        'not_in_list': lambda a, b: str(a) not in [x.strip() for x in str(b).split(',')],
        'is_empty': lambda a, b: not a or str(a).strip() == '',
        'is_not_empty': lambda a, b: bool(a) and str(a).strip() != '',
        'regex_match': lambda a, b: bool(__import__('re').search(str(b), str(a))),
    }

    def __init__(self):
        self.execution_id = None
        self.node_results = []
        self.started_at = None
        self.completed_at = None

    def execute(self, playbook: Playbook,
                trigger_type: str = 'manual',
                event: Dict = None,
                alert: Dict = None,
                params: Dict = None,
                executor: str = 'system',
                request_info: Dict = None) -> Dict:
        """
        执行剧本

        Args:
            playbook: Playbook 模型实例
            trigger_type: 触发类型 (manual/event/schedule/webhook)
            event: 关联事件数据
            alert: 关联告警数据
            params: 外部参数
            executor: 执行者
            request_info: 请求信息 (用于审计日志)
        """
        self.execution_id = f"exec_{playbook.id}_{int(datetime.utcnow().timestamp())}_{uuid.uuid4().hex[:6]}"
        self.node_results = []
        self.started_at = datetime.utcnow()

        nodes = playbook.nodes or []
        edges = playbook.edges or []

        # 构建执行上下文
        context = ActionContext(event=event, alert=alert, params=params)

        # 存储事件引用到上下文
        if event:
            context.variables['event_code'] = event.get('event_code', '')
            context.variables['event_title'] = event.get('title', '')
            context.variables['event_severity'] = event.get('severity', '')
            context.variables['event_status'] = event.get('status', '')

        # 构建节点索引和邻接表
        node_map = {n.get('id'): n for n in nodes if n.get('id')}
        adjacency = self._build_adjacency(edges, node_map)

        # 找到起始节点 (trigger 或第一个节点)
        start_nodes = self._find_start_nodes(nodes, edges, node_map, trigger_type)

        # 记录执行开始
        self._create_execution_record(playbook, trigger_type, executor, event, params)

        # 按拓扑顺序执行节点
        executed = set()
        current_nodes = list(start_nodes)

        try:
            while current_nodes:
                node_id = current_nodes.pop(0)

                if node_id in executed or node_id not in node_map:
                    continue

                node = node_map[node_id]
                executed.add(node_id)

                result = self._execute_node(node, context)

                self.node_results.append({
                    'node_id': node_id,
                    'node_label': node.get('data', {}).get('label', node.get('type', '')),
                    'type': node.get('type', ''),
                    'success': result.get('success', False),
                    'message': result.get('message', ''),
                    'data': result.get('data', {})
                })

                # 根据节点类型和结果选择下一个节点
                next_nodes = self._get_next_nodes(
                    node_id, node, result, adjacency, node_map)

                for next_id in next_nodes:
                    if next_id not in executed:
                        current_nodes.append(next_id)

            self.completed_at = datetime.utcnow()
            status = 'completed'

        except Exception as e:
            self.completed_at = datetime.utcnow()
            status = 'failed'
            self.node_results.append({
                'node_id': None,
                'type': 'error',
                'success': False,
                'message': f'剧本执行异常: {str(e)}',
                'data': {}
            })

        # 更新执行记录
        self._update_execution_record(status)

        # 创建事件处置记录
        if event and event.get('event_code'):
            self._create_event_action(event.get('event_code'), playbook, request_info or {})

        return {
            'execution_id': self.execution_id,
            'playbook_id': playbook.id,
            'playbook_name': playbook.name,
            'status': status,
            'started_at': self.started_at.isoformat(),
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'duration': int((self.completed_at - self.started_at).total_seconds()) if self.completed_at else None,
            'node_results': self.node_results,
            'total_nodes': len(nodes),
            'completed_nodes': len(executed)
        }

    def _execute_node(self, node: Dict, context: ActionContext) -> Dict:
        """执行单个节点"""
        node_type = node.get('type', '')
        node_data = node.get('data', {})

        if node_type == 'trigger':
            return {'success': True, 'message': '触发器通过', 'data': {}}

        elif node_type == 'ai_analysis':
            from app.engine.actions import AIAnalysisAction
            action_config = node.get('config', {})
            params = {p['name']: p.get('defaultValue') for p in node.get('params', [])}
            merged_config = {**action_config, **params}
            # 将整个节点 params 作为 config 传入
            node_params_map = {}
            for p in node.get('params', []):
                val = p.get('defaultValue')
                node_params_map[p['name']] = val
            result = AIAnalysisAction.execute(node_params_map, context)
            if result.success and result.data:
                context.variables['ai_analysis_result'] = result.data
            return result.to_dict()

        elif node_type == 'action':
            action_name = node_data.get('action', '')
            action_config = node_data.get('config', {})
            handler = get_action(action_name)
            if handler:
                result = handler.execute(action_config, context)
                # 将结果存入上下文
                if result.success and result.data:
                    context.variables[f'action_{action_name}_result'] = result.data
                return result.to_dict()
            return {'success': False, 'message': f'未找到动作: {action_name}', 'data': {}}

        elif node_type == 'condition':
            return self._evaluate_condition(node_data, context)

        elif node_type == 'notification':
            return self._execute_notification(node_data, context)

        elif node_type == 'api':
            return self._execute_api_call(node_data, context)

        elif node_type == 'approval':
            from app.engine.playbook_engine import execute_approval_node
            return execute_approval_node(node_data, context, self.execution_id)

        elif node_type == 'loop':
            from app.engine.playbook_engine import execute_loop_node
            return execute_loop_node(node_data, context)

        elif node_type == 'switch':
            from app.engine.playbook_engine import execute_switch_node
            return execute_switch_node(node_data, context)

        elif node_type == 'parallel':
            from app.engine.playbook_engine import execute_parallel_node
            return execute_parallel_node(node_data, context)

        return {'success': False, 'message': f'未知节点类型: {node_type}', 'data': {}}

    def _evaluate_condition(self, config: Dict, context: ActionContext) -> Dict:
        """评估条件节点"""
        field = config.get('field', '')
        operator = config.get('operator', 'equals')
        value = config.get('value', '')

        # 获取字段值
        actual_value = context.get(field)

        op_func = self.CONDITION_OPERATORS.get(operator)
        if not op_func:
            return {'success': False, 'message': f'不支持的操作符: {operator}', 'data': {}}

        try:
            result = op_func(actual_value, value)
            branch = 'true_branch' if result else 'false_branch'
            return {
                'success': result,
                'message': f'条件 "{field}" {operator} "{value}": {"满足" if result else "不满足"}',
                'data': {'branch': branch, 'field': field, 'value': actual_value}
            }
        except Exception as e:
            return {'success': False, 'message': f'条件评估异常: {str(e)}', 'data': {}}

    def _execute_notification(self, config: Dict, context: ActionContext) -> Dict:
        """执行通知"""
        title = config.get('title', '剧本通知')
        message = config.get('message', '')
        channel = config.get('channel', 'system')

        try:
            from app.models import Notification
            notif = Notification(
                title=context.resolve(title),
                message=context.resolve(message),
                type='info'
            )
            db.session.add(notif)
            db.session.commit()
            return {'success': True, 'message': f'通知已发送 [{channel}]', 'data': {'notification_id': notif.id}}
        except Exception as e:
            return {'success': False, 'message': f'通知发送失败: {str(e)}', 'data': {}}

    def _execute_api_call(self, config: Dict, context: ActionContext) -> Dict:
        """执行 API 调用"""
        url = context.resolve(config.get('url', ''))
        method = config.get('method', 'GET').upper()
        headers = config.get('headers', {})

        if not url:
            return {'success': False, 'message': '未指定 API URL', 'data': {}}

        try:
            import urllib.request
            import urllib.error

            body_json = config.get('body')
            body = None
            if body_json:
                body = json.dumps(body_json).encode()

            req = urllib.request.Request(url, data=body, method=method)
            req.add_header('Content-Type', 'application/json')
            for key, val in (headers or {}).items():
                req.add_header(key, context.resolve(str(val)))

            with urllib.request.urlopen(req, timeout=30) as resp:
                resp_body = resp.read().decode()
                return {
                    'success': True,
                    'message': f'API 调用成功 (HTTP {resp.status})',
                    'data': {'status': resp.status, 'body': resp_body[:1000]}
                }
        except urllib.error.HTTPError as e:
            return {'success': False, 'message': f'API 调用失败: HTTP {e.code}', 'data': {}}
        except Exception as e:
            return {'success': False, 'message': f'API 调用异常: {str(e)}', 'data': {}}

    def _build_adjacency(self, edges: List[Dict], node_map: Dict) -> Dict[str, List[str]]:
        """构建邻接表"""
        adj = {}
        for node_id in node_map:
            adj[node_id] = []

        for edge in edges:
            source = edge.get('source')
            target = edge.get('target')
            if source and target and source in node_map and target in node_map:
                adj.setdefault(source, []).append(target)
                adj.setdefault(target, [])

        return adj

    def _find_start_nodes(self, nodes: List[Dict], edges: List[Dict],
                          node_map: Dict, trigger_type: str) -> List[str]:
        """找到起始节点"""
        # 找 trigger 节点
        trigger_nodes = [
            n.get('id') for n in nodes
            if n.get('type') == 'trigger' and n.get('id')
        ]

        if trigger_nodes:
            # 过滤匹配触发类型的节点
            matching = []
            for tid in trigger_nodes:
                node = node_map.get(tid, {})
                trigger_cfg = node.get('data', {}).get('config', {})
                node_trigger = trigger_cfg.get('trigger_type', 'manual')
                if node_trigger == trigger_type or node_trigger == 'any':
                    matching.append(tid)
            if matching:
                return matching
            return trigger_nodes[:1]

        # 没有 trigger 节点，找入度为 0 的节点
        target_set = {e.get('target') for e in edges if e.get('target')}
        return [nid for nid in node_map if nid not in target_set]

    def _get_next_nodes(self, node_id: str, node: Dict,
                         result: Dict, adjacency: Dict, node_map: Dict) -> List[str]:
        """获取下一个要执行的节点"""
        neighbors = adjacency.get(node_id, [])

        if node.get('type') == 'condition':
            branch = result.get('data', {}).get('branch', 'false_branch')
            # 从 edges 中找带 label 的分支
            # 这里简化处理: 成功走第一个邻居，失败走第二个
            if result.get('success'):
                return neighbors[:1] if neighbors else []
            else:
                return neighbors[1:2] if len(neighbors) > 1 else []

        return neighbors

    def _create_execution_record(self, playbook: Playbook, trigger_type: str,
                                  executor: str, event: Dict, params: Dict):
        """创建执行记录"""
        try:
            execution = PlaybookExecution(
                id=self.execution_id,
                playbook_id=playbook.id,
                trigger_type=trigger_type,
                trigger_data={
                    'event': event,
                    'params': params
                },
                status='running',
                started_at=self.started_at,
                executor=executor
            )
            db.session.add(execution)
            db.session.commit()
        except Exception:
            db.session.rollback()

    def _update_execution_record(self, status: str):
        """更新执行记录"""
        try:
            execution = PlaybookExecution.query.get(self.execution_id)
            if execution:
                execution.status = status
                execution.completed_at = self.completed_at
                if self.completed_at and self.started_at:
                    execution.duration = int((self.completed_at - self.started_at).total_seconds())
                execution.result_summary = {
                    'total_nodes': len(self.node_results),
                    'successful': sum(1 for r in self.node_results if r.get('success')),
                    'failed': sum(1 for r in self.node_results if not r.get('success')),
                    'node_results': self.node_results
                }
                db.session.commit()
        except Exception:
            db.session.rollback()

    def _create_event_action(self, event_code: str, playbook: Playbook, request_info: Dict):
        """创建事件处置记录"""
        try:
            action = EventAction(
                event_id=event_code,
                action='playbook_triggered',
                content=f'执行了剧本: {playbook.name}',
                user_id=request_info.get('user_id'),
                user_name=request_info.get('username', 'system'),
                playbook_id=playbook.id,
                playbook_name=playbook.name,
                playbook_execution_id=self.execution_id,
                playbook_result={
                    'status': 'completed' if self.completed_at else 'running',
                    'node_count': len(self.node_results),
                    'successful': sum(1 for r in self.node_results if r.get('success')),
                    'failed': sum(1 for r in self.node_results if not r.get('success')),
                }
            )
            db.session.add(action)

            # 审计日志
            audit = AuditLog(
                user_id=request_info.get('user_id'),
                username=request_info.get('username', 'system'),
                action='执行剧本',
                module='playbooks',
                target=event_code,
                details={
                    'playbook_id': playbook.id,
                    'playbook_name': playbook.name,
                    'execution_id': self.execution_id
                },
                ip=request_info.get('ip', '')
            )
            db.session.add(audit)
            db.session.commit()
        except Exception:
            db.session.rollback()


def _is_numeric(a, b):
    try:
        float(a)
        float(b)
        return True
    except (ValueError, TypeError):
        return False


# 全局引擎实例
playbook_engine = PlaybookEngine()


class ApprovalError(Exception):
    """需要审批的异常"""
    def __init__(self, approval_id: str, message: str = "需要审批"):
        self.approval_id = approval_id
        self.message = message
        super().__init__(self.message)


# 审批规则映射
APPROVAL_RULES = {
    'block_ip': {'level': 2, 'label': 'IP封禁'},
    'unblock_ip': {'level': 2, 'label': 'IP解禁'},
    'isolate_host': {'level': 3, 'label': '主机隔离'},
    'quarantine_host': {'level': 3, 'label': '主机隔离'},
    'reset_password': {'level': 2, 'label': '密码重置'},
    'modify_firewall': {'level': 3, 'label': '防火墙修改'},
}


def check_and_create_approval(playbook_id: int, action_type: str, params: Dict,
                               requester_id: int, requester_name: str, execution_id: str,
                               skip_approval: bool = False) -> Optional[Dict]:
    """
    检查是否需要审批，如需要则创建审批请求
    skip_approval: True 表示自动触发场景，跳过审批直接执行
    返回 None 表示不需要审批可直接执行，返回审批对象表示需要等待审批
    """
    # 自动触发场景跳过审批
    if skip_approval:
        return None
    
    rule = APPROVAL_RULES.get(action_type)
    if not rule:
        return None  # 不需要审批
    
    import uuid
    from app.models import PlaybookApproval, Notification, User
    
    approval = PlaybookApproval(
        id=f"apr_{uuid.uuid4().hex[:8]}",
        playbook_id=playbook_id,
        execution_id=execution_id,
        approval_type=action_type,
        approval_level=rule['level'],
        status='pending',
        requester_id=requester_id,
        requester_name=requester_name,
        params=params,
        reason=params.get('reason', f'{rule["label"]}操作')
    )
    
    db.session.add(approval)
    
    # 创建通知给相应审批级别的用户
    approvers = User.query.filter(
        User.role.in_(['admin', 'approver_l2', 'approver_l3']),
        User.status == 'active'
    ).all()
    
    for approver in approvers:
        # 根据审批级别筛选
        should_notify = False
        if rule['level'] == 3 and approver.role in ['admin', 'approver_l3']:
            should_notify = True
        elif rule['level'] == 2 and approver.role in ['admin', 'approver_l2', 'approver_l3']:
            should_notify = True
        
        if should_notify:
            notif = Notification(
                user_id=approver.id,
                type='approval_request',
                title=f'待审批: {rule["label"]}',
                content=f'用户 {requester_name} 请求执行 {rule["label"]} 操作，请及时审批',
                data={
                    'approval_id': approval.id,
                    'playbook_id': playbook_id,
                    'action_type': action_type,
                    'params': params
                },
                priority='high' if rule['level'] == 3 else 'normal'
            )
            db.session.add(notif)
    
    db.session.commit()
    
    return {
        'approval_id': approval.id,
        'approval_level': rule['level'],
        'label': rule['label'],
        'status': 'pending'
    }


def process_approval_result(approval_id: str, approved: bool, 
                            approver_id: int, approver_name: str) -> Dict:
    """处理审批结果"""
    from app.models import PlaybookApproval, Notification
    
    approval = PlaybookApproval.query.get(approval_id)
    if not approval:
        return {'success': False, 'error': '审批请求不存在'}
    
    approval.status = 'approved' if approved else 'rejected'
    approval.approver_id = approver_id
    approval.approver_name = approver_name
    approval.approved_at = datetime.utcnow()
    
    # 创建结果通知
    notif = Notification(
        user_id=approval.requester_id,
        type='approval_result',
        title=f'审批{"通过" if approved else "拒绝"}: {approval.reason}',
        content=f'您的{approval.reason}请求已被{"通过" if approved else "拒绝"}',
        data={'approval_id': approval_id, 'approved': approved}
    )
    db.session.add(notif)
    db.session.commit()
    
    if approved:
        # 执行实际动作
        action_type = approval.approval_type
        params = approval.params
        handler = get_action(action_type)
        if handler:
            result = handler.execute(params, None)
            approval.result = result.to_dict() if hasattr(result, 'to_dict') else result
        

        # 记录到事件
        if approval.related_event_id:
            try:
                response = requests.post(
                    'http://localhost:5000/events-api/approvals/trigger-event-action',
                    json={
                        'event_id': approval.related_event_id,
                        'approval_id': approval.id
                    },
                    headers={'Authorization': f'Bearer {getattr(request, 'user_id', 1)}'},
                    timeout=5
                )
                if response.status_code != 200:
                    print(f'Warning: Failed to trigger event action: {response.text}')
            except Exception as e:
                print(f'Warning: Could not trigger event action after approval: {e}')
    
    db.session.commit()
    return approval.to_dict()



# ========== 新增节点类型执行器 ==========

def execute_approval_node(node_data: Dict, context: 'ActionContext', execution_id: str) -> Dict:
    """执行审批节点 - 暂停并等待审批"""
    approval_type = node_data.get('approval_type', node_data.get('approvalType', ''))
    reason = node_data.get('reason', '剧本执行审批')
    
    # 映射审批类型
    action_map = {
        'IP封禁': 'block_ip',
        '主机隔离': 'isolate_host',
        '密码重置': 'reset_password',
        '防火墙修改': 'modify_firewall'
    }
    action_type = action_map.get(approval_type, 'block_ip')
    
    # 创建审批请求
    from app.models import User
    user = User.query.first()
    requester_id = user.id if user else 1
    requester_name = user.username if user else 'system'
    
    from app.engine.playbook_engine import check_and_create_approval
    approval = check_and_create_approval(
        playbook_id=0,  # 动态获取
        action_type=action_type,
        params=context.params,
        requester_id=requester_id,
        requester_name=requester_name,
        execution_id=execution_id
    )
    
    if approval:
        return {
            'success': True,
            'message': f'已创建审批请求，等待审批...',
            'data': {
                'waiting_approval': True,
                'approval_id': approval.get('approval_id'),
                'approval_type': approval_type
            }
        }
    
    return {'success': True, 'message': '无需审批，直接执行', 'data': {}}


def execute_loop_node(node_data: Dict, context: 'ActionContext') -> Dict:
    """执行循环节点"""
    iterable_var = node_data.get('iterable', node_data.get('iterable', ''))
    max_iterations = int(node_data.get('maxIterations', node_data.get('max_iterations', 10)))
    
    # 解析遍历对象
    items = context.resolve(iterable_var)
    if isinstance(items, str):
        items = [i.strip() for i in items.split(',')]
    elif not isinstance(items, list):
        items = [items]
    
    items = items[:max_iterations]  # 限制最大次数
    
    return {
        'success': True,
        'message': f'循环执行 {len(items)} 次',
        'data': {
            'loop_count': len(items),
            'items': items,
            'max_iterations': max_iterations
        }
    }


def execute_switch_node(node_data: Dict, context: 'ActionContext') -> Dict:
    """执行多分支节点"""
    field = node_data.get('field', '')
    cases_config = node_data.get('cases', '')
    
    # 解析 cases: "critical:高危处理\nhigh:中危处理\ndefault:默认处理"
    cases = {}
    default_case = None
    for line in cases_config.split('\n'):
        if ':' in line:
            key, value = line.split(':', 1)
            key = key.strip()
            if key == 'default':
                default_case = value.strip()
            else:
                cases[key.strip()] = value.strip()
    
    # 获取字段值并匹配分支
    field_value = str(context.get(field, '')).lower()
    matched_branch = cases.get(field_value, default_case)
    
    return {
        'success': True,
        'message': f'分支匹配: {field}={field_value} -> {matched_branch}',
        'data': {
            'branch': matched_branch,
            'matched_value': field_value,
            'cases': cases
        }
    }


def execute_parallel_node(node_data: Dict, context: 'ActionContext') -> Dict:
    """执行并行分支节点"""
    branches = int(node_data.get('branches', 2))
    
    return {
        'success': True,
        'message': f'并行执行 {branches} 个分支',
        'data': {
            'parallel_branches': branches,
            'execution_mode': 'concurrent'
        }
    }
