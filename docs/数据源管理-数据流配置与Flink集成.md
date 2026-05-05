# 数据源管理 - 数据流关联配置与 Flink 任务集成

## 概述

本文档描述了数据源管理的完整数据流关联配置系统，包括日志类型关联、解析管道配置、存储配置以及 Flink 任务的自动提交功能。

## 架构设计

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   数据源    │ ──▶ │  日志类型   │ ──▶ │  解析管道   │ ──▶ │   存储配置  │
│ DataSource  │     │  LogType    │     │  Pipeline   │     │DataTable    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                            │
                                            ▼
                                    ┌─────────────┐
                                    │  格式模板   │
                                    │FormatTemplate│
                                    └─────────────┘
```

## 数据流配置链路

### 1. 日志类型 (LogType)
定义数据的结构和语义，包括：
- 系统日志、安全日志、应用日志、网络日志、数据库日志等
- 每个日志类型有对应的字段定义

### 2. 解析管道 (Pipeline)
定义日志格式的解析规则：
- JSON 标准解析
- Syslog RFC5424/RFC3164
- CEF 安全事件
- Grok 自定义解析
- 智能识别

### 3. 格式模板 (FormatTemplate)
预定义的解析规则模板：
- 标准 JSON
- Apache/Nginx 日志格式
- 自定义 Grok 模式
- 可选配置

### 4. 存储配置 (Storage)
定义数据保留策略和存储位置：
- 存储表名
- 保留天数
- 分区间隔
- 压缩配置
- 索引字段

## 数据库模型

### DataSource 表扩展字段

```sql
-- 日志类型关联
log_type_id VARCHAR(50) REFERENCES log_types(id)
log_type_name VARCHAR(100)

-- 解析管道关联
pipeline_ids JSONB DEFAULT '[]'
pipeline_names JSONB DEFAULT '[]'

-- 格式模板关联
format_template_id VARCHAR(50) REFERENCES format_templates(id)
format_template_name VARCHAR(100)

-- 存储配置
storage_table_name VARCHAR(100)
storage_retention_days INTEGER DEFAULT 90
storage_partition VARCHAR(50) DEFAULT '1d'
storage_compression BOOLEAN DEFAULT TRUE
storage_indexes JSONB DEFAULT '[]'

-- Flink 任务状态
flink_job_id VARCHAR(100)
flink_job_status VARCHAR(20) DEFAULT 'stopped'
flink_last_heartbeat TIMESTAMP
```

## API 接口

### 1. 保存关联配置
```
POST /datasources-api/datasources/{id}/mapping
```

请求体：
```json
{
  "logTypeId": "lt1",
  "logTypeName": "系统日志",
  "pipelineIds": ["p1", "p2"],
  "pipelineNames": ["JSON标准解析", "Syslog RFC5424"],
  "formatTemplateId": "ft1",
  "formatTemplateName": "标准JSON",
  "storageTableName": "logs_long_term",
  "storageRetentionDays": 365
}
```

### 2. 启动 Flink 任务
```
POST /datasources-api/datasources/{id}/start
```

响应：
```json
{
  "success": true,
  "data": {
    "flink_job_id": "abc123def456",
    "status": "running",
    "message": "Flink 任务已启动"
  }
}
```

### 3. 停止 Flink 任务
```
POST /datasources-api/datasources/{id}/stop
```

### 4. 获取任务状态
```
GET /datasources-api/datasources/{id}/status
```

响应：
```json
{
  "success": true,
  "data": {
    "job_id": "abc123def456",
    "status": "running",
    "flink_state": "RUNNING",
    "last_heartbeat": "2026-05-05T21:00:00"
  }
}
```

### 5. 批量启动
```
POST /datasources-api/datasources/batch/start
```

## Flink 任务提交流程

### 启动流程

1. 用户在前端配置数据流关联（日志类型、解析管道、存储配置）
2. 调用保存配置 API，将配置存储到数据库
3. 用户点击"启动任务"按钮
4. 后端检查必要配置（log_type_id, storage_table_name）
5. 构建 Flink 任务参数字典
6. 调用 Flink REST API 提交任务
7. 保存 flink_job_id 到数据库
8. 更新任务状态为 running

### 任务参数构建

```python
job_params = {
    'datasource_id': datasource.id,
    'datasource_name': datasource.name,
    'protocol': datasource.protocol,
    'config': datasource.config,
    'log_type_id': datasource.log_type_id,
    'pipeline_ids': datasource.pipeline_ids,
    'format_template_id': datasource.format_template_id,
    'storage_table': datasource.storage_table_name,
    'storage_retention_days': datasource.storage_retention_days,
}
```

### 状态同步

- 定时调用 Flink REST API 获取任务状态
- 同步更新数据库中的 flink_job_status
- 更新最后心跳时间 flink_last_heartbeat

### 停止流程

1. 用户点击"停止任务"按钮
2. 调用 Flink REST API 停止任务
3. 更新数据库状态为 stopped
4. 更新数据源状态为 inactive

## 前端交互

### 数据源列表页

- 显示数据源名称、协议、日志类型、解析管道数量
- Flink 任务状态指示（运行中/已停止）
- 启动/停止按钮

### 关联配置弹窗

四步配置流程：
1. 选择日志类型
2. 选择解析管道（可多选）
3. 选择格式模板（可选）
4. 选择存储配置

### 配置摘要

实时显示当前配置：
- 数据源
- 日志类型
- 解析管道数量
- 存储配置

## 数据库迁移

运行迁移脚本添加新字段：

```bash
cd /Users/codes/usop/server-python
python migrate_add_datasource_mapping.py
```

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| DB_HOST | localhost | 数据库主机 |
| DB_PORT | 5432 | 数据库端口 |
| DB_NAME | usop | 数据库名称 |
| DB_USER | postgres | 数据库用户 |
| DB_PASSWORD | postgres | 数据库密码 |
| FLINK_REST_API | http://flink:8081 | Flink REST API 地址 |

## 注意事项

1. 启动 Flink 任务前必须配置日志类型和存储配置
2. 任务运行中修改配置需要先停止任务
3. 删除数据源会自动停止关联的 Flink 任务
4. Flink 任务失败后状态会自动更新
5. 建议配置心跳检测机制监控任务健康状态
