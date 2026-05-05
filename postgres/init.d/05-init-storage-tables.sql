-- ========================================
-- 存储表管理初始化
-- ========================================

-- 存储表表
CREATE TABLE IF NOT EXISTS storage_tables (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    data_source VARCHAR(100),
    log_type VARCHAR(50),
    retention_days INTEGER DEFAULT 90,
    partition_interval VARCHAR(20) DEFAULT '1天',
    indexes JSONB DEFAULT '[]',
    row_count BIGINT DEFAULT 0,
    size VARCHAR(20),
    compression BOOLEAN DEFAULT TRUE,
    auto_created BOOLEAN DEFAULT FALSE,
    created_by_pipeline VARCHAR(100),
    last_optimized TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_storage_tables_name ON storage_tables(name);
CREATE INDEX IF NOT EXISTS idx_storage_tables_auto_created ON storage_tables(auto_created);
CREATE INDEX IF NOT EXISTS idx_storage_tables_created_at ON storage_tables(created_at);

-- 授予权限
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO usop;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO usop;
