#!/usr/bin/env python3
"""
WAF日志发送脚本
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
    data = resp.json()
    TOKEN = data.get('data', {}).get('token')
    return TOKEN

def generate_ip():
    return f"{random.randint(1,223)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}"

def generate_waf_log():
    actions = ["block", "allow", "challenge", "log"]
    severities = ["low", "medium", "high", "critical"]
    messages = [
        "SQL injection attempt detected",
        "XSS attack blocked",
        "Path traversal attempt",
        "Remote file inclusion attempt",
        "Command injection blocked"
    ]
    
    return {
        "timestamp": datetime.now().isoformat(),
        "src_ip": generate_ip(),
        "dst_ip": f"10.0.0.{random.randint(1,254)}",
        "action": random.choice(actions),
        "rule_id": f"RW-{random.randint(1000,9999)}",
        "message": random.choice(messages),
        "severity": random.choice(severities),
        "category": "waf_attack",
        "user_agent": "Mozilla/5.0",
        "url": random.choice(["/admin/login.php", "/api/users", "/wp-admin/"]),
        "method": random.choice(["GET", "POST", "PUT"])
    }

def send_log(log_data, source_id=1):
    try:
        headers = {"Authorization": f"Bearer {get_token()}", "Content-Type": "application/json"}
        payload = {"source_id": source_id, "log_type": "json", "raw_log": json.dumps(log_data)}
        return requests.post(API_URL, json=payload, headers=headers, timeout=5).status_code == 200
    except Exception as e:
        print(f"发送失败: {e}")
        return False

def main(count=10, interval=1):
    print(f"开始发送 {count} 条WAF日志...")
    success = 0
    for i in range(count):
        log = generate_waf_log()
        if send_log(log, source_id=1):
            success += 1
            print(f"  [{i+1}/{count}] 已发送: {log['action']} - {log['message'][:30]}")
        time.sleep(interval)
    print(f"完成! 成功 {success}/{count} 条")

if __name__ == "__main__":
    import sys
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    interval = float(sys.argv[2]) if len(sys.argv) > 2 else 1
    main(count, interval)
