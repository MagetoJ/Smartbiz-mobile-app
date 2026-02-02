import os
import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import text
from config import settings
from tenacity import retry, stop_after_attempt, wait_fixed, retry_if_exception_type

try:
    import asyncpg.exceptions
    HAS_ASYNCPG = True
except ImportError:
    HAS_ASYNCPG = False

logger = logging.getLogger(__name__)

def get_database_url():
    # Detect Desktop Mode for local SQLite usage
    mode = os.getenv("DATABASE_MODE", "cloud") # 'cloud' or 'local'
    
    if mode == "local":
        # Force SQLite for local desktop mode
        return "sqlite+aiosqlite:///./statbricks_local.sqlite"
    
    return settings.database_url_asyncpg

# Engine configuration with auto-switching
DATABASE_URL = get_database_url()
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_async_engine(
    DATABASE_URL, 
    echo=True, 
    future=True,
    connect_args=connect_args
)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()


async def get_db():
    """Dependency for getting async database sessions"""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


# Define exception types to retry on
retry_exceptions = (ConnectionRefusedError, OSError, Exception)
if HAS_ASYNCPG:
    retry_exceptions += (asyncpg.exceptions.PostgresError,)

@retry(
    retry=retry_if_exception_type(retry_exceptions),
    stop=stop_after_attempt(12),  # 60 seconds total (12 attempts * 5 seconds)
    wait=wait_fixed(5),  # Wait 5 seconds between attempts
    reraise=True,
    before_sleep=lambda retry_state: logger.warning(
        f"Database connection attempt {retry_state.attempt_number} failed. "
        f"Retrying in 5 seconds... (Error: {retry_state.outcome.exception()})"
    )
)
async def init_db():
    """
    Initialize database tables and schema with retry logic.
    
    This function will retry up to 12 times (60 seconds total) if the database
    connection is refused. This is necessary in Cloud Run where the Cloud SQL
    Auth Proxy sidecar may take a few seconds to start up.
    """
    logger.info("Attempting to connect to database and run migrations...")
    
    try:
        # Test database connection first
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            logger.info("Database connection successful!")
        
        # Import here to avoid circular imports
        from migrations.schema_migrations import run_migrations
        await run_migrations()
        
        logger.info("Database initialization complete!")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise
