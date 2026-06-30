#!/usr/bin/env python3
"""
统一日志发送脚本 - 一次性发送所有安全产品日志
"""
import subprocess
import time
import sys

SCRIPTS = [
    ("WAF日志", "send_waf_logs.py"),
    ("IDS/IPS日志", "send_ids_logs.py"),
    ("EDR日志", "send_edr_logs.py"),
    ("防火墙日志", "send_fw_logs.py"),
    ("云平台日志", "send_cloud_logs.py"),
]

def main(count_per_type=5):
    script_dir = "/Users/codes/usop/scripts/log-generator"
    
    print("="*50)
    print("开始发送所有安全产品日志")
    print("="*50)
    
    for name, script in SCRIPTS:
        print(f"\n>>> 发送{name}...")
        try:
            result = subprocess.run(
                ["python3", f"{script_dir}/{script}", str(count_per_type), "0.1"],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                print(f"  ✓ {name}发送完成")
            else:
                print(f"  ✗ {name}发送失败: {result.stderr[:100]}")
        except Exception as e:
            print(f"  ✗ 错误: {str(e)[:50]}")
    
    print("\n" + "="*50)
    print("所有日志发送完成!")
    print("="*50)

if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    main(count)
