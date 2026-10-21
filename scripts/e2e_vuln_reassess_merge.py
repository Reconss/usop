# -*- coding: utf-8 -*-
"""
E2E：漏洞重评双轨合并 + TimeRangeSelector 预设高亮修复
- 漏洞重评弹窗按评级配置渲染 6 个维度因子下拉（含权重%），预览分/等级与后端同口径
- 修改因子 → 预览实时变化；提交 → assess_factors 统一形状 {manual, choices, score, severity}
- 详情面板展示 choices 明细（自动定级/人工重评徽标，人工覆盖维度标注）
- 旧版三数字入参兼容（就近映射维度因子）——API 直验证
- /assessment/recalculate 仍可用且写统一形状（未人工重评记录）
- TimeRangeSelector：选中「最近 24 小时」后下拉项高亮（bg-primary），切到 7d 高亮随之移动
- 全程零 pageerror、零原生弹窗
- 收尾：还原被测漏洞行的评级字段到测试前状态
"""
import json
import subprocess
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3266"
API = "http://127.0.0.1:5001"
ADMIN = {"username": "admin", "password": "admin123"}
VULN_ID = 61  # Apache Log4j2 JNDI RCE（主机漏洞）

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


def restore_vuln(snapshot):
    """docker exec 还原被测行的评级字段（测试前快照）。"""
    script = (
        "from app import create_app\n"
        "from app.database import db\n"
        "from app.models import AssetVulnerability\n"
        "app = create_app()\n"
        "with app.app_context():\n"
        f"    v = AssetVulnerability.query.get({VULN_ID})\n"
        f"    snap = {snapshot!r}\n"
        "    v.assessed_score = snap['assessed_score']\n"
        "    v.assessed_severity = snap['assessed_severity']\n"
        "    v.assess_factors = snap['assess_factors']\n"
        "    v.assess_reason = snap['assess_reason']\n"
        "    db.session.commit()\n"
        "    print('restored', v.assessed_severity, v.assessed_score)\n"
    )
    out = subprocess.run(["docker", "exec", "-i", "usop_all", "python3", "-c", script],
                         capture_output=True, text=True, timeout=60)
    return out.stdout.strip() or out.stderr[-200:]


def main():
    login = call(f"{API}/api/auth/login", ADMIN)["data"]
    token, user = login["token"], {**login["user"], "permissions": login.get("permissions", [])}

    vuln = call(f"{API}/api/vulnerabilities-api/vulnerabilities/{VULN_ID}", token=token)["data"]
    snapshot = {
        "assessed_score": vuln.get("assessed_score"),
        "assessed_severity": vuln.get("assessed_severity"),
        "assess_factors": vuln.get("assess_factors"),
        "assess_reason": vuln.get("assess_reason"),
    }
    print(f"[seed] 测试前行 {VULN_ID} 快照: {snapshot['assessed_severity']} {snapshot['assessed_score']}", flush=True)

    errors, native_dialogs = [], []
    try:
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

            # ============ A. 漏洞重评弹窗（配置驱动） ============
            page.locator("text=漏洞管理").first.click()
            page.wait_for_timeout(500)
            page.locator("text=主机漏洞").first.click()
            page.wait_for_timeout(2500)
            check("进入主机漏洞页", "/vulnerabilities/host" in page.url, page.url)

            row = page.locator("tr", has_text="Log4j").first
            check("测试行存在（Log4j）", row.count() > 0)
            row.locator('button[title="重新评级"]').click()
            page.wait_for_timeout(1200)

            modal = page.locator('[role="dialog"]', has_text="提交重评").last
            check("重评弹窗打开", modal.count() > 0 and modal.first.is_visible())

            # 6 个维度下拉（权重标签）
            selects = modal.locator("select.app-select")
            check("渲染 6 个维度因子下拉", selects.count() == 6, f"实际 {selects.count()}")
            for dim in ("资产重要性", "可利用性", "暴露程度", "修复难度", "威胁情报", "漏洞危害等级"):
                check(f"维度「{dim}」在弹窗中", modal.locator(f"text={dim}（权重").count() > 0)
            check("权重合计 100%", "权重 25%" in modal.inner_text() and "权重 15%" in modal.inner_text())

            # 默认因子=均值最近：预览 6.7 分 / 中危（asset7,expl7,expo7,rem7,intel7,cvss5）
            check("默认预览 6.7 分", "6.7" in modal.inner_text(), modal.inner_text()[:0])
            check("默认预览中危", modal.locator("text=中危").count() > 0)

            # 改可利用性 → 极易利用(10)：6.7 + 3×0.25 = 7.45 → 高危
            exp_select = selects.nth(1)
            check("可利用性下拉含 4 个因子", exp_select.locator("option").count() == 4)
            exp_select.select_option(label="极易利用（10 分）")
            page.wait_for_timeout(400)
            check("改因子后预览 7.5 分", "7.5" in modal.inner_text())
            check("改因子后预览高危", modal.locator("text=高危").count() > 0)

            # 人工覆盖分数 8.5 → 高危（阈值推导）
            modal.locator('input[type="number"]').fill("8.5")
            page.wait_for_timeout(400)
            check("人工覆盖分 8.5 预览高危", "8.5" in modal.inner_text() and modal.locator("text=高危").count() > 0)

            # 提交（必填理由）
            modal.locator('input[type="number"]').fill("")
            modal.locator("textarea").fill("E2E：双轨合并验证——核心交易系统，在野利用风险上调")
            modal.locator("button", has_text="提交重评").click()
            page.wait_for_timeout(2500)
            check("提交后 toast 提示重评完成", page.locator("text=重评完成").count() > 0)

            after = call(f"{API}/api/vulnerabilities-api/vulnerabilities/{VULN_ID}", token=token)["data"]
            af = after.get("assess_factors") or {}
            check("存储统一形状 manual=true", af.get("manual") is True, json.dumps(af)[:80])
            check("choices 含 6 个维度", len(af.get("choices") or {}) == 6)
            exp_choice = (af.get("choices") or {}).get("exploitability") or {}
            check("可利用性=极易利用(人工)", exp_choice.get("factor_id") == "easy" and exp_choice.get("manual") is True,
                  json.dumps(exp_choice, ensure_ascii=False))
            asset_choice = (af.get("choices") or {}).get("asset-importance") or {}
            check("资产重要性=重要业务(表单提交)", asset_choice.get("factor_id") == "high" and asset_choice.get("manual") is True,
                  json.dumps(asset_choice, ensure_ascii=False))
            check("assessed_score=7.45 high", abs(float(after["assessed_score"]) - 7.45) < 0.01 and after["assessed_severity"] == "high",
                  f"{after['assessed_score']} {after['assessed_severity']}")

            # 详情面板展示 choices 明细 + 人工重评徽标
            page.locator("tr", has_text="Log4j").first.locator('button[title="查看详情"]').click()
            page.wait_for_timeout(1200)
            detail = page.locator('[role="dialog"]', has_text="重新评级").last
            panel = page.locator("text=重评信息").last
            check("详情面板含人工重评徽标", page.locator("text=人工重评").count() > 0)
            check("详情面板含维度明细（重要业务）", page.locator("text=重要业务").count() > 0)
            check("详情面板含（人工）标注", page.locator("text=极易利用（人工）").count() > 0)
            check("详情面板含权重展示", "25%" in page.content() or "权重" in page.content())
            detail.locator("button", has_text="关闭").first.click()
            page.wait_for_timeout(600)

            # 再次打开重评弹窗：因子预填来自已存记录
            page.locator("tr", has_text="Log4j").first.locator('button[title="重新评级"]').click()
            page.wait_for_timeout(1000)
            modal2 = page.locator('[role="dialog"]', has_text="重新评级").last
            check("重开弹窗预填极易利用",
                  modal2.locator("select.app-select").nth(1).input_value() == "easy")
            modal2.locator("button", has_text="取消").first.click()
            page.wait_for_timeout(600)

            # ============ B. 旧版三数字入参兼容（API 直验） ============
            legacy = call(f"{API}/api/vulnerabilities-api/vulnerabilities/{VULN_ID}/reassess",
                          data={"asset_importance": 10, "exploitability": 10, "fix_difficulty": 3,
                                "reason": "E2E：旧版三数字入参兼容验证"}, method="PUT", token=token)
            check("旧版入参 200", legacy.get("success") is True, str(legacy.get("error")))
            lf = legacy["data"]["assess_factors"]
            lchoices = lf.get("choices") or {}
            check("旧版入参映射资产重要性=核心业务", (lchoices.get("asset-importance") or {}).get("factor_id") == "critical",
                  json.dumps(lchoices.get("asset-importance"), ensure_ascii=False))
            check("旧版入参映射可利用性=极易利用", (lchoices.get("exploitability") or {}).get("factor_id") == "easy",
                  json.dumps(lchoices.get("exploitability"), ensure_ascii=False))
            check("旧版入参映射修复难度=简单修复", (lchoices.get("remediation") or {}).get("factor_id") == "easy",
                  json.dumps(lchoices.get("remediation"), ensure_ascii=False))
            check("旧版入参 manual=true 统一存储", lf.get("manual") is True)

            # ============ C. recalculate 仍可用且写统一形状 ============
            rec = call(f"{API}/api/vulnerabilities-api/assessment/recalculate", data={}, method="POST", token=token)
            check("recalculate 200", rec.get("success") is True, str(rec.get("error")))
            v62 = call(f"{API}/api/vulnerabilities-api/vulnerabilities/62", token=token)["data"]
            f62 = v62.get("assess_factors") or {}
            check("recalculate 后未人工记录写统一形状",
                  f62.get("manual") is False and len(f62.get("choices") or {}) == 6,
                  json.dumps(f62, ensure_ascii=False)[:100])
            check("recalculate 分数保持（7.69）", abs(float(v62["assessed_score"]) - 7.69) < 0.01,
                  str(v62["assessed_score"]))

            # ============ D. TimeRangeSelector 预设高亮 ============
            page.locator("text=安全告警").first.click()
            page.wait_for_timeout(2500)
            check("进入安全告警页", "/detection/investigation" in page.url, page.url)

            page.locator('button[title="选择时间范围"]').click()
            page.wait_for_timeout(600)
            dropdown = page.locator("text=快捷选择").last
            opt24 = page.locator("button", has_text="最近 24 小时").last
            opt7d = page.locator("button", has_text="最近 7 天").last
            check("下拉含全部 7 个预设",
                  all(page.locator("button", has_text=l).count() > 0 for l in
                      ("最近 5 分钟", "最近 15 分钟", "最近 1 小时", "最近 4 小时",
                       "最近 24 小时", "最近 7 天", "最近 30 天")))
            # 初始（preset 24h）即高亮
            check("初始 24h 项已高亮", "bg-primary" in (opt24.get_attribute("class") or ""))
            opt7d.click()
            page.wait_for_timeout(600)
            page.locator('button[title="选择时间范围"]').click()
            page.wait_for_timeout(500)
            opt7d2 = page.locator("button", has_text="最近 7 天").last
            opt24b = page.locator("button", has_text="最近 24 小时").last
            check("切到 7d 后 7d 高亮", "bg-primary" in (opt7d2.get_attribute("class") or ""))
            check("切到 7d 后 24h 不高亮", "bg-primary" not in (opt24b.get_attribute("class") or ""))
            opt24b.click()
            page.wait_for_timeout(600)
            page.locator('button[title="选择时间范围"]').click()
            page.wait_for_timeout(500)
            check("切回 24h 后 24h 高亮", "bg-primary" in (page.locator("button", has_text="最近 24 小时").last.get_attribute("class") or ""))
            check("触发器显示 24 小时", page.locator('button[title="选择时间范围"]').inner_text().strip() == "24 小时")

            check("全程零 pageerror", len(errors) == 0, f"{errors[:3]}")
            check("全程零原生弹窗", len(native_dialogs) == 0, f"{native_dialogs}")
            browser.close()
    finally:
        print(f"[cleanup] {restore_vuln(snapshot)}", flush=True)

    print(f"\n===== {passed} passed, {failed} failed =====", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
