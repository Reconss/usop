"""
自然语言安全助手
支持自然语言查询，意图识别后调用后端 API 返回结果
"""
import json, logging, re

logger = logging.getLogger(__name__)
