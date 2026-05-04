---
name: spotify-style
version: 1.0.0
description: Spotify Inspired Design System - Music streaming. Vibrant green on dark, bold type, album-art-driven.
keywords: [Spotify, 音乐, 流媒体, 绿色, 深色, 媒体]
author: Design Kungfu
style_type: visual
---

# Spotify Style

## Overview
Spotify 风格以音乐流媒体为核心，通过深色背景上的活力绿色、粗体排版和专辑艺术驱动的设计，打造沉浸式的媒体体验。适合音乐/媒体平台、深色沉浸式 UI 和绿色强调设计。

## Philosophy
Spotify Style 是一种源于 Spotify 的媒体优先设计风格，以其标志性的绿色和深色界面著称。通过专辑艺术展示、流畅的播放控制和沉浸式的视觉体验，传达音乐的力量和情感。

## Design Tokens

### Border
- Width: `border-0`
- Color: `border-transparent`
- Radius: `rounded-md`

### Shadow
- Small: `shadow-none`
- Medium: `shadow-lg shadow-black/40`
- Large: `shadow-xl shadow-black/50`
- Glow: `shadow-[0_0_40px_rgba(29,185,84,0.3)]`

### Typography
- Heading: `font-bold text-white`
- Body: `text-gray-400`
- Hero: `text-5xl md:text-7xl font-black`
- H1: `text-4xl md:text-5xl font-bold`
- Body: `text-base text-gray-400`
- Font Family: Circular, Helvetica Neue, Helvetica, Arial, sans-serif

### Spacing
- Section: `py-16 md:py-24`
- Container: `px-4 md:px-6 max-w-7xl mx-auto`
- Card: `p-4`
- Grid Gap: `gap-4 md:gap-6`

### Colors
- Primary BG: `bg-[#121212]`
- Secondary BG: `bg-[#181818]`
- Elevated BG: `bg-[#282828]`
- Primary Text: `text-white`
- Secondary Text: `text-gray-400`
- Muted Text: `text-gray-500`
- Accent: `text-[#1db954]` / `#1db954`
- Accent Hover: `hover:text-[#1ed760]`
- Border: `border-transparent`

## Component Recipes

### Button
- Base: `font-bold rounded-full transition-all duration-200 inline-flex items-center justify-center gap-2 uppercase tracking-wider text-sm`
- Primary: `bg-[#1db954] text-black hover:bg-[#1ed760] hover:scale-105`
- Secondary: `bg-transparent text-white border border-gray-500 hover:border-white hover:scale-105`
- Play: `bg-[#1db954] text-black w-12 h-12 rounded-full shadow-lg hover:bg-[#1ed760] hover:scale-105`
- Ghost: `bg-transparent text-gray-400 hover:text-white`

- Hover: `hover:scale-105`
- Size SM: `h-8 px-4 text-xs`
- Size MD: `h-10 px-6`
- Size LG: `h-12 px-8`

### Card
- Base: `bg-[#181818] rounded-md transition-all duration-200 cursor-pointer group`
- Default: `p-4`
- Hover: `hover:bg-[#282828]`
- Image: `rounded-md shadow-lg mb-4 aspect-square object-cover`
- Play Overlay: `absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300`

### Input
- Base: `w-full bg-white rounded-full border-0 text-black placeholder:text-gray-500 focus:outline-none focus:ring-0 transition-all duration-200 h-10 px-4`
- Default: ``
- Dark: `bg-[#242424] text-white placeholder:text-gray-400`

### Heading
- Base: `font-bold text-white`
- Default: `text-white`
- Muted: `text-gray-400`
- Accent: `text-[#1db954]`

### Badge
- Base: `inline-flex items-center font-medium text-xs rounded-sm px-2 py-0.5`
- Default: `bg-[#282828] text-white`
- Explicit: `bg-gray-400 text-black` (E tag)

### Navigation
- Base: `bg-[#000000] px-4 md:px-6 py-4`
- Sidebar: `bg-[#000000] w-64 h-screen fixed left-0 top-0 p-6`

### Player Bar
- Base: `bg-[#181818] border-t border-[#282828] fixed bottom-0 left-0 right-0 h-20 px-4 flex items-center justify-between`

## Forbidden Patterns
These classes must NEVER be used in Spotify Style style:

- `bg-white` (as main background)
- `text-black` (as main text)
- `bg-gradient-to-r from-pink`
- `rounded-lg` (use rounded-md)
- `shadow-2xl`
- `border-gray-200`

- Pattern: `^bg-white`
- Pattern: `^text-black`
- Pattern: `^border-gray-(?:100|200|300)`

### Why:
- `bg-white`: Spotify style uses dark backgrounds exclusively
- `text-black`: Spotify style uses white text on dark backgrounds
- `rounded-lg`: Spotify style uses rounded-md for cards

## Do's
- 使用深色背景 #121212 作为主背景
- 使用 Spotify 绿 #1db954 作为强调色
- 使用粗体字体和紧凑的排版
- 使用专辑艺术作为视觉焦点
- 使用适中的圆角 rounded-md
- 使用悬停时的缩放效果
- 使用沉浸式的全屏布局
- 使用流畅的播放控制动画

## Don'ts
- 禁止使用浅色背景作为主背景
- 禁止使用非品牌颜色（粉色、紫色等）
- 禁止使用过大的圆角
- 禁止忽略专辑艺术的展示
- 禁止使用过重的阴影
- 禁止忽略播放控制的重要性

## Layout Archetypes
- `media-library`: Grid layout for albums/playlists with cover art.
- `media-player`: Full-screen player with large album art and controls.
- `media-browse`: Browse page with categories and recommendations.
- `landing-hero-centered`: Centered headline, subtitle, and CTA.
- `app-dashboard`: Application dashboard with sidebar navigation.

## Example Usage

```
Generate a landing page with:
- Style: spotify-style
- Archetype: media-library
- Sections: hero, featured, new-releases, categories
- Components: card (album), button (play), heading (section)
```

### Example Prompts:
- "音乐流媒体界面"
- "播客平台"
- "媒体播放器"
- "娱乐应用"

---
Design System inspired by Spotify · Integrated into Design Kungfu
Style: Spotify 风格 (Spotify Style)
