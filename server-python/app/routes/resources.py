# ========================================
# 资源管理 API — IT 资产信息配置（IP 组 / 域名组）
# 供资源管理页面维护，供告警过滤规则、白名单、研判等模块匹配调用。
# ========================================

from flask import Blueprint, jsonify, request

from app.database import db
from app.models.resource_groups import IpGroup, IpGroupItem, DomainGroup, DomainGroupItem
from app.routes.auth import login_required
from app.utils.resource_match import refresh_cache

resources_bp = Blueprint('resources_api', __name__, url_prefix='/api/resources')

_IP_GROUP_USAGES = ('general', 'blacklist', 'whitelist')


# ---------- IP 组 ----------

@resources_bp.route('/ip-groups', methods=['GET'])
@login_required
def list_ip_groups():
    usage = (request.args.get('usage') or '').strip()
    q = IpGroup.query
    if usage:
        q = q.filter(IpGroup.usage == usage)
    rows = q.order_by(IpGroup.id).all()
    return jsonify({'success': True, 'data': [r.to_dict() for r in rows]})


@resources_bp.route('/ip-groups', methods=['POST'])
@login_required
def create_ip_group():
    d = request.get_json() or {}
    name = (d.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': '组名不能为空'}), 400
    if IpGroup.query.filter_by(name=name).first():
        return jsonify({'success': False, 'error': f'IP 组「{name}」已存在'}), 400
    entries, err = _parse_ip_entries(d.get('entries'))
    if err:
        return jsonify({'success': False, 'error': err}), 400
    usage = d.get('usage') or 'general'
    if usage not in _IP_GROUP_USAGES:
        return jsonify({'success': False, 'error': f'用途必须是 {" / ".join(_IP_GROUP_USAGES)}'}), 400
    g = IpGroup(name=name, description=(d.get('description') or '').strip(), usage=usage)
    for e, remark in entries:
        g.items.append(IpGroupItem(entry=e, remark=remark))
    db.session.add(g)
    db.session.commit()
    refresh_cache()
    return jsonify({'success': True, 'data': g.to_dict()}), 201


@resources_bp.route('/ip-groups/<int:gid>', methods=['PATCH'])
@login_required
def update_ip_group(gid):
    g = IpGroup.query.get(gid)
    if not g:
        return jsonify({'success': False, 'error': 'IP 组不存在'}), 404
    d = request.get_json() or {}
    if 'name' in d:
        name = (d['name'] or '').strip()
        if not name:
            return jsonify({'success': False, 'error': '组名不能为空'}), 400
        dup = IpGroup.query.filter(IpGroup.name == name, IpGroup.id != gid).first()
        if dup:
            return jsonify({'success': False, 'error': f'IP 组「{name}」已存在'}), 400
        g.name = name
    if 'description' in d:
        g.description = (d['description'] or '').strip()
    if 'usage' in d:
        usage = d.get('usage') or 'general'
        if usage not in _IP_GROUP_USAGES:
            return jsonify({'success': False, 'error': f'用途必须是 {" / ".join(_IP_GROUP_USAGES)}'}), 400
        g.usage = usage
    if 'entries' in d:
        entries, err = _parse_ip_entries(d.get('entries'))
        if err:
            return jsonify({'success': False, 'error': err}), 400
        g.items.clear()
        for e, remark in entries:
            g.items.append(IpGroupItem(entry=e, remark=remark))
    db.session.commit()
    refresh_cache()
    return jsonify({'success': True, 'data': g.to_dict()})


@resources_bp.route('/ip-groups/test', methods=['POST'])
@login_required
def test_ip_groups():
    """测试 IP 命中的 IP 组（含用途）。承接原 /api/ip-lists/test 能力。

    请求体：{ ip }。返回 { ip, matched, hits: [{groupName, usage, items}] }。
    """
    from app.utils.resource_match import match_ip
    d = request.get_json() or {}
    ip = (d.get('ip') or '').strip()
    if not ip:
        return jsonify({'success': False, 'error': 'ip 不能为空'}), 400
    return jsonify({'success': True, 'data': match_ip(ip)})


@resources_bp.route('/ip-groups/<int:gid>', methods=['DELETE'])
@login_required
def delete_ip_group(gid):
    g = IpGroup.query.get(gid)
    if not g:
        return jsonify({'success': False, 'error': 'IP 组不存在'}), 404
    db.session.delete(g)
    db.session.commit()
    refresh_cache()
    return jsonify({'success': True, 'data': {'id': gid}})


def _parse_ip_entries(raw) -> tuple | None:
    """解析批量条目文本（每行一条「条目 备注」或仅条目）。

    返回 (entries, None) 成功；(None, error_msg) 失败（格式非法或组内重复）。
    支持单 IP / CIDR / 范围 a-b（含 192.168.1.1-100 简写，与 ip_match 同源逻辑）。
    """
    import ipaddress as _ipa
    if raw is None:
        return [], None
    lines = raw if isinstance(raw, list) else str(raw).splitlines()
    out = []
    seen = set()

    def _range_ok(pair: str) -> bool:
        lo, hi = [x.strip() for x in pair.split('-', 1)]
        try:
            a = _ipa.ip_address(lo)
            if '.' in lo and '.' not in hi and ':' not in hi:
                hi = f"{lo.rsplit('.', 1)[0]}.{hi}"
            elif ':' in lo and ':' not in hi and '.' not in hi:
                hi = f"{lo.rsplit(':', 1)[0]}:{hi}"
            b = _ipa.ip_address(hi)
            return a.version == b.version and int(a) <= int(b)
        except ValueError:
            return False

    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split(None, 1)
        entry = parts[0]
        remark = parts[1].strip() if len(parts) > 1 else ''
        try:
            if '/' in entry:
                _ipa.ip_network(entry, strict=False)
            elif '-' in entry:
                if not _range_ok(entry):
                    return None, f'IP 范围无效：{entry}'
            else:
                _ipa.ip_address(entry)
        except ValueError:
            return None, f'IP 条目无效：{entry}（支持单IP/CIDR/范围 a-b）'
        key = entry.lower()
        if key in seen:
            return None, f'条目重复：{entry}'
        seen.add(key)
        out.append((entry, remark))
    return out, None


# ---------- 域名组 ----------

@resources_bp.route('/domain-groups', methods=['GET'])
@login_required
def list_domain_groups():
    rows = DomainGroup.query.order_by(DomainGroup.id).all()
    return jsonify({'success': True, 'data': [r.to_dict() for r in rows]})


@resources_bp.route('/domain-groups', methods=['POST'])
@login_required
def create_domain_group():
    d = request.get_json() or {}
    name = (d.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': '组名不能为空'}), 400
    if DomainGroup.query.filter_by(name=name).first():
        return jsonify({'success': False, 'error': f'域名组「{name}」已存在'}), 400
    domains, err = _parse_domain_entries(d.get('entries'))
    if err:
        return jsonify({'success': False, 'error': err}), 400
    g = DomainGroup(name=name, description=(d.get('description') or '').strip())
    for e, remark in domains:
        g.items.append(DomainGroupItem(domain=e, remark=remark))
    db.session.add(g)
    db.session.commit()
    refresh_cache()
    return jsonify({'success': True, 'data': g.to_dict()}), 201


@resources_bp.route('/domain-groups/<int:gid>', methods=['PATCH'])
@login_required
def update_domain_group(gid):
    g = DomainGroup.query.get(gid)
    if not g:
        return jsonify({'success': False, 'error': '域名组不存在'}), 404
    d = request.get_json() or {}
    if 'name' in d:
        name = (d['name'] or '').strip()
        if not name:
            return jsonify({'success': False, 'error': '组名不能为空'}), 400
        dup = DomainGroup.query.filter(DomainGroup.name == name, DomainGroup.id != gid).first()
        if dup:
            return jsonify({'success': False, 'error': f'域名组「{name}」已存在'}), 400
        g.name = name
    if 'description' in d:
        g.description = (d['description'] or '').strip()
    if 'entries' in d:
        domains, err = _parse_domain_entries(d.get('entries'))
        if err:
            return jsonify({'success': False, 'error': err}), 400
        g.items.clear()
        for e, remark in domains:
            g.items.append(DomainGroupItem(domain=e, remark=remark))
    db.session.commit()
    refresh_cache()
    return jsonify({'success': True, 'data': g.to_dict()})


@resources_bp.route('/domain-groups/<int:gid>', methods=['DELETE'])
@login_required
def delete_domain_group(gid):
    g = DomainGroup.query.get(gid)
    if not g:
        return jsonify({'success': False, 'error': '域名组不存在'}), 404
    db.session.delete(g)
    db.session.commit()
    refresh_cache()
    return jsonify({'success': True, 'data': {'id': gid}})


def _parse_domain_entries(raw) -> tuple | None:
    """解析批量域名条目（每行一条「域名 备注」或仅域名）。

    返回 (entries, None) 成功；(None, error_msg) 失败（格式非法或组内重复）。
    """
    import re as _re
    if raw is None:
        return [], None
    lines = raw if isinstance(raw, list) else str(raw).splitlines()
    out = []
    seen = set()
    pat = _re.compile(r'^(\*\.)?(\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+|[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+)$')
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split(None, 1)
        domain = parts[0].lower()
        remark = parts[1].strip() if len(parts) > 1 else ''
        if not pat.match(domain):
            return None, f'域名条目无效：{domain}'
        if domain in seen:
            return None, f'条目重复：{domain}'
        seen.add(domain)
        out.append((domain, remark))
    return out, None
