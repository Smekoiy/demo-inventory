from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./inventory.db")

# แปลง URL ให้ใช้ asyncpg driver เสมอ
if "postgres" in DATABASE_URL:
    # ตัด scheme เดิมออกทั้งหมด แล้วใส่ใหม่
    DATABASE_URL = "postgresql+asyncpg://" + DATABASE_URL.split("://", 1)[1]

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
