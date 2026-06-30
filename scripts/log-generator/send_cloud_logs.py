#!/usr/bin/env python3
"""
云平台日志发送脚本 (AWS CloudTrail, Azure, GCP格式)
"""
import requests
import json
import random
import time
from datetime import datetime
import uuid

API_URL = "http://localhost:5001/api/ingestion/logs"
TOKEN = None

def get_token():
    global TOKEN
    if TOKEN: return TOKEN
    resp = requests.post("http://localhost:5001/api/auth/login",
        json={"username": "admin", "password": "admin123"})
    TOKEN = resp.json().get('data', {}).get('token')
    return TOKEN

CLOUD_EVENTS = [
    {"event": "CreateUser", "severity": "medium", "desc": "IAM user created"},
    {"event": "CreateAccessKey", "severity": "high", "desc": "New access key created"},
    {"event": "ConsoleLogin", "severity": "low", "desc": "Console login success"},
    {"event": "ConsoleLoginFailure", "severity": "high", "desc": "Console login failed"},
    {"event": "AttachUserPolicy", "severity": "critical", "desc": "IAM policy attached"},
    {"event": "CreateBucket", "severity": "medium", "desc": "S3 bucket created"},
    {"event": "PutBucketPolicy", "severity": "high", "desc": "Bucket policy modified"},
    {"event": "ModifyInstanceAttribute", "severity": "medium", "desc": "EC2 instance modified"},
    {"event": "RunInstances", "severity": "medium", "desc": "EC2 instance launched"},
    {"event": "DeleteSecurityGroup", "severity": "high", "desc": "Security group deleted"},
]

CLOUD_PROVIDERS = ["AWS", "AZURE", "GCP"]

def generate_cloud_log():
    event = random.choice(CLOUD_EVENTS)
    provider = random.choice(CLOUD_PROVIDERS)
    return {
        "eventVersion": "1.08",
        "eventTime": datetime.utcnow().isoformat() + "Z",
        "eventSource": f"{provider.lower()}.amazonaws.com",
        "eventName": event["event"],
        "awsRegion": f"us-east-{random.randint(1,4)}",
        "sourceIPAddress": f"{random.randint(1,223)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}",
        "userAgent": "console.amazonaws.com",
        "userIdentity": {
            "type": "IAMUser",
            "principalId": f"AIDAI{random.randint(1000000,9999999)}",
            "arn": f"arn:aws:iam::123456789012:user/admin",
            "accountId": "123456789012",
            "userName": f"user{random.randint(1,50)}"
        },
        "eventCategory": "management",
        "severity": event["severity"],
        "description": event["desc"],
        "category": "cloud_trail",
        "requestParameters": {"key": "value"},
        "responseElements": {"key": "value"}
    }

def send_log(log_data, source_id=5):
    try:
        headers = {"Authorization": f"Bearer {get_token()}", "Content-Type": "application/json"}
        payload = {"source_id": source_id, "log_type": "json", "raw_log": json.dumps(log_data)}
        return requests.post(API_URL, json=payload, headers=headers, timeout=5).status_code == 200
    except:
        return False

def main(count=10, interval=1):
    print(f"发送 {count} 条云平台日志...")
    for i in range(count):
        log = generate_cloud_log()
        if send_log(log, source_id=5):
            print(f"  [{i+1}] {log['eventName']} [{log['severity']}] - {log['eventSource']}")
        time.sleep(interval)
    print("完成!")

if __name__ == "__main__":
    import sys
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 10)
