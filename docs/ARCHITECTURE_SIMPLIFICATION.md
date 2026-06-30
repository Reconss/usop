# USOP 架构简化方案

## 一、当前架构问题分析

### 1.1 复杂性过高
| 组件 | 问题 | 影响 |
|------|------|------|
| **Flink集群** | 需3个容器(JobManager+2 TaskManager)，配置复杂 | 运维困难，故障点多 |
| **Kafka** | 需ZooKeeper/KRaft，版本兼容问题 | 启动慢，占资源 |
| **多数据存储** | PostgreSQL + TimescaleDB + ES + Redis | 数据冗余，一致性难保证 |
| **Python Flink** | 性能差，API不完整 | 解析效率低 |

### 1.2 数据流过长
```
日志源 → Kafka → Flink(Parser) → Kafka → Flink(Alert) → 多个存储
         ↓           ↓              ↓            ↓
       Topic1    parsed-logs    Topic2      alerts
         ↓                                              
      TimescaleDB + PostgreSQL + Elasticsearch
```

### 1.3 故障点多
- Flink JobManager 单点故障
- Kafka broker 故障传导
- 多数据源同步延迟
- 版本兼容性冲突

---

## 二、简化架构设计

### 2.1 设计目标
1. **稳定性**: 消除单点故障，减少组件依赖
2. **性能**: 提升吞吐量，降低延迟
3. **简单性**: 减少运维复杂度
4. **可维护性**: 单一技术栈，易于调试

### 2.2 推荐架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           简化后的架构                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   日志源 ──→ Redis Streams ──→ 统一处理器 (Python/Go) ──→ TimescaleDB   │
│                     ↓                                                    │
│                  告警队列 ──→ 告警消费者 ──→ 通知服务                     │
│                     ↓                                                    │
│                 PostgreSQL (业务数据)                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 核心变化

| 原架构 | 新架构 | 收益 |
|--------|--------|------|
| Flink集群 | 单进程异步处理器 | 部署简单，无状态 |
| Kafka | Redis Streams | 内置持久化，无需额外组件 |
| 多存储 | TimescaleDB + PostgreSQL | 统一存储，数据一致 |
| Python Flink | asyncio + uvloop | 3-5倍性能提升 |

---

## 三、具体改造方案

### 3.1 移除 Kafka，使用 Redis Streams

**优势**:
- 内置持久化，无需额外 broker
- 消费者组支持，自动ack
- 低延迟，高吞吐
- 故障恢复简单

```python
# 新架构：Redis Streams 处理器
import asyncio
import redis.asyncio as redis
from typing import Dict, Any, Callable

class LogProcessor:
    """统一日志处理器"""
    
    def __init__(self, redis_url: str):
        self.redis = redis.from_url(redis_url)
        self.streams = {
            'raw-logs': 'parsed-logs',
            'alerts': 'alert-notifications'
        }
    
    async def start(self):
        """启动处理器"""
        await self._consume_stream('raw-logs', self._process_log)
        await self._consume_stream('alerts', self._process_alert)
    
    async def _consume_stream(self, stream: str, handler: Callable):
        """消费流数据"""
        while True:
            try:
                # 阻塞读取，最多等待5秒
                messages = await self.redis.xread(
                    {stream: '0'},
                    count=100,
                    block=5000
                )
                
                for stream_name, msgs in messages:
                    for msg_id, msg_data in msgs:
                        await handler(msg_data)
                        # 自动ACK
                        await self.redis.xdel(stream_name, msg_id)
                        
            except Exception as e:
                print(f"Error consuming {stream}: {e}")
                await asyncio.sleep(1)
    
    async def _process_log(self, log_data: Dict) -> Dict:
        """处理日志"""
        # 解析
        parsed = await self._parse_log(log_data)
        # 富化
        enriched = await self._enrich_log(parsed)
        # 规则匹配
        alerts = await self._match_rules(enriched)
        
        # 存储到TimescaleDB
        await self._store_to_db(enriched)
        
        # 发送告警
        for alert in alerts:
            await self.redis.xadd('alerts', alert)
        
        return enriched
    
    async def _parse_log(self, raw: Dict) -> Dict:
        """解析日志"""
        # 统一解析逻辑
        pass
    
    async def _enrich_log(self, log: Dict) -> Dict:
        """富化日志"""
        # GeoIP、威胁情报等
        pass
    
    async def _match_rules(self, log: Dict) -> List[Dict]:
        """规则匹配"""
        # 告警规则匹配
        pass
```

### 3.2 统一存储：PostgreSQL + TimescaleDB

**合并策略**:
1. **告警数据** → TimescaleDB (时序优化)
2. **业务数据** → PostgreSQL (关系型)
3. **缓存** → Redis (仅用于热点数据)
4. **全文搜索** → PostgreSQL 全文索引 (替代ES)

```sql
-- 统一存储表结构
-- 1. 时序告警表 (TimescaleDB 超表)
CREATE TABLE alert_logs (
    time        TIMESTAMPTZ       NOT NULL,
    source_id   INTEGER           NOT NULL,
    log_type    VARCHAR(50)       NOT NULL,
    src_ip      INET,
    dst_ip      INET,
    src_port    INTEGER,
    dst_port    INTEGER,
    protocol    VARCHAR(20),
    hostname    VARCHAR(200),
    username    VARCHAR(100),
    action      VARCHAR(100),
    result      VARCHAR(50),
    raw_log     TEXT,
    details     JSONB             DEFAULT '{}',
    severity    VARCHAR(20)       DEFAULT 'low',
    category    VARCHAR(100),
    tags        JSONB             DEFAULT '[]'
);

-- 转换为超表
SELECT create_hypertable('alert_logs', 'time');

-- 2. 告警表 (业务数据)
CREATE TABLE alerts (
    id              SERIAL PRIMARY KEY,
    alert_code      VARCHAR(20) UNIQUE NOT NULL,
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    severity        VARCHAR(20) DEFAULT 'medium',
    status          VARCHAR(20) DEFAULT 'new',
    source          VARCHAR(100),
    source_product  VARCHAR(100),
    category        VARCHAR(100),
    confidence      FLOAT DEFAULT 100.0,
    src_ip          INET,
    src_port        INTEGER,
    dst_ip          INET,
    dst_port        INTEGER,
    hostname        VARCHAR(200),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 全文搜索索引 (替代Elasticsearch)
ALTER TABLE alerts ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('chinese', title || ' ' || COALESCE(description, ''))) STORED;

CREATE INDEX alerts_search_idx ON alerts USING GIN(search_vector);

-- 全文搜索函数
CREATE FUNCTION alerts_search(query TEXT, limit INT DEFAULT 100)
RETURNS SETOF alerts AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM alerts
    WHERE search_vector @@ plainto_tsquery('chinese', query)
    ORDER BY created_at DESC
    LIMIT limit;
END;
$$ LANGUAGE plpgsql;
```

### 3.3 告警引擎改造

**现状**: Flink CEP 复杂，状态管理困难
**改造**: 内存状态 + 定时持久化

```python
# 简化版告警引擎
import asyncio
from collections import defaultdict
from datetime import datetime, timedelta

class SimpleAlertEngine:
    """简化告警引擎"""
    
    def __init__(self, rules: List[Dict]):
        self.rules = {r['id']: r for r in rules if r.get('enabled', True)}
        # 内存状态 (可定期持久化到Redis)
        self.state = defaultdict(lambda: defaultdict(list))
    
    async def process(self, log: Dict) -> List[Dict]:
        """处理日志，返回告警"""
        alerts = []
        
        for rule_id, rule in self.rules.items():
            if await self._match_rule(rule, log):
                alert = self._create_alert(rule, log)
                alerts.append(alert)
                # 清理状态，防止内存膨胀
                self._cleanup(rule_id)
        
        return alerts
    
    async def _match_rule(self, rule: Dict, log: Dict) -> bool:
        """规则匹配"""
        rule_type = rule.get('type', 'single')
        
        if rule_type == 'single':
            # 单事件匹配
            return self._match_single(rule, log)
        elif rule_type == 'threshold':
            # 阈值匹配
            return self._match_threshold(rule, log)
        elif rule_type == 'correlation':
            # 关联匹配
            return self._match_correlation(rule, log)
        
        return False
    
    def _match_threshold(self, rule: Dict, log: Dict) -> bool:
        """阈值匹配"""
        key = rule.get('group_by', 'src_ip')
        key_value = log.get(key, 'unknown')
        
        window = rule.get('window_seconds', 60)
        threshold = rule.get('threshold', 1)
        
        # 添加到状态
        self.state[rule['id']][key_value].append({
            'timestamp': log.get('timestamp'),
            'log': log
        })
        
        # 检查是否超阈值
        events = self.state[rule['id']][key_value]
        if len(events) >= threshold:
            # 清理状态
            self.state[rule['id']][key_value] = []
            return True
        
        return False
    
    def _cleanup(self, rule_id: str):
        """清理过期状态"""
        # 简化：超过1小时的状态直接清理
        pass

# 规则配置示例
RULES = [
    {
        'id': 'brute-force',
        'name': '暴力破解检测',
        'type': 'threshold',
        'enabled': True,
        'group_by': 'src_ip',
        'field': 'action',
        'value': 'login_failed',
        'threshold': 5,
        'window_seconds': 300,  # 5分钟内5次失败
        'severity': 'high'
    },
    {
        'id': 'port-scan',
        'name': '端口扫描检测',
        'type': 'correlation',
        'enabled': True,
        'group_by': 'src_ip',
        'events': ['connection_refused', 'connection_timeout'],
        'threshold': 10,
        'window_seconds': 60,
        'severity': 'medium'
    }
]
```

### 3.4 性能优化：asyncio + uvloop

```python
# 使用 uvloop 提升性能 3-5倍
import uvloop
import asyncio

uvloop.install()

async def main():
    processor = LogProcessor('redis://localhost:6379')
    await processor.start()

if __name__ == '__main__':
    asyncio.run(main())
```

---

## 四、迁移计划

### 阶段一：基础设施准备 (1周)
- [ ] 部署 Redis Cluster (3节点)
- [ ] 升级 PostgreSQL 到 TimescaleDB
- [ ] 编写统一处理器原型

### 阶段二：核心逻辑迁移 (2周)
- [ ] 迁移日志解析逻辑
- [ ] 迁移告警引擎
- [ ] 实现 Redis Streams 消费者

### 阶段三：数据迁移 (1周)
- [ ] 导出历史数据
- [ ] 导入 TimescaleDB
- [ ] 验证数据一致性

### 阶段四：切换上线 (1周)
- [ ] 灰度切换 10% 流量
- [ ] 监控性能指标
- [ ] 全量切换

---

## 五、性能对比

| 指标 | 当前架构 | 新架构 | 提升 |
|------|---------|--------|------|
| **部署容器数** | 8+ | 4 | 50%↓ |
| **日志延迟** | 1-3秒 | <100ms | 10-30x |
| **吞吐量** | ~5000/s | ~50000/s | 10x |
| **故障恢复时间** | 5-10分钟 | <30秒 | 10x |
| **运维复杂度** | 高 | 低 | 简化 |

---

## 六、风险控制

1. **回滚方案**: 保留原 Flink 集群，支持快速回滚
2. **灰度发布**: 逐步切换流量
3. **监控告警**: 完善指标采集
4. **容量规划**: 预估峰值流量，提前扩容
