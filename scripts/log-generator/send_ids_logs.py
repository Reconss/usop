#!/usr/bin/env python3
"""
IDS/IPS日志发送脚本 (Suricata格式)
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

# Suricata/Eve JSON格式
IDS_SIGNATURES = [
    {"sid": 2000001, "msg": "ET SCAN Potential SSH Scan", "category": "Attempted Information Leak", "severity": 2},
    {"sid": 2000002, "msg": "ET WEB_SERVER SQL Injection Attempt", "category": "Web Application Attack", "severity": 3},
    {"sid": 2000003, "msg": "ET POLICY Suspicious User-Agent", "category": "Attempted Administrator Privilege Gain", "severity": 2},
    {"sid": 2000004, "msg": "ET DOS Potential DDoS Attack", "category": "Denial of Service", "severity": 3},
    {"sid": 2000005, "msg": "ET EXPLOIT Buffer Overflow Attempt", "category": "Attempted Privilege Escalation", "severity": 3},
    {"sid": 2000006, "msg": "ET MALWARE Ransomware Traffic Detected", "category": "A Network Trojan was detected", "severity": 3},
    {"sid": 2000007, "msg": "ET POLICY Crypto Mining Traffic", "category": "Attempted Information Leak", "severity": 2},
    {"sid": 2000008, "msg": "ET SCAN Port Scan Detection", "category": "Attempted Information Leak", "severity": 1},
]

def generate_ip():
    return f"{random.randint(1,223)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}"

def generate_ids_log():
    sig = random.choice(IDS_SIGNATURES)
    src_ip = generate_ip()
    dst_ip = generate_ip()
    
    return {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "event_type": "alert",
        "src_ip": src_ip,
        "src_port": random.randint(1024, 65535),
        "dst_ip": dst_ip,
        "dst_port": random.choice([22, 80, 443, 3306, 5432, 8080]),
        "proto": random.choice(["TCP", "UDP", "ICMP"]),
        "alert": {
            "signature": sig["msg"],
            "signature_id": sig["sid"],
            "category": sig["category"],
            "severity": sig["severity"]
        },
        "action": "blocked" if random.random() > 0.3 else "allowed",
        "category": "ids_attack"
    }

def send_log(log_data, source_id=2):
    try:
        headers = {"Authorization": f"Bearer {get_token()}", "Content-Type": "application/json"}
        payload = {"source_id": source_id, "log_type": "json", "raw_log": json.dumps(log_data)}
        return requests.post(API_URL, json=payload, headers=headers, timeout=5).status_code == 200
    except:
        return False

def main(count=10, interval=1):
    print(f"发送 {count} 条IDS日志...")
    for i in range(count):
        log = generate_ids_log()
        if send_log(log, source_id=2):
            print(f"  [{i+1}] {log['alert']['msg'][:40]} [{log['alert']['severity']}]")
        time.sleep(interval)
    print("完成!")

if __name__ == "__main__":
    import sys
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 10)
