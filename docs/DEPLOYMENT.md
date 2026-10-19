# USOP 统一安全运营平台 — 部署要求评估

> 评估基准：2026-10 当前版本（git 8608ca3 之后），资源数据为本机实测（Apple M1 Pro / Docker 虚拟机 15.66GiB 环境），生产规格按实测上浮推算。

## 1. 组件架构与实测资源

数据流：`日志源 → Kafka → pipeline(标准化/过滤去重/分流) → ES → Flink 关联 → PG events`，应用层为 nginx(静态) + Flask(API) 单容器 `usop_all`。

| 组件 | 镜像/版本 | 镜像体积 | 实测内存 | 实测 CPU | 端口 |
|---|---|---|---|---|---|
| usop_all（nginx + Flask + 前端静态） | usop-usop:latest | 547MB | ~190MiB | 7~8%（常态） | 3266 / 5001 |
| PostgreSQL | postgres:16-alpine | 390MB | ~63MiB | ≈0 | 5432 |
| Redis | redis:7-alpine | 60MB | ~5MiB | ≈1% | 6379 |
| Kafka（KRaft 单节点） | cp-kafka:7.5.0 | 1.35GB | ~1.24GiB | ~6% | 9092 / 29092 |
| Elasticsearch | 8.11.0 | 1.23GB | ~1.15GiB | ≈0.5% | 9200 |
| Flink JobManager | flink:1.18.1 | 1.38GB | ~671MiB | ~2% | 8081 |
| Flink TaskManager | flink:1.18.1 | 同上 | ~417MiB | ~2% | — |
| Flink SQL Gateway | flink:1.18.1 | 同上 | ~545MiB | ≈0 | 8083 |
| **合计** | | **~4.9GB 镜像** | **~3.6GiB 空载** | | |

当前数据体量参考：ES 索引（alerts-valid/invalid）< 1MB、PG 库 31MB —— 属早期数据量，磁盘规划主要按增长预估（见 §3）。

## 2. 资源规格分档

| 档位 | 适用场景 | CPU | 内存 | 系统盘 | 数据盘 |
|---|---|---|---|---|---|
| **最小可用** | POC / 演示 / 功能验证 | 4 核 | 8GB | 60GB | 50GB |
| **推荐（小规模生产）** | ≤ 500 EPS（每秒事件数），1000 以内资产 | 8 核 | 16GB | 100GB | 500GB（SSD） |
| **生产规模化** | > 2000 EPS，组件拆分部署 | 16 核+ | 32GB+ | 100GB | 1TB+（SSD/RAID） |

说明：
- 空载即占 ~3.6GB 内存，8GB 内存机器跑最小档已无余量，JVM 类组件（Kafka/ES/Flink 合计 ~3.9GB 堆外+堆）是内存大头。
- **内存是第一瓶颈，其次 ES/Kafka 的磁盘 IO**；CPU 压力很小（解析与关联均为轻量计算）。
- 若与其它业务混部，请按上表预留独占资源，尤其 ES（默认 1GB 堆，建议生产调至物理内存一半、不超过 31GB）。

## 3. 磁盘增长预估（数据盘规划依据）

| 数据 | 位置 | 估算方式 |
|---|---|---|
| 告警原始日志（ES） | `data/`（ES volume） | 单条标准告警 ~2KB；500 EPS × 7 天保留 ≈ **60GB/周** |
| Kafka | `data/kafka` | 与吞吐同量级，保留 7 天 ≈ 50~80GB（500 EPS） |
| PostgreSQL | PG volume | 业务数据（事件/漏洞/剧本执行记录），增长慢，10GB 预留足够一年 |
| Flink checkpoint | `data/flink` | 小，5GB 预留 |
| 漏洞附件 | `server-python/app/uploads/` | 单文件 ≤20MB，按量另计 |
| **合计（推荐档）** | | **500GB 数据盘 ≈ 2~4 周告警滚动 + 冗余**；更长时间需调 ES ILM 或扩盘 |

> 生产建议开启 ES 索引生命周期（hot→delete 7/30 天可配），否则告警盘会线性涨满。

## 4. 依赖版本矩阵

| 依赖 | 版本 | 备注 |
|---|---|---|
| Python | 3.11（容器）/ 3.11+（裸机） | requirements.txt 已含 pyyaml、ldap3（2026-10 补入，重建镜像/裸机必装） |
| Node.js + pnpm | 20.x | 仅构建期需要，产物为纯静态文件 |
| PostgreSQL | 16 | 库名 `usop_security`；无 Alembic，初始化走 `db.create_all()` + `migrations/*.py` |
| Redis | 7 | 队列/缓存 |
| Kafka | 7.5.0（KRaft 模式，免 ZooKeeper） | 单节点即可；`replication_factor=1` 仅适合单机 |
| Elasticsearch | 8.11.0 | 告警唯一真相源，**禁用 security 强制项需固定**（见 §5 容器部署） |
| Flink | 1.18.1 (scala_2.12, java11) | 需外挂 4 个连接器 jar（kafka/jdbc/postgresql，见 `flink-jars/`） |
| nginx | 任意 1.2x | 容器内置；裸机自装，承载 3266 静态 + 反代 5001 |

## 5. 方式一：容器部署（推荐，已有完整编排）

仓库已含 `docker-compose.yml`（7 服务）+ `Dockerfile.all`（三阶段构建：前端 pnpm build → Python 依赖 → 合并+nginx）。

```bash
# 1. 构建并启动（首次约 10~20 分钟，取决于网络）
docker compose up -d --build

# 2. 初始化（按需执行）
docker exec usop_all sh -c 'cd /app && PYTHONPATH=/app python3 migrations/add_vuln_fields.py'
docker exec usop_all python3 scripts/pipeline_setup.py      # 7 产品全链路管道（幂等）
docker exec usop_all python3 scripts/setup_block_playbooks.py  # 封禁剧本 id=36/37
```

**关键注意事项（均为实际踩坑项）：**

1. **Flink 环境变量**：禁止给 Flink 容器加 `FLINK_PROPERTIES`——entrypoint 会把它追加进 bind-mount 的 `flink-conf.yaml`，每次重启重复追加。所有 Flink 配置统一写在 `flink-conf/flink-conf.yaml`。
2. **Flink 连接器 jar 必须逐文件挂载**进 `/opt/flink/lib/`（挂目录会遮蔽镜像内置 jar）。
3. **SQL Gateway 会话**：会话关闭会连带取消其中提交的关联分析作业，idle-timeout 已设 365d；**关联作业无自动重提**，宿主机重启后需 `POST /api/pipeline/correlation/deploy` 手工重提并确认 RUNNING。
4. **关联作业绑 host.docker.internal**：剧本联动模拟器（宿主机 8800）等跨容器调用必须走 `http://host.docker.internal:<port>`，Linux 需在 compose 加 `extra_hosts: host.docker.internal:host-gateway`。
5. **bind mount**：`./server-python/app → /app/app`、`./web/src → /app/web/src`，改后端代码只需 `docker restart usop_all`；改前端需本地 `pnpm build` 后 `docker cp dist/. usop_all:/app/static/`（或重建镜像）。
6. **ES 必须可写 `_id` 场景**：告警以 ES 为唯一真相源，`_id` 为告警字符串 ID，不要启用会重写 `_id` 的 ingest 策略。
7. 生产建议为 ES/Kafka/PG 显式配置 volume（当前默认落在 compose 项目目录 `data/` 下）。

## 6. 方式二：裸机/虚拟机部署（不使用容器）

适合有安全红线不允许容器运行时的环境。以 Linux x86_64 单机为例：

### 6.1 基础设施（原生安装或复用已有实例）

| 组件 | 安装要点 |
|---|---|
| PostgreSQL 16 | 建库 `usop_security`、用户 `usop`；监听 5432 |
| Redis 7 | 默认配置即可，6379 |
| Kafka 7.5（KRaft） | 单节点；`advertised.listeners` 必须写**客户端可达的真实 IP/主机名**（容器里的 `localhost:9092` 写法不可照搬） |
| Elasticsearch 8.11 | `xpack.security.enabled=false`（内网）或配置证书；`ES_HOSTS` 指向 9200；堆内存建议 2~4GB |
| Flink 1.18.1 | 下载对应发行版，将 `flink-jars/` 下 4 个 jar 复制到 `flink/lib/`；分别以 `jobmanager` / `taskmanager` / `sql-gateway.sh start-foreground` 启动，配置同容器版 `flink-conf.yaml` |

### 6.2 应用层

```bash
# 后端（Python 3.11）
cd server-python
python3.11 -m venv venv && source venv/bin/activate
pip install -r requirements.txt        # 已含 pyyaml、ldap3
cp .env.example .env                   # 配置 JWT_SECRET、DATABASE_URL、ES_HOSTS、KAFKA_BOOTSTRAP_SERVERS 等
python3 migrations/add_vuln_fields.py  # 建表/补列（幂等）
gunicorn -w 2 -b 0.0.0.0:5001 'app:create_app()'   # 或沿用容器内启动命令；WebSocket 需 eventlet/gevent worker

# 前端（Node 20 + pnpm，构建一次）
cd web && pnpm install && pnpm build   # 产物 dist/

# nginx
#   listen 3266; root <web/dist>;
#   location /api|/socket.io → proxy_pass http://127.0.0.1:5001;  （参照 Dockerfile.all 内置 nginx 配置）
```

### 6.3 裸机部署差异点

- 无 bind mount 便利：改后端需重启 gunicorn，改前端需重新 `pnpm build` 并发布 dist。
- 建议配 systemd unit（flask、flink 三个进程、各基础设施）+ 开机自启。
- Flask 单进程为 SocketIO 保留（容器内即单进程），gunicorn 多 worker 会破坏 WebSocket，**建议 1 进程多线程或 1 worker**。

## 7. 部署后验收清单

- [ ] `http://<host>:3266` 可登录（默认 admin）
- [ ] `curl :5001/api/health`（或任一 API）200
- [ ] ES `GET :9200/_cat/indices` 出现 alerts-valid
- [ ] Flink UI `:8081` 关联作业 RUNNING（无则手工重提）
- [ ] 用 `scripts/kafka_alert_sender.py` 注入一条测试告警，安全告警页可见且状态联动正常
- [ ] AD/LDAP 登录（如启用）验证——依赖 pyyaml/ldap3，裸机环境最容易漏

## 8. 扩容与高可用路径

| 方向 | 做法 |
|---|---|
| 告警吞吐↑ | Kafka 加 broker（replication_factor 改 ≥2）→ pipeline 无状态可直接多实例 → ES 扩节点/分片 |
| 关联分析↑ | Flink TaskManager `replicas: 2`（compose 已留注释位）并调大 slot/process.size |
| 应用层 HA | 双 usop_all + 前置 LB；SocketIO 需改 Redis message queue 才能多实例 |
| 数据安全 | PG 每日 `pg_dump`；ES 开快照仓库；`server-python/app` 内 uploads 目录纳入备份 |

## 9. 风险与遗留项

1. `requirements.txt` 此前缺 pyyaml/ldap3（已补），但**运行中容器**仍是手装的旧层，下次重建镜像后需回归验证 AD 登录与剧本 YAML 解析。
2. Kafka `replication_factor=1`、ES 单节点：仅适合单机部署档，规模化前必须改造。
3. 集成应用凭证明文存储（遗留项 #7）：对外部署前建议加密或接入密管。
4. Tracecat SOAR 为独立栈（8090/8091），非本套部署必选，本评估未计入其资源（另需 +4GB 内存）。
