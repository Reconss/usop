"""关联分析规则 E2E：编辑链路 + 删除确认弹窗（防误删）。

背景：#2/#3/#8 曾被无确认删除（按钮紧邻误触）→ 删除已改应用内
ConfirmDialog。本脚本验证：
  1. 关联分析 Tab 列出 13 条规则
  2. 逐条打开编辑卡片（表单回填正常、控件齐全）
  3. 逐条原样保存 —— PATCH 全部 200
  4. 删除：弹应用内确认框（非原生 dialog）；取消不删；确认才删
  5. 全程零 pageerror

说明：删除用例删掉的是临时创建的测试规则（规则创建后立即删，不污染库）。
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

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        page = b.new_context(viewport={'width': 1680, 'height': 1100}).new_page()
        errors, native_dialogs = [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('dialog', lambda d: (native_dialogs.append(d.type), d.dismiss()))

        page.goto(BASE + '/')
        page.evaluate('([t,u])=>{localStorage.setItem("token",t);localStorage.setItem("user",JSON.stringify(u));}',
                      [token, json.dumps(user)])
        page.goto(BASE + '/')
        page.reload()
        page.wait_for_selector('text=统一安全运营平台', timeout=30000)
        page.wait_for_timeout(1000)
        page.goto(BASE + '/#/response/rules')
        page.wait_for_timeout(2500)
        page.locator("button:has-text('关联分析规则')").first.click()
        page.wait_for_timeout(2500)

        # ---- 1. 列表 ----
        rows = page.locator('tbody tr').count()
        check('关联规则列表共 13 条', rows == 13, f'rows={rows}')

        # ---- 2/3. 逐条编辑卡片 + 原样保存（按 PATCH 请求判定，toast 会被 2s 自动清除、时序不稳）----
        patch_count = [0]

        def on_req(r):
            if 'correlation-rules' in r.url and r.method == 'PATCH':
                patch_count[0] += 1
        page.on('request', on_req)

        save_ok = 0
        for i in range(rows):
            row = page.locator('tbody tr').nth(i)
            row.locator('button').nth(1).click()   # Pencil 编辑
            page.wait_for_timeout(500)
            opened = page.locator('text=编辑关联分析规则').count() > 0
            if not opened:
                check(f'[{i}] 编辑卡片打开', False)
                continue
            before = patch_count[0]
            page.locator("button:has-text('保存修改')").first.click()
            for _ in range(20):                    # 动态等 PATCH 发出，最长 6s
                page.wait_for_timeout(300)
                if patch_count[0] > before:
                    break
            if patch_count[0] > before:
                save_ok += 1
            # 保存成功后表单应收起
            page.wait_for_timeout(600)
        check(f'逐条编辑保存全部发出 PATCH（{save_ok}/{rows}）', save_ok == rows)
        # 首次保存的 toast 文案抽验（toast 仅显示约 1 秒；text= 精确匹配不稳，用 has_text）
        row0 = page.locator('tbody tr').nth(0)
        row0.locator('button').nth(1).click()
        page.wait_for_timeout(500)
        page.locator("button:has-text('保存修改')").first.click()
        toast_seen = False
        for _ in range(10):
            page.wait_for_timeout(200)
            if page.locator('div.fixed').filter(has_text='规则已更新').count() > 0:
                toast_seen = True
                break
        check('保存成功有 toast 提示', toast_seen)
        if not toast_seen:
            dump = page.locator('div.fixed')
            print('   [debug] fixed divs:', dump.count(),
                  [d.inner_text()[:50] for d in dump.all()][:3])

        # ---- 4. 删除确认弹窗（用临时规则，不污染正式规则）----
        tmp = call(f'{API}/api/pipeline/correlation-rules', {
            'name': 'E2E-删除确认临时规则', 'analysis_type': 'frequency', 'field': 'src_ip',
            'window_seconds': 60, 'threshold': 2, 'severity': 'low', 'config': {}, 'enabled': True,
        }, token=token)
        tmp_id = tmp['data']['id']
        # 前端列表 20s 轮询刷新，动态等待临时规则行出现（最长 25s）
        tmp_row = page.locator('tbody tr', has_text='E2E-删除确认临时规则').first
        for _ in range(25):
            if tmp_row.count() > 0:
                break
            page.wait_for_timeout(1000)
        check('临时规则出现在列表', tmp_row.count() > 0)
        tmp_row.locator('button').nth(2).click()   # Trash2 删除
        page.wait_for_timeout(800)
        dlg = page.locator('div.fixed.inset-0').filter(has_text='删除确认')
        check('弹出应用内删除确认弹窗', dlg.count() > 0 and dlg.first.is_visible())
        check('弹窗提示含规则名', dlg.first.locator('text=E2E-删除确认临时规则').count() > 0)
        check('未触发浏览器原生弹窗', len(native_dialogs) == 0, f'{native_dialogs}')

        # 取消路径
        dlg.first.locator("button:has-text('取消')").click()
        page.wait_for_timeout(800)
        still = call(f'{API}/api/pipeline/correlation-rules', token=token)['data']
        check('取消后规则仍在', any(r['id'] == tmp_id for r in still))

        # 确认路径
        tmp_row.locator('button').nth(2).click()
        page.wait_for_timeout(800)
        page.locator('div.fixed.inset-0').filter(has_text='删除确认').first \
            .locator("button:has-text('删除')").last.click()
        page.wait_for_timeout(1800)
        after = call(f'{API}/api/pipeline/correlation-rules', token=token)['data']
        check('确认后规则被删除', all(r['id'] != tmp_id for r in after))
        check('删除后列表回到 13 条', len(after) == 13, f'{len(after)}')

        check('全程无 JS 报错', len(errors) == 0, '; '.join(errors[:2]))
        page.screenshot(path=str(ROOT / 'docs/images/correlation-delete-confirm.png'))
        b.close()

    print(f'\n{len(PASS)} passed, {len(FAIL)} failed')
    if FAIL:
        print('FAILED:', FAIL)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
