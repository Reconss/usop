"""
告警幂等去重指纹（借鉴 EFF-Monitoring 的 dedup_hash 设计）

对告警的「身份字段」做稳定序列化后取 SHA256 前 32 位作为去重指纹：
同一来源产品、同一告警类型、同一源/目的(端口/协议) 在时间窗口内视为重复，
消费者据此跳过重复入库，仅刷新既有记录的 last_seen 与发生次数。
"""

import hashlib
import json

# 参与去重指纹的字段（身份字段，不含时间戳——时间变化不应产生新告警）。
# 注意：alert_code 是系统生成的随机编号（如 SRT-xxxx），不参与指纹，
# 否则同一来源的同一条告警每次解析都会得到不同指纹，去重永远不命中。
_DEDUP_FIELDS = (
    'title', 'category', 'severity',
    'src_ip', 'src_port', 'dst_ip', 'dst_port',
    'protocol', 'hostname', 'source_product', 'source_type',
)


def compute_dedup_hash(alert_data: dict) -> str:
    """计算告警去重指纹 sha256[:32]。

    身份字段缺失时按 None 处理；parsed_data 以 sort_keys 稳定序列化参与哈希，
    保证相同内容必得相同指纹。
    """
    identity = {k: alert_data.get(k) for k in _DEDUP_FIELDS}
    parsed = alert_data.get('parsed_data') or {}
    try:
        parsed_part = json.dumps(parsed, sort_keys=True, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        parsed_part = ''
    raw = json.dumps(identity, sort_keys=True, ensure_ascii=False, default=str) + '|' + parsed_part
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()[:32]
