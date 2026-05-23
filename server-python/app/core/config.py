"""系统配置 — 从环境变量读取"""
import os

class Settings:
    # LLM (DeepSeek / OpenAI)
    llm_provider: str = os.getenv("LLM_PROVIDER", "deepseek")
    llm_model: str = os.getenv("LLM_MODEL", "deepseek-chat")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", os.getenv("DEEPSEEK_API_KEY", ""))
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    
    # Database
    db_host: str = os.getenv("DB_HOST", "localhost")
    db_port: int = int(os.getenv("DB_PORT", "5432"))
    db_user: str = os.getenv("DB_USER", "usop")
    db_password: str = os.getenv("DB_PASSWORD", "usop_password")
    db_name: str = os.getenv("DB_NAME", "usop_security")

settings = Settings()
