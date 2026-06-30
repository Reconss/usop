"""
扫描引擎 — 执行实际的资产扫描任务（端口扫描、服务探测、Web信息收集）
支持代理转发，所有流量走配置的代理
"""
import os
import json
import socket
import subprocess
import logging
import threading
from typing import Optional, Dict, Any
from datetime import datetime
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


class ProxyConfig:
    """代理配置"""
    def __init__(self):
        self.enabled = False
        self.type = "http"  # http / socks5 / socks5h
        self.host = ""
        self.port = 1080
        self.username = ""
        self.password = ""

    @classmethod
    def load_from_db(cls) -> "ProxyConfig":
        """从数据库加载代理配置"""
        try:
            from app.models import SystemConfig
            cfg = SystemConfig.query.filter_by(key='scan_proxy_config').first()
            if cfg and cfg.value:
                import json as _j
                val = _j.loads(cfg.value) if isinstance(cfg.value, str) else cfg.value
                pc = cls()
                pc.enabled = val.get("enabled", False)
                pc.type = val.get("type", "http")
                pc.host = val.get("host", "")
                pc.port = int(val.get("port", 1080))
                pc.username = val.get("username", "")
                pc.password = val.get("password", "")
                return pc
        except Exception:
            pass
        return cls()

    def to_dict(self) -> dict:
        return {
            "enabled": self.enabled,
            "type": self.type,
            "host": self.host,
            "port": self.port,
            "username": self.username,
            "password": self.password
        }

    def get_curl_proxy_args(self) -> list:
        """返回 curl 代理参数"""
        if not self.enabled or not self.host:
            return []
        proxy_url = f"{self.type}://{self.host}:{self.port}"
        args = ["--proxy", proxy_url]
        if self.username and self.password:
            args += ["--proxy-user", f"{self.username}:{self.password}"]
        return args

    def get_requests_proxies(self) -> dict:
        """返回 requests 库代理 dict"""
        if not self.enabled or not self.host:
            return {}
        proxy_url = f"{self.type}://{self.host}:{self.port}"
        if self.username and self.password:
            proxy_url = f"{self.type}://{self.username}:{self.password}@{self.host}:{self.port}"
        return {"http": proxy_url, "https": proxy_url}

    def get_nmap_proxy_args(self) -> list:
        """返回 nmap 代理参数（通过 --proxies）"""
        if not self.enabled or not self.host:
            return []
        if self.type in ("socks5", "socks5h"):
            return ["--proxies", f"{self.type}://{self.host}:{self.port}"]
        return []


class ScanEngine:
    """扫描引擎 — 执行 TCP 端口扫描、服务版本检测等"""

    @staticmethod
    def port_scan(target: str, ports: str = "1-1000",
                  proxy: Optional[ProxyConfig] = None) -> list:
        """执行 TCP 连接扫描，返回开放端口列表"""
        results = []
        try:
            proxy = proxy or ProxyConfig.load_from_db()
            if proxy.enabled and proxy.type.startswith("socks"):
                # 代理模式下使用 nmap
                results = ScanEngine._nmap_scan(target, ports, proxy)
            else:
                # 直连 / HTTP 代理：使用 socket 连接测试
                results = ScanEngine._socket_scan(target, ports)
        except Exception as e:
            logger.error(f"端口扫描失败 {target}: {e}")
        return results

    @staticmethod
    def _socket_scan(target: str, ports: str) -> list:
        """Socket 直连扫描"""
        open_ports = []
        port_ranges = ScanEngine._parse_ports(ports)
        for port in port_ranges:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(1.5)
                result = sock.connect_ex((target, port))
                if result == 0:
                    service = ScanEngine._guess_service(port)
                    open_ports.append({
                        "port": port,
                        "protocol": "tcp",
                        "state": "open",
                        "service": service,
                        "banner": ""
                    })
                sock.close()
            except Exception:
                pass
        return open_ports

    @staticmethod
    def _nmap_scan(target: str, ports: str,
                   proxy: Optional[ProxyConfig] = None) -> list:
        """Nmap 扫描（支持代理）"""
        results = []
        try:
            cmd = ["nmap", "-sT", "-Pn", "--host-timeout", "30s",
                   "-p", ports, "-oX", "-", target]
            if proxy and proxy.enabled and proxy.type.startswith("socks"):
                proxy_url = f"{proxy.type}://{proxy.host}:{proxy.port}"
                cmd = ["proxychains4", "-q"] + cmd if os.system("which proxychains4 >/dev/null 2>&1") == 0 else cmd
                cmd += ["--proxies", proxy_url]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            # 解析 nmap XML 输出
            if result.returncode == 0:
                import xml.etree.ElementTree as ET
                root = ET.fromstring(result.stdout)
                for host in root.findall(".//host"):
                    for port_elem in host.findall(".//port"):
                        state_elem = port_elem.find("state")
                        if state_elem is not None and state_elem.get("state") == "open":
                            port_num = int(port_elem.get("portid", 0))
                            service_elem = port_elem.find("service")
                            results.append({
                                "port": port_num,
                                "protocol": port_elem.get("protocol", "tcp"),
                                "state": "open",
                                "service": service_elem.get("name", "") if service_elem is not None else "",
                                "product": service_elem.get("product", "") if service_elem is not None else "",
                                "version": service_elem.get("version", "") if service_elem is not None else "",
                                "banner": ""
                            })
        except FileNotFoundError:
            logger.warning("nmap not installed, falling back to socket scan")
            results = ScanEngine._socket_scan(target, ports)
        except subprocess.TimeoutExpired:
            logger.warning(f"nmap scan timeout for {target}")
        except Exception as e:
            logger.error(f"nmap scan error {target}: {e}")
        return results

    @staticmethod
    def http_probe(target: str, port: int,
                   proxy: Optional[ProxyConfig] = None) -> dict:
        """HTTP 服务探测 — 获取标题、状态码、Server 头等"""
        result = {"port": port, "protocol": "tcp", "service": "http",
                  "title": "", "status_code": 0, "server": "", "headers": {}}
        try:
            import requests as http_requests
            proxies = (proxy or ProxyConfig.load_from_db()).get_requests_proxies()
            urls = [f"https://{target}:{port}/", f"http://{target}:{port}/"]
            for url in urls:
                try:
                    resp = http_requests.get(url, proxies=proxies or None,
                                             timeout=5, verify=False,
                                             headers={"User-Agent": "USOP-Scanner/1.0"})
                    result["status_code"] = resp.status_code
                    result["server"] = resp.headers.get("Server", "")
                    result["headers"] = dict(resp.headers)
                    # 提取标题
                    import re
                    title_match = re.search(r'<title[^>]*>(.*?)</title>',
                                            resp.text, re.IGNORECASE | re.DOTALL)
                    if title_match:
                        result["title"] = title_match.group(1).strip()[:100]
                    result["service"] = "https" if "https" in url else "http"
                    break
                except Exception:
                    continue
        except Exception as e:
            logger.debug(f"HTTP probe failed {target}:{port}: {e}")
        return result

    @staticmethod
    def _parse_ports(ports: str) -> list:
        """解析端口字符串，如 '80,443,8000-8010'"""
        result = []
        for part in ports.split(","):
            part = part.strip()
            if "-" in part:
                try:
                    start, end = map(int, part.split("-"))
                    result.extend(range(start, end + 1))
                except ValueError:
                    pass
            else:
                try:
                    result.append(int(part))
                except ValueError:
                    pass
        return sorted(set(result))

    @staticmethod
    def _guess_service(port: int) -> str:
        """常见端口服务猜测"""
        services = {
            21: "ftp", 22: "ssh", 23: "telnet", 25: "smtp",
            53: "dns", 80: "http", 110: "pop3", 143: "imap",
            443: "https", 445: "smb", 993: "imaps", 995: "pop3s",
            1433: "mssql", 1521: "oracle", 2049: "nfs",
            3306: "mysql", 3389: "rdp", 5432: "postgresql",
            5900: "vnc", 6379: "redis", 8080: "http-proxy",
            8443: "https-alt", 27017: "mongodb"
        }
        return services.get(port, "unknown")


def run_scan_task(task_id: int, flask_app=None, timeout: int = 300):
    """后台执行扫描任务，timeout 秒后自动标记超时"""
    import threading as _th
    if flask_app:
        import __main__ as _main
        _mark_task_timeout.__globals__['_timeout_task_app'] = flask_app
    timer = _th.Timer(timeout, lambda: _mark_task_timeout(task_id))
    timer.daemon = True
    timer.start()
    try:
        _run_scan(task_id, flask_app)
    finally:
        timer.cancel()


_timeout_task_app = None

def _mark_task_timeout(task_id: int):
    """标记任务超时"""
    try:
        global _timeout_task_app
        app = _timeout_task_app
        if app is None:
            from app import create_app
            app = create_app()
        with app.app_context():
            from app.models import ScanTask, db
            task = ScanTask.query.get(task_id)
            if task and task.status == "running":
                task.status = "failed"
                task.results = {"error": "任务超时（300秒）", "timed_out": True}
                db.session.commit()
                logger.warning(f"扫描任务 {task_id} 超时")
    except Exception as e:
        logger.error(f"超时回调失败: {e}")


def _run_scan(task_id: int, flask_app=None):
    """实际执行扫描"""
    from flask import current_app
    app = flask_app or current_app._get_current_object()
    with app.app_context():
        from app.models import ScanTask, ScanResult, db
        task = ScanTask.query.get(task_id)
        if not task:
            logger.warning(f"任务 {task_id} 不存在, 跳过扫描")
            return

        target = task.target or ""
        # 映射扫描类型别名
        _type_map = {"quick": "port"}
        scan_type = _type_map.get(task.type, task.type or "port")
        proxy = ProxyConfig.load_from_db()

        proxy_str = f"{proxy.type}://{proxy.host}:{proxy.port}" if proxy.enabled else ""

        # 方式一: 优先调用远程扫描容器
        remote_ok = False
        try:
            from app.engine.scanner_client import ScannerServiceClient
            client = ScannerServiceClient()
            remote_result = client.scan(
                target=target, scan_type=scan_type,
                proxy=proxy_str if proxy_str else None
            )
            if remote_result and remote_result.get("results"):
                remote_ok = True
                task.results = {"scanner_service": True, "scan_id": remote_result.get("scan_id", "")}
                all_findings = []

                for t, t_results in remote_result.get("results", {}).items():
                    for scan_subtype, items in t_results.items():
                        if isinstance(items, list):
                            for item in items:
                                if "error" in item:
                                    continue
                                sr = ScanResult(
                                    task_id=task_id, result_type=scan_subtype,
                                    target=t, data=item
                                )
                                db.session.add(sr)
                                all_findings.append(item)

                task.results["count"] = len(all_findings)
                task.results["results"] = all_findings[:100]
                task.results["remote_scan"] = remote_result
                task.status = "completed"
                task.completed_at = datetime.utcnow()
                task.progress = 100
                db.session.commit()
                logger.info(f"扫描任务 {task_id}: 远程扫描完成, 共 {len(all_findings)} 条结果")
        except Exception as e:
            logger.warning(f"远程扫描服务不可用, 使用本地扫描: {e}")

        if not remote_ok:
            # 方式二: 本地扫描 — 使用流水线引擎 (recon_pipeline)
            try:
                task.status = "running"
                task.started_at = datetime.utcnow()
                db.session.commit()

                from app.engine.recon_pipeline import run_scan_pipeline

                def on_progress(phase_name: str, progress: int):
                    task.progress = progress
                    db.session.commit()

                proxy_str = f"{proxy.type}://{proxy.host}:{proxy.port}" if proxy.enabled else ""
                pipeline_result = run_scan_pipeline(
                    target=target, scan_type=scan_type,
                    proxy=proxy_str, progress_callback=on_progress
                )

                # 将结果写入 ScanResult 表
                all_items = []
                for phase_key, phase_data in pipeline_result.get("results", {}).items():
                    for item in phase_data.get("items", []):
                        sr = ScanResult(task_id=task_id, result_type=phase_key,
                                        target=target, result_data=item)
                        db.session.add(sr)
                        all_items.append(item)

                total = pipeline_result.get("total_findings", len(all_items))
                task.results = {
                    "pipeline": True,
                    "count": total,
                    "results": all_items[:100],
                    "phases": pipeline_result.get("phases", []),
                    "completed_at": datetime.utcnow().isoformat()
                }
                task.status = "completed"
                task.completed_at = datetime.utcnow()
                task.progress = 100
                db.session.commit()
                logger.info(f"扫描任务 {task_id} ({target}, {scan_type}) 流水线完成, 共 {total} 条")

            except Exception as e:
                task.status = "failed"
                task.results = {"error": str(e)}
                db.session.commit()
                logger.error(f"扫描任务 {task_id} 失败: {e}")
