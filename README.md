<p align="center">  
  <img src="docs/images/dashboard-overview.png" width="860">  
</p>

<p align="center">  
  <b>USOP</b> · 统一安全运营平台（Unified Security Operations Platform）  
</p>

<p align="center">  
  一套前后端分离的一体化安全运营平台，覆盖从日志接入、解析标准化、检测关联、AI 研判到事件处置闭环的完整安全运营链路。  
</p>

<p align="center">  
  <img src="https://img.shields.io/badge/Stack-React%20%7C%20Flask%20%7C%20Kafka%20%7C%20Flink%20%7C%20ES-blue">  
  <img src="https://img.shields.io/badge/Deploy-Docker%20Compose-0db7a3">  
  <img src="https://img.shields.io/badge/Status-本地部署-brightgreen">  
</p>

---

## What is USOP?

USOP（Unified Security Operations Platform）是一套前后端分离的一体化安全运营平台，覆盖从**日志接入、解析标准化、检测关联、AI 研判到事件处置闭环**的完整安全运营链路。

> 核心数据流：`日志源 → Kafka → 解析管道（标准化/过滤/去重）→ Elasticsearch（告警唯一真相源）→ Flink 关联分析 → PostgreSQL（事件/业务）`

## Why USOP?

- **一体化运营闭环**：日志接入、检测、研判、响应、资产/漏洞管理在一个平台内完成，无需在多套工具间切换。
- **告警唯一真相源 = Elasticsearch**：所有告警以 ES 为权威存储，PG 仅存业务关联，避免双写不一致与 `Alert.query` 死路。
- **自动化响应剧本**：可视化编排 + 审批流 + 执行记录，把 response playbook 变成可复用、可审计的运营资产。
- **可扩展接入**：Kafka 接入 + ParseProfile 字段映射，支持 9 种解析方式，新设备 / 新日志源即接即用。

## 平台架构

```mermaid
flowchart LR
    subgraph agents["采集端"]
        beat["Filebeat / Winlogbeat<br/>Logstash / Syslog"]
        device["安全设备<br/>WAF · IDS · HIDS · EDR"]
    end

    subgraph ingest["接入层"]
        kafka[("Kafka<br/>设备 Topic")]
        pipeline["解析管道<br/>标准化 · 过滤 · 去重"]
    end

    subgraph detect["检测层"]
        es[("Elasticsearch<br/>告警唯一真相源")]
        flink["Flink 关联分析<br/>13 条内置规则 · 常驻作业"]
        engine["检测规则引擎"]
    end

    subgraph app["应用层（usop_all 容器：nginx + Flask 二合一）"]
        ui["React 前端<br/>TypeScript + ECharts"]
        api["Flask API<br/>30 个蓝图 · JWT · RBAC"]
        ai["AI 研判<br/>批量研判 · 智能调查"]
        playbook["剧本引擎<br/>编排 · 审批 · 执行"]
    end

    subgraph data["存储层"]
        pg[("PostgreSQL<br/>事件 · 资产 · 漏洞")]
        redis[("Redis<br/>去重窗口")]
    end

    device --> kafka
    beat --> kafka
    kafka --> pipeline --> es
    es --> flink --> pg
    es --> engine --> pg
    ui -->|"REST / JWT"| api
    ai --> api
    playbook --> api
    api --> es & pg & redis
```

**数据主链路**：`日志源 → Kafka → 解析管道（标准化/过滤/去重）→ ES（valid/invalid-alerts）→ Flink 关联 → PG events`。

架构要点：

- **告警唯一真相源 = ES**：所有告警存取统一走 `es_alerts.py` 入口，PG 不存告警，避免双写不一致。
- **检测与响应双引擎**：Flink 常驻作业跑 13 条关联规则（高频 / 横向 / 暴破 / 序列等）自动生成事件；检测规则手动执行命中即建事件。
- **响应闭环**：告警关联事件 → AI 研判 / 人工研判 → 剧本编排执行（封禁 IP / 通知 / 工单）→ 封堵清单与执行记录全程留痕。
- **单容器交付**：应用镜像 nginx + Flask 二合一，基础设施（Kafka/ES/Flink/PG/Redis）独立编排，支持全容器与原生+外部组件两种部署形态。

## 功能模块与页面能力

平台按业务域划分为五大模块群。各页面的**真实运行截图、路由与能力说明**见下方「平台截图」章节；完整路由清单见「页面路由速查」。

| 业务域     | 核心页面                                      | 关键能力                                           |
| ------- | ----------------------------------------- | ---------------------------------------------- |
| 态势感知与检测 | 仪表盘 · 安全告警 · 威胁狩猎                         | 态势总览（指标/趋势/Top5）、告警检索与 AI 研判、交互式狩猎查询           |
| 事件与响应   | 事件工作台 · AI 中心 · 响应剧本 · 封堵清单 · 规则管理 · 集成应用 | 五节点状态机、批量 AI 研判、剧本编排与审批、IP 封禁闭环、检测/关联规则、外部渠道对接 |
| 资产与漏洞   | 资产清单 · 扫描任务 · 漏洞管理 · 评级配置                 | 资产指纹与攻击面拓扑、漏洞全生命周期、六因子配置驱动重评                   |
| 数据接入    | 数据采集 · 存储表 · 资源中心 · 告警过滤                  | Kafka 纳管、解析管道（标准化/过滤/去重）、字段模板、分流规则             |
| 运营与系统   | 运营 KPI · 系统管理（RBAC）· 备份与还原                | 运营指标总览、4 系统角色 × 29 权限、AD 域认证、审计、全局配置、数据备份恢复    |

## 平台截图与页面能力

> 下表按业务域展示各页面真实运行效果，每图配路由与核心能力说明（完整路由见「页面路由速查」）。

<table>  
  <tr>  
    <td width="50%">  
      <img src="docs/images/dashboard-overview.png">  
  
      <b>仪表盘</b> — 态势总览：告警/事件/资产指标、24h 事件趋势、Top5 攻击源 IP 与风险资产  
    </td>  
    <td width="50%">  
      <img src="docs/images/alerts-investigation.png">  
  
      <b>安全告警</b> — 告警检索、详情研判、聚合分析、AI 批量研判（ES 唯一真相源）  
    </td>  
  </tr>  
  <tr>  
    <td>  
      <img src="docs/images/events-workbench.png">  
  
      <b>事件工作台</b> — 五节点状态机流转，告警↔事件状态联动，处置总结留痕  
    </td>  
    <td>  
      <img src="docs/images/threat-hunting.png">  
  
      <b>威胁狩猎</b> — 交互式查询构建与狩猎任务  
    </td>  
  </tr>  
  <tr>  
    <td>  
      <img src="docs/images/ai-center.png">  
  
      <b>AI 中心</b> — 模型管理、告警监控流水线、智能调查  
    </td>  
    <td>  
      <img src="docs/images/detection-rules.png">  
  
      <b>规则管理</b> — 检测规则手动执行 + 13 条 Flink 关联分析规则（单常驻作业）  
    </td>  
  </tr>  
  <tr>  
    <td>  
      <img src="docs/images/playbook-canvas.png">  
  
      <b>剧本编排</b> — 可视化画布、审批流、模拟运行、执行记录  
    </td>  
    <td>  
      <img src="docs/images/blocked-ips.png">  
  
      <b>封堵清单</b> — 封禁/解封时间与时长、到期自动关闭、操作留痕  
    </td>  
  </tr>  
  <tr>  
    <td>  
      <img src="docs/images/assets-inventory.png">  
  
      <b>资产清单</b> — 资产指纹与业务属性、开放端口、攻击面拓扑  
    </td>  
    <td>  
      <img src="docs/images/data-ingestion.png">  
  
      <b>数据采集</b> — Kafka Topic 纳管、解析管道（标准化/过滤/去重/存储）  
    </td>  
  </tr>  
  <tr>  
    <td>  
      <img src="docs/images/vuln-host-list.png">  
  
      <b>漏洞管理</b> — 主机/应用漏洞全生命周期、重评、附件与时间线  
    </td>  
    <td>  
      <img src="docs/images/vuln-rating-config.png">  
  
      <b>评级配置</b> — 漏洞重评六因子权重与阈值在线调整，手动/自动统一模型  
    </td>  
  </tr>  
  <tr>  
    <td>  
      <img src="docs/images/rbac-roles.png">  
  
      <b>RBAC 权限</b> — 4 系统角色 × 29 权限点、菜单过滤、集中式写守卫  
    </td>  
    <td></td>  
  </tr>  
</table>

## 页面路由速查

> 与上方「平台截图」对应，这里给出完整页面路由清单（含截图未单独展示的次要页面）。

| 模块     | 路由                       | 说明                                                                      |
| ------ | ------------------------ | ----------------------------------------------------------------------- |
| 安全告警   | `/detection/alerts`      | 告警检索、详情研判、聚合分析、AI 批量研判（告警唯一真相源 = ES）                                    |
| 事件工作台  | `/detection/events`      | 安全事件处置，五节点状态机流转（new → acknowledged → investigating → resolved → closed） |
| 威胁狩猎   | `/detection/hunting`     | 交互式查询构建与狩猎任务                                                            |
| AI 中心  | `/detection/ai`          | 模型管理、告警监控流水线、智能调查                                                       |
| AI 研判  | `/detection/ai-judgment` | 批量研判任务与结果查看                                                             |
| 响应剧本   | `/response/playbooks`    | 自动化响应剧本编排（含审批流）                                                         |
| 检测规则   | `/response/rules`        | 检测规则管理（手动执行，命中生成事件）                                                     |
| IP 名单  | `/response/ip-lists`     | 黑白名单管理                                                                  |
| 资产盘点   | `/assets/inventory`      | 资产指纹与管理                                                                 |
| 扫描任务   | `/assets/scans`          | 资产扫描调度                                                                  |
| 漏洞管理   | `/vulnerabilities*`      | 主机/应用漏洞、漏洞评估                                                            |
| 数据采集   | `/data/ingestion`        | 数据源纳管（Kafka topic）、解析管道、字段模板                                            |
| 存储表    | `/data/templates`        | 告警/事件字段模板与存储表                                                           |
| 资源中心   | `/data/resources`        | IP 组、资源等共享资源                                                            |
| 告警过滤   | `/data/alert-filters`    | 分流过滤规则与白名单                                                              |
| 集成应用   | `/response/integrations` | 对接外部动作 / 通知渠道（SOAR、Webhook、IM），扩展响应能力                                   |
| 备份与还原  | `/system/backup`         | 平台数据与配置的备份与恢复                                                           |
| 运营 KPI | `/operations/kpi`        | 运营指标总览                                                                  |
| 系统管理   | `/system/*`              | 用户（含 AD 域账号）、角色、审计、备份、全局配置                                              |

## 平台能力详解

> 以下按业务域说明平台「能做什么」（能力概述，不涉及逐步操作）。页面路由与截图见上方对应章节。

### 态势感知与检测

- **安全仪表盘**：态势总览，聚合告警 / 事件 / 资产核心指标、24h 趋势、Top5 攻击源与风险资产。
- **安全告警**：以 Elasticsearch 为唯一真相源的告警中心，支持检索、详情研判、聚合分析、AI 批量研判，以及告警↔事件状态联动。
- **威胁狩猎**：交互式查询构建与狩猎任务，便于从海量日志中主动发现威胁。
- **检测规则**：可视化配置检测条件与响应动作，手动 / 定时执行，命中即自动生成事件。
- **关联分析**：Flink 常驻作业运行内置关联规则（高频 / 横向 / 暴破 / 序列等），自动将离散告警关联成安全事件。
- **AI 中心 / AI 研判**：LLM 模型管理、告警监控流水线、智能调查与批量研判，兼容本地与第三方 OpenAI 兼容模型。

### 事件与响应

- **事件工作台**：五节点状态机（new → acknowledged → investigating → resolved → closed）处置闭环，告警↔事件联动、处置总结与时间线留痕。
- **响应剧本**：可视化编排（画布）、审批流、模拟运行与执行记录；内置恶意 IP 防火墙封禁等动作剧本。
- **剧本执行记录**：每次执行的输入 / 步骤 / 结果全程留痕，便于审计与复盘（含执行记录页）。
- **封堵清单**：IP 封禁 / 解封闭环，记录封禁时长、到期自动关闭与操作人，与剧本联动。
- **集成应用**：对接外部动作 / 通知渠道（SOAR、Webhook、IM 等），扩展自动化响应能力。

### 资产与攻击面

- **资产清单**：资产指纹与业务属性管理、端口 / 服务梳理，并提供攻击面拓扑视图。
- **扫描任务**：资产扫描的创建、调度与结果同步，自动补齐资产与漏洞信息。

### 数据管理

- **数据采集接入**：以 Kafka 为统一采集入口，支持 Filebeat/Winlogbeat/Logstash/Syslog 等将日志发往设备 topic，平台纳管后由解析管道自动完成标准化 → 过滤/去重 → 入库 ES，并触发 Flink 关联分析。
  - 多采集端适配：Beats 全家桶、Logstash 汇聚、传统 Syslog / 原始文本直发均可接入。
  - 9 种解析方式：auto / json / regex / template / syslog / cef / keyvalue / csv / grok，按样本即可完成字段映射。
  - 可视化纳管、消费启停与告警过滤。
  - 接入连接：Kafka 宿主机 `localhost:9092` / 容器网络 `kafka:29092`（详见上方「部署速查」）。
- **告警过滤**：分流与白名单规则，控制哪些告警进入处置流程。
- **资源管理 / 字段模型**：IP 组、共享资源与告警 / 事件字段模板（含字段模型中心），供各模块复用。

### 漏洞管理

- 主机漏洞 / 应用漏洞全生命周期管理：
  - 双表模型：漏洞知识库与资产漏洞实例分离，CVE/CNVD/CNNVD/CWE、CVSS 向量与修复建议统一管理。
  - 多源录入：手动录入与 Nessus 等扫描器导入共用同一实例表，自动复用漏洞定义、自动匹配资产。
  - 状态机管控：open → in_progress → fixed → closed 主链路 + ignored / risk_accepted 旁路，流转全程留痕。
  - 配置驱动重评：六因子权重在线可调的加权定级，支持人工覆盖与理由留痕。

### 系统管理

- **用户与角色权限（RBAC）**：4 系统角色 × 29 权限点，菜单级过滤与集中式写守卫；支持 AD 域账号登录。
- **审计日志**：关键操作审计追踪。
- **全局配置**：系统参数、AI 模型、AD 域认证等集中配置。
- **备份与还原**：平台数据与配置的备份与恢复。

## 技术栈

| 层   | 技术                                                                                       |
| --- | ---------------------------------------------------------------------------------------- |
| 前端  | React 18 + TypeScript + Webpack 5 + Tailwind CSS 3 + framer-motion + ECharts（HashRouter） |
| 后端  | Python Flask（蓝图模块化）+ SQLAlchemy + JWT                                                    |
| 消息  | Apache Kafka（KRaft 模式）                                                                   |
| 检索  | Elasticsearch（告警唯一真相源）                                                                   |
| 流计算 | Apache Flink（关联分析常驻作业）                                                                   |
| 业务库 | PostgreSQL                                                                               |
| 缓存  | Redis（去重窗口）                                                                              |

## 安装、初始化与启动

> **部署速查（主机 / 连接 / 凭证）** —— 日常运维、对接与排障最常查的信息先放这里，完整步骤见下方。

### 主机与端口

| 组件            | 访问地址（本机写 `localhost`，远程部署替换为服务器 IP）         | 说明                  |
| ------------- | ------------------------------------------- | ------------------- |
| 平台前端          | `http://localhost:3266`                     | 浏览器访问入口             |
| 后端 API        | `http://localhost:5001`                     | REST / JWT          |
| PostgreSQL    | 宿主机 `localhost:5433` / 容器网络 `postgres:5432` | 业务库 `usop_security` |
| Elasticsearch | `http://localhost:9200`                     | 告警唯一真相源（默认无鉴权）      |
| Kafka         | 宿主机 `localhost:9092` / 容器网络 `kafka:29092`   | 日志接入                |
| Redis         | `localhost:6379`                            | 去重缓存                |
| Flink UI      | `http://localhost:8081`                     | 关联分析作业管理            |

### 组件连接串

非容器模式（`deploy/.env.native`）或对接外部组件时使用：

| 组件            | 连接串                                                            |
| ------------- | -------------------------------------------------------------- |
| PostgreSQL    | `postgresql://usop:usop_password@localhost:5433/usop_security` |
| Elasticsearch | `http://localhost:9200`                                        |
| Kafka         | `localhost:9092`（应用侧）/ `kafka:29092`（Flink 容器侧）                |
| Redis         | `redis://localhost:6379/0`                                     |

> 容器内组件间一律用**服务名 + 容器端口**（如 `postgres:5432`、`kafka:29092`）；宿主机 / 外部进程访问用**映射端口**（如 `:5433`、`:9092`）。


### 默认账号与凭证

| 账号      | 密码         | 角色                                           | 说明                    |
| ------- | ---------- | -------------------------------------------- | --------------------- |
| `admin` | `admin123` | 超级管理员                                        | 首次启动自动创建，**请登录后立即修改** |
| 系统角色    | —          | `admin` / `operator` / `analyst` / `auditor` | RBAC 四系统角色 × 29 权限点   |

- 数据库账号：`usop` / `usop_password`（库 `usop_security`，仅后端内部使用，请勿用其登录平台）。
- 支持 **AD 域账号登录**：在「系统管理 → 全局配置 → AD 域认证」配置 LDAP 域控后，可用域账号登录。

---

### 1. 环境要求

- **Docker Engine + Compose v2**：全容器部署必装（推荐生产 / 新手）
- **Node.js ≥ 16**：仅本地构建前端时需要
- **Python 3.11**：仅非容器模式（应用原生运行）需要

### 2. 拉起服务

**方式一 · 全容器（推荐）**：所有组件（含应用）跑在 Docker。

```bash
./start.sh                                  # = docker compose up -d
# 生产多机分角色：./deploy.sh all-in-one | app | data | es
# 运维子命令：        ./deploy.sh status | logs | verify | upgrade | backup | stop
```

**方式二 · 非容器（开发调试）**：Flask 后端与 React 前端在宿主机原生运行（热更新、断点）；基础设施（PG / Redis / ES / Kafka / Flink）按组件自由选择 Docker 或外部实例，连接信息集中在 `deploy/.env.native`（`*_PROVIDER=docker|external` 开关）。

```bash
./start_native.sh                 # 基础设施 Docker + 应用原生（后端 :5001，前端 :9000）
./start_native.sh --build         # 前端生产构建并托管在 :3266
./start_native.sh --no-infra      # 组件全 external，仅起应用
```

> **地址区分（重要）**：应用侧用「宿主机可达地址」（`DATABASE_URL` / `ES_URL` / `KAFKA_BOOTSTRAP_SERVERS`）；  
> Flink 关联作业内嵌 SQL 用「组件网络内地址」（`PG_HOST` / `KAFKA_BOOTSTRAP`）。  
> 当某组件 external 且 Flink 仍跑在 Docker 时，必须填 Flink 容器可访问到的地址（宿主 IP 或 `host.docker.internal`）。  
> 外部 ES 带鉴权用 `ES_USER` / `ES_PASSWORD` / `ES_USE_SSL`。纯基础设施管理：`start-bigdata.sh up|down|status|logs|init-topics`。

---

### 3. 初始化（首次部署必做）

服务启动后**一部分初始化自动完成**，但数据库索引与检测 / 响应素材需手动补齐。

**3.1 自动初始化（应用首次启动即完成，无需干预）**

| 初始化项        | 说明                                                             |
| ----------- | -------------------------------------------------------------- |
| 数据库建表       | `db.create_all()` 创建全部业务表与索引（PostgreSQL 库 `usop_security`）     |
| 默认管理员       | 自动创建 `admin / admin123`（账号不存在时）                                |
| RBAC 角色     | 种子四系统角色 `admin` / `operator` / `analyst` / `auditor`（× 29 权限点） |
| 标准字段 / 提示词  | 标准告警字段、AI 研判提示词种子                                              |
| Kafka Topic | `run.py` 启动时自动创建业务 Topic                                       |

**3.2 手动初始化（让检测与响应能力完整）**

```bash
# (a) ES 索引 / ILM / 模板 —— 告警唯一真相源，必做
bash scripts/es-setup.sh http://localhost:9200

# (b) 关联分析规则种子（13 条内置规则，幂等可重跑）
docker cp scripts/seed_correlation_base_rules.py usop_all:/tmp/
docker exec -w /app -e PYTHONPATH=/app usop_all python3 /tmp/seed_correlation_base_rules.py
docker cp scripts/seed_correlation_rules_extra.py usop_all:/tmp/
docker exec -w /app -e PYTHONPATH=/app usop_all python3 /tmp/seed_correlation_rules_extra.py
# 重新提交 Flink 关联作业使规则生效
curl -X POST http://localhost:5001/api/pipeline/correlation/deploy \
     -H "Authorization: Bearer $TOKEN"

# (c) 封禁剧本 —— 打通「剧本 → 设备模拟器 → 回执 → 分支处置」闭环
docker cp scripts/setup_block_playbooks.py usop_all:/tmp/
docker exec -w /app -e PYTHONPATH=/app usop_all python3 /tmp/setup_block_playbooks.py
```

> `$TOKEN` 取管理员令牌：  
> `TOKEN=$(curl -s -X POST http://localhost:5001/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['token'])")`
>
> 关联规则 / 封禁剧本脚本需在 `/app` 容器内运行（依赖 SQLAlchemy 模型与 `PYTHONPATH`）。脚本幂等，可重复执行。

---

### 4. 前端发版（全容器模式）

容器内 `/app/static` 部署前端构建产物；**顺序务必为「构建 → 清空 → 拷贝」，仅清空不拷贝会导致 nginx 返回 403**：

```bash
cd web && npm run build                       # 产物到 web/dist
docker exec usop_all sh -c 'rm -rf /app/static/*'
docker cp web/dist/. usop_all:/app/static/
```

## 目录结构

```
usop/
├── web/                    # 前端 React + TS（webpack 构建，产物部署到容器 /app/static）
├── server-python/          # Flask 后端
│   ├── app/
│   │   ├── routes/         # 30 个 API 蓝图（alerts_api / events_api / ai_judgment / ...）
│   │   ├── models/         # SQLAlchemy 模型
│   │   ├── utils/          # es_alerts.py（告警统一入口）/ ldap_auth.py（AD 认证）等
│   │   └── engine/         # playbook 引擎 / 检测动作
│   └── migrations/         # 手写幂等迁移脚本（无 Alembic）
├── flink-jobs/             # Flink 作业（关联分析 / 告警引擎 / 日志解析）
├── postgres/               # 数据库初始化脚本
├── deploy/                 # 生产编排与一键部署脚本
│   ├── docker-compose.prod.yml   # 多角色编排（allinone/app/data/search）
│   ├── usop-deploy.sh            # 一键部署 / 运维（init|verify|status|logs|backup|...）
│   ├── usop.env.example          # 生产连接配置模板
│   └── .env.native.example       # 非容器模式组件连接信息模板
├── docker-compose.yml      # 全容器开发编排（应用 + 基础设施）
├── docker-compose.infra.yml# 非容器模式基础设施编排（不含应用）
├── start.sh                # 入口：全容器启动（→ start_native.sh）
├── start_native.sh         # 非容器启动编排（基础设施 Docker + 应用原生）
├── start-bigdata.sh        # 仅管理基础设施（up/down/status/logs/init-topics）
└── Dockerfile.all          # 应用镜像（nginx + Flask 二合一）
```

---

## License

本项目为**内部安全运营平台**，仓库当前未包含公开授权文件（LICENSE）。未经授权请勿将代码用于商业或对外分发。平台对接第三方组件（如 Tracecat、Shuffle、Elasticsearch、Flink）时请各自遵守其对应许可证条款。
