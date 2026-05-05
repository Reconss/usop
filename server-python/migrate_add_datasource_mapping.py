"""
数据库迁移脚本：为 data_sources 表添加数据流关联配置字段

使用方法：
    python migrate_add_datasource_mapping.py

该迁移会添加以下字段：
- log_type_id: 关联日志类型ID
- log_type_name: 关联日志类型名称
- pipeline_ids: 关联解析管道ID列表
- pipeline_names: 关联解析管道名称列表
- format_template_id: 关联格式模板ID
- format_template_name: 关联格式模板名称
- storage_table_name: 存储表名
- storage_retention_days: 数据保留天数
- storage_partition: 分区间隔
- storage_compression: 是否压缩
- storage_indexes: 索引字段
- flink_job_id: Flink任务ID
- flink_job_status: Flink任务状态
- flink_last_heartbeat: Flink最后心跳时间
"""

import psycopg2
import os
import sys

# 数据库连接配置
DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'port': os.environ.get('DB_PORT', '5432'),
    'database': os.environ.get('DB_NAME', 'usop'),
    'user': os.environ.get('DB_USER', 'postgres'),
    'password': os.environ.get('DB_PASSWORD', 'postgres')
}

def get_connection():
    """获取数据库连接"""
    return psycopg2.connect(**DB_CONFIG)

def check_column_exists(cursor, table_name, column_name):
    """检查列是否存在"""
    cursor.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = %s AND column_name = %s
    """, (table_name, column_name))
    return cursor.fetchone() is not None

def migrate():
    """执行迁移"""
    print("开始数据源关联配置字段迁移...")
    
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # 添加 log_type_id
        if not check_column_exists(cursor, 'data_sources', 'log_type_id'):
            cursor.execute("""
                ALTER TABLE data_sources 
                ADD COLUMN log_type_id VARCHAR(50) 
                REFERENCES log_types(id) 
                ON DELETE SET NULL
            """)
            print("✓ 添加 log_type_id 字段")
        else:
            print("- log_type_id 字段已存在")
        
        # 添加 log_type_name
        if not check_column_exists(cursor, 'data_sources', 'log_type_name'):
            cursor.execute("""
                ALTER TABLE data_sources 
                ADD COLUMN log_type_name VARCHAR(100)
            """)
            print("✓ 添加 log_type_name 字段")
        else:
            print("- log_type_name 字段已存在")
        
        # 添加 pipeline_ids (JSON数组)
        if not check_column_exists(cursor, 'data_sources', 'pipeline_ids'):
            cursor.execute("""
                ALTER TABLE data_sources 
                ADD COLUMN pipeline_ids JSONB DEFAULT '[]'::jsonb
            """)
            print("✓ 添加 pipeline_ids 字段")
        else:
            print("- pipeline_ids 字段已存在")
        
        # 添加 pipeline_names (JSON数组)
        if not check_column_exists(cursor, 'data_sources', 'pipeline_names'):
            cursor.execute("""
                ALTER TABLE data_sources 
                ADD COLUMN pipeline_names JSONB DEFAULT '[]'::jsonb
            """)
            print("✓ 添加 pipeline_names 字段")
        else:
            print("- pipeline_names 字段已存在")
        
        # 添加 format_template_id
        if not check_column_exists(cursor, 'data_sources', 'format_template_id'):
            cursor.execute("""
                ALTER TABLE data_sources 
                ADD COLUMN format_template_id VARCHAR(50) 
                REFERENCES format_templates(id) 
                ON DELETE SET NULL
            """)
            print("✓ 添加 format_template_id 字段")
        else:
            print("- format_template_id 字段已存在")
        
        # 添加 format_template_name
        if not check_column_exists(cursor, 'data_sources', 'format_template_name'):
            cursor.execute("""
                ALTER TABLE data_sources 
                ADD COLUMN format_template_name VARCHAR(100)
            """)
            print("✓ 添加 format_template_name 字段")
        else:
            print("- format_template_name 字段已存在")
        
        # 添加存储配置字段
        if not check_column_exists(cursor, 'data_sources', 'storage_table_name'):
            cursor.execute("""
                ALTER TABLE data_sources 
                ADD COLUMN storage_table_name VARCHAR(100)
            """)
            print("✓ 添加 storage_table_name 字段")
        else:
            print("- storage_table_name 字段已存在")
        
        if not check_column_exists(cursor, 'data_sources', 'storage_retention_days'):
            cursor.execute("""
                ALTER TABLE data_sources 
                ADD COLUMN storage_retention_days INTEGER DEFAULT 90
            """)
            print("✓ 添加 storage_retention_days 字段")
        else:
            print("- storage_retention_days 字段已存在")
        
        if not check_column_exists(cursor, 'data_sources', 'storage_partition'):
            cursor.execute("""
                ALTER TABLE data_sources 
                ADD COLUMN storage_partition VARCHAR(50) DEFAULT '1d'
            """)
            print("✓ 添加 storage_partition 字段")
        else:
            print("- storage_partition 字段已存在")
        
        if not check_column_exists(cursor, 'data_sources', 'storage_compression'):
            cursor.execute("""
                ALTER TABLE data_sources 
                ADD COLUMN storage_compression BOOLEAN DEFAULT TRUE
            """)
            print("✓ 添加 storage_compression 字段")
        else:
            print("- storage_compression 字段已存在")
        
        if not check_column_exists(cursor, 'data_sources', 'storage_indexes'):
            cursor.execute("""
                ALTER TABLE data_sources 
                ADD COLUMN storage_indexes JSONB DEFAULT '[]'::jsonb
            """)
            print("✓ 添加 storage_indexes 字段")
        else:
            print("- storage_indexes 字段已存在")
        
        # 添加 Flink 任务相关字段
        if not check_column_exists(cursor, 'data_sources', 'flink_job_id'):
            cursor.execute("""
                ALTER TABLE data_sources 
                ADD COLUMN flink_job_id VARCHAR(100)
            """)
            print("✓ 添加 flink_job_id 字段")
        else:
            print("- flink_job_id 字段已存在")
        
        if not check_column_exists(cursor, 'data_sources', 'flink_job_status'):
            cursor.execute("""
                ALTER TABLE data_sources 
                ADD COLUMN flink_job_status VARCHAR(20) DEFAULT 'stopped'
            """)
            print("✓ 添加 flink_job_status 字段")
        else:
            print("- flink_job_status 字段已存在")
        
        if not check_column_exists(cursor, 'data_sources', 'flink_last_heartbeat'):
            cursor.execute("""
                ALTER TABLE data_sources 
                ADD COLUMN flink_last_heartbeat TIMESTAMP
            """)
            print("✓ 添加 flink_last_heartbeat 字段")
        else:
            print("- flink_last_heartbeat 字段已存在")
        
        # 创建索引以提高查询性能
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_data_sources_log_type 
            ON data_sources(log_type_id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_data_sources_flink_status 
            ON data_sources(flink_job_status)
        """)
        print("✓ 创建索引")
        
        # 提交更改
        conn.commit()
        
        print("\n迁移完成！数据源关联配置字段已成功添加。")
        print("\n新字段说明:")
        print("  - log_type_id/log_type_name: 关联的日志类型")
        print("  - pipeline_ids/pipeline_names: 关联的解析管道列表")
        print("  - format_template_id/format_template_name: 关联的格式模板")
        print("  - storage_table_name/retention_days/partition/compression/indexes: 存储配置")
        print("  - flink_job_id/status/heartbeat: Flink任务状态")
        
    except Exception as e:
        conn.rollback()
        print(f"迁移失败: {str(e)}")
        raise
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    migrate()
