# ============================================================
# USOP Scanner Service — 独立的扫描引擎容器
# 封装 Nuclei / Naabu / httpx / Subfinder 等开源工具
# 通过 REST API 对外提供服务
# ============================================================
FROM python:3.11-slim AS base

# 安装 Go (用于编译 ProjectDiscovery 工具)
FROM golang:1.22 AS tools
RUN go install -v github.com/projectdiscovery/naabu/v2/cmd/naabu@latest && \
    go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest && \
    go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest && \
    go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest && \
    go install -v github.com/projectdiscovery/tlsx/cmd/tlsx@latest && \
    go install -v github.com/projectdiscovery/interactsh/cmd/interactsh-client@latest

# 运行环境
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    nmap masscan curl wget ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# 复制编译好的 Go 工具
COPY --from=tools /go/bin/naabu /go/bin/nuclei /go/bin/httpx /go/bin/subfinder /go/bin/tlsx /usr/local/bin/
COPY --from=tools /go/bin/interactsh-client /usr/local/bin/

# 初始化 Nuclei 模板
RUN nuclei -update-templates 2>/dev/null || true

# 安装 Python 依赖
RUN pip install --no-cache-dir flask gunicorn requests
RUN mkdir -p /app

WORKDIR /app
COPY scanner_server.py /app/

EXPOSE 8080
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8080", "--timeout", "600", "scanner_server:app"]
