---
name: airtable-style
version: 1.0.0
description: Airtable Inspired Design System - Spreadsheet-database hybrid. Colorful, friendly, structured data aesthetic.
keywords: [Airtable, 数据库, 表格, 多彩, 友好, 结构化]
author: Design Kungfu
style_type: visual
---

# Airtable Style

## Overview
Airtable 风格以电子表格-数据库混合为核心，通过多彩友好的设计和结构化的数据美学，打造直观的数据管理体验。适合数据管理工具、多彩 SaaS 设计和结构化数据 UI。

## Philosophy
Airtable Style 是一种源于 Airtable 的数据优先设计风格，以其多彩友好的界面和结构化的数据展示著称。通过丰富的色彩、清晰的层次和友好的交互，传达数据的力量和易用性。

## Design Tokens

### Border
- Width: `border`
- Color: `border-gray-200`
- Radius: `rounded-lg`

### Shadow
- Small: `shadow-sm`
- Medium: `shadow-md`
- Large: `shadow-lg`
- Hover: `hover:shadow-md`

### Typography
- Heading: `font-semibold text-gray-900`
- Body: `text-gray-600`
- Font Family: Inter, system-ui, sans-serif

### Spacing
- Section: `py-16 md:py-24`
- Container: `px-6 md:px-8 max-w-7xl mx-auto`
- Card: `p-6`

### Colors
- Primary: `bg-yellow-400` / `text-yellow-600`
- Secondary: `bg-purple-500` / `text-purple-600`
- Accent: `bg-teal-400` / `text-teal-600`
- Background: `bg-white`
- Surface: `bg-gray-50`
- Text: `text-gray-900`
- Muted: `text-gray-500`

## Component Recipes

### Button
- Primary: `bg-yellow-400 text-gray-900 hover:bg-yellow-500 font-medium rounded-lg`
- Secondary: `bg-white text-gray-700 border border-gray-300 hover:bg-gray-50`
- Ghost: `bg-transparent text-gray-600 hover:bg-gray-100`

### Card
- Base: `bg-white rounded-xl border border-gray-200`
- Hover: `hover:border-gray-300 hover:shadow-md`

### Input
- Base: `w-full bg-white rounded-lg border border-gray-300 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20`

### Badge
- Yellow: `bg-yellow-100 text-yellow-800`
- Purple: `bg-purple-100 text-purple-800`
- Teal: `bg-teal-100 text-teal-800`

## Forbidden Patterns
- `shadow-2xl`
- `rounded-full`
- `border-4`

## Do's
- 使用多彩但协调的配色方案
- 使用清晰的表格/网格布局
- 使用友好的圆角和阴影
- 使用图标来增强数据可视化

## Don'ts
- 禁止过度使用颜色造成视觉混乱
- 禁止忽略数据的结构化展示
- 禁止使用过小的字体

## Layout Archetypes
- `data-grid`: 结构化数据网格布局
- `spreadsheet-view`: 类电子表格视图
- `card-gallery`: 卡片画廊展示

---
Design System inspired by Airtable · Integrated into Design Kungfu
