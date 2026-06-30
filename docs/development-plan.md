# USOP 开发计划

## 📋 待开发功能

### P0 — 高优先级（当前迭代）

_暂无_

### P1 — 中优先级（下个迭代）

- [ ] **用户管理:** 支持搜索用户
- [ ] **角色管理:** 角色权限编辑页面的审批等级配置
- [ ] **登录日志:** 用户登录历史查看
- [ ] **操作审计:** 对接审批流程记录操作日志

### P2 — 低优先级（功能增强）

- [ ] **飞书机器人集成** — 自定义 Feishu Bot Gateway（~500 行）
  - Feishu Client: Token 管理 + 消息 API 封装
  - Webhook Handler: 接收群聊 @消息
  - Message Router: 解析指令 → 调用 USOP orchestrate API
  - Card Builder: 告警分析卡片 / 审批卡片
  - 审批回调: 飞书卡片按钮 → 执行/拒绝操作
  - 状态: 方案已确定，用自定义轻量开发（不用 Hermes/OpenCLAW）
  - 预估工期: 3 天

- [ ] **飞书审批通知推送** — 现有审批工作流自动推送到飞书群聊
- [ ] **钉钉/企微机器人** — 适配多平台

### P3 — 低优先级（技术债务/优化）

- [ ] **后端进程守护:** 解决 dev 模式下进程意外退出问题
- [ ] **Webpack 构建优化:** 分包/懒加载减少首屏体积
- [ ] **完善单元测试:** 后端 AI 分析/审批流程单测
- [ ] **API 文档:** Swagger/OpenAPI 集成

---

## ✅ 已完成

- [x] AI 中心对话界面重构
- [x] @ 提及关联人员
- [x] 群聊功能（已移除）
- [x] 角色体系（超级管理员 / 安全主管 / 安全分析师 / 安全运维 / 审计员）
- [x] 分级审批（L1 自动 / L2 主管 / L3 高级管理）
- [x] 审批管理页面（待审批 / 审批规则 / 审批历史）
- [x] APScheduler 定时告警自动分析
- [x] 用户管理: 角色下拉从 API 动态加载
- [x] 用户管理: 最后登录时间 + 密码重置
- [x] AI 对话历史会话刷新自动恢复

---

## 🛡️ ES 后端 + Graylog 风格前端重构（已完成）

### ✅ Sprint 1-2：ES 后端基础 + Search DSL + 聚合引擎
- [x] `es_alert_store.py` — ES 连接管理、告警 CRUD、query_string 解析器、QuickValues / DateHistogram / FieldStats
- [x] `alerts_api.py` — 完整 REST 端点（列表/搜索/统计/聚合/批量操作）
- [x] `api.ts` — 前端 API 方法（searchAlerts / quickValues / fieldStats / getStreams / savedSearches）

### ✅ Sprint 3：搜索栏 + 时间选择 + 直方图
- [x] `SearchBar.tsx` — Graylog 风格搜索栏，query_string 输入 + 语法提示 + 保存搜索
- [x] `TimeRangeSelector.tsx` — 快捷预设（5m/15m/1h/4h/24h/7d/30d）+ 自定义时间范围 + 实时滚动
- [x] `AlertHistogram.tsx` — SVG/div 时间分布柱状图，点击柱子缩放时间范围

### ✅ Sprint 4：QuickValues + 消息表
- [x] `QuickValuesPanel.tsx` — 左侧栏 280px，字段列表 + Top 10 值分布条形图 + 点击筛选 / Ctrl+排除
- [x] `MessageTable.tsx` — 可配置列头、搜索词高亮、行展开详情、排序、分页

### ✅ Sprint 5：消息详情 + 字段浏览器
- [x] `FieldBrowser.tsx` — 字段按分组展示（网络/告警/资产/时间/原始）+ 复制 + 搜索此字段
- [x] `AlertDetailDrawer` — 集成 FieldBrowser + RawLog + 邻接消息 Tab
- [x] `related_alerts()` — ES 邻接消息查询（同 src_ip / 同 category / 前后 1h）

### ✅ Sprint 6：Streams + SavedSearches + 收尾
- [x] Stream CRUD — 完整 ES 端点（创建/列表/获取/更新/删除）
- [x] `StreamManager.tsx` — 创建/编辑/删除 Stream + 匹配规则管理
- [x] SavedSearches — 完整 CRUD（保存/列表/删除）+ SearchBar 嵌入
- [x] `timescaledb.py` — 告警相关函数标记 DEPRECATED
- [x] `api.ts` — 补充 relatedAlerts / updateStream / deleteStream / deleteSavedSearch / dateHistogram
- [x] `SecurityAlerts.tsx` — 全量重写，整合所有 Graylog 风格组件
