"""
TimescaleDB 告警测试数据种子脚本 - 独立版（直接连接 TimescaleDB）
"""
import psycopg2
from psycopg2.extras import Json, RealDictCursor
from datetime import datetime, timedelta
import json

TSDB_CONFIG = {
    "host": "localhost",
    "port": 5433,
    "user": "postgres",
    "password": "postgres",
    "dbname": "postgres",
}

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
        "raw_log": """{"event_type":"scan","src_ip":"203.0.113.45","dst_ip":"10.0.1.100","scanned_ports":[22,80,443,3306,6379,8080,8443],"scan_duration":"30s","protocol":"TCP"}""",
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
        "raw_log": """{"event_type":"ssh_bruteforce","src_ip":"198.51.100.23","username":"root","attempts":156,"duration":"5m","last_failed_at":"2026-05-05T12:30:00Z"}""",
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
        "raw_log": """{"event_type":"webshell","src_ip":"45.33.32.156","uri":"/uploads/shell.php","file":"shell.php","md5":"a1b2c3d4e5f6","size":2048,"action":"upload"}""",
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
        "raw_log": """{"event_type":"ddos","target_ip":"10.0.2.200","target_port":443,"packet_rate":50000,"bps":2500000000,"duration":"10m","source_ips_count":1523}""",
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
        "raw_log": """{"event_type":"sql_injection","src_ip":"185.220.101.42","uri":"/api/users","payload":"1 OR 1=1--","method":"GET","matched_rule":"SQLI_BLIND","blocked":true}""",
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
        "raw_log": """{"event_type":"ransomware","process_name":"encryptor.exe","extension":".encrypted","affected_files":1500,"user":"finance_admin"}""",
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
        "raw_log": """{"event_type":"unauthorized_access","user":"john.doe","target":"/admin/config","method":"POST","status":403,"reason":"insufficient_privileges"}""",
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
        "raw_log": """{"event_type":"data_exfiltration","source_ip":"10.0.1.150","dest_ip":"203.0.113.88","bytes_sent":524288000,"files_sent":15,"time_span":"30m"}""",
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
        "raw_log": """{"event_type":"dns_tunnel","src_ip":"10.0.4.200","query":"abcdef123456.long-subdomain.malicious.com","query_type":"TXT","query_count":500,"duration":"1h"}""",
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
        "raw_log": """{"event_type":"lateral_movement","src_ip":"10.0.3.50","dst_ip":"10.0.5.100","protocol":"SMB","service":"ADMIN$","auth_type":"NTLM","user":"SYSTEM"}""",
        "parsed_data": {"protocol": "SMB", "service": "ADMIN$", "auth_type": "NTLM", "user": "SYSTEM"},
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
        "raw_log": """{"event_type":"unusual_login","user":"zhang.san","src_ip":"91.234.56.78","geo":"RU","usual_geo":"CN","login_time":"2026-05-05T03:00:00Z","auth_method":"MFA"}""",
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
        "raw_log": """{"event_type":"cryptominer","process_name":"xmrig","cpu_usage":95,"memory_mb":512,"pool":"pool.minexmr.com:8333","user":"devops","container":"docker-dev-01"}""",
        "parsed_data": {"process_name": "xmrig", "cpu_usage_pct": 95, "pool_url": "pool.minexmr.com", "container_name": "docker-dev-01", "family": "MoneroMiner"},
        "tags": ["挖矿木马", "恶意软件", "资源滥用"]
    },

    # ============ 聚合测试数据：同源IP短时间窗口告警 ============

    # 组1: 203.0.113.100 - 主动侦察攻击 (10分钟内5条)
    {
        "title": "端口扫描检测",
        "description": "外部IP 203.0.113.100 对Web服务器进行端口扫描",
        "severity": "medium", "source": "NIDS",
        "source_product": "Suricata", "source_type": "IDS",
        "category": "侦察扫描", "confidence": 85.0,
        "src_ip": "203.0.113.100", "src_port": 40001,
        "dst_ip": "10.0.1.100", "dst_port": None,
        "protocol": "TCP",
        "asset_name": "Web-服务器", "hostname": "web-01.internal",
        "raw_log": """{"event_type":"port_scan","src_ip":"203.0.113.100","dst_ip":"10.0.1.100","scanned_ports":[22,80,443,3306,8080,8443],"duration":"60s"}""",
        "parsed_data": {"scan_type": "端口扫描", "port_count": 500, "protocols": ["TCP"]},
        "tags": ["端口扫描", "侦察"]
    },
    {
        "title": "目录爆破攻击",
        "description": "检测到对Web应用进行暴力目录枚举",
        "severity": "high", "source": "WAF",
        "source_product": "ModSecurity", "source_type": "WAF",
        "category": "Web攻击", "confidence": 88.0,
        "src_ip": "203.0.113.100", "src_port": 40002,
        "dst_ip": "10.0.1.100", "dst_port": 80,
        "protocol": "HTTP",
        "asset_name": "Web-服务器", "hostname": "web-01.internal",
        "raw_log": """{"event_type":"dir_bruteforce","src_ip":"203.0.113.100","uri":"/admin","method":"GET","status":404,"paths":["/admin","/wp-admin","/config","/backup","/.env"],"count":200}""",
        "parsed_data": {"attack_type": "目录爆破", "path_count": 200, "suspicious_paths": ["/admin", "/.env"]},
        "tags": ["Web攻击", "目录爆破", "高频率"]
    },
    {
        "title": "SQL注入尝试",
        "description": "WAF拦截SQL注入攻击请求，来自203.0.113.100",
        "severity": "critical", "source": "WAF",
        "source_product": "CloudFlare WAF", "source_type": "WAF",
        "category": "Web攻击", "confidence": 95.0,
        "src_ip": "203.0.113.100", "src_port": 40003,
        "dst_ip": "10.0.1.100", "dst_port": 443,
        "protocol": "HTTPS",
        "asset_name": "Web-服务器", "hostname": "web-01.internal",
        "raw_log": """{"event_type":"sql_injection","src_ip":"203.0.113.100","uri":"/api/login","payload":"' OR 1=1--","method":"POST","matched_rule":"SQLI_AUTH_BYPASS","blocked":true}""",
        "parsed_data": {"attack_type": "SQL注入", "payload": "' OR 1=1--", "risk": "身份认证绕过"},
        "tags": ["SQL注入", "严重", "Web攻击"]
    },
    {
        "title": "文件上传检测",
        "description": "检测到通过API上传可疑PHP文件",
        "severity": "critical", "source": "WAF",
        "source_product": "ModSecurity", "source_type": "WAF",
        "category": "Web攻击", "confidence": 92.0,
        "src_ip": "203.0.113.100", "src_port": 40004,
        "dst_ip": "10.0.1.100", "dst_port": 443,
        "protocol": "HTTPS",
        "asset_name": "Web-服务器", "hostname": "web-01.internal",
        "raw_log": """{"event_type":"file_upload","src_ip":"203.0.113.100","uri":"/api/upload","file":"shell.php","extension":"php","size":2048,"action":"blocked"}""",
        "parsed_data": {"file_name": "shell.php", "size": 2048, "action": "blocked", "risk": "WebShell上传"},
        "tags": ["文件上传", "WebShell", "紧急"]
    },
    {
        "title": "命令注入攻击",
        "description": "检测到命令注入尝试，通过URL参数执行系统命令",
        "severity": "critical", "source": "WAF",
        "source_product": "CloudFlare WAF", "source_type": "WAF",
        "category": "Web攻击", "confidence": 94.0,
        "src_ip": "203.0.113.100", "src_port": 40005,
        "dst_ip": "10.0.1.100", "dst_port": 443,
        "protocol": "HTTPS",
        "asset_name": "Web-服务器", "hostname": "web-01.internal",
        "raw_log": """{"event_type":"cmd_injection","src_ip":"203.0.113.100","uri":"/api/ping?ip=127.0.0.1;cat /etc/passwd","payload":"cat /etc/passwd","blocked":true}""",
        "parsed_data": {"attack_type": "命令注入", "payload": "cat /etc/passwd", "blocked": True},
        "tags": ["命令注入", "严重", "RCE"]
    },

    # 组2: 198.51.100.200 - 多协议暴力破解 (5分钟内3条)
    {
        "title": "SSH暴力破解",
        "description": "SSH服务检测到暴力登录尝试，来自198.51.100.200",
        "severity": "high", "source": "HIDS",
        "source_product": "Wazuh", "source_type": "HIDS",
        "category": "暴力破解", "confidence": 90.0,
        "src_ip": "198.51.100.200", "src_port": 50001,
        "dst_ip": "10.0.1.50", "dst_port": 22,
        "protocol": "SSH",
        "asset_name": "堡垒机", "hostname": "bastion-01.internal",
        "raw_log": """{"event_type":"ssh_bruteforce","src_ip":"198.51.100.200","username":"admin","attempts":50,"duration":"3m"}""",
        "parsed_data": {"username": "admin", "attempts": 50, "duration_min": 3},
        "tags": ["暴力破解", "SSH"]
    },
    {
        "title": "RDP暴力破解",
        "description": "RDP服务检测到大量登录失败，来自198.51.100.200",
        "severity": "high", "source": "HIDS",
        "source_product": "Wazuh", "source_type": "HIDS",
        "category": "暴力破解", "confidence": 88.0,
        "src_ip": "198.51.100.200", "src_port": 50002,
        "dst_ip": "10.0.1.60", "dst_port": 3389,
        "protocol": "RDP",
        "asset_name": "终端服务器", "hostname": "terminal-01.internal",
        "raw_log": """{"event_type":"rdp_bruteforce","src_ip":"198.51.100.200","username":"administrator","attempts":30,"duration":"2m"}""",
        "parsed_data": {"username": "administrator", "attempts": 30, "duration_min": 2},
        "tags": ["暴力破解", "RDP"]
    },
    {
        "title": "FTP暴力破解",
        "description": "FTP服务检测到异常登录尝试，来自198.51.100.200",
        "severity": "medium", "source": "HIDS",
        "source_product": "Wazuh", "source_type": "HIDS",
        "category": "暴力破解", "confidence": 80.0,
        "src_ip": "198.51.100.200", "src_port": 50003,
        "dst_ip": "10.0.1.70", "dst_port": 21,
        "protocol": "FTP",
        "asset_name": "文件服务器", "hostname": "file-01.internal",
        "raw_log": """{"event_type":"ftp_bruteforce","src_ip":"198.51.100.200","username":"anonymous","attempts":20,"duration":"2m"}""",
        "parsed_data": {"username": "anonymous", "attempts": 20, "duration_min": 2},
        "tags": ["暴力破解", "FTP"]
    },

    # 组3: 45.33.32.200 - 数据外泄事件 (15分钟内4条)
    {
        "title": "DNS异常查询",
        "description": "检测到向未知域名发起大量DNS查询",
        "severity": "medium", "source": "NIDS",
        "source_product": "Zeek", "source_type": "NIDS",
        "category": "C2通信", "confidence": 72.0,
        "src_ip": "45.33.32.200", "src_port": 60001,
        "dst_ip": "8.8.8.8", "dst_port": 53,
        "protocol": "DNS",
        "asset_name": "边界路由", "hostname": "router-01.internal",
        "raw_log": """{"event_type":"dns_anomaly","src_ip":"45.33.32.200","query":"data-exfil.malicious.com","query_type":"TXT","count":300}""",
        "parsed_data": {"domain": "data-exfil.malicious.com", "query_count": 300, "risk": "DNS隧道"},
        "tags": ["DNS异常", "C2"]
    },
    {
        "title": "大流量外传告警",
        "description": "检测到从内网向外部IP传输大量数据",
        "severity": "critical", "source": "NIDS",
        "source_product": "Zeek", "source_type": "NIDS",
        "category": "数据安全", "confidence": 91.0,
        "src_ip": "45.33.32.200", "src_port": 60002,
        "dst_ip": "203.0.113.200", "dst_port": 443,
        "protocol": "HTTPS",
        "asset_name": "出口网关", "hostname": "gateway-01.internal",
        "raw_log": """{"event_type":"data_exfil","src_ip":"45.33.32.200","dst_ip":"203.0.113.200","bytes_sent":104857600,"duration":"5m"}""",
        "parsed_data": {"bytes_sent": 104857600, "duration_min": 5, "risk": "数据泄露"},
        "tags": ["数据外泄", "大流量", "紧急"]
    },
    {
        "title": "异常VPN连接",
        "description": "非工作时间从异常地理位置建立VPN连接",
        "severity": "high", "source": "SIEM",
        "source_product": "Azure Sentinel", "source_type": "SIEM",
        "category": "身份异常", "confidence": 78.0,
        "src_ip": "45.33.32.200", "src_port": 60003,
        "dst_ip": "10.0.1.200", "dst_port": 443,
        "protocol": "HTTPS",
        "asset_name": "VPN网关", "hostname": "vpn-01.internal",
        "raw_log": """{"event_type":"unusual_vpn","user":"zhang.san","src_ip":"45.33.32.200","geo":"RU","usual_geo":"CN","time":"03:00","device":"unknown"}""",
        "parsed_data": {"user": "zhang.san", "geo": "RU", "usual_geo": "CN", "risk": "境外连接"},
        "tags": ["VPN异常", "身份安全"]
    },
    {
        "title": "SMB数据批量读取",
        "description": "检测到从文件服务器批量读取大量文件",
        "severity": "high", "source": "EDR",
        "source_product": "SentinelOne", "source_type": "EDR",
        "category": "数据安全", "confidence": 85.0,
        "src_ip": "45.33.32.200", "src_port": 60004,
        "dst_ip": "10.0.1.70", "dst_port": 445,
        "protocol": "SMB",
        "asset_name": "文件服务器", "hostname": "file-01.internal",
        "raw_log": """{"event_type":"bulk_file_read","src_ip":"45.33.32.200","files":500,"total_size":"2.5GB","types":["docx","xlsx","pdf"]}""",
        "parsed_data": {"files_count": 500, "total_size_gb": 2.5, "file_types": ["docx", "xlsx", "pdf"], "risk": "数据收集"},
        "tags": ["数据安全", "批量读取"]
    },
]


def init_hypertable(conn, cursor):
    """创建 alerts 表并转为 hypertable"""
    cursor.execute("""
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'alerts' AND table_schema = 'public'
    """)
    table_exists = cursor.fetchone() is not None

    if not table_exists:
        cursor.execute("""
            CREATE TABLE alerts (
                id SERIAL PRIMARY KEY,
                alert_code VARCHAR(20) UNIQUE NOT NULL,
                title VARCHAR(200) NOT NULL,
                description TEXT,
                severity VARCHAR(20) DEFAULT 'medium',
                status VARCHAR(20) DEFAULT 'new',
                source VARCHAR(100),
                source_product VARCHAR(50),
                source_type VARCHAR(50),
                category VARCHAR(100),
                confidence DECIMAL(5,2) DEFAULT 100.0,
                src_ip VARCHAR(50), src_port INTEGER,
                dst_ip VARCHAR(50), dst_port INTEGER,
                protocol VARCHAR(20),
                asset_id INTEGER, asset_name VARCHAR(100), hostname VARCHAR(100),
                affected_assets JSONB DEFAULT '[]'::jsonb,
                event_ids JSONB DEFAULT '[]'::jsonb,
                assigned_to INTEGER,
                raw_log TEXT,
                parsed_data JSONB DEFAULT '{}'::jsonb,
                extra_data JSONB DEFAULT '{}'::jsonb,
                first_seen TIMESTAMPTZ NOT NULL,
                last_seen TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                tags JSONB DEFAULT '[]'::jsonb
            )
        """)
        conn.commit()
        try:
            cursor.execute("""
                SELECT create_hypertable('alerts', 'first_seen',
                    if_not_exists => TRUE, migrate_data => TRUE)
            """)
            conn.commit()
        except Exception:
            conn.rollback()
        print("[OK] Alerts hypertable 已创建")
    else:
        print("[OK] Alerts 表已存在")

    # 创建索引（单独提交）
    for idx_sql in [
        "CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity)",
        "CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status)",
        "CREATE INDEX IF NOT EXISTS idx_alerts_source ON alerts(source)",
        "CREATE INDEX IF NOT EXISTS idx_alerts_src_ip ON alerts(src_ip)",
        "CREATE INDEX IF NOT EXISTS idx_alerts_dst_ip ON alerts(dst_ip)",
    ]:
        try:
            cursor.execute(idx_sql)
            conn.commit()
        except Exception:
            conn.rollback()


def insert_alert(cursor, data):
    """插入单条告警"""
    columns = [
        "alert_code", "title", "description", "severity",
        "source", "source_product", "source_type", "category", "confidence",
        "src_ip", "src_port", "dst_ip", "dst_port", "protocol",
        "asset_name", "hostname",
        "affected_assets", "event_ids", "raw_log", "parsed_data", "extra_data",
        "first_seen", "last_seen", "tags"
    ]
    placeholders = ", ".join(f"%({c})s" for c in columns)
    cols = ", ".join(columns)
    sql = f"INSERT INTO alerts ({cols}) VALUES ({placeholders}) RETURNING id"

    params = {}
    for c in columns:
        val = data.get(c)
        if c in ("affected_assets", "event_ids", "parsed_data", "extra_data", "tags"):
            params[c] = Json(val) if val is not None else Json([] if c in ("affected_assets", "event_ids", "tags") else {})
        else:
            params[c] = val

    cursor.execute(sql, params)
    return cursor.fetchone()[0]


def seed():
    print("=" * 60)
    print("TimescaleDB 告警测试数据种子脚本")
    print("=" * 60)

    conn = psycopg2.connect(**TSDB_CONFIG)
    conn.autocommit = False
    cursor = conn.cursor()

    try:
        init_hypertable(conn, cursor)
        conn.commit()
        print("[OK] Alerts hypertable 已就绪")

        now = datetime.utcnow()
        inserted = 0

        for i, tmpl in enumerate(alert_templates):
            hours_ago = (len(alert_templates) - i) * 2
            first_seen = now - timedelta(hours=hours_ago)
            last_seen = first_seen + timedelta(minutes=15)

            data = dict(tmpl)
            data["alert_code"] = f"ALERT-2026-{inserted + 1:04d}"
            data["first_seen"] = first_seen
            data["last_seen"] = last_seen

            try:
                alert_id = insert_alert(cursor, data)
                conn.commit()
                inserted += 1
                print(f"[OK] #{inserted:04d} [{data['severity'].upper():8s}] {data['title']} ({data['alert_code']})")
            except Exception as e:
                conn.rollback()
                print(f"[FAIL] {data.get('title', 'unknown')}: {e}")

        print("\n" + "=" * 60)
        print(f"插入完成: {inserted}/{len(alert_templates)} 条")
        print("=" * 60)

    except Exception as e:
        conn.rollback()
        print(f"[FAIL] 执行失败: {e}")
        import traceback
        traceback.print_exc()
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    seed()
