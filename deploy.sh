#!/bin/bash
# ===========================================
# USOP 安全运营平台 - 部署脚本
# ===========================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印函数
print_header() {
    echo -e "\n${BLUE}===========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# 检查 Docker 和 Docker Compose
check_docker() {
    print_header "检查 Docker 环境"
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    print_success "Docker 已安装: $(docker --version)"
    
    if ! command -v docker compose &> /dev/null; then
        print_error "Docker Compose 未安装"
        exit 1
    fi
    print_success "Docker Compose 已安装"
}

# 初始化环境变量
init_env() {
    print_header "初始化环境变量"
    
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            cp .env.example .env
            print_success "已从 .env.example 创建 .env 文件"
            print_warning "请编辑 .env 文件修改默认密码"
        fi
    else
        print_success ".env 文件已存在"
    fi
}

# 构建并启动服务
deploy() {
    print_header "构建并启动服务"
    
    # 构建镜像
    echo -e "${YELLOW}正在构建镜像...${NC}"
    docker compose build --no-cache
    
    # 启动服务
    echo -e "${YELLOW}正在启动服务...${NC}"
    docker compose up -d
    
    # 等待服务启动
    echo -e "${YELLOW}等待服务启动...${NC}"
    sleep 10
    
    # 检查服务状态
    print_header "检查服务状态"
    docker compose ps
    
    # 检查健康状态
    echo -e "\n${YELLOW}检查服务健康状态...${NC}"
    
    # 检查后端
    if curl -sf http://localhost:5001/api/health > /dev/null 2>&1; then
        print_success "后端服务运行正常"
    else
        print_error "后端服务启动失败"
    fi
    
    # 检查前端
    if curl -sf http://localhost/health > /dev/null 2>&1; then
        print_success "前端服务运行正常"
    else
        print_error "前端服务启动失败"
    fi
    
    # 检查数据库
    if docker compose exec -T db pg_isready -U usop > /dev/null 2>&1; then
        print_success "数据库运行正常"
    else
        print_error "数据库启动失败"
    fi
}

# 停止服务
stop() {
    print_header "停止服务"
    docker compose down
    print_success "所有服务已停止"
}

# 查看日志
logs() {
    print_header "查看日志"
    docker compose logs -f --tail=100
}

# 清理
clean() {
    print_header "清理资源"
    print_warning "这将删除所有数据卷和容器！"
    read -p "确定要继续吗？(y/N): " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        docker compose down -v
        print_success "所有资源已清理"
    else
        print_info "已取消"
    fi
}

# 数据库迁移
migrate() {
    print_header "执行数据库迁移"
    docker compose exec backend python -m flask db upgrade || true
    print_success "数据库迁移完成"
}

# 生成测试数据
seed() {
    print_header "生成测试数据"
    docker compose exec backend python seed_data.py
}

# 显示帮助
show_help() {
    echo -e "${BLUE}USOP 安全运营平台 - 部署脚本${NC}\n"
    echo "用法: $0 [命令]\n"
    echo "可用命令:"
    echo "  deploy   - 构建并启动所有服务"
    echo "  start    - 启动已构建的服务"
    echo "  stop     - 停止所有服务"
    echo "  restart  - 重启所有服务"
    echo "  logs     - 查看日志 (Ctrl+C 退出)"
    echo "  clean    - 清理所有资源 (慎用)"
    echo "  migrate  - 执行数据库迁移"
    echo "  seed     - 生成测试数据"
    echo "  status   - 查看服务状态"
    echo "  help     - 显示此帮助信息"
}

# 主程序
case "${1:-help}" in
    deploy)
        check_docker
        init_env
        deploy
        ;;
    start)
        docker compose up -d
        print_success "服务已启动"
        ;;
    stop)
        stop
        ;;
    restart)
        stop
        deploy
        ;;
    logs)
        logs
        ;;
    clean)
        clean
        ;;
    migrate)
        migrate
        ;;
    seed)
        seed
        ;;
    status)
        docker compose ps
        ;;
    help|*)
        show_help
        ;;
esac

# 显示访问信息
if [ "${1:-help}" = "deploy" ]; then
    print_header "部署完成！"
    echo -e "访问地址:"
    echo -e "  ${GREEN}前端界面: http://localhost${NC}"
    echo -e "  ${GREEN}后端API:  http://localhost:5001/api${NC}"
    echo -e "\n默认账号:"
    echo -e "  ${YELLOW}管理员: admin / admin123${NC}"
fi
