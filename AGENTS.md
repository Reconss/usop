# USOP 开发指南

## 快速启动

```bash
# 方式1: 使用部署脚本（推荐）
./deploy.sh

# 方式2: 手动部署
docker-compose up -d
```

## 代码变更后部署

代码变更后，需要重新构建并部署到容器：

```bash
./deploy.sh
```

## 服务地址

- 前端: http://localhost:3266
- 后端: http://localhost:5001
- PostgreSQL: localhost:5432
- TimescaleDB: localhost:5433
- Redis: localhost:6379

## 默认账号

- 用户名: admin
- 密码: admin123

## 常用命令

```bash
# 查看日志
docker-compose logs -f backend
docker-compose logs -f frontend

# 重启服务
docker-compose restart backend frontend

# 停止服务
docker-compose down
```
