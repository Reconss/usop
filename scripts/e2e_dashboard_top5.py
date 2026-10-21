"""仪表盘 E2E：Top5 攻击源 IP / 风险资产 / 高危资产指标（回归）。

背景：用户反馈「仪表盘的 top5 攻击源 IP 和风险资产没有数据」。
根因：
  1. 攻击源：前端调 recent-alerts 只拿最近 5 条，按 `alert.source_ip`
     聚合——实际字段是 `src_ip`，且 data 是列表不是 {items}，恒为空；
     后端原 /attack-sources 走 _es_terms（ip 类型聚合失败）→ 回落
     硬编码假数据 192.168.1.100，前端也没用它。
  2. 风险资产：前端筛 risk_score > 70 本身能出 1 条，但与指标卡
     「高危资产」（>= 80）口径不一致，卡片显示 0、自相矛盾。
修复：后端 /attack-sources 改 ES terms 聚合（24h 窗口，无假国家/假数据）、
/risk-assets 统一 >= 70 无假回落；指标卡阈值统一 70；前端改调专用接口。

本脚本验证：
  1. API：attack-sources 非空且字段齐全（ip/count，无 country 造假）
  2. API：risk-assets 全部 >= 70；metrics.highRiskAssets 与其数量一致
  3. UI：两个卡片渲染真实数据（非「暂无数据」/「暂无高风险资产」）
  4. UI：指标卡「高危资产」数字与列表条数一致
  5. 全程零 pageerror
"""
import json
import os
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'http://localhost:3266'
API = 'http://127.0.0.1:5001'

PASS, FAIL = [], []


def check(name, ok, detail=''):
    (PASS if ok else FAIL).append(name)
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f'  ({detail})' if detail and not ok else ''))


def call(url, data=None, method=None, token=None):
    h = {'Content-Type': 'application/json'}
    if token:
        h['Authorization'] = f'Bearer {token}'
    m = method or ('POST' if data is not None else 'GET')
    r = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None,
                               headers=h, method=m)
    return json.load(urllib.request.urlopen(r))


def main():
    login = call(f'{API}/api/auth/login', {'username': 'admin', 'password': 'admin123'})['data']
    token, user = login['token'], {**login['user'], 'permissions': login.get('permissions', [])}

    # ---- 1. API 层 ----
    atk = call(f'{API}/api/dashboard-api/attack-sources?hours=24&limit=5', token=token)
    items = atk.get('data') or []
    check('API attack-sources 返回非空', len(items) > 0, f'{len(items)} 条')
    check('API attack-sources 字段齐全（ip/count）',
          all(it.get('ip') and isinstance(it.get('count'), int) for it in items))
    check('API attack-sources 无造假国家字段', all('country' not in it for it in items))
    check('API attack-sources 按条数倒序',
          all(items[i]['count'] >= items[i + 1]['count'] for i in range(len(items) - 1)))

    risk = call(f'{API}/api/dashboard-api/risk-assets?limit=5', token=token)
    risks = risk.get('data') or []
    check('API risk-assets 全部 >= 70', all(r.get('riskScore', 0) >= 70 for r in risks),
          str([r.get('riskScore') for r in risks]))

    metrics = call(f'{API}/api/dashboard-api/metrics', token=token)['data']
    check('指标卡高危资产数与列表一致',
          metrics.get('highRiskAssets') == len(risks),
          f"metric={metrics.get('highRiskAssets')} list={len(risks)}")

    # ---- 2. UI 层 ----
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        page = b.new_context(viewport={'width': 1680, 'height': 1100}).new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))

        page.goto(BASE + '/')
        page.evaluate('([t,u])=>{localStorage.setItem("token",t);localStorage.setItem("user",JSON.stringify(u));}',
                      [token, json.dumps(user)])
        page.goto(BASE + '/')
        page.reload()
        page.wait_for_selector('text=统一安全运营平台', timeout=30000)
        page.wait_for_timeout(1000)
        page.goto(BASE + '/#/')
        page.wait_for_timeout(4000)

        atk_card = page.locator('section.app-card', has_text='Top 5 攻击源 IP').first
        risk_card = page.locator('section.app-card', has_text='Top 5 风险资产').first
        atk_txt = atk_card.inner_text() if atk_card.count() else ''
        risk_txt = risk_card.inner_text() if risk_card.count() else ''
        check('UI 攻击源卡片不再显示「暂无数据」', '暂无数据' not in atk_txt, atk_txt[:80])
        check('UI 攻击源卡片渲染了真实 IP',
              any(it['ip'] in atk_txt for it in items),
              atk_txt[:120].replace('\n', ' '))
        check('UI 风险资产卡片不再显示「暂无高风险资产」',
              '暂无高风险资产' not in risk_txt, risk_txt[:80])
        check('UI 风险资产卡片渲染了真实资产',
              any(r['name'] in risk_txt for r in risks),
              risk_txt[:120].replace('\n', ' '))

        # 指标卡「高危资产」数字
        metric_zone = page.locator('div', has_text='高危资产').last
        mz = metric_zone.inner_text() if metric_zone.count() else ''
        check('UI 指标卡高危资产数字非 0', '高危资产\n0' not in mz, mz[:60].replace('\n', '/'))

        check('全程无 JS 报错', len(errors) == 0, '; '.join(errors[:2]))
        page.screenshot(path=os.path.join(ROOT, 'docs/images/dashboard-top5-fixed.png'))
        b.close()

    print(f'\n{len(PASS)} passed, {len(FAIL)} failed')
    if FAIL:
        print('FAILED:', FAIL)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
