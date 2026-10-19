"""主机漏洞 / 应用漏洞测试数据种子脚本（幂等）

用途：
1. 向资产清单与漏洞库注入一批贴近真实扫描结果的测试数据
   （主机漏洞 12 条 + 应用漏洞 12 条，覆盖 critical/high/medium/low 全 CVSS 档、
    公网/内网两类暴露面、有/无 CVE、在野/非在野利用组合）；
2. 写入后按当前「漏洞评级配置」自动重算 assessed_score / assessed_severity，
   并打印 原始severity → 重评severity 对照表，验证评级配置真实参与定级。

运行（容器内，依赖 /app 下的 app 包）：
    docker cp scripts/seed_vuln_testdata.py usop_all:/tmp/
    docker exec -w /app -e PYTHONPATH=/app usop_all python3 /tmp/seed_vuln_testdata.py

重复执行安全：按 (资产名, 漏洞定义, 类型, 端口/URL) 判重，不会产生重复数据。
"""
import hashlib
import sys
from datetime import datetime, timedelta

from app import create_app
from app.database import db
from app.models import Asset, Vulnerability, AssetVulnerability
from app.routes.vulnerabilities_api import _gen_vuln_code, _severity_from_score
from app.routes.vulnerability_assessment_api import _get_rating_config, _calculate_assessed_score

app = create_app()

# ---------------------------------------------------------------- 资产
ASSETS = [
    # (name, type, ip, os_info, description)
    ('web-prod-01',   'server',   '203.0.113.10',  'Ubuntu 22.04 LTS', '门户/OA 生产服务器（公网）'),
    ('web-prod-02',   'server',   '203.0.113.11',  'CentOS 7.9',       'API 网关/开放平台（公网）'),
    ('mail-gw-01',    'server',   '198.51.100.7',  'Debian 11',        '企业邮件网关（公网 MX）'),
    ('bastion-01',    'server',   '203.0.113.88',  'Ubuntu 20.04 LTS', '运维堡垒机（公网）'),
    ('db-mysql-01',   'database', '10.0.3.21',     'MySQL 8.0.32',     '生产主数据库（内网）'),
    ('dc-win-01',     'server',   '10.0.1.5',      'Windows Server 2019', '核心域控（内网）'),
    ('file-svr-01',   'server',   '10.0.5.30',     'Synology DSM 7.1',  '内部文件服务器（内网）'),
    ('k8s-node-01',   'container','10.0.6.12',     'K3s v1.26.4 node', '生产 K8s 工作节点（内网）'),
]

# ---------------------------------------------------------------- 主机漏洞
# (cve_id|None, name, cvss, severity, asset_name, port, vuln_class, solution)
HOST_VULNS = [
    ('CVE-2021-44228', 'Apache Log4j2 2.14.1 JNDI 远程代码执行', 10.0, 'critical',
     'web-prod-01', 8080, '组件漏洞',
     '升级 Log4j 至 2.17.1+，或删除 JndiLookup 类并配置 log4j2.formatMsgNoLookups=true'),
    ('CVE-2021-41773', 'Apache HTTP Server 2.4.49 路径穿越与 RCE', 9.8, 'critical',
     'web-prod-01', 80, '路径穿越',
     '升级 Apache httpd 至 2.4.51 及以上版本'),
    ('CVE-2017-0144', 'Microsoft SMBv1 服务端远程代码执行（永恒之蓝）', 9.3, 'critical',
     'file-svr-01', 445, '远程代码执行',
     '安装 MS17-010 补丁，禁用 SMBv1 协议'),
    ('CVE-2021-43798', 'Grafana 8.3.0 目录穿越导致任意文件读取', 7.5, 'high',
     'web-prod-02', 3000, '目录遍历',
     '升级 Grafana 至 8.3.4 以上版本'),
    ('CVE-2021-3156', 'sudo Baron Samedit 堆溢出本地提权', 7.8, 'high',
     'k8s-node-01', 22, '本地提权',
     '升级 sudo 至 1.9.5p2 及以上版本'),
    ('CVE-2018-15473', 'OpenSSH 7.4 用户枚举漏洞', 5.3, 'medium',
     'bastion-01', 22, '信息泄露',
     '升级 OpenSSH 至 7.7 及以上版本'),
    ('CVE-2016-2107', 'OpenSSL 1.0.2 Padding Oracle（Lucky13 变体）', 5.9, 'medium',
     'mail-gw-01', 443, '弱加密',
     '升级 OpenSSL 至 1.0.2j/1.1.0f 并禁用 CBC 套件'),
    (None, '存在低速 TLS 版本（TLS 1.0/1.1 仍启用）', 3.7, 'medium',
     'mail-gw-01', 443, '弱加密',
     '在 nginx 中仅启用 TLS 1.2/1.3 及更强加密套件'),
    (None, 'Redis 6379 端口未授权访问', 7.5, 'high',
     'k8s-node-01', 6379, '未授权访问',
     '配置 requirepass 与 ACL，绑定内网地址并关闭外网暴露'),
    (None, 'ZooKeeper 2181 端口未授权访问', 7.5, 'high',
     'db-mysql-01', 2181, '未授权访问',
     '启用 SASL 认证，绑定内网地址并添加防火墙策略'),
    (None, 'SSH 允许 root 用户直接登录', 0.0, 'low',
     'k8s-node-01', 22, '弱配置',
     '设置 PermitRootLogin no，改为普通用户+sudo 提权'),
    (None, 'SMB 签名未启用（存在中间人风险）', 0.0, 'low',
     'file-svr-01', 445, '弱配置',
     '在组策略中启用 Microsoft 网络服务器/客户端: 对通信进行数字签名'),
    (None, 'Administrator 账户未重命名且口令策略未加固', 0.0, 'low',
     'dc-win-01', 445, '弱配置',
     '重命名 Administrator、配置账户锁定策略与口令复杂度'),
]

# ---------------------------------------------------------------- 应用漏洞
# (cve_id|None, name, cvss, severity, asset_name, url_path, vuln_class, solution)
APP_VULNS = [
    ('CVE-2022-22965', 'Spring Framework Spring4Shell RCE（数据绑定类污染）', 9.8, 'critical',
     'web-prod-02', '/api/classloader', '组件漏洞',
     '升级 Spring Framework 至 5.3.18/5.2.20 或升级 JDK 及依赖'),
    ('CVE-2021-44228', '应用层使用受 Log4Shell 影响的 Log4j 2.14.1', 10.0, 'critical',
     'web-prod-02', '/api/log', '组件漏洞',
     '升级 Log4j 至 2.17.1+，全量重启引用服务'),
    ('CVE-2016-4437', 'Apache Shiro 1.2.4 反序列化远程代码执行', 9.8, 'critical',
     'web-prod-01', '/login', '反序列化',
     '升级 Shiro 至 1.2.5+，移除 rememberMe 默认加密密钥'),
    ('CVE-2017-18349', 'Fastjson 1.2.24 反序列化远程代码执行', 9.8, 'critical',
     'web-prod-01', '/api/checkcode', '反序列化',
     '升级 Fastjson 至 1.2.83+，开启 SafeMode'),
    (None, '登录接口 SQL 注入（报错注入，可拖库）', 9.8, 'critical',
     'web-prod-01', '/api/auth/login', '注入',
     '改用参数化查询/ORM，对输入做白名单校验，WAF 临时拦截'),
    (None, '会员中心水平越权（遍历 ID 可查看任意用户订单）', 6.5, 'medium',
     'web-prod-01', '/api/order/detail', '越权访问',
     '服务端校验资源归属，使用不可预测 ID 并记录审计日志'),
    (None, '评论功能存储型 XSS（可窃取管理员会话）', 6.1, 'medium',
     'web-prod-01', '/api/comment', '跨站脚本',
     '输出编码 + CSP + HttpOnly Cookie'),
    (None, '附件预览接口任意文件读取（../ 路径穿越）', 7.5, 'high',
     'web-prod-02', '/api/file/preview', '文件上传',
     '规范化路径并限制根目录，白名单校验文件类型'),
    (None, '登录态会话固定（登录后 SessionID 未轮换）', 4.7, 'medium',
     'web-prod-01', '/api/session', '会话管理',
     '登录成功后重新生成 SessionID'),
    (None, '转账接口缺少 CSRF Token', 5.4, 'medium',
     'web-prod-02', '/api/transfer', '跨站请求伪造',
     '引入 CSRF Token / SameSite=Strict + Origin 校验'),
    (None, '短信网关登录接口明文传输口令', 4.3, 'medium',
     'mail-gw-01', '/api/mail/login', '弱口令',
     '全站强制 HTTPS，登录报文加密传输'),
    ('CVE-2007-6750', 'HTTP 服务 Slowloris 慢速攻击拒绝服务', 5.0, 'medium',
     'web-prod-02', '/', '拒绝服务',
     '开启连接超时与每客户端连接数限制（nginx limit_conn）'),
]

SEV_ORDER = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}


def seed():
    with app.app_context():
        # 资产
        assets = {}
        for name, atype, ip, os_info, desc in ASSETS:
            asset = Asset.query.filter_by(name=name).first()
            if not asset:
                asset = Asset(name=name, type=atype, ip=ip, status='online',
                              os_info=os_info, extra_data={'description': desc})
                db.session.add(asset)
                print(f'[asset+] {name} ({ip})')
            assets[name] = asset
        db.session.flush()

        results = []

        def seed_vuln(vuln_type, records):
            for cve_id, name, cvss, severity, asset_name, location, vuln_class, solution in records:
                asset = assets[asset_name]
                # 漏洞定义（知识库）。无 CVE 的用 sha1 稳定 ID（勿用 hash()，
                # str hash 每个进程随机，重复执行会产生重复数据）
                vid = f'cve-{cve_id.lower()}' if cve_id else \
                    f'mnl-{hashlib.sha1(name.encode()).hexdigest()[:10]}'
                vuln = Vulnerability.query.get(vid)
                if not vuln:
                    vuln = Vulnerability(
                        id=vid, name=name, cve_id=cve_id,
                        cvss_score=cvss, severity=severity, vuln_type=vuln_type,
                        vuln_class=vuln_class, solution=solution,
                        description=f'测试数据：{name}。影响组件见评级配置与实际扫描结果。',
                        source='seed',
                    )
                    db.session.add(vuln)
                    db.session.flush()
                    print(f'[def+]  {vuln_type:<11} {name}')
                # 漏洞实例
                if vuln_type == 'host':
                    q = AssetVulnerability.query.filter_by(
                        asset_id=asset.id, vuln_id=vid, vuln_type='host', port=location)
                else:
                    q = AssetVulnerability.query.filter_by(
                        asset_id=asset.id, vuln_id=vid, vuln_type='application', url_path=location)
                av = q.first()
                is_new = av is None
                if is_new:
                    av = AssetVulnerability(
                        asset_id=asset.id, vuln_id=vid, vuln_type=vuln_type,
                        vuln_class=vuln_class, severity=severity, cvss_score=cvss,
                        status='open', source='seed',
                        ip_address=asset.ip, hostname=asset.name,
                        evidence=f'扫描样例输出：{name} 命中（{asset.ip}）',
                        discovered_at=datetime.utcnow() - timedelta(days=(len(results) + 1)),
                    )
                    if vuln_type == 'host':
                        av.port, av.protocol = location, 'tcp'
                        av.plugin_name, av.plugin_id = name, f'N{len(results)+1:04d}'
                        av.plugin_family = 'Generic'
                    else:
                        av.url_path = location
                        av.component_version = '见漏洞定义'
                    db.session.add(av)
                    db.session.flush()
                    av.vuln_code = _gen_vuln_code(vuln_type, av.id)
                    av.append_timeline('created', 'seed', '测试数据导入')
                results.append((is_new, av, asset))

        seed_vuln('host', HOST_VULNS)
        seed_vuln('application', APP_VULNS)
        db.session.commit()

        # 按评级配置重新定级（跳过人工重评过的）
        config = _get_rating_config()
        rows, changed = [], 0
        for is_new, av, asset in results:
            old = (av.assessed_severity, av.assessed_score)
            score, severity = _calculate_assessed_score(av, config)
            av.assessed_score = score
            av.assessed_severity = severity
            if not av.assess_reason:
                av.assess_factors = {'auto': True, 'by': 'seed'}
            new = (severity, score)
            if old != new:
                changed += 1
            cve = (av.vulnerability.cve_id if av.vulnerability else '') or '-'
            rows.append((VULN_ORDER[av.vuln_type], SEV_ORDER.get(severity, 9), av.vuln_code,
                         av.vuln_type, av.vulnerability.name if av.vulnerability else '?',
                         cve, asset.name, av.cvss_score, av.severity, score, severity))
        db.session.commit()

        # 对照表：主机 + 应用，按重评等级排序
        print('\n================ 重新定级结果（按当前评级配置） ================')
        print(f"{'编号':<16} {'类型':<6} {'漏洞名称':<44} {'CVE':<16} {'资产':<13} {'CVSS':>5} {'原始':<9} {'重评分':>6} {'重评级':<9}")
        cur_type = None
        for _, _, code, vt, name, cve, asset_name, cvss, orig, score, sev in sorted(rows):
            if cur_type is not None and vt != cur_type:
                print('-' * 132)
            cur_type = vt
            print(f"{code:<16} {('主机' if vt=='host' else '应用'):<6} {name[:42]:<44} {cve[:15]:<16} "
                  f"{asset_name:<13} {cvss:>5.1f} {orig:<9} {score:>6.2f} {sev:<9}")
        n_new = sum(1 for r, *_ in results if r)
        print(f"\n合计 {len(results)} 条漏洞（新增 {n_new}，存量重算 {len(results)-n_new}），定级变化 {changed} 条。")
        print("说明：资产重要性/修复难度两维度无资产字段支撑取中性值；可利用性/威胁情报按 CVE 在野利用清单判定；")
        print("      暴露程度按 IP 公私网判定。逐条业务上下文调整请在漏洞详情中人工重评（recalculate 会跳过人工记录）。")


VULN_ORDER = {'host': 0, 'application': 1}

if __name__ == '__main__':
    try:
        seed()
    except Exception as e:
        import traceback; traceback.print_exc()
        sys.exit(1)
    sys.exit(0)
