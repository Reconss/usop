#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
USOP · 防火墙 / 主机封禁模拟器
==============================

模拟一台**边界防火墙**与一套**主机 EDR**，接收平台（剧本）下发的封禁请求，
并返回结构化的执行结果 —— 用于在没有真实设备时打通「剧本 → 设备 → 回执」闭环。

启动
----
    python device_block_simulator.py                 # 默认 http://127.0.0.1:8800
    python device_block_simulator.py --port 8800 --token my-token
    python device_block_simulator.py --fail-rate 0.3         # 30% 随机失败
    python device_block_simulator.py --force-fail-ip 1.2.3.4 # 指定 IP 必失败
    python device_block_simulator.py --latency-ms 800        # 模拟设备慢响应
    python device_block_simulator.py --device-down           # 模拟设备不可达（503）
    python device_block_simulator.py --persist               # 状态落盘，重启不丢

接口
----
    POST /api/v1/firewall/block       防火墙封禁 IP
    POST /api/v1/firewall/unblock     解除封禁
    GET  /api/v1/firewall/rules       当前防火墙规则列表
    POST /api/v1/host/isolate         主机隔离（封禁主机）
    POST /api/v1/host/release         解除主机隔离
    GET  /api/v1/host/quarantine      当前隔离主机列表
    GET  /api/v1/logs                 请求审计日志（平台下发与设备回执）
    POST /api/v1/admin/faults         运行时调整故障注入参数
    POST /api/v1/admin/reset          清空所有状态
    GET  /api/v1/health               健康检查
    GET  /                            Web 控制台（封禁列表 + 审计日志 + 故障开关）

鉴权：默认要求 `Authorization: Bearer <token>`（--token 修改，--no-auth 关闭）。

返回约定
--------
    成功 200        {"success": true,  "code": 0,    "message": "ok",    "data": {...}}
    业务拒绝 200    {"success": false, "code": 4xxx, "message": "...",   "data": {...}}
    设备不可达 503  {"success": false, "code": 5001, "message": "..."}

说明：业务级失败（如「IP 已在黑名单」「设备拒绝」）也返回 200，因为真实设备
通常在应用层返回错误码；平台剧本应**按 success 字段分支**，而不是只看 HTTP 状态码。
"""

import argparse
import json
import os
import random
import socket
import sys
import threading
import time
import webbrowser
from collections import deque
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

DEFAULT_PORT = 8800
DEFAULT_TOKEN = "usop-sim-token"

# ---------------------------------------------------------------------------
# 状态
# ---------------------------------------------------------------------------

_LOCK = threading.RLock()   # 可重入：业务函数持锁后可能再调 _next_seq
_FIREWALL_RULES = {}      # ip -> rule dict
_HOST_QUARANTINE = {}     # host key -> entry dict
_REQ_LOG = deque(maxlen=300)
_SEQ = {"fw": 0, "host": 0}

# 故障注入参数（可在运行时通过 /api/v1/admin/faults 调整）
FAULTS = {
    "fail_rate": 0.0,          # 随机失败概率 0~1
    "force_fail_ips": [],      # 这些 IP 必失败
    "force_fail_hosts": [],    # 这些主机必失败
    "latency_ms": 0,           # 固定延迟
    "device_down": False,      # 整体不可用
}

STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          ".simulator_state.json")


def _now():
    return datetime.now(timezone.utc)


def _iso(dt=None):
    return (dt or _now()).isoformat()


def _parse_duration(text, default_hours=24):
    """24h / 30m / 7d / 3600s → 秒。"""
    if not text:
        return default_hours * 3600
    s = str(text).strip().lower()
    try:
        if s.endswith("h"):
            return int(float(s[:-1]) * 3600)
        if s.endswith("m"):
            return int(float(s[:-1]) * 60)
        if s.endswith("d"):
            return int(float(s[:-1]) * 86400)
        if s.endswith("s"):
            return int(float(s[:-1]))
        return int(float(s))
    except ValueError:
        return default_hours * 3600


def _next_seq(kind):
    with _LOCK:
        _SEQ[kind] += 1
        return _SEQ[kind]


def _audit(kind, action, request_body, result):
    _REQ_LOG.append({
        "ts": _iso(),
        "kind": kind,
        "action": action,
        "request": request_body,
        "success": bool(result.get("success")),
        "code": result.get("code"),
        "message": result.get("message"),
        "result": (result.get("data") or {}),
    })


def _save():
    if not PERSIST:
        return
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump({"firewall": _FIREWALL_RULES, "host": _HOST_QUARANTINE,
                       "seq": _SEQ}, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def _load():
    global _SEQ
    if not PERSIST or not os.path.isfile(STATE_FILE):
        return
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        _FIREWALL_RULES.update(data.get("firewall") or {})
        _HOST_QUARANTINE.update(data.get("host") or {})
        _SEQ.update(data.get("seq") or {})
    except Exception:
        pass


# ---------------------------------------------------------------------------
# 业务：防火墙
# ---------------------------------------------------------------------------

def fw_block(body):
    ip = str(body.get("ip") or "").strip()
    if not ip:
        return {"success": False, "code": 4001, "message": "缺少参数 ip", "data": {}}

    # 故障注入
    forced = ip in FAULTS["force_fail_ips"]
    if FAULTS["device_down"]:
        return {"success": False, "code": 5001,
                "message": "防火墙不可达（设备离线/管理口无响应）", "data": {"ip": ip}}
    if forced:
        return {"success": False, "code": 4002,
                "message": f"防火墙拒绝下发：IP {ip} 命中设备侧强制失败策略",
                "data": {"ip": ip}}
    if random.random() < FAULTS["fail_rate"]:
        return {"success": False, "code": 4003,
                "message": "防火墙下发失败：策略提交超时（模拟随机故障）",
                "data": {"ip": ip}}

    seq = _next_seq("fw")     # 取号在锁外，避免与 _LOCK 嵌套
    with _LOCK:
        if ip in _FIREWALL_RULES:
            return {"success": False, "code": 4004,
                    "message": f"IP {ip} 已在防火墙黑名单中",
                    "data": _FIREWALL_RULES[ip]}
        duration = str(body.get("duration") or "24h")
        seconds = _parse_duration(duration)
        rule = {
            "rule_id": f"fw-{_now().strftime('%Y%m%d')}-{seq:04d}",
            "device": "FW-CORE-01",
            "ip": ip,
            "action": str(body.get("action") or "deny"),
            "direction": str(body.get("direction") or "inbound"),
            "duration": duration,
            "reason": str(body.get("reason") or ""),
            "operator": str(body.get("operator") or "usop"),
            "ticket_id": str(body.get("ticket_id") or ""),
            "status": "applied",
            "applied_at": _iso(),
            "expires_at": _iso(_now() + timedelta(seconds=seconds)),
        }
        _FIREWALL_RULES[ip] = rule
    _save()
    return {"success": True, "code": 0,
            "message": f"已在 FW-CORE-01 下发封禁规则 {rule['rule_id']}",
            "data": rule}


def fw_unblock(body):
    ip = str(body.get("ip") or "").strip()
    rule_id = str(body.get("rule_id") or "").strip()
    with _LOCK:
        if not ip and rule_id:
            ip = next((k for k, v in _FIREWALL_RULES.items()
                       if v.get("rule_id") == rule_id), "")
        rule = _FIREWALL_RULES.pop(ip, None)
    if not rule:
        return {"success": False, "code": 4005,
                "message": f"未找到 IP {ip or rule_id} 的封禁规则", "data": {}}
    _save()
    return {"success": True, "code": 0,
            "message": f"已撤销封禁规则 {rule.get('rule_id')}",
            "data": {**rule, "status": "removed", "removed_at": _iso()}}


# ---------------------------------------------------------------------------
# 业务：主机
# ---------------------------------------------------------------------------

def host_isolate(body):
    host = str(body.get("hostname") or "").strip()
    ip = str(body.get("ip") or "").strip()
    if not host and not ip:
        return {"success": False, "code": 4101,
                "message": "缺少参数 hostname 或 ip", "data": {}}
    key = (host or ip).lower()

    if FAULTS["device_down"]:
        return {"success": False, "code": 5001,
                "message": "EDR 管理平台不可达", "data": {"host": host, "ip": ip}}
    if key in [h.lower() for h in FAULTS["force_fail_hosts"]] or ip in FAULTS["force_fail_ips"]:
        return {"success": False, "code": 4102,
                "message": f"主机 {host or ip} 隔离失败：Agent 离线，指令下发超时",
                "data": {"host": host, "ip": ip}}
    if random.random() < FAULTS["fail_rate"]:
        return {"success": False, "code": 4103,
                "message": "主机隔离失败：EDR 指令通道拥塞（模拟随机故障）",
                "data": {"host": host, "ip": ip}}

    seq = _next_seq("host")   # 取号在锁外
    with _LOCK:
        if key in _HOST_QUARANTINE:
            return {"success": False, "code": 4104,
                    "message": f"主机 {key} 已处于隔离状态",
                    "data": _HOST_QUARANTINE[key]}
        entry = {
            "task_id": f"host-{_now().strftime('%Y%m%d')}-{seq:04d}",
            "hostname": host or f"HOST-{ip}",
            "ip": ip,
            "agent": "EDR-Agent/7.2",
            "mode": str(body.get("mode") or "full"),
            "network_policy": "block-all-except-console",
            "reason": str(body.get("reason") or ""),
            "operator": str(body.get("operator") or "usop"),
            "status": "isolated",
            "isolated_at": _iso(),
        }
        _HOST_QUARANTINE[key] = entry
    _save()
    return {"success": True, "code": 0,
            "message": f"主机 {entry['hostname']} 已隔离（{entry['task_id']}）",
            "data": entry}


def host_release(body):
    host = str(body.get("hostname") or "").strip()
    ip = str(body.get("ip") or "").strip()
    key = (host or ip).lower()
    with _LOCK:
        entry = _HOST_QUARANTINE.pop(key, None)
    if not entry:
        return {"success": False, "code": 4105,
                "message": f"主机 {key} 未处于隔离状态", "data": {}}
    _save()
    return {"success": True, "code": 0,
            "message": f"主机 {entry.get('hostname')} 已解除隔离",
            "data": {**entry, "status": "released", "released_at": _iso()}}


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

HTML = r"""<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>封禁设备模拟器</title>
<style>
:root{--bg:#0b0f14;--panel:#131a22;--panel2:#0f151c;--border:#243040;--text:#e6edf3;
--muted:#8b98a8;--accent:#3b9dff;--ok:#3fb950;--err:#f85149;--warn:#d29922;
--mono:ui-monospace,Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 -apple-system,"PingFang SC",sans-serif}
header{padding:14px 20px;border-bottom:1px solid var(--border);background:var(--panel);
display:flex;align-items:center;gap:12px}
header h1{font-size:15px;margin:0}
.pill{font-size:11px;padding:2px 8px;border-radius:99px;border:1px solid var(--border);color:var(--muted)}
.pill.on{color:var(--ok);border-color:var(--ok)}
.pill.bad{color:var(--err);border-color:var(--err)}
.wrap{padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:980px){.wrap{grid-template-columns:1fr}}
.card{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:14px}
.card h2{margin:0 0 10px;font-size:13px;display:flex;align-items:center;gap:8px}
.card h2 .c{color:var(--muted);font-weight:400;font-size:11px}
table{width:100%;border-collapse:collapse;font-family:var(--mono);font-size:11.5px}
th,td{text-align:left;padding:5px 6px;border-bottom:1px solid var(--border)}
th{color:var(--muted);font-weight:500}
td.ip{color:var(--accent)}
.empty{color:var(--muted);font-size:12px;padding:8px 0}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
input{background:var(--panel2);border:1px solid var(--border);color:var(--text);
border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit}
button{background:#1d2733;border:1px solid var(--border);color:var(--text);
border-radius:6px;padding:5px 11px;font-size:12px;cursor:pointer;font-family:inherit}
button:hover{border-color:var(--accent)}
button.danger:hover{border-color:var(--err)}
label{font-size:11px;color:var(--muted)}
.logs{max-height:280px;overflow:auto;font-family:var(--mono);font-size:11px}
.logs div{padding:3px 0;border-bottom:1px solid #172029;white-space:pre-wrap;word-break:break-all}
.ok{color:var(--ok)}.bad{color:var(--err)}
</style></head>
<body>
<header>
  <h1>封禁设备模拟器</h1>
  <span class="pill" id="pHealth">健康检查中</span>
  <span class="pill" id="pFaults">故障注入</span>
  <span style="margin-left:auto" class="pill" id="pCounts">—</span>
</header>
<div class="wrap">
  <div class="card">
    <h2>防火墙封禁规则 <span class="c" id="cFw"></span>
      <button style="margin-left:auto" id="btnRefresh">刷新</button></h2>
    <div id="fwTable"></div>
    <div class="row">
      <input id="fwIp" placeholder="IP" style="width:130px">
      <input id="fwDur" placeholder="24h" style="width:70px">
      <input id="fwReason" placeholder="原因" style="width:150px">
      <button id="btnFwBlock">封禁</button>
      <button class="danger" id="btnFwUnblock">解封</button>
    </div>
  </div>
  <div class="card">
    <h2>主机隔离 <span class="c" id="cHost"></span></h2>
    <div id="hostTable"></div>
    <div class="row">
      <input id="hName" placeholder="主机名" style="width:130px">
      <input id="hIp" placeholder="IP" style="width:120px">
      <button id="btnHostIso">隔离</button>
      <button class="danger" id="btnHostRel">解除</button>
    </div>
  </div>
  <div class="card">
    <h2>故障注入 <span class="c">用于验证剧本的失败分支</span></h2>
    <div class="row">
      <label>失败率<input id="fRate" type="number" step="0.1" min="0" max="1" style="width:70px"></label>
      <label>强制失败IP<input id="fIps" placeholder="逗号分隔" style="width:180px"></label>
      <label>延迟ms<input id="fLat" type="number" style="width:80px"></label>
      <label style="display:flex;gap:5px;align-items:center">
        <input id="fDown" type="checkbox" style="width:auto">设备宕机</label>
      <button id="btnFault">应用</button>
    </div>
    <div class="row">
      <button class="danger" id="btnReset">清空全部状态</button>
    </div>
  </div>
  <div class="card">
    <h2>请求审计 <span class="c">平台下发 → 设备回执</span></h2>
    <div class="logs" id="logs"></div>
  </div>
</div>
<script>
const $=id=>document.getElementById(id);
const TOKEN = new URLSearchParams(location.search).get('token') || '';
function call(path, body){
  return fetch(path, {method: body? 'POST':'GET',
    headers: {'Content-Type':'application/json', 'Authorization':'Bearer '+TOKEN},
    body: body? JSON.stringify(body): undefined}).then(r=>r.json());
}
function esc(s){return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function tbl(rows, cols, empty){
  if(!rows.length) return '<div class="empty">'+empty+'</div>';
  return '<table><tr>'+cols.map(c=>'<th>'+c[0]+'</th>').join('')+'</tr>'+
    rows.map(r=>'<tr>'+cols.map(c=>'<td class="'+(c[2]||'')+'">'+esc(c[1](r))+'</td>').join('')+'</tr>').join('')+
    '</table>';
}
function refresh(){
  call('/api/v1/firewall/rules').then(d=>{
    const rows=(d.data||{}).rules||[];
    $('cFw').textContent = rows.length+' 条';
    $('fwTable').innerHTML = tbl(rows,
      [['IP',r=>r.ip,'ip'],['规则ID',r=>r.rule_id],['动作',r=>r.action],
       ['时长',r=>r.duration],['失效时间',r=>(r.expires_at||'').slice(0,19)],['原因',r=>r.reason]],
      '暂无封禁规则');
  });
  call('/api/v1/host/quarantine').then(d=>{
    const rows=(d.data||{}).hosts||[];
    $('cHost').textContent = rows.length+' 台';
    $('hostTable').innerHTML = tbl(rows,
      [['主机',r=>r.hostname],['IP',r=>r.ip,'ip'],['模式',r=>r.mode],
       ['隔离时间',r=>(r.isolated_at||'').slice(0,19)],['任务ID',r=>r.task_id]],
      '暂无隔离主机');
  });
  call('/api/v1/logs?limit=40').then(d=>{
    const rows=(d.data||{}).logs||[];
    $('logs').innerHTML = rows.slice().reverse().map(l=>
      '<div><span class="'+(l.success?'ok':'bad')+'">'+(l.success?'✔':'✘')+'</span> '+
      esc((l.ts||'').slice(11,19))+' '+esc(l.kind+'/'+l.action)+' '+
      esc(JSON.stringify(l.request))+' → '+esc(l.message)+'</div>').join('') || '<div class="empty">暂无请求</div>';
  });
  call('/api/v1/health').then(d=>{
    const h=$('pHealth');
    h.textContent = d.data && d.data.device_down ? '设备宕机（模拟）' : '设备在线';
    h.className = 'pill ' + (d.data && d.data.device_down ? 'bad' : 'on');
    $('pCounts').textContent = '防火墙 '+(d.data.firewall_rules)+' · 主机 '+(d.data.quarantined_hosts);
    const f=(d.data.faults||{});
    $('pFaults').textContent = '失败率 '+f.fail_rate+' · 强制IP '+(f.force_fail_ips||[]).length+' · 延迟 '+f.latency_ms+'ms';
    $('fRate').value=f.fail_rate; $('fIps').value=(f.force_fail_ips||[]).join(',');
    $('fLat').value=f.latency_ms; $('fDown').checked=!!f.device_down;
  });
}
$('btnRefresh').onclick=refresh;
$('btnFwBlock').onclick=()=>call('/api/v1/firewall/block',{ip:$('fwIp').value,duration:$('fwDur').value||'24h',reason:$('fwReason').value,operator:'console'}).then(refresh);
$('btnFwUnblock').onclick=()=>call('/api/v1/firewall/unblock',{ip:$('fwIp').value}).then(refresh);
$('btnHostIso').onclick=()=>call('/api/v1/host/isolate',{hostname:$('hName').value,ip:$('hIp').value,operator:'console'}).then(refresh);
$('btnHostRel').onclick=()=>call('/api/v1/host/release',{hostname:$('hName').value,ip:$('hIp').value}).then(refresh);
$('btnFault').onclick=()=>call('/api/v1/admin/faults',{fail_rate:parseFloat($('fRate').value)||0,
  force_fail_ips:$('fIps').value.split(',').map(s=>s.trim()).filter(Boolean),
  latency_ms:parseInt($('fLat').value)||0, device_down:$('fDown').checked}).then(refresh);
$('btnReset').onclick=()=>{if(confirm('清空全部封禁/隔离状态与审计日志？'))call('/api/v1/admin/reset',{}).then(refresh);};
refresh(); setInterval(refresh, 5000);
</script>
</body></html>
"""


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "USOPBlockSimulator/1.0"

    def log_message(self, fmt, *args):
        pass

    # ---------- 工具 ----------
    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _html(self, text):
        body = text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return {}

    def _authorized(self):
        if NO_AUTH:
            return True
        hdr = self.headers.get("Authorization") or ""
        return hdr.replace("Bearer ", "").strip() == TOKEN

    # ---------- 路由 ----------
    def do_GET(self):
        u = urlparse(self.path)
        p = u.path
        if p == "/":
            return self._html(HTML)
        if p == "/api/v1/health":
            return self._send(200, {"success": True, "code": 0, "message": "ok", "data": {
                "device": "USOP-Simulator",
                "firewall_rules": len(_FIREWALL_RULES),
                "quarantined_hosts": len(_HOST_QUARANTINE),
                "device_down": FAULTS["device_down"],
                "faults": dict(FAULTS),
            }})
        if p == "/api/v1/firewall/rules":
            return self._send(200, {"success": True, "code": 0, "message": "ok",
                                    "data": {"rules": list(_FIREWALL_RULES.values())}})
        if p == "/api/v1/host/quarantine":
            return self._send(200, {"success": True, "code": 0, "message": "ok",
                                    "data": {"hosts": list(_HOST_QUARANTINE.values())}})
        if p == "/api/v1/logs":
            limit = int(parse_qs(u.query).get("limit", ["50"])[0])
            return self._send(200, {"success": True, "code": 0, "message": "ok",
                                    "data": {"logs": list(_REQ_LOG)[-limit:]}})
        return self._send(404, {"success": False, "code": 4040, "message": "not found", "data": {}})

    def do_POST(self):
        p = urlparse(self.path).path
        if not self._authorized():
            return self._send(401, {"success": False, "code": 4010,
                                    "message": "未授权：Bearer token 无效", "data": {}})

        if FAULTS["latency_ms"]:
            time.sleep(FAULTS["latency_ms"] / 1000.0)

        body = self._body()
        route = {
            "/api/v1/firewall/block": ("firewall", "block", fw_block),
            "/api/v1/firewall/unblock": ("firewall", "unblock", fw_unblock),
            "/api/v1/host/isolate": ("host", "isolate", host_isolate),
            "/api/v1/host/release": ("host", "release", host_release),
        }.get(p)

        if route:
            kind, action, fn = route
            result = fn(body or {})
            _audit(kind, action, body, result)
            # 设备级不可用 → HTTP 503；业务级失败仍返回 200（真实设备常见行为）
            code = 503 if result.get("code") == 5001 else 200
            return self._send(code, result)

        if p == "/api/v1/admin/faults":
            for k in ("fail_rate", "force_fail_ips", "force_fail_hosts",
                      "latency_ms", "device_down"):
                if k in body:
                    FAULTS[k] = body[k]
            return self._send(200, {"success": True, "code": 0,
                                    "message": "故障注入参数已更新", "data": dict(FAULTS)})

        if p == "/api/v1/admin/reset":
            with _LOCK:
                _FIREWALL_RULES.clear()
                _HOST_QUARANTINE.clear()
                _REQ_LOG.clear()
            _save()
            return self._send(200, {"success": True, "code": 0,
                                    "message": "状态已清空", "data": {}})

        return self._send(404, {"success": False, "code": 4040, "message": "not found", "data": {}})


def main():
    global TOKEN, NO_AUTH, PERSIST
    ap = argparse.ArgumentParser(description="USOP 防火墙/主机封禁模拟器")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--token", default=DEFAULT_TOKEN)
    ap.add_argument("--no-auth", action="store_true", help="关闭 token 鉴权")
    ap.add_argument("--fail-rate", type=float, default=0.0, help="随机失败概率 0~1")
    ap.add_argument("--force-fail-ip", action="append", default=[], help="指定 IP 必失败（可多次）")
    ap.add_argument("--force-fail-host", action="append", default=[], help="指定主机必失败")
    ap.add_argument("--latency-ms", type=int, default=0, help="响应延迟毫秒")
    ap.add_argument("--device-down", action="store_true", help="启动即为设备不可达状态")
    ap.add_argument("--persist", action="store_true", help="状态落盘，重启不丢")
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    TOKEN = args.token
    NO_AUTH = args.no_auth
    PERSIST = args.persist
    FAULTS.update({
        "fail_rate": args.fail_rate,
        "force_fail_ips": args.force_fail_ip,
        "force_fail_hosts": args.force_fail_host,
        "latency_ms": args.latency_ms,
        "device_down": args.device_down,
    })
    _load()

    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    lan = _lan_ip()
    print("=" * 62)
    print("  USOP 防火墙 / 主机封禁模拟器")
    print("=" * 62)
    print(f"  本机访问:   http://127.0.0.1:{args.port}/?token={TOKEN}")
    if lan:
        print(f"  容器访问:   http://{lan}:{args.port}   (容器内用 host.docker.internal:{args.port})")
    print(f"  鉴权:       {'关闭' if NO_AUTH else 'Bearer ' + TOKEN}")
    print(f"  故障注入:   失败率={FAULTS['fail_rate']} 强制IP={FAULTS['force_fail_ips']} "
          f"延迟={FAULTS['latency_ms']}ms 宕机={FAULTS['device_down']}")
    print("=" * 62)
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(
            f"http://127.0.0.1:{args.port}/?token={TOKEN}")).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")
    finally:
        srv.server_close()


def _lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return ""


if __name__ == "__main__":
    main()
