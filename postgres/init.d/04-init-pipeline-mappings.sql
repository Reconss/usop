-- ========================================
-- 解析管道字段映射表初始化
-- 存储每个解析管道的字段映射配置
-- ========================================

-- 解析管道字段映射表
CREATE TABLE IF NOT EXISTS pipeline_field_mappings (
    id SERIAL PRIMARY KEY,
    
    -- 关联的解析管道ID
    pipeline_id INTEGER NOT NULL,
    
    -- 目标标准字段名（对应 alert_field_definitions.name）
    target_field VARCHAR(50) NOT NULL,
    
    -- 源字段名（原始日志中的字段名）
    source_field VARCHAR(100) NOT NULL,
    
    -- 字段类型
    field_type VARCHAR(20) DEFAULT 'string',
    
    -- 默认值（当原始日志中无该字段时使用）
    default_value VARCHAR(255),
    
    -- 是否必填映射
    is_required BOOLEAN DEFAULT FALSE,
    
    -- 排序顺序
    sort_order INTEGER DEFAULT 0,
    
    -- 创建和更新时间
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- 外键约束
    CONSTRAINT fk_pipeline FOREIGN KEY (pipeline_id) 
        REFERENCES pipelines(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_pipeline_field_mappings_pipeline_id 
    ON pipeline_field_mappings(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_field_mappings_target_field 
    ON pipeline_field_mappings(target_field);
CREATE INDEX IF NOT EXISTS idx_pipeline_field_mappings_source_field 
    ON pipeline_field_mappings(source_field);

-- 解析管道配置表（增强版，存储解析模板配置）
CREATE TABLE IF NOT EXISTS pipeline_configs (
    id SERIAL PRIMARY KEY,
    
    -- 关联的解析管道ID
    pipeline_id INTEGER NOT NULL UNIQUE,
    
    -- 解析器类型 (json/xml/csv/syslog/grok/regex)
    parser_type VARCHAR(20) NOT NULL DEFAULT 'json',
    
    -- 解析配置 (JSON格式，存储解析规则、正则表达式等)
    parser_config JSONB DEFAULT '{}',
    
    -- 样本日志（用于测试）
    sample_log TEXT,
    
    -- 过滤规则 (JSON格式)
    filter_rules JSONB DEFAULT '[]',
    
    -- 转换规则 (JSON格式)
    transform_rules JSONB DEFAULT '[]',
    
    -- 关联的检测规则ID列表
    detection_rule_ids JSONB DEFAULT '[]',
    
    -- 关联的格式模板ID
    format_template_id INTEGER,
    
    -- 创建和更新时间
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- 外键约束
    CONSTRAINT fk_pipeline_config_pipeline FOREIGN KEY (pipeline_id) 
        REFERENCES pipelines(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_pipeline_configs_pipeline_id 
    ON pipeline_configs(pipeline_id);

-- 为 parse_pipelines 表添加字段（如果不存在）
DO $$
BEGIN
    -- 添加解析配置ID
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'parse_pipelines' AND column_name = 'config_id'
    ) THEN
        ALTER TABLE parse_pipelines ADD COLUMN config_id INTEGER REFERENCES pipeline_configs(id);
    END IF;
    
    -- 添加字段映射模式（simple: 简单映射, advanced: 高级映射）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'parse_pipelines' AND column_name = 'mapping_mode'
    ) THEN
        ALTER TABLE parse_pipelines ADD COLUMN mapping_mode VARCHAR(20) DEFAULT 'simple';
    END IF;
END $$;

-- 添加注释
COMMENT ON TABLE pipeline_field_mappings IS '解析管道字段映射表';
COMMENT ON TABLE pipeline_configs IS '解析管道配置表';
COMMENT ON COLUMN pipeline_field_mappings.target_field IS '目标标准字段名（对应 alert_field_definitions.name）';
COMMENT ON COLUMN pipeline_field_mappings.source_field IS '源字段名（原始日志中的字段名）';
COMMENT ON COLUMN pipeline_field_mappings.default_value IS '默认值（当原始日志中无该字段时使用）';
COMMENT ON COLUMN pipeline_configs.parser_config IS '解析配置（JSON格式）';
COMMENT ON COLUMN pipeline_configs.filter_rules IS '过滤规则（JSON格式）';
COMMENT ON COLUMN pipeline_configs.transform_rules IS '转换规则（JSON格式）';

-- 授予权限
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO usop;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO usop;
