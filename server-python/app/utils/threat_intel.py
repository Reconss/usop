# -*- coding: utf-8 -*-
"""威胁情报归一化：把第三方情报响应压平成剧本可直接判定的字段。

背景（为什么需要这个模块）：
    微步在线 / VirusTotal 的 IP 查询响应里**没有**「危害等级」字段，只有
    judgments（官方结论标签）、intelligences.threatbook_lab[]（情报条目，含
    confidence / expired）、samples[]（关联样本）、scene 等原始素材；
    而剧本 condition 节点只能对**扁平变量**做比较（context.get(field) 不支持
    `data.<ip>.judgments` 这类嵌套路径，IP 里的点还会被误当成路径分隔符）。

    因此在情报节点出口处统一归一化，输出一组扁平字段供下游 condition / 通知引用：
        threat_level    critical/high/medium/low/none（对齐平台 severity 词表）
        threat_score    0-100 的危害分
        is_malicious    bool（medium 及以上）
        threat_tags     官方结论标签（微步 judgments），逗号串
        intel_types     命中的情报类型（去重），逗号串
        malware_family  关联恶意样本家族，逗号串
        threat_reason   判定依据（人可读，写进通知/处置记录便于审计）

设计原则：
    - 评分规则全部落在本文件顶部的常量里，可按运营口径调整，不散落在引擎；
    - **过期情报（expired=true）不计分**——历史命中不代表当前仍恶意；
    - 判定依据（threat_reason）必须可读，避免「黑箱分数」无法解释。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

# ==================================================================
# 危害评分配置（运营口径，按需调整）
# ==================================================================

# 情报类型 → 基础分（实际加分 = 基础分 × confidence/100）
# 高危：直接表明该 IP 是被控/攻击基础设施
HIGH_RISK_INTEL = (
    '远控', 'C2', 'C&C', '僵尸网络', 'Botnet', '僵尸主机', '木马', '后门',
    '勒索', '蠕虫', '病毒', '挖矿', '矿池', '恶意软件', 'Exploit', '漏洞利用',
    'APT', '攻击组织', '恶意域名', '恶意主机',
)
HIGH_RISK_BASE = 60

# 中危：可疑但非确凿（可能是共用出口、扫描器、垃圾邮件源）
MEDIUM_RISK_INTEL = (
    '扫描器', '代理', '匿名代理', '垃圾邮件', '钓鱼', '欺诈', '暴破', '爆破',
    '注入', 'Web攻击', '垃圾注册', '黑产', '薅羊毛', '违规',
)
MEDIUM_RISK_BASE = 30

# 中性：基础设施属性，不构成危害证据
NEUTRAL_INTEL = (
    'IDC服务器', '云厂商', '出口IP', '企业专线', '家庭宽带', '教育网',
    '移动网络', 'CDN', '搜索引擎', '数据中心',
)

# 关联样本（samples[].threat_level == malicious）加分
SAMPLE_SCORE_RECENT = 25      # scan_time 1 年内
SAMPLE_SCORE_OLD = 10         # 1~3 年
SAMPLE_MAX_AGE_DAYS = 1095    # 超过 3 年不计分
# 已知高危木马家族（命中额外加分）
HIGH_RISK_FAMILIES = (
    'cobaltstrike', 'mirai', 'emotet', 'trickbot', 'njrat', 'agenttesla',
    'formbook', 'lokibot', 'azorult', 'remcos', 'gh0st', 'plugx', 'quasar',
    'metasploit', 'sqlmap', 'mimikatz', 'rozena',
)
FAMILY_BONUS = 10

# judgments 里有结论但没有对应未过期情报时的默认置信度
JUDGMENT_DEFAULT_CONFIDENCE = 60

# 分数 → 等级阈值（从高到低匹配）
LEVEL_THRESHOLDS: Tuple[Tuple[float, str], ...] = (
    (80, 'critical'),
    (60, 'high'),
    (35, 'medium'),
    (1, 'low'),
)
MALICIOUS_MIN_SCORE = 35   # 达到 medium 才认为「恶意」


def _classify_intel_type(name: str) -> int:
    """情报类型 → 基础分（0 表示中性/未知）。大小写不敏感，子串匹配。"""
    if not name:
        return 0
    low = str(name).lower()
    for t in HIGH_RISK_INTEL:
        if str(t).lower() in low:
            return HIGH_RISK_BASE
    for t in MEDIUM_RISK_INTEL:
        if str(t).lower() in low:
            return MEDIUM_RISK_BASE
    return 0


def _is_neutral(name: str) -> bool:
    low = str(name or '').lower()
    return any(str(t).lower() in low for t in NEUTRAL_INTEL)


def _parse_dt(text: Any) -> Optional[datetime]:
    if not text:
        return None
    s = str(text).strip()
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%Y-%m-%dT%H:%M:%S',
                '%Y-%m-%dT%H:%M:%SZ', '%Y/%m/%d %H:%M:%S'):
        try:
            return datetime.strptime(s, fmt)
        except Exception:
            continue
    return None


def _days_since(text: Any) -> Optional[float]:
    dt = _parse_dt(text)
    if not dt:
        return None
    return (datetime.utcnow() - dt).total_seconds() / 86400.0


def _ratio_factor(ratio: Any) -> float:
    """'14/28' → 检出率因子（>=30% 全额，其余线性折半）。"""
    try:
        num, den = str(ratio).split('/')
        num, den = float(num), float(den)
        if den <= 0:
            return 1.0
        r = num / den
        return 1.0 if r >= 0.3 else max(0.4, r / 0.3)
    except Exception:
        return 1.0


def _dedup_keep_max(pairs: List[Tuple[str, float]]) -> Dict[str, float]:
    """同类型多次命中取最大加分，避免重复计数。"""
    out: Dict[str, float] = {}
    for k, v in pairs:
        if k not in out or v > out[k]:
            out[k] = v
    return out


def _score_to_level(score: float) -> str:
    for threshold, level in LEVEL_THRESHOLDS:
        if score >= threshold:
            return level
    return 'none'


# ==================================================================
# 微步在线 IP 情报
# ==================================================================

def normalize_threatbook_ip(payload: Any, ip: str = '') -> Dict[str, Any]:
    """把微步在线 /v3/ip/query 的响应归一化。

    payload 可以是完整响应（含 response_code / data），也可以是 data 下的
    单个 IP 对象。返回扁平摘要；无法识别时返回 {}（调用方应跳过注入）。
    """
    if not isinstance(payload, dict):
        return {}

    node: Dict[str, Any] = {}
    data = payload.get('data')
    if isinstance(data, dict):
        if ip and isinstance(data.get(ip), dict):
            node, ip = data[ip], ip
        else:
            for k, v in data.items():
                if isinstance(v, dict):
                    node, ip = v, ip or str(k)
                    break
    if not node:
        # payload 本身就是 IP 对象（或不含 data 段）
        node = payload if ('intelligences' in payload or 'judgments' in payload) else {}
    if not node:
        return {}

    score = 0.0
    reasons: List[str] = []
    type_scores: List[Tuple[str, float]] = []

    # ---------- 1) 情报条目（过期的不计分）----------
    intel = node.get('intelligences') or {}
    lab = (intel.get('threatbook_lab') or []) if isinstance(intel, dict) else []
    live_types = set()
    for item in lab:
        if not isinstance(item, dict):
            continue
        if item.get('expired'):
            continue  # 历史情报不代表当前仍恶意
        conf = float(item.get('confidence') or 0) or JUDGMENT_DEFAULT_CONFIDENCE
        for t in item.get('intel_types') or []:
            base = _classify_intel_type(t)
            if base <= 0:
                continue
            add = base * min(conf, 100) / 100.0
            type_scores.append((str(t), add))
            live_types.add(str(t))

    # ---------- 2) 官方结论标签 judgments ----------
    # judgments 是 intelligences 的汇总；若某结论没有对应的未过期条目，
    # 说明情报已过期但微步仍保留结论 → 按默认置信度记一次（弱证据）。
    for j in node.get('judgments') or []:
        base = _classify_intel_type(j)
        if base <= 0 or str(j) in live_types:
            continue
        add = base * JUDGMENT_DEFAULT_CONFIDENCE / 100.0
        type_scores.append((str(j), add))
        live_types.add(str(j))

    merged = _dedup_keep_max(type_scores)
    for t, add in merged.items():
        score += add
        reasons.append(f'{t} +{add:.0f}')

    # ---------- 3) 关联恶意样本 ----------
    families: Dict[str, float] = {}
    for s in node.get('samples') or []:
        if not isinstance(s, dict):
            continue
        if str(s.get('threat_level') or '').lower() != 'malicious':
            continue
        age = _days_since(s.get('scan_time'))
        if age is None:
            add = SAMPLE_SCORE_OLD * 0.5
        elif age <= 365:
            add = SAMPLE_SCORE_RECENT
        elif age <= SAMPLE_MAX_AGE_DAYS:
            add = SAMPLE_SCORE_OLD
        else:
            continue
        add *= _ratio_factor(s.get('ratio'))
        fam = str(s.get('malware_family') or '').strip()
        if fam and any(f in fam.lower() for f in HIGH_RISK_FAMILIES):
            add += FAMILY_BONUS
        key = fam or '未知家族'
        if key not in families or add > families[key]:
            families[key] = add
    for fam, add in families.items():
        score += add
        reasons.append(f'关联恶意样本[{fam}] +{add:.0f}')

    score = round(min(100.0, score), 1)
    level = _score_to_level(score)

    basic = node.get('basic') or {}
    loc = (basic.get('location') or {}) if isinstance(basic, dict) else {}
    asn = node.get('asn') or {}

    return {
        'provider': '微步在线',
        'ip': ip,
        'threat_level': level,
        'severity': level,                      # 对齐平台 severity 词表
        'threat_score': score,
        'is_malicious': score >= MALICIOUS_MIN_SCORE,
        'threat_tags': ','.join(node.get('judgments') or []),
        'intel_types': ','.join(sorted(live_types)),
        'malware_family': ','.join(families.keys()),
        'threat_reason': '；'.join(reasons) or '无恶意命中',
        'scene': node.get('scene') or '',
        'carrier': (basic.get('carrier') or '') if isinstance(basic, dict) else '',
        'country': loc.get('country') or '',
        'city': loc.get('city') or loc.get('province') or '',
        'asn': f"AS{asn.get('number')} {asn.get('info') or ''}".strip() if asn else '',
        'permalink': node.get('permalink') or '',
        'update_time': node.get('update_time') or '',
    }


# ==================================================================
# VirusTotal IP 情报
# ==================================================================

def normalize_virustotal_ip(payload: Any, ip: str = '') -> Dict[str, Any]:
    """把 VirusTotal /api/v3/ip_addresses 的响应归一化（同一套输出字段）。"""
    if not isinstance(payload, dict):
        return {}
    attrs = (payload.get('data') or {}).get('attributes') or {}
    if not attrs:
        return {}
    stats = attrs.get('last_analysis_stats') or {}
    malicious = int(stats.get('malicious') or 0)
    suspicious = int(stats.get('suspicious') or 0)
    total = sum(int(stats.get(k) or 0) for k in ('malicious', 'suspicious', 'harmless', 'undetected'))
    ratio = (malicious / total) if total else 0.0

    score = 0.0
    reasons: List[str] = []
    if malicious >= 10 or ratio >= 0.3:
        score += 70 * min(1.0, max(ratio, 0.3))
        reasons.append(f'{malicious}/{total} 引擎报恶意 +{score:.0f}')
    elif malicious >= 3:
        score += 40
        reasons.append(f'{malicious} 个引擎报恶意 +40')
    elif malicious >= 1:
        score += 20
        reasons.append(f'{malicious} 个引擎报恶意 +20')
    if suspicious:
        score += min(15, suspicious * 3)
        reasons.append(f'{suspicious} 个引擎报可疑 +{min(15, suspicious * 3)}')

    score = round(min(100.0, score), 1)
    level = _score_to_level(score)
    return {
        'provider': 'VirusTotal',
        'ip': ip or (payload.get('data') or {}).get('id', ''),
        'threat_level': level,
        'severity': level,
        'threat_score': score,
        'is_malicious': score >= MALICIOUS_MIN_SCORE,
        'threat_tags': '恶意' if malicious >= 3 else ('可疑' if malicious or suspicious else ''),
        'intel_types': '',
        'malware_family': '',
        'threat_reason': '；'.join(reasons) or '无恶意命中',
        'scene': attrs.get('network') or '',
        'carrier': attrs.get('as_owner') or '',
        'country': attrs.get('country') or '',
        'city': '',
        'asn': f"AS{attrs.get('asn')}" if attrs.get('asn') else '',
        'permalink': f"https://www.virustotal.com/gui/ip-address/{ip}" if ip else '',
        'update_time': '',
    }


# ==================================================================
# 统一入口
# ==================================================================

# profile 取值 → 归一化函数；'auto' 按响应特征嗅探
_INTEL_PROFILES = {
    'threatbook_ip': normalize_threatbook_ip,
    'threatbook': normalize_threatbook_ip,
    '微步在线': normalize_threatbook_ip,
    '微步': normalize_threatbook_ip,
    'vt_ip': normalize_virustotal_ip,
    'virustotal': normalize_virustotal_ip,
    'virustotal_ip': normalize_virustotal_ip,
}


def detect_intel_profile(payload: Any) -> str:
    """按响应特征嗅探情报源；识别不出返回 ''。"""
    if not isinstance(payload, dict):
        return ''
    text = str(payload)[:2000]
    if 'threatbook_lab' in text or 'judgments' in text:
        return 'threatbook_ip'
    if 'last_analysis_stats' in text or 'virustotal' in text.lower():
        return 'virustotal_ip'
    return ''


def normalize_intel(profile: str, payload: Any, ip: str = '') -> Dict[str, Any]:
    """归一化入口。profile 支持 threatbook_ip / virustotal_ip / auto。

    返回扁平摘要 dict；无法识别或响应为空时返回 {}（调用方应跳过变量注入）。
    """
    if not isinstance(payload, dict) or not payload:
        return {}
    key = str(profile or '').strip().lower()
    if key in ('', 'auto', '自动'):
        key = detect_intel_profile(payload)
    fn = _INTEL_PROFILES.get(key)
    if fn is None:
        return {}
    try:
        return fn(payload, ip) or {}
    except Exception:
        return {}
