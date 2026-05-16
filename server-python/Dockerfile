FROM python:3.11-slim AS base

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    nginx \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /bin/bash appuser

# ==================== 依赖阶段 ====================
FROM base AS dependencies

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ==================== 构建前端阶段 ====================
FROM node:20-alpine AS frontend-builder
WORKDIR /app
RUN npm install -g pnpm
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ .
RUN pnpm build

# ==================== 生产阶段 ====================
FROM base AS production

# 复制 Python 依赖
COPY --from=dependencies /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=dependencies /usr/local/bin /usr/local/bin

# 复制后端代码
COPY --chown=appuser:appuser server-python/ /app/

# 复制前端构建文件
COPY --from=frontend-builder /app/dist /app/static

# 配置 nginx
COPY server-python/nginx.conf /etc/nginx/sites-available/default
RUN sed -i 's/listen 80/listen 3266/g' /etc/nginx/sites-available/default

# 环境变量
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_PORT=5001 \
    SKIP_BIGDATA_CHECK=1

USER appuser

EXPOSE 3266

# 启动 nginx + gunicorn (通过supervisord)
RUN echo $'[supervisord]\nnodaemon=true\n\n[program:nginx]\ncommand=nginx -g "daemon off;"\nstdout_logfile=/dev/stdout\nstdout_logfile_maxbytes=0\nstderr_logfile=/dev/stderr\nstderr_logfile_maxbytes=0\n\n[program:python]\ncommand=gunicorn -w 4 -b 127.0.0.1:5001 "app:create_app()"\nstdout_logfile=/dev/stdout\nstdout_logfile_maxbytes=0\nstderr_logfile=/dev/stderr\nstderr_logfile_maxbytes=0\n' > /etc/supervisor/conf.d/supervisord.conf

CMD ["/usr/bin/supervisord"]
