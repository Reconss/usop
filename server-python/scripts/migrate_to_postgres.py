#!/usr/bin/env python3
"""
USOP 数据迁移脚本
功能：从 SQLite 迁移数据到 PostgreSQL

使用方法：
    python migrate_to_postgres.py

注意事项：
    1. 确保 PostgreSQL 已启动并可访问
    2. 确保 SQLite 数据库存在 (instance/usop.db)
    3. 迁移前会备份 SQLite 数据库
"""

import os
import sys
import shutil
import sqlite3
from datetime import datetime

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app import create_app
from app.database import db


def backup_sqlite(sqlite_path: str) -> str:
    """备份 SQLite 数据库"""
    backup_path = f"{sqlite_path}.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    shutil.copy2(sqlite_path, backup_path)
    print(f"✅ SQLite 数据库已备份到: {backup_path}")
    return backup_path


def get_sqlite_connection(sqlite_path: str) -> sqlite3.Connection:
    """获取 SQLite 连接"""
    return sqlite3.connect(sqlite_path)


def get_sqlite_tables(conn: sqlite3.Connection) -> list:
    """获取 SQLite 中的所有表"""
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
    return [row[0] for row in cursor.fetchall()]


def get_table_data(conn: sqlite3.Connection, table_name: str) -> list:
    """获取表中的所有数据"""
    cursor = conn.execute(f"SELECT * FROM {table_name}")
    columns = [description[0] for description in cursor.description]
    rows = cursor.fetchall()
    return columns, rows


def get_postgres_engine():
    """创建 PostgreSQL 连接引擎"""
    database_url = os.getenv('DATABASE_URL', 'postgresql://usop:usop_password@localhost:5432/usop_security')
    return create_engine(database_url)


def create_tables_in_postgres(engine):
    """在 PostgreSQL 中创建所有表"""
    print("📋 创建 PostgreSQL 表结构...")
    
    # 使用 Flask-SQLAlchemy 创建所有表
    app = create_app()
    with app.app_context():
        # 确保所有模型都已导入
        from app.models import (
            User, Event, Alert, Asset, ScanTask, Rule, Playbook,
            AuditLog, Notification, HuntingQuery, AIModel, AITask,
            DataSource, Product, Pipeline, AlertLog as AlertLogModel, SystemConfig,
            LogType, FormatTemplate, DataTable, LogClassifier, ClassifierRule, DataSourceConfig,
            Vulnerability, AssetVulnerability, ScanProfile, ScanAgent, HuntingResult,
            AIInsight, AIChatSession, AIChatMessage, AIAgent, Role, AssetPort,
            ScanResult, DetectionRuleExtended, PlaybookExecution, EventAction
        )
        
        # 创建所有表
        db.create_all()
        print("✅ 所有表已创建")


def migrate_table(engine, table_name: str, columns: list, rows: list):
    """迁移单个表的数据"""
    if not rows:
        print(f"  ⏭️  表 {table_name} 无数据，跳过")
        return 0
    
    with engine.connect() as conn:
        # 构建 INSERT 语句
        placeholders = ', '.join([':' + col for col in columns])
        insert_sql = text(f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({placeholders})")
        
        # 批量插入
        for row in rows:
            row_dict = dict(zip(columns, row))
            # 处理 None 值和特殊类型
            for key, value in row_dict.items():
                if value is None:
                    continue
                elif isinstance(value, datetime):
                    row_dict[key] = value.isoformat()
                elif isinstance(value, (int, float, str, bool)):
                    continue
                else:
                    # JSON, bytes 等转换为字符串
                    row_dict[key] = str(value)
            
            try:
                with conn.begin():
                    conn.execute(insert_sql, row_dict)
            except Exception as e:
                print(f"  ⚠️  插入数据时出错: {e}")
                # 尝试跳过问题行
                continue
        
        conn.commit()
    
    print(f"  ✅ 迁移了 {len(rows)} 条记录到表 {table_name}")
    return len(rows)


def migrate_data():
    """执行数据迁移"""
    sqlite_path = os.path.join(os.path.dirname(__file__), '..', 'instance', 'usop.db')
    sqlite_path = os.path.abspath(sqlite_path)
    
    print("=" * 60)
    print("  USOP 数据迁移工具 - SQLite → PostgreSQL")
    print("=" * 60)
    print()
    
    # 检查 SQLite 数据库是否存在
    if not os.path.exists(sqlite_path):
        print(f"❌ SQLite 数据库不存在: {sqlite_path}")
        print("   请确保应用已正常运行并生成了数据库文件")
        return False
    
    print(f"📂 SQLite 数据库路径: {sqlite_path}")
    
    # 备份 SQLite
    print("\n📦 备份 SQLite 数据库...")
    backup_sqlite(sqlite_path)
    
    # 连接 SQLite
    print("\n🔌 连接 SQLite 数据库...")
    sqlite_conn = get_sqlite_connection(sqlite_path)
    
    # 获取所有表
    tables = get_sqlite_tables(sqlite_conn)
    print(f"📋 发现 {len(tables)} 个表: {', '.join(tables)}")
    
    # 连接到 PostgreSQL
    print("\n🔌 连接 PostgreSQL 数据库...")
    try:
        postgres_engine = get_postgres_engine()
        # 测试连接
        with postgres_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("✅ PostgreSQL 连接成功")
    except Exception as e:
        print(f"❌ PostgreSQL 连接失败: {e}")
        print("   请确保 PostgreSQL 服务已启动")
        sqlite_conn.close()
        return False
    
    # 创建表结构
    print("\n📋 创建 PostgreSQL 表结构...")
    create_tables_in_postgres(postgres_engine)
    
    # 迁移数据
    print("\n📥 开始迁移数据...")
    total_records = 0
    migrated_tables = []
    
    for table_name in tables:
        print(f"\n📊 迁移表: {table_name}")
        columns, rows = get_table_data(sqlite_conn, table_name)
        count = migrate_table(postgres_engine, table_name, columns, rows)
        if count > 0:
            total_records += count
            migrated_tables.append(table_name)
    
    sqlite_conn.close()
    
    print("\n" + "=" * 60)
    print("  迁移完成!")
    print("=" * 60)
    print(f"✅ 成功迁移 {len(migrated_tables)} 个表")
    print(f"✅ 共迁移 {total_records} 条记录")
    print(f"\n表列表:")
    for t in migrated_tables:
        print(f"  - {t}")
    print("\n⚠️  注意：迁移完成后的应用配置已更新为使用 PostgreSQL")
    print("   如需回滚，可使用备份的 SQLite 文件恢复")
    
    return True


if __name__ == '__main__':
    success = migrate_data()
    sys.exit(0 if success else 1)
