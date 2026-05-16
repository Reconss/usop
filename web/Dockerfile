FROM node:20-alpine

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 暴露端口
EXPOSE 3266

# 启动开发服务器
CMD ["pnpm", "dev", "--host", "0.0.0.0"]
