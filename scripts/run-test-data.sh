#!/bin/bash
# 检测规则功能测试运行脚本
# 用法: ./run-tests.sh [options]

set -e

echo "=============================================="
echo "检测规则和告警聚合功能 - 测试数据加载"
echo "=============================================="

# 检查Python环境
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到 python3"
    exit 1
fi

# 检查是否在正确的目录
if [ ! -f "server-python/test_data_rules.py" ]; then
    echo "错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 检查数据库连接
echo ""
echo "[1/3] 检查数据库连接..."
cd server-python
python3 -c "
from app import create_app
app = create_app()
with app.app_context():
    from app.database import db
    db.session.execute('SELECT 1')
    print('    ✓ 数据库连接正常')
" || {
    echo "错误: 无法连接数据库，请确保服务已启动"
    exit 1
}

# 生成测试数据
echo ""
echo "[2/3] 生成测试数据..."
python3 test_data_rules.py

# 验证数据
echo ""
echo "[3/3] 验证测试数据..."
python3 -c "
from app import create_app
from app.models import Rule, Alert, Playbook, DataSource
app = create_app()
with app.app_context():
    rules = Rule.query.filter(Rule.id.between(1001, 1010)).all()
    alerts = Alert.query.filter(Alert.id.between(2001, 2020)).all()
    playbooks = Playbook.query.filter(Playbook.id.between(1001, 1010)).all()
    sources = DataSource.query.filter(DataSource.id.between(101, 110)).all()
    
    print('')
    print('    验证结果:')
    print(f'    - 检测规则: {len(rules)} 条')
    print(f'    - 告警数据: {len(alerts)} 条')
    print(f'    - 剧本数据: {len(playbooks)} 条')
    print(f'    - 数据源: {len(sources)} 条')
    print('')
    print('    ✓ 测试数据加载完成!')
"

echo ""
echo "=============================================="
echo "测试数据已成功加载!"
echo ""
echo "测试数据清单:"
echo "  - 规则ID: 1001-1008"
echo "  - 告警ID: 2001-2012"
echo "  - 剧本ID: 1001-1004"
echo "  - 数据源ID: 101-105"
echo ""
echo "功能测试请参考:"
echo "  web/src/test-data/test-data-rules.json"
echo "=============================================="
