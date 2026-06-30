# 安全产品日志接入脚本

## 概述

本目录包含用于向USOP平台发送各种安全产品日志的测试脚本。

## 脚本列表

| 脚本 | 用途 | 产品示例 |
|------|------|----------|
| `send_waf_logs.py` | WAF日志 | ModSecurity, AWS WAF, IIS-WAF |
| `send_ids_logs.py` | IDS/IPS日志 | Suricata, Snort |
| `send_edr_logs.py` | EDR日志 | CrowdStrike, Carbon Black |
| `send_fw_logs.py` | 防火墙日志 | Palo Alto, Fortinet, Cisco ASA |
| `send_cloud_logs.py` | 云平台日志 | AWS CloudTrail, Azure, GCP |
| `batch_insert_logs.py` | 批量插入测试数据 | 直接写入数据库 |

## 使用方法

### 1. 发送指定数量的日志

```bash
# 发送10条WAF日志
python3 send_waf_logs.py 10

# 发送20条IDS日志，间隔0.5秒
python3 send_ids_logs.py 20 0.5

# 发送5条EDR日志
python3 send_edr_logs.py 5
```

### 2. 发送所有类型日志

```bash
# 每种类型发送5条
python3 send_all_logs.py 5

# 或使用批量插入脚本(直接写入数据库)
python3 batch_insert_logs.py 50 100
```

## 数据源配置

### 预配置数据源

| ID | 名称 | 类型 | 状态 |
|----|------|------|------|
| 1 | WAF日志源 | syslog | active |
| 2 | IDS/IPS日志源 | syslog | active |
| 3 | EDR日志源 | http | active |
| 4 | 防火墙日志源 | syslog | active |
| 5 | 云平台日志源 | api | active |

### 通过数据库添加数据源

```sql
INSERT INTO data_sources (name, type, host, port, protocol, status, config, created_at)
VALUES ('WAF产品A', 'syslog', '192.168.1.100', 514, 'udp', 'active', '{"format":"json"}', NOW());
```

## 日志格式说明

### WAF日志格式
```json
{
  "timestamp": "2026-06-18T10:00:00",
  "src_ip": "192.168.1.100",
  "action": "block",
  "rule_id": "RW-1234",
  "severity": "critical",
  "category": "waf_attack"
}
```

### IDS日志格式
```json
{
  "timestamp": "2026-06-18T10:00:00Z",
  "event_type": "alert",
  "src_ip": "192.168.1.100",
  "alert": {
    "signature": "ET SCAN Potential SSH Scan",
    "signature_id": 2000001,
    "severity": 2
  }
}
```

### EDR日志格式
```json
{
  "timestamp": "2026-06-18T10:00:00Z",
  "event_type": "process_execution",
  "computer_name": "WORKSTATION-01",
  "process_name": "powershell.exe",
  "severity": "high"
}
```

## 验证日志接入

```bash
# 检查告警数量
curl -s -H "Authorization: Bearer <token>" \
  http://localhost:5001/api/alerts-api/alerts | jq '.data.total'

# 检查事件数量
curl -s -H "Authorization: Bearer <token>" \
  http://localhost:5001/api/event-actions-api/events | jq '.data.total'
```

## 自动发送配置

可以通过crontab设置定时发送:

```bash
# 每5分钟发送10条WAF日志
*/5 * * * * /usr/bin/python3 /Users/codes/usop/scripts/log-generator/send_waf_logs.py 10

# 每小时发送50条IDS日志
0 * * * * /usr/bin/python3 /Users/codes/usop/scripts/log-generator/send_ids_logs.py 50
```
