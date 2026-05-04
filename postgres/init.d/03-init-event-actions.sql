-- ========================================
-- 事件处置记录表初始化
-- 存储事件的完整生命周期操作记录
-- ========================================

-- 事件处置记录表
CREATE TABLE IF NOT EXISTS event_actions (
    id SERIAL PRIMARY KEY,
    
    -- 关联的事件ID (支持字符串和数字)
    event_id VARCHAR(50) NOT NULL,
    
    -- 操作类型
    action VARCHAR(50) NOT NULL,  -- created, status_changed, severity_changed, assigned, comment, attachment, playbook_triggered, enriched, merged, escalated, closed
    
    -- 操作内容
    content TEXT,
    
    -- 操作人
    user_id INTEGER REFERENCES users(id),
    user_name VARCHAR(50),
    
    -- 状态变更记录
    previous_status VARCHAR(20),
    new_status VARCHAR(20),
    
    -- 严重度变更记录
    previous_severity VARCHAR(20),
    new_severity VARCHAR(20),
    
    -- 分配记录
    assignee VARCHAR(50),
    
    -- 附件
    attachments JSONB DEFAULT '[]',
    
    -- 剧本执行记录
    playbook_id INTEGER REFERENCES playbooks(id),
    playbook_name VARCHAR(100),
    playbook_execution_id VARCHAR(100),
    playbook_result JSONB DEFAULT '{}',
    
    -- 元数据（用于存储其他扩展信息）
    metadata JSONB DEFAULT '{}',
    
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_event_actions_event_id ON event_actions(event_id);
CREATE INDEX IF NOT EXISTS idx_event_actions_created_at ON event_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_actions_action ON event_actions(action);
CREATE INDEX IF NOT EXISTS idx_event_actions_user_id ON event_actions(user_id);

-- 添加注释
COMMENT ON TABLE event_actions IS '事件处置记录表';
COMMENT ON COLUMN event_actions.event_id IS '关联的事件ID';
COMMENT ON COLUMN event_actions.action IS '操作类型';
COMMENT ON COLUMN event_actions.content IS '操作内容/评论';
COMMENT ON COLUMN event_actions.user_name IS '操作人用户名';
COMMENT ON COLUMN event_actions.previous_status IS '变更前的状态';
COMMENT ON COLUMN event_actions.new_status IS '变更后的状态';
COMMENT ON COLUMN event_actions.previous_severity IS '变更前的严重度';
COMMENT ON COLUMN event_actions.new_severity IS '变更后的严重度';
COMMENT ON COLUMN event_actions.assignee IS '分配的处置人';
COMMENT ON COLUMN event_actions.attachments IS '附件列表';
COMMENT ON COLUMN event_actions.playbook_id IS '执行的剧本ID';
COMMENT ON COLUMN event_actions.playbook_name IS '执行的剧本名称';
COMMENT ON COLUMN event_actions.playbook_execution_id IS '剧本执行ID';
COMMENT ON COLUMN event_actions.playbook_result IS '剧本执行结果';

-- 为events表添加extra_data字段（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'extra_data'
    ) THEN
        ALTER TABLE events ADD COLUMN extra_data JSONB DEFAULT '{}';
    END IF;
    
    -- 修改event_code字段长度为30
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'event_code' 
        AND character_maximum_length < 30
    ) THEN
        ALTER TABLE events ALTER COLUMN event_code TYPE VARCHAR(30);
    END IF;
END $$;

-- 授予权限
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO usop;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO usop;
