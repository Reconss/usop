"""
数据库迁移：添加 storage_tables 表的 columns 列
用于存储每个存储表的字段定义（名称、类型、标签、是否必填等）
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.database import db


PREDEFINED_TABLE_COLUMNS = {
    'alert_logs': [
        {'name': 'timestamp', 'label': '事件时间', 'type': 'datetime', 'category': '时间', 'required': True},
        {'name': 'severity', 'label': '严重程度', 'type': 'string', 'category': '告警属性', 'required': True},
        {'name': 'src_ip', 'label': '源地址', 'type': 'string', 'category': '网络-五元组', 'required': True},
        {'name': 'src_port', 'label': '源端口', 'type': 'number', 'category': '网络-五元组', 'required': False},
        {'name': 'dst_ip', 'label': '目标地址', 'type': 'string', 'category': '网络-五元组', 'required': True},
        {'name': 'dst_port', 'label': '目标端口', 'type': 'number', 'category': '网络-五元组', 'required': False},
        {'name': 'protocol', 'label': '协议', 'type': 'string', 'category': '网络-五元组', 'required': False},
        {'name': 'action', 'label': '处置动作', 'type': 'string', 'category': '告警属性', 'required': False},
        {'name': 'title', 'label': '告警标题', 'type': 'string', 'category': '告警属性', 'required': True},
        {'name': 'description', 'label': '描述', 'type': 'string', 'category': '告警属性', 'required': False},
        {'name': 'source_product', 'label': '数据源产品', 'type': 'string', 'category': '数据源', 'required': True},
        {'name': 'category', 'label': '分类', 'type': 'string', 'category': '告警属性', 'required': False},
        {'name': 'rule_id', 'label': '规则ID', 'type': 'string', 'category': '检测规则', 'required': False},
        {'name': 'alert_code', 'label': '告警编码', 'type': 'string', 'category': '检测规则', 'required': False},
        {'name': 'raw_log', 'label': '原始日志', 'type': 'string', 'category': '原始数据', 'required': True},
        {'name': 'hostname', 'label': '主机名', 'type': 'string', 'category': '资产', 'required': False},
        {'name': 'username', 'label': '用户名', 'type': 'string', 'category': '身份', 'required': False},
        {'name': 'method', 'label': '请求方法', 'type': 'string', 'category': 'HTTP请求', 'required': False},
        {'name': 'url', 'label': '请求URL', 'type': 'string', 'category': 'HTTP请求', 'required': False},
        {'name': 'user_agent', 'label': '用户代理', 'type': 'string', 'category': 'HTTP请求', 'required': False},
        {'name': 'response_code', 'label': '响应状态码', 'type': 'number', 'category': 'HTTP请求', 'required': False},
    ],
    'workspace_events': [
        {'name': 'title', 'label': '事件标题', 'type': 'string', 'category': '基础', 'required': True},
        {'name': 'event_type', 'label': '事件类型', 'type': 'string', 'category': '基础', 'required': True},
        {'name': 'severity', 'label': '严重程度', 'type': 'string', 'category': '基础', 'required': True},
        {'name': 'source_ip', 'label': '源IP', 'type': 'string', 'category': '网络', 'required': False},
        {'name': 'dst_ip', 'label': '目标IP', 'type': 'string', 'category': '网络', 'required': False},
        {'name': 'description', 'label': '描述', 'type': 'string', 'category': '基础', 'required': False},
        {'name': 'status', 'label': '状态', 'type': 'string', 'category': '基础', 'required': True},
        {'name': 'assigned_to', 'label': '指派人', 'type': 'string', 'category': '基础', 'required': False},
        {'name': 'created_at', 'label': '创建时间', 'type': 'datetime', 'category': '时间', 'required': True},
        {'name': 'updated_at', 'label': '更新时间', 'type': 'datetime', 'category': '时间', 'required': False},
    ],
    'security_events': [
        {'name': 'timestamp', 'label': '事件时间', 'type': 'datetime', 'category': '时间', 'required': True},
        {'name': 'event_type', 'label': '事件类型', 'type': 'string', 'category': '基础', 'required': True},
        {'name': 'severity', 'label': '严重程度', 'type': 'string', 'category': '基础', 'required': True},
        {'name': 'title', 'label': '事件标题', 'type': 'string', 'category': '基础', 'required': True},
        {'name': 'description', 'label': '描述', 'type': 'string', 'category': '基础', 'required': False},
        {'name': 'src_ip', 'label': '源地址', 'type': 'string', 'category': '网络', 'required': False},
        {'name': 'dst_ip', 'label': '目标地址', 'type': 'string', 'category': '网络', 'required': False},
        {'name': 'src_port', 'label': '源端口', 'type': 'number', 'category': '网络', 'required': False},
        {'name': 'dst_port', 'label': '目标端口', 'type': 'number', 'category': '网络', 'required': False},
        {'name': 'protocol', 'label': '协议', 'type': 'string', 'category': '网络', 'required': False},
        {'name': 'hostname', 'label': '主机名', 'type': 'string', 'category': '资产', 'required': False},
        {'name': 'username', 'label': '用户名', 'type': 'string', 'category': '身份', 'required': False},
        {'name': 'process_name', 'label': '进程名', 'type': 'string', 'category': '进程', 'required': False},
        {'name': 'raw_log', 'label': '原始日志', 'type': 'string', 'category': '原始数据', 'required': True},
        {'name': 'rule_id', 'label': '规则ID', 'type': 'string', 'category': '检测规则', 'required': False},
    ],
}


def run_migration():
    app = create_app()

    with app.app_context():
        conn = db.engine.raw_connection()
        cursor = conn.cursor()

        # 检查 columns 列是否存在
        cursor.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'storage_tables' AND column_name = 'columns'
        """)
        if not cursor.fetchone():
            try:
                cursor.execute("ALTER TABLE storage_tables ADD COLUMN columns JSON DEFAULT '[]'")
                print("✓ 添加列: columns (JSON)")
            except Exception as e:
                print(f"✗ 添加列失败: {e}")
        else:
            print("- 列已存在: columns")

        conn.commit()

        # 为预定义表填充 columns 数据
        import json as _json
        for table_name, columns_def in PREDEFINED_TABLE_COLUMNS.items():
            cursor.execute(
                "UPDATE storage_tables SET columns = %s WHERE name = %s AND (columns IS NULL OR columns::text = '[]')",
                (_json.dumps(columns_def), table_name)
            )
            if cursor.rowcount > 0:
                print(f"✓ 为表 '{table_name}' 填充了 {len(columns_def)} 个字段定义")

        conn.commit()
        cursor.close()
        conn.close()

        print("\n迁移完成！")


if __name__ == '__main__':
    print("=" * 50)
    print("添加 storage_tables.columns 列")
    print("=" * 50)
    run_migration()
    print("=" * 50)
