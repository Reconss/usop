"""
Filter Processor - 过滤处理器
"""

import re
import ipaddress
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from abc import ABC, abstractmethod
import logging

logger = logging.getLogger(__name__)


@dataclass
class FilterRule:
    """过滤规则"""
    rule_type: str  # ip_whitelist, ip_blacklist, regex_match, regex_exclude, field_compare
    field: str = ""
    value: Any = None
    options: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.options is None:
            self.options = {}


class BaseFilter(ABC):
    """过滤器基类"""
    
    @abstractmethod
    def match(self, data: Dict[str, Any]) -> bool:
        """检查数据是否匹配"""
        pass


class IPWhiteListFilter(BaseFilter):
    """IP 白名单过滤器"""
    
    def __init__(self, ips: List[str]):
        self.ip_networks = []
        for ip in ips:
            try:
                self.ip_networks.append(ipaddress.ip_network(ip, strict=False))
            except ValueError:
                logger.warning(f"Invalid IP network: {ip}")
    
    def match(self, data: Dict[str, Any]) -> bool:
        """检查 IP 是否在白名单"""
        ip = data.get('src_ip') or data.get('dst_ip')
        if not ip:
            return True  # 无 IP 字段，默认通过
        
        try:
            ip_obj = ipaddress.ip_address(ip)
            return any(ip_obj in network for network in self.ip_networks)
        except ValueError:
            return True


class IPBlackListFilter(BaseFilter):
    """IP 黑名单过滤器"""
    
    def __init__(self, ips: List[str]):
        self.ip_networks = []
        for ip in ips:
            try:
                self.ip_networks.append(ipaddress.ip_network(ip, strict=False))
            except ValueError:
                logger.warning(f"Invalid IP network: {ip}")
    
    def match(self, data: Dict[str, Any]) -> bool:
        """检查 IP 是否在黑名单"""
        ip = data.get('src_ip') or data.get('dst_ip')
        if not ip:
            return True
        
        try:
            ip_obj = ipaddress.ip_address(ip)
            return not any(ip_obj in network for network in self.ip_networks)
        except ValueError:
            return True


class RegexMatchFilter(BaseFilter):
    """正则匹配过滤器"""
    
    def __init__(self, pattern: str, field: str = 'message'):
        self.pattern = re.compile(pattern)
        self.field = field
    
    def match(self, data: Dict[str, Any]) -> bool:
        """检查字段是否匹配正则"""
        value = data.get(self.field, '')
        return bool(self.pattern.search(str(value)))


class RegexExcludeFilter(BaseFilter):
    """正则排除过滤器"""
    
    def __init__(self, pattern: str, field: str = 'message'):
        self.pattern = re.compile(pattern)
        self.field = field
    
    def match(self, data: Dict[str, Any]) -> bool:
        """检查字段是否不匹配正则"""
        value = data.get(self.field, '')
        return not bool(self.pattern.search(str(value)))


class FieldCompareFilter(BaseFilter):
    """字段比较过滤器"""
    
    def __init__(self, field: str, operator: str, value: Any):
        self.field = field
        self.operator = operator
        self.value = value
    
    def match(self, data: Dict[str, Any]) -> bool:
        """比较字段值"""
        field_value = data.get(self.field)
        
        if self.operator == '==':
            return field_value == self.value
        elif self.operator == '!=':
            return field_value != self.value
        elif self.operator == '>':
            return field_value is not None and field_value > self.value
        elif self.operator == '>=':
            return field_value is not None and field_value >= self.value
        elif self.operator == '<':
            return field_value is not None and field_value < self.value
        elif self.operator == '<=':
            return field_value is not None and field_value <= self.value
        elif self.operator == 'in':
            return field_value in self.value
        elif self.operator == 'contains':
            return self.value in str(field_value)
        
        return True


class FilterProcessor:
    """过滤处理器"""
    
    def __init__(self, rules: List[Dict[str, Any]] = None):
        self.filters: List[BaseFilter] = []
        self.rule_type = 'inclusive'  # inclusive: 全部通过, exclusive: 排除匹配
        
        if rules:
            self._build_filters(rules)
    
    def _build_filters(self, rules: List[Dict[str, Any]]):
        """构建过滤器链"""
        for rule in rules:
            rule_type = rule.get('type', '')
            
            if rule_type == 'ip_whitelist':
                ips = rule.get('ips', [])
                self.filters.append(IPWhiteListFilter(ips))
            
            elif rule_type == 'ip_blacklist':
                ips = rule.get('ips', [])
                self.filters.append(IPBlackListFilter(ips))
            
            elif rule_type == 'regex_match':
                pattern = rule.get('pattern', '')
                field = rule.get('field', 'message')
                if pattern:
                    self.filters.append(RegexMatchFilter(pattern, field))
            
            elif rule_type == 'regex_exclude':
                pattern = rule.get('pattern', '')
                field = rule.get('field', 'message')
                if pattern:
                    self.filters.append(RegexExcludeFilter(pattern, field))
            
            elif rule_type == 'field_compare':
                field = rule.get('field', '')
                operator = rule.get('operator', '==')
                value = rule.get('value')
                if field:
                    self.filters.append(FieldCompareFilter(field, operator, value))
    
    def filter(self, data: Dict[str, Any]) -> bool:
        """过滤数据"""
        if not self.filters:
            return True
        
        for f in self.filters:
            if not f.match(data):
                return False
        
        return True
    
    def process(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """处理数据，返回 None 表示过滤掉"""
        if self.filter(data):
            return data
        return None
