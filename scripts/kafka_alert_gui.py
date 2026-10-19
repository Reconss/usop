#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
USOP · 告警注入器 GUI
=====================

一个**零额外依赖**的本地 Web 图形界面（仅用 Python 标准库 http.server），
用于向 Kafka 注入安全产品告警 —— 合成告警、真实公开数据集、自定义负载。

启动
----
    python kafka_alert_gui.py                  # 默认 http://127.0.0.1:8790
    python kafka_alert_gui.py --port 9000
    python kafka_alert_gui.py --no-browser     # 不自动打开浏览器

功能
----
1. 连接设置：Kafka broker / USOP API 地址，实时连通性检测（红绿灯）。
2. 合成告警：5 类安全产品（Suricata/Wazuh/Imperva/CrowdStrike/ModSecurity），
   可设条数、速率、topic，支持「注册 DataSource 并发送」一键端到端。
3. 公开数据集：内置 4 组真实 Suricata eve.json 样本（WRCCDC 2017/2018、
   FIRST 2015、蜜罐 2018，共 548 条），一键下载 → 导入 Kafka。
   时间默认平移到当前（保留相对时序），可关闭。
4. 自定义负载：粘贴 JSON 或原始文本（LEEF / Apache 日志）发送。
5. 实时日志：SSE 流式输出发送进度，支持随时「停止」。

依赖
----
运行时仅标准库；发送告警需要 kafka-python（与 CLI 相同）。
"""

import argparse
import json
import os
import socket
import sys
import threading
import time
import webbrowser
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kafka_alert_sender as KAS  # noqa: E402
import alert_datasets as DS       # noqa: E402

DEFAULT_PORT = 8790

# ---------------------------------------------------------------------------
# 全局状态
# ---------------------------------------------------------------------------

_LOCK = threading.Lock()
_LOG_SEQ = 0
_LOG_HISTORY = deque(maxlen=600)      # [(seq, level, msg)]
_STATE = {"running": False, "label": "", "done": 0, "total": 0}
_STOP = threading.Event()


def log(msg: str, level: str = "info"):
    """写一条日志（广播给所有 SSE 客户端）。"""
    global _LOG_SEQ
    with _LOCK:
        _LOG_SEQ += 1
        _LOG_HISTORY.append((_LOG_SEQ, level, msg))


def logs_since(since: int):
    with _LOCK:
        return [{"seq": s, "level": lv, "msg": m}
                for s, lv, m in _LOG_HISTORY if s > since]


def kafka_reachable(broker: str, timeout: float = 2.0) -> bool:
    try:
        host, port = broker.split(":")[0], int(broker.split(":")[1])
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def api_reachable(base: str, user: str, pwd: str, timeout: float = 4.0) -> bool:
    import urllib.request
    import urllib.error
    try:
        req = urllib.request.Request(
            f"{base}/api/auth/login",
            data=json.dumps({"username": user, "password": pwd}).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
            return bool(data.get("data", {}).get("token"))
    except Exception:
        return False


# ---------------------------------------------------------------------------
# 任务执行
# ---------------------------------------------------------------------------

def _run_job(label, fn):
    """在后台线程跑任务，保证同一时刻只有一个。"""
    if _STATE["running"]:
        return False, "已有任务正在运行"
    _STOP.clear()

    def worker():
        _STATE["running"] = True
        _STATE["label"] = label
        log(f"▶ 开始: {label}", "ok")
        t0 = time.time()
        try:
            fn()
        except Exception as e:
            log(f"✗ 任务异常: {e}", "err")
        finally:
            _STATE["running"] = False
            log(f"■ 结束: {label}（耗时 {time.time() - t0:.1f}s）", "ok")

    threading.Thread(target=worker, daemon=True).start()
    return True, "已启动"


def stop_job():
    if not _STATE["running"]:
        return False
    _STOP.set()
    log("⏹ 收到停止请求，将在当前条发送完成后中止…", "warn")
    return True


def _emit(payloads, broker, topic, rate, register, api_base, api_user, api_pass,
          device_type, label):
    ok, total = KAS.emit(
        payloads, broker=broker, topic=topic, rate=rate, register=register,
        api_base=api_base, api_user=api_user, api_pass=api_pass,
        device_type=device_type, label=label,
        log=lambda m: log(m, "info"), stop_check=_STOP.is_set,
    )
    _STATE["done"], _STATE["total"] = ok, total


def job_send_synth(cfg):
    product = cfg["product"]
    info = KAS.PRODUCTS[product]
    topic = cfg.get("topic") or info["topic"]
    payloads = [info["gen"]() for _ in range(int(cfg.get("count", 1)))]
    _emit(payloads, cfg["broker"], topic, float(cfg.get("rate", 0)),
          bool(cfg.get("register")), cfg.get("apiBase", ""),
          cfg.get("apiUser", "admin"), cfg.get("apiPass", "admin123"),
          product, product)


def job_import_dataset(cfg):
    src = cfg["id"]
    ds = DS.DATASETS.get(src)
    topic = cfg.get("topic") or (ds["topic"] if ds else "suricata-alert")
    payloads = DS.load_records(
        src, limit=cfg.get("count") or None,
        refresh_time=not bool(cfg.get("keepTimestamp")),
        log=lambda m: log(m, "info"),
    )
    if not payloads:
        log("✗ 未加载到任何记录", "err")
        return
    _emit(payloads, cfg["broker"], topic, float(cfg.get("rate", 0)),
          bool(cfg.get("register")), cfg.get("apiBase", ""),
          cfg.get("apiUser", "admin"), cfg.get("apiPass", "admin123"),
          cfg.get("deviceType") or (ds["product"] if ds else "suricata"), src)


def job_send_custom(cfg):
    product = cfg["product"]
    info = KAS.PRODUCTS[product]
    topic = cfg.get("topic") or info["topic"]
    text = (cfg.get("payload") or "").strip()
    if not text:
        log("✗ 负载为空", "err")
        return
    try:
        obj = json.loads(text)
        if not isinstance(obj, dict):
            raise ValueError("必须是 JSON 对象")
        payload = obj
    except json.JSONDecodeError:
        if info["fmt"] != "text":
            log(f"✗ {product} 为 JSON 格式产品，但输入不是合法 JSON", "err")
            return
        payload = {"raw": text}
    except ValueError as e:
        log(f"✗ {e}", "err")
        return
    _emit([payload], cfg["broker"], topic, 0,
          bool(cfg.get("register")), cfg.get("apiBase", ""),
          cfg.get("apiUser", "admin"), cfg.get("apiPass", "admin123"),
          product, product)


def job_fetch(cfg):
    ds_id = cfg["id"]
    try:
        DS.fetch(ds_id, force=True, log=lambda m: log(m, "info"))
        log("✓ 下载完成", "ok")
    except Exception as e:
        log(f"✗ 下载失败: {e}", "err")


# ---------------------------------------------------------------------------
# HTTP 服务
# ---------------------------------------------------------------------------

HTML = r"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>USOP 告警注入器</title>
<style>
:root{
  --bg:#0b0f14; --panel:#131a22; --panel2:#0f151c; --border:#243040;
  --text:#e6edf3; --muted:#8b98a8; --accent:#3b9dff; --accent2:#22d3ee;
  --ok:#3fb950; --warn:#d29922; --err:#f85149;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);
  font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
header{display:flex;align-items:center;gap:12px;padding:14px 20px;
  border-bottom:1px solid var(--border);background:var(--panel)}
header h1{font-size:15px;margin:0;font-weight:600;letter-spacing:.3px}
header .sub{color:var(--muted);font-size:12px}
.wrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;padding:16px;height:calc(100vh - 56px)}
@media(max-width:1000px){.wrap{grid-template-columns:1fr;height:auto}}
.col{display:flex;flex-direction:column;gap:12px;min-height:0}
.card{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:14px}
.card h2{margin:0 0 10px;font-size:13px;font-weight:600;color:var(--text);
  display:flex;align-items:center;gap:8px}
.card h2 .tag{font-size:11px;color:var(--muted);font-weight:400}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.grow{flex:1;min-width:120px}
label{display:block;font-size:11px;color:var(--muted);margin-bottom:4px}
input,select,textarea{width:100%;background:var(--panel2);color:var(--text);
  border:1px solid var(--border);border-radius:6px;padding:7px 9px;font-size:13px;
  font-family:inherit;outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--accent)}
textarea{font-family:var(--mono);font-size:12px;min-height:150px;resize:vertical}
button{background:#1d2733;color:var(--text);border:1px solid var(--border);
  border-radius:6px;padding:7px 13px;font-size:13px;cursor:pointer;font-family:inherit}
button:hover:not(:disabled){border-color:var(--accent);background:#22303f}
button:disabled{opacity:.45;cursor:not-allowed}
button.primary{background:var(--accent);border-color:var(--accent);color:#04121f;font-weight:600}
button.primary:hover:not(:disabled){background:#55aaff}
button.go{background:var(--ok);border-color:var(--ok);color:#04160a;font-weight:600}
button.go:hover:not(:disabled){background:#4ec95f}
button.danger{background:var(--err);border-color:var(--err);color:#fff;font-weight:600}
button.sm{padding:4px 9px;font-size:12px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--muted);display:inline-block}
.dot.on{background:var(--ok);box-shadow:0 0 6px var(--ok)}
.dot.off{background:var(--err)}
.tabs{display:flex;gap:6px;margin-bottom:12px}
.tab{padding:6px 12px;border-radius:6px;background:var(--panel2);
  border:1px solid var(--border);cursor:pointer;font-size:13px;color:var(--muted)}
.tab.on{color:var(--text);border-color:var(--accent);background:#16283c}
.products{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:12px}
.pbtn{padding:9px;border-radius:8px;border:1px solid var(--border);
  background:var(--panel2);cursor:pointer;text-align:left}
.pbtn:hover{border-color:var(--accent2)}
.pbtn.on{border-color:var(--accent);background:#16283c}
.pbtn .n{font-weight:600;font-size:13px}
.pbtn .t{font-size:11px;color:var(--muted);font-family:var(--mono)}
.ds{display:flex;align-items:center;gap:10px;padding:9px;border:1px solid var(--border);
  border-radius:8px;background:var(--panel2);margin-bottom:8px}
.ds .info{flex:1;min-width:0}
.ds .nm{font-size:13px;font-weight:600}
.ds .meta{font-size:11px;color:var(--muted)}
.ds .badge{font-size:10px;padding:1px 6px;border-radius:99px;border:1px solid var(--border);color:var(--muted)}
.ds .badge.on{color:var(--ok);border-color:var(--ok)}
.logbox{flex:1;min-height:240px;background:#070b10;border:1px solid var(--border);
  border-radius:10px;padding:10px;overflow:auto;font-family:var(--mono);font-size:12px}
.logbox div{white-space:pre-wrap;word-break:break-all;margin-bottom:1px}
.l-ok{color:var(--ok)} .l-err{color:var(--err)} .l-warn{color:var(--warn)} .l-info{color:#b9c6d4}
.prev{flex:1;min-height:150px;background:#070b10;border:1px solid var(--border);
  border-radius:10px;padding:10px;overflow:auto;font-family:var(--mono);font-size:11.5px;
  color:#9fb3c8;display:none}
.prev.on{display:block}
.hint{font-size:11px;color:var(--muted);margin-top:6px}
.bar{height:4px;background:#1b2431;border-radius:99px;overflow:hidden;margin-top:8px}
.bar>i{display:block;height:100%;width:0;background:var(--accent);transition:width .25s}
.split{display:flex;flex-direction:column;gap:10px;min-height:0;flex:1}
</style>
</head>
<body>
<header>
  <h1>USOP · 告警注入器</h1>
  <span class="sub">向 Kafka 注入安全产品告警（合成 / 真实数据集 / 自定义）</span>
  <div style="margin-left:auto" class="row">
    <span class="dot" id="dKafka"></span><span class="sub" id="tKafka">Kafka</span>
    <span class="dot" id="dApi"></span><span class="sub" id="tApi">USOP API</span>
    <button class="sm" id="btnCheck">检测连通性</button>
  </div>
</header>

<div class="wrap">
  <!-- 左栏 -->
  <div class="col">
    <div class="card">
      <h2>连接设置</h2>
      <div class="row">
        <div class="grow"><label>Kafka broker</label>
          <input id="broker" value="localhost:9092"></div>
        <div class="grow"><label>USOP API</label>
          <input id="apiBase" value="http://localhost:5001"></div>
      </div>
      <div class="row" style="margin-top:8px">
        <div style="width:110px"><label>账号</label><input id="apiUser" value="admin"></div>
        <div style="width:130px"><label>密码</label><input id="apiPass" value="admin123" type="password"></div>
      </div>
      <div class="hint">容器内运行请用 <code>kafka:29092</code>；勾选「注册」会自动建 DataSource 并拉起消费线程。</div>
    </div>

    <div class="card">
      <div class="tabs">
        <div class="tab on" data-tab="synth">合成告警</div>
        <div class="tab" data-tab="ds">公开数据集</div>
        <div class="tab" data-tab="custom">自定义负载</div>
      </div>

      <!-- 合成 -->
      <div id="tab-synth">
        <div class="products" id="products"></div>
        <div class="row">
          <div style="width:110px"><label>条数</label><input id="count" type="number" value="10" min="1"></div>
          <div style="width:130px"><label>间隔(秒/条)</label><input id="rate" type="number" value="0" min="0" step="0.1"></div>
          <div class="grow"><label>目标 topic</label><input id="topic" placeholder="留空=产品默认"></div>
        </div>
      </div>

      <!-- 数据集 -->
      <div id="tab-ds" style="display:none">
        <div id="datasets"></div>
        <div class="row">
          <div style="width:110px"><label>导入条数</label><input id="dsCount" type="number" value="50" min="1"></div>
          <div style="width:130px"><label>间隔(秒/条)</label><input id="dsRate" type="number" value="0" min="0" step="0.1"></div>
          <div class="grow"><label>目标 topic</label><input id="dsTopic" placeholder="留空=数据集默认"></div>
        </div>
        <label style="display:flex;gap:6px;align-items:center;margin-top:8px;font-size:12px;color:var(--text)">
          <input type="checkbox" id="dsKeepTs" style="width:auto">
          保留样本原始时间（默认平移到当前，保留相对时序）
        </label>
      </div>

      <!-- 自定义 -->
      <div id="tab-custom" style="display:none">
        <div class="row" style="margin-bottom:8px">
          <div style="width:200px"><label>产品格式</label><select id="custProduct"></select></div>
          <div class="grow"><label>目标 topic</label><input id="custTopic" placeholder="留空=产品默认"></div>
        </div>
        <textarea id="custPayload" placeholder='粘贴原始负载：JSON 对象，或纯文本（LEEF / Apache 日志，文本类产品会自动包成 {"raw": "..."}）'></textarea>
      </div>

      <div class="row" style="margin-top:12px;align-items:center">
        <label style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--text);margin:0">
          <input type="checkbox" id="register" style="width:auto">
          注册 DataSource 并拉起消费（端到端）
        </label>
        <div style="margin-left:auto" class="row">
          <button id="btnPreview">预览</button>
          <button class="go" id="btnSend">开始发送</button>
          <button class="danger" id="btnStop" disabled>停止</button>
        </div>
      </div>
      <div class="bar"><i id="prog"></i></div>
    </div>
  </div>

  <!-- 右栏 -->
  <div class="col">
    <div class="split">
      <div class="card" style="padding:10px">
        <h2>预览 <span class="tag" id="prevTag"></span></h2>
        <div class="prev" id="prev"></div>
      </div>
      <div class="card" style="padding:10px;flex:1;display:flex;flex-direction:column;min-height:0">
        <h2>运行日志 <span class="tag">实时</span>
          <button class="sm" style="margin-left:auto" id="btnClear">清空</button>
        </h2>
        <div class="logbox" id="logs"></div>
      </div>
    </div>
  </div>
</div>

<script>
const $ = id => document.getElementById(id);
let curTab = 'synth', curProduct = 'suricata', lastSeq = 0, es = null;
let products = {}, datasets = [];

function api(path, body){
  const opt = body ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}
                   : {method:'GET'};
  return fetch(path, opt).then(r => r.json());
}

function cfg(){
  return {
    broker: $('broker').value.trim(),
    apiBase: $('apiBase').value.trim(),
    apiUser: $('apiUser').value.trim(),
    apiPass: $('apiPass').value.trim(),
    register: $('register').checked
  };
}

function renderProducts(){
  $('products').innerHTML = Object.keys(products).map(k => {
    const p = products[k];
    return '<div class="pbtn'+(k===curProduct?' on':'')+'" data-p="'+k+'">'+
      '<div class="n">'+k+'</div><div class="t">'+p.topic+'</div></div>';
  }).join('');
  document.querySelectorAll('.pbtn').forEach(el => {
    el.onclick = () => { curProduct = el.dataset.p; renderProducts(); };
  });
  $('custProduct').innerHTML = Object.keys(products).map(k =>
    '<option value="'+k+'">'+k+' · '+products[k].desc+'</option>').join('');
}

function renderDatasets(){
  $('datasets').innerHTML = datasets.map(d =>
    '<div class="ds"><div class="info"><div class="nm">'+d.name+
    ' <span class="badge'+(d.cached?' on':'')+'">'+(d.cached?'已缓存':'未下载')+'</span></div>'+
    '<div class="meta">'+d.count+' 条 · '+d.topic+' · '+d.desc+'</div></div>'+
    '<button class="sm" data-fetch="'+d.id+'">下载</button>'+
    '<button class="sm primary" data-import="'+d.id+'">导入</button></div>').join('');
  document.querySelectorAll('[data-fetch]').forEach(b => b.onclick = () => {
    log('↓ 请求下载 '+b.dataset.fetch+' …');
    api('/api/dataset/fetch', {id:b.dataset.fetch}).then(r => { if(r.error) log('✗ '+r.error,'err'); loadState(); });
  });
  document.querySelectorAll('[data-import]').forEach(b => b.onclick = () => {
    const c = cfg();
    c.id = b.dataset.import;
    c.count = parseInt($('dsCount').value)||50;
    c.rate = parseFloat($('dsRate').value)||0;
    c.topic = $('dsTopic').value.trim();
    c.keepTimestamp = $('dsKeepTs').checked;
    start('/api/dataset/import', c, '导入 '+c.id);
  });
}

function loadState(){
  api('/api/state').then(s => {
    products = s.products; datasets = s.datasets;
    if(!products[curProduct]) curProduct = Object.keys(products)[0];
    renderProducts(); renderDatasets();
  });
}

function checkHealth(){
  ['dKafka','dApi'].forEach(i => $(i).className = 'dot');
  $('tKafka').textContent = 'Kafka 检测中'; $('tApi').textContent = 'USOP API 检测中';
  const c = cfg();
  api('/api/health', c).then(h => {
    $('dKafka').className = 'dot '+(h.kafka?'on':'off');
    $('tKafka').textContent = 'Kafka '+(h.kafka?'已连通':'不可达');
    $('dApi').className = 'dot '+(h.api?'on':'off');
    $('tApi').textContent = 'USOP API '+(h.api?'已连通':'不可达');
    if(!h.kafka) log('⚠ Kafka 不可达：'+c.broker+'（容器内请改用 kafka:29092）','warn');
    if(!h.api) log('⚠ USOP API 不可达：'+c.apiBase+'（注册功能不可用，发送仍可继续）','warn');
  });
}

function log(msg, level){
  level = level || 'info';
  $('logs').insertAdjacentHTML('beforeend','<div class="l-'+level+'">'+esc(msg)+'</div>');
  $('logs').scrollTop = $('logs').scrollHeight;
}
function esc(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function currentPayload(){
  if(curTab === 'synth'){
    return {kind:'synth', product:curProduct,
            count:parseInt($('count').value)||1};
  }
  if(curTab === 'ds'){
    const first = datasets[0];
    return {kind:'dataset', id:first?first.id:'',
            count:parseInt($('dsCount').value)||5,
            keepTimestamp:$('dsKeepTs').checked};
  }
  return {kind:'custom', product:$('custProduct').value,
          payload:$('custPayload').value};
}

function doPreview(){
  const p = currentPayload();
  $('prevTag').textContent = '加载中…';
  api('/api/preview', p).then(r => {
    if(r.error){ log('✗ 预览失败: '+r.error,'err'); $('prevTag').textContent=''; return; }
    $('prev').textContent = r.payloads.map((x,i)=>'--- #'+(i+1)+' ---\n'+JSON.stringify(x,null,2)).join('\n\n');
    $('prev').classList.add('on');
    $('prevTag').textContent = r.payloads.length+' 条';
  });
}

function start(path, body, label){
  api(path, body).then(r => {
    if(r.error){ log('✗ '+r.error,'err'); return; }
    $('btnSend').disabled = true; $('btnStop').disabled = false;
    log('已提交任务: '+label,'ok');
  });
}

$('btnPreview').onclick = doPreview;
$('btnSend').onclick = () => {
  const c = cfg();
  if(curTab === 'synth'){
    c.product = curProduct;
    c.count = parseInt($('count').value)||1;
    c.rate = parseFloat($('rate').value)||0;
    c.topic = $('topic').value.trim();
    start('/api/send', c, '发送 '+c.count+' 条 '+c.product+' 告警');
  } else if(curTab === 'ds'){
    const d = datasets[0];
    if(!d){ log('✗ 无可用数据集','err'); return; }
    c.id = d.id;
    c.count = parseInt($('dsCount').value)||50;
    c.rate = parseFloat($('dsRate').value)||0;
    c.topic = $('dsTopic').value.trim();
    c.keepTimestamp = $('dsKeepTs').checked;
    start('/api/dataset/import', c, '导入 '+c.id);
  } else {
    c.product = $('custProduct').value;
    c.topic = $('custTopic').value.trim();
    c.payload = $('custPayload').value;
    start('/api/custom/send', c, '发送自定义 '+c.product+' 负载');
  }
};
$('btnStop').onclick = () => { api('/api/stop',{}).then(r => { if(r.error) log('✗ '+r.error,'err'); }); };
$('btnClear').onclick = () => { $('logs').innerHTML=''; };
$('btnCheck').onclick = checkHealth;
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
  t.classList.add('on'); curTab = t.dataset.tab;
  ['synth','ds','custom'].forEach(n => $('tab-'+n).style.display = (n===curTab?'':'none'));
});

// SSE 日志流（带 since 游标，重连不重复）
function openStream(){
  if(es) es.close();
  es = new EventSource('/api/logs?since='+lastSeq);
  es.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if(m.type === 'log'){
      lastSeq = Math.max(lastSeq, m.seq);
      log(m.msg, m.level);
    } else if(m.type === 'status'){
      const busy = m.running;
      $('btnSend').disabled = busy; $('btnStop').disabled = !busy;
      if(m.total){ $('prog').style.width = Math.round(m.done/m.total*100)+'%'; }
      else { $('prog').style.width = busy?'35%':'0%'; }
      if(!busy) $('prog').style.width = '100%';
    }
  };
  es.onerror = () => { es.close(); setTimeout(openStream, 1500); };
}

loadState();
checkHealth();
openStream();
log('就绪。选择产品/数据集后点击「开始发送」。','ok');
</script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "USOPAlertInjector/1.0"

    def _send(self, code, body: bytes, ctype: str, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                   "application/json; charset=utf-8")

    def log_message(self, fmt, *args):  # 静音默认访问日志
        pass

    # ---- GET ----
    def do_GET(self):
        u = urlparse(self.path)
        if u.path in ("/", "/index.html"):
            self._send(200, HTML.encode("utf-8"), "text/html; charset=utf-8")
        elif u.path == "/api/state":
            self._json({
                "products": {k: {"topic": v["topic"], "fmt": v["fmt"], "desc": v["desc"]}
                             for k, v in KAS.PRODUCTS.items()},
                "datasets": DS.dataset_state(),
            })
        elif u.path == "/api/logs":
            self._stream(parse_qs(u.query).get("since", ["0"])[0])
        else:
            self._json({"error": "not found"}, 404)

    # ---- POST ----
    def do_POST(self):
        u = urlparse(self.path)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
        except Exception:
            return self._json({"error": "请求体不是合法 JSON"}, 400)

        p = u.path
        try:
            if p == "/api/health":
                return self._json({
                    "kafka": kafka_reachable(body.get("broker", "localhost:9092")),
                    "api": api_reachable(body.get("apiBase", ""), body.get("apiUser", "admin"),
                                         body.get("apiPass", "admin123")),
                })
            if p == "/api/preview":
                return self._preview(body)
            if p == "/api/send":
                return self._start("发送合成告警", lambda: job_send_synth(body), body)
            if p == "/api/dataset/import":
                return self._start("导入数据集", lambda: job_import_dataset(body), body)
            if p == "/api/dataset/fetch":
                return self._start("下载数据集", lambda: job_fetch(body), body)
            if p == "/api/custom/send":
                return self._start("发送自定义负载", lambda: job_send_custom(body), body)
            if p == "/api/stop":
                stop_job()
                return self._json({"ok": True})
            return self._json({"error": "not found"}, 404)
        except Exception as e:
            return self._json({"error": str(e)}, 500)

    def _start(self, label, fn, body):
        ok, msg = _run_job(label, fn)
        if not ok:
            return self._json({"error": msg}, 409)
        return self._json({"ok": True, "msg": msg})

    def _preview(self, body):
        kind = body.get("kind")
        n = int(body.get("count") or 1)
        if kind == "synth":
            product = body.get("product")
            info = KAS.PRODUCTS.get(product)
            if not info:
                return self._json({"error": f"未知产品 {product}"}, 400)
            payloads = [info["gen"]() for _ in range(n)]
        elif kind == "dataset":
            ds_id = body.get("id")
            if not ds_id:
                return self._json({"error": "未指定数据集"}, 400)
            try:
                payloads = DS.load_records(
                    ds_id, limit=n,
                    refresh_time=not bool(body.get("keepTimestamp")),
                    log=lambda m: None)
            except Exception as e:
                return self._json({"error": str(e)}, 400)
        else:
            text = (body.get("payload") or "").strip()
            if not text:
                return self._json({"error": "负载为空"}, 400)
            try:
                obj = json.loads(text)
                payloads = [obj] if isinstance(obj, dict) else []
            except json.JSONDecodeError:
                payloads = [{"raw": text}]
        return self._json({"payloads": payloads})

    # ---- SSE ----
    def _stream(self, since):
        try:
            since = int(since)
        except ValueError:
            since = 0
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        def emit(obj):
            try:
                self.wfile.write(("data: " + json.dumps(obj, ensure_ascii=False)
                                  + "\n\n").encode("utf-8"))
                self.wfile.flush()
            except Exception:
                return False
            return True

        last_status = None
        try:
            while True:
                for m in logs_since(since):
                    since = max(since, m["seq"])
                    if not emit({"type": "log", **m}):
                        return
                st = (_STATE["running"], _STATE["done"], _STATE["total"])
                if st != last_status:
                    last_status = st
                    if not emit({"type": "status", "running": st[0],
                                 "done": st[1], "total": st[2]}):
                        return
                time.sleep(0.3)
        except Exception:
            pass


def main():
    ap = argparse.ArgumentParser(description="USOP 告警注入器 GUI（本地 Web 界面）")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    args = ap.parse_args()

    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    url = f"http://{args.host}:{args.port}/"
    print("=" * 58)
    print("  USOP 告警注入器 GUI")
    print("=" * 58)
    print(f"  地址: {url}")
    print(f"  停止: Ctrl+C")
    print("=" * 58)
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
