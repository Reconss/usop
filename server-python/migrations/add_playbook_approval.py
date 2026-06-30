"""
剧本审批功能数据库迁移脚本

新增表:
- playbook_approvals: 剧本审批请求
- notifications: 通知中心 (已存在，需更新字段)

运行方式: python migrations/add_playbook_approval.py
"""
import sys
import os

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import db
from run import app

def run_migration():
    with app.app_context():
        # 创建 playbook_approvals 表
        from sqlalchemy import text
        
        # 检查表是否存在
        result = db.session.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'playbook_approvals'
            );
        """))
        table_exists = result.scalar()
        
        if not table_exists:
            db.session.execute(text("""
                CREATE TABLE playbook_approvals (
                    id VARCHAR(50) PRIMARY KEY,
                    playbook_id INTEGER REFERENCES playbooks(id),
                    execution_id VARCHAR(50) REFERENCES playbook_executions(id),
                    approval_type VARCHAR(50),
                    approval_level INTEGER DEFAULT 2,
                    status VARCHAR(20) DEFAULT 'pending',
                    requester_id INTEGER REFERENCES users(id),
                    requester_name VARCHAR(100),
                    approver_id INTEGER REFERENCES users(id),
                    approver_name VARCHAR(100),
                    approved_at TIMESTAMP,
                    reason TEXT,
                    params JSONB DEFAULT '{}',
                    result JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """))
            print("✓ 创建 playbook_approvals 表")
        else:
            print("✓ playbook_approvals 表已存在")
        
        # 更新 notifications 表字段
        try:
            db.session.execute(text("""
                ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(50);
                ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal';
                ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
                ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP;
            """))
            print("✓ 更新 notifications 表字段")
        except Exception as e:
            print(f"! notifications 表更新: {e}")
        
        # 创建角色审批等级字段
        try:
            db.session.execute(text("""
                ALTER TABLE roles ADD COLUMN IF NOT EXISTS approval_level INTEGER DEFAULT 0;
            """))
            print("✓ 更新 roles 表字段")
        except Exception as e:
            print(f"! roles 表更新: {e}")
        
        db.session.commit()
        print("\n✓ 迁移完成!")

if __name__ == '__main__':
    run_migration()
