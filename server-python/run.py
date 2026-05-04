from app import create_app

app = create_app()

if __name__ == '__main__':
    print("""
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🛡️  USOP 安全运营平台 - 后端服务 (Python Flask)           ║
║                                                           ║
║   服务地址: http://localhost:5001                          ║
║   API基础路径: /api                                        ║
║                                                           ║
║   可用接口:                                                ║
║   • GET  /api/health              - 健康检查              ║
║   • POST /api/auth/login           - 用户登录              ║
║   • GET  /api/dashboard/*         - 仪表盘数据              ║
║   • GET  /api/events/*             - 事件管理              ║
║   • GET  /api/alerts/*             - 告警管理              ║
║   • GET  /api/assets/*             - 资产管理              ║
║   • GET  /api/scans/*              - 扫描任务              ║
║   • GET  /api/rules/*              - 规则管理              ║
║   • GET  /api/playbooks/*          - 剧本编排              ║
║   • GET  /api/users/*              - 用户管理              ║
║   • GET  /api/audit-logs/*         - 审计日志              ║
║   • GET  /api/config/*             - 系统配置              ║
║   • GET  /api/hunting/*            - 威胁狩猎              ║
║   • GET  /api/ai/*                 - AI中心                ║
║   • GET  /api/notifications/*      - 通知管理              ║
║                                                           ║
║   默认管理员账号: admin / admin123                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    """)
    app.run(host='0.0.0.0', port=5001, debug=True)
