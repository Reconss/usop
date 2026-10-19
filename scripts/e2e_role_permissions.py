"""角色权限 E2E：角色管理页（系统角色/权限目录/编辑/恢复默认）+ 按角色菜单过滤"""
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3266"
RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")


def login_via_api(username, password):
    req = urllib.request.Request(
        f"{BASE}/api/auth/login",
        data=json.dumps({"username": username, "password": password}).encode(),
        headers={"Content-Type": "application/json"},
    )
    body = json.load(urllib.request.urlopen(req))["data"]
    return body["token"], {**body["user"], "permissions": body.get("permissions", [])}


def api_call(method, path, body=None, token=None):
    req = urllib.request.Request(
        f"http://localhost:5001{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json",
                 **({"Authorization": f"Bearer {token}"} if token else {})},
        method=method,
    )
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        try:
            return json.load(e)
        except Exception:
            return {"success": False, "code": e.code}


ADMIN_TOKEN, _ = login_via_api("admin", "admin123")
# 自包含：确保 analyst 探测用户存在（不存在则创建），teardown 删除
_probe = api_call("GET", "/api/users-api/users?page_size=100", token=ADMIN_TOKEN).get("data")
_items = _probe if isinstance(_probe, list) else _probe.get("items", [])
_probe_row = next((u for u in _items if u["username"] == "e2e-analyst-probe"), None)
if not _probe_row:
    api_call("POST", "/api/users-api/users",
             {"username": "e2e-analyst-probe", "password": "Test@12345",
              "email": "e2e-analyst@test.local", "role": "analyst"}, token=ADMIN_TOKEN)
    print("setup: 已创建 e2e-analyst-probe")
else:
    print("setup: e2e-analyst-probe 已存在")


def inject_and_open(page, token, user, hash_path):
    """已知稳定顺序：goto / 注入 → 在 / reload → 等待落地 → SPA 内 goto hash"""
    page.goto(BASE + "/")
    page.evaluate(
        "([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); }",
        [token, json.dumps(user)],
    )
    page.goto(BASE + "/")
    page.reload()
    page.wait_for_selector("text=统一安全运营平台", timeout=30000)
    page.wait_for_timeout(2000)
    page.goto(BASE + hash_path)
    page.wait_for_timeout(4000)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1680, "height": 1000})
    page = ctx.new_page()
    pageerrors = []
    page.on("pageerror", lambda e: pageerrors.append(str(e)))

    # ── ① admin：角色管理页 ───────────────────────────
    token, user = login_via_api("admin", "admin123")
    inject_and_open(page, token, user, "/#/system/roles")
    page.wait_for_timeout(1500)

    # 4 个系统角色
    body_text = page.locator("body").inner_text()
    for rname in ("系统管理员", "安全运营", "安全分析师", "审计员"):
        check(f"系统角色[{rname}]显示", rname in body_text)

    # 权限数标注（29/24/13/15）
    import re as _re
    counts = _re.findall(r"(\d+) 权限", body_text)
    check("角色权限数标注", set(counts) >= {"29", "24", "13", "15"}, f"counts={sorted(set(counts))}")

    # 漏洞管理模块出现在权限目录（选中分析师角色后展开）
    page.locator("button:has-text('安全分析师')").first.click()
    page.wait_for_timeout(800)
    selected_text = page.locator("body").inner_text()
    check("权限目录含漏洞管理", "漏洞管理" in selected_text)
    check("权限目录含 vulns 权限点", ("查看漏洞" in selected_text and "管理漏洞" in selected_text))

    # 系统角色可编辑：配置权限按钮存在
    check("系统角色有[配置权限]入口", page.locator("button:has-text('配置权限')").count() >= 1)

    # 编辑 analyst：勾选 vulns.manage → 保存 → 列表出现「已定制」
    page.locator("button:has-text('配置权限')").first.click()
    page.wait_for_timeout(800)
    modal = page.locator("text=系统内置角色").first
    check("编辑弹窗打开", modal.count() >= 1)
    vuln_card = page.locator("button:has-text('管理漏洞')").first
    if vuln_card.count():
        vuln_card.click()
        page.wait_for_timeout(300)
    page.locator("button:has-text('保存')").first.click()
    page.wait_for_timeout(2500)
    roles_after = page.locator("body").inner_text()
    check("自定义后出现[已定制]标记", "已定制" in roles_after)

    # 恢复默认 → 「已定制」消失（用 exact 避开页头「恢复默认分配」子串误匹配）
    page.locator("button:has-text('安全分析师')").first.click()
    page.wait_for_timeout(600)
    page.get_by_role("button", name="恢复默认", exact=True).click()
    page.wait_for_timeout(600)
    page.get_by_role("button", name="确认恢复", exact=True).click()
    page.wait_for_timeout(2500)
    roles_restored = page.locator("body").inner_text()
    check("恢复默认后[已定制]消失", "已定制" not in roles_restored)

    # 恢复默认分配（全局）按钮存在
    check("页头有[恢复默认分配]入口", page.locator("button:has-text('恢复默认分配')").count() >= 1)

    page.screenshot(path="/Users/codes/usop/docs/images/role-permissions.png")

    # ── ② analyst：菜单按权限过滤 ─────────────────────
    ctx2 = browser.new_context(viewport={"width": 1680, "height": 1000})
    page2 = ctx2.new_page()
    page2.on("pageerror", lambda e: pageerrors.append("analyst: " + str(e)))
    token2, user2 = login_via_api("e2e-analyst-probe", "Test@12345")
    inject_and_open(page2, token2, user2, "/#/system/roles")
    page2.wait_for_timeout(1500)
    # 展开全部分组（子菜单条件渲染，折叠时不在文本中）
    for group in ("漏洞管理", "响应与自动化", "资产与攻击面"):
        g = page2.locator(f"button:has-text('{group}')").first
        if g.count():
            g.click()
            page2.wait_for_timeout(400)
    menu_text = page2.locator("body").inner_text()

    # analyst 有权限的菜单应出现
    for label in ("仪表盘", "工作台", "安全告警", "威胁狩猎", "AI中心", "主机漏洞", "应用漏洞",
                  "剧本编排", "规则管理", "资产清单", "扫描任务"):
        check(f"analyst 可见[{label}]", label in menu_text)
    # analyst 无权限的菜单应被过滤
    for label in ("数据采集", "告警过滤", "资源管理", "用户管理", "角色权限", "审计日志",
                  "全局配置", "备份与还原", "评级配置"):
        check(f"analyst 不可见[{label}]", label not in menu_text)

    page2.screenshot(path="/Users/codes/usop/docs/images/role-menu-analyst.png")

    # 直接访问无权页面 → 回落到有权限页面
    page2.goto(BASE + "/#/system/users")
    page2.wait_for_timeout(2500)
    check("analyst 访问 /system/users 被回落", "#/system/users" not in page2.url, page2.url)

    passed = sum(1 for _, ok, _ in RESULTS if ok)
    total = len(RESULTS)
    print(f"\n{'=' * 50}\n{passed}/{total} PASS")
    if pageerrors:
        print(f"pageerror x{len(pageerrors)}: {pageerrors[:3]}")
    else:
        print("pageerror: 0")
    browser.close()

    # teardown：删除探测用户 + 恢复 4 个系统角色默认权限
    teardown = api_call("GET", "/api/users-api/users?page_size=100", token=ADMIN_TOKEN).get("data")
    t_items = teardown if isinstance(teardown, list) else teardown.get("items", [])
    for u in t_items:
        if u["username"] == "e2e-analyst-probe":
            api_call("DELETE", f"/api/users-api/users/{u['id']}", token=ADMIN_TOKEN)
            print("teardown: 已删除 e2e-analyst-probe")
    seed = api_call("POST", "/api/roles-api/roles/seed", {}, token=ADMIN_TOKEN)
    print("teardown: 角色权限已恢复默认" if seed.get("success") else f"teardown 警告: {seed}")

    print("ALL PASS" if passed == total and not pageerrors else "HAS FAIL")
    sys.exit(0 if passed == total and not pageerrors else 1)
