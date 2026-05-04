---
name: cal-style
version: 1.0.0
description: Cal.com Inspired Design System - Open-source scheduling. Clean neutral UI, developer-oriented simplicity.
keywords: [Cal.com, 日程, 开源, 中性, 开发者, 简洁]
author: Design Kungfu
style_type: visual
---

# Cal.com Style

## Overview
Cal.com 风格以开源日程安排为核心，通过干净中性的 UI 和面向开发者的简洁设计，打造高效的日程管理体验。适合日程工具、单色设计和开源 SaaS。

## Philosophy
Cal.com Style 是一种源于 Cal.com 的开源优先设计风格，以其干净中性的界面和开发者友好的设计著称。通过简洁的布局、清晰的层次和专业的视觉语言，传达开源精神和效率。

## Design Tokens

### Border
- Width: `border`
- Color: `border-gray-200`
- Radius: `rounded-md`

### Shadow
- Small: `shadow-sm`
- Medium: `shadow-md`
- Hover: `hover:shadow-md`

### Typography
- Heading: `font-semibold text-gray-900`
- Body: `text-gray-600`
- Font Family: Inter, system-ui, sans-serif

### Spacing
- Section: `py-16 md:py-24`
- Container: `px-6 md:px-8 max-w-6xl mx-auto`

### Colors
- Primary: `bg-gray-900` / `text-white`
- Secondary: `bg-white` / `text-gray-900`
- Accent: `bg-orange-500` / `text-orange-600`
- Background: `bg-white`
- Surface: `bg-gray-50`
- Text: `text-gray-900`
- Muted: `text-gray-500`

## Component Recipes

### Button
- Primary: `bg-gray-900 text-white hover:bg-gray-800 font-medium rounded-md`
- Secondary: `bg-white text-gray-900 border border-gray-300 hover:bg-gray-50`
- Accent: `bg-orange-500 text-white hover:bg-orange-600`

### Card
- Base: `bg-white rounded-lg border border-gray-200`
- Hover: `hover:border-gray-300`

### Input
- Base: `w-full bg-white rounded-md border border-gray-300 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/20`

### Calendar
- Base: `bg-white rounded-lg border border-gray-200`
- Selected: `bg-gray-900 text-white`
- Today: `border border-orange-500`

## Forbidden Patterns
- `bg-gradient-to-r`
- `rounded-3xl`
- `shadow-2xl`
- `text-purple-500`

## Do's
- 使用中性配色，橙色作为强调色
- 使用清晰的日程网格布局
- 使用简洁的图标和按钮
- 使用充足的留白

## Don'ts
- 禁止过度使用颜色
- 禁止忽略时间/日期的重要性
- 禁止使用过小的点击区域

## Layout Archetypes
- `scheduling-calendar`: 日程日历视图
- `booking-flow`: 预订流程向导
- `availability-grid`: 可用时间网格

---
Design System inspired by Cal.com · Integrated into Design Kungfu
