"""告警处理状态显示 E2E：status:"resolved" 必须显示「已解决」而非「已关闭」

背景：前端两处映射 bug——SecurityAlerts.tsx statusConfig 与 MessageTable.tsx
STATUS_META 都把 resolved 当成 closed 显示；acknowledged/open 无条目被
fallback 成「新告警」或英文原文。

样本告警多为历史数据（超出默认 24h 窗口），故本脚本向 ES 注入 24h 内的
测试告警（直接指定 status，模拟平台流转后的终态），验证后清理。

验证点：
① resolved 告警详情抽屉「处理状态」= 「已解决」（非「已关闭」）
② resolved 告警列表行徽章 = 「已解决」
③ closed 告警详情仍 = 「已关闭」（不回归）
④ acknowledged 告警 = 「已确认」（不再显示英文/误报新告警）
⑤ false_positive 告警 = 「误报」（不回归）
⑥ 全程无 pageerror
"""
import json
import urllib.request
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3266"
ES = "http://localhost:9200/alerts-valid"
RESULTS = []
SAMPLE_IDS = []


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


def es_get_template():
    """取一条现有告警作模板"""
    req = urllib.request.Request(
        f"{ES}/_search?size=1",
        data=json.dumps({"query": {"match_all": {}}}).encode(),
        headers={"Content-Type": "application/json"},
    )
    return json.load(urllib.request.urlopen(req))["hits"]["hits"][0]["_source"]


def es_inject_status_sample(alert_id, status, template):
    """注入一条 24h 内、指定 status 的测试告警"""
    src = dict(template)
    now = datetime.now(timezone.utc).isoformat()
    src["alert_id"] = alert_id
    src["status"] = status
    src["title"] = f"E2E状态验证-{status}"
    src["created_at"] = now
    src["updated_at"] = now
    src["first_seen"] = now
    src["last_seen"] = now
    req = urllib.request.Request(
        f"{ES}/_doc/{alert_id}?refresh=true",
        data=json.dumps(src).encode(),
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    urllib.request.urlopen(req)
    SAMPLE_IDS.append(alert_id)


def es_cleanup():
    for aid in SAMPLE_IDS:
        req = urllib.request.Request(f"{ES}/_doc/{aid}", method="DELETE")
        urllib.request.urlopen(req)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1680, "height": 1100})
    page = ctx.new_page()
    pageerrors = []
    page.on("pageerror", lambda e: pageerrors.append(str(e)))

    token, user = login_via_api("admin", "admin123")

    template = es_get_template()
    es_inject_status_sample("E2E-STATUS-resolved", "resolved", template)
    es_inject_status_sample("E2E-STATUS-closed", "closed", template)
    es_inject_status_sample("E2E-STATUS-acknowledged", "acknowledged", template)
    es_inject_status_sample("E2E-STATUS-false_positive", "false_positive", template)

    def open_page(hash_path):
        page.goto(BASE + "/")
        page.evaluate(
            "([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); }",
            [token, json.dumps(user)])
        page.goto(BASE + "/")
        page.reload()
        page.wait_for_selector("text=统一安全运营平台", timeout=30000)
        page.wait_for_timeout(1200)
        page.goto(BASE + hash_path)
        page.wait_for_timeout(2500)

    def search_and_open_first(alert_id):
        """搜索 alert_id 并点第一行打开详情抽屉"""
        box = page.query_selector("input[placeholder^='搜索告警']")
        box.fill(f'alert_id:"{alert_id}"')
        box.press("Enter")
        page.wait_for_timeout(2500)
        row = page.query_selector("tbody tr")
        if row is None or "E2E状态验证" not in row.inner_text():
            return None
        row_text = row.inner_text()
        row.click()
        page.wait_for_selector("xpath=//div[contains(text(),'处理状态')]", timeout=15000)
        page.wait_for_timeout(600)
        return row_text

    def drawer_status_text():
        """详情抽屉「处理状态」的值节点文本"""
        el = page.query_selector("xpath=//div[contains(text(),'处理状态')]/following-sibling::div[1]")
        return (el.inner_text() if el else "")

    def close_drawer():
        page.query_selector(".overlay").click(position={"x": 10, "y": 10})
        page.wait_for_timeout(600)

    try:
        open_page("/#/detection/investigation")
        page.wait_for_selector("input[placeholder^='搜索告警']", timeout=20000)

        # ── 用例①②：resolved 显示「已解决」 ────────────────
        row_text = search_and_open_first("E2E-STATUS-resolved")
        check("resolved 告警可搜索到并打开详情", row_text is not None)
        if row_text is not None:
            st = drawer_status_text()
            check("详情「处理状态」显示已解决", "已解决" in st, f"got={st!r}")
            check("详情「处理状态」不再显示已关闭", "已关闭" not in st, f"got={st!r}")
            check("列表行徽章显示已解决", "已解决" in row_text, row_text[:70].replace("\n", " "))
            check("列表行徽章不再显示已关闭", "已关闭" not in row_text, row_text[:70].replace("\n", " "))
            close_drawer()

        # ── 用例③：closed 不回归 ───────────────────────────
        row_text = search_and_open_first("E2E-STATUS-closed")
        check("closed 告警可搜索到并打开详情", row_text is not None)
        if row_text is not None:
            st = drawer_status_text()
            check("详情「处理状态」显示已关闭（不回归）", "已关闭" in st, f"got={st!r}")
            close_drawer()

        # ── 用例④：acknowledged 显示「已确认」 ─────────────
        row_text = search_and_open_first("E2E-STATUS-acknowledged")
        check("acknowledged 告警可搜索到并打开详情", row_text is not None)
        if row_text is not None:
            st = drawer_status_text()
            check("详情「处理状态」显示已确认", "已确认" in st, f"got={st!r}")
            check("acknowledged 不再显示英文原文", "acknowledged" not in st, f"got={st!r}")
            check("列表行徽章显示已确认", "已确认" in row_text, row_text[:70].replace("\n", " "))
            close_drawer()

        # ── 用例⑤：false_positive 不回归 ──────────────────
        row_text = search_and_open_first("E2E-STATUS-false_positive")
        check("false_positive 告警可搜索到并打开详情", row_text is not None)
        if row_text is not None:
            st = drawer_status_text()
            check("详情「处理状态」显示误报（不回归）", "误报" in st, f"got={st!r}")
            close_drawer()

        # ── 用例⑥：零 pageerror ───────────────────────────
        check("全程无 pageerror", len(pageerrors) == 0, "; ".join(pageerrors[:3]))
    finally:
        browser.close()
        es_cleanup()

failed = [r for r in RESULTS if not r[1]]
print(f"\n===== {len(RESULTS) - len(failed)}/{len(RESULTS)} PASS =====")
for name, ok, detail in failed:
    print(f"FAIL  {name}  {detail}")
raise SystemExit(1 if failed else 0)
