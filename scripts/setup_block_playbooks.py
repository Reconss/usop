#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
USOP · 封禁剧本部署脚本（对接封禁设备模拟器）
=============================================

创建/更新两个**联动封禁设备模拟器**的剧本，打通「剧本 → 设备 → 回执 → 分支处置」闭环：

  剧本 A  恶意IP防火墙封禁（模拟器联动）
          trigger → HTTP 下发防火墙封禁 → 条件判定设备回执
                  → 成功：登记平台封堵名单 + 通知
                  → 失败：通知人工介入

  剧本 B  失陷主机隔离（模拟器联动）
          trigger → HTTP 下发主机隔离 → 条件判定设备回执
                  → 成功：登记平台隔离 + 通知
                  → 失败：通知人工介入

依赖
----
  pip install requests
  平台需先启动封禁模拟器：python scripts/device_block_simulator.py

用法
----
  python setup_block_playbooks.py                       # 创建/更新（幂等）
  python setup_block_playbooks.py --simulator-url http://host.docker.internal:8800
  python setup_block_playbooks.py --dry-run             # 只打印剧本 JSON

地址说明
--------
剧本由**平台后端容器内**的引擎执行，因此模拟器地址不能写 127.0.0.1
（那会指向容器自身）。容器内访问宿主机用 host.docker.internal（默认）。
"""

import argparse
import json
import sys

import requests

API_BASE = "http://localhost:5001"
PB_API = f"{API_BASE}/api/playbooks-api"
DEFAULT_SIM = "http://host.docker.internal:8800"
DEFAULT_TOKEN = "usop-sim-token"


# ---------------------------------------------------------------------------
# 剧本定义
# ---------------------------------------------------------------------------

def _node(nid, type_id, name, config, x, y, outputs=None):
    """节点工厂：同时写 type 与 typeId，兼容引擎的两种读取路径。

    引擎 `_normalize_node` 在同时存在 type/typeId 时以 typeId 为准；
    `_find_start_nodes` 直接读 type —— 两者都写可保证不同版本数据都能匹配。
    """
    return {
        "id": nid,
        "type": type_id,
        "typeId": type_id,
        "name": name,
        "config": config,
        "position": {"x": x, "y": y},
        "outputs": outputs or [],
    }


def _edges(pairs):
    return [{"id": f"e_{a}_{b}", "source": a, "target": b} for a, b in pairs]


def firewall_playbook(sim: str, token: str):
    """剧本 A：恶意 IP 防火墙封禁。"""
    nodes = [
        _node("n1", "trigger", "告警事件触发", {
            "triggerType": "告警事件",
            "inputs": [
                {"key": "src_ip", "label": "攻击源 IP", "type": "ip", "required": True,
                 "placeholder": "留空自动取事件/告警的源 IP"},
                {"key": "reason", "label": "封禁原因", "type": "text", "required": False,
                 "placeholder": "留空自动取事件描述"},
            ],
        }, 40, 160, ["n2"]),
        _node("n2", "http_request", "下发防火墙封禁指令", {
            "url": f"{sim}/api/v1/firewall/block",
            "method": "POST",
            "timeout": 15,
            "headers": {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
            # 请求体为 JSON 字符串，值支持 {{ }} 表达式（引擎先渲染再序列化）
            "body": json.dumps({
                "ip": "{{ $json.src_ip }}",
                "action": "deny",
                "direction": "inbound",
                "duration": "24h",
                "reason": "{{ $json.reason }}",
                "operator": "usop-playbook",
                "ticket_id": "{{ $json.event_code }}",
            }, ensure_ascii=False),
            # 关键：按设备响应体的 success 字段判定业务成败
            # （模拟器对「IP 已在黑名单」等业务失败也返回 HTTP 200，
            #  仅看状态码会误判为成功）
            "success_path": "success",
        }, 280, 160, ["n3"]),
        _node("n3", "condition", "防火墙回执判定", {
            "field": "http_request_ok",
            "operator": "等于",
            "value": "true",
        }, 520, 160, ["n4", "n6"]),
        _node("n4", "action", "登记平台封堵名单", {
            "action": "block_ip",
            "params": "ip = {{ $json.src_ip }}\n"
                      "reason = {{ $json.reason }}\n"
                      "duration = 24h",
        }, 760, 80, ["n5"]),
        _node("n5", "notify", "封禁成功通知", {
            "channel": "站内信",
            "title": "恶意IP已自动封禁",
            "content": "防火墙已封禁 {{ $json.src_ip }}：{{ http_request_message }}"
                       "（规则 {{ http_request_data.rule_id }}，设备 {{ http_request_data.device }}）",
        }, 1000, 80, []),
        _node("n6", "notify", "封禁失败告警", {
            "channel": "站内信",
            "title": "防火墙封禁失败，需人工介入",
            "content": "下发防火墙封禁指令未成功：{{ http_request_message }}"
                       "（目标 {{ $json.src_ip }}）请登录防火墙控制台人工处置。",
        }, 760, 260, []),
    ]
    return {
        "name": "恶意IP防火墙封禁（模拟器联动）",
        "description": "对高危攻击源 IP 自动下发防火墙封禁指令，按设备回执分流："
                       "成功登记平台封堵名单并通知，失败转人工处置。",
        "category": "封禁处置",
        "trigger_type": "告警事件",
        "status": "published",
        "enabled": True,
        "version": "1.0",
        "nodes": nodes,
        "edges": _edges([("n1", "n2"), ("n2", "n3"), ("n3", "n4"),
                         ("n3", "n6"), ("n4", "n5")]),
    }


def host_playbook(sim: str, token: str):
    """剧本 B：失陷主机隔离。"""
    nodes = [
        _node("n1", "trigger", "告警事件触发", {
            "triggerType": "告警事件",
            "inputs": [
                {"key": "hostname", "label": "主机名", "type": "text", "required": False,
                 "placeholder": "留空自动取告警主机名"},
                {"key": "src_ip", "label": "主机 IP", "type": "ip", "required": False,
                 "placeholder": "留空自动取事件/告警源 IP"},
                {"key": "reason", "label": "隔离原因", "type": "text", "required": False},
            ],
        }, 40, 160, ["n2"]),
        _node("n2", "http_request", "下发主机隔离指令", {
            "url": f"{sim}/api/v1/host/isolate",
            "method": "POST",
            "timeout": 15,
            "headers": {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
            "body": json.dumps({
                "hostname": "{{ $json.hostname }}",
                "ip": "{{ $json.src_ip }}",
                "mode": "full",
                "reason": "{{ $json.reason }}",
                "operator": "usop-playbook",
            }, ensure_ascii=False),
            "success_path": "success",
        }, 280, 160, ["n3"]),
        _node("n3", "condition", "隔离回执判定", {
            "field": "http_request_ok",
            "operator": "等于",
            "value": "true",
        }, 520, 160, ["n4", "n6"]),
        _node("n4", "action", "登记平台主机隔离", {
            "action": "quarantine_host",
            "params": "hostname = {{ $json.hostname }}\n"
                      "ip = {{ $json.src_ip }}\n"
                      "reason = {{ $json.reason }}",
        }, 760, 80, ["n5"]),
        _node("n5", "notify", "隔离成功通知", {
            "channel": "站内信",
            "title": "失陷主机已隔离",
            "content": "EDR 已隔离主机 {{ $json.hostname }}：{{ http_request_message }}"
                       "（任务 {{ http_request_data.task_id }}，Agent {{ http_request_data.agent }}）",
        }, 1000, 80, []),
        _node("n6", "notify", "隔离失败告警", {
            "channel": "站内信",
            "title": "主机隔离失败，需人工介入",
            "content": "下发主机隔离指令未成功：{{ http_request_message }}"
                       "（主机 {{ $json.hostname }}）可能是 Agent 离线，请人工核查。",
        }, 760, 260, []),
    ]
    return {
        "name": "失陷主机隔离（模拟器联动）",
        "description": "对确认失陷的主机下发 EDR 隔离指令，按回执分流："
                       "成功登记平台隔离状态并通知，失败转人工处置。",
        "category": "封禁处置",
        "trigger_type": "告警事件",
        "status": "published",
        "enabled": True,
        "version": "1.0",
        "nodes": nodes,
        "edges": _edges([("n1", "n2"), ("n2", "n3"), ("n3", "n4"),
                         ("n3", "n6"), ("n4", "n5")]),
    }


# ---------------------------------------------------------------------------
# 部署
# ---------------------------------------------------------------------------

def deploy(playbook: dict, session, dry_run=False):
    name = playbook["name"]
    if dry_run:
        print(f"[DRY-RUN] {name}")
        print(json.dumps(playbook, ensure_ascii=False, indent=2)[:1200] + "\n…")
        return None

    r = session.get(f"{PB_API}/playbooks", params={"keyword": name}, timeout=10)
    existing = None
    if r.status_code == 200:
        for p in (r.json().get("data") or {}).get("items", []) or (r.json().get("data") or []):
            if isinstance(p, dict) and p.get("name") == name:
                existing = p
                break

    if existing:
        pid = existing["id"]
        r2 = session.put(f"{PB_API}/playbooks/{pid}", json=playbook, timeout=15)
        ok = r2.status_code == 200 and r2.json().get("success")
        print(f"  {'✓ 已更新' if ok else '✗ 更新失败'} {name} (id={pid}) "
              f"{'' if ok else r2.text[:200]}")
        return pid if ok else None

    r2 = session.post(f"{PB_API}/playbooks", json=playbook, timeout=15)
    js = r2.json() if r2.status_code in (200, 201) else {}
    pid = (js.get("data") or {}).get("id")
    ok = bool(pid)
    print(f"  {'✓ 已创建' if ok else '✗ 创建失败'} {name} (id={pid}) "
          f"{'' if ok else r2.text[:200]}")
    return pid


def main():
    ap = argparse.ArgumentParser(description="部署封禁剧本（对接设备模拟器）")
    ap.add_argument("--api-base", default=API_BASE)
    ap.add_argument("--simulator-url", default=DEFAULT_SIM,
                    help="模拟器地址（容器内执行，默认 host.docker.internal:8800）")
    ap.add_argument("--token", default=DEFAULT_TOKEN, help="模拟器 Bearer token")
    ap.add_argument("--user", default="admin")
    ap.add_argument("--password", default="admin123")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    global PB_API
    PB_API = f"{args.api_base}/api/playbooks-api"

    specs = [firewall_playbook(args.simulator_url.rstrip("/"), args.token),
             host_playbook(args.simulator_url.rstrip("/"), args.token)]

    if args.dry_run:
        for s in specs:
            deploy(s, None, dry_run=True)
        return 0

    s = requests.Session()
    r = s.post(f"{args.api_base}/api/auth/login",
               json={"username": args.user, "password": args.password}, timeout=10)
    token = (r.json().get("data") or {}).get("token")
    if not token:
        print(f"✗ 登录失败: {r.status_code} {r.text[:200]}")
        return 1
    s.headers.update({"Authorization": f"Bearer {token}"})
    print(f"✓ 已登录 {args.api_base}\n部署剧本（模拟器: {args.simulator_url}）：")

    ids = [deploy(spec, s) for spec in specs]
    print("\n完成。剧本 id: " + ", ".join(str(i) for i in ids if i))
    return 0 if all(ids) else 1


if __name__ == "__main__":
    sys.exit(main())
