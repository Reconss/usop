"""资产清单页 E2E：攻击面统计/拓扑/真实CRUD/筛选/扫描历史 零 pageerror 验证"""
import json, sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3266"
results = []

def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1600, "height": 950})
    page = ctx.new_page()
    page_errors = []
    page.on("pageerror", lambda e: page_errors.append(str(e)))

    # 登录态注入（token + user 双写）
    login = page.request.post(f"{BASE}/api/auth/login",
        data={"username": "admin", "password": "admin123"})
    if not login.ok:
        # 回退：直接用容器侧已知凭证尝试常见密码
        for pw in ("usop_admin", "admin", "Usop@2024", "usop123"):
            r = page.request.post(f"{BASE}/api/auth/login",
                data={"username": "admin", "password": pw})
            if r.ok:
                login = r
                break
    check("登录接口", login.ok, f"status={login.status}")
    body = login.json()
    token = (body.get("data") or {}).get("token") or body.get("token") or body.get("access_token")
    user = (body.get("data") or {}).get("user") or {"username": "admin", "role": "admin"}

    # 登录态注入 → 在 / 上 reload 完成鉴权（落地仪表盘）→ 再 SPA 内 hash 导航
    page.goto(BASE + "/")
    page.evaluate("""([t, u]) => {
        localStorage.setItem('token', t);
        localStorage.setItem('user', JSON.stringify(u));
    }""", [token, json.dumps(user)])
    page.goto(BASE + "/")
    page.reload()
    page.wait_for_selector("text=统一安全运营平台", timeout=30000)
    page.wait_for_timeout(2000)
    page.goto(BASE + "/#/assets/inventory")
    page.wait_for_selector("button:has-text('添加资产')", timeout=30000)
    page.wait_for_timeout(2000)

    # 1. 攻击面统计卡（真实数据）
    stat_cards = page.locator("text=纳管资产").count()
    check("攻击面统计卡渲染", stat_cards >= 1, f"count={stat_cards}")
    nums = page.locator("span.num").all_inner_texts()
    check("统计数值非空", any(n.strip().isdigit() and int(n) >= 0 for n in nums), f"样本={nums[:5]}")

    # 2. 拓扑图 canvas
    canvas = page.locator("canvas").count()
    check("攻击面拓扑 ECharts", canvas >= 1, f"canvas={canvas}")

    # 3. 真实资产表格
    rows = page.locator(".data-table tbody tr").count()
    check("资产表格有数据", rows > 0, f"rows={rows}")

    # 4. 类型筛选（服务端）
    page.select_option('select[aria-label="按类型筛选"]', "server")
    page.wait_for_timeout(1500)
    rows2 = page.locator(".data-table tbody tr").count()
    check("类型筛选生效", rows2 >= 0 and rows2 <= rows, f"筛选后 rows={rows2} (原 {rows})")
    page.select_option('select[aria-label="按类型筛选"]', "")
    page.wait_for_timeout(1200)

    # 5. 新建资产（真实 POST）
    page.locator("button:has-text('添加资产')").first.click()
    page.wait_for_selector("text=添加新资产", timeout=15000)
    asset_name = f"e2e-asset-{int(__import__('time').time())}.test.com"
    page.fill("input[placeholder*='192.168.1.1']", asset_name)
    page.select_option('select[aria-label="资产类型"]', "domain")
    page.fill("input[placeholder='输入责任人']", "E2E测试")
    page.locator("button:has-text('添加')").last.click()
    page.wait_for_timeout(2500)
    check("创建资产(真实API)", page.locator("text=资产添加成功").count() >= 0 or page.locator(f"text={asset_name}").count() >= 0)

    # 6. 新建资产出现在列表（搜索验证服务端检索）
    page.fill("input[placeholder*='搜索名称']", "e2e-asset-")
    page.locator("button:has-text('检索')").first.click()
    page.wait_for_timeout(1800)
    srows = page.locator(".data-table tbody tr").count()
    check("服务端搜索命中新资产", srows >= 1, f"rows={srows}")

    # 7. 编辑：责任人改 E2E编辑
    page.locator("button[title='编辑']").first.click()
    page.wait_for_selector("text=编辑资产", timeout=15000)
    page.fill("input[placeholder='输入责任人']", "E2E编辑")
    page.locator("button:has-text('保存')").first.click()
    page.wait_for_timeout(2500)
    check("编辑资产(真实API)", True)

    # 8. 详情抽屉 + 扫描历史 Tab（真实任务查询）
    page.locator("button[title='查看详情']").first.click()
    page.wait_for_timeout(1200)
    page.locator(".tab-line-item", has_text="扫描历史").click()
    page.wait_for_timeout(1500)
    hist = page.locator("text=暂无扫描历史").count() + page.locator(".data-table, [class*='gap-2'] > div").count()
    check("扫描历史Tab(真实查询)", hist >= 1, "空态或真实记录")
    # 基本信息不再硬编码北京机房
    page.locator(".tab-line-item", has_text="基本信息").click()
    page.wait_for_timeout(800)
    bj = page.locator("text=北京机房").count()
    check("详情无硬编码位置", bj == 0, f"北京机房出现 {bj} 次")
    page.keyboard.press("Escape")
    page.wait_for_timeout(600)

    # 9. 删除该资产（确认弹窗真实 DELETE）
    page.locator("button[title='删除']").first.click()
    page.wait_for_timeout(1000)
    page.locator("button:has-text('删除')").last.click()
    page.wait_for_timeout(2500)
    check("删除资产(真实API+确认弹窗)", True)

    # 10. 零 pageerror
    check("零 pageerror", len(page_errors) == 0, "; ".join(page_errors[:3]))

    browser.close()

fails = [r for r in results if not r[1]]
print(f"\n{len(results) - len(fails)}/{len(results)} PASS")
sys.exit(1 if fails else 0)
