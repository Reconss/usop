---
name: memphis
version: 1.0.0
description: Memphis design style for web interfaces
keywords: [孟菲斯, 几何, 撞色, 80年代, 波普]
author: StyleKit
style_type: visual
---

# Memphis Style

## Overview
80年代意大利设计运动，大胆的几何图形、鲜艳的撞色、不规则形状和有趣的图案，打破传统设计规则。

## Philosophy
Memphis（孟菲斯）是1980年代由意大利设计师 Ettore Sottsass 创立的设计运动，以打破传统、拥抱混乱和趣味性著称。

## Design Tokens

### Border
- Width: `border-4`
- Color: `border-black`
- Radius: `rounded-none`

### Shadow
- Small: `shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] md:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]`
- Medium: `shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] md:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]`
- Large: `shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] md:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]`
- Hover: `hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]`

### Typography
- Heading: `font-black tracking-tight`
- Body: `font-sans`
- Hero: `text-5xl md:text-7xl lg:text-9xl`
- H1: `text-4xl md:text-6xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-24 lg:py-32`
- Container: `px-4 md:px-8 lg:px-16`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#fef9ef]`
- Secondary BG: `bg-black`
- Primary Text: `text-black`
- Primary Button: `bg-[#ff6b6b] text-black`

## Component Recipes

### Button
- Base: `font-black uppercase border-4 border-black transition-all duration-150`
- Primary: `bg-yellow-400 text-black shadow-[6px_6px_0px_#000]`
- Secondary: `bg-[#ff6b6b] text-white shadow-[6px_6px_0px_#000]`
- Outline: `bg-white text-black shadow-[6px_6px_0px_#48dbfb]`

- Hover: `hover:shadow-[3px_3px_0px_#000] hover:translate-x-[3px] hover:translate-y-[3px]`

### Card
- Base: `border-4 border-black relative transition-all duration-200`
- Default: `bg-pink-300 shadow-[8px_8px_0px_#000]`
- Yellow: `bg-yellow-300 shadow-[8px_8px_0px_#000]`
- Cyan: `bg-[#48dbfb] shadow-[8px_8px_0px_#000]`

- Hover: `hover:shadow-[10px_10px_0px_#000]`

### Input
- Base: `w-full bg-white border-4 border-black text-black font-bold placeholder:text-gray-400 focus:outline-none transition-all duration-200`
- Default: `shadow-[4px_4px_0px_#48dbfb]`
- Red Shadow: `shadow-[4px_4px_0px_#ff6b6b]`

### Squiggle Divider
- Base: `w-full h-3 bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2240%22%20height%3D%2212%22%3E%3Cpath%20d%3D%22M0%206c5%200%205-6%2010-6s5%206%2010%206%205-6%2010-6%205%206%2010%206%22%20fill%3D%22none%22%20stroke%3D%22%23000%22%20stroke-width%3D%223%22%2F%3E%3C%2Fsvg%3E')] bg-repeat-x bg-center my-4 md:my-6`
- Default: ``
- Colorful: `bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2240%22%20height%3D%2212%22%3E%3Cpath%20d%3D%22M0%206c5%200%205-6%2010-6s5%206%2010%206%205-6%2010-6%205%206%2010%206%22%20fill%3D%22none%22%20stroke%3D%22%23ff6b6b%22%20stroke-width%3D%223%22%2F%3E%3C%2Fsvg%3E')] shadow-[0_4px_0px_#48dbfb]`
- Bold: `h-4 bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2240%22%20height%3D%2212%22%3E%3Cpath%20d%3D%22M0%206c5%200%205-6%2010-6s5%206%2010%206%205-6%2010-6%205%206%2010%206%22%20fill%3D%22none%22%20stroke%3D%22%23000%22%20stroke-width%3D%225%22%2F%3E%3C%2Fsvg%3E')] shadow-[0_4px_0px_#ffd700]`

### Shape Card
- Base: `border-4 border-black relative overflow-visible transition-all duration-200 before:content-[''] before:absolute before:top-[-12px] before:right-[-12px] before:w-10 before:h-10 before:bg-[#48dbfb] before:rounded-full before:border-4 before:border-black before:z-10 after:content-[''] after:absolute after:bottom-[-8px] after:left-4 after:w-0 after:h-0 after:border-l-[16px] after:border-l-transparent after:border-r-[16px] after:border-r-transparent after:border-t-[20px] after:border-t-[#ff6b6b] after:z-10`
- Default: `bg-white shadow-[8px_8px_0px_#000]`
- Pastel: `bg-pink-100 shadow-[8px_8px_0px_#48dbfb] before:bg-pink-300 after:border-t-yellow-400`
- Bold: `bg-yellow-300 shadow-[8px_8px_0px_#ff6b6b] before:bg-[#ff6b6b] after:border-t-[#48dbfb]`

- Hover: `hover:shadow-[10px_10px_0px_#000] hover:-translate-y-1`

### Pattern Badge
- Base: `inline-flex items-center justify-center font-black uppercase border-4 border-black transition-all duration-150`
- Dots: `bg-[radial-gradient(circle,#000_1.5px,transparent_1.5px)] bg-[size:8px_8px] bg-yellow-400 text-black shadow-[4px_4px_0px_#000]`
- Stripes: `bg-[repeating-linear-gradient(45deg,#ff6b6b,#ff6b6b_4px,#ff8e8e_4px,#ff8e8e_8px)] text-white shadow-[4px_4px_0px_#000]`
- Zigzag: `bg-[repeating-linear-gradient(135deg,#48dbfb,#48dbfb_5px,#7ae7ff_5px,#7ae7ff_10px)] text-black shadow-[4px_4px_0px_#000]`

- Hover: `hover:shadow-[2px_2px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px]`

## Forbidden Patterns
These classes must NEVER be used in Memphis style:

- `border`
- `border-[0.5px]`
- `border-gray-200`
- `border-gray-300`
- `border-slate-200`
- `bg-gray-50`
- `bg-gray-100`
- `bg-slate-50`
- `text-gray-400`
- `text-gray-500`

- Pattern: `^border-(?:gray|slate)-`
- Pattern: `^shadow-(?!\[|none)`
- Pattern: `^bg-(?:gray|slate)-(?:[1-3])`
- Pattern: `^text-(?:gray|slate)-(?:[3-5])`

### Why:
- `border-gray-200`: Memphis uses thick black borders (border-4 border-black), not subtle grays
- `shadow-md`: Memphis uses hard-edge offset shadows, not blurred shadows
- `bg-gray-50`: Memphis uses bold vivid colors (coral, yellow, teal), not muted grays

## Do's
- 使用鲜艳的撞色组合
- 添加几何图形装饰（圆、三角、波浪）
- 使用粗边框 border-4
- 不规则的布局和形状
- 添加点状、条纹、波浪图案
- 使用粗体无衬线字体
- 卡片使用 group 类，内部几何装饰在 hover 时各自向不同方向位移或旋转（Playful Chaos，游乐场活泼感）
- 标题和文字在 group-hover 时可瞬间切换高饱和撞色（Pop Swap，波普色彩反转），使用 transition-colors duration-150
- 所有动画使用 duration-150 ease-out，保持波普玩具的干脆感
- 按钮 hover 时换色并增大阴影：hover:bg-pink-400 hover:shadow-[8px_8px_0px_#000]（撞色波普强化）

## Don'ts
- 禁止使用单调的配色
- 禁止过于对称规整的布局
- 禁止使用细边框
- 禁止省略几何装饰元素
- 禁止几何装饰在 hover 时保持静止（失去孟菲斯游乐场的灵魂）
- 禁止按钮 hover 使用位移减小阴影（应是增大阴影 + 换色，而非向阴影方向移动）

## Layout Archetypes
- `landing-hero-centered`: Centered headline, subtitle, and CTA. Clean and focused.
- `landing-hero-split`: Text on left, image/visual on right. Great for product showcases.
- `landing-hero-fullscreen`: Full viewport hero with background image or color. High impact.
- `landing-video-hero`: Full-screen video background with overlay text. High impact for product demos.
- `landing-saas-pricing`: Complete SaaS pricing page with hero, pricing tiers, FAQ, and CTA.
- `landing-waitlist`: Minimal pre-launch page with email collection and countdown.

## Example Usage

```
Generate a landing page with:
- Style: memphis
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "创意工作室官网"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 孟菲斯风格 (Memphis)