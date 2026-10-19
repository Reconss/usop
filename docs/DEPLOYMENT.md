# USOP 部署方案

> 目标：说清三件事——**要几台机器、每台什么配置、能扛多少日志**；以及一条命令怎么装起来。
> 部署物在 `deploy/`，入口 `./deploy.sh`（等同 `./deploy/usop-deploy.sh`）。

## 1. 要几台机器

| 形态 | 机器数 | 适用 | 说明 |
|---|---|---|---|
| 单机 | 1 | 演示 / POC / ≤100 EPS | 全组件挤一台，没有冗余，重启要等全部起来 |
| 双机 | 2 | ≤800 EPS 小规模生产 | A：应用 + PG + Redis + Kafka + Flink；B：只有 ES |
| **三机（推荐）** | **3** | **≤2,000 EPS 生产** | 应用 / 数据管道 / 检索各自独立，故障域分开 |
| 规模化 | 6+ | 5,000+ EPS、要 HA | app×2 + LB、data×2~3、ES×3 |

**为什么 ES 必须单独一台**：它是内存和磁盘的绝对大头（堆 + 段合并 IO），和 Kafka/Flink 抢 IO 会互相拖垮。
**为什么 Kafka/Flink 放一起**：两者都是 CPU/内存型、磁盘只做顺序写，混部代价小；但不要和磁盘紧张的 ES 混。

## 2. 每台的资源

三机形态（推荐配置）：

| 节点 | 角色 | CPU | 内存 | 系统盘 | 数据盘 | 跑什么 |
|---|---|---|---|---|---|---|
| `usop-app` | 应用 + 业务库 | 8C | 16G | 200G | 200G SSD | nginx+Flask（:3266/:5001）、PostgreSQL 16、Redis 7 |
| `usop-data` | 采集缓冲 + 关联分析 | 8C | 16G | 200G | 1T SSD | Kafka、Flink JobManager/TaskManager/SQL Gateway |
| `usop-es` | 告警检索 | 16C | 32G | 200G | **2T NVMe** | Elasticsearch 单节点（堆 16G） |

其它档位：

| 形态 | 规格 |
|---|---|
| 演示单机 | 8C / 16G / 系统 200G + 数据 1T（ES 堆 2~4G，够跑通不追求吞吐） |
| 生产单机 | 16C / 32G / 系统 200G + 数据 1T（≤300 EPS） |
| 双机 | A 16C32G（应用+PG+Redis+Kafka+Flink）、B 16C32G + 1.5T NVMe（ES） |
| 规模化 | app 8C16G×2 + LB；data 8C16G×2（Kafka 3 broker）；ES 16C32G×3（每台 2T NVMe） |

内存分配原则：ES 堆 = 机器内存的一半（不超过 31G），Kafka/Flink 各 1~4G，剩下的留给页缓存。
部署脚本首次运行会按本机内存自动写这组值（`deploy/usop.env`），不用手调。

系统要求（三台一致）：Linux x86_64（Ubuntu 22.04 / Rocky 9 均可）、Docker 24+、Docker Compose v2、NTP 时间同步（Kafka 与 ES 对时间敏感）。

## 3. 网络关系

```
        办公网 / 分析师
              │ 3266
              ▼
   ┌──────────────────────┐   9092（发布/消费）    ┌───────────────────────┐
   │ usop-app  10.0.0.11  │ ────────────────────► │ usop-data 10.0.0.12   │
   │ nginx 3266           │ ◄──────────────────── │ kafka 9092 / 29092    │
   │ flask 5001           │   8081/8083（作业）    │ flink jm 8081         │
   │ postgres 5432        │ ◄──────────────────── │ flink tm / gateway    │
   │ redis 6379           │   5432（关联结果回写）  │                       │
   └─────────┬────────────┘                       └──────────┬────────────┘
             │ 9200                                           │ 9200
             ▼                                                ▼
        ┌─────────────────────────────────────────────────────────┐
        │ usop-es  10.0.0.13   elasticsearch 9200                 │
        └─────────────────────────────────────────────────────────┘
                     ▲ 9092
              采集器 / 设备 / syslog 转发
```

端口矩阵（防火墙按此开）：

| 源 | 目的 | 端口 | 用途 | 开放范围 |
|---|---|---|---|---|
| 办公网用户 | usop-app | 3266 | 控制台 | 办公网段 |
| 采集器 / 设备 | usop-data | 9092 | 日志接入 | 仅采集网段 |
| usop-app | usop-data | 9092 | 业务 topic 读写 | 内网 |
| usop-app | usop-data | 8081 / 8083 | Flink 作业提交与查询 | 内网 |
| usop-data | usop-app | 5432 | 关联结果写 PG | 内网 |
| usop-app / usop-data | usop-es | 9200 | 告警读写 | 内网 |
| 运维跳板 | usop-* | 22 / 8081 | SSH、Flink UI | 仅运维网段 |

不要对办公网开放的端口：`9200`（ES 无鉴权，暴露等于全量告警泄露）、`5432`、`6379`、`29092`、`5001`。
两网卡机器建议：业务口走内网，采集口单独一块网卡并只放 9092。

注意：分机部署时脚本会把应用节点的 PG 地址自动写成它自己的内网 IP（Flink 关联作业的 JDBC 串取自应用的
`DATABASE_URL`，数据节点必须能直连 PG），所以 **5432 必须对数据节点开放**。

单机形态下所有地址都是容器名，无需改防火墙。

## 4. 能处理多少日志

口径：单条标准告警约 **2KB**（含截断后的原始日志），端到端能力取最慢的一段。

各段能力：

| 环节 | 能力 | 什么时候成为瓶颈 |
|---|---|---|
| Kafka（单 broker） | ≥15,000 条/秒 | 基本不会；除非磁盘写满或开了多副本同步 |
| Flask 解析/去重（单进程多线程，每数据源一线程） | 约 800~1,200 条/秒 | 数据源很多、单条正则很重时 |
| Flink 关联分析（parallelism=1） | 约 1,000~2,000 条/秒 | 开多窗口复杂关联时，加 TaskManager |
| **Kafka→ES 存储任务（当前代码）** | **约 20~50 条/秒** | **现在就是瓶颈，见下方必改项** |
| ES 单节点 16C32G（批量写入） | 3,000~5,000 条/秒 | 查询并发高时先吃 CPU |

> **必改项**：`server-python/app/alert_pipeline/pipeline.py` 的存储任务仍是
> `es.index(refresh='wait_for')` 逐条写。`wait_for` 会等下一次 refresh（默认 1s），
> 单线程被压到几十条/秒。改成 `helpers.bulk(...)` 批量提交、`refresh=false`，
> 同一台 ES 立刻能到数千条/秒。**不改这一处，再大的机器也只能跑几十 EPS。**

端到端结论（改造为批量写入后）：

| 形态 | 持续吞吐 | 日处理量 | 7 天 ES 占用 | 典型场景 |
|---|---|---|---|---|
| 单机 16C32G | 300 条/秒 | 2,600 万条/天 | 360GB | 单园区、几百台设备 |
| 三机（推荐） | 2,000 条/秒 | 1.7 亿条/天 | 2.4TB | 集团总部 + 多分支汇聚 |
| 扩容后 | 5,000+ 条/秒 | 4 亿条/天 | 按公式算 | 等保三级、全量流量日志 |

磁盘估算公式：**日增 GB ≈ EPS × 0.17**（2KB/条）。
- Kafka 只做缓冲，默认保留 48 小时 → 2,000 EPS 约 690GB，1T 数据盘够用；
- ES 是真相源，保留 7 天 → 2,000 EPS 需要 2.4TB，**必须开 ILM**（hot 7 天 → delete）；
- 要保留 30 天就把 ES 盘 ×4，或只保留关键级别。

## 5. 一键部署

三台机器都把代码放到同一路径（如 `/opt/usop`），各自执行一条命令：

```bash
# ① 检索节点 10.0.0.13
cd /opt/usop && ./deploy.sh es

# ② 数据节点 10.0.0.12
cd /opt/usop && ./deploy.sh data

# ③ 应用节点 10.0.0.11（最后装，要连前两台）
cd /opt/usop && ./deploy.sh app --data-host 10.0.0.12 --es-host 10.0.0.13
```

单机形态只要一条：

```bash
cd /opt/usop && ./deploy.sh            # 等同 all-in-one
```

脚本会自动完成：生成 `deploy/usop.env`（随机数据库密码、按内存分配 JVM 堆）→ 校验编排 →
建数据目录并修正 ES/Flink 目录属主 → 调 `vm.max_map_count` → 构建镜像 → 启动 →
等健康检查 → 建表 / 配管道 / 初始化封禁剧本 → 自检并打印访问地址。**可重复执行**，
第二次跑就是"应用配置变更"。

常用命令：

| 命令 | 作用 |
|---|---|
| `./deploy.sh verify` | 逐项自检（PG/Redis/API/ES/Kafka/Flink），失败项会列出来 |
| `./deploy.sh status` | 容器状态 |
| `./deploy.sh logs usop` | 看某个服务日志（`-f` 跟随） |
| `./deploy.sh upgrade` | 重新构建镜像并重建应用容器，不清库 |
| `./deploy.sh backup` | 备份 PG 与 uploads 到 `deploy/backups/<时间戳>/` |
| `./deploy.sh stop` | 停容器，数据目录保留 |

可选参数：`--no-build`（用现有镜像，离线环境先 `docker load`）、`--skip-init`、
`--env <文件>`（多套环境）、`--data-host` / `--es-host`（分机部署写连接地址）。

目录约定：数据全部落 `USOP_DATA_DIR`（默认 `/data/usop`），含 `postgres/ redis/ kafka/
elasticsearch/ flink/ uploads/`；配置、日志、备份都不在容器里，容器随时可重建。

## 6. 装完必做三件事

1. **改密码**：默认 `admin / admin123`，登录后立刻改；`deploy/usop.env` 里的 `PG_PASSWORD` 已是随机值。
2. **重提关联分析作业**：Flink 作业不随宿主机重启自动恢复。重启后在控制台「关联分析」点部署，
   或 `POST /api/pipeline/correlation/deploy`，并在 Flink UI 确认 RUNNING。
3. **配 ES 索引生命周期**：不开 ILM，告警盘会被线性写满（见第 4 节公式）。

## 7. 排障对照

| 现象 | 原因 | 处理 |
|---|---|---|
| ES 容器反复重启 | `vm.max_map_count` 太小 / 目录属主不对 | `sudo sysctl -w vm.max_map_count=262144`；`sudo chown -R 1000:1000 /data/usop/elasticsearch` |
| 采集器连不上 Kafka | `advertised.listeners` 通告了回环地址 | 改 `deploy/usop.env` 的 `KAFKA_ADVERTISED_LISTENERS` 为数据节点真实 IP 后重跑 |
| 应用起不来、日志报连不上 kafka/es | 分机部署没传 `--data-host` / `--es-host` | 补参数重跑 `./deploy.sh app ...` |
| Flink UI 里作业消失 | JM 重启后作业不会自动重提 | 控制台重新部署关联分析 |
| 告警页面查不到数据 | 存储任务没配 / ES 索引为空 | `./deploy.sh verify`；控制台「存储配置」检查 topic→索引映射 |
