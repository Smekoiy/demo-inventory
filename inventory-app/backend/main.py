from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from contextlib import asynccontextmanager
import asyncio, json, os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from database import engine, Base, get_db
import models, crud
from routers import items, receive, issue, qc, project, analytics
from ws_manager import manager

SECRET_KEY = os.getenv("SECRET_KEY", "inventory-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await crud.seed_initial_data()
    yield

app = FastAPI(
    title="Inventory Management API",
    description="ระบบจัดการสต็อกสินค้า — Realtime",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Auth ----
def verify_password(plain, hashed): return pwd_context.verify(plain, hashed)
def hash_password(password): return pwd_context.hash(password)

def create_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = await crud.get_user_by_username(db, username)
    if user is None:
        raise credentials_exception
    return user

@app.post("/auth/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    user = await crud.get_user_by_username(db, form_data.username)
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
    token = create_token({"sub": user.username, "role": user.role},
                         timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    return {"access_token": token, "token_type": "bearer",
            "username": user.username, "role": user.role, "full_name": user.full_name}

@app.get("/auth/me")
async def me(current_user=Depends(get_current_user)):
    return {"username": current_user.username, "role": current_user.role,
            "full_name": current_user.full_name}

# ---- WebSocket ----
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(json.dumps({"type": "ping", "from": client_id}))
    except WebSocketDisconnect:
        manager.disconnect(client_id)

# ---- Routers ----
app.include_router(items.router,     prefix="/api/items",     tags=["Item Master"])
app.include_router(receive.router,   prefix="/api/receive",   tags=["Receive/GRN"])
app.include_router(issue.router,     prefix="/api/issue",     tags=["Issue"])
app.include_router(qc.router,        prefix="/api/qc",        tags=["QC Hold"])
app.include_router(project.router,   prefix="/api/project",   tags=["Project Stock"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])

@app.get("/")
async def root():
    return {"message": "Inventory API is running 🚀", "docs": "/docs"}
