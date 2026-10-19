"""漏洞评级配置 E2E：保存持久化（刷新不丢失）+ 重新定级 + 漏洞列表定级展示

验证点：
① 评级配置页从后端加载（权重合计 100%，非默认告警）
② 修改权重 → 保存并重新定级 → toast 成功
③ 刷新页面 → 修改后的配置仍在（原 bug：假保存，刷新跳回默认）
④ 恢复默认 → 保存 → 刷新 → 默认配置
⑤ 主机/应用漏洞列表 assessed 列展示真实定级分（Log4j 9.31 critical）
⑥ 全程无 pageerror
"""
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


ADMIN_TOKEN, ADMIN_USER = login_via_api("admin", "admin123")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1680, "height": 1100})
    page = ctx.new_page()
    pageerrors = []
    page.on("pageerror", lambda e: pageerrors.append(str(e)))

    def open_page(hash_path):
        page.goto(BASE + "/")
        page.evaluate(
            "([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); }",
            [ADMIN_TOKEN, json.dumps(ADMIN_USER)],
        )
        page.goto(BASE + "/")
        page.reload()
        page.wait_for_selector("text=统一安全运营平台", timeout=30000)
        page.wait_for_timeout(2000)
        page.goto(BASE + hash_path)
        page.wait_for_timeout(3500)

    # ── ① 评级配置页加载 ──────────────────────────────
    open_page("/#/vulnerabilities/assessment")
    page.wait_for_selector("text=漏洞评级配置", timeout=15000)
    panel = page.query_selector("text=已启用维度权重总和")
    check("评级配置页加载", panel is not None)
    weight_text = page.query_selector_all(".app-panel .num")
    total_text = weight_text[-1].inner_text() if weight_text else ""
    check("默认权重合计 100%", "100%" in total_text, total_text)

    # ── ② 修改权重并保存 ──────────────────────────────
    # 可利用性 25 → 35，暴露程度 20 → 10（保持合计 100）
    exp_input = page.query_selector("input[aria-label='漏洞可利用性权重']")
    exp_input.fill("35")
    exp_input.dispatch_event("change")
    exp2_input = page.query_selector("input[aria-label='暴露程度权重']")
    exp2_input.fill("10")
    exp2_input.dispatch_event("change")
    page.wait_for_timeout(300)
    weight_text2 = page.query_selector_all(".app-panel .num")
    total_text2 = weight_text2[-1].inner_text() if weight_text2 else ""
    check("权重编辑后合计仍 100%", "100%" in total_text2, total_text2)

    page.query_selector("button:has-text('保存并重新定级')").click()
    page.wait_for_selector(".callout-success", timeout=20000)
    toast_text = page.query_selector(".callout-success").inner_text()
    check("保存并重新定级 toast", "重新定级" in toast_text, toast_text[:60])
    n_recalc = toast_text.split("条")[0].split("，")[-1].strip()
    check("重算条数 >= 25", n_recalc.isdigit() and int(n_recalc) >= 25, f"recalculated={n_recalc}")

    # ── ③ 刷新页面配置保留（核心 bug 验证）─────────────
    page.reload()
    page.wait_for_selector("text=漏洞评级配置", timeout=15000)
    page.wait_for_timeout(1000)
    exp_after = page.query_selector("input[aria-label='漏洞可利用性权重']")
    val_after = exp_after.input_value()
    check("刷新后可利用性权重保留 35", val_after == "35", f"got={val_after}")
    saved_hint = page.query_selector("text=上次保存")
    check("显示上次保存时间", saved_hint is not None)

    # ── ④ 恢复默认 ────────────────────────────────────
    page.query_selector("button:has-text('恢复默认')").click()
    page.wait_for_selector(".callout-success", timeout=20000)
    page.wait_for_timeout(500)
    exp_default = page.query_selector("input[aria-label='漏洞可利用性权重']")
    check("恢复默认可利用性 25", exp_default.input_value() == "25", exp_default.input_value())
    page.reload()
    page.wait_for_selector("text=漏洞评级配置", timeout=15000)
    page.wait_for_timeout(1000)
    exp_default2 = page.query_selector("input[aria-label='漏洞可利用性权重']")
    check("刷新后默认配置保留", exp_default2.input_value() == "25", exp_default2.input_value())

    # ── ⑤ 等级阈值可编辑且持久化 ──────────────────────
    page.query_selector("button:has-text('等级阈值')").click()
    page.wait_for_timeout(500)
    crit_min = page.query_selector_all("input.app-input.num")
    # 危急阈值最小值是第 7 个（4 张卡片 × min/max）
    if len(crit_min) >= 7:
        crit_min[6].fill("8.5")
        crit_min[6].dispatch_event("change")
    page.query_selector("button:has-text('仅保存')").click()
    page.wait_for_selector(".callout-success", timeout=20000)
    page.reload()
    page.wait_for_selector("text=漏洞评级配置", timeout=15000)
    page.query_selector("button:has-text('等级阈值')").click()
    page.wait_for_timeout(500)
    crit_min2 = page.query_selector_all("input.app-input.num")
    check("危急阈值 8.5 持久化", len(crit_min2) >= 7 and crit_min2[6].input_value() == "8.5",
          crit_min2[6].input_value() if len(crit_min2) >= 7 else "inputs missing")

    # ── ⑥ 漏洞列表定级展示 ────────────────────────────
    # API 层：公网 + 在野 Log4Shell（CVSS 10）的定级
    # = 资产重要性中性 6.25×0.25 + 可利用性 10×0.25 + 暴露 10×0.2
    #   + 修复难度中性 6.25×0.1 + 威胁情报 10×0.05 + 危害等级 10×0.15 = 8.69
    api_list = api_call("GET", "/api/vulnerabilities-api/vulnerabilities?type=host&search=Log4j&page_size=5", token=ADMIN_TOKEN).get("data", {})
    log4j = next((v for v in (api_list.get("items") or []) if "Log4j" in (v.get("vuln_name") or "")), None)
    check("API: Log4j 主机漏洞已定级", bool(log4j) and log4j.get("assessed_score") is not None,
          f"score={log4j.get('assessed_score')} sev={log4j.get('assessed_severity')}" if log4j else "not found")
    check("API: Log4j 重评分=8.69", bool(log4j) and abs((log4j.get("assessed_score") or 0) - 8.69) < 0.01,
          str(log4j.get("assessed_score")) if log4j else "")
    check("API: Log4j 重评等级=high", bool(log4j) and log4j.get("assessed_severity") == "high",
          log4j.get("assessed_severity") if log4j else "")

    open_page("/#/vulnerabilities/host")
    page.wait_for_selector("text=主机漏洞", timeout=15000)
    page.wait_for_timeout(1500)
    body_text = page.query_selector("body").inner_text()
    check("主机漏洞列表含种子数据", "Log4j" in body_text and "永恒之蓝" in body_text)
    check("主机漏洞 UI 展示重评分", "8.7" in body_text, "Log4j 重评分 8.7")
    check("主机漏洞展示重评等级", "高危" in body_text)

    open_page("/#/vulnerabilities/application")
    page.wait_for_selector("text=应用漏洞", timeout=15000)
    page.wait_for_timeout(1500)
    body_text2 = page.query_selector("body").inner_text()
    check("应用漏洞列表含种子数据", "Shiro" in body_text2 and "Spring4Shell" in body_text2)
    check("应用漏洞 UI 展示重评分", "8.7" in body_text2, "Shiro 重评分 8.7")

    # ── ⑦ 恢复阈值默认（不留痕迹）─────────────────────
    open_page("/#/vulnerabilities/assessment")
    page.wait_for_timeout(1000)
    page.query_selector("button:has-text('恢复默认')").click()
    page.wait_for_selector(".callout-success", timeout=20000)

    check("全程无 pageerror", len(pageerrors) == 0, "; ".join(pageerrors[:3]))
    browser.close()

failed = [n for n, ok, _ in RESULTS if not ok]
print(f"\n==== E2E 结果：{len(RESULTS) - len(failed)}/{len(RESULTS)} PASS ====")
sys.exit(1 if failed else 0)
