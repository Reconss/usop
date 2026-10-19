# 部署与运维

> 面向开发/运维的日常操作手册。所有命令均在项目根目录 `/Users/codes/usop` 执行。

## 1. 日常发版

### 前端

```bash
# 必须使用本地二进制 webpack（npx 会交互卡死静默失败）
cd web && ./node_modules/.bin/webpack --mode production

# 部署到容器
docker exec usop_all sh -c 'rm -rf /app/static/*'
docker cp web/dist/. usop_all:/app/static/
```

### 后端

`server-python/app` 已 bind mount 到容器 `/app/app`，**改完代码只需重启**：

```bash
docker restart usop_all
```

需要 `docker cp` 的例外：`seed_data.py`、`migrations/`、`flink-jobs/`（不在 bind mount 范围）。

### Flink 作业

修改 `flink-jobs/` 后需 `docker cp` 到 jobmanager 并重新提交作业（常驻作业 `USOP-Correlation-Analysis` 见 Flink UI :8081）。

## 2. 数据库迁移约定

- **无 Alembic**。流程：新模型先在 `create_all()` 调用前 import → 启动自动建表；已存在的表加列需写幂等迁移脚本：
  ```bash
  # migrations/ 下写幂等 ALTER（ADD COLUMN IF NOT EXISTS），然后：
  docker cp migrations/xxx.py usop_all:/tmp/mig.py
  docker exec -w /app -e PYTHONPATH=/app usop_all python3 /tmp/mig.py
  docker exec usop_all rm /tmp/mig.py
  ```
- ⚠️ **模型加字段后必须立刻迁移 DB**：bind mount 使代码即时生效，模型与表结构不一致会导致容器 crash 重启循环。此时 `docker exec` 不可用，需直接经 `usop_postgres` 容器执行 ALTER 解锁：
  ```bash
  docker exec usop_postgres psql -U usop -d usop_security -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS xxx VARCHAR(64);"
  ```

## 3. 开发环境 JWT 签发

```bash
docker exec usop_all python3 -c "import jwt,datetime;print(jwt.encode({'user_id':1,'username':'admin','exp':datetime.datetime.utcnow()+datetime.timedelta(hours=1)},'usop-jwt-secret-dev-local',algorithm='HS256'))"
```

调用示例：

```bash
curl -s -H "Authorization: Bearer <token>" http://localhost:3266/api/users-api/users?page_size=10
```

> JWT 有效期 1 小时（脚本/无头浏览器测试时注意过期会跳登录页）。

## 4. LLM 说明

- 当前 `USE_HERMES_PROXY` 指向不存在地址，LLM 调用恒走**规则兜底**（结果 `is_ai=False`，UI 已标注）
- 提示词按 `prompt_key` 管理（`resolve_prompt` / `render_prompt`，回退 `BUILTIN_PROMPTS`）；新增提示词需同步 `ai_prompt.py` 三处

## 5. 常用排查命令

```bash
# 容器状态
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "usop|kafka|elastic|flink|redis"

# 后端日志
docker logs usop_all --tail 100 -f

# ES 告警索引概览
docker exec elasticsearch curl -s "http://localhost:9200/_cat/indices/alerts-*?h=index,docs.count"

# Flink 常驻作业状态（应显示 USOP-Correlation-Analysis RUNNING）
docker exec flink-jobmanager curl -s http://localhost:8081/jobs

# Kafka topic 列表
docker exec kafka kafka-topics --bootstrap-server localhost:29092 --list

# PG 快速查询
docker exec usop_postgres psql -U usop -d usop_security -c "SELECT count(*) FROM events;"

# 容器内探针（app context 下调用内部函数）
docker cp probe.py usop_all:/tmp/probe.py
docker exec -w /app -e PYTHONPATH=/app usop_all python3 /tmp/probe.py
```

## 6. 常见坑（历史踩坑总结）

| 现象 | 原因与处理 |
|---|---|
| 蓝图 404 但「没数据」 | 改写库路径前先 grep 确认被调函数真存在；蓝图错配 404 被 try/catch 吞掉 |
| 操作人恒为 system | 认证注入的是 `request.current_user`（JWT payload dict），不是 `request.username`/`user_id` |
| update_by_query 400 | `refresh` 参数只收 `true`/`false`（`wait_for` 不合法） |
| docker exec 读 heredoc 无输出 | 必须加 `-i` |
| 关浮层瞬间消失「闪现」 | CSS 动画类（`.overlay`/`.modal-panel`/`.drawer-panel`）覆盖 framer-motion 内联样式 → framer 驱动的浮层必须加 `motion-owned` 类 |
| @ts-nocheck 文件的隐性错误 | AICenter / EventWorkspace 关闭了类型检查：函数定义在 return 之后=不可达死代码；改动后必须无头浏览器实测 |
| 前端接口传 eventCode、本地主键是数字 id | 刷新判断需两者都匹配 |
| 复杂 SQL 引号嵌套 | psql `-c` 内嵌 JSON 易碎，用 SQL 文件 + `docker cp` + `psql -f` |

## 7. 前端设计系统（改 UI 前必读）

- 设计令牌唯一来源 `web/tailwind.config.js`（RGB 通道变量）；**禁写 hex、禁用 `bg-emerald-500` 等原始调色板类**
- 公共组件在 `web/src/components/ui/`：Button / ContentContainer / PageHeader / SectionCard / StatCard / StatusBadge 系列 / FilterBar / EmptyState / LoadingState / Field / Segmented / InfoList / Modal / Switch —— **页面不要手写卡片与按钮**
- 图表取色用 `web/src/styles/chartTheme.ts::useChartTokens()`
- PageHeader 已紧凑化：无面包屑、无页面级 description、图标 16px、头部高 30-34px
- 页面容器 `.app-page` padding 16/24/24、gap 16
- 股市/安全涨跌可视化遵循国内惯例：涨=红、跌=绿

## 8. 验证约定

- 前端改动验证必须用**无头浏览器**（curl 恒 200 不代表渲染正常）：
  - 注入认证：`localStorage` 键为 `token`（JWT 字符串）+ `user`（JSON）；校验端点 `/api/auth/me`
  - 两次 `goto` 必须使用不同 query 参数，否则 hash 路由不触发整页刷新、认证校验不重跑会踢回登录页
  - 关注 pageerror / console.error，必要时逐帧截图核对动画中间态
- 后端改动用容器探针（第 5 节）验证真实函数行为，再 curl 端点
