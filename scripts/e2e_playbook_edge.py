# -*- coding: utf-8 -*-
"""
E2E：剧本画布连线交互修复验证
背景：连线原为两步点击式，且 port 的 mousedown 冒泡触发节点拖拽——
用户按标准手势「按住端口拖线到目标」会把节点拖跑、连不上（「无法连线」）。
修复：拖拽式连线（预览虚线 + 松手落点完成）+ 保留点击式 + 重复/取消提示。
"""
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3266"
PB_ID = 36  # 恶意IP防火墙封禁（模拟器联动）
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


GEOM_JS = """() => {
  const nodes = [...document.querySelectorAll("div[data-node-id]")];
  const n3 = nodes.find(n => n.innerText.includes('防火墙回执判定'));
  const n9 = nodes.find(n => n.innerText.includes('未达高风险'));
  const r3 = n3.getBoundingClientRect(), r9 = n9.getBoundingClientRect();
  const port = [...n3.children].find(c => c.className.includes('right-0'));
  const rp = port.getBoundingClientRect();
  return {
    port: { x: rp.x + rp.width / 2, y: rp.y + rp.height / 2 },
    n3: { left: n3.style.left, top: n3.style.top },
    n9: { x: r9.x + r9.width / 2, y: r9.y + r9.height / 2 },
  };
}"""

N3_POS_JS = """() => {
  const n3 = [...document.querySelectorAll("div[data-node-id]")].find(n => n.innerText.includes('防火墙回执判定'));
  return { left: n3.style.left, top: n3.style.top };
}"""


def main():
    login = call(f"{BASE}/api/auth/login", ADMIN)["data"]
    token, user = login["token"], {**login["user"], "permissions": login.get("permissions", [])}

    # 快照原始节点（用于结尾还原；用例中真的落库一次验证持久化，再还原）
    orig = call(f"{BASE}/api/playbooks-api/playbooks/{PB_ID}", token=token)["data"]
    orig_nodes = orig["nodes"]

    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context(viewport={"width": 1680, "height": 1100}).new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(BASE + "/")
        page.evaluate(
            "([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); }",
            [token, json.dumps(user)])
        page.goto(BASE + "/")
        page.reload()
        page.wait_for_selector("text=统一安全运营平台", timeout=30000)
        page.wait_for_timeout(1200)

        page.goto(BASE + "/#/response/playbooks")
        page.wait_for_timeout(2500)
        page.locator(
            "xpath=//*[contains(text(),'恶意IP防火墙封禁')]/ancestor::div[.//button[contains(text(),'编辑')]][1]//button[contains(text(),'编辑')]"
        ).first.click()
        page.wait_for_timeout(2500)

        geom = page.evaluate(GEOM_JS)
        check("画布节点就绪（data-node-id）", bool(geom.get("port")), str(geom.get("port")))

        # ============ ① 拖拽连线（用户原操作手势） ============
        print("\n== ① 拖拽连线 ==", flush=True)
        page.mouse.move(geom["port"]["x"], geom["port"]["y"])
        page.mouse.down()
        page.mouse.move(geom["port"]["x"] + 80, geom["port"]["y"] - 40, steps=6)
        page.wait_for_timeout(300)
        check("拖拽中出现「松开鼠标完成连线」提示",
              page.locator("text=松开鼠标完成连线").count() > 0)
        preview_count = page.evaluate(
            """() => [...document.querySelectorAll("svg path")]
                 .filter(p => p.getAttribute("stroke-dasharray") === "5,3" && p.getAttribute("opacity") === "0.85").length""")
        check("拖拽中渲染预览虚线", preview_count == 1, f"count={preview_count}")
        page.mouse.move(geom["n9"]["x"], geom["n9"]["y"], steps=8)
        page.mouse.up()
        page.wait_for_timeout(1000)
        n3_after = page.evaluate(N3_POS_JS)
        check("源节点未被拖动（bug 修复核心）", n3_after == geom["n3"],
              f"{geom['n3']} -> {n3_after}")
        check("完成后「连线已创建」反馈", page.locator("text=连线已创建").count() > 0)
        check("拖拽提示消失", page.locator("text=松开鼠标完成连线").count() == 0)
        edges_now = page.locator("svg path[stroke-dasharray='6,3']").count()
        check("新连线已绘制", edges_now == 9, f"edges={edges_now}")

        # ============ ② 重复连线提示 ============
        print("\n== ② 重复连线 ==", flush=True)
        page.mouse.click(geom["port"]["x"], geom["port"]["y"])
        page.wait_for_timeout(400)
        check("点击 port 进入连线模式（点击式兼容）",
              page.locator("text=点击目标节点完成连线").count() > 0)
        page.mouse.click(geom["n9"]["x"], geom["n9"]["y"])
        page.wait_for_timeout(800)
        check("重复连线提示「该连线已存在」而非静默",
              page.locator("text=该连线已存在").count() > 0)

        # ============ ③ 拖到空白处取消 ============
        print("\n== ③ 拖到空白取消 ==", flush=True)
        page.mouse.move(geom["port"]["x"], geom["port"]["y"])
        page.mouse.down()
        page.mouse.move(geom["port"]["x"] + 200, geom["port"]["y"] + 260, steps=8)
        page.mouse.up()
        page.wait_for_timeout(600)
        check("拖到空白处后无新连线", page.locator("svg path[stroke-dasharray='6,3']").count() == 9)
        n3_after2 = page.evaluate(N3_POS_JS)
        check("取消后节点仍在原位", n3_after2 == geom["n3"])
        page.mouse.click(700, 700)  # 点画布空白收尾（取消可能残留的点击态）

        # ============ ④ Esc 取消 ============
        print("\n== ④ Esc 取消 ==", flush=True)
        page.mouse.move(geom["port"]["x"], geom["port"]["y"])
        page.mouse.down()
        page.mouse.move(geom["port"]["x"] + 60, geom["port"]["y"] + 30, steps=4)
        page.keyboard.press("Escape")
        page.mouse.up()
        page.wait_for_timeout(500)
        check("Esc 取消后无新连线", page.locator("svg path[stroke-dasharray='6,3']").count() == 9)

        # ============ ⑤ 落库 + 刷新持久化 ============
        print("\n== ⑤ 保存与刷新 ==", flush=True)
        page.locator("button:has-text('保存')").first.click()
        page.wait_for_timeout(2500)
        saved = call(f"{BASE}/api/playbooks-api/playbooks/{PB_ID}", token=token)["data"]
        n3_outputs = next((n["outputs"] for n in saved["nodes"] if n["id"] == "n3"), None)
        check("保存后 n3 outputs 含 n9", n3_outputs and "n9" in n3_outputs, str(n3_outputs))
        page.reload()
        page.wait_for_selector("text=恶意IP防火墙封禁", timeout=15000)
        page.wait_for_timeout(1500)
        page.locator(
            "xpath=//*[contains(text(),'恶意IP防火墙封禁')]/ancestor::div[.//button[contains(text(),'编辑')]][1]//button[contains(text(),'编辑')]"
        ).first.click()
        page.wait_for_timeout(2500)
        check("刷新重开后连线仍在", page.locator("svg path[stroke-dasharray='6,3']").count() == 9)

        check("全程零 pageerror", not errors, "; ".join(errors[:3]))
        browser.close()

    # 还原后端
    call(f"{BASE}/api/playbooks-api/playbooks/{PB_ID}", {"nodes": orig_nodes}, method="PUT", token=token)
    restored = call(f"{BASE}/api/playbooks-api/playbooks/{PB_ID}", token=token)["data"]
    n3_back = next((n["outputs"] for n in restored["nodes"] if n["id"] == "n3"), None)
    check("后端节点已还原", n3_back == ["n4", "n6"], str(n3_back))

    print(f"\n===== RESULT: {passed} PASS / {failed} FAIL =====", flush=True)
    return failed == 0


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
