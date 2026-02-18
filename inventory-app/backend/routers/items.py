from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from pydantic import BaseModel
from typing import Optional
import crud, models
from sqlalchemy import select

router = APIRouter()

class ItemCreate(BaseModel):
    code: str; name: str; category: Optional[str]=None; uom: Optional[str]="pcs"
    min_stock: float=0; max_stock: float=0; reorder_pt: float=0; unit_cost: float=0
    supplier: Optional[str]=None; lead_time: int=7; abc_class: str="C"
    qc_required: bool=False; location: Optional[str]=None; opening_bal: float=0

@router.get("/")
async def list_items(db: AsyncSession = Depends(get_db)):
    items = await crud.get_all_items(db)
    return items

@router.get("/balance")
async def get_all_balance(db: AsyncSession = Depends(get_db)):
    return await crud.get_all_balances(db)

@router.get("/{code}/balance")
async def get_item_balance(code: str, db: AsyncSession = Depends(get_db)):
    item = await crud.get_item_by_code(db, code)
    if not item: raise HTTPException(404, "Item not found")
    return await crud.get_balance(db, item.id)

@router.post("/")
async def create_item(data: ItemCreate, db: AsyncSession = Depends(get_db)):
    existing = await crud.get_item_by_code(db, data.code)
    if existing: raise HTTPException(400, "Item code already exists")
    item = await crud.create_item(db, data.dict())
    return item

@router.put("/{code}")
async def update_item(code: str, data: ItemCreate, db: AsyncSession = Depends(get_db)):
    item = await crud.get_item_by_code(db, code)
    if not item: raise HTTPException(404, "Item not found")
    for k, v in data.dict().items():
        setattr(item, k, v)
    await db.flush()
    return item
