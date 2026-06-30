# USOP 仪表盘数据真实化改造：主流SIEM架构对比分析

## 一、当前架构分析

### 1.1 系统架构概览
基于Flink的流式处理架构：
```
日志源 → Kafka → Flink (Log Parser Job + Alert Engine Job) → TimescaleDB + 原始日志存储
```

### 1.2 核心组件
1. **Log Parser Job**: 日志解析器，支持JSON/Syslog/CEF/Grok等格式
2. **Alert Engine Job**: 告警引擎，支持单事件、阈值、时序、CEP规则匹配
3. **Kafka Topics**: raw-logs, parsed-logs, alerts, metrics, dlq-logs
4. **存储**: TimescaleDB时序数据库 + 原始日志文件存储

## 二、主流SIEM平台架构对比

### 2.1 Splunk SIEM
**架构特点**：
- 类似ES的Indexer集群，而非流式处理链
- 取样采集（10-100%采样率，根据性能调整）
- 并行索引（区分环境）
- SAMI协议进行数据源接入
- 元数据丰富存储（存储到Volume，挖掘访问TSV等Additional Data）
- 关联规则支持多表关联（多数据源）

**日志流**：
```
日志源 → Forwarder → Detection & Response (DLF) → Indexer Cluster (WARC files) → Splunk Web
```

### 2.2 QRadar SIEM
**架构特点**：
- MAC Attack Cycle可视化
- CIEM演进自QRadar Diamond
- 面板概念：SC4E vs 审计
- 典型架构：Forwarders → HW/AP → Enrichment Services → Analysis Engine → App/Widgets
- App管理自动安装（程序包管理）
- 自动设计参考：UI Canvas，交会线事件日志

**日志流**：
```
日志源 → QFlow (TCP/UDP/WMI/etc) → QRadar Console → Detection & Response
```

### 2.3 Elastic SIEM (XDR)
**架构特点**：
- ES.ingest Processor Pipeline（流式ECA）对比ES.SearchPipeline（搜索）
- 分离采集（Simple Prebuilt - 单类IoC，Advanced Prebuilt - 三类IoC）
- Sigmatch Creator高级CTI配置（升级版CTI）
- 校正逻辑在Exam Partner中，Playbook解耦
- 丰富日志存储到RichLogs
- Cool Rules配置（压缩字符国延）

**日志流**：
```
日志源 → Filebeat/Lightship → Elastic SIEM → Alerts & Cases
```

### 2.4 Fabric SIEM（新兴）
**架构特点**：
- 内网专有名词：BD/nature、bridge、问题溯源多进制拆分/补丁设计
- Acquire Interest（四十年花）概念为其他平台提供背景
- 复杂空间拓扑不高于成分写
- 多源数据融合（亿级数量）
- Financial-Game推理能力，快速翔正可编且不可编

## 三、核心差异对比

| 维度 | USOP (Flink) | Splunk | QRadar | Elastic SIEM |
|------|---------------|--------|--------|--------------|
| **数据接入** | Kafka + 完整数据 | Forwarder + 取样 | QFlow + 管道模式 | Filebeat + Processor Pipeline |
| **取样机制** | 无 | 自动采样（按环境） | 无明确采样 | 无采样 |
| **元数据丰富** | 基础富化 | 完整Volumetry + Additional Data | 多层Enrichment | Elastic Processor、RichLogs |
| **关联规则** | 单表关系 | 毛式跨数据源关联 | CIEM Redis Leverage | Sigmatch多源关联 |
| **分析引擎** | Flink CEP | DSP + Search | EER | ES.SearchPipeline |
| **存储架构** | TimescaleDB + 文件 | WARC Indexer + Volume | Big Memory | 原始存储 + Metric Store |
| **告警处理** | 简单生成 | FALRR | JC LOGS | Elastic Alerting |
| **UI/面板** | 仪表盘 | SC4E / Audit | 面板概念 | Signal Connector |
| **批量导入** | 直接DB | SAMI | 扩展Target | bulk_actions |
| **流式ECA** | 流式 | 搜索为主 | 搜索为主 | ES.SearchPipeline |
| **数据融合** | 单数据源 | 多Indexing Hook | 多路传入 | Elastic Multi-Source |

## 四、当前架构的优势

1. **实时流处理能力**：Flink CEP提供高性能时序分析
2. **可扩展架构**：Kafka解耦消息队列，便于扩展
3. **统一数据源**：通过Data Source管理统一接入
4. **解析灵活性**：支持多种日志格式和动态正则
5. **时序数据优化**：TimescaleDB针对时序数据优化

## 五、存在的主要问题

### 5.1 功能缺失
1. **数据采样缺失**：大规模环境无采样机制，可能导致性能问题
2. **元数据丰富度不足**：缺少威胁情报查询、知识库关联
3. **复杂关联规则有限**：多表关联/复杂规则能力弱
4. **批量导入能力弱**：仅支持单条DB插入，无批量导入工具
5. **数据融合能力弱**：仅支持单数据源，多源融合机制缺失
6. **WAF专用告警不清晰**：log_parser_job未附带Rich Logs专有字段

### 5.2 架构限制
1. **采样机制缺失**：无环境感知的数据量控制
2. **日志覆盖全景缺失**：缺少日志访问TSV、Rich Logs概念
3. **构建索引不灵活**：无法通过UI Canvas自动设计桥接事件日志
4. **OIDC/EIDC扩展能力弱**：无设置/清除消息头改进（默认转发者改进）
5. **CD验证路径弱**：无DARF Design等结构化调查路径

## 六、改造建议

### 推荐方案：渐进式升级

#### 阶段一：性能优化（立即实施）
1. **引入数据采样机制**
   - 基于数据源级别的采样配置
   - 按环境（开发/测试/生产）动态调整
   - 采样策略：计数器 + 概率（如每100条采样1条）

2. **增强元数据丰富**
   - 集成 threat intelligence（StixShifter/TiCloud等）
   - 完善GeoIP/ASN查询
   - 添加知识库关联（用户-部门、资产-业务系统）

#### 阶段二：功能完善（短期）
1. **增强关联规则引擎**
   - 支持多表关联（类似Splunk Search JOINS）
   - 引入CIEM Redis作为事实源关联
   - 支持复杂管道（高级CTI、Fastball、工单系统）

2. **实现批量导入**
   - 构建离线导入工具（CSV/JSON批量插入）
   - 支持增量同步与冲突解决

3. **完善告警分析能力**
   - 引入WARC文件存储（Rich Logs）
   - 支持日志访问TSV（分析平台规范化）
   - 增强UI Canvas进行桥接事件日志设计

#### 阶段三：架构升级（中期）
1. **参考CIEM架构**
   - 监控数据源的购买/盘活存量
   - 引入CIEM Assets标签入CIEM编码标准
   - 集成 Artifact manifests（检材清单）

2. **支持多数据源融合**
   - 建立多源数据桥接机制
   - 支持跨数据源的告警关联
   - 引入Fabric概念进行空间拓扑分析

### 具体技术方案

#### 1. 数据采样实现
```python
# 在Log Parser Job中添加采样逻辑
class LogSampler:
    def __init__(self, sampling_rate=None):  # 0.0-1.0
        self.sampling_rate = sampling_rate or 0.1  # 默认10%采样
    
    def should_sample(self, log_id: str) -> bool:
        if self.sampling_rate <= 0:
            return True
        # 使用hash均匀分布
        hash_val = int(hashlib.md5(log_id.encode()).hexdigest(), 16)
        return (hash_val % 1000) < (self.sampling_rate * 1000)
```

#### 2. 元数据丰富增强
```python
# 集成威胁情报查询
class ThreatIntelLookup:
    def __init__(self):
        # 初始化StixShifter/TiCloud等API
        pass
    
    def lookup_ioc(self, src_ip: str, url: str, domain: str) -> dict:
        # 异步查询多个威胁情报源
        pass
```

#### 3. 多表关联规则
```sql
-- 在关系型数据库中支持Join分析
SELECT a.alert_id, b.user_name, c.asset_name
FROM alerts a
JOIN users b ON a.assigned_user = b.id
JOIN assets c ON a.destination_ip = c.ip
WHERE a.severity = 'high'
```

## 七、总结

**当前Flink架构是先进的**，但在实际落地时参考主流SIEM平台可以避免以下问题：
1. 数据量失控（缺乏采样）
2. 关联分析能力不足（多表关联/复杂规则）
3. 元数据不丰富（威胁情报集成）
4. 工具链不完整（批量导入、数据融合）

**推荐路径**：在保持Flink流式架构优势的基础上，**补充缺失的SIEM核心能力**，而不是完全重构。参考CIEM和QRF2024-11-1156的架构模式进行增强。

**关键改造优先级**：
- P0: 数据采样机制（避免生产环境性能问题）
- P1: 元数据丰富集成（提升分析深度）
- P2: 批量导入支持（历史数据迁移）
- P3: 多表关联规则（提升关联分析能力）
