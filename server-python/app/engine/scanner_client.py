"""
扫描服务客户端 — 调用容器化的 USOP Scanner Service
代替直接在本机调用 CLI 工具的方式
"""
import os
import json
import logging
from typing import Optional, List, Dict
from urllib.parse import urljoin

logger = logging.getLogger(__name__)


class ScannerServiceClient:
    """
    扫描服务客户端
    
    通过 HTTP 调用远程/容器化的 scanner-service
    地址在环境变量 SCANNER_SERVICE_URL 中配置
    
    调用方式:
        client = ScannerServiceClient()
        results = client.scan(target="example.com", scan_type="full")
    """

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or os.getenv("SCANNER_SERVICE_URL", "http://localhost:8080")).rstrip("/")

    def _request(self, method: str, path: str, **kwargs) -> Optional[Dict]:
        """发送 HTTP 请求到扫描服务"""
        try:
            import requests as http_requests
            url = urljoin(self.base_url, path)
            resp = http_requests.request(method, url, timeout=kwargs.pop("timeout", 600), **kwargs)
            resp.raise_for_status()
            return resp.json()
        except ImportError:
            logger.error("requests not installed")
        except Exception as e:
            logger.error(f"Scanner service request failed ({self.base_url}{path}): {e}")
        return None

    def health(self) -> Optional[Dict]:
        """检查扫描服务健康状态"""
        return self._request("GET", "/health", timeout=10)

    def list_tools(self) -> Optional[Dict]:
        """列出可用工具"""
        return self._request("GET", "/tools", timeout=10)

    def scan(self, target: str, scan_type: str = "port",
             targets: Optional[List[str]] = None,
             ports: str = "top-1000",
             severity: Optional[str] = None,
             templates: Optional[str] = None,
             proxy: Optional[str] = None,
             rate: int = 1000,
             callback: Optional[str] = None) -> Optional[Dict]:
        """
        执行扫描任务

        Args:
            target: 目标地址
            scan_type: port / web / vuln / subdomain / service / full
            targets: 批量扫描目标列表
            ports: 端口范围 (如 "80,443" / "1-1000" / "top-1000")
            severity: nuclei 严重度过滤
            templates: nuclei 模板路径
            proxy: 代理地址 (如 "socks5://host:port")
            rate: masscan 发包速率
            callback: 回调 URL

        Returns:
            扫描结果字典
        """
        payload = {
            "type": scan_type,
            "target": target,
            "ports": ports,
            "rate": rate
        }
        if targets:
            payload["targets"] = targets
        if severity:
            payload["severity"] = severity
        if templates:
            payload["templates"] = templates
        if proxy:
            payload["proxy"] = proxy
        if callback:
            payload["callback"] = callback

        return self._request("POST", "/scan", json=payload, timeout=600)


# 全局单例
_client: Optional[ScannerServiceClient] = None


def get_scanner_client() -> ScannerServiceClient:
    """获取扫描服务客户端（单例）"""
    global _client
    if _client is None:
        _client = ScannerServiceClient()
    return _client


# 便捷方法
def scan_target(target: str, scan_type: str = "port", **kwargs) -> Optional[Dict]:
    """快捷扫描入口"""
    return get_scanner_client().scan(target, scan_type, **kwargs)


def check_scanner_health() -> Optional[Dict]:
    """检查扫描服务状态"""
    return get_scanner_client().health()
