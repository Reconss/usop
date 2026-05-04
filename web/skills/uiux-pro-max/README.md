# Design Kungfu Skill 🥋

智能设计推荐 Skill —— 从 140 个精选设计风格中匹配最佳方案，离线可用。

## 特性

- **完全离线** · 140 个风格 + 映射表全部内置
- **智能匹配** · 3 维评分（产品类型 40% + 品牌调性 35% + 受众 25%）
- **可直接落地** · 每个风格提供精确的 Tailwind class tokens、组件配方、禁用模式
- **shadcn/ui 友好** · 默认产出 shadcn/ui + Tailwind CSS 代码

## 包内容

```
design-kungfu/
├── SKILL.md         # AI 代理运行时加载的主文件（Anthropic Skills 格式）
├── database.yaml    # 产品类型 / 品牌调性 / 受众 → 风格映射
├── styles/          # 140 个风格的设计系统文档
├── EXAMPLES.md      # 端到端对话示例
├── install.sh       # 安装脚本
└── README.md        # 本文件
```

## 安装

本 skill 遵循 [Anthropic Skills](https://docs.claude.com) 约定（frontmatter + markdown + 相对路径），可用于任何支持 Skills 格式的 AI 开发工具。安装方式 = 把整个 `design-kungfu/` 目录放到对应工具的 skills 路径下。

**Claude Code（一键脚本）**

```bash
./install.sh
```

脚本会把目录复制到 `~/.agents/skills/design-kungfu` 并在 `~/.claude/skills/` 建软链。

**Cursor / Qoder / 其它工具（手动）**

把整个 `design-kungfu/` 目录拷贝到对应工具的 skills / rules 目录。各工具的具体路径：

| 工具 | 目标路径（参考） |
|---|---|
| Claude Code | `~/.claude/skills/design-kungfu/` |
| Cursor | `.cursor/rules/design-kungfu/`（项目级）或参考 Cursor 文档 |
| Qoder 等 | 查看工具文档中的 skills / agent rules 路径约定 |

**项目级使用（任意工具）**

直接把 skill 目录作为 `<project>/design-kungfu/` 放到项目根，在项目规则/上下文中引用它即可。

## 使用示例

```
用户: 帮我设计一个 SaaS 项目管理工具的落地页

AI: 🔍 让我了解一下你的项目：
    1. 目标用户：企业 / 消费者 / 开发者 / 创意人士？
    2. 品牌调性：专业 / 活泼 / 奢华 / 极简 / 大胆？

用户: 企业用户 / 专业

AI: 🥋 Top 推荐
    1. Linear Style        93/100  项目管理行业标杆
    2. Vercel Style        89/100  开发者平台、极简
    3. Minimalist Flat     84/100  通用底盘

用户: 用 Linear Style

[AI 读取 styles/linear-style.md，产出完整的落地页代码]
```

完整对话示例见 [EXAMPLES.md](./EXAMPLES.md)。

## 风格库一览

140 个风格分布在这些系列里：

- **知名产品系**：Vercel、Linear、Stripe、Supabase、Spotify、Airbnb、Raycast、Claude、Cursor、Figma、Framer、Apple、Notion、BMW、Cal、Clay、Airtable
- **视觉语言系**：Minimalist Flat、Soft UI、Corporate Clean、Swiss、Editorial、Neo-Brutalist、Glassmorphism、Neumorphism、Claymorphism、Dark Mode、Cyberpunk Neon、Modern Gradient
- **布局系**：Bento Grid、Card Stack、Dashboard Layout、Split Screen、Masonry Flow
- **设计运动系**：Bauhaus、Art Deco、Art Nouveau、Memphis、Swiss Grid、Constructivism 等

完整清单：`ls styles/`

## 产品类型 → 推荐风格

| 产品类型 | 首选 | 备选 |
|---|---|---|
| SaaS | Minimalist Flat、Vercel、Linear | Soft UI、Corporate Clean、Bento Grid |
| 开发者工具 | Vercel、Supabase、Cursor | Raycast、Dark Mode、Neo-Brutalist |
| 支付/金融 | Stripe、Corporate Clean | Glassmorphism、Minimalist Flat |
| 电商 | Airbnb、Corporate Clean | Apple、Soft UI、Card Stack |
| 音乐/媒体 | Spotify | Dark Mode、Glassmorphism、Modern Gradient |
| AI/ML | Claude、Cursor | Glassmorphism、Dark Mode |
| 设计工具 | Figma、Framer | Glassmorphism、Neo-Brutalist、Clay |
| 效率工具 | Linear、Notion、Raycast | Minimalist Flat、Soft UI、Cal |
| Web3 | Dark Mode、Cyberpunk Neon | Glassmorphism、Neo-Brutalist |

完整映射见 `database.yaml`。

## 数据源

- [StyleKit](https://www.stylekit.top/zh) · [GitHub (AnxForever/stylekit)](https://github.com/AnxForever/stylekit)

## 更新日志

**v2.2.0 · 2026-04-20**
- SKILL.md 瘦身 375 → ~120 行
- `database.js` → `database.yaml`
- 评分维度修正：5 维（含 2 维无数据源）→ 3 维（40/35/25，全部有数据支撑）

**v2.1.0 · 2026-04-20**
- 下线 41 个 stub 品牌风格（tokens 与品牌无关）
- 清理 database 里 38 个死引用
- 重写 frontmatter description（第三人称 + 做什么 + 何时用）

**v1.0.0 · 2026-04-03**
- 首次发布独立离线版
