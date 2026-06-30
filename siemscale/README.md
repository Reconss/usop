# SIEM 大规模数据处理架构

ClickHouse + Elasticsearch 分层存储方案

## 架构

```
数据源 → 处理器 → ClickHouse (分析) + Elasticsearch (搜索)
              │
              ├─ 全量存储 → ClickHouse (复杂聚合)
              └─ 按需索引 → ES (高危/特定类别)
```

## 部署

```bash
cd /Users/codes/usop/siemscale
docker compose up -d
```

## 数据存储策略

| 存储 | 数据范围 | 用途 | 存储量 |
|------|----------|------|--------|
| ClickHouse | 100% 全量 | 复杂分析、报表 | 100% |
| ES | 5-20% 筛选 | 搜索、调查 | ~15% |

## API 接口

- 事件趋势: `GET /api/dashboard-api/event-trend`
- 事件分布: `GET /api/dashboard-api/event-types`  
- 攻击源: `GET /api/dashboard-api/attack-sources`
- 资产风险: `GET /api/dashboard-api/risk-assets`
- 全文搜索: `GET /api/search?q=keyword`
- IP调查: `GET /api/search/investigate-ip?ip=x.x.x.x`
