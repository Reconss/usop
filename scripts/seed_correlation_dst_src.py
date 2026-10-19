"""目标/源维度关联分析策略种子脚本（幂等）。

按目标（dst_ip）、源（src_ip）两个维度聚合有效告警生成事件：
  - 同目标高频告警聚合：同一目的 IP 在 5 分钟窗口内触发 ≥10 次有效告警 → 生成事件
  - 同源高频告警聚合：同一来源 IP 在 5 分钟窗口内触发 ≥10 次有效告警 → 生成事件

规则写入 PG correlation_rules 表（Flink 常驻作业消费），部署后需通过
POST /api/pipeline/correlation/deploy 重新提交作业生效。

用法：
  docker cp scripts/seed_correlation_dst_src.py usop_all:/tmp/
  docker exec -w /app -e PYTHONPATH=/app usop_all python3 /tmp/seed_correlation_dst_src.py
"""
from app import create_app
from app.alert_pipeline.pipeline import db, CorrelationRule

app = create_app()

STRATEGIES = [
    {
        'match': {'name': '同目标高频告警聚合'},
        'fields': {
            'name': '同目标高频告警聚合',
            'description': ('按目标 IP 维度聚合：同一目的 IP 在 5 分钟窗口内触发 10 次及以上有效告警时'
                            '生成关联事件，用于发现被集中扫描/攻击的目标主机'),
            'analysis_type': 'frequency',
            'source_topic': 'valid-alerts',
            'field': 'dst_ip',
            'window_seconds': 300,
            'threshold': 10,
            'severity': 'high',
            'event_title': '目标主机高频告警聚合事件',
            'event_category': 'correlation',
            'enabled': True,
        },
    },
    {
        'match': {'name': '同源高频告警聚合'},
        'fields': {
            'name': '同源高频告警聚合',
            'description': ('按源 IP 维度聚合：同一来源 IP 在 5 分钟窗口内触发 10 次及以上有效告警时'
                            '生成关联事件，用于发现持续性攻击源'),
            'analysis_type': 'frequency',
            'source_topic': 'valid-alerts',
            'field': 'src_ip',
            'window_seconds': 300,
            'threshold': 10,
            'severity': 'high',
            'event_title': '高威胁源 IP 聚合事件',
            'event_category': 'correlation',
            'enabled': True,
        },
    },
]

with app.app_context():
    for s in STRATEGIES:
        rule = CorrelationRule.query.filter_by(**s['match']).first()
        action = 'updated'
        if not rule:
            rule = CorrelationRule(**s['fields'])
            db.session.add(rule)
            action = 'created'
        else:
            for k, v in s['fields'].items():
                setattr(rule, k, v)
        db.session.commit()
        print(f"{action}: #{rule.id} {rule.name} [{rule.analysis_type}/{rule.field} "
              f"{rule.window_seconds}s/≥{rule.threshold:g}]")
    print('done。部署作业：POST /api/pipeline/correlation/deploy')
