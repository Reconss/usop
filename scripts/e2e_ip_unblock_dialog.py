# -*- coding: utf-8 -*-
"""
E2E：IP 解封不再使用浏览器原生弹窗（window.confirm），改为应用内 ConfirmDialog。
验证点：
  1. 封堵名单中点击「解封」→ 弹出应用内确认弹窗（标题「解封确认」+ 提示文案），
     全程不触发浏览器原生 dialog（page.on('dialog') 监控）
  2. 点「取消」→ 弹窗关闭，IP 仍处于封堵状态
  3. 点「解封」→ 解封成功提示出现，该 IP 从封堵名单消失
  4. 全程无 pageerror
"""
import json
import subprocess
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3266"
API = "http://127.0.0.1:5001"
TEST_IP = "198.51.100.99"  # RFC5737 文档段，专用测试 IP
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


def seed_block_ip(ip):
    """经 IPBlockManager 灌入一条测试封堵记录（无时长，长期有效）。"""
    script = (
        "from app import create_app\n"
        "from app.engine.actions import IPBlockManager\n"
        "app = create_app()\n"
        "with app.app_context():\n"
        f"    r = IPBlockManager.block_ip('{ip}', 'E2E解封弹窗测试', source='playbook')\n"
        "    print(r.success, r.message)\n"
    )
    out = subprocess.run(
        ["docker", "exec", "-i", "usop_all", "python3", "-c", script],
        capture_output=True, text=True, timeout=60)
    return out.stdout.strip()


def main():
    login = call(f"{API}/api/auth/login", ADMIN)["data"]
    token, user = login["token"], {**login["user"], "permissions": login.get("permissions", [])}

    print(f"[seed] {seed_block_ip(TEST_IP)}", flush=True)
    blocked = {b["ip"] for b in call(f"{API}/api/playbooks-api/playbooks/blocked-ips", token=token)["data"]}
    check("测试 IP 已在封堵名单", TEST_IP in blocked, f"共 {len(blocked)} 条")

    errors, native_dialogs = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context(viewport={"width": 1680, "height": 1100}).new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))

        def on_dialog(d):
            native_dialogs.append(d.message)
            d.dismiss()
        page.on("dialog", on_dialog)

        page.goto(BASE + "/")
        page.evaluate(
            "([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); }",
            [token, json.dumps(user)])
        page.goto(BASE + "/")
        page.reload()
        page.wait_for_selector("text=统一安全运营平台", timeout=30000)
        page.wait_for_timeout(1200)

        page.goto(BASE + "/#/response/playbooks")
        page.wait_for_timeout(1500)
        page.locator("text=执行记录").first.click()
        page.wait_for_selector("text=当前封堵名单", timeout=15000)
        page.wait_for_timeout(1200)

        row = page.locator("div.flex-wrap", has_text=TEST_IP).first
        check("封堵名单展示测试 IP", row.count() > 0)

        # ---- 用例 1：点击解封 → 应用内弹窗，无原生 dialog ----
        row.locator("button", has_text="解封").click()
        page.wait_for_timeout(600)
        dlg = page.locator("div.fixed.inset-0.z-\\[60\\]")
        dlg_visible = dlg.count() > 0 and dlg.first.is_visible()
        check("弹出应用内确认弹窗", dlg_visible, "ConfirmDialog 已渲染")
        check("弹窗标题为「解封确认」",
              dlg_visible and dlg.first.locator("h3", has_text="解封确认").count() > 0)
        check("弹窗提示包含测试 IP",
              dlg_visible and dlg.first.locator(f"text=确认解封 IP {TEST_IP}").count() > 0)
        check("未触发浏览器原生弹窗", len(native_dialogs) == 0,
              f"native dialogs: {native_dialogs}")
        check("无 JS 报错", len(errors) == 0, "; ".join(errors[:2]))
        if dlg_visible:
            page.screenshot(path="docs/images/ip-unblock-dialog.png", full_page=False)

        # ---- 用例 2：取消 → 弹窗关闭，IP 仍在名单 ----
        if dlg_visible:
            dlg.first.locator("button", has_text="取消").click()
            page.wait_for_timeout(500)
            check("取消后弹窗关闭", page.locator("div.fixed.inset-0.z-\\[60\\]").count() == 0)
            check("取消后 IP 仍封堵", page.locator("div.flex-wrap", has_text=TEST_IP).count() > 0)

        # ---- 用例 3：再次解封并确认 → 解封成功，IP 从名单消失 ----
        row2 = page.locator("div.flex-wrap", has_text=TEST_IP).first
        row2.locator("button", has_text="解封").click()
        page.wait_for_timeout(600)
        dlg2 = page.locator("div.fixed.inset-0.z-\\[60\\]")
        check("再次弹出应用内确认弹窗", dlg2.count() > 0 and dlg2.first.is_visible())
        check("确认流程仍未触发原生弹窗", len(native_dialogs) == 0)
        if dlg2.count() > 0:
            dlg2.first.locator("button", has_text="解封").click()
            page.wait_for_timeout(2500)
            ok_msg = page.locator(f"text=IP {TEST_IP} 解封成功").count() > 0
            check("显示解封成功提示", ok_msg)
            check("IP 已从封堵名单移除", page.locator("div.flex-wrap", has_text=TEST_IP).count() == 0)
            after = {b["ip"] for b in call(f"{API}/api/playbooks-api/playbooks/blocked-ips", token=token)["data"]}
            check("后端名单同步移除", TEST_IP not in after)

        check("全流程无 JS 报错", len(errors) == 0, "; ".join(errors[:3]))
        browser.close()

    print(f"\n结果：{passed} PASS / {failed} FAIL", flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
