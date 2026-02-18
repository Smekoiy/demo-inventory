from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from database import get_db
from pydantic import BaseModel
from typing import Optional
import models
from ws_manager import manager
from datetime import datetime

router = APIRouter()

class QCUpdate(BaseModel):
    status: str  # pending | review | approved | rejected
    action: Optional[str] = None

@router.get("/")
async def list_qc_holds(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.QCHold, models.Item.name, models.Item.code, models.Item.uom, models.Item.unit_cost)
        .join(models.Item)
        .where(models.QCHold.status.in_(["pending","review"]))
        .order_by(models.QCHold.receive_date.desc()))
    rows = result.all()
    return [{
        "id": r.QCHold.id, "qc_ref": r.QCHold.qc_ref, "grn_no": r.QCHold.grn_no,
        "item_code": r.code, "item_name": r.name, "uom": r.uom,
        "qty_hold": r.QCHold.qty_hold, "reason": r.QCHold.reason,
        "status": r.QCHold.status, "action": r.QCHold.action,
        "receive_date": r.QCHold.receive_date.isoformat() if r.QCHold.receive_date else None,
        "days_on_hold": (datetime.utcnow() - r.QCHold.receive_date).days if r.QCHold.receive_date else 0,
        "hold_value": r.QCHold.qty_hold * r.unit_cost,
    } for r in rows]

@router.get("/history")
async def qc_history(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.QCHold, models.Item.name, models.Item.code, models.Item.unit_cost)
        .join(models.Item)
        .where(models.QCHold.status.in_(["approved","rejected"]))
        .order_by(models.QCHold.receive_date.desc()).limit(50))
    rows = result.all()
    return [{"qc_ref": r.QCHold.qc_ref, "item_code": r.code, "item_name": r.name,
             "qty_hold": r.QCHold.qty_hold, "status": r.QCHold.status,
             "action": r.QCHold.action, "hold_value": r.QCHold.qty_hold * r.unit_cost} for r in rows]

@router.put("/{qc_id}")
async def update_qc_status(qc_id: int, data: QCUpdate, db: AsyncSession = Depends(get_db)):
    qc = await db.get(models.QCHold, qc_id)
    if not qc: raise HTTPException(404, "QC record not found")
    qc.status = data.status
    if data.action: qc.action = data.action
    if data.status in ["approved","rejected"]:
        qc.resolved_at = datetime.utcnow()
    await db.flush()
    await manager.send_event("STOCK_UPDATED", {"action": "qc_update", "qc_ref": qc.qc_ref, "status": data.status})
    return {"message": f"QC updated to {data.status}"}
