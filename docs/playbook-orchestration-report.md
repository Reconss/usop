# 剧本编排功能实测与优化报告

> 日期：2026-10-18 ｜ 范围：剧本编排引擎 + 三个威胁运营剧本 ｜ 状态：已部署生产（nginx 3266 / Flask 5001）

## 一、交付的三个威胁运营剧本（已落库并发布）

| # | 剧本 | id | 触发 | 链路 | 实测结果 |
|---|---|---|---|---|---|
| 1 | **每日威胁运营日报** | 27 | 手动 | 查询当日事件(事件表/24h) → 代码组装(report_date/events_summary) → AI 按固定日报模板生成 Markdown → 邮件发送 15596678020@163.com → 站内信存档 | ✅ 全链路通；报告含「今日概览/事件明细/威胁趋势/处置建议/附注」五节；SMTP 未配置时邮件节点明确报错，站内信兜底成功 |
| 2 | **事件分析** | 28 | 告警事件 | 并行查关联告警(ES, src_ip) + 同类历史事件(DB, category) → 代码组装事件研判输入 → AI 中心「事件研判」提示词(event_analysis) 输出 JSON 研判 → 分析结论回写事件 extra_data.ai_analysis | ✅ 全链路通；实测命中 1 条关联告警 + 2 条历史事件，回写验证通过 |
| 3 | **告警处置** | 29 | 定时(0 */2 * * *) | 查询未处置告警(ES, status:new/24h) → AI 逐条判定可疑(suspicious/reason/confidence) → 过滤 suspicious=true → 生成事件（已生成过事件的告警自动去重跳过）→ 站内信通知 | ✅ 全链路通；实测：2 条可疑告警 → 建事件 EVT-20261018072756；再次执行全部去重跳过 |

### 固定日报模板（AI 中心 → 提示词管理 → 「每日威胁运营日报」daily_report，可在界面编辑）

```
# 每日威胁运营日报（{{report_date}}）
## 一、今日概览      —— 新增事件 N 起（高/中/低）、未闭环数、值班关注等级
## 二、事件明细      —— 表格：编号/标题/级别/状态/分类/摘要
## 三、威胁趋势与研判 —— 威胁类型 Top3、新出现行为/IP、与前期对比
## 四、处置与建议    —— 已处置 / 待处置（按优先级+建议动作）
## 五、附注          —— 数据来源、自动生成声明
```

模板变量：`report_date` / `events_summary` / `alert_summary`（由剧本「组装日报输入」代码节点产出）。

### AI 中心提示词接入方式
AI 节点新增「AI 中心提示词职责」下拉（动态拉取 `/ai-center/catalog`）。选择职责（如 事件研判/daily_report）后：
- system ← AI 中心该职责的默认提示词（可在 AI 中心改，剧本自动跟随）
- user ← 模板按「触发上下文 ∪ 当前数据项」逐项渲染
- **LLM 通道不可用时自动规则兜底**：日报按固定模板用真实数据确定性生成完整 Markdown（报告中标注「规则模板模式，非 LLM 生成」）；可疑判定按级别启发（高危/严重→可疑）

## 二、过程中发现并修复的引擎缺陷（7 项）

| # | 缺陷 | 根因（文件:位置） | 修复 | 影响 |
|---|---|---|---|---|
| 1 | **查询结果不展开成 items**：告警/事件被嵌在 `data.items` 里，下游过滤/AI/代码节点拿到的是单个合并项，逐条处理不可能 | `actions.py::ActionResult.__init__` 不产出 items | data.items 列表自动展开为逐行输出 items（查询=行生成器，n8n 语义） | 所有查询→下游链路 |
| 2 | **`{{ src_ip }}` 带空格不解析**：表达式原样残留，查询条件失效（前端引用按钮生成的就是带空格写法） | `actions.py::resolve` 裸字段正则 `\{\{(\w+)\}\}` 无空格容忍 | 单级/多级正则均允许空格 | 所有人工输入表达式 |
| 3 | **代码节点用 datetime 即炸**（`'__import__'`）：`date.today()/strftime` 内部 `import time`，受限 builtins 缺 `__import__` | `playbook_engine.py::CODE_BUILTINS` | 新增受限导入器：标准库白名单（datetime/time/json/re/math/…），`import os` 等仍被拒 | 代码节点可用性 |
| 4 | **script 类型节点抢占 update_event**：`typeId:'script'` 优先映射 run_script，`config.action` 被忽略 → "未指定要执行的脚本" | `SEMANTIC_ACTION_MAP` 查找顺序 | 新增 `update_event` 语义映射 + 前端「回写分析结论」节点 | 事件分析回写 |
| 5 | **定时剧本日内 cron 被误杀**：「同一本地日只执行一次」去重把 `0 */2 * * *` 压成一天一跑 | `scheduler.py::_run_scheduled_playbooks` | 去重改为「最近 5 分钟内已执行才跳过」 | 定时剧本调度正确性 |
| 6 | **聚合 collect 空字段无意义**：`collect` 不填字段返回空列表，无法整行归集 | `playbook_engine.py::_execute_aggregate` | collect 无字段时归集整行 rows | 报告/批量输入组装 |
| 7 | **equals 布尔失配**：AI 输出 `True` 对配置 `'true'` 因大小写判不等，过滤器全灭 | `CONDITION_OPERATORS['equals']` | 布尔侧大小写不敏感比较 | 条件/过滤节点 |

### 新增引擎能力
- **create_event 生成事件节点**（前端+引擎）：聚合告警建工作台事件，含去重（Event.extra_data.alert_ids 已引用即跳过）、关联告警快照、状态回写 investigating；全部去重时 skipped=True 让链路继续走通。
- **update_event 节点增强**：新增 `analysis` 字段 → 写入 `event.extra_data.ai_analysis`（事件工作台展示位）。
- **LLMAction prompt_key**：接入 AI 中心提示词管理（职责级默认，界面可改）。
- **AI 中心新增内置提示词**：`daily_report`（每日威胁运营日报，固定模板，播种幂等）。

## 三、当前限制（如实说明）

1. **SMTP 未配置** → 剧本 1 的邮件节点会失败（错误信息明确指引「全局配置→邮件服务」）。配置后无需改剧本自动生效；未配置期间日报在**通知中心**可看（站内信兜底）。
2. **LLM 通道本机不可用**（USE_HERMES_PROXY 指向不存在）→ 所有 AI 节点走规则兜底，`ai_meta.is_ai=false` 且 UI 有降级标注。配置真实 LLM 网关后自动切 AI 深度分析，剧本无需改动。
3. **事件分析的告警关联按 src_ip/category 精确匹配**：若事件缺少源 IP 或分类，关联查询为空（分析仍可基于事件本身进行）。后续可加"同攻击类型/同资产"等模糊关联。
4. **可疑判定兜底为启发式**（高危/严重→可疑）：LLM 恢复前，低危可疑行为可能漏报；误报拦截依赖告警级别质量。
5. **验证用的测试数据**：EVT-FIXTURE-001/002（事件）与 ALT-*-fixt/fixt2（告警）为本次端到端验证注入，标记「剧本验证」，可在事件工作台/告警台删除，不影响剧本运行。

## 四、验证方式与结论

- 引擎层：容器内单测（items 展开/去重建事件/表达式解析/受限导入/聚合归集）逐项通过。
- 链路层：三个剧本经 API 真实执行，节点结果逐节点核对（成功消息/数据/回写内容）。
- UI 层：Playwright 无头浏览器验证三个剧本在列表正确显示（触发标注与库一致）、编辑器画布渲染正常，零 pageerror。
- 类型检查 tsc / 生产构建 webpack / 部署（docker cp + restart，nginx 3266=200）全部通过。

**结论**：剧本编排引擎经本轮修复后具备真实威胁运营能力——日报（数据→模板→邮件/站内信）、事件分析（多源关联→AI 中心提示词→结论回写）、告警处置（定时→AI 研判→建事件去重闭环）三条链路全部可跑通且数据真实。

## 五、通知渠道基础配置（2026-10-18 补充）

**问题**：剧本「发送通知」节点所有渠道（邮件/企业微信/钉钉/飞书/Slack/Webhook）配置表单一样，且各渠道的基础配置（默认 Webhook、邮件默认收件人）没有集中配置页。

**方案**：
- **全局配置→通知渠道**（新分区，替代原「通知配置」假键值）：企业微信/钉钉/飞书/Slack/通用 Webhook 各一张卡片（启用开关 + Webhook URL + 测试按钮，测试=真实 POST 一条消息）；邮件卡片=默认收件人 + 发送测试邮件（走「邮件服务」SMTP）。Webhook 中的 key/token 参数读取时打码 `******`，写回 `******` 表示保留原值（与 SMTP 授权码同一约定）。
- **后端**：`app/utils/notify_service.py`（配置 CRUD + 渠道名归一化 + dispatch_webhook + test_channel）；`/users-api/notify-config` GET/POST、`/users-api/notify-test` POST。
- **引擎**：`_execute_notification` 重写——Webhook URL 解析顺序=节点值→全局渠道默认；邮件渠道=节点收件人→全局默认收件人，走 SMTP 真发信；渠道名支持中文归一化；外发失败（HTTP 5xx/业务 errcode 非 0）标记节点失败；站内信始终保留。
- **节点表单按渠道显隐**（`showIf` 机制）：企微/钉钉/飞书/Slack/Webhook → 显示 Webhook URL（留空用全局默认）；邮件 → 显示收件人（留空用全局默认）；渠道选项补「飞书」。
- **业务码校验**：群机器人 HTTP 200 但 errcode≠0（如 invalid webhook url）识别为失败。

**验证**：容器内实测打码回写/中文归一化/引擎回退（真实 POST 到企微返回 errcode=93000 证明链路通、邮件渠道真实发出一封测试邮件）；无头浏览器实测配置页加载/保存/默认收件人回显/旧假分区移除 + notify 节点字段按渠道显隐，零 pageerror。

## 六、告警触发链路修复 + 通用动作真实化 + 复制/删除修复（2026-10-18 第二轮）

**用户反馈**：自动封堵恶意IP剧本从安全事件（事件工作台）调用时拿不到数据；通用动作没有实际作用；剧本列表复制/删除按钮无响应。

**根因与修复**：
1. **删除无响应（前端）**：Playbooks.tsx 只解构 `ask` 未渲染 `<ConfirmDialog {...confirmProps}/>` —— 确认弹窗永远不出现，Promise 永久挂起。已渲染补齐。
2. **复制不持久化（前端）**：原来仅本地 state 追加（假 id），刷新即消失。改为 `createPlaybook` 落库（`xx (副本)`、draft、默认停用）。
3. **事件侧上下文丢失（后端根因）**：`events_api.trigger_event_playbook` 经 HTTP 自调 execute，但传参键是 `event_context` 而 execute 端点读 `event` —— 引擎收到空上下文；且自调无鉴权头（401 风险）、键名 eventCode/sourceIp 与引擎约定不符。改为**进程内 engine.execute**，event_context 双写新旧键（event_code/eventCode、src_ip/sourceIp、related_alerts），src_ip 回退链=事件 source→首条关联告警；trigger_type='alert'。
4. **触发类型永不匹配（后端）**：画布配置键 `triggerType`（中文值），引擎读 `trigger_type`（英文值）→ 永不匹配回退首个触发器。新增 `TRIGGER_TYPE_ALIASES` 双向归一（告警事件↔alert、定时任务↔schedule、手动触发↔manual、Webhook↔webhook），两键名都接受。
5. **通用动作空壳**：节点只有动作名一个字段。改为「动作下拉（引擎真实动作列表 /playbooks-api/actions/list 动态加载）+ 动作参数（JSON 或每行 key=value，支持 {{ 表达式 }}）」；引擎 action 分支解析 params 合并进 config。
6. **触发器数据不外显**：trigger 节点现把触发数据（event/alert/params 快照）作为输出 items 交给下游，引用选择器与 `{{ $json.xxx }}` 均可取到。
7. **IP 封堵纯内存**：`IPBlockManager._blocked_ips` 重启即失、解封/列表失真。持久化到 SystemConfig（key=`blocked_ips`），iptables/设备 API 行为不变。
8. **条件节点补「属于/不属于」运算符**（引擎本就支持 in_list/not_in_list，前端下拉缺选项）。
9. **「自动封堵恶意IP」剧本（id=1）重写**：原为旧种子占位数据（节点无 id/连线/config 键全错、draft 状态）。现为真实编排：告警事件触发 → IP情报核查（微步）→ 高危等级判断（severity 属于 critical,high）→ [true] 通用动作封堵 block_ip（ip={{ $json.src_ip }}）→ 邮件通知；[false] 低风险仅站内信记录。

**验证**：容器内端到端——高危路径（触发器带出 src_ip → 情报 → 条件满足 → 封堵成功 → 真实邮件发出）与低危路径（false 分支仅记录、不封堵）全通过；封堵名单持久化/重复封堵拒绝/解封一致；无头浏览器实测复制（落库出现副本）、删除（弹窗出现、确认后消失）、通用动作节点（动作下拉含 block_ip + 参数框）、画布 6 节点分支渲染，零 pageerror。

## 七、节点全量审计 + 引用语法统一 + 删除级联修复（2026-10-18 第三轮）

**用户要求**：核实每个节点组件真实有效；统一上下游参数引用方式（点击插入≠说明框写法）；封装动作要有具体配置页面并在调用时传参、返回执行结果。

**审计结论（17 个注册动作逐一真实 execute）**：
- 全部动作真实有效且返回结构化结果：block_ip（含 duration 过期自动解封）、unblock_ip、quarantine_host（EDR API→降级封 IP 明确标注）、send_notification（真实外发+业务码校验）、webhook、run_script（Bash/Python 真跑、Node.js 容器无执行器时诚实报错）、update_event、add_tag、enrich_ip（微步真实查询）、query_data、create_ticket、recall_experience、ai_llm（规则兜底）、send_email（SMTP 真发）、create_event（缺上游数据明确提示）、http_request。
- 3 个"✗"均为预期的诚实失败路径：假 webhook 被业务码校验拒绝、容器无 node、create_event 无上游告警。

**修复清单**：
1. **删除剧本 500（FK 级联）**：playbooks 被 playbook_executions / event_actions 外键引用，直接删报 IntegrityError（「每日安全运营报告」无法删除的根因）。delete_playbook 现在先清执行记录、event_actions 置 playbook_id=NULL（保留处置审计）。
2. **create_ticket 落库崩溃**：EventAction 无 event_code 列（应为 event_id）→ 工单创建失败已修。
3. **update_event 优先级**：节点显式 event_code 现优先于上下文继承（原来互相顶掉）。
4. **webhook 动作**：headers 支持 dict/JSON 文本/每行 "Key: value"；body 支持 dict/JSON 文本/任意文本（不再双重编码崩溃）。
5. **引用语法统一（n8n 风格，引擎全支持）**：当前输入 `{{ $json.字段 }}`、上游节点 `{{ $('节点名').json.字段 }}`、全部输出项 `{{ $items('节点名') }}`；点击「引用」插入即说明框展示写法；所有 placeholder/种子剧本旧式裸字段（{{src_ip}}）清零；旧「可引用的上游数据」帮助框替换为统一「数据引用规则」。
6. **通用动作配置页（schema 驱动）**：ACTION_PARAM_SCHEMAS（17 动作参数定义）随 /playbooks-api/playbooks/actions/list 返回；前端选中动作后渲染具体参数表单（label/required/placeholder/下拉选项），带引用按钮，写入 config.values；保留 JSON/key=value 高级模式；引擎合并 values 进动作 config。
7. **switch 真实分流**：命中分支值→路由到「分支名」标签的出边（原只展示不路由）；loop 产出遍历项。

**验证**：容器内 17 动作全量真实执行通过；HTTP 实测删除「每日安全运营报告」成功（清理 4 执行记录+5 处置记录解除关联）；无头浏览器实测列表已无该剧本、通用动作 schema 参数表单渲染、零 pageerror。

## 八、事件工作台执行剧本渲染崩溃修复（2026-10-18 第四轮）

**现象**：事件工作台打开「执行剧本」参数弹窗即整页崩溃：`ReferenceError: validatePlaybookParams is not defined`（该文件 @ts-nocheck，tsc 无法发现）。

**根因与修复（共 3 处未定义引用 + 1 处类型缺失）**：
1. `validatePlaybookParams` 被调用但从未定义 → 已实现（必填项校验 + IP 格式轻校验），弹窗执行按钮据此禁用/放行。
2. `handleExecutePlaybookWithApproval`（勾选「需要审批后执行」路径）未定义 → 新增后端 `POST /playbooks-api/playbooks/<id>/approve-request`（落 PlaybookApproval pending + 站内信通知），前端 `playbooksApi.requestApproval` 调用并 toast 确认。
3. `eventActionsApi.aiAnalyzeEvent` 不存在（AI 分析按钮崩溃）→ 补充方法（对应后端 `/events/<id>/ai-analyze`），并顺带补 `getEventAiAnalysis`。
4. `EventActionType` 联合类型补 `approval_requested`（标签/颜色映射同步），审批记录在事件时间线正常显示。

**顺带修复**：「告警处置」剧本（id=29）「生成事件」节点丢失 `action: 'create_event'`（执行报"未找到动作"）——已修复数据，并在剧本保存接口增加 `_infer_missing_action_names` 兜底（按 ACTION_PARAM_SCHEMAS 参数键重叠 ≥2 自动回填动作名）。

**验证**：无头浏览器端到端——参数弹窗正常渲染、未填必填 IP 时执行按钮禁用、填写后解禁、勾选审批后点击执行走审批申请路径并提示成功，全程零 pageerror；EventWorkspace 全部 11 个 API 调用清查均有定义。
