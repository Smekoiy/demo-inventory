from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from database import get_db
from pydantic import BaseModel
from typing import Optional, List
import models, crud
from ws_manager import manager
from datetime import datetime

# ===== PROJECT =====
router = APIRouter()

class ProjectCreate(BaseModel):
    code: str; name: str
    start_date: Optional[str]=None; end_date: Optional[str]=None
    created_by: str="system"

class StockReservation(BaseModel):
    item_code: str; qty_reserved: float

@router.get("/")
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Project).order_by(models.Project.id.desc()))
    projects = result.scalars().all()
    out = []
    for p in projects:
        stocks_r = await db.execute(
            select(models.ProjectStock, models.Item.name, models.Item.code, models.Item.uom, models.Item.unit_cost)
            .join(models.Item).where(models.ProjectStock.project_id == p.id))
        stocks = stocks_r.all()
        total_val = sum(s.ProjectStock.qty_reserved * s.unit_cost for s in stocks)
        out.append({
            "id": p.id, "code": p.code, "name": p.name, "status": p.status,
            "start_date": p.start_date.isoformat() if p.start_date else None,
            "end_date": p.end_date.isoformat() if p.end_date else None,
            "total_value": total_val,
            "stocks": [{"item_code": s.code, "item_name": s.name, "uom": s.uom,
                        "qty_reserved": s.ProjectStock.qty_reserved,
                        "qty_issued": s.ProjectStock.qty_issued,
                        "remaining": s.ProjectStock.qty_reserved - s.ProjectStock.qty_issued,
                        "pct_used": (s.ProjectStock.qty_issued / s.ProjectStock.qty_reserved * 100) if s.ProjectStock.qty_reserved > 0 else 0,
                        "value": s.ProjectStock.qty_reserved * s.unit_cost} for s in stocks]
        })
    return out

@router.post("/")
async def create_project(data: ProjectCreate, db: AsyncSession = Depends(get_db)):
    p = models.Project(code=data.code, name=data.name,
                       start_date=datetime.fromisoformat(data.start_date) if data.start_date else None,
                       end_date=datetime.fromisoformat(data.end_date) if data.end_date else None,
                       created_by=data.created_by)
    db.add(p); await db.flush()
    return {"id": p.id, "code": p.code, "message": "สร้าง Project สำเร็จ"}

@router.post("/{project_code}/reserve")
async def reserve_stock(project_code: str, items: List[StockReservation], db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Project).where(models.Project.code == project_code))
    project = result.scalar_one_or_none()
    if not project: raise HTTPException(404, "Project not found")
    for item_data in items:
        item = await crud.get_item_by_code(db, item_data.item_code)
        if not item: continue
        ps = models.ProjectStock(project_id=project.id, item_id=item.id,
                                 qty_reserved=item_data.qty_reserved, unit_cost=item.unit_cost)
        db.add(ps)
    await db.flush()
    await manager.send_event("STOCK_UPDATED", {"action": "project_reserve", "project": project_code})
    return {"message": "จองสต็อกสำเร็จ"}

@router.put("/{project_code}/status")
async def update_project_status(project_code: str, status: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Project).where(models.Project.code == project_code))
    project = result.scalar_one_or_none()
    if not project: raise HTTPException(404, "Project not found")
    project.status = status
    await db.flush()
    return {"message": f"Project status updated to {status}"}
