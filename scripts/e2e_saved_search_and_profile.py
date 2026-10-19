# -*- coding: utf-8 -*-
"""
E2E：修复验证
1) 安全告警页「保存查询条件」不再触发 React #31（query 对象被当 React child）
   - 保存后展开「已保存搜索」能同时看到名称与 query 文本
   - 刷新页面重新进入后条目仍在（后端持久化，原为进程内存）
2) 个人中心可达：
   - 侧边栏左下角用户区 → #/profile 停留并渲染
   - Header 头像 → 菜单「个人中心」 → #/profile 停留
"""
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3266"
ADMIN = {"username": "admin", "password": "admin123"}

passed, failed = 0, 0


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS  {name}" + (f"  ({detail})" if detail else ""), flush=True)
    else:
        failed += 1
        print(f"  FAIL  {name}  {detail}", flush=True)


def call(url, data=None, method=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    m = method or ("POST" if data is not None else "GET")
    r = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None,
                               headers=headers, method=m)
    return json.load(urllib.request.urlopen(r))


def open_logged_in(page, token, user):
    """标准注入顺序：goto / → 注入 → reload → 等平台名 → SPA 内 goto"""
    page.goto(BASE + "/")
    page.evaluate(
        "([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); }",
        [token, json.dumps(user)])
    page.goto(BASE + "/")
    page.reload()
    page.wait_for_selector("text=统一安全运营平台", timeout=30000)
    page.wait_for_timeout(1200)


def main():
    login = call(f"{BASE}/api/auth/login", ADMIN)["data"]
    token, user = login["token"], {**login["user"], "permissions": login.get("permissions", [])}

    # 前置清理：清掉当前用户残留的 saved searches（保证断言条数精确）
    rows = call(f"{BASE}/api/alerts-api/alerts/saved-searches", token=token).get("data") or []
    for r in rows:
        call(f"{BASE}/api/alerts-api/alerts/saved-searches/{r['id']}", method="DELETE", token=token)
    print(f"pre-clean: removed {len(rows)} stale saved searches", flush=True)

    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context(viewport={"width": 1680, "height": 1100}).new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        open_logged_in(page, token, user)

        # ============ 场景 1：保存查询条件 ============
        print("\n== 场景 1：安全告警页保存查询条件 ==", flush=True)
        page.goto(BASE + "/#/detection/investigation")
        page.wait_for_selector("text=安全告警", timeout=15000)
        page.wait_for_timeout(2000)

        search_box = page.query_selector("input[placeholder^='搜索告警']")
        check("搜索框可见", bool(search_box))
        if not search_box:
            browser.close()
            return False
        search_box.fill("severity:high AND status:new")
        page.wait_for_timeout(300)

        # 保存按钮在输入非空后可用
        page.query_selector("button[aria-label='保存当前搜索']").click()
        page.wait_for_selector("input[placeholder='输入搜索名称']", timeout=8000)
        page.fill("input[placeholder='输入搜索名称']", "E2E-保存条件验证")
        # autoFocus 的输入框直接回车触发保存
        page.press("input[placeholder='输入搜索名称']", "Enter")
        page.wait_for_timeout(2500)

        body = page.query_selector("body").inner_text()
        check("保存后无对象渲染崩溃（页面仍是告警工作台）", "安全告警" in body)
        check("出现保存成功提示", "搜索已保存" in body, "toast 3s 内")

        # 展开已保存搜索下拉 —— 名称与 query 文本都应正确显示（字符串，而非 [object Object]）
        page.query_selector("button[aria-label='已保存搜索']").click()
        page.wait_for_timeout(1200)
        panel_text = page.query_selector("body").inner_text()
        check("下拉含保存名称", "E2E-保存条件验证" in panel_text)
        check("下拉含 query 文本", "severity:high AND status:new" in panel_text,
              "query 对象必须归一化为字符串")
        check("无 [object Object] 渲染", "[object Object]" not in panel_text)

        # 刷新页面（整页）后重新进入 — 持久化验证
        page.goto(BASE + "/")
        page.reload()
        page.wait_for_selector("text=统一安全运营平台", timeout=30000)
        page.wait_for_timeout(1000)
        page.goto(BASE + "/#/detection/investigation")
        page.wait_for_selector("text=安全告警", timeout=15000)
        page.wait_for_timeout(2500)
        page.query_selector("button[aria-label='已保存搜索']").click()
        page.wait_for_timeout(1200)
        panel2 = page.query_selector("body").inner_text()
        check("刷新后已保存搜索仍在（后端持久化）", "E2E-保存条件验证" in panel2)
        page.query_selector("button[aria-label='已保存搜索']").click()  # 收起

        # ============ 场景 2：个人中心可达 ============
        print("\n== 场景 2：个人中心跳转 ==", flush=True)
        page.goto(BASE + "/#/")
        page.wait_for_timeout(1500)

        # 2a：侧边栏左下角用户区
        sidebar_btn = page.query_selector("button[title='个人中心']")
        check("侧边栏用户区按钮存在", bool(sidebar_btn))
        if sidebar_btn:
            sidebar_btn.click()
            page.wait_for_timeout(2500)
            h = page.evaluate("location.hash")
            check("点击侧边栏用户区后 hash=#/profile", h == "#/profile", h)
            main_text = page.query_selector("main").inner_text()
            check("个人中心页已渲染", "个人中心" in main_text and "基本信息" in main_text)
            check("未被弹回仪表盘", "安全态势仪表盘" not in main_text)

        # 2b：Header 头像 → 菜单「个人中心」
        page.goto(BASE + "/#/")
        page.wait_for_timeout(1500)
        header_user = page.query_selector("header button:has-text('管理员')")
        check("Header 头像按钮存在", bool(header_user))
        if header_user:
            header_user.click()
            page.wait_for_timeout(800)
            menu_item = page.query_selector("button:has-text('个人中心')")
            check("用户菜单弹出", bool(menu_item))
            if menu_item:
                menu_item.click()
                page.wait_for_timeout(2500)
                h = page.evaluate("location.hash")
                check("点击菜单项后 hash=#/profile", h == "#/profile", h)
                main_text = page.query_selector("main").inner_text()
                check("Header 入口个人中心页已渲染", "个人中心" in main_text)

        check("全程零 pageerror", not errors, "; ".join(errors[:3]))
        browser.close()

        # ============ 清理 ============
        rows = call(f"{BASE}/api/alerts-api/alerts/saved-searches", token=token).get("data") or []
        for r in rows:
            call(f"{BASE}/api/alerts-api/alerts/saved-searches/{r['id']}", method="DELETE", token=token)
        print(f"\npost-clean: removed {len(rows)} test saved searches", flush=True)

    print(f"\n===== RESULT: {passed} PASS / {failed} FAIL =====", flush=True)
    return failed == 0


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
