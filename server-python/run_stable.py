#!/usr/bin/env python3
"""
USOP 安全运营平台 - 稳定版后端服务启动脚本
"""
import sys
import os
import time
import signal

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 设置信号处理，防止异常退出
def signal_handler(signum, frame):
    print('\n收到停止信号，服务即将退出...')
    sys.exit(0)

signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

def main():
    # 检查环境变量
    if os.getenv('SKIP_BIGDATA_CHECK', '').lower() not in ('1', 'true', 'yes'):
        try:
            from app.utils.service_manager import wait_for_all_components
            print("检查大数据组件...")
            wait_for_all_components()
        except Exception as e:
            print(f"⚠️  大数据组件检查失败: {e}")
    
    # 创建 Flask 应用
    from app import create_app
    app = create_app()
    
    print(f"""
╔═══════════════════════════════════════════════════════════╗
║   🛡️  USOP 安全运营平台 - 后端服务 (Python Flask)           ║
║   服务地址: http://localhost:5001                          ║
╚═══════════════════════════════════════════════════════════╝
    """)
    
    # 使用更稳定的配置启动
    app.run(
        host='0.0.0.0',
        port=int(os.getenv('FLASK_PORT', '5001')),
        debug=False,  # 关闭 debug 模式
        use_reloader=False,  # 关闭自动重载
        threaded=True,  # 多线程
        processes=1  # 单进程
    )

if __name__ == '__main__':
    main()
