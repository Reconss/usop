"""
TimescaleDB 告警测试数据种子脚本
插入多种类型的告警日志用于测试
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timedelta
from app import create_app
from app.timescaledb import get_tsdb, create_alerts_hypertable, insert_alert

app = create_app()

# 各类告警测试数据
alert_templates = [
    {
        "title": "端口扫描检测",
        "description": "发现来自外部IP的端口扫描行为，扫描了大量端口",
        "severity": "medium", "source": "NIDS",
        "source_product": "Suricata", "source_type": "IDS",
        "category": "网络扫描", "confidence": 85.0,
        "src_ip": "203.0.113.45", "src_port": 54321,
        "dst_ip": "10.0.1.100", "dst_port": None,
        "protocol": "TCP",
        "asset_name": "Web-服务器-01", "hostname": "web-01.internal",
        "raw_log": '{"event_type":"scan","src_ip":"203.0.113.45","dst_ip":"10.0.1.100","scanned_ports":[22,80,443,3306,6379,8080,8443],"scan_duration":"30s","protocol":"TCP"}',
        "parsed_data": {"scan_type": "全端口扫描", "scanned_count": 1024, "open_ports": [80, 443]},
        "tags": ["端口扫描", "侦察", "外部威胁"]
    },
    {
        "title": "SSH暴力破解攻击",
        "description": "检测到SSH登录失败次数超过阈值，疑似暴力破解攻击",
        "severity": "high", "source": "HIDS",
        "source_product": "Wazuh", "source_type": "HIDS",
        "category": "暴力破解", "confidence": 95.0,
        "src_ip": "198.51.100.23", "src_port": 48231,
        "dst_ip": "10.0.1.50", "dst_port": 22,
        "protocol": "SSH",
        "asset_name": "堡垒机-01", "hostname": "bastion-01.internal",
        "raw_log": '{"event_type":"ssh_bruteforce","src_ip":"198.51.100.23","username":"root","attempts":156,"duration":"5m","last_failed_at":"2026-05-05T12:30:00Z"}',
        "parsed_data": {"username": "root", "attempt_count": 156, "unique_usernames": ["root", "admin", "test", "ubuntu"]},
        "tags": ["暴力破解", "SSH", "认证攻击"]
    },
    {
        "title": "WebShell 上传检测",
        "description": "检测到Web服务器上上传了可疑的PHP文件，疑似WebShell",
        "severity": "critical", "source": "WAF",
        "source_product": "ModSecurity", "source_type": "WAF",
        "category": "Web攻击", "confidence": 98.0,
        "src_ip": "45.33.32.156", "src_port": 44321,
        "dst_ip": "10.0.1.100", "dst_port": 80,
        "protocol": "HTTP",
        "asset_name": "Web-服务器-01", "hostname": "web-01.internal",
        "raw_log": '{"event_type":"webshell","src_ip":"45.33.32.156","uri":"/uploads/shell.php","file":"shell.php","md5":"a1b2c3d4e5f6","size":2048,"action":"upload"}',
        "parsed_data": {"uri": "/uploads/shell.php", "file_name": "shell.php", "file_hash": "a1b2c3d4e5f6", "matched_rules": ["RFI", "PHP_EVAL"]},
        "tags": ["WebShell", "文件上传", "恶意软件", "紧急"]
    },
    {
        "title": "DDoS 流量攻击",
        "description": "检测到大量异常流量，符合DDoS攻击特征",
        "severity": "critical", "source": "NIDS",
        "source_product": "Zeek", "source_type": "NIDS",
        "category": "DDoS", "confidence": 90.0,
        "src_ip": "192.0.2.10", "src_port": None,
        "dst_ip": "10.0.2.200", "dst_port": 443,
        "protocol": "TCP",
        "asset_name": "核心-网关", "hostname": "gateway-01.internal",
        "raw_log": '{"event_type":"ddos","target_ip":"10.0.2.200","target_port":443,"packet_rate":50000,"bps":2500000000,"duration":"10m","source_ips_count":1523}',
        "parsed_data": {"packet_rate": 50000, "bps": 2500000000, "duration_min": 10, "source_ips_count": 1523},
        "tags": ["DDoS", "流量攻击", "紧急", "大规模"]
    },
    {
        "title": "SQL注入攻击",
        "description": "WAF检测到SQL注入攻击特征，攻击者尝试注入恶意SQL语句",
        "severity": "high", "source": "WAF",
        "source_product": "CloudFlare WAF", "source_type": "WAF",
        "category": "Web攻击", "confidence": 92.0,
        "src_ip": "185.220.101.42", "src_port": 59234,
        "dst_ip": "10.0.1.100", "dst_port": 443,
        "protocol": "HTTP",
        "asset_name": "Web-服务器-01", "hostname": "web-01.internal",
        "raw_log": '{"event_type":"sql_injection","src_ip":"185.220.101.42","uri":"/api/users","payload":"1 OR 1=1--","method":"GET","matched_rule":"SQLI_BLIND","blocked":true}',
        "parsed_data": {"payload": "1 OR 1=1--", "matched_rule": "SQLI_BLIND", "blocked": True},
        "tags": ["SQL注入", "Web攻击", "高危"]
    },
    {
        "title": "勒索软件感染检测",
        "description": "终端检测到疑似勒索软件行为：大量文件被加密",
        "severity": "critical", "source": "EDR",
        "source_product": "CrowdStrike", "source_type": "EDR",
        "category": "恶意软件", "confidence": 99.0,
        "src_ip": "10.0.3.50", "src_port": None,
        "dst_ip": "10.0.3.50", "dst_port": None,
        "protocol": None,
        "asset_name": "财务-服务器", "hostname": "finance-01.internal",
        "raw_log": '{"event_type":"ransomware","process_name":"encryptor.exe","extension":".encrypted","affected_files":1500,"process_cmdline":"c:\\\\finance\\\\encryptor.exe","user":"finance_admin"}',
        "parsed_data": {"process_name": "encryptor.exe", "affected_files": 1500, "user": "finance_admin", "ransomware_family": "LockBit3.0"},
        "tags": ["勒索软件", "恶意软件", "紧急", "感染"]
    },
    {
        "title": "未授权访问告警",
        "description": "检测到未授权用户尝试访问高权限接口",
        "severity": "high", "source": "SIEM",
        "source_product": "Splunk ES", "source_type": "SIEM",
        "category": "权限异常", "confidence": 88.0,
        "src_ip": "10.0.0.105", "src_port": 33452,
        "dst_ip": "10.0.1.100", "dst_port": 443,
        "protocol": "HTTPS",
        "asset_name": "Web-服务器-01", "hostname": "web-01.internal",
        "raw_log": '{"event_type":"unauthorized_access","user":"john.doe","target":"/admin/config","method":"POST","status":403,"reason":"insufficient_privileges"}',
        "parsed_data": {"user": "john.doe", "target": "/admin/config", "status_code": 403, "reason": "insufficient_privileges"},
        "tags": ["未授权访问", "权限异常", "内部威胁"]
    },
    {
        "title": "数据外泄检测",
        "description": "检测到大量数据通过外网接口流出，疑似数据外泄",
        "severity": "critical", "source": "EDR",
        "source_product": "SentinelOne", "source_type": "EDR",
        "category": "数据安全", "confidence": 93.0,
        "src_ip": "10.0.1.150", "src_port": 43123,
        "dst_ip": "203.0.113.88", "dst_port": 443,
        "protocol": "HTTPS",
        "asset_name": "应用-服务器-02", "hostname": "app-02.internal",
        "raw_log": '{"event_type":"data_exfiltration","source_ip":"10.0.1.150","dest_ip":"203.0.113.88","bytes_sent":524288000,"files_sent":15,"time_span":"30m"}',
        "parsed_data": {"bytes_sent": 524288000, "files_sent": 15, "time_span_min": 30, "sensitive_data": True, "data_types": ["customer_pii", "financial_records"]},
        "tags": ["数据外泄", "数据安全", "紧急"]
    },
    {
        "title": "DNS隧道通信检测",
        "description": "检测到异常的DNS请求模式，疑似DNS隧道通信",
        "severity": "medium", "source": "NIDS",
        "source_product": "Zeek", "source_type": "NIDS",
        "category": "C2通信", "confidence": 75.0,
        "src_ip": "10.0.4.200", "src_port": 54321,
        "dst_ip": "8.8.8.8", "dst_port": 53,
        "protocol": "DNS",
        "asset_name": "办公-终端-01", "hostname": "desktop-01.internal",
        "raw_log": '{"event_type":"dns_tunnel","src_ip":"10.0.4.200","query":"abcdef123456.long-subdomain.malicious.com","query_type":"TXT","query_count":500,"duration":"1h"}',
        "parsed_data": {"query_type": "TXT", "query_count": 500, "domain": "malicious.com", "suspicious_pattern": "hex_encoded_subdomain"},
        "tags": ["DNS隧道", "C2", "隐蔽通信"]
    },
    {
        "title": "横向移动检测",
        "description": "检测到内网主机之间异常的网络连接，疑似横向移动",
        "severity": "high", "source": "SIEM",
        "source_product": "Elastic SIEM", "source_type": "SIEM",
        "category": "横向移动", "confidence": 82.0,
        "src_ip": "10.0.3.50", "src_port": 445,
        "dst_ip": "10.0.5.100", "dst_port": 445,
        "protocol": "SMB",
        "asset_name": "财务-服务器", "hostname": "finance-01.internal",
        "raw_log": '{"event_type":"lateral_movement","src_ip":"10.0.3.50","dst_ip":"10.0.5.100","protocol":"SMB","service":"ADMIN$","auth_type":"NTLM","user":"SYSTEM"}',
        "parsed_data": {"protocol": "SMB", "service": "ADMIN$", "auth_type": "NTLM", "user": "SYSTEM", "previous_alert_correlation": "ransomware_on_finance_server"},
        "tags": ["横向移动", "内网渗透", "SMB"]
    },
    {
        "title": "异常地理位置登录",
        "description": "用户账号在异常地理位置登录，与历史行为不符",
        "severity": "low", "source": "SIEM",
        "source_product": "Azure Sentinel", "source_type": "SIEM",
        "category": "身份异常", "confidence": 70.0,
        "src_ip": "91.234.56.78", "src_port": None,
        "dst_ip": "10.0.1.200", "dst_port": None,
        "protocol": None,
        "asset_name": "VPN-网关", "hostname": "vpn-01.internal",
        "raw_log": '{"event_type":"unusual_login","user":"zhang.san","src_ip":"91.234.56.78","geo":"RU","usual_geo":"CN","login_time":"2026-05-05T03:00:00Z","device":"iPhone 15","auth_method":"MFA"}',
        "parsed_data": {"user": "zhang.san", "geo": "RU", "usual_geo": "CN", "auth_method": "MFA", "risk_score": 65},
        "tags": ["异常登录", "身份安全", "低可信"]
    },
    {
        "title": "挖矿木马检测",
        "description": "检测到服务器CPU异常高，发现挖矿进程",
        "severity": "high", "source": "HIDS",
        "source_product": "Osquery", "source_type": "HIDS",
        "category": "恶意软件", "confidence": 97.0,
        "src_ip": "10.0.6.10", "src_port": None,
        "dst_ip": "45.33.32.156", "dst_port": 8333,
        "protocol": "TCP",
        "asset_name": "开发-服务器-01", "hostname": "dev-01.internal",
        "raw_log": '{"event_type":"cryptominer","process_name":"xmrig","cpu_usage":95,"memory_mb":512,"connection":"pool.minexmr.com:8333","user":"devops","container":"docker-dev-01"}',
        "parsed_data": {"process_name": "xmrig", "cpu_usage_pct": 95, "pool_url": "pool.minexmr.com", "container_name": "docker-dev-01", "family": "MoneroMiner"},
        "tags": ["挖矿木马", "恶意软件", "资源滥用"]
    },
]


def seed_alerts():
    print("=" * 60)
    print("TimescaleDB 告警测试数据种子脚本")
    print("=" * 60)

    tsdb = get_tsdb()
    session = tsdb.get_session()

    try:
        create_alerts_hypertable(session)
        print("[OK] Alerts hypertable 已就绪")

        now = datetime.utcnow()
        inserted = 0

        for i, tmpl in enumerate(alert_templates):
            hours_ago = (len(alert_templates) - i) * 2
            first_seen = now - timedelta(hours=hours_ago)
            last_seen = first_seen + timedelta(minutes=15)

            data = dict(tmpl)
            data["alert_code"] = "ALERT-2026-{:04d}".format(inserted + 1)
            data["first_seen"] = first_seen
            data["last_seen"] = last_seen

            try:
                alert_id = insert_alert(session, data)
                inserted += 1
                print("[OK] #{:04d} [{}] {} ({})".format(
                    inserted, data["severity"].upper(), data["title"], data["alert_code"]))
            except Exception as e:
                print("[FAIL] {}: {}".format(data.get("title", "unknown"), e))
                session.rollback()

        print("\n" + "=" * 60)
        print("插入完成: {}/{} 条".format(inserted, len(alert_templates)))
        print("=" * 60)

    except Exception as e:
        print("[FAIL] 种子数据执行失败: {}".format(e))
        import traceback
        traceback.print_exc()
    finally:
        tsdb.close_session(session)


if __name__ == "__main__":
    with app.app_context():
        seed_alerts()
