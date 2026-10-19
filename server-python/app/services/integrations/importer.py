"""OpenAPI / Shuffle App 规范解析器。

把 Shuffle/security-openapis（MIT）或任意标准 OpenAPI 2/3 规范
转换为 USOP 集成应用模型：

    {app_key, name, description, version, categories, base_url,
     auth_type, auth_config, actions: [...]}

每个 action:
    {id, name, description, method, path, params[], body}

params[]: [{name, in(path|query|header), type, required, desc, default}]
body:     {content_type, properties: {name: {type, desc}}, required: []} | None

规范里体积巨大的 x-logo（base64 图片）一律剥掉，不进库。
"""
import json
import re
from typing import Dict, List, Optional

try:
    import yaml
except ImportError:  # 容器内已装 pyyaml；本地缺失时退化为仅支持 JSON
    yaml = None

MAX_ACTIONS = 200          # 单 App 动作上限，防止载荷失控
MAX_SPEC_CHARS = 2_000_000  # 规范文本上限 2MB


class SpecParseError(Exception):
    """规范解析失败（格式不支持 / 内容为空）"""


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------

def _slugify(text: str, fallback: str = 'app') -> str:
    """标题 → 唯一 key：'Tenable Web App' → 'tenable_web_app'。

    保留 CJK（中文 app 名常见，如「微步在线威胁情报」），避免被整体
    清成 fallback 'app' 引发后续导入 key 冲突。
    """
    if not text:
        return fallback
    slug = re.sub(r'[^0-9a-zA-Z一-鿿]+', '_', str(text).strip().lower()).strip('_')
    return slug[:90] or fallback


def _load_spec_text(text: str) -> Dict:
    """YAML / JSON 文本 → dict"""
    if not text or not text.strip():
        raise SpecParseError('规范内容为空')
    if len(text) > MAX_SPEC_CHARS:
        raise SpecParseError(f'规范过大（>{MAX_SPEC_CHARS // 1024}KB），请裁剪后导入')
    # 先试 JSON（快），再退 YAML（YAML 是 JSON 超集，但 JSON 解析更严格）
    try:
        data = json.loads(text)
    except Exception:
        if yaml is None:
            raise SpecParseError('无法解析规范：需要 JSON 格式（当前环境无 YAML 解析器）')
        try:
            data = yaml.safe_load(text)
        except Exception as e:
            raise SpecParseError(f'YAML/JSON 解析失败: {e}')
    if not isinstance(data, dict):
        raise SpecParseError('规范根节点必须是对象（mapping）')
    if 'paths' not in data and 'actions' not in data:
        raise SpecParseError('不是有效的 OpenAPI/Shuffle 规范（缺少 paths）')
    return data


def _strip_volatile(node):
    """递归剥掉 x-logo 等大体积扩展字段"""
    if isinstance(node, dict):
        return {k: _strip_volatile(v) for k, v in node.items()
                if k not in ('x-logo', 'x-logo-url')}
    if isinstance(node, list):
        return [_strip_volatile(x) for x in node]
    return node


def _resolve_ref(spec: Dict, ref: str):
    """解析 $ref（仅支持本地 #/ 引用）"""
    if not isinstance(ref, str) or not ref.startswith('#/'):
        return None
    node = spec
    for part in ref[2:].split('/'):
        part = part.replace('~1', '/').replace('~0', '~')
        if isinstance(node, dict) and part in node:
            node = node[part]
        else:
            return None
    return node


def _deref(spec: Dict, schema, depth: int = 0):
    """展开 $ref（限深 3 层，防循环）"""
    if depth > 3 or not isinstance(schema, dict):
        return schema if isinstance(schema, dict) else {}
    if '$ref' in schema:
        target = _resolve_ref(spec, schema['$ref'])
        if target is not None:
            merged = dict(target)
            for k, v in schema.items():
                if k != '$ref':
                    merged[k] = v
            return _deref(spec, merged, depth + 1)
    return schema


def _base_url(spec: Dict) -> str:
    """servers[0].url（OA3）或 schemes+host+basePath（OA2）"""
    servers = spec.get('servers')
    if isinstance(servers, list) and servers and isinstance(servers[0], dict):
        url = servers[0].get('url')
        if url:
            return str(url).rstrip('/')
    host = spec.get('host')
    if host:
        schemes = spec.get('schemes') or ['https']
        scheme = schemes[0] if isinstance(schemes, list) and schemes else 'https'
        base = spec.get('basePath') or ''
        return f"{scheme}://{host}{base}".rstrip('/')
    return ''


def _detect_auth(spec: Dict):
    """components.securitySchemes / securityDefinitions → (auth_type, auth_config)"""
    schemes = {}
    comp = spec.get('components')
    if isinstance(comp, dict) and isinstance(comp.get('securitySchemes'), dict):
        schemes = comp['securitySchemes']
    if not schemes and isinstance(spec.get('securityDefinitions'), dict):
        schemes = spec['securityDefinitions']

    for s in schemes.values():
        if not isinstance(s, dict):
            continue
        stype = s.get('type')
        if stype == 'apiKey':
            return 'apiKey', {'in': s.get('in', 'header'), 'name': s.get('name', 'X-Api-Key')}
        if stype == 'http':
            scheme = (s.get('scheme') or 'bearer').lower()
            if scheme == 'basic':
                return 'basic', {}
            return 'bearer', {'prefix': 'Bearer'}
        if stype == 'basic':
            return 'basic', {}
        if stype == 'oauth2':
            return 'bearer', {'prefix': 'Bearer'}
    return 'none', {}


_TYPE_MAP = {
    'string': 'string', 'integer': 'number', 'number': 'number',
    'boolean': 'boolean', 'array': 'array', 'object': 'object',
}


def _param_type(schema: Dict) -> str:
    if not isinstance(schema, dict):
        return 'string'
    return _TYPE_MAP.get(schema.get('type'), 'string')


def _parse_params(spec: Dict, path_item: Dict, op: Dict) -> List[Dict]:
    """合并 path 级与 operation 级 parameters"""
    raw = list(path_item.get('parameters') or [])
    raw += list(op.get('parameters') or [])
    seen = set()
    params = []
    for p in raw:
        p = _deref(spec, p) if isinstance(p, dict) else p
        if not isinstance(p, dict):
            continue
        name = p.get('name')
        if not name or name in seen:
            continue
        # OA2 的 in=body/formData 参数由 body 字段单独表达，不进 params
        if p.get('in') in ('body', 'formData'):
            continue
        seen.add(name)
        schema = _deref(spec, p.get('schema') or {})
        params.append({
            'name': name,
            'in': p.get('in', 'query'),
            'type': _param_type(schema),
            'required': bool(p.get('required')),
            'desc': (p.get('description') or '')[:200],
            'default': p.get('schema', {}).get('default') if isinstance(p.get('schema'), dict) else None,
        })
    return params


def _parse_body(spec: Dict, op: Dict) -> Optional[Dict]:
    """requestBody（OA3）/ parameters[in=body]（OA2）→ 简化的 body 描述"""
    rb = op.get('requestBody')
    if isinstance(rb, dict):
        rb = _deref(spec, rb)
        content = rb.get('content') or {}
        ctype = 'application/json' if 'application/json' in content else (next(iter(content), None))
        if not ctype:
            return None
        schema = _deref(spec, (content.get(ctype) or {}).get('schema') or {})
        return _schema_to_body(schema)
    # OA2：in=body 的 parameter
    for p in (op.get('parameters') or []):
        p = _deref(spec, p) if isinstance(p, dict) else p
        if isinstance(p, dict) and p.get('in') == 'body':
            schema = _deref(spec, p.get('schema') or {})
            return _schema_to_body(schema)
    return None


def _schema_to_body(schema: Dict) -> Optional[Dict]:
    """object schema → {content_type, properties, required}"""
    schema = schema if isinstance(schema, dict) else {}
    props = schema.get('properties') or {}
    if not props:
        # 非 object（如直接数组）——保留类型提示，前端按 JSON 文本域渲染
        return {'content_type': 'application/json', 'properties': {}, 'required': [],
                'raw_type': schema.get('type', 'object')} if schema.get('type') else None
    properties = {}
    for name, ps in list(props.items())[:50]:
        ps = ps if isinstance(ps, dict) else {}
        properties[name] = {
            'type': _param_type(ps),
            'desc': (ps.get('description') or '')[:200],
        }
    return {
        'content_type': 'application/json',
        'properties': properties,
        'required': [k for k in (schema.get('required') or []) if k in properties],
    }


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------

def parse_spec(text: str) -> Dict:
    """解析规范文本 → 集成应用 dict（未落库）"""
    spec = _load_spec_text(text)
    spec = _strip_volatile(spec)

    info = spec.get('info') or {}
    title = str(info.get('title') or '').strip() or '未命名集成'
    version = str(info.get('version') or '1.0')
    description = str(info.get('description') or '')[:2000]
    categories = info.get('x-categories') or info.get('categories') or []
    if not isinstance(categories, list):
        categories = [str(categories)]

    auth_type, auth_config = _detect_auth(spec)
    base_url = _base_url(spec)

    actions: List[Dict] = []
    seen_ids = set()
    paths = spec.get('paths') or {}
    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method, op in path_item.items():
            if method.lower() not in ('get', 'post', 'put', 'delete', 'patch', 'head', 'options'):
                continue
            if not isinstance(op, dict):
                continue
            summary = str(op.get('summary') or op.get('operationId') or f'{method.upper()} {path}').strip()
            op_id = op.get('operationId') or f"{method.lower()}_{_slugify(str(path), 'root')}"
            action_id = _slugify(str(op_id), 'action')
            # 保证唯一
            base_id, n = action_id, 2
            while action_id in seen_ids:
                action_id = f'{base_id}_{n}'
                n += 1
            seen_ids.add(action_id)

            actions.append({
                'id': action_id,
                'name': summary[:120],
                'description': str(op.get('description') or '')[:500],
                'method': method.upper(),
                'path': str(path),
                'params': _parse_params(spec, path_item, op),
                'body': _parse_body(spec, op),
            })

    if not actions:
        raise SpecParseError('规范中未找到任何可执行动作（paths 为空）')

    spec_format = 'openapi3' if spec.get('openapi', '').startswith('3') or spec.get('swagger', '').startswith('3') else 'openapi2'

    return {
        'app_key': _slugify(title),
        'name': title[:200],
        'description': description,
        'version': version[:50],
        'categories': [str(c)[:50] for c in categories][:10],
        'base_url': base_url[:500],
        'auth_type': auth_type,
        'auth_config': auth_config,
        'actions': actions[:MAX_ACTIONS],
        'source': 'shuffle' if (info.get('x-categories') or 'x-shuffle' in json.dumps(spec)[:5000]) else 'openapi',
        'spec_format': spec_format,
    }


def render_request(app: Dict, action: Dict, values: Dict) -> Dict:
    """把动作定义 + 用户填的参数值 → HTTP 请求要素（引擎 http_request 用）。

    values: {参数名: 值}；返回 {method, url, headers, query, body, path_params}
    URL 中的 {param} 占位符用 path 参数替换。
    """
    values = values or {}
    base = (app.get('base_url') or '').rstrip('/')
    path = action.get('path') or ''

    query = {}
    headers = {}
    for p in action.get('params') or []:
        name = p.get('name')
        val = values.get(name)
        if val is None or val == '':
            continue
        loc = p.get('in', 'query')
        if loc == 'path':
            path = path.replace('{' + name + '}', str(val))
        elif loc == 'query':
            query[name] = val
        elif loc == 'header':
            headers[name] = str(val)

    body = None
    body_def = action.get('body')
    if body_def:
        body = {}
        for name, pdef in (body_def.get('properties') or {}).items():
            if name in values and values[name] not in (None, ''):
                v = values[name]
                ptype = pdef.get('type')
                if ptype == 'number':
                    try:
                        v = float(v)
                    except (TypeError, ValueError):
                        pass
                elif ptype == 'boolean':
                    v = str(v).lower() in ('true', '1', '是', 'yes')
                body[name] = v
        if not body:
            body = None

    return {
        'method': action.get('method', 'GET'),
        'url': base + path,
        'headers': headers,
        'query': query,
        'body': body,
    }
