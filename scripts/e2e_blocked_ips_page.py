# -*- coding: utf-8 -*-
"""
E2E：封堵清单独立页面验证
- 侧边栏「封堵清单」入口可进入 /#/response/blocked-ips
- 页面含统计卡、筛选栏、历史表（IP/状态/封禁时间/解封时间/封禁时长/原因/方式/来源/操作）
- 封禁中行展示 danger 徽标与解封按钮；解封走应用内确认弹窗（零原生弹窗）
- 解封后行状态变「已解封」，回填解封时间与封禁时长，操作人记录 admin
- 执行记录页不再渲染「当前封堵名单」
- 全程零 pageerror
"""
import json
import subprocess
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3266"
API = "http://127.0.0.1:5001"
TEST_IP = "198.51.100.88"  # RFC5737 文档段，专用测试 IP
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


def seed_block_ip(ip, duration="2h"):
    """灌一条带预设时长的测试封堵（验证「预设时长」展示与到期逻辑）。"""
    script = (
        "from app import create_app\n"
        "from app.engine.actions import IPBlockManager\n"
        "app = create_app()\n"
        "with app.app_context():\n"
        f"    r = IPBlockManager.block_ip('{ip}', 'E2E封堵清单测试', 'playbook', duration='{duration}')\n"
        "    print(r.success, r.message, r.data.get('method') if r.data else None)\n"
    )
    out = subprocess.run(["docker", "exec", "-i", "usop_all", "python3", "-c", script],
                         capture_output=True, text=True, timeout=60)
    return out.stdout.strip().splitlines()[-1] if out.stdout.strip() else out.stderr[-200:]


def main():
    login = call(f"{API}/api/auth/login", ADMIN)["data"]
    token, user = login["token"], {**login["user"], "permissions": login.get("permissions", [])}

    print(f"[seed] {seed_block_ip(TEST_IP)}", flush=True)
    blocked = {b["ip"] for b in call(f"{API}/api/playbooks-api/playbooks/blocked-ips", token=token)["data"]}
    check("测试 IP 已封堵（带 2h 时长）", TEST_IP in blocked)

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

        # ---- 侧边栏入口（响应与自动化分组默认收起，先展开） ----
        page.locator("text=响应与自动化").first.click()
        page.wait_for_timeout(600)
        page.locator("text=封堵清单").first.click()
        page.wait_for_timeout(2000)
        check("侧边栏进入封堵清单页", page.locator("text=剧本与隔离动作封禁").count() > 0)
        check("URL 落在 /#/response/blocked-ips", "/response/blocked-ips" in page.url, page.url)
        check("统计卡渲染（封禁中/今日封禁/今日解封/累计封堵）",
              page.locator("text=封禁中").count() > 0 and page.locator("text=累计封堵").count() > 0)

        # ---- 表头含封禁时间/解封时间/封禁时长 ----
        thead = page.locator("thead").last.inner_text()
        for col in ("IP", "状态", "封禁时间", "解封时间", "封禁时长", "封禁原因", "封堵方式", "来源", "操作"):
            check(f"表头含「{col}」", col in thead)

        # ---- 测试行：封禁中 + 预设 2h ----
        row = page.locator("tr", has_text=TEST_IP).first
        check("测试行展示封禁中徽标", row.locator("text=封禁中").count() > 0)
        check("测试行展示预设时长", row.locator("text=预设 2h").count() > 0)
        check("测试行封禁时长持续中", row.locator("text=持续中").count() > 0)
        check("测试行封禁时间已填", "20" in row.inner_text())

        # ---- 筛选：仅看封禁中 ----
        page.select_option("select", "active")
        page.wait_for_timeout(1500)
        check("状态筛选=封禁中生效", page.locator("tr", has_text=TEST_IP).count() > 0)
        page.select_option("select", "")
        page.wait_for_timeout(1500)

        # ---- IP 搜索 ----
        page.fill("input[placeholder='搜 IP（支持模糊）']", TEST_IP)
        page.keyboard.press("Enter")
        page.wait_for_timeout(1500)
        check("IP 搜索精确命中", page.locator("tr", has_text=TEST_IP).count() > 0)
        page.fill("input[placeholder='搜 IP（支持模糊）']", "")
        page.keyboard.press("Enter")
        page.wait_for_timeout(1500)

        # ---- 解封：应用内确认弹窗（先验证取消不解除，再确认解封） ----
        page.locator("tr", has_text=TEST_IP).first.locator("button", has_text="解封").click()
        page.wait_for_timeout(600)
        dlg = page.locator("div.fixed.inset-0.z-\\[60\\]")
        check("弹出应用内解封确认弹窗", dlg.count() > 0 and dlg.first.is_visible())
        check("弹窗提示含测试 IP", dlg.first.locator(f"text=确认解封 IP {TEST_IP}").count() > 0)
        check("未触发浏览器原生弹窗", len(native_dialogs) == 0, f"{native_dialogs}")
        if dlg.count() > 0:
            dlg.first.locator("button", has_text="取消").click()
            page.wait_for_timeout(500)
            check("取消后弹窗关闭", page.locator("div.fixed.inset-0.z-\\[60\\]").count() == 0)
            check("取消后 IP 仍封禁中", page.locator("tr", has_text=TEST_IP).first.locator("text=封禁中").count() > 0)
        page.locator("tr", has_text=TEST_IP).first.locator("button", has_text="解封").click()
        page.wait_for_timeout(600)
        dlg = page.locator("div.fixed.inset-0.z-\\[60\\]")
        if dlg.count() > 0:
            dlg.first.locator("button", has_text="解封").click()
            page.wait_for_timeout(2500)
            check("解封成功提示", page.locator(f"text=IP {TEST_IP} 解封成功").count() > 0)
            row2 = page.locator("tr", has_text=TEST_IP).first
            check("行状态变为已解封", row2.locator("text=已解封").count() > 0)
            check("回填解封时间", row2.inner_text().count(":") >= 3)  # 解封时间列有值时
            check("回填封禁时长", row2.locator("text=秒").count() > 0 or row2.locator("text=分").count() > 0)
            after = {b["ip"] for b in call(f"{API}/api/playbooks-api/playbooks/blocked-ips", token=token)["data"]}
            check("后端快照同步移除", TEST_IP not in after)
            hist = call(f"{API}/api/playbooks-api/playbooks/blocked-ips/history?ip={TEST_IP}", token=token)["data"]
            rec = hist["items"][0]
            check("历史记录 operator=admin", rec.get("operator") == "admin", str(rec.get("operator")))
            check("历史记录时长为秒级", isinstance(rec.get("block_seconds"), int), str(rec.get("block_seconds")))

        # ---- 执行记录页不再有封堵名单 ----
        page.goto(BASE + "/#/response/playbooks")
        page.wait_for_timeout(1200)
        page.locator("text=执行记录").first.click()
        page.wait_for_timeout(1800)
        check("执行记录页已移除封堵名单 section", page.locator("text=当前封堵名单").count() == 0)

        check("全流程无 JS 报错", len(errors) == 0, "; ".join(errors[:3]))
        page.goto(BASE + "/#/response/blocked-ips")
        page.wait_for_timeout(1800)
        page.screenshot(path="docs/images/blocked-ips-page.png", full_page=False)
        browser.close()

    print(f"\n结果：{passed} PASS / {failed} FAIL", flush=True)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
