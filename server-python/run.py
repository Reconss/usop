#!/usr/bin/env python3
"""
USOP 安全运营平台 - 后端服务启动脚本

功能:
- 启动前检查大数据组件状态
- 自动等待组件就绪
- 初始化 Kafka Topics 和 TimescaleDB
"""

import os
import sys

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def check_bigdata_services():
    """检查并等待大数据组件就绪"""
    try:
        from app.utils.service_manager import (
            wait_for_all_components,
            init_kafka_topics,
            init_timescale_db,
            check_all_components
        )
        
        print("""
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🛡️  USOP 安全运营平台 - 大数据组件检查                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
        """)
        
        # 检查组件状态
        success, not_ready = wait_for_all_components()
        
        if not success:
            print("⚠️  部分必需组件未就绪，后端服务将尝试启动...")
            print(f"   未就绪组件: {', '.join(not_ready)}")
            print("   某些功能可能不可用")
            print("")
        else:
            print("✅ 所有大数据组件已就绪")
            print("")
            
            # 初始化
            print("初始化数据存储...")
            init_kafka_topics()
            init_timescale_db()
        
        return success
        
    except Exception as e:
        print(f"⚠️  大数据组件检查失败: {e}")
        print("   后端服务将继续启动...")
        return False


def main():
    """主入口"""
    # 检查环境变量 - 如果设置 SKIP_BIGDATA_CHECK=1 则跳过检查
    if os.getenv('SKIP_BIGDATA_CHECK', '').lower() not in ('1', 'true', 'yes'):
        check_bigdata_services()
    
    # 创建 Flask 应用
    from app import create_app
    
    app = create_app()
    
    print("""
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🛡️  USOP 安全运营平台 - 后端服务 (Python Flask)           ║
║                                                           ║
║   服务地址: http://localhost:5001                          ║
║   API基础路径: /api                                        ║
║                                                           ║
║   可用接口:                                                ║
║   • GET  /api/health              - 健康检查                ║
║   • POST /api/auth/login          - 用户登录               ║
║   • GET  /api/dashboard/*        - 仪表盘数据              ║
║   • GET  /api/events/*           - 事件管理                ║
║   • GET  /api/alerts/*           - 告警管理                ║
║   • GET  /api/assets/*           - 资产管理                ║
║   • GET  /api/scans/*            - 扫描任务                ║
║   • GET  /api/rules/*            - 规则管理                ║
║   • GET  /api/playbooks/*        - 剧本编排                ║
║   • GET  /api/users/*            - 用户管理                ║
║   • GET  /api/audit-logs/*       - 审计日志                ║
║   • GET  /api/config/*           - 系统配置                ║
║   • GET  /api/hunting/*          - 威胁狩猎                ║
║   • GET  /api/ai/*               - AI中心                  ║
║   • GET  /api/notifications/*    - 通知管理                ║
║   • GET  /api/log-search/*       - 日志搜索 (TimescaleDB)  ║
║                                                           ║
║   默认管理员账号: admin / admin123                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    """)
    
    # 获取端口
    port = int(os.getenv('FLASK_PORT', '5001'))
    debug = os.getenv('FLASK_DEBUG', 'True').lower() in ('true', '1', 'yes')
    
    app.run(host='0.0.0.0', port=port, debug=debug)


if __name__ == '__main__':
    main()
