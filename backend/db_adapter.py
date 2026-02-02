import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from config import settings

def get_database_url():
    mode = os.getenv("DATABASE_MODE", "cloud") # 'cloud' or 'local'
    
    if mode == "local":
        # Force SQLite for local desktop mode
        return "sqlite+aiosqlite:///./local_pos.sqlite"
    
    return settings.database_url_asyncpg

def create_adapter_engine():
    url = get_database_url()
    connect_args = {}
    
    if url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
        
    engine = create_async_engine(
        url,
        echo=True,
        future=True,
        connect_args=connect_args
    )
    return engine

engine = create_adapter_engine()
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()
