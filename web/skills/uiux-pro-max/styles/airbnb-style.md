---
name: airbnb-style
version: 1.0.0
description: Airbnb Inspired Design System - Travel marketplace. Warm coral accent, photography-driven, rounded UI.
keywords: [Airbnb, 旅行, 市场, 珊瑚色, 摄影, 圆润]
author: Design Kungfu
style_type: visual
---

# Airbnb Style

## Overview
Airbnb 风格以旅行市场为核心，通过温暖的珊瑚色强调、摄影驱动的设计和圆润的 UI，打造友好亲和的旅行体验。适合旅行市场、摄影驱动布局和温暖珊瑚色强调 UI。

## Philosophy
Airbnb Style 是一种源于 Airbnb 的温暖友好设计风格，以其标志性的珊瑚色和摄影优先的界面著称。通过高质量的图片展示、圆润的组件和友好的视觉语言，传达旅行的温暖和归属感。

## Design Tokens

### Border
- Width: `border`
- Color: `border-gray-200`
- Radius: `rounded-xl`

### Shadow
- Small: `shadow-sm`
- Medium: `shadow-md`
- Large: `shadow-lg`
- Hover: `hover:shadow-lg`

### Typography
- Heading: `font-semibold text-gray-900`
- Body: `text-gray-600`
- Hero: `text-4xl md:text-6xl font-bold`
- H1: `text-3xl md:text-4xl font-semibold`
- Body: `text-base text-gray-600`
- Font Family: Cereal, Circular, -apple-system, BlinkMacSystemFont, Roboto, sans-serif

### Spacing
- Section: `py-12 md:py-16`
- Container: `px-4 md:px-6 max-w-7xl mx-auto`
- Card: `p-0` (image-focused)
- Grid Gap: `gap-4 md:gap-6`

### Colors
- Primary BG: `bg-white`
- Secondary BG: `bg-gray-50`
- Primary Text: `text-gray-900`
- Secondary Text: `text-gray-600`
- Muted Text: `text-gray-500`
- Accent: `text-[#ff5a5f]` / `#ff5a5f`
- Accent Hover: `hover:text-[#e00007]`
- Border: `border-gray-200`

## Component Recipes

### Button
- Base: `font-semibold rounded-lg transition-all duration-200 inline-flex items-center justify-center gap-2`
- Primary: `bg-gradient-to-r from-[#e61e4d] to-[#d70466] text-white hover:from-[#d70466] hover:to-[#bd1e59]`
- Secondary: `bg-white text-gray-900 border border-gray-300 hover:border-gray-400`
- Ghost: `bg-transparent text-gray-900 hover:bg-gray-100`
- Text: `bg-transparent text-gray-900 underline hover:text-gray-600`

- Hover: `hover:scale-[1.02]`
- Size SM: `h-8 px-4 text-sm`
- Size MD: `h-10 px-6`
- Size LG: `h-12 px-8 text-lg`

### Card
- Base: `bg-white rounded-xl overflow-hidden transition-all duration-200 cursor-pointer group`
- Default: ``
- Image: `aspect-square object-cover w-full`
- Content: `p-3`
- Hover: `group-hover:shadow-lg`

### Input
- Base: `w-full bg-white rounded-full border border-gray-300 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-500 transition-all duration-200 h-12 px-4`
- Search: `bg-white shadow-md border-0 h-14 px-6 text-lg rounded-full`

### Heading
- Base: `font-semibold text-gray-900`
- Default: `text-gray-900`
- Muted: `text-gray-500`
- Accent: `text-[#ff5a5f]`

### Badge
- Base: `inline-flex items-center font-medium text-xs rounded px-2 py-1`
- Default: `bg-gray-100 text-gray-700`
- Superhost: `bg-gradient-to-r from-[#e61e4d] to-[#d70466] text-white`
- New: `bg-[#ff5a5f] text-white`

### Navigation
- Base: `bg-white border-b border-gray-200 px-4 md:px-6 py-4`
- Search Bar: `bg-white shadow-md rounded-full border border-gray-200 flex items-center p-2 max-w-2xl mx-auto`

### Category Pills
- Base: `flex items-center gap-2 px-4 py-2 rounded-full border border-gray-300 hover:border-gray-400 hover:bg-gray-50 cursor-pointer transition-all duration-200`
- Active: `bg-gray-900 text-white border-gray-900`

## Forbidden Patterns
These classes must NEVER be used in Airbnb Style style:

- `bg-gradient-to-r from-blue`
- `bg-gradient-to-br from-purple`
- `rounded-2xl` (for cards, use rounded-xl)
- `shadow-2xl`
- `border-2`
- `text-blue-500`

- Pattern: `^bg-gradient.*from-(?:blue|purple|green)`
- Pattern: `^text-(?:blue|purple|green)-500`
- Pattern: `^border-2`

### Why:
- `bg-gradient-to-r from-blue`: Airbnb style uses coral/rose gradients
- `text-blue-500`: Airbnb style uses coral/rose as accent color
- `rounded-2xl`: Airbnb style uses rounded-xl for consistency

## Do's
- 使用珊瑚色 #ff5a5f 作为强调色
- 使用高质量的摄影作品作为视觉焦点
- 使用圆润的组件 rounded-xl
- 使用温暖的配色方案
- 使用清晰的卡片布局展示列表项
- 使用搜索栏作为核心交互元素
- 使用分类标签 pills 进行筛选
- 使用友好的视觉语言

## Don'ts
- 禁止使用冷色调（蓝色、紫色）作为主色
- 禁止使用过大的圆角
- 禁止忽略图片质量
- 禁止使用过重的阴影
- 禁止使用尖锐的边角
- 禁止忽略移动端体验

## Layout Archetypes
- `listing-grid`: Grid layout for property/experience listings with images.
- `listing-detail`: Detailed view with large image gallery and booking info.
- `search-results`: Search results with filters and map.
- `landing-hero-centered`: Centered headline with search bar.
- `category-browse`: Browse by categories with horizontal scrolling.

## Example Usage

```
Generate a landing page with:
- Style: airbnb-style
- Archetype: listing-grid
- Sections: search-bar, categories, featured-listings, experiences
- Components: card (listing), button (primary), search-input, category-pill
```

### Example Prompts:
- "旅行预订平台"
- "房屋租赁网站"
- "体验市场"
- "摄影驱动的产品页"

---
Design System inspired by Airbnb · Integrated into Design Kungfu
Style: Airbnb 风格 (Airbnb Style)
