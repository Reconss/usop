#!/usr/bin/env python3
"""
EDR日志发送脚本 (CrowdStrike格式)
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

EDR_EVENTS = [
    {"event_type": "process_execution", "severity": "low", "desc": "Process execution detected"},
    {"event_type": "file_create", "severity": "medium", "desc": "Suspicious file created"},
    {"event_type": "registry_modify", "severity": "medium", "desc": "Registry key modified"},
    {"event_type": "network_connection", "severity": "low", "desc": "Network connection established"},
    {"event_type": "powershell_execution", "severity": "high", "desc": "PowerShell malicious script"},
    {"event_type": "credential_dump", "severity": "critical", "desc": "Credential dumping attempt"},
    {"event_type": "lateral_movement", "severity": "critical", "desc": "Lateral movement detected"},
    {"event_type": "malware_detected", "severity": "critical", "desc": "Malware signature match"},
]

PROCESS_NAMES = ["svchost.exe", "powershell.exe", "cmd.exe", "msiexec.exe", "regsvr32.exe", "rundll32.exe", "winlogon.exe"]

def generate_ip():
    return f"{random.randint(1,223)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}"

def generate_edr_log():
    event = random.choice(EDR_EVENTS)
    return {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "event_type": event["event_type"],
        "severity": event["severity"],
        "computer_name": f"WORKSTATION-{random.randint(1,50):02d}",
        "user_name": f"user{random.randint(1,100)}@domain.local",
        "process_name": random.choice(PROCESS_NAMES),
        "process_id": random.randint(1000, 65535),
        "parent_process": random.choice(PROCESS_NAMES),
        "cmdline": "powershell -enc <suspicious>",
        "src_ip": generate_ip(),
        "dst_ip": generate_ip(),
        "action": random.choice(["detect", "block", "allow", "quarantine"]),
        "category": "edr_event",
        "description": event["desc"]
    }

def send_log(log_data, source_id=3):
    try:
        headers = {"Authorization": f"Bearer {get_token()}", "Content-Type": "application/json"}
        payload = {"source_id": source_id, "log_type": "json", "raw_log": json.dumps(log_data)}
        return requests.post(API_URL, json=payload, headers=headers, timeout=5).status_code == 200
    except:
        return False

def main(count=10, interval=1):
    print(f"发送 {count} 条EDR日志...")
    for i in range(count):
        log = generate_edr_log()
        if send_log(log, source_id=3):
            print(f"  [{i+1}] {log['event_type']} [{log['severity']}] - {log['process_name']}")
        time.sleep(interval)
    print("完成!")

if __name__ == "__main__":
    import sys
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 10)
