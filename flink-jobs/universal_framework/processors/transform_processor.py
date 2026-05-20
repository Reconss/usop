"""
Transform Processor - 转换处理器
"""

import json
import re
from typing import Dict, Any, List, Callable, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class TransformProcessor:
    """转换处理器 - 字段映射和数据转换"""
    
    def __init__(self, field_mapping: Dict[str, Any] = None, 
                 transform_rules: List[Dict] = None):
        self.field_mapping = field_mapping or {}
        self.transform_rules = transform_rules or []
        self._build_transforms()
    
    def _build_transforms(self):
        """构建转换函数"""
        self.transforms: List[Callable] = []
        
        for rule in self.transform_rules:
            rule_type = rule.get('type', '')
            
            if rule_type == 'add_field':
                field = rule.get('field')
                value = rule.get('value')
                self.transforms.append(lambda d, f=field, v=value: {**d, f: v})
            
            elif rule_type == 'remove_field':
                field = rule.get('field')
                self.transforms.append(lambda d, f=field: {k: v for k, v in d.items() if k != f})
            
            elif rule_type == 'rename_field':
                old_field = rule.get('from')
                new_field = rule.get('to')
                self.transforms.append(
                    lambda d, old=old_field, new=new_field: (
                        {new: d.pop(old)} if old in d else d
                    ) | {k: v for k, v in d.items() if k != old}
                )
            
            elif rule_type == 'convert_type':
                field = rule.get('field')
                target_type = rule.get('target_type')
                self.transforms.append(
                    lambda d, f=field, t=target_type: self._convert_field(d, f, t)
                )
            
            elif rule_type == 'regex_replace':
                field = rule.get('field')
                pattern = rule.get('pattern', '')
                replacement = rule.get('replacement', '')
                regex = re.compile(pattern)
                self.transforms.append(
                    lambda d, f=field, p=regex, r=replacement: (
                        {**d, f: p.sub(r, str(d.get(f, '')))} if f in d else d
                    )
                )
            
            elif rule_type == 'uppercase':
                field = rule.get('field')
                self.transforms.append(
                    lambda d, f=field: {**d, f: str(d.get(f, '')).upper()} if f in d else d
                )
            
            elif rule_type == 'lowercase':
                field = rule.get('field')
                self.transforms.append(
                    lambda d, f=field: {**d, f: str(d.get(f, '')).lower()} if f in d else d
                )
    
    def _convert_field(self, data: Dict, field: str, target_type: str) -> Dict:
        """转换字段类型"""
        if field not in data:
            return data
        
        value = data[field]
        
        try:
            if target_type == 'int':
                data[field] = int(value)
            elif target_type == 'float':
                data[field] = float(value)
            elif target_type == 'str':
                data[field] = str(value)
            elif target_type == 'bool':
                data[field] = bool(value)
            elif target_type == 'json':
                if isinstance(value, str):
                    data[field] = json.loads(value)
            elif target_type == 'timestamp':
                data[field] = self._parse_timestamp(value)
        except (ValueError, TypeError) as e:
            logger.warning(f"Failed to convert field {field} to {target_type}: {e}")
        
        return data
    
    def _parse_timestamp(self, value: Any) -> str:
        """解析时间戳"""
        if isinstance(value, str):
            # 尝试多种格式
            formats = [
                '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%dT%H:%M:%S',
                '%Y-%m-%dT%H:%M:%S.%f',
                '%Y-%m-%d %H:%M:%S.%f',
                '%d/%b/%Y:%H:%M:%S',
            ]
            for fmt in formats:
                try:
                    dt = datetime.strptime(value, fmt)
                    return dt.isoformat()
                except ValueError:
                    continue
        
        return datetime.utcnow().isoformat()
    
    def transform(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """转换数据"""
        result = dict(data)
        
        # 应用字段映射
        result = self._apply_field_mapping(result)
        
        # 应用转换规则
        for transform in self.transforms:
            result = transform(result)
        
        return result
    
    def _apply_field_mapping(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """应用字段映射"""
        if not self.field_mapping:
            return data
        
        result = {}
        
        # 首先映射已定义的字段
        for dest, src in self.field_mapping.items():
            if src in data:
                result[dest] = data[src]
            else:
                # 处理模板形式，如 $remote_addr
                if isinstance(src, str) and src.startswith('$'):
                    # 字段引用，保持原样
                    result[dest] = src
        
        # 保留未映射的字段
        mapped_sources = set(self.field_mapping.values())
        for key, value in data.items():
            if key not in mapped_sources and key not in ['raw_log', 'parsed_at']:
                result[key] = value
        
        return result
