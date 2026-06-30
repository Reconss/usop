#!/usr/bin/env python3
"""
防火墙日志发送脚本 (Palo Alto, Fortinet, Cisco ASA格式)
"""
import requests
import json
import random
import time
from datetime import datetime

API_URL = "http://localhost:5001/api/ingestion/logs"
TOKEN = None

def get_token():
    global TOKEN
    if TOKEN: return TOKEN
    resp = requests.post("http://localhost:5001/api/auth/login",
        json={"username": "admin", "password": "admin123"})
    TOKEN = resp.json().get('data', {}).get('token')
    return TOKEN

FW_ACTIONS = ["accept", "drop", "deny", "reset-both", "close"]
SEVERITY_MAP = {"low": 1, "medium": 2, "high": 3, "critical": 4}

def generate_ip():
    return f"{random.randint(1,223)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}"

def generate_fw_log():
    action = random.choice(FW_ACTIONS)
    return {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "device_name": random.choice(["PA-3220", "FG-100F", "ASA-5585"]),
        "src_ip": generate_ip(),
        "src_port": random.randint(1024, 65535),
        "dst_ip": generate_ip(),
        "dst_port": random.choice([22, 80, 443, 3389, 3306, 5432, 8080]),
        "protocol": random.choice(["TCP", "UDP", "ICMP"]),
        "action": action,
        "rule_name": f"Security-Policy-{random.randint(1,20)}",
        "bytes_sent": random.randint(1000, 1000000),
        "bytes_received": random.randint(500, 500000),
        "packets": random.randint(1, 100),
        "session_time": random.randint(1, 3600),
        "category": "firewall",
        "severity": "high" if action in ["drop", "deny", "reset-both"] else "low"
    }

def send_log(log_data, source_id=4):
    try:
        headers = {"Authorization": f"Bearer {get_token()}", "Content-Type": "application/json"}
        payload = {"source_id": source_id, "log_type": "json", "raw_log": json.dumps(log_data)}
        return requests.post(API_URL, json=payload, headers=headers, timeout=5).status_code == 200
    except:
        return False

def main(count=10, interval=1):
    print(f"发送 {count} 条防火墙日志...")
    for i in range(count):
        log = generate_fw_log()
        if send_log(log, source_id=4):
            print(f"  [{i+1}] {log['action']}: {log['src_ip']} -> {log['dst_ip']}:{log['dst_port']}")
        time.sleep(interval)
    print("完成!")

if __name__ == "__main__":
    import sys
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 10)
