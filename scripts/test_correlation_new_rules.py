"""关联分析新规则实测：向 Kafka valid-alerts 发一批标准告警，一次覆盖 8 条新规则。

设计（各规则触发条件见 seed_correlation_rules_extra.py）：
  #9  端口扫描探测   203.0.113.66 12 条、12 个不同 dst_port
  #10 多目标横向     同上、5 个不同 dst_ip
  #12 暴力破解       203.0.113.66 12 条 title 含 login
  #15 高置信源IP     同组 confidence 均 95（avg≥80）
  #16 扫描后注入链   先 title 含 Scan 的告警、后 title 含 Injection 的告警
  #11 多源协同       6 个不同 src_ip 打同一 dst_ip=10.0.0.30
  #13 单主机风暴     9 条 hostname=web-prod-01
  #14 重点端口受击   18 条 dst_port=443
"""
import json
import sys
import uuid
from datetime import datetime, timezone

from kafka import KafkaProducer

TOPIC = 'valid-alerts'


def base(**kw):
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000000+0000')
    rec = {
        'alert_id': 'ALT-' + uuid.uuid4().hex[:20],
        'alert_code': 'T' + str(kw.get('n', 1)),
        'title': 'test alert',
        'description': 'correlation rule test',
        'severity': 'high',
        'category': 'network',
        'source': 'Suricata',
        'source_product': 'suricata',
        'source_type': 'ids',
        'src_ip': '203.0.113.66',
        'dst_ip': '10.0.0.11',
        'src_port': 40000,
        'dst_port': 443,
        'protocol': 'TCP',
        'hostname': 'web-prod-01',
        'username': 'svc_test',
        'operation': 'http',
        'confidence': 95,
        'first_seen': now,
        'last_seen': now,
    }
    rec.update(kw)
    return rec


msgs = []

# ---- #9 端口扫描 + #10 多目标 + #12 暴力破解 + #15 高置信：同一源 IP ----
dports = [21, 22, 23, 25, 80, 110, 143, 443, 3306, 5432, 6379, 8080]
dips = [f'10.0.0.{i}' for i in range(11, 16)]
for i, dp in enumerate(dports):
    msgs.append(base(n=i + 1, dst_port=dp, dst_ip=dips[i % len(dips)],
                     title='ET SCAN Port Probe'))
# 补充 login 类标题（凑 #12 计数，同源 IP）
for i in range(11):
    msgs.append(base(n=20 + i, dst_port=dports[i % len(dports)],
                     dst_ip=dips[i % len(dips)],
                     title='Wazuh Multiple failed login attempts'))

# ---- #16 扫描后注入链：Scan 已发，最后发 Injection（保证 proc_time 顺序）----
msgs.append(base(n=40, dst_port=443, dst_ip='10.0.0.11',
                 title='ET WEB_SERVER SQL Injection Attack'))

# ---- #11 多源协同：6 个不同源 IP 打同一目标 ----
for i in range(6):
    msgs.append(base(n=50 + i, src_ip=f'198.51.100.{11 + i}',
                     dst_ip='10.0.0.30', dst_port=22,
                     title='Multiple failed login attempts',
                     category='authentication', confidence=60))

# ---- #13 单主机告警风暴：hostname=web-prod-01 9 条 ----
for i in range(9):
    msgs.append(base(n=60 + i, hostname='web-prod-01', dst_port=8080,
                     dst_ip=dips[i % len(dips)],
                     title='internal host alert', confidence=50))

# ---- #14 重点服务端口受击：dst_port=443 补到 18 条 ----
for i in range(14):
    msgs.append(base(n=70 + i, dst_port=443, dst_ip='10.0.0.99',
                     src_ip=f'192.168.5.{100 + i}',
                     title='service port alert', confidence=55))

producer = KafkaProducer(
    bootstrap_servers='kafka:29092',
    value_serializer=lambda v: json.dumps(v).encode('utf-8'),
)
for m in msgs:
    producer.send(TOPIC, m)
producer.flush()
producer.close()
print(f'sent {len(msgs)} alerts to {TOPIC}')
