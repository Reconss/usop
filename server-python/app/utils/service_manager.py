"""
大数据组件健康检查与启动管理

在 Flask 后端启动前，确保所有依赖组件已就绪:
- TimescaleDB (日志存储)
- Kafka (消息队列)
- Redis (缓存)
- Flink (流处理)
"""

import os
import sys
import time
import socket
import subprocess
from typing import Dict, List, Tuple
from dataclasses import dataclass
from enum import Enum

import requests


class ComponentStatus(Enum):
    """组件状态"""
    NOT_STARTED = "not_started"
    STARTING = "starting"
    HEALTHY = "healthy"
    UNHEALTHY = "unhealthy"
    FAILED = "failed"


@dataclass
class Component:
    """组件定义"""
    name: str
    host: str
    port: int
    check_type: str  # tcp, http, docker
    check_path: str = ""  # HTTP 检查路径
    timeout: int = 30  # 秒
    retry_interval: int = 2  # 秒


# 组件配置
COMPONENTS = {
    'timescale': Component(
        name='TimescaleDB',
        host=os.getenv('TSDB_HOST', 'localhost'),
        port=int(os.getenv('TSDB_PORT', '5433')),
        check_type='tcp',
        timeout=60
    ),
    'kafka': Component(
        name='Kafka',
        host='localhost',
        port=9092,
        check_type='tcp',
        timeout=60
    ),
    'redis': Component(
        name='Redis',
        host='localhost',
        port=6379,
        check_type='tcp',
        timeout=30
    ),
    'flink': Component(
        name='Flink JobManager',
        host='localhost',
        port=8081,
        check_type='http',
        check_path='/healthz',
        timeout=120
    ),
}


def check_tcp(host: str, port: int, timeout: int = 5) -> bool:
    """检查 TCP 端口是否开放"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except Exception:
        return False


def check_http(url: str, timeout: int = 5) -> bool:
    """检查 HTTP 端点是否可用"""
    try:
        response = requests.get(url, timeout=timeout)
        return response.status_code < 500
    except Exception:
        return False


def check_docker_container(name: str) -> Tuple[bool, str]:
    """检查 Docker 容器状态"""
    try:
        result = subprocess.run(
            ['docker', 'inspect', '-f', '{{.State.Status}}', name],
            capture_output=True,
            text=True,
            timeout=5
        )
        status = result.stdout.strip()
        return status == 'running', status
    except Exception as e:
        return False, str(e)


def check_component(component: Component) -> Tuple[ComponentStatus, str]:
    """检查单个组件状态"""
    try:
        if component.check_type == 'tcp':
            if check_tcp(component.host, component.port):
                return ComponentStatus.HEALTHY, f"端口 {component.port} 可访问"
            else:
                return ComponentStatus.NOT_STARTED, f"端口 {component.port} 未开放"
        
        elif component.check_type == 'http':
            url = f"http://{component.host}:{component.port}{component.check_path}"
            if check_http(url):
                return ComponentStatus.HEALTHY, f"HTTP 检查通过"
            else:
                return ComponentStatus.NOT_STARTED, f"HTTP 端点不可用"
        
        elif component.check_type == 'docker':
            running, status = check_docker_container(component.name.lower())
            if running:
                return ComponentStatus.HEALTHY, f"容器运行中"
            else:
                return ComponentStatus.NOT_STARTED, f"容器状态: {status}"
        
    except Exception as e:
        return ComponentStatus.UNHEALTHY, str(e)
    
    return ComponentStatus.UNHEALTHY, "未知检查类型"


def wait_for_component(component: Component, max_wait: int = None) -> bool:
    """等待组件就绪"""
    max_wait = max_wait or component.timeout
    elapsed = 0
    
    while elapsed < max_wait:
        status, message = check_component(component)
        
        if status == ComponentStatus.HEALTHY:
            return True
        
        time.sleep(component.retry_interval)
        elapsed += component.retry_interval
    
    return False


def ensure_docker_services_running() -> bool:
    """确保 Docker 服务正在运行"""
    # 检查 docker-compose 服务状态
    compose_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'docker-compose.yml')
    
    if not os.path.exists(compose_file):
        print(f"⚠ docker-compose.yml 不存在，跳过自动启动")
        return False
    
    try:
        # 检查是否有服务在运行
        result = subprocess.run(
            ['docker', 'compose', '-f', compose_file, 'ps', '-q'],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(compose_file)
        )
        
        running_containers = result.stdout.strip().split('\n')
        running_count = len([c for c in running_containers if c])
        
        if running_count == 0:
            print(f"📦 启动大数据组件...")
            subprocess.run(
                ['docker', 'compose', '-f', compose_file, 'up', '-d'],
                cwd=os.path.dirname(compose_file)
            )
            return True
        
        return False
        
    except Exception as e:
        print(f"⚠ 无法检查/启动 Docker 服务: {e}")
        return False


def check_all_components(show_details: bool = True) -> Dict[str, ComponentStatus]:
    """检查所有组件状态"""
    results = {}
    
    for key, component in COMPONENTS.items():
        status, message = check_component(component)
        results[key] = status
        
        if show_details:
            icon = "✓" if status == ComponentStatus.HEALTHY else "✗" if status == ComponentStatus.UNHEALTHY else "○"
            print(f"  {icon} {component.name}: {message}")
    
    return results


def wait_for_all_components(timeout_multiplier: float = 1.0) -> Tuple[bool, List[str]]:
    """等待所有组件就绪"""
    required_components = ['timescale', 'kafka', 'redis']  # 必需组件
    optional_components = ['flink']  # 可选组件
    
    ready = []
    not_ready = []
    
    print("\n" + "="*50)
    print("  大数据组件就绪检查")
    print("="*50 + "\n")
    
    # 先尝试启动 Docker 服务
    ensure_docker_services_running()
    
    # 检查必需组件
    print("检查必需组件:")
    for key in required_components:
        if key not in COMPONENTS:
            continue
            
        component = COMPONENTS[key]
        print(f"  等待 {component.name}...")
        
        if wait_for_component(component):
            print(f"  ✓ {component.name} 已就绪")
            ready.append(key)
        else:
            print(f"  ✗ {component.name} 启动超时")
            not_ready.append(key)
    
    # 检查可选组件
    print("\n检查可选组件:")
    for key in optional_components:
        if key not in COMPONENTS:
            continue
            
        component = COMPONENTS[key]
        print(f"  等待 {component.name}...")
        
        if wait_for_component(component):
            print(f"  ✓ {component.name} 已就绪")
            ready.append(key)
        else:
            print(f"  ⚠ {component.name} 不可用 (可能影响实时处理)")
            not_ready.append(key)
    
    success = len(not_ready) == 0 or all(k in ready + not_ready for k in required_components)
    
    print("\n" + "="*50)
    if success:
        print("  ✓ 所有必需组件已就绪")
    else:
        print("  ✗ 部分必需组件未就绪")
    print("="*50 + "\n")
    
    return success, not_ready


def init_kafka_topics() -> bool:
    """初始化 Kafka Topics"""
    script_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'scripts', 'init-kafka-topics.sh')
    
    if not os.path.exists(script_path):
        print("⚠ Kafka Topics 初始化脚本不存在，跳过")
        return False
    
    try:
        print("📝 初始化 Kafka Topics...")
        subprocess.run(['bash', script_path], check=False)
        return True
    except Exception as e:
        print(f"⚠ Kafka Topics 初始化失败: {e}")
        return False


def init_timescale_db() -> bool:
    """初始化 TimescaleDB 表"""
    init_script = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'postgres', 'init.d', '01-init-timescale.sql')
    
    if not os.path.exists(init_script):
        print("⚠ TimescaleDB 初始化脚本不存在，跳过")
        return False
    
    try:
        print("📝 初始化 TimescaleDB 表...")
        subprocess.run([
            'docker', 'exec', '-i', 'timescale',
            'psql', '-U', 'postgres', '-d', 'timescale'
        ], stdin=open(init_script), check=False)
        return True
    except Exception as e:
        print(f"⚠ TimescaleDB 初始化失败: {e}")
        return False


# 直接运行时显示状态
if __name__ == '__main__':
    print("\n" + "="*50)
    print("  USOP 大数据组件状态检查")
    print("="*50 + "\n")
    
    # 先尝试启动服务
    ensure_docker_services_running()
    
    # 检查状态
    check_all_components()
    
    # 询问是否等待
    response = input("\n是否等待所有组件就绪? (Y/n): ").strip().lower()
    if response != 'n':
        wait_for_all_components()
