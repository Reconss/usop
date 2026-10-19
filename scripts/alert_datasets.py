#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
USOP · 公开安全告警数据集模块
=============================

为 `kafka_alert_sender.py` 与 `kafka_alert_gui.py` 提供「真实告警数据集」能力：
从 GitHub 公开仓库拉取**真实设备告警样本**并灌入 Kafka，用于联调、压测与演示。

为什么需要
----------
合成告警（生成器）适合压测，但缺少真实攻击的分布与语义。公开数据集提供的
是**真实抓包/真实规则命中**产生的告警，签名、分类、端口、协议分布都贴近实战。

内置数据集（均已核实：真实 eve.json，字段与平台 parse_suricata 完全兼容）
--------------------------------------------------------------------------
  suricata-wrccdc-2017      WRCCDC 2017 红蓝对抗 · 161 条
  suricata-wrccdc-2018      WRCCDC 2018 红蓝对抗 · 207 条
  suricata-first-2015       FIRST 2015 安全大会流量 · 136 条
  suricata-honeypot-2018    蜜罐 2018 互联网背景流量 · 44 条
  来源: github.com/FrankHassanabad/suricata-sample-data

下载策略
--------
1. 优先 `gh api`（已认证时最稳，且能穿透部分网络限制）；
2. 回退 urllib 直连 raw.githubusercontent.com。

时间戳处理
----------
样本时间多为 2015–2019 年，直接灌入会让告警「沉底」到历史深处，在平台的
时间排序列表里几乎看不到。默认启用 **时序保持映射**：以数据集内最新一条为
基准，把整批数据平移到「最新一条 = 当前时刻」，保留告警之间的相对间隔
（攻击节奏、爆发特征因此不失真）。用 `refresh_time=False` 可关闭以保留原始时间。

依赖
----
仅标准库（`gh` CLI 可选，用于更稳的下载）。
"""

import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# 数据集注册表
# ---------------------------------------------------------------------------

_REPO = "FrankHassanabad/suricata-sample-data"

DATASETS = {
    "suricata-wrccdc-2017": {
        "name": "WRCCDC 2017 红蓝对抗",
        "product": "suricata",
        "topic": "suricata-alert",
        "repo": _REPO,
        "path": "samples/wrccdc-2017/alerts-only.json",
        "count": 161,
        "desc": "西部区域大学生网络防御竞赛 tcpdump 重放产生的 Suricata 告警",
    },
    "suricata-wrccdc-2018": {
        "name": "WRCCDC 2018 红蓝对抗",
        "product": "suricata",
        "topic": "suricata-alert",
        "repo": _REPO,
        "path": "samples/wrccdc-2018/alerts-only.json",
        "count": 207,
        "desc": "WRCCDC 2018 赛事流量告警，含完整攻击链扫描与利用阶段",
    },
    "suricata-first-2015": {
        "name": "FIRST 2015 大会流量",
        "product": "suricata",
        "topic": "suricata-alert",
        "repo": _REPO,
        "path": "samples/first-org-conf-2015/alerts-only.json",
        "count": 136,
        "desc": "FIRST 年度安全大会现场网络流量告警样本",
    },
    "suricata-honeypot-2018": {
        "name": "蜜罐 2018 背景流量",
        "product": "suricata",
        "topic": "suricata-alert",
        "repo": _REPO,
        "path": "samples/honeypot-2018/alerts-only.json",
        "count": 44,
        "desc": "公网蜜罐捕获的互联网背景噪声（扫描、爆破、探测）",
    },
}

# 缓存目录：与脚本同级的 .datasets/
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".datasets")


def cache_path(ds_id: str) -> str:
    return os.path.join(CACHE_DIR, f"{ds_id}.json")


def is_cached(ds_id: str) -> bool:
    p = cache_path(ds_id)
    return os.path.isfile(p) and os.path.getsize(p) > 0


def raw_url(ds: dict) -> str:
    return f"https://raw.githubusercontent.com/{ds['repo']}/master/{ds['path']}"


# ---------------------------------------------------------------------------
# 下载
# ---------------------------------------------------------------------------

def _download_via_gh(url_path: str, repo: str) -> bytes:
    """用 gh api 下载（Accept: application/vnd.github.raw 返回原始内容）。"""
    out = subprocess.run(
        ["gh", "api", f"repos/{repo}/contents/{url_path}",
         "-H", "Accept: application/vnd.github.raw"],
        capture_output=True, timeout=120,
    )
    if out.returncode != 0:
        raise RuntimeError(out.stderr.decode("utf-8", "ignore").strip()[:300])
    return out.stdout


def _download_via_http(url: str) -> bytes:
    from urllib.request import Request, urlopen
    req = Request(url, headers={"User-Agent": "usop-alert-sender"})
    with urlopen(req, timeout=120) as r:
        return r.read()


def fetch(ds_id: str, force: bool = False, log=print) -> str:
    """下载数据集到本地缓存，返回缓存文件路径。"""
    ds = _require(ds_id)
    dst = cache_path(ds_id)
    if is_cached(ds_id) and not force:
        log(f"  ✓ 已缓存，直接使用: {dst}")
        return dst

    os.makedirs(CACHE_DIR, exist_ok=True)
    log(f"  ↓ 下载 {ds['name']}  ({ds['repo']}/{ds['path']})")

    data = None
    last_err = None
    # 1) gh api（优先）
    if shutil.which("gh"):
        try:
            data = _download_via_gh(ds["path"], ds["repo"])
            log("    · 下载方式: gh api")
        except Exception as e:
            last_err = e
    # 2) urllib 直连
    if data is None:
        try:
            data = _download_via_http(raw_url(ds))
            log("    · 下载方式: https 直连")
        except Exception as e:
            last_err = e

    if not data:
        raise RuntimeError(f"下载失败: {last_err}")

    # 校验必须是合法 JSON
    try:
        parsed = json.loads(data.decode("utf-8"))
    except Exception as e:
        raise RuntimeError(f"下载内容不是合法 JSON: {e}")

    n = len(parsed) if isinstance(parsed, list) else 1
    tmp = dst + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(data.decode("utf-8"))
    os.replace(tmp, dst)
    log(f"  ✓ 已保存 {n} 条 -> {dst}")
    return dst


def _require(ds_id: str) -> dict:
    if ds_id not in DATASETS:
        raise KeyError(f"未知数据集: {ds_id}\n可选: {', '.join(DATASETS)}")
    return DATASETS[ds_id]


# ---------------------------------------------------------------------------
# 加载
# ---------------------------------------------------------------------------

def _parse_ts(value):
    """容错解析 Suricata 时间戳（带/不带时区、带/不带微秒）。"""
    if not isinstance(value, str) or not value:
        return None
    s = value.strip()
    # Python 3.11+ fromisoformat 已能处理 ±HHMM 与 Z
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        pass
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z",
                "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S",
                "%Y/%m/%d-%H:%M:%S.%f"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _fmt_ts(dt: datetime) -> str:
    """输出解析器友好的时间戳（+0000 时区，与平台 _build_sample 一致）。"""
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond:06d}"[:6] + "+0000"


def load_records(path_or_id: str, limit: int = None,
                 refresh_time: bool = True, event_type_filter: str = None,
                 log=print):
    """加载告警记录。

    :param path_or_id: 数据集 id（先查缓存、缺失则自动下载）或本地文件路径
    :param limit:      最多返回条数（None = 全部）
    :param refresh_time: 将时间整体平移到「最新一条 = 当前」，保留相对间隔
    :param event_type_filter: 仅保留指定 event_type（Suricata 常用 'alert'）
    """
    # 解析来源
    if path_or_id in DATASETS:
        path = cache_path(path_or_id) if is_cached(path_or_id) else fetch(path_or_id, log=log)
    else:
        path = path_or_id
        if not os.path.isfile(path):
            raise FileNotFoundError(f"文件不存在: {path}")

    with open(path, "r", encoding="utf-8") as f:
        text = f.read().strip()

    records = []
    # 先按「JSON 数组」解析；失败则按 JSONL（每行一个 JSON）解析
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            records = [r for r in parsed if isinstance(r, dict)]
        elif isinstance(parsed, dict):
            records = [parsed]
    except json.JSONDecodeError:
        for line in text.splitlines():
            line = line.strip().rstrip(",")
            if not line or line in ("[", "]", "{", "}"):
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict):
                records.append(obj)

    # 过滤 event_type
    if event_type_filter:
        before = len(records)
        records = [r for r in records if r.get("event_type") == event_type_filter]
        if before != len(records) and log:
            log(f"    · event_type={event_type_filter} 过滤: {before} -> {len(records)}")

    if limit and limit > 0:
        records = records[:limit]

    # 时间平移：保留相对间隔，把最新一条对齐到当前
    if refresh_time and records:
        stamps = [_parse_ts(r.get("timestamp")) for r in records]
        valid = [t for t in stamps if t]
        if valid:
            newest = max(valid)
            now = datetime.now(timezone.utc)
            delta = now - newest
            moved = 0
            for r, t in zip(records, stamps):
                if t:
                    r["timestamp"] = _fmt_ts(t + delta)
                    moved += 1
            if moved and log:
                span = (max(valid) - min(valid)).total_seconds()
                log(f"    · 时间映射：{moved} 条整体前移，保留 {span:.0f}s 相对时序，"
                    f"最新一条对齐当前时刻")

    return records


def dataset_state():
    """返回各数据集的 id/名称/条数/是否已缓存，供 GUI 与 list 使用。"""
    out = []
    for ds_id, ds in DATASETS.items():
        out.append({
            "id": ds_id,
            "name": ds["name"],
            "product": ds["product"],
            "topic": ds["topic"],
            "count": ds["count"],
            "desc": ds["desc"],
            "repo": ds["repo"],
            "cached": is_cached(ds_id),
        })
    return out


# ---------------------------------------------------------------------------
# CLI 自检（python alert_datasets.py list / fetch <id>）
# ---------------------------------------------------------------------------

def _main(argv):
    cmd = argv[0] if argv else "list"
    if cmd == "list":
        print("内置公开告警数据集：\n")
        print(f"  {'id':<26}{'产品':<11}{'条数':<7}{'缓存':<7}说明")
        print(f"  {'-'*26}{'-'*11}{'-'*7}{'-'*7}{'-'*34}")
        for d in dataset_state():
            print(f"  {d['id']:<26}{d['product']:<11}{d['count']:<7}"
                  f"{'是' if d['cached'] else '否':<7}{d['desc']}")
        return 0
    if cmd == "fetch":
        for ds_id in argv[1:] or list(DATASETS):
            print(f"[{ds_id}]")
            fetch(ds_id, force=True)
        return 0
    if cmd == "preview":
        ds_id = argv[1] if len(argv) > 1 else list(DATASETS)[0]
        n = int(argv[2]) if len(argv) > 2 else 2
        for i, r in enumerate(load_records(ds_id, limit=n), 1):
            print(f"--- #{i} ---")
            print(json.dumps(r, ensure_ascii=False, indent=2))
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
