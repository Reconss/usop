"""README 配图抓取脚本：无头登录 → 逐页面截图到 docs/images/。

用途：为 README「平台截图」章节生成/刷新模块截图。
复用既有命名，缺失模块按 <module>-<page>.png 新建；已存在文件会被覆盖刷新。

用法：
    python3.14 scripts/capture_readme_screenshots.py [--only assets,ingestion]
"""
import argparse
import json
import os
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_DIR = os.path.join(ROOT, 'docs', 'images')
BASE = 'http://localhost:3266'
API = 'http://127.0.0.1:5001'

# (key, hash 路由, 输出文件名, 等待的落地文本, 额外等待秒)
TARGETS = [
    ('dashboard', '/', 'dashboard-overview.png', '攻击源', 2.5),
    ('alerts', '/detection/investigation', 'alerts-investigation.png', '告警', 2.5),
    ('events', '/detection/events', 'events-workbench.png', '事件', 2.0),
    ('rules', '/response/rules', 'detection-rules.png', '规则', 2.0),
    ('playbooks', '/response/playbooks', 'playbook-canvas.png', '剧本', 2.5),
    ('executions', '/response/blocked-ips', 'blocked-ips.png', '封堵', 2.0),
    ('assets', '/assets/inventory', 'assets-inventory.png', '资产', 2.5),
    ('ingestion', '/data/ingestion', 'data-ingestion.png', '数据', 2.5),
    ('vuln', '/vulnerabilities/host', 'vuln-host-list.png', '漏洞', 2.5),
    ('assessment', '/vulnerabilities/assessment', 'vuln-rating-config.png', '评级', 2.0),
    ('ai', '/detection/ai', 'ai-center.png', 'AI', 2.5),
    ('hunting', '/detection/hunting', 'threat-hunting.png', '狩猎', 2.0),
    ('roles', '/system/roles', 'rbac-roles.png', '角色', 2.0),
]


def login_payload():
    body = json.dumps({'username': 'admin', 'password': 'admin123'}).encode()
    req = urllib.request.Request(f'{API}/api/auth/login', data=body,
                                 headers={'Content-Type': 'application/json'}, method='POST')
    return json.load(urllib.request.urlopen(req))['data']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='', help='逗号分隔的 key 子集')
    args = ap.parse_args()

    wanted = set(args.only.split(',')) if args.only else None
    targets = [t for t in TARGETS if not wanted or t[0] in wanted]

    login = login_payload()
    token, user = login['token'], {**login['user'], 'permissions': login.get('permissions', [])}
    os.makedirs(IMG_DIR, exist_ok=True)

    ok, fail = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # 1x 采样即可：README 展示宽度约 800px，2x 会让单张涨到 500KB+，仓库吃不消
        page = browser.new_page(viewport={'width': 1512, 'height': 950},
                                device_scale_factor=1)

        # 注入登录态：先落地 / 再 reload，避开 AuthContext verifyToken 与路由重定向竞速
        page.goto(BASE + '/', wait_until='domcontentloaded')
        page.evaluate(
            """([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); }""",
            [token, user])
        page.reload(wait_until='domcontentloaded')
        page.wait_for_selector('aside, nav', timeout=15000)
        page.wait_for_timeout(1200)

        for key, route, filename, needle, wait in targets:
            out = os.path.join(IMG_DIR, filename)
            try:
                page.goto(f'{BASE}/#{route}', wait_until='domcontentloaded')
                page.wait_for_timeout(int(wait * 1000))
                page.wait_for_selector('main', timeout=15000)
                page.screenshot(path=out, full_page=False)
                size_kb = os.path.getsize(out) // 1024
                ok.append(f'{key:12s} → {filename}  ({size_kb} KB)')
            except Exception as e:  # noqa: BLE001
                fail.append(f'{key:12s} → {filename}  失败: {type(e).__name__}: {e}')

        browser.close()

    print('=== 成功 ===')
    for line in ok:
        print(' ', line)
    if fail:
        print('=== 失败 ===')
        for line in fail:
            print(' ', line)
    print(f'\n{len(ok)}/{len(targets)} 张已写入 {IMG_DIR}')


if __name__ == '__main__':
    main()
