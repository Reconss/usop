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

    # 前端画布 typeId → 引擎执行语义类型
    TYPE_ALIASES = {
        'notify': 'notification',   # 多渠道通知
    }

    # 触发类型归一化：前端画布中文 / 引擎英文 → 统一键
    TRIGGER_TYPE_ALIASES = {
        '告警事件': 'alert', 'alert': 'alert', 'event': 'alert', '告警': 'alert',
        '定时任务': 'schedule', 'schedule': 'schedule', 'cron': 'schedule',
        '手动触发': 'manual', 'manual': 'manual',
        'webhook': 'webhook', 'Webhook': 'webhook',
    }

    # 业务语义节点 → 内置动作名（前端 typeId 即决定调用哪个动作）
    SEMANTIC_ACTION_MAP = {
        'block': 'block_ip',            # IP 封堵
        'isolate': 'quarantine_host',   # 主机隔离
        'script': 'run_script',         # 执行脚本
        'ticket': 'create_ticket',      # 创建工单
        'query': 'query_data',          # 数据查询
        'enrich': 'enrich_ip',          # 情报补全
        'ai': 'ai_llm',                 # AI 大模型（Coze 风格：提示词 + 输出契约）
        'recall': 'recall_experience',  # STE 经验库召回（知识库节点）
        'email': 'send_email',          # SMTP 邮件发送
        'create_event': 'create_event',  # 告警聚合生成事件（含去重）
        'update_event': 'update_event',  # 更新事件状态/回写分析结论
    }

    # 前端画布中文运算符 → 引擎运算符
    OPERATOR_ALIASES = {
        '等于': 'equals', '不等于': 'not_equals',
        '包含': 'contains', '不包含': 'not_contains',
        '大于': 'greater_than', '小于': 'less_than',
        '属于': 'in_list', '不属于': 'not_in_list',
        '开头是': 'starts_with', '结尾是': 'ends_with',
        '为空': 'is_empty', '不为空': 'is_not_empty',
        '正则匹配': 'regex_match',
    }

    # 条件运算符
    CONDITION_OPERATORS = {
        # equals/not_equals 对布尔值做大小写不敏感比较（AI 节点输出 True vs 配置 'true'）
        'equals': lambda a, b: (str(a).lower() == str(b).lower()
                                if isinstance(a, bool) or str(b).lower() in ('true', 'false')
                                else str(a) == str(b)),
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

        # 前端画布格式与引擎内部格式不同，进入执行前统一适配（见 _normalize_node）
        nodes = [self._normalize_node(n) for n in (playbook.nodes or [])]
        edges = playbook.edges or []
        # 老数据/前端直存时只有 nodes[].outputs，无 edges —— 就地补齐拓扑
        if not edges:
            edges = self._outputs_to_edges(playbook.nodes or [])

        # 构建执行上下文（携带 playbook_id，供审批节点关联正确剧本）
        context = ActionContext(event=event, alert=alert, params=params)
        context.playbook_id = playbook.id

        # 存储事件引用到上下文
        if event:
            context.variables['event_code'] = event.get('event_code', '')
            context.variables['event_title'] = event.get('title', '')
            context.variables['event_severity'] = event.get('severity', '')
            context.variables['event_status'] = event.get('status', '')

        # 构建节点索引和邻接表
        node_map = {n.get('id'): n for n in nodes if n.get('id')}
        adjacency = self._build_adjacency(edges, node_map)
        # 反向邻接：用于把上游节点的输出汇聚成当前节点的输入 items
        reverse_adj = self._build_reverse_adjacency(edges, node_map)

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

                # n8n 数据流：当前节点输入 = 直接上游已执行节点的输出
                node_label = node.get('data', {}).get('label') or node.get('name') or node_id
                context.current_node = node_label
                context.current_node_id = node_id
                in_items = self._collect_input_items(node_id, reverse_adj, context, executed)
                context.set_input_items(in_items)

                result = self._execute_node(node, context)

                # 注册输出供下游 {{ $('节点名').json.x }} 引用
                out_items = self._compose_output(result, context)
                context.set_node_output(node_label, node_id, out_items)

                self.node_results.append({
                    'node_id': node_id,
                    'node_label': node_label,
                    'type': node.get('type', ''),
                    'success': result.get('success', False),
                    'message': result.get('message', ''),
                    'data': result.get('data', {}),
                    # 数据快照：这个节点向下游交出了哪些数据项（便于排障"数据怎么流动的"）
                    'item_count': len(out_items),
                    'items': [i.get('json') for i in out_items][:20],
                    # 入/出字段清单：配置面板的引用选择器据此列出真实可引用字段
                    'input_count': len(in_items),
                    'input_keys': list((in_items[0].get('json') or {}).keys())[:20] if in_items else [],
                    'output_keys': list((out_items[0].get('json') or {}).keys())[:20] if out_items else [],
                    # AI 节点来源标记（is_ai=False 表示走了规则兜底，UI 需显式降级提示）
                    'source': (result.get('data') or {}).get('source') if isinstance(result.get('data'), dict) else None,
                    'is_ai': (result.get('data') or {}).get('is_ai') if isinstance(result.get('data'), dict) else None,
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

    @staticmethod
    def _build_reverse_adjacency(edges: List[Dict], node_map: Dict) -> Dict[str, list]:
        """构建反向邻接表 {目标节点: [上游节点, ...]}，用于汇聚输入 items。"""
        rev: Dict[str, list] = {}
        for e in (edges or []):
            if not isinstance(e, dict):
                continue
            s, t = e.get('source'), e.get('target')
            if s in node_map and t in node_map:
                rev.setdefault(t, [])
                if s not in rev[t]:
                    rev[t].append(s)
        return rev

    def _collect_input_items(self, node_id: str, reverse_adj: Dict,
                             context: 'ActionContext', executed: set) -> list:
        """当前节点的输入 items：所有直接上游已执行节点的输出按序拼接。

        无上游（起始节点）或上游未产出数据时，回退为初始上下文负载单 item，
        保证 {{ $json.xxx }} / {{ src_ip }} 在任何位置都能取到触发数据。
        """
        items = []
        for src in reverse_adj.get(node_id, []):
            if src not in executed:
                continue
            out = context.node_outputs.get(src)
            if out is None:
                continue
            for idx, it in enumerate(out.items):
                items.append({
                    'json': dict(it.get('json') or {}),
                    'paired_items': [{'node': src, 'index': idx}],
                })
        if not items:
            items = [{'json': context.snapshot_json()}]
        return items

    def _compose_output(self, result: Dict, context: 'ActionContext') -> list:
        """节点输出 items：显式 items 优先；否则把结果 data 合并进输入项后透传。

        合并而非替换，是为了让数据在链路上持续累积（安全处置场景里下游常需要
        同时拿到原始告警字段和本节点的处置结果）；需要精确整形时用「字段整形」节点。
        """
        if isinstance(result.get('items'), list):
            return [{'json': i.get('json') if isinstance(i, dict) and 'json' in i else i,
                     'paired_items': (i.get('paired_items') if isinstance(i, dict) else [])}
                    for i in result['items']]
        data = result.get('data') or {}
        base_items = context.items or []
        if not base_items:
            return [{'json': dict(data) if isinstance(data, dict) else {'value': data}}]
        merged = []
        for it in base_items:
            nj = dict(it.get('json') or {})
            if isinstance(data, dict):
                nj.update(data)
            elif data:
                nj['value'] = data
            merged.append({'json': nj, 'paired_items': it.get('paired_items', [])})
        return merged

    @staticmethod
    def _outputs_to_edges(nodes: List[Dict]) -> List[Dict]:
        """nodes[].outputs[] → edges[]（引擎拓扑所需）。"""
        edges = []
        for n in (nodes or []):
            if not isinstance(n, dict):
                continue
            src = n.get('id')
            if not src:
                continue
            for tgt in (n.get('outputs') or []):
                if tgt:
                    edges.append({'id': f'e_{src}_{tgt}', 'source': src, 'target': tgt})
        return edges

    @staticmethod
    def _parse_duration(expr: str) -> int:
        """解析时长表达式：30s / 5m / 2h / 1d，纯数字按秒。"""
        import re as _re
        m = _re.fullmatch(r'(\d+)\s*([smhd]?)', str(expr or '').strip().lower())
        if not m:
            return 0
        return int(m.group(1)) * {'': 1, 's': 1, 'm': 60, 'h': 3600, 'd': 86400}[m.group(2)]

    @staticmethod
    def _normalize_node(raw: Dict) -> Dict:
        """前端画布节点 → 引擎内部节点格式。

        前端: {id, typeId, name, config, position, outputs}
        引擎: {id, type, data: {label, config}}
        已是引擎格式的节点（含 data 且无 typeId）原样返回。
        """
        if not isinstance(raw, dict):
            return {}
        if raw.get('type') and not raw.get('typeId'):
            return raw
        return {
            'id': raw.get('id'),
            'type': raw.get('typeId') or raw.get('type') or '',
            'data': {
                'label': raw.get('name', ''),
                'config': raw.get('config', {}) or {},
            },
            'position': raw.get('position', {}),
        }

    def _execute_node(self, node: Dict, context: ActionContext) -> Dict:
        """执行单个节点

        前端画布的 typeId 是业务语义命名（block/isolate/script/ticket/query/enrich/notify），
        引擎内部是执行语义命名（action/notification）；TYPE_ALIASES 负责归约。
        """
        raw_type = node.get('type', '')
        node_data = node.get('data', {}) or {}
        config = node_data.get('config', {}) or node.get('config', {}) or {}
        node_type = self.TYPE_ALIASES.get(raw_type, raw_type)

        # 业务语义节点：直接调用对应内置动作，不依赖 config.action 填写正确
        builtin = self.SEMANTIC_ACTION_MAP.get(raw_type)
        if builtin:
            handler = get_action(builtin)
            if not handler:
                return {'success': False, 'message': f'未找到动作: {builtin}', 'data': {}}
            result = handler.execute(config, context)
            if result.success and result.data:
                context.variables[f'action_{builtin}_result'] = result.data
                # 情报富化节点：把归一化摘要（危害等级/评分）写成扁平变量。
                # 微步响应是 data.<ip>.judgments 这种嵌套结构，condition 取不到，
                # 不压平的话「查完情报再决定是否封禁」这条路走不通。
                if builtin == 'enrich_ip' and isinstance(result.data, dict):
                    summary = result.data.get('summary')
                    if not isinstance(summary, dict) or not summary:
                        summary = self._inject_intel_summary(result.data.get('data') or {},
                                                             'auto', context)
                    self._apply_intel_summary(summary, context)
            out = result.to_dict()
            # 并进节点输出项：只写 variables 的话条件能判，但 $json.threat_level
            # 与配置面板的引用选择器都看不到（情报字段藏在 summary 子对象里）
            if builtin == 'enrich_ip' and result.success:
                self._merge_intel_into_result(out, (result.data or {}).get('summary'))
            return out

        if node_type == 'trigger':
            # 触发数据作为输出项交给下游（引用选择器/ {{ $json.xxx }} 都能看到）
            snapshot = context.snapshot_json()
            return {'success': True, 'message': '触发器通过',
                    'data': {k: v for k, v in snapshot.items()
                             if not k.startswith('_')} or {'triggered': True},
                    'items': [{'json': snapshot}]}

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
            # 画布格式动作名在 config.action；旧引擎格式在 data.action
            action_name = config.get('action') or node_data.get('action', '')
            action_config = dict(config)
            # params 字段：JSON 或每行 key=value，支持表达式 —— 通用动作的参数来源
            params_raw = config.get('params')
            if isinstance(params_raw, str) and params_raw.strip():
                try:
                    parsed = json.loads(params_raw)
                    if isinstance(parsed, dict):
                        for k, v in parsed.items():
                            action_config[k] = context.resolve(v) if isinstance(v, str) else v
                except (ValueError, TypeError):
                    for line in params_raw.splitlines():
                        if '=' in line:
                            k, _, v = line.partition('=')
                            k = k.strip()
                            if k:
                                action_config[k] = context.resolve(v.strip())
            elif isinstance(params_raw, dict):
                action_config.update(params_raw)
            # values 字段：参数配置表单（schema 驱动）写入的结构化参数，优先于 params
            values = config.get('values')
            if isinstance(values, dict):
                for k, v in values.items():
                    if isinstance(v, str):
                        action_config[k] = context.resolve(v)
                    else:
                        action_config[k] = v
            handler = get_action(action_name)
            if handler:
                result = handler.execute(action_config, context)
                # 标记动作名：执行记录页据此识别处置类型（封禁IP/隔离主机等）
                if isinstance(result.data, dict):
                    result.data.setdefault('action', action_name)
                # 将结果存入上下文
                if result.success and result.data:
                    context.variables[f'action_{action_name}_result'] = result.data
                    # 情报富化节点：把归一化摘要（危害等级/评分）写成扁平变量，
                    # 否则下游 condition 取不到嵌套在 data.<ip> 下的 judgments。
                    if action_name == 'enrich_ip' and isinstance(result.data, dict):
                        summary = result.data.get('summary')
                        if not isinstance(summary, dict) or not summary:
                            summary = self._inject_intel_summary(
                                result.data.get('data') or {}, 'auto', context)
                        else:
                            self._apply_intel_summary(summary, context)
                return result.to_dict()
            return {'success': False,
                    'message': f'未找到动作: {action_name}（可用：block_ip / unblock_ip / '
                               f'quarantine_host / create_ticket / enrich_ip / run_script ...）',
                    'data': {'action': action_name}}

        elif node_type == 'condition':
            return self._evaluate_condition(config, context)

        elif node_type == 'notification':
            return self._execute_notification(config, context)

        elif node_type == 'api':
            return self._execute_api_call(config, context)

        elif node_type == 'http_request':
            return self._execute_http_request(config, context)

        elif node_type == 'send_email':
            from app.engine.actions import SendEmailAction
            result = SendEmailAction.execute(config, context)
            return result.to_dict()

        # ---- 数据处理节点（对齐 n8n 的 Edit Fields / Code / Merge / Split Out / Aggregate / Filter）----
        elif node_type == 'transform':
            return self._execute_transform(config, context)

        elif node_type == 'code':
            return self._execute_code(config, context)

        elif node_type == 'merge':
            return self._execute_merge(config, context)

        elif node_type == 'split':
            return self._execute_split(config, context)

        elif node_type == 'aggregate':
            return self._execute_aggregate(config, context)

        elif node_type == 'filter':
            return self._execute_filter(config, context)

        elif node_type == 'delay':
            return self._execute_delay(config, context)

        elif node_type == 'approval':
            from app.engine.playbook_engine import execute_approval_node
            return execute_approval_node(config, context, self.execution_id)

        elif node_type == 'loop':
            from app.engine.playbook_engine import execute_loop_node
            return execute_loop_node(config, context)

        elif node_type == 'switch':
            from app.engine.playbook_engine import execute_switch_node
            return execute_switch_node(config, context)

        elif node_type == 'parallel':
            from app.engine.playbook_engine import execute_parallel_node
            return execute_parallel_node(config, context)

        return {'success': False, 'message': f'未知节点类型: {node_type}', 'data': {}}

    def _execute_http_request(self, config: Dict, context: ActionContext) -> Dict:
        """HTTP 请求节点执行体。

        两种模式：
        1. 绑定集成应用动作（config._app_id + _action_id）：加载应用与动作定义，
           校验必填参数，把用户填的值（含表达式）渲染成请求后执行；
           请求地址与认证由应用级配置提供。
        2. 手动模式：直接用 config 里的 url/method/headers/query/body。
        """
        from app.engine.actions import HttpRequestAction

        app_id = config.get('_app_id')
        if not app_id:
            return self._finalize_http_result(
                HttpRequestAction.execute(config, context).to_dict(), config, context)

        try:
            from app.models import IntegrationApp
            from app.services.integrations.importer import render_request
            app = IntegrationApp.query.get(int(app_id))
            if not app:
                return {'success': False, 'message': f'集成应用不存在: {app_id}', 'data': {}}
            if not app.enabled:
                return {'success': False, 'message': f'集成应用已停用: {app.name}', 'data': {}}
            action = next((a for a in (app.actions or [])
                           if a.get('id') == config.get('_action_id')), None)
            if not action:
                return {'success': False,
                        'message': f"动作不存在: {config.get('_action_id')}（应用 {app.name}）",
                        'data': {}}

            values = config.get('values') or {}
            # 必填校验：path/query/header 参数 + body required 字段
            missing = [p['name'] for p in (action.get('params') or [])
                       if p.get('required') and not str(values.get(p['name']) or '').strip()]
            missing += [k for k in ((action.get('body') or {}).get('required') or [])
                        if not str(values.get(k) or '').strip()]
            if missing:
                return {'success': False,
                        'message': f"缺少必填参数: {', '.join(missing)}",
                        'data': {'missing': missing}}

            # 值里的 {{ 表达式 }} 先解析，再替换 path/query/header
            resolved = {k: (context.resolve(v) if isinstance(v, str) else v)
                        for k, v in values.items()}
            req = render_request(app.to_dict(), action, resolved)

            result = HttpRequestAction.execute({
                'url': req['url'],
                'method': req['method'],
                'headers': req['headers'],
                'query': req['query'],
                'body': req['body'],
                'auth_app_id': app.id,
                'timeout': config.get('timeout') or 15,
            }, context)
            out = result.to_dict()
            # 附带应用/动作信息，便于执行记录排障
            if isinstance(out.get('data'), dict):
                out['data']['app'] = app.name
                out['data']['action'] = action.get('name')
            return self._finalize_http_result(out, config, context)
        except Exception as e:
            return self._finalize_http_result(
                {'success': False, 'message': f'HTTP 请求节点异常: {str(e)[:200]}', 'data': {}},
                config, context)

    def _finalize_http_result(self, result: Dict, config: Dict, context) -> Dict:
        """HTTP 节点结果收口：业务成败判定 + 结果注入上下文。

        为什么需要：HttpRequestAction 仅按 HTTP 状态码判定 success，而真实设备
        （防火墙 / EDR）常以 200 + 响应体错误码表示业务失败（如「IP 已在黑名单」）。
        因此提供可选的 `success_path`：从响应体中取指定路径作为真正的成败依据。

        config.success_path: 响应体中的点路径，如 `response.success` / `data.success`；
            取到布尔直接用；字符串按 true/1/ok/success 判定；路径以 `code` 结尾时 0 视为成功。
        config.intel_profile: 情报源标识（threatbook_ip / virustotal_ip / auto）。
            第三方情报接口（微步在线、VirusTotal）的响应里**没有危害等级字段**，
            且是 `data.<ip>.xxx` 这种嵌套结构（IP 里的点还会被误判为路径分隔符），
            condition 节点无法直接引用。配置后由 app/utils/threat_intel.py 归一化
            成扁平变量（threat_level / threat_score / is_malicious / threat_reason …）。
        写入上下文变量（供下游 condition / 通知节点用 {{ }} 引用）：
            http_request_ok        最终成败（bool）
            http_request_result    节点完整结果
            http_request_response  响应体（dict 或文本）
            http_request_data      响应体 data 段
            http_request_message   响应体 message 字段
            threat_level / threat_score / is_malicious / threat_tags / intel_types
            malware_family / threat_reason / threat_scene / threat_carrier
            threat_location / threat_permalink / intel_summary   （仅配置 intel_profile 时）
        """
        # 响应体位置：ActionResult.to_dict() 把 data 精简为 {status_code, url}，
        # 完整响应（含 response）只存在于 items[0].json —— 两处都尝试。
        data = result.get('data') or {}
        payload = None
        if isinstance(data, dict):
            payload = data.get('response')
        if payload is None:
            items = result.get('items') or []
            if items and isinstance(items[0], dict):
                payload = (items[0].get('json') or {}).get('response')

        path = str(config.get('success_path') or '').strip()
        # 兼容两种写法：payload 本身就是响应体，故 `response.success` 与 `success` 等价
        if path.startswith('response.') and isinstance(payload, dict) \
                and 'response' not in payload:
            path = path[len('response.'):]
        biz_ok = None
        if path and payload is not None:
            cur = payload
            for part in path.split('.'):
                if isinstance(cur, dict):
                    cur = cur.get(part)
                elif isinstance(cur, list) and part.isdigit():
                    cur = cur[int(part)] if int(part) < len(cur) else None
                else:
                    cur = None
                    break
            if isinstance(cur, bool):
                biz_ok = cur
            elif isinstance(cur, str):
                biz_ok = cur.strip().lower() in ('true', '1', 'ok', 'success', 'yes')
            elif isinstance(cur, (int, float)) and not isinstance(cur, bool):
                biz_ok = (cur == 0) if path.endswith('code') else bool(cur)

        if biz_ok is not None:
            result['success'] = bool(biz_ok)
            if isinstance(result.get('data'), dict):
                result['data']['business_success'] = bool(biz_ok)
            if not biz_ok and isinstance(payload, dict):
                msg = payload.get('message') or payload.get('error') or '设备返回业务失败'
                result['message'] = f"{result.get('message', '')} · 设备回执: {msg}"[:300]

        try:
            context.variables['http_request_result'] = result
            context.variables['http_request_ok'] = bool(result.get('success'))
            context.variables['http_request_response'] = payload
            if isinstance(payload, dict):
                context.variables['http_request_data'] = payload.get('data') or {}
                context.variables['http_request_message'] = str(payload.get('message') or '')
            # 威胁情报归一化（可选）：压平成 threat_level / threat_score 等扁平变量
            profile = str(config.get('intel_profile') or '').strip()
            if profile and profile.lower() not in ('none', 'off', '否', '无') \
                    and isinstance(payload, dict):
                summary = self._inject_intel_summary(payload, profile, context)
                self._merge_intel_into_result(result, summary)
        except Exception:
            pass
        return result

    @staticmethod
    def _intel_flat_fields(summary: Dict) -> Dict:
        """归一化摘要 → 扁平字段字典（变量名 → 值）。

        为什么要压平：情报响应是 data.<ip>.xxx 嵌套，而 condition 只查顶层键、
        引用选择器只列 item 的顶层字段，不压平就既判不了也选不到。
        """
        if not isinstance(summary, dict) or not summary:
            return {}
        # 注意：不注入 `severity`（摘要里虽有该别名）—— 它会覆盖事件自身的
        # severity，导致下游误把「情报等级」当成「事件级别」。判情报一律用 threat_level。
        mapping = {
            'threat_level': 'threat_level',
            'threat_score': 'threat_score',
            'is_malicious': 'is_malicious',
            'threat_tags': 'threat_tags',
            'intel_types': 'intel_types',
            'malware_family': 'malware_family',
            'threat_reason': 'threat_reason',
            'scene': 'threat_scene',
            'carrier': 'threat_carrier',
            'permalink': 'threat_permalink',
        }
        out = {dst: summary[src] for src, dst in mapping.items() if src in summary}
        country, city = summary.get('country') or '', summary.get('city') or ''
        out['threat_location'] = f'{country}{city}'
        out['intel_summary'] = summary
        return out

    def _apply_intel_summary(self, summary: Dict, context) -> None:
        """把归一化摘要写成上下文扁平变量（condition 只能读顶层键）。"""
        context.variables.update(self._intel_flat_fields(summary))

    def _merge_intel_into_result(self, result: Dict, summary: Dict) -> None:
        """把归一化字段并进节点**输出 items**，让下游 $json 与引用选择器可见。

        variables 注入只解决「条件能不能判」，items 注入才解决「下游能不能引用」：
        - 节点有显式 items（HTTP 节点）→ 写进 items[0].json
        - 否则（情报节点）→ 写进 result.data，由 _compose_output 合并进 items
        """
        if not isinstance(summary, dict) or not summary:
            return
        flat = self._intel_flat_fields(summary)
        items = result.get('items') or []
        if items and isinstance(items[0], dict):
            j = items[0].get('json')
            if isinstance(j, dict):
                j.update(flat)
                return
        if isinstance(result.get('data'), dict):
            result['data'].update(flat)

    def _inject_intel_summary(self, payload: Dict, profile: str, context) -> Dict:
        """HTTP 节点出口：识别情报响应并归一化注入。返回摘要（空 dict=未识别）。"""
        from app.utils.threat_intel import normalize_intel
        ip = context.get('src_ip') or context.get('ip') or ''
        summary = normalize_intel(profile, payload, str(ip or ''))
        if not summary:
            return {}
        self._apply_intel_summary(summary, context)
        return summary

    def _execute_delay(self, config: Dict, context: ActionContext) -> Dict:
        """延迟等待节点：解析 30s / 5m / 2h 形式的时长后休眠。

        上限 5 分钟，避免长时间阻塞执行线程（剧本线程是串行消费模型）。
        """
        import time
        seconds = self._parse_duration(config.get('duration', '5m'))
        seconds = max(0, min(seconds, 300))
        if seconds > 0:
            time.sleep(seconds)
        return {'success': True, 'message': f'已等待 {seconds} 秒', 'data': {'seconds': seconds}}

    # ============ 数据处理节点（n8n 数据模型：items 在节点间流动）============

    @staticmethod
    def _input_items(context: ActionContext) -> list:
        """取当前输入 items；无上游数据时回退为初始上下文负载单 item。"""
        return context.items or [{'json': context.snapshot_json(), 'paired_items': []}]

    @staticmethod
    def _as_bool(val, default: bool = False) -> bool:
        """把前端表单值（'是'/'否'/true/false/1/0）转成布尔。"""
        if val is None:
            return default
        if isinstance(val, bool):
            return val
        s = str(val).strip().lower()
        if s in ('', '否', 'false', 'no', '0', 'off'):
            return False
        if s in ('是', 'true', 'yes', '1', 'on'):
            return True
        return default

    @staticmethod
    def _coerce_scalar(val):
        """字符串字面量做轻量类型推断，让整形结果带上正确类型。"""
        if not isinstance(val, str):
            return val
        s = val.strip()
        if s.lower() in ('true', 'false'):
            return s.lower() == 'true'
        if s.lower() in ('null', 'none', ''):
            return None if s.lower() != '' else ''
        try:
            if s.lstrip('-').isdigit():
                return int(s)
            return float(s)
        except ValueError:
            return val

    def _execute_transform(self, config: Dict, context: ActionContext) -> Dict:
        """字段整形（n8n: Edit Fields / Set）。

        config:
          assignments / fields : [{'name': 'x', 'value': '{{...}}'}] 或 {'x': '...'}
          keep_only            : 只保留本次赋值的字段（丢掉其余，输出干净负载）
          remove_fields        : 要删除的字段名列表或逗号串
          infer_types          : 字符串字面量是否做类型推断（默认 true）
        """
        raw = config.get('assignments') or config.get('fields') or []
        pairs = []
        if isinstance(raw, dict):
            pairs = [(k, v) for k, v in raw.items()]
        elif isinstance(raw, str):
            # 前端 textarea 形式：每行一条 name = value
            for line in raw.splitlines():
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    k, v = line.split('=', 1)
                    pairs.append((k.strip(), v.strip()))
        else:
            for a in (raw or []):
                if isinstance(a, dict) and a.get('name'):
                    pairs.append((a.get('name'), a.get('value')))
                elif isinstance(a, (list, tuple)) and len(a) == 2:
                    pairs.append((a[0], a[1]))

        keep_only = self._as_bool(config.get('keep_only'))
        remove = config.get('remove_fields') or config.get('remove') or []
        if isinstance(remove, str):
            remove = [r.strip() for r in remove.split(',') if r.strip()]
        infer = self._as_bool(config.get('infer_types'), default=True)

        out = []
        for it in self._input_items(context):
            data = {} if keep_only else dict(it.get('json') or {})
            for name, val in pairs:
                resolved = context.resolve(val)
                data[str(name)] = self._coerce_scalar(resolved) if infer else resolved
            for r in remove:
                data.pop(str(r), None)
            out.append({'json': data, 'paired_items': it.get('paired_items', [])})

        return {'success': True,
                'message': f'字段整形完成：{len(out)} 项，{"覆盖" if keep_only else "追加"} {len(pairs)} 个字段',
                'data': {'count': len(out), 'kept_only': keep_only},
                'items': out}

    # 代码节点可用内置函数白名单（禁用 import/open/exec/eval 等逃逸路径）
    # 代码节点允许导入的标准库模块（受限 __import__ 白名单：
    # datetime.date.today()/strftime 内部会 import time，缺 __import__ 会直接炸 —— 2026-10-18 修复）
    CODE_IMPORT_WHITELIST = {
        'datetime', 'time', 'json', 're', 'math', 'random', 'statistics',
        'collections', 'itertools', 'functools', 'decimal', 'uuid',
        'base64', 'hashlib', 'hmac', 'ipaddress', 'urllib.parse',
    }

    @staticmethod
    def _restricted_import(name, globals=None, locals=None, fromlist=(), level=0):
        import importlib
        root = name.split('.')[0]
        if name not in PlaybookEngine.CODE_IMPORT_WHITELIST:
            raise ImportError(f'代码节点禁止导入模块: {name}（白名单: '
                              + ', '.join(sorted(PlaybookEngine.CODE_IMPORT_WHITELIST)) + '）')
        return importlib.import_module(name)

    CODE_BUILTINS = {
        'len': len, 'str': str, 'int': int, 'float': float, 'bool': bool,
        'list': list, 'dict': dict, 'set': set, 'tuple': tuple,
        'sum': sum, 'min': min, 'max': max, 'abs': abs, 'round': round,
        'sorted': sorted, 'reversed': reversed, 'enumerate': enumerate, 'zip': zip,
        'range': range, 'any': any, 'all': all, 'filter': filter, 'map': map,
        'isinstance': isinstance, 'type': type, 'repr': repr, 'print': print,
        # 受限导入器（延迟到调用期解析 PlaybookEngine，白名单见 CODE_IMPORT_WHITELIST）
        '__import__': lambda name, *a, **k: PlaybookEngine._restricted_import(name, *a, **k),
    }

    def _execute_code(self, config: Dict, context: ActionContext) -> Dict:
        """代码节点（n8n: Code）：Python 片段，可读写整组 items。

        可用变量：
          items   输入项 json 列表（只读语义，修改它不影响输出）
          data    首项 json 的快捷别名
          alert/event/params/vars   上下文来源
          json/re/datetime   常用模块
        约定：把结果写进 `result`（dict → 单输出项；list → 多项）。
        不写 result 时透传输入。
        """
        code = config.get('code') or config.get('script') or ''
        if not str(code).strip():
            return {'success': True, 'message': '未配置代码，透传输入', 'data': {}}

        src_items = self._input_items(context)
        payload = [dict(i.get('json') or {}) for i in src_items]

        import json as _json
        import re as _re
        import datetime as _dt

        env = {
            '__builtins__': dict(self.CODE_BUILTINS),
            'items': payload,
            'data': payload[0] if payload else {},
            'alert': context.alert or {},
            'event': context.event or {},
            'params': context.params or {},
            'vars': context.variables or {},
            'json': _json, 're': _re, 'datetime': _dt,
        }
        try:
            exec(str(code), env)  # noqa: S102 - 剧本代码节点，已限制 builtins
        except Exception as e:
            return {'success': False, 'message': f'代码执行失败: {str(e)}', 'data': {}}

        ret = env.get('result')
        if ret is None:
            return {'success': True, 'message': '代码执行完成（未设置 result，透传输入）',
                    'data': {}, 'items': src_items}

        if isinstance(ret, dict):
            items = [{'json': ret, 'paired_items': []}]
        elif isinstance(ret, list):
            items = [{'json': r if isinstance(r, dict) else {'value': r}, 'paired_items': []}
                     for r in ret]
        else:
            items = [{'json': {'value': ret}, 'paired_items': []}]

        return {'success': True, 'message': f'代码执行完成：产出 {len(items)} 项',
                'data': {'count': len(items)}, 'items': items}

    def _execute_merge(self, config: Dict, context: ActionContext) -> Dict:
        """数据合并（n8n: Merge）。

        mode:
          append                上游项按序拼接（默认，也是节点默认的汇聚行为）
          combine_by_position   按索引配对合并（第 i 项与第 i 项合并）
          combine_by_field      按指定字段值做等值连接（SQL join 语义）
        """
        mode = config.get('mode', 'append')
        items = self._input_items(context)
        if mode == 'append':
            return {'success': True, 'message': f'合并（拼接）：{len(items)} 项',
                    'data': {'count': len(items)}, 'items': items}

        # 按来源节点分组（依赖输入项携带的 paired_items 溯源信息）
        groups: Dict[str, list] = {}
        order: list = []
        for it in items:
            src = (it.get('paired_items') or [{}])[0].get('node', '_input')
            if src not in groups:
                groups[src] = []
                order.append(src)
            groups[src].append(it)

        if mode == 'combine_by_position':
            if len(order) < 2:
                return {'success': True, 'message': '仅一个输入分支，无需按位置合并',
                        'data': {'count': len(items)}, 'items': items}
            size = max(len(g) for g in groups.values())
            out = []
            for i in range(size):
                merged = {}
                for src in order:
                    g = groups[src]
                    if i < len(g):
                        merged.update(g[i].get('json') or {})
                out.append({'json': merged, 'paired_items': []})
            return {'success': True, 'message': f'合并（按位置）：{len(out)} 项',
                    'data': {'count': len(out)}, 'items': out}

        if mode == 'combine_by_field':
            key = config.get('field') or config.get('join_field') or ''
            if not key:
                return {'success': False, 'message': '按字段合并需要指定 field', 'data': {}}
            if len(order) < 2:
                return {'success': True, 'message': '仅一个输入分支，无需按字段合并',
                        'data': {'count': len(items)}, 'items': items}
            out = []
            base = groups[order[0]]
            for b in base:
                bj = b.get('json') or {}
                kv = bj.get(key)
                for src in order[1:]:
                    for cand in groups[src]:
                        cj = cand.get('json') or {}
                        if cj.get(key) == kv and kv is not None:
                            merged = dict(cj)
                            merged.update(bj)
                            out.append({'json': merged, 'paired_items': []})
            return {'success': True, 'message': f'合并（按字段 {key}）：{len(out)} 项',
                    'data': {'count': len(out)}, 'items': out}

        return {'success': False, 'message': f'不支持的合并模式: {mode}', 'data': {}}

    def _execute_split(self, config: Dict, context: ActionContext) -> Dict:
        """拆分（n8n: Split Out）：把某字段的数组拆成多个独立数据项。"""
        field = config.get('field') or config.get('source_field') or ''
        if not field:
            return {'success': False, 'message': '拆分节点需要指定 field', 'data': {}}
        include = config.get('include_fields') or []
        if isinstance(include, str):
            include = [s.strip() for s in include.split(',') if s.strip()]

        out = []
        for it in self._input_items(context):
            data = it.get('json') or {}
            arr = data.get(field)
            if not isinstance(arr, (list, tuple)):
                arr = [arr] if arr not in (None, '') else []
            for idx, el in enumerate(arr):
                if include:
                    base = {k: v for k, v in data.items() if k in include}
                else:
                    base = {k: v for k, v in data.items() if k != field}
                if isinstance(el, dict):
                    base.update(el)
                else:
                    base[field] = el
                out.append({'json': base, 'paired_items': [{'node': context.current_node_id,
                                                            'index': idx}]})
        return {'success': True,
                'message': f'拆分 {field}：{len(out)} 项',
                'data': {'count': len(out)}, 'items': out}

    def _execute_aggregate(self, config: Dict, context: ActionContext) -> Dict:
        """聚合（n8n: Aggregate / Summarize）。

        operation: count / sum / avg / min / max / collect / first / last
        field    : 参与聚合的字段（count 可省略）
        group_by : 可选分组字段，指定后按组输出多项
        """
        op = (config.get('operation') or 'count').lower()
        field = config.get('field') or ''
        group_by = config.get('group_by') or config.get('groupBy') or ''

        items = [dict(i.get('json') or {}) for i in self._input_items(context)]

        def _agg(rows):
            vals = [r.get(field) for r in rows if r.get(field) is not None]
            nums = [v for v in vals if isinstance(v, (int, float)) and not isinstance(v, bool)]
            if op == 'count':
                return len(rows)
            if op == 'sum':
                return sum(nums)
            if op == 'avg':
                return round(sum(nums) / len(nums), 4) if nums else 0
            if op == 'min':
                return min(nums) if nums else (min(vals) if vals else None)
            if op == 'max':
                return max(nums) if nums else (max(vals) if vals else None)
            if op == 'collect':
                # 未指定字段时归集整行（安全报告场景：把 N 条事件/告警合成一项交给 AI）
                return vals if field else rows
            if op == 'first':
                return vals[0] if vals else None
            if op == 'last':
                return vals[-1] if vals else None
            return None

        out = []
        if group_by:
            groups: Dict[Any, list] = {}
            for r in items:
                groups.setdefault(r.get(group_by), []).append(r)
            for key, rows in groups.items():
                out.append({'json': {group_by: key,
                                     f'{op}_{field}' if field else op: _agg(rows),
                                     'group_count': len(rows)}, 'paired_items': []})
        else:
            out.append({'json': {f'{op}_{field}' if field else op: _agg(items),
                                 'count': len(items)}, 'paired_items': []})

        preview = out[0]['json'] if out else {}
        return {'success': True,
                'message': f'聚合 {op}{("." + field) if field else ""}：{len(out)} 组（共 {len(items)} 项）',
                'data': {'result': preview, 'count': len(out)}, 'items': out}

    def _execute_filter(self, config: Dict, context: ActionContext) -> Dict:
        """过滤（n8n: Filter）：只放行满足条件的数据项。"""
        field = config.get('field', '')
        raw_op = config.get('operator', 'equals')
        operator = self.OPERATOR_ALIASES.get(raw_op, raw_op)
        expected = config.get('value', '')
        op_func = self.CONDITION_OPERATORS.get(operator)
        if not op_func:
            return {'success': False, 'message': f'不支持的操作符: {operator}', 'data': {}}

        out = []
        for it in self._input_items(context):
            data = it.get('json') or {}
            actual = data.get(field, context.get(field))
            try:
                if op_func(actual, expected):
                    out.append({'json': dict(data), 'paired_items': it.get('paired_items', [])})
            except Exception:
                continue

        return {'success': True,
                'message': f'过滤 {field} {operator} {expected}：保留 {len(out)} 项',
                'data': {'kept': len(out)}, 'items': out}

    @staticmethod
    def _walk_path(root: Any, path: str) -> Any:
        """按 `a.b.0.c` 路径取值；取不到返回 None。

        注意：键名本身含点（如情报响应里以 IP 为键的 `data.13.75.68.24.xxx`）
        无法用路径表达 —— 那种场景请走 intel_profile 归一化，别写点路径。
        """
        cur = root
        for part in str(path or '').split('.'):
            if not part:
                continue
            # 支持 arr[0] 形式
            idx = None
            if part.endswith(']') and '[' in part:
                name, _, i = part[:-1].partition('[')
                part, idx = name, i
            if isinstance(cur, dict):
                cur = cur.get(part)
            elif isinstance(cur, (list, tuple)) and part.isdigit():
                cur = cur[int(part)] if int(part) < len(cur) else None
            else:
                return None
            if idx is not None and idx.isdigit() and isinstance(cur, (list, tuple)):
                cur = cur[int(idx)] if int(idx) < len(cur) else None
            if cur is None:
                return None
        return cur

    #: 深度查找的最大层数（防止在超大响应体上跑很久）
    DEEP_FIND_MAX_DEPTH = 6
    #: 深度查找时每层最多扫描的数组元素数
    DEEP_FIND_LIST_SCAN = 20

    @classmethod
    def _deep_find(cls, root: Any, key: str, max_depth: int = None) -> Any:
        """在嵌套 dict / list 里按**键名**广度优先查找，取不到返回 None。

        场景：条件字段只写了键名（如 `threat_level`），而它埋在上游输出的子对象里
        （`summary.threat_level`）。写全路径当然可以，但配置时经常只记得键名 ——
        这条路径让「只写键名」也能取到，等价于在上游结果 JSON 里迭代查询。

        安全边界（避免误命中/性能问题）：
        - 广度优先 → 浅层键优先命中，不会被深层同名键抢走
        - 深度上限 DEEP_FIND_MAX_DEPTH，数组每层最多扫 DEEP_FIND_LIST_SCAN 项
        - 只在常规途径（variables / 当前输入 / 快照 / 点路径）全部未命中时才调用
        """
        if not key or not isinstance(root, (dict, list)):
            return None
        limit = cls.DEEP_FIND_MAX_DEPTH if max_depth is None else max_depth
        queue = [(root, 0)]
        head = 0
        while head < len(queue):
            cur, depth = queue[head]
            head += 1
            if depth > limit:
                continue
            if isinstance(cur, dict):
                val = cur.get(key)
                if val is not None and val != '':
                    return val
                for v in cur.values():
                    if isinstance(v, (dict, list)):
                        queue.append((v, depth + 1))
            elif isinstance(cur, list):
                for v in cur[:cls.DEEP_FIND_LIST_SCAN]:
                    if isinstance(v, (dict, list)):
                        queue.append((v, depth + 1))
        return None

    def _evaluate_condition(self, config: Dict, context: ActionContext) -> Dict:
        """评估条件节点。

        「字段」支持三种写法（引用选择器插入什么就能用什么）：
          1. `severity`                 顶层字段名
          2. `summary.threat_level`     点路径（嵌套字段）
          3. `{{ $json.summary.x }}`    引用表达式 —— 直接渲染成实际值参与比较
        """
        field = str(config.get('field') or '').strip()
        raw_op = config.get('operator', 'equals')
        operator = self.OPERATOR_ALIASES.get(raw_op, raw_op)
        value = config.get('value', '')

        # 写法 3：字段位写的是 {{ }} 引用 —— 渲染后即为比较值（引用选择器插入的就是这种）
        matched_by = ''
        if '{{' in field:
            actual_value = context.resolve(field)
            matched_by = 'expression'
        else:
            # 写法 1/2：context.get 只查顶层键，取不到时按「上下文变量 → 当前输入项
            # → 快照」三级回退，让嵌套路径（summary.threat_level）也能取到，
            # 与引用选择器里列出的字段保持一致。
            bases = []
            actual_value = context.get(field)
            matched_by = 'variable' if actual_value not in (None, '') else ''
            if actual_value is None or actual_value == '':
                try:
                    bases = [context.variables, context.current_json(), context.snapshot_json()]
                except Exception:
                    bases = [context.variables]
                for base in bases:
                    if not isinstance(base, dict):
                        continue
                    got = self._walk_path(base, field) if ('.' in field or '[' in field) \
                        else base.get(field)
                    if got is not None and got != '':
                        actual_value = got
                        matched_by = 'path' if ('.' in field or '[' in field) else 'item'
                        break
            # 最后一级：只写了键名时，在上游结果 JSON 里广度优先迭代查找
            if (actual_value is None or actual_value == '') \
                    and not ('.' in field or '[' in field):
                for base in bases:
                    got = self._deep_find(base, field)
                    if got is not None and got != '':
                        actual_value = got
                        matched_by = 'deep'
                        break

        op_func = self.CONDITION_OPERATORS.get(operator)
        if not op_func:
            return {'success': False, 'message': f'不支持的操作符: {operator}', 'data': {}}

        try:
            result = op_func(actual_value, value)
            branch = 'true_branch' if result else 'false_branch'
            msg = f'条件 "{field}" {operator} "{value}": {"满足" if result else "不满足"}'
            if matched_by == 'deep':
                msg += '（键名在嵌套结构中深度匹配到）'
            return {
                'success': result,
                'message': msg,
                'data': {'branch': branch, 'field': field, 'value': actual_value,
                         'matched_by': matched_by or 'none'}
            }
        except Exception as e:
            return {'success': False, 'message': f'条件评估异常: {str(e)}', 'data': {}}

    def _execute_notification(self, config: Dict, context: ActionContext) -> Dict:
        """执行通知：委托 notify_service.execute_notification（与「发送通知」动作同一实现）。

        webhook URL 解析顺序：节点 webhook_url → 全局配置→通知渠道 默认值。
        邮件渠道：节点收件人(recipients/to) → 全局默认收件人，走 SMTP 发信。
        """
        from app.utils import notify_service
        return notify_service.execute_notification(config, context)

    def _execute_api_call(self, config: Dict, context: ActionContext) -> Dict:
        """执行 API 调用（通用 REST 节点）。

        body 接受 JSON 文本（含 {{ 表达式 }}，先解析再 JSON 校验）；
        headers 接受「每行一条 名称: 值」文本或 dict。
        """
        url = context.resolve(config.get('url', ''))
        method = config.get('method', 'GET').upper()

        if not url:
            return {'success': False, 'message': '未指定 API URL', 'data': {}}

        # headers：文本（每行 K: V）或 dict，值统一过表达式解析
        headers = self._parse_headers(config.get('headers'), context)

        # body：JSON 文本 → 解析表达式 → 重新序列化；dict 直接序列化
        body = None
        raw_body = config.get('body')
        if raw_body:
            try:
                if isinstance(raw_body, str):
                    resolved = context.resolve(raw_body)
                    parsed = json.loads(resolved)
                    body = json.dumps(parsed, ensure_ascii=False).encode('utf-8')
                else:
                    body = json.dumps(raw_body, ensure_ascii=False).encode('utf-8')
            except (ValueError, TypeError) as e:
                return {'success': False,
                        'message': f'请求体不是合法 JSON: {str(e)[:80]}', 'data': {}}

        try:
            import urllib.request
            import urllib.error

            req = urllib.request.Request(url, data=body, method=method)
            req.add_header('Content-Type', 'application/json')
            for key, val in headers.items():
                req.add_header(key, val)

            with urllib.request.urlopen(req, timeout=30) as resp:
                resp_body = resp.read().decode('utf-8', 'replace')
                return {
                    'success': True,
                    'message': f'API 调用成功 (HTTP {resp.status})',
                    'data': {'status': resp.status, 'body': resp_body[:1000]}
                }
        except urllib.error.HTTPError as e:
            return {'success': False, 'message': f'API 调用失败: HTTP {e.code}', 'data': {}}
        except Exception as e:
            return {'success': False, 'message': f'API 调用异常: {str(e)}', 'data': {}}

    @staticmethod
    def _parse_headers(raw, context: ActionContext) -> Dict:
        """headers 归一为 dict：支持「每行 名称: 值」文本与 dict 两种输入。"""
        headers: Dict = {}
        if not raw:
            return headers
        if isinstance(raw, dict):
            for k, v in raw.items():
                headers[str(k)] = context.resolve(str(v))
            return headers
        for line in str(raw).splitlines():
            line = line.strip()
            if not line or ':' not in line:
                continue
            k, _, v = line.partition(':')
            k = k.strip()
            if k:
                headers[k] = context.resolve(v.strip())
        return headers

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
            # 触发类型归一化（前端中文「告警事件」↔ 引擎 'alert' 等双向映射）
            req_norm = self.TRIGGER_TYPE_ALIASES.get(str(trigger_type or '').strip(),
                                                     str(trigger_type or '').strip().lower())
            matching = []
            for tid in trigger_nodes:
                node = node_map.get(tid, {})
                trigger_cfg = node.get('data', {}).get('config', {})
                # 画布配置键是 triggerType（旧数据可能是 trigger_type）—— 两者都接受
                raw_node_trigger = (trigger_cfg.get('trigger_type')
                                    or trigger_cfg.get('triggerType') or 'manual')
                node_trigger = self.TRIGGER_TYPE_ALIASES.get(
                    str(raw_node_trigger).strip(), str(raw_node_trigger).strip().lower())
                if node_trigger == req_norm or node_trigger == 'any':
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

        if node.get('type') == 'switch':
            # 多分支真实分流：命中分支值 → 目标节点名/边 label 与之相等的邻居；
            # 无匹配时回退全部邻居（保持图可走通）
            branch = (result.get('data', {}) or {}).get('branch')
            if not branch:
                return neighbors
            matched = []
            for nb in neighbors:
                nb_node = node_map.get(nb, {})
                nb_label = nb_node.get('data', {}).get('label') or nb_node.get('name') or ''
                if nb_label == branch:
                    matched.append(nb)
            return matched if matched else neighbors

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
                message=f'用户 {requester_name} 请求执行 {rule["label"]} 操作，请及时审批',
                data={
                    'approval_id': approval.id,
                    'playbook_id': playbook_id,
                    'action_type': action_type,
                    'params': params
                }
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
    from app.models import PlaybookApproval, Notification, User
    
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
        message=f'您的{approval.reason}请求已被{"通过" if approved else "拒绝"}',
        data={'approval_id': approval_id, 'approved': approved}
    )
    db.session.add(notif)
    db.session.commit()
    
    if approved:
        if approval.playbook_id and approval.approval_type == 'playbook_execute':
            # ── 剧本执行审批：通过后进程内自动执行 ──
            approval.result = _execute_approved_playbook(approval, approver_name)
        else:
            # ── 审批节点危险动作：执行单个动作 ──
            action_type = approval.approval_type
            params = approval.params
            handler = get_action(action_type)
            if handler:
                result = handler.execute(params, None)
                approval.result = result.to_dict() if hasattr(result, 'to_dict') else result

        # 关联事件写处置记录（进程内，替代旧 HTTP 自调）
        if approval.related_event_id:
            try:
                from app.models import Event as DBEvent, EventAction
                ev = (DBEvent.query.filter_by(event_code=approval.related_event_id).first()
                      or (DBEvent.query.get(int(approval.related_event_id))
                          if str(approval.related_event_id).isdigit() else None))
                if ev:
                    exec_status = (approval.result or {}).get('status', '')
                    is_pb_exec = approval.approval_type == 'playbook_execute'
                    summary = ('审批通过并自动执行剧本'
                               + ('，执行' + ('成功' if exec_status == 'completed' else '失败'))
                               if is_pb_exec else f'审批通过：{approval.approval_type}')
                    pb_row = Playbook.query.get(approval.playbook_id) if approval.playbook_id else None
                    # user_id 有 FK 约束：审批人非平台用户（如测试/系统账号）时置空
                    safe_approver_id = approver_id if approver_id and User.query.get(approver_id) else None
                    db.session.add(EventAction(
                        event_id=ev.event_code,
                        action='playbook_triggered',
                        user_id=safe_approver_id,
                        user_name=approver_name,
                        content=f'{summary}（审批ID: {approval.id}，申请人: {approval.requester_name}）',
                        playbook_id=approval.playbook_id,
                        playbook_name=pb_row.name if (is_pb_exec and pb_row) else None,
                        playbook_execution_id=(approval.result or {}).get('execution_id'),
                        playbook_result=approval.result or {},
                        extra_data={'approval_id': approval.id,
                                    'approval_type': approval.approval_type,
                                    'params': approval.params,
                                    'approver': approver_name},
                    ))
            except Exception as e:
                print(f'Warning: record event action after approval failed: {e}')

    db.session.commit()
    return approval.to_dict()


def _execute_approved_playbook(approval, approver_name: str) -> Dict:
    """剧本执行审批通过后：用申请时保存的入参/事件上下文进程内执行剧本。"""
    from app.models import Playbook, Event as DBEvent

    playbook = Playbook.query.get(approval.playbook_id)
    if not playbook:
        return {'status': 'failed', 'error': f'剧本 #{approval.playbook_id} 不存在'}

    # 关联事件 → 重建执行上下文
    event_context, first_alert = {}, {}
    if approval.related_event_id:
        try:
            from app.routes.events_api import build_event_execution_context
            ev = (DBEvent.query.filter_by(event_code=approval.related_event_id).first()
                  or (DBEvent.query.get(int(approval.related_event_id))
                      if str(approval.related_event_id).isdigit() else None))
            if ev:
                event_context, first_alert = build_event_execution_context(ev)
        except Exception as e:
            print(f'Warning: rebuild event context failed: {e}')

    # 入参：申请时保存的值优先，留空的声明入参回退事件预填
    from app.engine.node_params import validate_execution_request
    inputs, guard_error = validate_execution_request(
        playbook, trigger_type='alert' if event_context else 'manual',
        event=event_context, alert=first_alert, params=approval.params or {})
    if guard_error:
        # 审批已通过但入参/上下文不合法：不带着空数据空跑，直接记为失败
        return {'status': 'failed', 'error': guard_error['message'],
                'code': guard_error.get('code')}

    result = playbook_engine.execute(
        playbook=playbook,
        trigger_type='alert' if event_context else 'manual',
        event=event_context,
        alert=first_alert,
        params=inputs,
        executor=f'审批通过（审批人: {approver_name}）',
        request_info={'approval_id': approval.id},
    )
    approval.execution_id = result.get('execution_id') or approval.execution_id
    return {
        'status': result.get('status'),
        'execution_id': result.get('execution_id'),
        'nodes_executed': len(result.get('node_results', [])),
        'failed_nodes': [n.get('node_label') for n in result.get('node_results', [])
                         if not n.get('success')],
        'inputs': inputs,
    }



# ========== 新增节点类型执行器 ==========

def execute_approval_node(node_data: Dict, context: 'ActionContext', execution_id: str) -> Dict:
    """执行审批节点 - 暂停并等待审批"""
    approval_type = node_data.get('approval_type', node_data.get('approvalType', ''))
    reason = node_data.get('reason', '剧本执行审批')
    # 节点可显式给出 playbook_id；否则回退到上下文里的 current playbook
    playbook_id = node_data.get('playbook_id') or getattr(context, 'playbook_id', None) or 0
    
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
        playbook_id=playbook_id,
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
    """执行循环节点：把遍历对象解析为逐项输出（下游按项处理，受 max_iterations 限制）。"""
    iterable_var = node_data.get('iterable', node_data.get('iterable', ''))
    max_iterations = int(node_data.get('maxIterations', node_data.get('max_iterations', 10)))

    # 解析遍历对象（表达式 → list；字符串按逗号拆分）
    items = context.resolve(iterable_var) if iterable_var else []
    if isinstance(items, str):
        items = [i.strip() for i in items.split(',') if i.strip()]
    elif not isinstance(items, list):
        items = [items] if items else []

    items = items[:max_iterations]  # 限制最大次数

    out_items = [{'json': (i if isinstance(i, dict) else {'value': i}),
                  'paired_items': []} for i in items]
    return {
        'success': True,
        'message': f'循环遍历产出 {len(items)} 项',
        'data': {'loop_count': len(items), 'max_iterations': max_iterations},
        'items': out_items,
    }


def execute_switch_node(node_data: Dict, context: 'ActionContext') -> Dict:
    """执行多分支节点：按 field 值匹配 cases，产出命中分支（供 _get_next_nodes 分流）。"""
    field = node_data.get('field', '')
    cases_config = node_data.get('cases', '')

    # 解析 cases: "critical:高危处理\nhigh:中危处理\ndefault:默认处理"
    cases = {}
    default_case = None
    for line in str(cases_config).split('\n'):
        if ':' in line:
            key, value = line.split(':', 1)
            key = key.strip()
            if key == 'default':
                default_case = value.strip()
            else:
                cases[key.strip()] = value.strip()

    # 字段值：上下文自动查找（event/alert/params/variables）→ 当前输入项 → 顶层
    field_value = str(context.get(field, '') or '').lower()
    if not field_value and context.items:
        first = context.items[0].get('json') or {}
        field_value = str(first.get(field, '')).lower()
    matched_branch = cases.get(field_value, default_case)

    return {
        'success': True,
        'message': f'分支匹配: {field}={field_value or "(空)"} -> {matched_branch or "(无匹配)"}',
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
