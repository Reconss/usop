#!/usr/bin/env python3
"""
批量插入测试日志数据
直接写入数据库模拟各种安全产品的日志
"""
import psycopg2
import random
import time
from datetime import datetime, timedelta

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "usop",
    "password": "usop_password",
    "database": "usop_security"
}

def generate_ip():
    return f"{random.randint(1,223)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}"

def insert_alerts(count):
    """批量插入告警"""
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    severities = ['critical', 'high', 'medium', 'low']
    categories = ['waf_attack', 'ids_attack', 'edr_event', 'firewall', 'cloud_trail']
    sources = ['WAF', 'Suricata', 'CrowdStrike', 'PaloAlto', 'AWS']
    
    success = 0
    for i in range(count):
        severity = random.choice(severities)
        category = random.choice(categories)
        src_ip = generate_ip()
        dst_ip = generate_ip()
        
        try:
            cursor.execute("""
                INSERT INTO alerts (alert_code, title, description, severity, status, 
                    source, category, src_ip, dst_ip, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                f"ALT-{datetime.now().strftime('%Y%m%d')}-{i+1:04d}",
                f"测试{category}告警",
                f"检测到来自{src_ip}的{severity}级{category}事件",
                severity, 'new', random.choice(sources), category,
                src_ip, dst_ip, datetime.now(), datetime.now()
            ))
            success += 1
        except Exception as e:
            pass
    
    conn.commit()
    cursor.close()
    conn.close()
    return success

def insert_events(count):
    """批量插入事件"""
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    severities = ['critical', 'high', 'medium', 'low']
    categories = ['authentication', 'network', 'file', 'process', 'registry']
    
    success = 0
    for i in range(count):
        severity = random.choice(severities)
        category = random.choice(categories)
        
        try:
            cursor.execute("""
                INSERT INTO events (event_code, title, description, severity, 
                    category, source, status, raw_log, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                f"EVT-{datetime.now().strftime('%Y%m%d')}-{i+1:05d}",
                f"测试事件-{category}",
                f"安全事件检测: {severity}级别{category}事件",
                severity, category, 'test', 'new',
                f'{{"src_ip": "{generate_ip()}"}}',
                datetime.now(), datetime.now()
            ))
            success += 1
        except:
            pass
    
    conn.commit()
    cursor.close()
    conn.close()
    return success

def main(alert_count=20, event_count=50):
    print(f"开始批量插入测试数据...")
    print(f"  告警: {alert_count} 条")
    print(f"  事件: {event_count} 条")
    
    a_count = insert_alerts(alert_count)
    print(f"\n✓ 成功插入 {a_count} 条告警")
    
    e_count = insert_events(event_count)
    print(f"✓ 成功插入 {e_count} 条事件")
    
    print("\n完成! 数据已写入数据库")

if __name__ == "__main__":
    import sys
    a = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    e = int(sys.argv[2]) if len(sys.argv) > 2 else 50
    main(a, e)
