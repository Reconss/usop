---
name: bmw-style
version: 1.0.0
description: BMW Inspired Design System - Luxury automotive. Dark premium surfaces, precise German engineering aesthetic.
keywords: [BMW, 豪华汽车, 深色, 德国工程, 高端]
author: Design Kungfu
style_type: visual
---

# BMW Style

## Overview
BMW 风格以豪华汽车为核心，通过深色高端表面和精确的德国工程美学，打造尊贵的品牌体验。适合豪华汽车网站、深色高端界面和德国工程美学设计。

## Philosophy
BMW Style 是一种源于 BMW 的豪华设计风格，以其深色高端表面和精确的工程美学著称。通过深色背景、精致的细节和专业的排版，传达德国工程的精确和豪华品质。

## Design Tokens

### Border
- Width: `border`
- Color: `border-gray-800`
- Radius: `rounded-sm`

### Shadow
- Small: `shadow-none`
- Medium: `shadow-lg shadow-black/40`
- Large: `shadow-2xl shadow-black/50`

### Typography
- Heading: `font-light tracking-wide text-white uppercase`
- Body: `text-gray-300`
- Font Family: BMW Type, Helvetica Neue, sans-serif

### Spacing
- Section: `py-24 md:py-32`
- Container: `px-8 md:px-16 max-w-7xl mx-auto`

### Colors
- Primary: `bg-blue-600` / `text-blue-500`
- Background: `bg-gray-900`
- Surface: `bg-gray-800`
- Text: `text-white`
- Muted: `text-gray-400`
- Accent: `text-blue-400`

## Component Recipes

### Button
- Primary: `bg-blue-600 text-white hover:bg-blue-700 font-normal tracking-wider uppercase`
- Outline: `border border-white text-white hover:bg-white hover:text-gray-900`

### Card
- Base: `bg-gray-800 border border-gray-700`
- Dark: `bg-gray-900 border-gray-800`

### Heading
- Hero: `text-5xl md:text-7xl font-light uppercase tracking-widest`
- Section: `text-2xl font-light uppercase tracking-wide`

## Forbidden Patterns
- `bg-gradient-to-r`
- `rounded-3xl`
- `shadow-inner`
- `text-yellow-500`

## Do's
- 使用深色高端配色
- 使用轻量字重和宽字距
- 使用大写字母增强力量感
- 使用高质量的汽车摄影

## Don'ts
- 禁止使用过于鲜艳的颜色
- 禁止使用过大的圆角
- 禁止忽略留白和呼吸感

## Layout Archetypes
- `automotive-hero`: 全屏汽车展示
- `showroom-grid`: 展厅式网格布局
- `specs-comparison`: 规格对比布局

---
Design System inspired by BMW · Integrated into Design Kungfu
