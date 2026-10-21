"""关联分析规则扩充种子脚本（幂等）。

在既有 5 条规则（#2 同源高频 / #3 同源多规则 / #5 先扫后打 / #7 同目标聚合 /
#8 同源聚合）基础上追加 8 条实战场景规则，补足四类分析手段与更多维度：

  distinct    端口扫描探测         src_ip × dst_port   60s ≥10
  distinct    多目标横向攻击       src_ip × dst_ip    300s ≥5
  distinct    多源协同攻击         dst_ip × src_ip    300s ≥5
  frequency   暴力破解高频         src_ip               300s ≥10（筛选登录类告警）
  frequency   单主机告警风暴       hostname             60s ≥8
  frequency   重点服务端口受击     dst_port            600s ≥15
  aggregation 高置信源 IP 持续威胁 src_ip  avg(confidence) 300s ≥80
  sequence    扫描后注入攻击链     src_ip  Scan → Injection 300s（critical）

规则写入 PG correlation_rules 表（Flink 常驻作业消费），部署后需通过
POST /api/pipeline/correlation/deploy 重新提交作业生效。

用法：
  docker cp scripts/seed_correlation_rules_extra.py usop_all:/tmp/
  docker exec -w /app -e PYTHONPATH=/app usop_all python3 /tmp/seed_correlation_rules_extra.py
"""
from app import create_app
from app.alert_pipeline.pipeline import db, CorrelationRule

app = create_app()

STRATEGIES = [
    # ---------- distinct：去重计数 ----------
    {
        'match': {'name': '端口扫描探测'},
        'fields': {
            'name': '端口扫描探测',
            'description': ('按源 IP 维度去重计数：同一源 IP 在 1 分钟窗口内触达 10 个及以上'
                            '不同目的端口，为典型端口扫描行为'),
            'analysis_type': 'distinct',
            'source_topic': 'valid-alerts',
            'field': 'src_ip',
            'window_seconds': 60,
            'threshold': 10,
            'severity': 'high',
            'event_title': '端口扫描探测事件',
            'event_category': 'correlation',
            'enabled': True,
            'config': {'count_field': 'dst_port'},
        },
    },
    {
        'match': {'name': '多目标横向攻击检测'},
        'fields': {
            'name': '多目标横向攻击检测',
            'description': ('按源 IP 维度去重计数：同一源 IP 在 5 分钟窗口内攻击 5 个及以上'
                            '不同目标 IP，提示批量扫描或横向移动'),
            'analysis_type': 'distinct',
            'source_topic': 'valid-alerts',
            'field': 'src_ip',
            'window_seconds': 300,
            'threshold': 5,
            'severity': 'high',
            'event_title': '多目标横向攻击事件',
            'event_category': 'correlation',
            'enabled': True,
            'config': {'count_field': 'dst_ip'},
        },
    },
    {
        'match': {'name': '多源协同攻击检测'},
        'fields': {
            'name': '多源协同攻击检测',
            'description': ('按目标 IP 维度去重计数：同一目标 IP 在 5 分钟窗口内被 5 个及以上'
                            '不同源 IP 攻击，提示协同攻击或僵尸网络分布式扫描'),
            'analysis_type': 'distinct',
            'source_topic': 'valid-alerts',
            'field': 'dst_ip',
            'window_seconds': 300,
            'threshold': 5,
            'severity': 'high',
            'event_title': '多源协同攻击事件',
            'event_category': 'correlation',
            'enabled': True,
            'config': {'count_field': 'src_ip'},
        },
    },
    # ---------- frequency：频次阈值 ----------
    {
        'match': {'name': '暴力破解高频告警'},
        'fields': {
            'name': '暴力破解高频告警',
            'description': ('按源 IP 维度频次聚合：同一源 IP 在 5 分钟窗口内触发 10 次及以上'
                            '登录认证类告警，提示口令暴力破解'),
            'analysis_type': 'frequency',
            'source_topic': 'valid-alerts',
            'field': 'src_ip',
            'window_seconds': 300,
            'threshold': 10,
            'severity': 'high',
            'event_title': '暴力破解事件',
            'event_category': 'correlation',
            'enabled': True,
            'config': {
                'filter': [
                    {'field': 'title', 'operator': 'contains', 'value': 'login'}
                ],
            },
        },
    },
    {
        'match': {'name': '单主机告警风暴'},
        'fields': {
            'name': '单主机告警风暴',
            'description': ('按主机维度频次聚合：同一主机在 1 分钟窗口内触发 8 次及以上有效告警，'
                            '提示主机正遭受集中攻击或已失陷产生大量外联告警'),
            'analysis_type': 'frequency',
            'source_topic': 'valid-alerts',
            'field': 'hostname',
            'window_seconds': 60,
            'threshold': 8,
            'severity': 'medium',
            'event_title': '单主机告警风暴事件',
            'event_category': 'correlation',
            'enabled': True,
            'config': {},
        },
    },
    {
        'match': {'name': '重点服务端口受击'},
        'fields': {
            'name': '重点服务端口受击',
            'description': ('按目的端口维度频次聚合：同一服务端口在 10 分钟窗口内触发 15 次及以上'
                            '有效告警，提示对外服务持续遭受扫描或利用尝试'),
            'analysis_type': 'frequency',
            'source_topic': 'valid-alerts',
            'field': 'dst_port',
            'window_seconds': 600,
            'threshold': 15,
            'severity': 'medium',
            'event_title': '重点服务持续受击事件',
            'event_category': 'correlation',
            'enabled': True,
            'config': {},
        },
    },
    # ---------- aggregation：聚合统计 ----------
    {
        'match': {'name': '高置信源IP持续威胁'},
        'fields': {
            'name': '高置信源IP持续威胁',
            'description': ('按源 IP 维度聚合置信度：同一源 IP 在 5 分钟窗口内的告警平均置信度'
                            '达到 80 及以上，提示高可信度的持续性威胁活动'),
            'analysis_type': 'aggregation',
            'source_topic': 'valid-alerts',
            'field': 'src_ip',
            'window_seconds': 300,
            'threshold': 80,
            'severity': 'high',
            'event_title': '高置信源IP威胁事件',
            'event_category': 'correlation',
            'enabled': True,
            'config': {'agg_func': 'avg', 'agg_field': 'confidence', 'compare': 'gte'},
        },
    },
    # ---------- sequence：时序关联 ----------
    {
        'match': {'name': '扫描后注入攻击链'},
        'fields': {
            'name': '扫描后注入攻击链',
            'description': ('按源 IP 维度时序关联：同一源 IP 在 5 分钟窗口内先出现扫描类告警、'
                            '后出现注入类告警，构成「侦察→利用」完整攻击链'),
            'analysis_type': 'sequence',
            'source_topic': 'valid-alerts',
            'field': 'src_ip',
            'window_seconds': 300,
            'threshold': 2,  # sequence 的阈值无业务含义，但列 NOT NULL；既有 #5 同样存 2
            'severity': 'critical',
            'event_title': '扫描后注入攻击链事件',
            'event_category': 'correlation',
            'enabled': True,
            'config': {
                'match_a_field': 'title',
                'match_a_operator': 'contains',
                'match_a_value': 'SCAN',  # Flink LIKE 大小写敏感，真实告警标题里是大写 SCAN
                'match_b_field': 'title',
                'match_b_operator': 'contains',
                'match_b_value': 'Injection',
            },
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
        print(f"{action}: #{rule.id} {rule.name} "
              f"[{rule.analysis_type}/{rule.field} {rule.window_seconds}s/>= {rule.threshold}]")
    total = CorrelationRule.query.count()
    enabled = CorrelationRule.query.filter(CorrelationRule.enabled.is_(True)).count()
    print(f'done。当前共 {total} 条规则（启用 {enabled} 条）。'
          f'部署作业：POST /api/pipeline/correlation/deploy')
