---
name: meoo-design-kungfu
description: "Frontend UI design assistant that recommends the best style from 140+ curated designs. Use this skill when users need UI design advice, style selection, color schemes, or component specifications. Suitable for SaaS, e-commerce, Fintech projects. Capabilities: style recommendation, design tokens, component recipes, responsive layouts, color palettes, scoring system. Triggers: help me design, design style, design advice, recommend style, UI recommendation, web design, style guide, color scheme, make it look good, modern UI."
---

# Design Kungfu Skill 🥋

Design Kungfu 帮用户从 140 个精选设计风格中选出最匹配的方案，并产出可直接落地的 shadcn/ui + Tailwind CSS 代码。所有数据离线内置：

- **`database.yaml`** —— 产品类型 / 品牌调性 / 受众 → 风格的映射表
- **`styles/<slug>.md`** —— 140 个风格的 Tailwind token、组件配方、禁用模式（**代码生成用**）
- **`references/<brand>.md`** —— 53 个品牌的深度叙事设计系统文档（色彩哲学、排版规则、阴影语言）（**深度参考用**）
- **`EXAMPLES.md`** —— 端到端推荐对话示例

> **兼容性**：本 skill 遵循 Anthropic Skills 约定（frontmatter + markdown body + 相对路径引用），可在任何支持 Skills 格式的 AI 开发工具中使用（Claude Code、Cursor、Qoder 等）。所有文件引用均使用相对路径，运行环境不假设 shell 可用——"读取 `styles/xxx.md`" 指用当前工具提供的文件读取能力读取，不限于 `cat`。

## 工作流程

### 第一步：问清需求

不要凭名字猜，缺信息就直接问用户：

```
🔍 让我了解一下你的项目：

1. 产品类型：SaaS / 电商 / Fintech / 教育科技 / 开发者工具 / 其他
2. 目标用户：企业 / 消费者 / 开发者 / 创意人士
3. 品牌调性：专业 / 活泼 / 奢华 / 极简 / 大胆
```

只有当用户已经给出明确产品名（"我做一个发烧友音响电商"），才可以跳过对应问题。

### 第二步：查 database.yaml 打分

读取 `database.yaml` 的三张表，按以下权重打分（满分 100）：

| 维度 | 权重 | 评分依据 |
|------|------|----------|
| 产品类型匹配 | 40 | `product_types[<type>]` 中 primary 计 40，secondary 计 25 |
| 品牌调性匹配 | 35 | `brand_moods[<mood>].styles` 命中计 35 |
| 目标受众匹配 | 25 | `audiences[<aud>].styles` 命中计 25 |

未命中维度给该维度的 30%-50% 作为软分（让候选不至于 0 分被淘汰）。三个维度都明确命中的风格自然进入 Top 推荐。

### 第三步：展示 Top 推荐

```
┌─────────────────────────────────────────────────────────────┐
│  🥋 DESIGN KUNGFU 设计推荐                                  │
├─────────────────────────────────────────────────────────────┤
│  🏆 最佳匹配                                                │
│  Style: Vercel Style                                        │
│  匹配度: 93/100                                              │
│  理由: 黑白 Geist 字体 + 极简,开发者平台行业标准              │
│                                                             │
│  📊 评分                                                    │
│  • 产品类型: 40/40   • 品牌调性: 33/35   • 目标受众: 20/25  │
├─────────────────────────────────────────────────────────────┤
│  🔄 其他推荐                                                │
│  2. Linear Style       89/100  紫色强调,项目管理感           │
│  3. Supabase Style     84/100  深翠绿,代码优先               │
│  4. Minimalist Flat    78/100  极简通用底盘                  │
│  5. Bento Grid         72/100  卡片化展示                    │
└─────────────────────────────────────────────────────────────┘
```

至少给 3 个、最多给 5 个候选。每个候选都要写一句"为什么"。

### 第四步：用户选定后读风格文档

读取对应的风格文档（路径相对于 skill 根目录）：`styles/<slug>.md`，例如 `styles/vercel-style.md`。

每个风格文档包含：设计理念、Design Tokens（精确 Tailwind class）、组件配方、禁用模式、Do's & Don'ts。

**可选的深度参考**：若用户点名的是下列 53 个品牌之一，`references/<brand>.md` 提供 200-500 行的深度叙事版设计系统说明（品牌的色彩哲学、排版规则来源、阴影语言、交互哲学等），适合用户想深入理解品牌视觉语言、做高保真还原、或写设计调研报告时读取：

```
binance, bugatti, clickhouse, cohere, coinbase, composio, elevenlabs, expo,
ferrari, hashicorp, ibm, intercom, kraken, lamborghini, linear-app, lovable,
mastercard, meta, minimax, mintlify, miro, mistral-ai, mongodb, nike, nvidia,
ollama, opencode-ai, pinterest, playstation, posthog, renault, replicate,
resend, revolut, runwayml, sanity, sentry, shopify, spacex, starbucks,
superhuman, tesla, theverge, together-ai, uber, vodafone, voltagent, warp,
webflow, wired, wise, x-ai, zapier
```

完整索引见 `references/README.md`。日常代码生成优先读 `styles/`，深度理解/调研才读 `references/`。

### 第五步：基于风格 tokens 生成代码

按用户实际需求（落地页、登录页、Dashboard 等）输出 shadcn/ui + Tailwind 代码。**严格使用风格文档里的 token 类名**，不要替换或近似。

技术栈选择留给用户/项目实际情况，不要硬塞 Next.js 脚手架。

## 风格库

完整列表可查看 `styles/` 目录（140 个文件，每个对应一个 slug）。下面只列代表性的几个，便于 AI 在打分时锚定：

**知名产品系（用户提到具体公司或产品类型时优先）**
Vercel · Linear · Stripe · Supabase · Spotify · Airbnb · Raycast · Claude · Cursor · Figma · Framer · Apple · Notion · BMW · Cal.com · Clay · Airtable

**视觉语言系（按调性挑选）**
Minimalist Flat · Soft UI · Corporate Clean · Swiss Style · Editorial · Neo-Brutalist · Neo-Brutalist Playful · Brutalist Web · Glassmorphism · Neumorphism · Claymorphism · Skeuomorphism · Dark Mode · Cyberpunk Neon · Modern Gradient

**布局系（结构需求驱动）**
Bento Grid · Card Stack · Dashboard Layout · Split Screen · Masonry Flow

> 历史说明：2026-04-20 下线了 41 个 stub 品牌风格文件（tokens 通用、与品牌特征不符），如需补齐其中某个品牌的真实 tokens，参考 `vercel-style.md` 或 `linear-style.md` 的质量标准重新编写。

## 核心规则

1. **永远先问清需求**——不做假设，确保理解产品类型、用户、调性
2. **提供多个选项**——至少 3 个，最多 5 个，每个都给一句理由
3. **评分透明**——展示三个维度的具体得分
4. **优先 shadcn/ui + Tailwind**——除非用户指定其他技术栈
5. **严格使用风格 tokens**——不要近似替换 class 名
6. **一致的视觉语言**——一个项目里所有组件遵循同一风格

## AI 输出规则

生成代码时：

- 精确使用风格文档里的 Tailwind class，不要发明
- 检查风格的 forbidden 列表，不使用被禁止的样式
- 遵循组件配方的参数化模板，而不是临时拼凑
- 响应式：移动端 / 平板 / 桌面端体验一致
- 可访问性：色彩对比度符合 WCAG 2.1 AA
- 引用风格时给出文件路径（如 `styles/vercel-style.md`），方便用户进一步查看

---

**版本**：2.4.0 · **更新**：2026-04-20 · 140 个精选风格 + 53 个品牌深度参考内置，离线可用 · 兼容 Claude Code / Cursor / Qoder 等 Skills 支持工具
