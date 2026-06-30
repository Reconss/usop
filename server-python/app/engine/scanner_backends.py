"""
扫描后端抽象层 — 对接各类开源扫描工具
支持网络端口扫描、Web指纹识别、漏洞检测等
"""
import os
import json
import subprocess
import logging
import tempfile
from typing import Optional, Dict, Any, List
from app.engine.scanner import ProxyConfig

logger = logging.getLogger(__name__)


class ScanBackend:
    """扫描后端基类"""
    name = "base"

    def __init__(self, proxy: Optional[ProxyConfig] = None):
        self.proxy = proxy or ProxyConfig.load_from_db()

    def scan(self, target: str, **kwargs) -> List[Dict]:
        raise NotImplementedError


class NucleiBackend(ScanBackend):
    """
    Nuclei 漏洞扫描器 (ProjectDiscovery)
    https://github.com/projectdiscovery/nuclei
    支持 REST API 模式和 CLI 模式
    
    安装: go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
    API模式: nuclei -api -api-listen :9988
    """
    name = "nuclei"

    def scan(self, target: str, templates: Optional[List[str]] = None,
             severity: Optional[str] = None, **kwargs) -> List[Dict]:
        results = []

        # 尝试 API 模式 (nuclei -api 后台运行)
        api_result = self._api_scan(target, templates, severity)
        if api_result is not None:
            return api_result

        # CLI 模式兜底
        return self._cli_scan(target, templates, severity)

    def _api_scan(self, target: str, templates: Optional[List[str]] = None,
                  severity: Optional[str] = None) -> Optional[List[Dict]]:
        """通过 Nuclei REST API 扫描"""
        try:
            import requests as http_requests
            api_host = os.getenv("NUCLEI_API_HOST", "http://127.0.0.1:9988")
            payload = {"target": target, "scan_type": "full"}
            if severity:
                payload["severity"] = severity
            resp = http_requests.post(f"{api_host}/scan", json=payload, timeout=300)
            if resp.status_code == 200:
                data = resp.json()
                return self._parse_nuclei_results(data)
        except ImportError:
            pass
        except Exception as e:
            logger.debug(f"Nuclei API scan failed: {e}")
        return None

    def _cli_scan(self, target: str, templates: Optional[List[str]] = None,
                  severity: Optional[str] = None) -> List[Dict]:
        """CLI 方式调用 nuclei"""
        cmd = ["nuclei", "-target", target, "-json", "-silent"]
        if templates:
            cmd += ["-t", ",".join(templates)]
        if severity:
            cmd += ["-severity", severity]
        if self.proxy and self.proxy.enabled and self.proxy.type.startswith("socks"):
            cmd = ["proxychains4", "-q"] + cmd

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            if result.returncode == 0:
                return self._parse_nuclei_cli(result.stdout)
            # 即使有错误输出也可能有结果
            return self._parse_nuclei_cli(result.stdout)
        except FileNotFoundError:
            logger.warning("nuclei not installed, skipping")
        except subprocess.TimeoutExpired:
            logger.warning("nuclei scan timeout")
        except Exception as e:
            logger.error(f"nuclei scan error: {e}")
        return []

    def _parse_nuclei_results(self, data: Any) -> List[Dict]:
        """解析 Nuclei API 返回"""
        findings = []
        if isinstance(data, dict):
            items = data.get("results", data.get("findings", [data]))
        elif isinstance(data, list):
            items = data
        else:
            return findings

        for item in items:
            if isinstance(item, dict):
                findings.append({
                    "scanner": "nuclei",
                    "template": item.get("template", item.get("template_id", "")),
                    "name": item.get("info", {}).get("name", item.get("name", "")),
                    "severity": item.get("info", {}).get("severity", item.get("severity", "medium")),
                    "description": item.get("info", {}).get("description", item.get("description", "")),
                    "matched": item.get("matched", item.get("matched_at", "")),
                    "type": item.get("type", "vulnerability"),
                    "host": target if 'target' in vars() else item.get("host", "")
                })
        return findings

    def _parse_nuclei_cli(self, output: str) -> List[Dict]:
        """解析 nuclei CLI JSONL 输出"""
        findings = []
        for line in output.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
                findings.append({
                    "scanner": "nuclei",
                    "template": item.get("template-id", ""),
                    "name": item.get("info", {}).get("name", ""),
                    "severity": item.get("info", {}).get("severity", "medium"),
                    "description": item.get("info", {}).get("description", ""),
                    "matched": item.get("matched-at", ""),
                    "type": item.get("type", "vulnerability"),
                    "host": item.get("host", "")
                })
            except json.JSONDecodeError:
                continue
        return findings


class NaabuBackend(ScanBackend):
    """
    Naabu 快速端口扫描器 (ProjectDiscovery)
    https://github.com/projectdiscovery/naabu
    
    安装: go install -v github.com/projectdiscovery/naabu/v2/cmd/naabu@latest
    """
    name = "naabu"

    def scan(self, target: str, ports: str = "top-1000", **kwargs) -> List[Dict]:
        cmd = ["naabu", "-host", target, "-p", ports,
               "-json", "-silent", "-timeout", "3000"]
        if self.proxy and self.proxy.enabled:
            cmd += ["-proxy", f"{self.proxy.type}://{self.proxy.host}:{self.proxy.port}"]

        results = []
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            for line in result.stdout.strip().split("\n"):
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                    results.append({
                        "scanner": "naabu",
                        "port": item.get("port", 0),
                        "protocol": item.get("protocol", "tcp"),
                        "state": "open",
                        "service": "",
                        "host": item.get("host", target),
                        "ip": item.get("ip", "")
                    })
                except json.JSONDecodeError:
                    continue
        except FileNotFoundError:
            logger.warning("naabu not installed")
        except Exception as e:
            logger.error(f"naabu scan error: {e}")
        return results


class HttpxBackend(ScanBackend):
    """
    httpx HTTP 探针 (ProjectDiscovery)
    https://github.com/projectdiscovery/httpx
    
    安装: go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest
    """
    name = "httpx"

    def scan(self, target: str, **kwargs) -> List[Dict]:
        cmd = ["httpx", "-u", target, "-json", "-silent",
               "-title", "-status-code", "-tech-detect",
               "-follow-redirects", "-timeout", "10"]
        if self.proxy and self.proxy.enabled:
            cmd += ["-proxy", f"{self.proxy.type}://{self.proxy.host}:{self.proxy.port}"]

        results = []
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            for line in result.stdout.strip().split("\n"):
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                    results.append({
                        "scanner": "httpx",
                        "url": item.get("url", ""),
                        "status_code": item.get("status_code", 0),
                        "title": item.get("title", ""),
                        "tech": item.get("tech", []),
                        "server": item.get("webserver", ""),
                        "content_type": item.get("content_type", ""),
                        "content_length": item.get("content_length", 0),
                        "host": item.get("host", "")
                    })
                except json.JSONDecodeError:
                    continue
        except FileNotFoundError:
            logger.warning("httpx not installed")
        except Exception as e:
            logger.error(f"httpx scan error: {e}")
        return results


class SubfinderBackend(ScanBackend):
    """
    Subfinder 子域名发现 (ProjectDiscovery)
    https://github.com/projectdiscovery/subfinder
    
    安装: go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
    """
    name = "subfinder"

    def scan(self, target: str, **kwargs) -> List[Dict]:
        cmd = ["subfinder", "-d", target, "-silent", "-json", "-recursive"]
        results = []
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            for line in result.stdout.strip().split("\n"):
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                    results.append({
                        "scanner": "subfinder",
                        "subdomain": item.get("host", ""),
                        "source": item.get("source", ""),
                        "ip": item.get("ip", ""),
                        "domain": target
                    })
                except json.JSONDecodeError:
                    results.append({"scanner": "subfinder", "subdomain": line, "domain": target})
        except FileNotFoundError:
            logger.warning("subfinder not installed")
        except Exception as e:
            logger.error(f"subfinder scan error: {e}")
        return results


class MasscanBackend(ScanBackend):
    """
    Masscan 超高速端口扫描
    https://github.com/robertdavidgraham/masscan
    
    安装: brew install masscan / apt install masscan
    """
    name = "masscan"

    def scan(self, target: str, ports: str = "1-65535", rate: int = 1000, **kwargs) -> List[Dict]:
        cmd = ["masscan", target, "-p", ports, "--rate", str(rate),
               "-oJ", "-", "--wait", "5"]
        if self.proxy and self.proxy.enabled:
            logger.info("Masscan does not support proxy, scanning directly")

        results = []
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            if result.stdout.strip():
                try:
                    data = json.loads(result.stdout)
                    if isinstance(data, list):
                        for item in data:
                            results.append({
                                "scanner": "masscan",
                                "port": item.get("ports", [{}])[0].get("port", 0) if item.get("ports") else 0,
                                "protocol": item.get("ports", [{}])[0].get("protocol", "tcp") if item.get("ports") else "tcp",
                                "state": "open",
                                "ip": item.get("ip", ""),
                                "host": target
                            })
                except json.JSONDecodeError:
                    pass
        except FileNotFoundError:
            logger.warning("masscan not installed")
        except Exception as e:
            logger.error(f"masscan scan error: {e}")
        return results


class ScanScheduler:
    """扫描任务调度器 — 根据目标/类型选择最佳后端"""

    BACKENDS = {
        "port": [NaabuBackend, MasscanBackend],
        "web": [HttpxBackend, NucleiBackend],
        "vuln": [NucleiBackend],
        "subdomain": [SubfinderBackend],
        "service": [NaabuBackend, HttpxBackend],
    }

    @classmethod
    def run(cls, scan_type: str, target: str, **kwargs) -> List[Dict]:
        """执行扫描，返回合并结果"""
        proxy = ProxyConfig.load_from_db()
        all_results = []
        backend_classes = cls.BACKENDS.get(scan_type, [NucleiBackend])

        for backend_cls in backend_classes:
            try:
                backend = backend_cls(proxy)
                results = backend.scan(target, **kwargs)
                all_results.extend(results)
                if results:
                    logger.info(f"{backend.name} found {len(results)} results for {target}")
            except Exception as e:
                logger.error(f"{backend_cls.name} failed for {target}: {e}")

        return all_results
