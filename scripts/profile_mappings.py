#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
USOP · 内置产品「日志解析映射模板」配置与验证
==============================================

背景：5 个产品（suricata/wazuh/imperva/crowdstrike/modsecurity）走内置解析器
（PARSER_REGISTRY），解析已正确但**映射不显式**。本脚本把每个产品的
「设备字段 → 标准字段」映射显式化为 ParseProfile，供平台「日志解析」页面
查看、编辑与启用。

⚠️ 重要口径（写映射前实测确认）
--------------------------------
1. ParseProfile **优先于**内置解析器：启用即接管该 topic 的解析。
2. severity 数字有全局归一（_SEVERITY_LEVELS：'1'→critical '2'→high '3'→medium），
   与 **suricata 内置口径一致**；但 **wazuh 相反**（内置 level 1→low）——
   这是设备间数字语义相反，profile 无法按设备区分，故 wazuh 模板默认禁用。
3. crowdstrike 的 severity 由 PatternDispositionFlags 布尔逻辑推导（kill/
   quarantine→critical），映射表达不了 → 模板用 default_value='high' 兜底。
4. imperva 的 LEEF 需要二级 KV 切分（先按 | 拆再取 KV），regex/json/cef
   均表达不了 → **不建模板**，继续用内置解析器。
5. 常量字段（source_product/status 等）用「不存在路径 + default_value」注入。
6. alert_code（告警编号）由内置解析器按产品前缀生成（如 SRT-xxxx），profile
   无法生成 → 模板路径下该字段为空（下游无兜底）。

用法
----
  python profile_mappings.py             # 建/更新映射模板（默认禁用，幂等）
  python profile_mappings.py --verify    # 用样本对比「模板解析 vs 内置解析」逐字段差异
  python profile_mappings.py --activate suricata   # 启用某产品模板（接管解析，谨慎）
  python profile_mappings.py --deactivate all      # 全部退回内置解析器

依赖：pip install requests
"""

import argparse
import json
import sys

import requests

API_BASE = "http://localhost:5001"
PL_API = f"{API_BASE}/api/pipeline"

# 常量注入约定：source 指向必然不存在的路径，map_fields 走 default_value 分支
CONST = "_const"


def _c(target, value, ftype=""):
    """常量映射条目。"""
    return {"source": f"{CONST}.{target.replace('_', '')}", "target": target,
            "field_type": ftype, "default_value": value, "required": False}


def _m(source, target, ftype="", required=False):
    """普通字段映射条目。"""
    return {"source": source, "target": target, "field_type": ftype,
            "default_value": "", "required": required}


# ---------------------------------------------------------------------------
# 映射模板定义（对齐 app/utils/alert_parsers.py 内置输出口径）
# ---------------------------------------------------------------------------

PROFILE_TEMPLATES = {
    "suricata": {
        "name": "Suricata eve.json 解析映射",
        "topic": "suricata-alert",
        "match_type": "json",
        "match_value": "",
        "parser_config": {},
        "mappings": [
            _m("alert.signature", "title", required=True),
            _m("alert.signature", "description"),
            _m("alert.category", "category"),
            _m("alert.severity", "severity"),          # 数字 1/2/3 → 归一 critical/high/medium（与内置一致）
            _m("src_ip", "src_ip"),
            _m("dest_ip", "dst_ip"),
            _m("src_port", "src_port", "number"),
            _m("dest_port", "dst_port", "number"),
            _m("proto", "protocol"),
            _m("http.hostname", "hostname"),
            _m("timestamp", "first_seen"),
            _m("timestamp", "last_seen"),
            # 常量注入
            _c("source_product", "Suricata"),
            _c("source", "NIDS"),
            _c("source_type", "network"),
            _c("status", "new"),
        ],
    },
    "wazuh": {
        "name": "Wazuh alerts.json 解析映射",
        "topic": "wazuh-alert",
        "match_type": "json",
        "match_value": "",
        "parser_config": {},
        "mappings": [
            _m("rule.description", "title", required=True),
            _m("data.srcip", "src_ip"),                # 内置：缺失时不回退 agent.ip（模板同口径）
            _m("data.dstip", "dst_ip"),
            _m("data.srcport", "src_port", "number"),
            _m("data.dstport", "dst_port", "number"),
            _m("agent.name", "hostname"),
            # ⚠️ rule.level 数字语义与全局归一表相反（内置 1→low，归一 1→critical）。
            #    此映射仅作字段基线展示；启用会导致 level≤2 判为 critical。
            _m("rule.level", "severity"),
            # 内置 category=', '.join(groups[:3])；模板映射为数组（ES keyword 可存，展示退化）
            _m("rule.groups", "category"),
            _c("source_product", "Wazuh"),
            _c("source", "HIDS"),
            _c("source_type", "host"),
            _c("status", "new"),
        ],
    },
    "crowdstrike": {
        "name": "CrowdStrike Falcon 解析映射",
        "topic": "crowdstrike-alert",
        "match_type": "json",
        "match_value": "",
        "parser_config": {},
        "mappings": [
            _m("event.DetectName", "title", required=True),
            _m("event.DetectDescription", "description"),
            # ⚠️ 内置 severity 由 PatternDispositionFlags(Kill/Quarantine) 推导；
            #    映射表达不了布尔逻辑 → 固定 high 兜底（丢失 critical 判定）。
            _c("severity", "high"),
            _m("event.LocalIP", "dst_ip"),             # 内置语义：受控机本机 IP 是目标不是来源
            _m("event.ComputerName", "hostname"),
            _m("event.Timestamp", "first_seen", "number"),
            _m("event.Timestamp", "last_seen", "number"),
            _c("source_product", "CrowdStrike Falcon"),
            _c("source", "EDR"),
            _c("source_type", "endpoint"),
            _c("category", "终端威胁"),
            _c("status", "new"),
        ],
    },
    "modsecurity": {
        "name": "ModSecurity Apache 日志解析映射",
        "topic": "modsecurity-alert",
        "match_type": "regex",
        # 与内置 _MODSEC_PATTERN 同源（单行文本等价于 DOTALL）
        "match_value": (
            r'\[(?P<timestamp>[^\]]+)\].*?'
            r'\[client\s+(?P<src_ip>[^\]]+)\].*?'
            r'ModSecurity:\s*(?P<action>.*?)\s*with code\s+(?P<status_code>\d+)\s*\(phase\s+\d+\)\.\s*'
            r'(?:Match of\s+"[^"]*"\s+against\s+"(?P<target>[^"]*)"\s+required\.\s*)?'
            r'(?:\[id\s+"(?P<rule_id>[^"]*)"\]\s*)?'
            r'(?:\[msg\s+"(?P<msg>[^"]*)"\]\s*)?'
            r'(?:\[severity\s+"(?P<severity>[^"]*)"\]\s*)?'
            r'(?:\[uri\s+"(?P<uri>[^"]*)"\]\s*)?'
            r'(?:\[unique_id\s+"(?P<unique_id>[^"]*)"\]\s*)?'
        ),
        "parser_config": {},
        "mappings": [
            _m("msg", "title", required=True),
            _m("msg", "description"),
            _m("severity", "severity"),                # CRITICAL/ERROR/WARNING/... → 归一（与内置一致）
            _m("src_ip", "src_ip"),
            _m("timestamp", "first_seen"),
            _m("timestamp", "last_seen"),
            _c("source_product", "ModSecurity"),
            _c("source", "WAF"),
            _c("source_type", "network"),
            _c("category", "Web攻击"),
            _c("protocol", "HTTP"),
            _c("status", "new"),
        ],
    },
    # imperva：LEEF 需要二级 KV 切分，profile 无法表达 → 不建模板
}

COMPARE_FIELDS = ("title", "severity", "src_ip", "dst_ip", "src_port", "dst_port",
                  "protocol", "category", "hostname")


# ---------------------------------------------------------------------------
# 样本（与 kafka_alert_sender 的生成器同源的真实设备格式）
# ---------------------------------------------------------------------------

def _samples():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "kas", __file__.rsplit("/", 1)[0] + "/kafka_alert_sender.py")
    kas = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(kas)
    return {
        "suricata": kas.gen_suricata(),
        "wazuh": kas.gen_wazuh(),
        "crowdstrike": kas.gen_crowdstrike(),
        "modsecurity": kas.gen_modsecurity(),
    }


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def _login(api_base, user, password):
    s = requests.Session()
    r = s.post(f"{api_base}/api/auth/login",
               json={"username": user, "password": password}, timeout=10)
    token = (r.json().get("data") or {}).get("token")
    if not token:
        print(f"✗ 登录失败: {r.status_code} {r.text[:200]}")
        sys.exit(1)
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def upsert_templates(session, dry_run=False):
    profiles = (session.get(f"{PL_API}/parse-profiles", timeout=10).json().get("data") or [])
    if isinstance(profiles, dict):
        profiles = profiles.get("profiles") or profiles.get("items") or []
    by_name = {p.get("name"): p for p in profiles}

    print("建/更新映射模板（默认禁用，不接管解析）：")
    for key, tpl in PROFILE_TEMPLATES.items():
        payload = {"name": tpl["name"], "topic": tpl["topic"],
                   "match_type": tpl["match_type"], "match_value": tpl["match_value"],
                   "parser_config": tpl["parser_config"],
                   "field_mappings": tpl["mappings"], "enabled": False}
        cur = by_name.get(tpl["name"])
        if cur:
            print(f"  · {key:<13} 模板已存在 id={cur['id']} enabled={cur.get('enabled')} → 同步映射")
            if not dry_run:
                r = session.patch(f"{PL_API}/parse-profiles/{cur['id']}",
                                  json=payload, timeout=15)
                print(f"    {'✓ 已更新' if r.status_code == 200 else '✗ ' + r.text[:150]}")
            continue
        print(f"  · {key:<13} 创建模板（{tpl['match_type']}，{len(tpl['mappings'])} 条映射）")
        if not dry_run:
            r = session.post(f"{PL_API}/parse-profiles", json=payload, timeout=15)
            ok = r.status_code in (200, 201)
            print(f"    {'✓ 已创建 id=' + str(r.json().get('data', {}).get('id')) if ok else '✗ ' + r.text[:150]}")


def verify(session):
    """逐产品对比：映射模板（preview 接口）vs 内置解析器基准。"""
    import importlib.util
    base = __file__.rsplit("/", 1)[0]
    spec = importlib.util.spec_from_file_location(
        "ap", base + "/../server-python/app/utils/alert_parsers.py")
    ap = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ap)

    samples = _samples()
    profiles = (session.get(f"{PL_API}/parse-profiles", timeout=10).json().get("data") or [])
    if isinstance(profiles, dict):
        profiles = profiles.get("profiles") or profiles.get("items") or []
    by_name = {p.get("name"): p for p in profiles}

    for key, tpl in PROFILE_TEMPLATES.items():
        cur = by_name.get(tpl["name"])
        if not cur:
            print(f"\n=== {key}: 模板不存在，先运行不带参数的本脚本 ===")
            continue
        sample = samples[key]
        # ① 内置基准
        bench = getattr(ap, f"parse_{key}")(sample if key != "imperva" else sample) or {}
        # ② 模板（preview 接口实时解析）
        sample_body = sample if tpl["match_type"] == "json" else (
            sample.get("raw") if isinstance(sample, dict) else str(sample))
        r = session.post(f"{PL_API}/parse-profiles/preview", json={
            "match_type": cur["match_type"], "match_value": cur.get("match_value") or "",
            "parser_config": cur.get("parser_config") or {},
            "field_mappings": cur.get("field_mappings") or [],
            "sample": sample_body if isinstance(sample_body, str) else json.dumps(sample_body),
        }, timeout=15).json()
        print(f"\n=== {key}（模板 id={cur['id']}，{'已启用' if cur.get('enabled') else '禁用'}）===")
        if not r.get("success"):
            print(f"  ✗ 模板解析失败: {r.get('error')}")
            continue
        mapped = r["data"]["mapped"]
        print(f"  模型字段命中: {r['data']['model_hit']}/{r['data']['model_total']}")
        diffs = []
        for f in COMPARE_FIELDS:
            b, m = bench.get(f), mapped.get(f)
            if b in (None, "") and m in (None, ""):
                continue
            bs, ms = str(b), str(m)
            mark = "✓" if bs == ms else "✗"
            if bs != ms:
                diffs.append((f, bs, ms))
            print(f"  {mark} {f:<10} 内置={bs[:44]!r:<48} 模板={ms[:44]!r}")
        extra = [k for k in mapped if k not in bench and k not in
                 ("parse_profile",) and not k.startswith("_")]
        if extra:
            print(f"  + 模板多出: {extra[:8]}")
        if diffs:
            print(f"  ⇒ {len(diffs)} 处差异（见 ✗），启用前需确认口径可接受")


def set_enabled(session, keys, enabled):
    profiles = (session.get(f"{PL_API}/parse-profiles", timeout=10).json().get("data") or [])
    if isinstance(profiles, dict):
        profiles = profiles.get("profiles") or profiles.get("items") or []
    targets = [p for p in profiles
               if (keys == ["all"] or any(p.get("name", "").lower().startswith(k) for k in keys))]
    for p in targets:
        r = session.patch(f"{PL_API}/parse-profiles/{p['id']}",
                          json={"enabled": enabled}, timeout=15)
        ok = r.status_code == 200
        print(f"  · {p['name']}  id={p['id']} → {'启用' if enabled else '禁用'}"
              f"{'' if ok else ' ✗ ' + r.text[:120]}")
    if enabled:
        print("\n⚠ 已启用即接管对应 topic 解析（优先于内置解析器）。")
        print("  发一条真实告警并在「安全告警」核字段；异常时用 --deactivate all 一键回退。")


def main():
    ap = argparse.ArgumentParser(description="内置产品日志解析映射模板")
    ap.add_argument("--api-base", default=API_BASE)
    ap.add_argument("--user", default="admin")
    ap.add_argument("--password", default="admin123")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verify", action="store_true", help="对比模板解析 vs 内置解析")
    ap.add_argument("--activate", nargs="*", metavar="KEY",
                    help="启用模板（可跟产品 key，缺省全部）")
    ap.add_argument("--deactivate", nargs="*", metavar="KEY",
                    help="禁用模板退回内置解析器（all=全部）")
    args = ap.parse_args()

    s = _login(args.api_base, args.user, args.password)
    if args.verify:
        verify(s)
    elif args.activate is not None:
        set_enabled(s, args.activate or ["all"], True)
    elif args.deactivate is not None:
        set_enabled(s, args.deactivate or ["all"], False)
    else:
        upsert_templates(s, dry_run=args.dry_run)
        print("\n下一步：--verify 对比口径；确认后 --activate <key> 启用（接管解析）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
