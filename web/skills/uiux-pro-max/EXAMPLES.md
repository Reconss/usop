# Design Kungfu Skill 使用示例

## 示例 1: SaaS 产品设计

```
用户: 我要做一个 SaaS 项目管理工具，帮我推荐设计风格

AI: 🔍 让我了解一下你的项目：

1. 产品类型：SaaS
2. 目标用户：企业用户 / 消费者 / 开发者 / 创意人士？
3. 品牌调性：专业 / 活泼 / 奢华 / 极简 / 大胆？
4. 主要设备：桌面端 / 移动端 / 全平台？
5. 特殊要求：无障碍优先 / 深色模式 / 性能优先？

用户: 企业用户，专业，桌面端，性能优先

AI: ┌─────────────────────────────────────────────────────────────┐
    │  🥋 DESIGN KUNGFU 设计推荐                                  │
    ├─────────────────────────────────────────────────────────────┤
    │  🏆 最佳匹配                                                │
    │  Style: Minimalist Flat                                     │
    │  匹配度: 94/100                                              │
    │  理由: 极简风格与 SaaS 产品高度契合，清爽专业                │
    │                                                             │
    │  📊 完整评分                                                │
    │  • 产品类型: ★★★★★ (40/40)                                 │
    │  • 品牌调性: ★★★★★ (33/35)                                 │
    │  • 目标受众: ★★★★★ (21/25)                                 │
    └─────────────────────────────────────────────────────────────┘

    🔄 其他推荐:
    2. Corporate Clean        88/100  企业级专业选择
    3. Bento Grid             85/100  现代卡片布局
    4. Apple Style            81/100  优雅高端

用户: 就用 Minimalist Flat

AI: 完美！让我为你准备 Minimalist Flat 的设计系统...

[AI 读取 styles/minimalist-flat.md 并提供完整的实现指南]
```

## 示例 2: 电商应用设计

```
用户: 帮我设计一个电商网站

AI: 🔍 让我了解一下你的项目：

1. 产品类型：电商
2. 目标用户：消费者
3. 品牌调性：专业 / 活泼 / 奢华 / 极简 / 大胆？
4. 主要设备：全平台
5. 特殊要求：？

用户: 活泼，全平台

AI: ┌─────────────────────────────────────────────────────────────┐
    │  🥋 DESIGN KUNGFU 设计推荐                                  │
    ├─────────────────────────────────────────────────────────────┤
    │  🏆 最佳匹配                                                │
    │  Style: Soft UI                                             │
    │  匹配度: 89/100                                              │
    │  理由: 柔和风格友好亲和，适合电商的视觉呈现                  │
    └─────────────────────────────────────────────────────────────┘

    🔄 其他推荐:
    2. Bento Grid             86/100  现代卡片布局
    3. Apple Style            82/100  优雅高端
    4. Minimalist Flat        79/100  简洁专业

用户: Soft UI

AI: 好选择！Soft UI 非常适合电商平台...

[AI 读取 styles/soft-ui.md 并生成设计规范]
```

## 示例 3: 开发者工具设计

```
用户: 我要做一个开发者工具，类似 IDE

AI: 🔍 让我了解一下你的项目：

1. 产品类型：开发者工具
2. 目标用户：开发者
3. 品牌调性：极简 / 专业？
4. 主要设备：桌面端
5. 特殊要求：深色模式？

用户: 极简，深色模式

AI: ┌─────────────────────────────────────────────────────────────┐
    │  🥋 DESIGN KUNGFU 设计推荐                                  │
    ├─────────────────────────────────────────────────────────────┤
    │  🏆 最佳匹配                                                │
    │  Style: Dark Mode                                           │
    │  匹配度: 92/100                                              │
    │  理由: 深色模式是开发者工具的首选，减少眼睛疲劳              │
    └─────────────────────────────────────────────────────────────┘

    🔄 其他推荐:
    2. Minimalist Flat        87/100  简洁专业
    3. Neo-Brutalist          83/100  大胆对比

用户: Dark Mode

AI: 完美！Dark Mode 是开发者工具的理想选择...

[AI 读取 styles/dark-mode.md 并提供实现方案]
```

## 示例 4: 快速推荐（跳过详细分析）

```
用户: 给我推荐一个适合 AI 产品的设计风格

AI: ┌─────────────────────────────────────────────────────────────┐
    │  🥋 DESIGN KUNGFU 设计推荐                                  │
    ├─────────────────────────────────────────────────────────────┤
    │  🏆 最佳匹配                                                │
    │  Style: Glassmorphism                                       │
    │  匹配度: 91/100                                              │
    │  理由: 玻璃拟态传达未来感和科技感，非常适合 AI 产品          │
    └─────────────────────────────────────────────────────────────┘

    🔄 其他推荐:
    2. Dark Mode              87/100  深色科技感
    3. Cursor Style           83/100  AI 编辑器深色
    4. Cyberpunk Neon         79/100  赛博朋克风格

需要我提供 Glassmorphism 的完整设计系统吗？
```

## 示例 5: 比较多个风格

```
用户: Minimalist Flat 和 Apple Style 有什么区别？

AI: 好问题！让我对比这两个风格：

┌─────────────────────────────────────────────────────────────┐
│  Minimalist Flat vs Apple Style                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Minimalist Flat                                            │
│  • 直角设计，无圆角                                          │
│  • 粗黑边框 (border-2 border-black)                         │
│  • 纯色背景，无渐变                                          │
│  • 悬停时颜色反转                                            │
│  • 高对比度，黑白为主                                        │
│                                                             │
│  Apple Style                                                │
│  • 大圆角 (rounded-2xl/rounded-full)                        │
│  • 微妙边框或无边框                                          │
│  • 白底微阴影                                                │
│  • 悬停时缩放 + 透明度变化                                   │
│  • 柔和配色，Apple 蓝 #0071e3                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘

选择建议：
• 如果追求极简和性能 → Minimalist Flat
• 如果追求精致和质感 → Apple Style
```

## 示例 6: 直接实现

```
用户: 用 Neo-Brutalist 风格创建一个登录页面

AI: 好的！让我先读取 Neo-Brutalist 的设计规范...

[读取 styles/neo-brutalist.md]

现在为你创建登录页面：

```html
<!-- Neo-Brutalist 登录页面 -->
<div class="min-h-screen bg-white p-8">
  <div class="max-w-md mx-auto">
    <!-- 卡片 -->
    <div class="border-4 border-black p-8 shadow-[8px_8px_0_0_#000]">
      <h1 class="text-3xl font-bold mb-8">登录</h1>

      <!-- 输入框 -->
      <input
        type="email"
        placeholder="邮箱"
        class="w-full border-2 border-black px-4 py-3 mb-4
               focus:shadow-[4px_4px_0_0_#000] focus:translate-x-[-2px]
               focus:translate-y-[-2px] transition-all"
      />

      <input
        type="password"
        placeholder="密码"
        class="w-full border-2 border-black px-4 py-3 mb-6
               focus:shadow-[4px_4px_0_0_#000] focus:translate-x-[-2px]
               focus:translate-y-[-2px] transition-all"
      />

      <!-- 按钮 -->
      <button
        class="w-full bg-yellow-400 border-2 border-black px-6 py-3
               font-bold hover:bg-yellow-300 hover:translate-x-[-2px]
               hover:translate-y-[-2px] hover:shadow-[4px_4px_0_0_#000]
               transition-all"
      >
        登录
      </button>
    </div>
  </div>
</div>
```

这个设计使用了 Neo-Brutalist 的核心特征：
✅ 粗黑边框 (border-2/4 border-black)
✅ 硬阴影效果 (shadow-[8px_8px_0_0_#000])
✅ 悬停位移效果
✅ 高对比度配色
✅ 直角设计
```
