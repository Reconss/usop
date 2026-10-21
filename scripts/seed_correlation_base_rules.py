"""关联分析基线规则种子脚本（幂等）。

#2 同源 IP 高频告警 / #3 同源多规则命中 / #8 同源高频告警聚合 三条基线规则
（#5/#7 另有 sys 种子与 seed_correlation_dst_src.py 覆盖；#9~#16 由
seed_correlation_rules_extra.py 覆盖）。这三条因历史原因无种子，曾被误删后
手工恢复——固化成脚本，必要时重跑即可。

用法：
  docker cp scripts/seed_correlation_base_rules.py usop_all:/tmp/
  docker exec -w /app -e PYTHONPATH=/app usop_all python3 /tmp/seed_correlation_base_rules.py
"""
from app import create_app
from app.alert_pipeline.pipeline import db, CorrelationRule

app = create_app()

RULES = [
    {
        'match': {'name': '同源 IP 高频告警'},
        'fields': {
            'id': 2,
            'name': '同源 IP 高频告警',
            'description': ('按源 IP 维度频次聚合：同一源 IP 在 20 秒窗口内触发 2 次及以上'
                            '有效告警时生成关联事件，用于发现突发告警源'),
            'analysis_type': 'frequency',
            'source_topic': 'valid-alerts',
            'field': 'src_ip',
            'window_seconds': 20,
            'threshold': 2,
            'severity': 'high',
            'event_title': None,
            'event_category': 'correlation',
            'enabled': True,
            'config': {
                'filter': [], 'compare': 'gte', 'agg_func': 'sum', 'agg_field': '',
                'count_field': '', 'match_a_field': '', 'match_a_value': '',
                'match_b_field': '', 'match_b_value': '',
                'match_a_operator': 'contains', 'match_b_operator': 'contains',
            },
        },
    },
    {
        'match': {'name': '同源多规则命中'},
        'fields': {
            'id': 3,
            'name': '同源多规则命中',
            'description': ('按源 IP 维度去重计数：同一源 IP 在 60 秒窗口内命中 3 个及以上'
                            '不同告警编号，提示多规则同时命中'),
            'analysis_type': 'distinct',
            'source_topic': 'valid-alerts',
            'field': 'src_ip',
            'window_seconds': 60,
            'threshold': 3,
            'severity': 'high',
            'event_title': None,
            'event_category': 'correlation',
            'enabled': True,
            'config': {'count_field': 'alert_code'},
        },
    },
    {
        'match': {'name': '同源高频告警聚合'},
        'fields': {
            'id': 8,
            'name': '同源高频告警聚合',
            'description': ('按源 IP 维度聚合：同一来源 IP 在 5 分钟窗口内触发 10 次及以上'
                            '有效告警时生成关联事件，用于发现持续性攻击源'),
            'analysis_type': 'frequency',
            'source_topic': 'valid-alerts',
            'field': 'src_ip',
            'window_seconds': 300,
            'threshold': 10,
            'severity': 'high',
            'event_title': '高威胁源 IP 聚合事件',
            'event_category': 'correlation',
            'enabled': True,
            'config': {},
        },
    },
]

with app.app_context():
    for s in RULES:
        rule = CorrelationRule.query.filter_by(**s['match']).first()
        if not rule:
            rule = CorrelationRule(**s['fields'])
            db.session.add(rule)
            db.session.commit()
            print(f"created: #{rule.id} {rule.name}")
        else:
            # 按 name 已存在但 id 不同（曾被删除重建）：对齐 id 便于 CE 编号延续
            print(f"exists: #{rule.id} {rule.name}")
    total = CorrelationRule.query.count()
    print(f'done。当前共 {total} 条规则。部署作业：POST /api/pipeline/correlation/deploy')
