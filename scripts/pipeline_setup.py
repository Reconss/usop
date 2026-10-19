#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
USOP · 安全告警全链路配置脚本（接入 / 解析 / 过滤 / 分流输出 / 存储）
==================================================================

按产品批量配置告警流水线的五段配置，幂等可重复执行：

  ① 接入：DataSource（Kafka topic、产品类型、日志类型、状态）
  ② 解析：内置解析器（PARSER_REGISTRY）或 ParseProfile（日志解析配置）
  ③ 过滤：AlertFilterRule（按来源 topic 命中 → 进「被过滤」分支）
  ④ 分流输出：AlertDispatchPolicy + AlertExit（去重/白名单开关 + 两分支出口 topic）
  ⑤ 存储：AlertStorageRoute（topic → ES 索引，真实落盘）

重要事实（决定本脚本的行为）
----------------------------
1. **解析配置优先于内置解析器**：流水线先尝试 ParseProfile，未命中才用
   PARSER_REGISTRY（pipeline.py `_consume_topic`）。因此对已有内置解析器的产品
   （suricata/wazuh/imperva/crowdstrike/modsecurity）**默认不建 ParseProfile**，
   否则会覆盖掉成熟的内置解析逻辑。需要时用 `--force-profiles` 显式开启。
2. **真正落盘的是 AlertStorageRoute**：DataSource 的 storage_* 字段只被
   数据源 CRUD 读写（UI 展示/编辑），不参与实际写入；脚本两者都配并在报告中区分说明。
3. **分流出口不要改成 per-product 索引**：平台告警列表读 `alerts-valid`，
   把有效告警出口改到别的 topic/索引会让告警从主列表消失。故本脚本统一
   valid → valid-alerts，filtered → invalid-alerts。
4. **无匹配策略时流水线用内置默认策略**（dedup+whitelist 开，出口同 3），
   行为与本脚本建的显式策略一致；显式建的目的只是可按产品单独调开关与出口。

用法
----
  python pipeline_setup.py                 # 应用配置（幂等）
  python pipeline_setup.py --dry-run       # 只打印将要做的变更
  python pipeline_setup.py --force-profiles  # 连内置产品也建解析配置（谨慎）
  python pipeline_setup.py --enable-noise-filter  # 连降噪类规则也一并启用（默认只建不启）

依赖：pip install requests
"""

import argparse
import json
import sys

import requests

API_BASE = "http://localhost:5001"
DS_API = f"{API_BASE}/api/datasources-api"
PL_API = f"{API_BASE}/api/pipeline"


# ---------------------------------------------------------------------------
# 产品配置表
#   builtin=True  → 已有内置解析器（PARSER_REGISTRY），默认不建 ParseProfile
#   builtin=False → 无内置解析器，必须靠 ParseProfile，缺失则创建
# ---------------------------------------------------------------------------

PRODUCTS = {
    "suricata": {
        "topic": "suricata-alert",
        "label": "Suricata 入侵检测",
        "log_type": ("ids_logs", "入侵检测日志"),
        "retention": 90,
        "builtin": True,
        "desc": "NIDS 网络入侵检测告警（eve.json）",
    },
    "wazuh": {
        "topic": "wazuh-alert",
        "label": "Wazuh 主机安全",
        "log_type": ("edr_logs", "终端安全日志"),
        "retention": 180,
        "builtin": True,
        "desc": "HIDS/SIEM 主机告警（alerts.json）",
    },
    "crowdstrike": {
        "topic": "crowdstrike-alert",
        "label": "CrowdStrike EDR",
        "log_type": ("edr_logs", "终端安全日志"),
        "retention": 180,
        "builtin": True,
        "desc": "EDR 终端检测告警（Falcon DetectionSummaryEvent）",
    },
    "imperva": {
        "topic": "imperva-alert",
        "label": "Imperva WAF",
        "log_type": ("waf_logs", "WAF日志"),
        "retention": 60,
        "builtin": True,
        "desc": "WAF Web 攻击告警（LEEF）",
    },
    "modsecurity": {
        "topic": "modsecurity-alert",
        "label": "ModSecurity WAF",
        "log_type": ("waf_logs", "WAF日志"),
        "retention": 60,
        "builtin": True,
        "desc": "WAF Web 攻击告警（Apache error log）",
    },
    "chaitin-waf": {
        "topic": "chaitin-waf-alert",
        "label": "长亭雷池 WAF",
        "log_type": ("waf_logs", "WAF日志"),
        "retention": 60,
        "builtin": False,
        "desc": "长亭 WAF 告警（JSON，走日志解析配置）",
    },
    "qingteng-hids": {
        "topic": "qingteng-hids-alert",
        "label": "青藤云 HIDS",
        "log_type": ("edr_logs", "终端安全日志"),
        "retention": 180,
        "builtin": False,
        "desc": "青藤主机安全告警（JSON，走日志解析配置）",
    },
}

# 无内置解析器产品的解析配置（json 方式 + 字段映射）
PROFILE_DEFS = {
    "chaitin-waf": {
        "name": "长亭WAF告警解析",
        "match_type": "json",
        "field_mappings": [],
    },
    "qingteng-hids": {
        "name": "青藤云HIDS告警解析",
        "match_type": "json",
        "field_mappings": [],
    },
}

# ---------------------------------------------------------------------------
# ③ 过滤规则模板
#   命中 → 进「被过滤」分支（最终落 alerts-invalid），因此默认只启「绝不误伤」的规则，
#   降噪类规则建为禁用模板，需人工确认后开启（或用 --enable-noise-filter 直接启用）。
#   topic = 产品设备 topic（告警的 source_topic 字段；'*' 为全局）
# ---------------------------------------------------------------------------

FILTER_RULE_TEMPLATES = [
    # (名称后缀, field, operator, value, 是否降噪类)
    # ⚠️ noise_marker 不是标准告警字段，标准化阶段会被丢弃（实测：字段不进
    #    ALERT_MAPPING，过滤判定读到空串，规则永不命中）。故归为降噪类（默认禁用），
    #    仅作占位模板；真正默认生效的是下面基于 title 的规则。
    ("调试标记过滤", "noise_marker", "eq", "true", True),
    ("测试告警过滤", "title", "contains", "测试告警", False),
    ("低危告警降噪", "severity", "eq", "low", True),
    ("扫描器噪声降噪", "title", "contains", "NMAP", True),
]

# 标准告警字段（标准化后会保留的字段；过滤规则的 field 必须在这里，否则永不命中）
STANDARD_ALERT_FIELDS = {
    "title", "description", "severity", "status", "category",
    "source", "source_product", "src_ip", "src_port", "dst_ip", "dst_port",
    "protocol", "hostname", "raw_log", "alert_id", "timestamp",
}

# 产品专属降噪规则（默认禁用模板）
PRODUCT_NOISE_RULES = {
    "suricata": ("流重组噪声降噪", "title", "contains", "SURICATA STREAM"),
    "wazuh": ("系统级噪声降噪", "title", "contains", "Windows Logon Success"),
    "modsecurity": ("规则引擎提示降噪", "title", "contains", "ModSecurity: Warning"),
}

# ---------------------------------------------------------------------------
# ④ 分流策略：来源 topic → 判定开关 + 两分支出口
# ---------------------------------------------------------------------------

DISPATCH_EXITS = [
    {"branch": "valid", "target_topic": "valid-alerts", "enabled": True, "sort_order": 0},
    {"branch": "filtered", "target_topic": "invalid-alerts", "enabled": True, "sort_order": 1},
]

# 兜底全局策略（修正平台播种的那条：名字叫"全局"但 source_topic 只覆盖两个旧 topic）
GLOBAL_POLICY_NAME = "默认分流（全局）"

# 系统存储路由（真实生效：topic → ES 索引）
STORAGE_ROUTES = [
    {"name": "有效告警存储（系统）", "source_topic": "valid-alerts",
     "index_name": "alerts-valid", "id_field": "alert_id"},
    {"name": "无效告警隔离存储（系统）", "source_topic": "invalid-alerts",
     "index_name": "alerts-invalid", "id_field": "alert_id"},
]


# ---------------------------------------------------------------------------
# 辅助
# ---------------------------------------------------------------------------

def _get_list(url, session, keys=("data",)):
    r = session.get(url, timeout=10)
    if r.status_code != 200:
        return []
    d = r.json().get("data")
    if isinstance(d, list):
        return d
    if isinstance(d, dict):
        for k in ("items", "list", "sources", "routes", "profiles"):
            if isinstance(d.get(k), list):
                return d[k]
    return []


def setup(session, dry_run=False, force_profiles=False, enable_noise=False,
          keep_dead=False):
    print("① 接入配置（DataSource）")
    sources = _get_list(f"{DS_API}/datasources", session)
    by_topic = {s.get("kafka_topic"): s for s in sources if isinstance(s, dict)}

    profiles = _get_list(f"{PL_API}/parse-profiles", session)
    profile_by_name = {p.get("name"): p for p in profiles if isinstance(p, dict)}

    for key, cfg in PRODUCTS.items():
        topic = cfg["topic"]
        src = by_topic.get(topic)
        if not src:
            print(f"  · {key:<14} 无数据源，创建中… topic={topic}")
            if not dry_run:
                r = session.post(f"{PL_API}/device-topics",
                                 json={"topic": topic, "device_type": key}, timeout=15)
                ok = r.status_code in (200, 201) and r.json().get("success")
                print(f"    {'✓ 已创建' if ok else '✗ 创建失败: ' + r.text[:120]}")
            continue

        sid = src["id"]
        need_products = (src.get("product_type") or "").lower() != key
        action = "修正 product_type" if need_products else "已正确"
        print(f"  · {key:<14} id={sid:<3} topic={topic:<22} product_type="
              f"{src.get('product_type')!r} → {action}")

        if dry_run:
            continue

        if need_products:
            # 注意：该 PUT 接口用下划线命名（product_type），与 mapping 接口的驼峰不同
            r = session.put(f"{DS_API}/datasources/{sid}",
                            json={"product_type": key, "name": cfg["label"]}, timeout=15)
            ok = r.status_code == 200 and r.json().get("success")
            print(f"    {'✓ product_type 已修正' if ok else '✗ 修正失败: ' + r.text[:120]}")

        # 关联配置：日志类型 + 解析管道 + 存储元数据
        mapping = {
            "logTypeId": cfg["log_type"][0],
            "logTypeName": cfg["log_type"][1],
            "storageTableName": f"alerts_{key.replace('-', '_')}",
            "storageRetentionDays": cfg["retention"],
            "storagePartition": "1d",
            "storageCompression": True,
            "storageIndexes": ["src_ip", "dst_ip", "severity",
                               "source_product", "timestamp"],
        }
        prof = profile_by_name.get(PROFILE_DEFS.get(key, {}).get("name", ""))
        if prof:
            mapping["pipelineIds"] = [prof["id"]]
            mapping["pipelineNames"] = [prof["name"]]
        r = session.post(f"{DS_API}/datasources/{sid}/mapping", json=mapping, timeout=15)
        ok = r.status_code == 200 and r.json().get("success")
        print(f"    {'✓ 已配置' if ok else '✗ 配置失败: ' + r.text[:120]}"
              f" 日志类型={cfg['log_type'][1]} 保留={cfg['retention']}天"
              f" 解析={'配置#' + str(prof['id']) if prof else '内置'}")

    print("\n② 解析配置（ParseProfile / 内置解析器）")
    for key, cfg in PRODUCTS.items():
        if cfg["builtin"] and not force_profiles:
            print(f"  · {key:<14} 内置解析器（PARSER_REGISTRY）—— 不建解析配置，避免覆盖")
            continue
        pdef = PROFILE_DEFS.get(key)
        if not pdef:
            if cfg["builtin"] and force_profiles:
                print(f"  · {key:<14} 未定义字段映射，跳过（内置解析器已足够）")
            continue
        existing = profile_by_name.get(pdef["name"])
        if existing:
            print(f"  · {key:<14} 解析配置已存在 id={existing['id']} "
                  f"({existing.get('match_type')}) topic={existing.get('topic')}")
            continue
        print(f"  · {key:<14} 创建解析配置：{pdef['name']}")
        if not dry_run:
            r = session.post(f"{PL_API}/parse-profiles", json={
                "name": pdef["name"], "topic": cfg["topic"],
                "match_type": pdef["match_type"],
                "field_mappings": pdef["field_mappings"], "enabled": True,
            }, timeout=15)
            ok = r.status_code in (200, 201)
            print(f"    {'✓ 已创建' if ok else '✗ 失败: ' + r.text[:150]}")

    print("\n③ 过滤规则（AlertFilterRule：命中 → 被过滤分支 → alerts-invalid）")
    _setup_filter_rules(session, dry_run, enable_noise, keep_dead)

    print("\n④ 分流输出（AlertDispatchPolicy + AlertExit）")
    _setup_dispatch(session, dry_run)

    print("\n⑤ 存储配置（AlertStorageRoute，真实生效）")
    routes = _get_list(f"{PL_API}/storage-routes", session)
    have = {(r.get("source_topic"), r.get("index_name")) for r in routes if isinstance(r, dict)}
    for rt in STORAGE_ROUTES:
        k = (rt["source_topic"], rt["index_name"])
        if k in have:
            row = next(r for r in routes
                       if (r.get("source_topic"), r.get("index_name")) == k)
            print(f"  · {rt['source_topic']} → {rt['index_name']}  已存在"
                  f" id={row.get('id')} enabled={row.get('enabled')}")
            continue
        print(f"  · {rt['source_topic']} → {rt['index_name']}  创建中…")
        if not dry_run:
            r = session.post(f"{PL_API}/storage-routes", json=rt, timeout=15)
            ok = r.status_code in (200, 201)
            print(f"    {'✓ 已创建' if ok else '✗ 失败: ' + r.text[:150]}")
    print("  注：DataSource 的 storage_* 为平台 UI 元数据，实际写入由以上存储路由完成。")
    print("     不要把有效告警出口改到 per-product 索引——平台告警列表读 alerts-valid。")


def _setup_filter_rules(session, dry_run, enable_noise, keep_dead=False):
    existing = _get_list(f"{PL_API}/filter-rules", session)
    # 幂等键：同一 (topic, name) 视为同一条规则
    have = {(r.get("topic"), r.get("name")): r for r in existing if isinstance(r, dict)}

    for key, cfg in PRODUCTS.items():
        topic = cfg["topic"]
        label = cfg["label"]
        specs = [(f"{label} {suf}", f, op, v, noise)
                 for suf, f, op, v, noise in FILTER_RULE_TEMPLATES]
        extra = PRODUCT_NOISE_RULES.get(key)
        if extra:
            specs.append((f"{label} {extra[0]}", extra[1], extra[2], extra[3], True))

        for name, field, op, value, is_noise in specs:
            enabled = (not is_noise) or enable_noise
            cur = have.get((topic, name))
            if cur:
                changed = (str(cur.get("enabled")) != str(enabled)
                           or cur.get("field") != field or cur.get("operator") != op
                           or str(cur.get("value")) != value)
                tag = "启用" if cur.get("enabled") else "禁用"
                if changed and not dry_run:
                    r = session.patch(f"{PL_API}/filter-rules/{cur['id']}", json={
                        "name": name, "topic": topic, "field": field,
                        "operator": op, "value": value, "enabled": enabled}, timeout=15)
                    ok = r.status_code == 200 and r.json().get("success")
                    print(f"  · {key:<14} {name}  → 已更新为"
                          f"{'启用' if enabled else '禁用'}"
                          f"{'' if ok else ' ✗ ' + r.text[:100]}")
                else:
                    print(f"  · {key:<14} {name}  已存在 id={cur['id']}（{tag}）")
                continue

            print(f"  · {key:<14} {name}  创建"
                  f"（{'启用' if enabled else '禁用模板'}）")
            if not dry_run:
                r = session.post(f"{PL_API}/filter-rules", json={
                    "name": name, "topic": topic, "field": field,
                    "operator": op, "value": value, "enabled": enabled}, timeout=15)
                ok = r.status_code in (200, 201) and r.json().get("success")
                print(f"    {'✓ 已创建' if ok else '✗ 失败: ' + r.text[:120]}")

    # 死规则体检：field 不是标准告警字段 → 标准化后取值为空，规则永不命中
    dead = [r for r in _get_list(f"{PL_API}/filter-rules", session)
            if isinstance(r, dict) and r.get("enabled")
            and (r.get("field") or "") not in STANDARD_ALERT_FIELDS]
    if dead:
        print(f"\n  ⚠ 死规则体检：{len(dead)} 条启用规则的字段不是标准告警字段"
              f"（标准化后为空，永不命中）")
        for r in dead:
            print(f"    - id={r['id']} topic={r.get('topic')} {r.get('name')} "
                  f"field={r.get('field')}")
            if not dry_run and not keep_dead:
                session.patch(f"{PL_API}/filter-rules/{r['id']}",
                              json={"enabled": False}, timeout=15)
                print("      → 已禁用（如需保留用 --keep-dead-rules）")
    else:
        print("\n  ✓ 死规则体检：无（启用规则的字段均为标准告警字段）")


def _setup_dispatch(session, dry_run):
    policies = _get_list(f"{PL_API}/dispatch-policies", session)
    by_name = {p.get("name"): p for p in policies if isinstance(p, dict)}

    # 1) 兜底全局策略：名不副实（source_topic 只覆盖两个旧 topic）→ 修正为真正的 *
    glob = by_name.get(GLOBAL_POLICY_NAME)
    if glob:
        srcs = [t for t in (glob.get("source_topic") or "*").split(",") if t]
        if srcs != ["*"]:
            print(f"  · 全局策略 id={glob['id']} source_topic={glob.get('source_topic')!r}"
                  f" 名不副实 → 修正为 '*'")
            if not dry_run:
                r = session.patch(f"{PL_API}/dispatch-policies/{glob['id']}", json={
                    "name": GLOBAL_POLICY_NAME, "source_topics": ["*"],
                    "dedup_enabled": True, "whitelist_enabled": True,
                    "enabled": True, "sort_order": 0, "exits": DISPATCH_EXITS}, timeout=15)
                ok = r.status_code == 200 and r.json().get("success")
                print(f"    {'✓ 已修正' if ok else '✗ 失败: ' + r.text[:150]}")
        else:
            print(f"  · 全局策略 id={glob['id']} 已为 '*'（兜底）")
    else:
        print(f"  · 创建全局兜底策略：{GLOBAL_POLICY_NAME}")
        if not dry_run:
            r = session.post(f"{PL_API}/dispatch-policies", json={
                "name": GLOBAL_POLICY_NAME, "source_topics": ["*"],
                "dedup_enabled": True, "whitelist_enabled": True,
                "enabled": True, "sort_order": 0, "exits": DISPATCH_EXITS}, timeout=15)
            ok = r.status_code in (200, 201) and r.json().get("success")
            print(f"    {'✓ 已创建' if ok else '✗ 失败: ' + r.text[:150]}")

    # 2) 每个产品一条精确策略（优先级高于全局，可按产品单独调开关/出口）
    for key, cfg in PRODUCTS.items():
        topic, label = cfg["topic"], cfg["label"]
        name = f"{label} 分流策略"
        cur = by_name.get(name)
        payload = {"name": name, "source_topics": [topic],
                   "dedup_enabled": True, "whitelist_enabled": True,
                   "enabled": True, "sort_order": 10, "exits": DISPATCH_EXITS}
        if cur:
            need_fix = (
                (cur.get("source_topic") or "") != topic
                or not cur.get("dedup_enabled")
                or not cur.get("whitelist_enabled")
                or not cur.get("enabled")
                or not [e for e in (cur.get("exits") or []) if e.get("branch") == "valid"]
                or not [e for e in (cur.get("exits") or []) if e.get("branch") == "filtered"]
            )
            if not need_fix:
                print(f"  · {key:<14} 策略 id={cur['id']} 已正确 "
                      f"（去重✓ 白名单✓ → valid-alerts / invalid-alerts）")
                continue
            print(f"  · {key:<14} 策略 id={cur['id']} 配置不完整 → 更新")
            if not dry_run:
                r = session.patch(f"{PL_API}/dispatch-policies/{cur['id']}",
                                  json=payload, timeout=15)
                ok = r.status_code == 200 and r.json().get("success")
                print(f"    {'✓ 已更新' if ok else '✗ 失败: ' + r.text[:150]}")
            continue

        print(f"  · {key:<14} 创建策略：{name}（{topic} → valid-alerts / invalid-alerts）")
        if not dry_run:
            r = session.post(f"{PL_API}/dispatch-policies", json=payload, timeout=15)
            ok = r.status_code in (200, 201) and r.json().get("success")
            print(f"    {'✓ 已创建' if ok else '✗ 失败: ' + r.text[:150]}")


def main():
    ap = argparse.ArgumentParser(description="配置安全告警的接入/解析/存储")
    ap.add_argument("--api-base", default=API_BASE)
    ap.add_argument("--user", default="admin")
    ap.add_argument("--password", default="admin123")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force-profiles", action="store_true",
                    help="连已有内置解析器的产品也建 ParseProfile（会覆盖内置解析，谨慎）")
    ap.add_argument("--keep-dead-rules", action="store_true",
                    help="保留字段非标准、永不命中的死规则（默认会禁用它们）")
    ap.add_argument("--enable-noise-filter", action="store_true",
                    help="把降噪类过滤规则也一并启用（默认只建为禁用模板，避免误伤真实告警）")
    args = ap.parse_args()

    global DS_API, PL_API
    DS_API = f"{args.api_base}/api/datasources-api"
    PL_API = f"{args.api_base}/api/pipeline"

    s = requests.Session()
    r = s.post(f"{args.api_base}/api/auth/login",
               json={"username": args.user, "password": args.password}, timeout=10)
    token = (r.json().get("data") or {}).get("token")
    if not token:
        print(f"✗ 登录失败: {r.status_code} {r.text[:200]}")
        return 1
    s.headers.update({"Authorization": f"Bearer {token}"})

    print(f"✓ 已登录 {args.api_base}"
          f"{'（DRY-RUN，不做变更）' if args.dry_run else ''}\n")
    setup(s, dry_run=args.dry_run, force_profiles=args.force_profiles,
          enable_noise=args.enable_noise_filter, keep_dead=args.keep_dead_rules)
    print("\n完成。可在「数据源管理 / 日志解析 / 过滤规则 / 分流策略 / 存储任务」页面查看。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
