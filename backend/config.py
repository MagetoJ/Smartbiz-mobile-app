"""
Configuration management for the application.
Loads settings from environment variables using Pydantic Settings.
"""

from pydantic_settings import BaseSettings
from pydantic import EmailStr


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Database Configuration
    DATABASE_URL: str
    
    @property
    def database_url_asyncpg(self) -> str:
        """
        Transform DATABASE_URL to use the appropriate async driver.
        - PostgreSQL: postgresql+asyncpg://...
        - SQLite: sqlite+aiosqlite:///...
        """
        if self.DATABASE_URL.startswith("postgresql://"):
            return self.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif self.DATABASE_URL.startswith("postgres://"):
            return self.DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
        elif self.DATABASE_URL.startswith("sqlite://"):
            # Ensure it uses aiosqlite for async support
            url = self.DATABASE_URL.replace("sqlite://", "sqlite+aiosqlite://", 1)
            # Handle Windows paths if they start with sqlite:///C:
            return url
        return self.DATABASE_URL

    # Security
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int

    # Application
    APP_NAME: str
    DEBUG: bool
    CORS_ORIGINS: str = "*"
    SEED_DEMO_DATA: bool = False

    # Email Configuration (Postmark)
    POSTMARK_ENABLED: bool = True
    POSTMARK_SERVER_TOKEN: str = ""
    POSTMARK_FROM_EMAIL: str = "noreply@statbricks.com"
    POSTMARK_FROM_NAME: str = "StatBricks Team"
    EMAIL_TEST_MODE: bool = False
    
    # Frontend URL (for email links)
    FRONTEND_URL: str = "http://localhost:5173"  # Default to development URL

    # Cloudflare R2 Configuration
    R2_ENDPOINT_URL: str
    R2_ACCESS_KEY_ID: str
    R2_SECRET_ACCESS_KEY: str
    R2_BUCKET_NAME: str
    R2_PUBLIC_URL: str | None = None

    # LiteLLM AI Configuration
    ANTHROPIC_API_KEY: str = ""  # LiteLLM uses this for Anthropic models
    AI_MODEL: str = "anthropic/claude-haiku-4-5-20251001"  # LiteLLM format: provider/model
    AI_MAX_TOKENS: int = 300
    AI_CLASSIFICATION_ENABLED: bool = True

    # Optional: Fallback providers (comma-separated)
    AI_FALLBACK_MODELS: str = ""  # e.g., "gpt-4o-mini,gemini/gemini-pro"

    # Bootstrap Super Admin Configuration
    BOOTSTRAP_SUPER_ADMIN_EMAIL: str = ""
    BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH: str = ""
    BOOTSTRAP_SUPER_ADMIN_FULL_NAME: str = "Platform Administrator"

    # Paystack Payment Configuration
    PAYSTACK_SECRET_KEY: str = ""
    PAYSTACK_PUBLIC_KEY: str = ""
    PAYSTACK_WEBHOOK_SECRET: str = ""  # Optional: For webhook signature verification
    
    # Subscription Settings
    TRIAL_PERIOD_DAYS: int = 14
    GRACE_PERIOD_DAYS: int = 3  # Days after subscription expires before blocking access

    class Config:
        env_file = ".env"
        case_sensitive = True


# Singleton instance - import this in other modules
settings = Settings()
