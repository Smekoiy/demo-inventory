from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.context import CryptContext

from database import AsyncSessionLocal
import models

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ===============================
# 🔐 Password
# ===============================
def hash_password(password: str):
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str):
    return pwd_context.verify(plain, hashed)


# ===============================
# 👤 User
# ===============================
async def get_user_by_username(db: AsyncSession, username: str):
    result = await db.execute(
        select(models.User).where(models.User.username == username)
    )
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    username: str,
    full_name: str,
    password: str,
    role: str = "user",
):
    hashed_password = hash_password(password)

    user = models.User(
        username=username,
        full_name=full_name,
        hashed_password=hashed_password,
        role=role,
    )

    db.add(user)
    await db.flush()
    return user


# ===============================
# 🌱 Seed Admin (FIXED VERSION)
# ===============================
async def seed_initial_data():
    async with AsyncSessionLocal() as db:
        try:
            # เช็คเฉพาะ admin
            result = await db.execute(
                select(models.User).where(models.User.username == "admin")
            )
            admin = result.scalar_one_or_none()

            if not admin:
                await create_user(
                    db,
                    username="admin",
                    full_name="ผู้ดูแลระบบ",
                    password="1234",
                    role="admin",
                )
                print("✅ Admin user created")

            await db.commit()

        except Exception as e:
            await db.rollback()
            print(f"Seed error: {e}")
