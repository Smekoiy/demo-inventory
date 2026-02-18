from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from database import get_db
from pydantic import BaseModel
from typing import Optional, List
import crud, models
from ws_manager import manager

# ===== RECEIVE =====
router = APIRouter()

class ReceiveLine(BaseModel):
    item_code: str; qty_ordered: float; qty_received: float
    qty_pass_qc: float; qty_fail_qc: float=0
    unit_cost: Optional[float]=None; qc_reason: Optional[str]=None

class GRNCreate(BaseModel):
    po_no: Optional[str]=None; supplier: str
    remarks: Optional[str]=None; created_by: str="system"
    lines: List[ReceiveLine]

@router.post("/")
async def create_grn(data: GRNCreate, db: AsyncSession = Depends(get_db)):
    grn = await crud.create_grn(db, data.dict(), [l.dict() for l in data.lines])
    await manager.send_event("STOCK_UPDATED", {"action": "receive", "grn_no": grn.grn_no})
    return {"grn_no": grn.grn_no, "message": "บันทึก GRN สำเร็จ"}

@router.get("/")
async def list_grns(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.GRN).order_by(models.GRN.receive_date.desc()).limit(100))
    grns = result.scalars().all()
    out = []
    for g in grns:
        lines_r = await db.execute(
            select(models.ReceiveLine, models.Item.name, models.Item.code)
            .join(models.Item)
            .where(models.ReceiveLine.grn_id == g.id))
        lines = lines_r.all()
        out.append({
            "id": g.id, "grn_no": g.grn_no, "po_no": g.po_no,
            "supplier": g.supplier, "created_by": g.created_by,
            "receive_date": g.receive_date.isoformat() if g.receive_date else None,
            "remarks": g.remarks,
            "lines": [{"item_code": l.code, "item_name": l.name,
                       "qty_ordered": l.ReceiveLine.qty_ordered,
                       "qty_received": l.ReceiveLine.qty_received,
                       "qty_pass_qc": l.ReceiveLine.qty_pass_qc,
                       "qty_fail_qc": l.ReceiveLine.qty_fail_qc,
                       "unit_cost": l.ReceiveLine.unit_cost} for l in lines]
        })
    return out
