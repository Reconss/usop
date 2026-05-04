# 品牌深度参考（references/）

53 个品牌的叙事性设计系统文档，每个 ~200-500 行，聚焦：
**色彩哲学** · **排版规则来源（字体家族、OpenType 特性）** · **阴影语言** · **交互哲学** · **品牌视觉调性**

## 和 `styles/` 的分工

| | styles/xxx-style.md | references/xxx.md |
|---|---|---|
| 格式 | Tailwind class token（短） | 叙事性设计说明（长） |
| 用途 | **代码生成** | **深度参考、调研、高保真还原** |
| 被谁调用 | 打分流程（product_types / brand_moods / audiences） | 用户点名品牌 或 品牌视觉调研时手动读取 |
| 是否参与 3 维打分 | 是 | 否 |

## 索引（按类别）

### 🚗 汽车（5）
- [tesla](tesla.md) · [ferrari](ferrari.md) · [lamborghini](lamborghini.md) · [bugatti](bugatti.md) · [renault](renault.md)

### 💰 金融 / 支付 / 加密（6）
- [mastercard](mastercard.md) · [binance](binance.md) · [coinbase](coinbase.md) · [kraken](kraken.md) · [revolut](revolut.md) · [wise](wise.md)

### 🤖 AI / ML（10）
- [cohere](cohere.md) · [mistral-ai](mistral-ai.md) · [x-ai](x-ai.md) · [minimax](minimax.md) · [together-ai](together-ai.md) · [replicate](replicate.md) · [runwayml](runwayml.md) · [elevenlabs](elevenlabs.md) · [ollama](ollama.md) · [nvidia](nvidia.md)

### 🛠️ 开发者工具 / 平台 / 基础设施（15）
- [clickhouse](clickhouse.md) · [composio](composio.md) · [hashicorp](hashicorp.md) · [mongodb](mongodb.md) · [sentry](sentry.md) · [posthog](posthog.md) · [resend](resend.md) · [warp](warp.md) · [opencode-ai](opencode-ai.md) · [mintlify](mintlify.md) · [lovable](lovable.md) · [expo](expo.md) · [sanity](sanity.md) · [webflow](webflow.md) · [voltagent](voltagent.md)

### ⚡ 效率工具（5）
- [linear-app](linear-app.md) · [miro](miro.md) · [superhuman](superhuman.md) · [intercom](intercom.md) · [zapier](zapier.md)

### 🛒 电商（1）
- [shopify](shopify.md)

### 📡 电信 / 企业（2）
- [vodafone](vodafone.md) · [ibm](ibm.md)

### 📱 社交媒体（2）
- [meta](meta.md) · [pinterest](pinterest.md)

### 🚕 出行（1）
- [uber](uber.md)

### 🎮 游戏（1）
- [playstation](playstation.md)

### 👟 生活方式（2）
- [nike](nike.md) · [starbucks](starbucks.md)

### 🚀 航空航天（1）
- [spacex](spacex.md)

### 📰 媒体 / 编辑（2）
- [theverge](theverge.md) · [wired](wired.md)

## 何时读取

1. **用户点名品牌**："帮我做一个类似 Tesla 的落地页" → 读 `tesla.md` 拿到完整设计语言
2. **用户想深入理解某品牌视觉**："讲讲 Stripe 是怎么做字体的"（注：重合的 16 个品牌例如 stripe、apple 等不在本文件夹，见 `styles/` 下的 tokenized 版）
3. **做设计调研 / 高保真还原** —— 这些文档里的字体、OpenType 特性、精确 hex、阴影配方可以直接搬
4. **给 `styles/` 反哺 token** —— 如果需要给某个品牌补齐 `styles/xxx-style.md`，从这里的详细说明中抽取 Tailwind class 即可

## 说明

这些文档不使用 Tailwind class 语法，而是给出**原始 CSS / hex / font-family / 精确数值**。在生成 shadcn/ui 代码时，AI 需要自行把这些数值映射为对应的 Tailwind class（或直接写 `text-[#3E6AE1]` 这种任意值语法）。
