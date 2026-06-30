"""
USOP Scanner Service — 独立的扫描引擎 REST API
所有扫描工具运行在容器内，通过 HTTP 接口对外提供服务
"""
import os
import json
import subprocess
import logging
import tempfile
from datetime import datetime
from typing import Optional, List, Dict
from flask import Flask, request, jsonify

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("scanner")

app = Flask(__name__)

# ==================== 工具检测 ====================

TOOLS = {}

def _check_tool(name: str, cmd: list) -> bool:
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=5)
        TOOLS[name] = r.returncode == 0
        return TOOLS[name]
    except Exception:
        TOOLS[name] = False
        return False

_check_tool("nmap", ["nmap", "--version"])
_check_tool("masscan", ["masscan", "--version"])
_check_tool("naabu", ["naabu", "-version"])
_check_tool("nuclei", ["nuclei", "-version"])
_check_tool("httpx", ["httpx", "-version"])
_check_tool("subfinder", ["subfinder", "-version"])
_check_tool("tlsx", ["tlsx", "-version"])

logger.info(f"可用工具: {[k for k, v in TOOLS.items() if v]}")
logger.info(f"不可用: {[k for k, v in TOOLS.items() if not v]}")


# ==================== 工具调用封装 ====================

def _run_cmd(cmd: list, timeout: int = 300) -> tuple:
    """执行命令，返回 (stdout, stderr, returncode)"""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.stdout, r.stderr, r.returncode
    except subprocess.TimeoutExpired:
        return "", "TIMEOUT", -1
    except FileNotFoundError:
        return "", "TOOL_NOT_FOUND", -2


def naabu_scan(target: str, ports: str = "top-1000",
               proxy: Optional[str] = None) -> List[Dict]:
    """Naabu 端口扫描"""
    if not TOOLS.get("naabu"):
        return [{"error": "naabu not installed"}]
    cmd = ["naabu", "-host", target, "-p", ports, "-json", "-silent"]
    if proxy:
        cmd += ["-proxy", proxy]
    stdout, stderr, rc = _run_cmd(cmd, timeout=300)
    results = []
    for line in stdout.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
            results.append({
                "port": item.get("port"), "protocol": item.get("protocol", "tcp"),
                "state": "open", "ip": item.get("ip", ""),
                "host": item.get("host", target)
            })
        except json.JSONDecodeError:
            pass
    return results


def nuclei_scan(target: str, templates: Optional[str] = None,
                severity: Optional[str] = None,
                proxy: Optional[str] = None) -> List[Dict]:
    """Nuclei 漏洞扫描"""
    if not TOOLS.get("nuclei"):
        return [{"error": "nuclei not installed"}]
    cmd = ["nuclei", "-target", target, "-json", "-silent"]
    if templates:
        cmd += ["-t", templates]
    if severity:
        cmd += ["-severity", severity]
    if proxy:
        cmd = ["proxychains4", "-q"] + cmd
    stdout, stderr, rc = _run_cmd(cmd, timeout=600)
    results = []
    for line in stdout.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
            results.append({
                "template": item.get("template-id", ""),
                "name": item.get("info", {}).get("name", ""),
                "severity": item.get("info", {}).get("severity", "medium"),
                "description": item.get("info", {}).get("description", ""),
                "matched": item.get("matched-at", ""),
                "type": item.get("type", "vulnerability"),
                "host": item.get("host", target),
                "curl": item.get("curl-command", ""),
                "extracted_results": item.get("extracted-results", [])
            })
        except json.JSONDecodeError:
            continue
    return results


def httpx_scan(target: str, proxy: Optional[str] = None) -> List[Dict]:
    """httpx HTTP 探针"""
    if not TOOLS.get("httpx"):
        return [{"error": "httpx not installed"}]
    cmd = ["httpx", "-u", target, "-json", "-silent",
           "-title", "-status-code", "-tech-detect",
           "-follow-redirects", "-timeout", "10"]
    if proxy:
        cmd += ["-proxy", proxy]
    stdout, stderr, rc = _run_cmd(cmd, timeout=60)
    results = []
    for line in stdout.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
            results.append({
                "url": item.get("url", ""),
                "status_code": item.get("status_code", 0),
                "title": item.get("title", ""),
                "tech": item.get("tech", []),
                "server": item.get("webserver", ""),
                "content_length": item.get("content_length", 0),
                "host": item.get("host", ""),
                "cdn_name": item.get("cdn_name", ""),
                "cdn": item.get("cdn", False)
            })
        except json.JSONDecodeError:
            pass
    return results


def subfinder_scan(domain: str) -> List[Dict]:
    """Subfinder 子域名发现"""
    if not TOOLS.get("subfinder"):
        return [{"error": "subfinder not installed"}]
    cmd = ["subfinder", "-d", domain, "-silent", "-json", "-recursive"]
    stdout, stderr, rc = _run_cmd(cmd, timeout=300)
    results = []
    for line in stdout.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
            results.append({
                "subdomain": item.get("host", ""),
                "source": item.get("source", ""),
                "ip": item.get("ip", ""),
                "domain": domain
            })
        except json.JSONDecodeError:
            results.append({"subdomain": line, "domain": domain})
    return results


def masscan_scan(target: str, ports: str = "1-65535",
                 rate: int = 1000) -> List[Dict]:
    """Masscan 全端口扫描"""
    if not TOOLS.get("masscan"):
        return [{"error": "masscan not installed"}]
    cmd = ["masscan", target, "-p", ports, "--rate", str(rate),
           "-oJ", "-", "--wait", "3"]
    stdout, stderr, rc = _run_cmd(cmd, timeout=600)
    results = []
    if stdout.strip():
        try:
            data = json.loads(stdout)
            if isinstance(data, list):
                for item in data:
                    port_info = (item.get("ports") or [{}])[0]
                    results.append({
                        "port": port_info.get("port", 0),
                        "protocol": port_info.get("protocol", "tcp"),
                        "state": "open",
                        "ip": item.get("ip", ""),
                        "host": target
                    })
        except json.JSONDecodeError:
            pass
    return results


# ==================== REST API ====================

@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "tools": {k: "available" if v else "missing" for k, v in TOOLS.items()},
        "version": "1.0.0"
    })


@app.route("/scan", methods=["POST"])
def scan():
    """
    执行扫描任务
    ---
    请求体:
    {
        "type": "port|web|vuln|subdomain|service|full",
        "target": "example.com",
        "targets": ["10.0.0.1", "10.0.0.2"],  // 批量扫描
        "ports": "80,443,8000-8010",           // 端口扫描用
        "rate": 1000,                          // masscan 速率
        "severity": "critical,high",           // nuclei 严重度过滤
        "templates": "cves/",                  // nuclei 模板路径
        "proxy": "socks5://127.0.0.1:1080",    // 代理
        "callback": "http://usop-backend:5001/api/scanner/callback"  // 回调通知URL
    }
    """
    data = request.get_json() or {}
    scan_type = data.get("type", "port")
    targets = data.get("targets", [])
    target = data.get("target", "")
    if target:
        targets.append(target)
    if not targets:
        return jsonify({"error": "target or targets required"}), 400

    proxy = data.get("proxy", os.getenv("SCANNER_PROXY", ""))
    ports = data.get("ports", "top-1000")
    severity = data.get("severity")
    templates = data.get("templates")
    rate = data.get("rate", 1000)
    callback = data.get("callback", "")

    scan_id = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    all_results = {}
    errors = []

    for t in targets:
        logger.info(f"[{scan_id}] Scanning {t} with type={scan_type}")
        target_results = {}

        try:
            if scan_type in ("port", "full", "service"):
                # 端口扫描优先 Naabu（快，支持代理）
                if TOOLS.get("naabu"):
                    target_results["port"] = naabu_scan(t, ports, proxy)
                # 全端口用 Masscan
                if scan_type == "full" and TOOLS.get("masscan"):
                    target_results["masscan"] = masscan_scan(t, "1-65535", rate)
        except Exception as e:
            errors.append({"target": t, "type": "port", "error": str(e)})

        try:
            if scan_type in ("web", "full", "service"):
                if TOOLS.get("httpx"):
                    target_results["web"] = httpx_scan(t, proxy)
        except Exception as e:
            errors.append({"target": t, "type": "web", "error": str(e)})

        try:
            if scan_type in ("vuln", "full"):
                if TOOLS.get("nuclei"):
                    target_results["vuln"] = nuclei_scan(t, templates, severity, proxy)
        except Exception as e:
            errors.append({"target": t, "type": "vuln", "error": str(e)})

        try:
            if scan_type in ("subdomain", "full"):
                if TOOLS.get("subfinder") and "." in t and not t[0].isdigit():
                    target_results["subdomain"] = subfinder_scan(t)
        except Exception as e:
            errors.append({"target": t, "type": "subdomain", "error": str(e)})

        all_results[t] = target_results

    response = {
        "scan_id": scan_id,
        "type": scan_type,
        "targets": targets,
        "results": all_results,
        "errors": errors if errors else None,
        "tool_status": {k: "available" if v else "missing" for k, v in TOOLS.items()},
        "timestamp": datetime.utcnow().isoformat()
    }

    # 回调通知
    if callback:
        try:
            import requests as http_requests
            http_requests.post(callback, json=response, timeout=10)
            logger.info(f"[{scan_id}] Callback sent to {callback}")
        except Exception as e:
            logger.warning(f"[{scan_id}] Callback failed: {e}")

    return jsonify(response)


@app.route("/scan/<scan_id>/status", methods=["GET"])
def scan_status(scan_id: str):
    """查询扫描状态（占位，容器内同步执行）"""
    return jsonify({"scan_id": scan_id, "status": "completed", "mode": "synchronous"})


@app.route("/tools", methods=["GET"])
def list_tools():
    """列出可用工具及版本"""
    return jsonify({
        "tools": {k: "available" if v else "missing" for k, v in TOOLS.items()},
        "details": {
            "naabu": {"type": "port_scanner", "docs": "https://github.com/projectdiscovery/naabu"},
            "nuclei": {"type": "vuln_scanner", "docs": "https://github.com/projectdiscovery/nuclei"},
            "httpx": {"type": "http_prober", "docs": "https://github.com/projectdiscovery/httpx"},
            "subfinder": {"type": "subdomain_finder", "docs": "https://github.com/projectdiscovery/subfinder"},
            "masscan": {"type": "port_scanner", "docs": "https://github.com/robertdavidgraham/masscan"},
            "nmap": {"type": "port_scanner", "docs": "https://nmap.org"},
        }
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
