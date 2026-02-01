from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import text
from config import settings
from tenacity import retry, stop_after_attempt, wait_fixed, retry_if_exception_type
import logging
try:
    import asyncpg.exceptions
    HAS_ASYNCPG = True
except ImportError:
    HAS_ASYNCPG = False

logger = logging.getLogger(__name__)

# Engine configuration with SQLite support
connect_args = {}
if settings.database_url_asyncpg.startswith("sqlite"):
    # SQLite doesn't support the same isolation levels/arguments as PostgreSQL
    connect_args = {"check_same_thread": False}
else:
    # PostgreSQL specific settings could go here
    pass

engine = create_async_engine(
    settings.database_url_asyncpg, 
    echo=True, 
    future=True,
    connect_args=connect_args if settings.database_url_asyncpg.startswith("sqlite") else {}
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
