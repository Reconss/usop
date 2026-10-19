"""清理旧 RBAC 种子残留角色 senior_analyst。

背景：2026-10-19 RBAC 重建前库里存在一个旧种子角色 senior_analyst
（is_system=true，但仅 6 项旧版权限点，不在 SYSTEM_ROLES 清单内，且无用户绑定）。
它会以「系统」身份出现在角色管理页，但权限语义已过时，容易误导。
本脚本幂等：仅当该角色存在且无用户绑定时删除；已有用户绑定时跳过并提示。
"""
from app.database import db
from app.models.extensions import Role
from app.models import User


def upgrade():
    role = Role.query.filter_by(id='senior_analyst').first()
    if not role:
        print('senior_analyst 不存在，无需清理')
        return

    bound = User.query.filter_by(role='senior_analyst').count()
    if bound:
        print(f'跳过：仍有 {bound} 个用户绑定 senior_analyst，请先调整用户角色')
        return

    db.session.delete(role)
    db.session.commit()
    print('已删除残留角色 senior_analyst（无用户绑定）')


if __name__ == '__main__':
    from app import create_app
    app = create_app()
    with app.app_context():
        upgrade()
