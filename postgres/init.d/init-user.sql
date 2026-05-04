#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- 创建用户
    CREATE USER usop WITH PASSWORD 'usop_password' SUPERUSER;
    
    -- 创建数据库
    CREATE DATABASE usop_security OWNER usop;
    
    -- 启用 TimescaleDB 扩展（如果需要）
    \c usop_security
    CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
EOSQL
