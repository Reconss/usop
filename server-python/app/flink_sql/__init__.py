"""Flink 相关能力（SQL 生成 + 网关提交）。

关联分析：规则存 PG → 生成 Flink SQL → 提交到 Flink 会话集群 →
Kafka(valid-alerts) → 窗口关联分析 → 事件写入 PG events 表。
"""
from app.flink_sql import correlation, gateway  # noqa: F401

__all__ = ['correlation', 'gateway']
