---
name: clay-style
version: 1.0.0
description: Clay Inspired Design System - Creative agency. Organic shapes, soft gradients, art-directed layout.
keywords: [Clay, 创意机构, 有机形状, 柔和渐变, 艺术指导]
author: Design Kungfu
style_type: visual
---

# Clay Style

## Overview
Clay 风格以创意机构为核心，通过有机形状、柔和渐变和艺术指导的布局，打造独特的创意体验。适合创意机构、趣味 B2B 设计和渐变丰富的布局。

## Philosophy
Clay Style 是一种源于 Clay 的创意艺术风格，以其有机形状和柔和渐变著称。通过艺术指导的视觉语言、独特的形状和丰富的色彩，传达创造力和艺术感。

## Design Tokens

### Border
- Width: `border-0`
- Radius: `rounded-3xl`

### Shadow
- Small: `shadow-lg`
- Medium: `shadow-xl`
- Large: `shadow-2xl`

### Typography
- Heading: `font-bold text-gray-900`
- Body: `text-gray-600`
- Font Family: Inter, system-ui, sans-serif

### Spacing
- Section: `py-20 md:py-32`
- Container: `px-6 md:px-12 max-w-7xl mx-auto`

### Colors
- Primary: `bg-purple-500` / `text-purple-600`
- Secondary: `bg-pink-400` / `text-pink-500`
- Gradient: `bg-gradient-to-br from-purple-400 via-pink-400 to-orange-300`
- Background: `bg-white`
- Surface: `bg-gray-50`
- Text: `text-gray-900`

## Component Recipes

### Button
- Primary: `bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full font-medium`
- Secondary: `bg-white text-gray-900 border-2 border-gray-200 rounded-full`

### Card
- Base: `bg-white rounded-3xl shadow-xl overflow-hidden`
- Gradient: `bg-gradient-to-br from-purple-100 to-pink-100 rounded-3xl`

### Shape
- Blob: `rounded-[40%_60%_70%_30%/40%_50%_60%_50%]`
- Organic: `rounded-[60%_40%_30%_70%/60%_30%_70%_40%]`

## Forbidden Patterns
- `rounded-none`
- `border-4`
- `shadow-none`

## Do's
- 使用有机形状和流体设计
- 使用柔和的多彩渐变
- 使用大胆的圆角
- 使用艺术指导的布局

## Don'ts
- 禁止使用生硬的直角
- 禁止忽略视觉层次感
- 禁止过度使用动画

## Layout Archetypes
- `creative-hero`: 创意英雄区域
- `art-directed-grid`: 艺术指导网格
- `gradient-showcase`: 渐变展示区

---
Design System inspired by Clay · Integrated into Design Kungfu
