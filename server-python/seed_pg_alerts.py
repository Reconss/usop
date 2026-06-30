"""注入测试数据到 PostgreSQL alerts 表"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timedelta
from app import create_app
from app.database import db
from app.models import Alert

app = create_app()

alerts = [
    dict(alert_code="20260602001", title="SSH暴力破解攻击", severity="critical", status="new",
         source="HIDS", source_product="Wazuh", source_type="HIDS", category="暴力破解", confidence=95.0,
         src_ip="198.51.100.23", src_port=48231, dst_ip="10.0.1.50", dst_port=22, protocol="SSH",
         hostname="bastion-01.internal", first_seen=datetime(2026,6,2,10,30), last_seen=datetime(2026,6,2,10,35),
         raw_log='{"event_type":"ssh_bruteforce","attempts":156,"username":"root"}',
         parsed_data={"username": "root", "attempt_count": 156, "unique_usernames": ["root","admin","test"]},
         tags=["暴力破解","SSH","认证攻击"]),
    dict(alert_code="20260602002", title="WebShell 上传检测", severity="critical", status="investigating",
         source="WAF", source_product="ModSecurity", source_type="WAF", category="Web攻击", confidence=98.0,
         src_ip="203.0.113.78", src_port=33456, dst_ip="10.0.1.100", dst_port=443, protocol="HTTPS",
         hostname="web-01.internal",
         first_seen=datetime(2026,6,2,11,0), last_seen=datetime(2026,6,2,11,5),
         raw_log='{"event_type":"webshell","file":"/uploads/shell.php","method":"POST"}',
         parsed_data={"file_path": "/uploads/shell.php", "file_hash": "e99a18c428cb38d5f260853678922e03"},
         tags=["WebShell","后门","高危"]),
    dict(alert_code="20260602003", title="SQL注入攻击", severity="high", status="new",
         source="WAF", source_product="ModSecurity", source_type="WAF", category="Web攻击", confidence=92.0,
         src_ip="198.51.100.45", src_port=52100, dst_ip="10.0.1.100", dst_port=80, protocol="HTTP",
         hostname="web-01.internal",
         first_seen=datetime(2026,6,2,11,30), last_seen=datetime(2026,6,2,11,35),
         raw_log='{"event_type":"sqli","payload":"1\' OR 1=1--","path":"/api/login"}',
         parsed_data={"payload": "1' OR 1=1--", "path": "/api/login", "method": "POST"},
         tags=["SQL注入","Web攻击"]),
    dict(alert_code="20260602004", title="端口扫描检测", severity="medium", status="new",
         source="IDS", source_product="Suricata", source_type="IDS", category="网络扫描", confidence=85.0,
         src_ip="203.0.113.45", src_port=54321, dst_ip="10.0.1.100", dst_port=None, protocol="TCP",
         hostname="web-01.internal",
         first_seen=datetime(2026,6,2,12,0), last_seen=datetime(2026,6,2,12,10),
         raw_log='{"event_type":"scan","scanned_ports":[22,80,443,3306,6379],"duration":"30s"}',
         parsed_data={"scan_type": "SYN扫描", "scanned_count": 1024, "open_ports": [80,443]},
         tags=["端口扫描","侦察"]),
    dict(alert_code="20260602005", title="C2通信检测", severity="high", status="new",
         source="EDR", source_product="CrowdStrike", source_type="EDR", category="恶意软件", confidence=88.0,
         src_ip="10.0.1.200", src_port=61234, dst_ip="185.220.100.252", dst_port=443, protocol="HTTPS",
         hostname="pc-sales-07",
         first_seen=datetime(2026,6,2,13,0), last_seen=datetime(2026,6,2,13,30),
         raw_log='{"event_type":"c2_beacon","domain":"evil-c2.example.com","interval":"60s"}',
         parsed_data={"domain": "evil-c2.example.com", "beacon_interval": 60, "jitter": 15},
         tags=["C2","恶意软件","APT"]),
    dict(alert_code="20260602006", title="异常DNS查询", severity="low", status="closed",
         source="NDR", source_product="Zeek", source_type="NIDS", category="异常流量", confidence=70.0,
         src_ip="10.0.1.200", src_port=53, dst_ip="8.8.8.8", dst_port=53, protocol="DNS",
         hostname="pc-sales-07",
         first_seen=datetime(2026,6,2,14,0), last_seen=datetime(2026,6,2,14,5),
         raw_log='{"event_type":"dns","query":"x7f.example.xyz","type":"TXT"}',
         parsed_data={"query_name": "x7f.example.xyz", "record_type": "TXT", "response": "NXDOMAIN"},
         tags=["DNS","异常流量"]),
    dict(alert_code="20260602007", title="权限提升检测", severity="critical", status="new",
         source="HIDS", source_product="Wazuh", source_type="HIDS", category="权限异常", confidence=90.0,
         src_ip="10.0.1.50", src_port=0, dst_ip="10.0.1.50", dst_port=0, protocol="local",
         hostname="db-01.internal",
         first_seen=datetime(2026,6,2,15,0), last_seen=datetime(2026,6,2,15,2),
         raw_log='{"event_type":"privilege_escalation","user":"app_user","sudo":"true","target":"root"}',
         parsed_data={"user": "app_user", "escalated_to": "root", "method": "sudo"},
         tags=["权限提升","本地攻击"]),
    dict(alert_code="20260602008", title="DDoS流量检测", severity="high", status="investigating",
         source="IDS", source_product="Suricata", source_type="IDS", category="拒绝服务", confidence=95.0,
         src_ip="103.24.77.10", src_port=0, dst_ip="10.0.1.100", dst_port=80, protocol="TCP",
         hostname="web-01.internal",
         first_seen=datetime(2026,6,2,16,0), last_seen=datetime(2026,6,2,16,30),
         raw_log='{"event_type":"ddos","packets_per_sec":50000,"attack_type":"SYN Flood"}',
         parsed_data={"packets_per_sec": 50000, "attack_type": "SYN Flood", "duration": "30min"},
         tags=["DDoS","拒绝服务"]),
    dict(alert_code="20260602009", title="数据库异常查询", severity="medium", status="new",
         source="DAM", source_product="Imperva", source_type="DAM", category="数据泄露", confidence=80.0,
         src_ip="10.0.1.80", src_port=44556, dst_ip="10.0.1.30", dst_port=5432, protocol="TCP",
         hostname="app-server-03",
         first_seen=datetime(2026,6,2,17,0), last_seen=datetime(2026,6,2,17,10),
         raw_log='{"event_type":"db_anomaly","query":"SELECT * FROM users WHERE 1=1","rows_returned":50000}',
         parsed_data={"query_type": "full_table_scan", "rows_returned": 50000, "database": "app_db"},
         tags=["数据库","异常查询"]),
    dict(alert_code="20260602010", title="SSL证书异常", severity="low", status="closed",
         source="NDR", source_product="Zeek", source_type="NIDS", category="异常流量", confidence=65.0,
         src_ip="10.0.1.200", src_port=65432, dst_ip="198.51.100.99", dst_port=443, protocol="TLS",
         hostname="pc-sales-07",
         first_seen=datetime(2026,6,2,18,0), last_seen=datetime(2026,6,2,18,2),
         raw_log='{"event_type":"ssl_anomaly","cert_subject":"CN=unknown","cert_issuer":"CN=Self-Signed"}',
         parsed_data={"cert_subject": "CN=unknown", "self_signed": True, "expired": False},
         tags=["TLS","证书异常"]),
]

with app.app_context():
    exists = Alert.query.count()
    if exists > 0:
        print(f"已存在 {exists} 条告警，跳过注入")
    else:
        for a in alerts:
            db.session.add(Alert(**a))
        db.session.commit()
        print(f"✅ 已注入 {len(alerts)} 条测试告警")
