---
name: glitch-art
version: 1.0.0
description: Glitch Art design style for web interfaces
keywords: [故障, 像素, RGB分离, 扫描线, 数字损坏]
author: StyleKit
style_type: visual
---

# Glitch Art Style

## Overview
数字故障美学风格，通过RGB色彩通道分离、水平位移带、扫描线纹理、VHS追踪错误和数据损坏块，呈现赛博朋克式的视觉冲击和信号腐蚀质感。

## Philosophy
Glitch Art 是一种拥抱数字错误与技术故障的艺术形式，将系统崩溃和数据损坏转化为视觉表达。完美是数字世界的幻觉——我们在断裂的代码、丢失的帧和剧烈失同步的像素中发现美。

## Design Tokens

### Border
- Width: `border`
- Color: `border-[#00ffff]/20`
- Radius: `rounded-none`

### Shadow
- Small: `shadow-[2px_0_#ff00ff,-2px_0_#ffff00]`
- Medium: `shadow-[3px_0_#ff00ff,-3px_0_#ffff00]`
- Large: `shadow-[6px_0_#ff00ff,-6px_0_#ffff00]`
- Hover: `hover:shadow-[6px_0_#ff00ff,-6px_0_#ffff00]`

### Typography
- Heading: `font-mono font-bold uppercase tracking-widest`
- Body: `font-mono`
- Hero: `text-6xl md:text-8xl lg:text-9xl`
- H1: `text-3xl md:text-5xl`
- Body: `text-sm md:text-base`

### Spacing
- Section: `py-12 md:py-20 lg:py-28`
- Container: `px-4 md:px-8 lg:px-12`
- Card: `p-5 md:p-8`

### Colors
- Primary BG: `bg-[#0a0a0a]`
- Secondary BG: `bg-[#111111]`
- Primary Text: `text-[#00ffff]`
- Primary Button: `bg-[#00ffff] text-[#0a0a0a] shadow-[3px_0_#ff00ff,-3px_0_#ffff00]`

## Component Recipes

### Button
- Base: `font-mono font-bold uppercase tracking-widest rounded-none border border-[#00ffff]/30 transition-all duration-100 ease-in-out relative overflow-hidden`
- Primary: `bg-[#00ffff] text-[#0a0a0a] shadow-[3px_0_#ff00ff,-3px_0_#ffff00]`
- Secondary: `bg-[#0a0a0a] text-[#00ffff] border-[#00ffff]/50 shadow-[3px_0_#ff00ff,-3px_0_#ffff00]`
- Magenta: `bg-[#ff00ff] text-white border-[#ff00ff]/30 shadow-[3px_0_#00ffff,-3px_0_#ffff00]`
- Outline: `bg-transparent text-[#ffff00] border border-[#ffff00]/50 shadow-[2px_0_#ff00ff,-2px_0_#00ffff]`

- Hover: `hover:shadow-[6px_0_#ff00ff,-6px_0_#ffff00]`

### Card
- Base: `bg-[#0a0a0a] rounded-none border-l-2 border-[#00ffff]/40 transition-all duration-100 ease-in-out relative overflow-hidden`
- Default: ``
- Cyan: `border-l-[#00ffff]/40`
- Magenta: `border-l-[#ff00ff]/40`
- Yellow: `border-l-[#ffff00]/40`

- Hover: `hover:bg-[#00ffff]/[0.02]`

### Input
- Base: `w-full rounded-none border border-[#00ffff]/30 bg-[#0a0a0a] text-[#00ffff] placeholder:text-[#00ffff]/20 font-mono focus:outline-none transition-all duration-100 ease-in-out`
- Default: ``
- Magenta: `border-[#ff00ff]/30 text-[#ff00ff] placeholder:text-[#ff00ff]/20`

### Corrupted Image
- Base: `relative bg-[#0a0a0a] rounded-none border border-[#00ffff]/20 overflow-hidden shadow-[3px_0_#ff00ff20,-3px_0_#ffff0020]`
- Default: ``
- Heavy: `shadow-[6px_0_#ff00ff40,-6px_0_#ffff0040,0_3px_#00ffff30]`
- Subtle: `shadow-[1px_0_#ff00ff10,-1px_0_#ffff0010]`

### Static Noise
- Base: `relative bg-[#0a0a0a] rounded-none p-6 overflow-hidden bg-[repeating-linear-gradient(0deg,transparent,transparent_1px,rgba(255,255,255,0.02)_1px,rgba(255,255,255,0.02)_2px)]`
- Default: ``
- Dense: `bg-[repeating-linear-gradient(0deg,transparent,transparent_1px,rgba(255,255,255,0.04)_1px,rgba(255,255,255,0.04)_2px),repeating-linear-gradient(90deg,transparent,transparent_2px,rgba(0,255,255,0.02)_2px,rgba(0,255,255,0.02)_4px)]`
- Sparse: `bg-[repeating-linear-gradient(0deg,transparent,transparent_4px,rgba(255,255,255,0.01)_4px,rgba(255,255,255,0.01)_8px)]`

### Glitch Text
- Base: `relative font-mono font-bold uppercase tracking-widest`
- Cyan: `text-[#00ffff] drop-shadow-[2px_0_#ff00ff] drop-shadow-[-2px_0_#ffff00]`
- Magenta: `text-[#ff00ff] drop-shadow-[2px_0_#00ffff] drop-shadow-[-2px_0_#ffff00]`
- Yellow: `text-[#ffff00] drop-shadow-[2px_0_#ff00ff] drop-shadow-[-2px_0_#00ffff]`

### Broken Grid
- Base: `relative bg-[#0a0a0a] rounded-none border border-[#ffffff]/10 overflow-hidden`
- Default: ``
- Shifted: `translate-x-[2px] border-l-2 border-l-[#ff00ff]/30`
- Fragmented: `border-[#00ffff]/20 shadow-[inset_0_50%_0_0_rgba(255,0,255,0.03)]`

### Signal Meter
- Base: `inline-flex items-end gap-1 h-6`
- Default: `[&>.bar]:bg-[#00ffff]`
- Weak: `[&>.bar]:bg-[#ff00ff]`
- Strong: `[&>.bar]:bg-[#ffff00]`

## Forbidden Patterns
These classes must NEVER be used in Glitch Art style:

- `rounded-lg`
- `rounded-xl`
- `rounded-2xl`
- `rounded-full`
- `shadow-sm`
- `shadow-md`
- `shadow-lg`
- `shadow-xl`
- `font-serif`
- `font-sans`

- Pattern: `^rounded-(?:lg|xl|2xl|full)$`
- Pattern: `^shadow-(?:sm|md|lg|xl)$`
- Pattern: `^font-(?:serif|sans)$`
- Pattern: `^bg-(?:pink|rose)-`
- Pattern: `^text-(?:green|brown|amber)-`

### Why:
- `rounded-lg`: Glitch Art uses sharp edges (rounded-none only) for digital corruption aesthetic
- `shadow-sm`: Glitch Art uses RGB split shadows only, not soft box shadows
- `font-serif`: Glitch Art uses monospace fonts exclusively for terminal aesthetic

## Do's
- 全局使用等宽字体 font-mono，标题加粗 font-black + 全大写 uppercase + 宽字距 tracking-widest
- 用 Tailwind 任意值 text-shadow 模拟 RGB 色彩分离，如 [text-shadow:3px_0_#ff00ff,-3px_0_#00ffff]
- 所有状态切换使用 transition-none，营造帧丢失的断裂感
- 卡片使用粗左边框（border-l-4 ~ border-l-8）标记，hover 时切换边框颜色
- 按钮 :active 状态使用 skew-x + scale-y 组合制造屏幕撕裂效果
- 背景叠加扫描线纹理覆盖层（repeating-linear-gradient 间隔 2-4px）
- hover 时执行前景/背景色快速反转 + RGB 偏移放大至 6px 级别

## Don'ts
- 禁止任何圆角——所有元素必须 rounded-none，棱角分明
- 禁止平滑过渡动画（duration-300、ease-in-out 等），动画应像丢帧一样突变
- 禁止使用毛玻璃效果（backdrop-blur）或柔和渐变背景
- 禁止使用 CMY 三色以外的装饰色（粉色、自然色系、暖色调等）
- 禁止使用衬线或无衬线字体——只允许 monospace 等宽字体

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
- Style: glitch-art
- Archetype: landing-hero-centered
- Sections: hero, features, cta, footer
- Components: heading (hero variant), button (primary, lg), card (default)
```

### Example Prompts:
- "故障艺术着陆页"
- "SaaS 着陆页"
- "作品集展示"

---
Generated by StyleKit · https://stylekit.dev
Style: 故障艺术风 (Glitch Art)