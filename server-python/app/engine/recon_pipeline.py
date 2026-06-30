"""
侦察流水线 — 学习主流扫描器的阶段式扫描流程
模仿 ProjectDiscovery 工具链 + Nmap 的扫描哲学:
  阶段1: 端口发现 (Naabu/Masscan)
  阶段2: 服务识别 (Nmap/Naabu)
  阶段3: HTTP 探针 (httpx)
  阶段4: 漏洞扫描 (Nuclei)
  阶段5: 子域名发现 (Subfinder) — 域名的前置阶段
"""
import os
import json
import socket
import subprocess
import logging
import os
import threading
from typing import Optional, List, Dict, Callable
from datetime import datetime
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)


# ==================== 扫描阶段定义 ====================

@dataclass
class ScanPhase:
    """单个扫描阶段"""
    name: str                    # 阶段名: dns/port/service/web/vuln
    description: str             # 描述
    weight: int = 10             # 占总进度的权重百分比
    enabled: bool = True         # 是否启用
    timeout: int = 120           # 阶段超时(秒)
    requires: List[str] = field(default_factory=list)  # 前置依赖阶段

    def _load_wordlist(self) -> list:
        """从字典文件加载子域名列表"""
        import os
        paths = [
            os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'wordlists', 'subdomains.txt'),
            '/usr/share/wordlists/subdomains.txt',
            '/usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt',
        ]
        # 本地扫描限制条数，远程容器使用完整列表
        limit = int(os.environ.get("SUBDOMAIN_WORDLIST_LIMIT", "100"))
        for p in paths:
            if os.path.exists(p):
                try:
                    with open(p) as f:
                        words = [line.strip() for line in f if line.strip() and not line.startswith('#')]
                    if words:
                        words = words[:limit]
                        return words
                except:
                    pass
        return ["www", "mail", "admin", "api", "blog", "cdn", "dev", "test", "stage",
                "prod", "app", "web", "portal", "sso", "vpn", "git", "jenkins", "monitor",
                "dashboard", "docs", "wiki", "chat", "support", "help", "status"]

    def run(self, target: str, results: dict, proxy: str = "") -> List[Dict]:
        """执行本阶段扫描，返回结果列表"""
        raise NotImplementedError


class DNSEnumPhase(ScanPhase):
    """阶段: DNS 枚举 / 子域名发现（参考 OneForAll 多数据源模式）"""
    def __init__(self):
        super().__init__(name="dns", description="子域名枚举 (crt.sh+爆破)",
                         weight=10, timeout=120)

    def _load_wordlist(self) -> list:
        paths = [
            os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'wordlists', 'subdomains.txt'),
            '/usr/share/wordlists/subdomains.txt',
            '/usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt',
        ]
        for p in paths:
            if os.path.exists(p):
                try:
                    with open(p) as f:
                        words = [line.strip() for line in f if line.strip() and not line.startswith('#')]
                    limit = int(os.environ.get('SUBDOMAIN_WORDLIST_LIMIT', '500'))
                    if words:
                        return words[:limit]
                except:
                    pass
        return ["www", "mail", "admin", "api", "blog", "cdn"]

    def _crt_sh_scrape(self, domain: str) -> set:
        """从 crt.sh Certificate Transparency 日志收集子域名"""
        subs = set()
        try:
            import requests as _req
            url = f"https://crt.sh/?q=%25.{domain}&output=json"
            resp = _req.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0 USOP-Scanner"})
            if resp.status_code == 200:
                import json as _j
                for entry in resp.json():
                    name = entry.get("name_value", "")
                    for n in name.split("\\n"):
                        n = n.strip().lower()
                        if n.endswith(f".{domain}") and n != domain and "*" not in n:
                            subs.add(n)
        except Exception as e:
            logger.debug(f"crt.sh 查询失败: {e}")
        return subs

    def _dns_bruteforce(self, domain: str, wordlist: list) -> list:
        """并发 DNS 爆破"""
        import concurrent.futures, socket as _s
        found = []
        def _check(sub: str):
            try:
                ip = _s.gethostbyname(f"{sub}.{domain}")
                return {"subdomain": f"{sub}.{domain}", "ip": ip, "resolved": True, "source": "dns_bruteforce"}
            except:
                return None
        with concurrent.futures.ThreadPoolExecutor(max_workers=80) as ex:
            for r in ex.map(_check, wordlist):
                if r: found.append(r)
        return found

    def run(self, target: str, results: dict, proxy: str = "") -> List[Dict]:
        if target[0].isdigit():
            return [{"type": "info", "message": "目标为IP, 跳过DNS枚举"}]
        all_subs = set()
        found_map = {}

        # 数据源1: crt.sh Certificate Transparency
        logger.info(f"[DNS] crt.sh 收集 {target}...")
        ct_subs = self._crt_sh_scrape(target)
        for sub in ct_subs:
            all_subs.add(sub)
            try:
                import socket as _s
                ip = _s.gethostbyname(sub)
                found_map[sub] = {"subdomain": sub, "ip": ip, "resolved": True, "source": "crt.sh"}
            except:
                found_map[sub] = {"subdomain": sub, "ip": "", "resolved": False, "source": "crt.sh"}
        logger.info(f"  crt.sh: {len(ct_subs)} 个")

        # 数据源2: DNS 爆破
        logger.info(f"[DNS] 爆破 {target}...")
        wordlist = self._load_wordlist()
        brute_results = self._dns_bruteforce(target, wordlist)
        for r in brute_results:
            if r["subdomain"] not in all_subs:
                all_subs.add(r["subdomain"])
                found_map[r["subdomain"]] = r
        logger.info(f"  爆破: {len(brute_results)} 个")

        logger.info(f"[DNS] {target}: 共 {len(found_map)} 个子域名")
        return list(found_map.values())[:500]
class PortScanPhase(ScanPhase):
    """阶段: 端口扫描 — 使用 Naabu / socket 探测"""
    def __init__(self):
        super().__init__(name="port", description="端口发现",
                         weight=20, timeout=300)

    def run(self, target: str, results: dict, proxy: str = "") -> List[Dict]:
        # 优先尝试 Naabu
        naabu_result = self._naabu_scan(target, proxy)
        if naabu_result:
            return naabu_result
        # 兜底 socket 扫描
        return self._socket_scan(target)

    def _naabu_scan(self, target: str, proxy: str) -> Optional[List[Dict]]:
        try:
            cmd = ["naabu", "-host", target, "-p", "top-1000",
                   "-json", "-silent"]
            if proxy:
                cmd += ["-proxy", proxy]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if r.returncode == 0:
                results = []
                for line in r.stdout.strip().split("\n"):
                    if not line: continue
                    try:
                        item = json.loads(line)
                        results.append({
                            "port": item.get("port"), "protocol": item.get("protocol", "tcp"),
                            "state": "open", "ip": item.get("ip", ""), "source": "naabu"
                        })
                    except json.JSONDecodeError:
                        pass
                if results:
                    return results
        except FileNotFoundError:
            pass
        except Exception as e:
            logger.debug(f"Naabu不可用: {e}")
        return None

    def _socket_scan(self, target: str) -> List[Dict]:
        ports = [21,22,23,25,53,80,110,143,443,445,993,995,1433,
                 1521,2049,3306,3389,5432,5900,6379,8080,8443,27017]
        results = []
        for port in ports:
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(1.5)
                if s.connect_ex((target, port)) == 0:
                    results.append({"port": port, "protocol": "tcp",
                                    "state": "open", "source": "socket"})
                s.close()
            except:
                pass
        return results


class ServiceDetectPhase(ScanPhase):
    """阶段: 服务识别 — Banner 抓取 + 端口服务猜测"""
    def __init__(self):
        super().__init__(name="service", description="服务识别",
                         weight=15, timeout=120, requires=["port"])

    def run(self, target: str, results: dict, proxy: str = "") -> List[Dict]:
        ports = results.get("port", [])
        if not ports:
            return [{"type": "info", "message": "无开放端口, 跳过服务识别"}]
        findings = []
        services = {21:"ftp",22:"ssh",23:"telnet",25:"smtp",53:"dns",
                    80:"http",110:"pop3",143:"imap",443:"https",445:"smb",
                    993:"imaps",995:"pop3s",1433:"mssql",1521:"oracle",
                    2049:"nfs",3306:"mysql",3389:"rdp",5432:"postgresql",
                    5900:"vnc",6379:"redis",8080:"http",8443:"https",27017:"mongodb"}
        for p_info in ports[:20]:
            port = p_info.get("port", 0)
            svc = services.get(port, "unknown")
            banner = ""
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(3)
                s.connect((target, port))
                s.send(b"\r\n")
                banner = s.recv(1024).decode("utf-8", errors="ignore").strip()[:200]
                s.close()
            except:
                pass
            findings.append({
                "port": port, "protocol": "tcp",
                "service": svc, "banner": banner,
                "source": "service_detect"
            })
        return findings


class HTTPProbePhase(ScanPhase):
    """阶段: HTTP 探针 — httpx 或 requests 探测"""
    def __init__(self):
        super().__init__(name="web", description="HTTP服务探测",
                         weight=15, timeout=120, requires=["port"])

    def run(self, target: str, results: dict, proxy: str = "") -> List[Dict]:
        httpx_result = self._httpx_scan(target, proxy)
        if httpx_result:
            return httpx_result
        return self._requests_probe(target, proxy)

    def _httpx_scan(self, target: str, proxy: str) -> Optional[List[Dict]]:
        try:
            cmd = ["httpx", "-u", target, "-json", "-silent",
                   "-title", "-status-code", "-tech-detect",
                   "-follow-redirects", "-timeout", "10"]
            if proxy:
                cmd += ["-proxy", proxy]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if r.returncode == 0:
                results = []
                for line in r.stdout.strip().split("\n"):
                    if not line: continue
                    try:
                        item = json.loads(line)
                        results.append({
                            "url": item.get("url"), "status_code": item.get("status_code"),
                            "title": item.get("title"), "tech": item.get("tech", []),
                            "server": item.get("webserver"), "source": "httpx"
                        })
                    except json.JSONDecodeError:
                        pass
                return results
        except FileNotFoundError:
            pass
        except Exception as e:
            logger.debug(f"httpx不可用: {e}")
        return None

    def _requests_probe(self, target: str, proxy: str) -> List[Dict]:
        try:
            import requests as http_requests
            proxies = {}
            if proxy:
                proxies = {"http": proxy, "https": proxy}
            results = []
            for scheme, port in [("https", 443), ("http", 80)]:
                try:
                    url = f"{scheme}://{target}:{port}/"
                    resp = http_requests.get(url, proxies=proxies or None,
                                              timeout=5, verify=False,
                                              headers={"User-Agent": "USOP-Scanner/1.0"})
                    import re
                    title = ""
                    m = re.search(r'<title[^>]*>(.*?)</title>', resp.text, re.I | re.DOTALL)
                    if m:
                        title = m.group(1).strip()[:100]
                    results.append({
                        "url": url, "status_code": resp.status_code,
                        "title": title, "server": resp.headers.get("Server", ""),
                        "source": "http_probe"
                    })
                except:
                    pass
            return results
        except ImportError:
            return []


class VulnScanPhase(ScanPhase):
    """阶段: 漏洞扫描 — Nuclei 模板扫描"""
    def __init__(self):
        super().__init__(name="vuln", description="漏洞检测",
                         weight=30, timeout=300, requires=["web", "service"])

    def run(self, target: str, results: dict, proxy: str = "") -> List[Dict]:
        try:
            cmd = ["nuclei", "-target", target, "-json", "-silent",
                   "-severity", "critical,high,medium"]
            if proxy:
                cmd = ["proxychains4", "-q"] + cmd
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            findings = []
            for line in r.stdout.strip().split("\n"):
                if not line: continue
                try:
                    item = json.loads(line)
                    findings.append({
                        "template": item.get("template-id", ""),
                        "name": item.get("info", {}).get("name", ""),
                        "severity": item.get("info", {}).get("severity", "medium"),
                        "description": item.get("info", {}).get("description", ""),
                        "matched": item.get("matched-at", ""),
                        "source": "nuclei"
                    })
                except json.JSONDecodeError:
                    pass
            if findings:
                return findings
        except FileNotFoundError:
            pass
        except Exception as e:
            logger.debug(f"Nuclei不可用: {e}")
        return [{"type": "info", "message": "Nuclei未安装, 跳过漏洞扫描"}]


# ==================== 扫描模板/策略 ====================

class DirectoryBrutePhase(ScanPhase):
    """阶段: Web目录/路径爆破"""
    def __init__(self):
        super().__init__(name="webpath", description="Web路径发现",
                         weight=15, timeout=300, requires=["web"])

    def run(self, target: str, results: dict, proxy: str = "") -> List[Dict]:
        wordlist = self._load_dir_wordlist()
        if not wordlist:
            return [{"type": "info", "message": "无字典文件, 跳过目录爆破"}]
        found = []
        base_urls = []
        # 从 web 阶段结果获取 URL
        web_items = results.get("web", [])
        for item in web_items:
            url = item.get("url", "")
            if url and item.get("status_code", 0) in (200, 301, 302, 401, 403):
                base_urls.append(url.rstrip("/"))
        if not base_urls:
            base_urls = [f"http://{target}", f"https://{target}"]

        for base in base_urls:
            import requests as _req
            for path in wordlist:
                try:
                    url = base + path
                    resp = _req.get(url, timeout=3, verify=False,
                                    headers={"User-Agent": "Mozilla/5.0 USOP-Scanner"})
                    if resp.status_code in (200, 301, 302, 401, 403):
                        found.append({
                            "url": url, "path": path,
                            "status_code": resp.status_code,
                            "length": len(resp.content),
                            "title": self._extract_title(resp.text),
                            "source": "dirbuster"
                        })
                except:
                    pass
        return found

    def _load_dir_wordlist(self) -> list:
        paths = [
            os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'wordlists', 'directories.txt'),
            '/usr/share/wordlists/dirb/common.txt',
            '/usr/share/seclists/Discovery/Web-Content/common.txt',
        ]
        # 本地扫描限制条数，远程容器使用完整列表
        limit = int(os.environ.get("DIR_WORDLIST_LIMIT", "100"))
        for p in paths:
            if os.path.exists(p):
                try:
                    with open(p) as f:
                        words = [line.strip() for line in f if line.strip() and not line.startswith('#')]
                    if words:
                        words = words[:limit]
                        return words
                except:
                    pass
        return ["/admin", "/api", "/backup", "/config", "/data", "/login", "/test"]

    def _extract_title(self, html: str) -> str:
        import re
        m = re.search(r'<title[^>]*>(.*?)</title>', html, re.I | re.DOTALL)
        return m.group(1).strip()[:100] if m else ""

SCAN_TEMPLATES = {
    "quick": {
        "description": "快速扫描",
        "phases": [PortScanPhase, HTTPProbePhase],
        "default": True
    },
    "port": {
        "description": "端口扫描",
        "phases": [PortScanPhase],
        "default": True
    },
    "web": {
        "description": "Web指纹识别",
        "phases": [PortScanPhase, HTTPProbePhase],
        "default": True
    },
    "subdomain": {
        "description": "域名收集/子域名发现",
        "phases": [DNSEnumPhase],
        "default": True
    },
    "service": {
        "description": "服务识别与Banner抓取",
        "phases": [PortScanPhase, ServiceDetectPhase],
        "default": True
    },
    "vuln": {
        "description": "漏洞扫描 (需安装Nuclei)",
        "phases": [PortScanPhase, HTTPProbePhase, VulnScanPhase],
        "default": False
    },
    "full": {
        "description": "全量扫描 — DNS+端口+服务+Web+漏洞",
        "phases": [DNSEnumPhase, PortScanPhase, ServiceDetectPhase,
                   HTTPProbePhase, DirectoryBrutePhase, VulnScanPhase],
        "default": False
    }
}


# ==================== 执行引擎 ====================

def run_scan_pipeline(target: str, scan_type: str = "port",
                      proxy: str = "", progress_callback: Optional[Callable] = None) -> dict:
    """
    执行完整扫描流水线

    Args:
        target: 扫描目标 (IP/域名)
        scan_type: 扫描类型
        proxy: 代理地址
        progress_callback: 进度回调函数(phase_name, progress)

    Returns:
        结构化扫描结果
    """
    template = SCAN_TEMPLATES.get(scan_type)
    if not template:
        return {"error": f"未知扫描类型: {scan_type}", "results": {}}

    phases = [cls() for cls in template["phases"]]
    total_weight = sum(p.weight for p in phases if p.enabled)
    completed_weight = 0
    all_results = {}
    phase_outputs = {}

    for phase in phases:
        if not phase.enabled:
            continue

        logger.info(f"[流水线] 阶段: {phase.name} ({phase.description}) — {target}")

        # 检查前置依赖
        deps_met = True
        for req in phase.requires:
            if req not in phase_outputs or not phase_outputs.get(req):
                deps_met = False
                logger.info(f"  跳过 {phase.name}: 前置依赖 {req} 无结果")
                break
        if not deps_met:
            continue

        try:
            # 执行阶段
            phase_results = phase.run(target, {k: v for k, v in phase_outputs.items()}, proxy)
            phase_outputs[phase.name] = phase_results

            # 汇总结果
            phase_key = phase.name
            all_results[phase_key] = {
                "description": phase.description,
                "count": len(phase_results),
                "items": phase_results[:100]
            }

            completed_weight += phase.weight
            progress = int(completed_weight * 100 / total_weight) if total_weight > 0 else 100
            if progress_callback:
                progress_callback(phase.name, progress)

        except Exception as e:
            logger.error(f"[流水线] 阶段 {phase.name} 失败: {e}")
            all_results[phase.name] = {"description": phase.description,
                                        "error": str(e), "count": 0, "items": []}

    return {
        "target": target,
        "scan_type": scan_type,
        "phases": [p.name for p in phases],
        "total_findings": sum(r.get("count", 0) for r in all_results.values()),
        "results": all_results,
        "completed_at": datetime.utcnow().isoformat()
    }
