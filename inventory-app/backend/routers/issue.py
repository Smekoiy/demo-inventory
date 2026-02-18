from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from database import get_db
from pydantic import BaseModel
from typing import Optional, List
import crud, models
from ws_manager import manager

router = APIRouter()

class IssueLine(BaseModel):
    item_code: str; qty_requested: float; qty_issued: float
    issue_type: str="General"; project_code: Optional[str]=None

class IssueCreate(BaseModel):
    req_no: Optional[str]=None; department: str
    remarks: Optional[str]=None; created_by: str="system"
    lines: List[IssueLine]

@router.post("/")
async def create_issue(data: IssueCreate, db: AsyncSession = Depends(get_db)):
    # Validate stock
    for line in data.lines:
        item = await crud.get_item_by_code(db, line.item_code)
        if not item: raise HTTPException(404, f"Item {line.item_code} not found")
        bal = await crud.get_balance(db, item.id)
        if bal["available_stock"] < line.qty_issued:
            raise HTTPException(400, f"สต็อกไม่เพียงพอ: {item.name} มีเพียง {bal['available_stock']} {item.uom}")
    doc = await crud.create_issue(db, data.dict(), [l.dict() for l in data.lines])
    await manager.send_event("STOCK_UPDATED", {"action": "issue", "issue_no": doc.issue_no})
    return {"issue_no": doc.issue_no, "message": "บันทึกการจ่ายสำเร็จ"}

@router.get("/")
async def list_issues(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.IssueDoc).order_by(models.IssueDoc.issue_date.desc()).limit(100))
    docs = result.scalars().all()
    out = []
    for d in docs:
        lines_r = await db.execute(
            select(models.IssueLine, models.Item.name, models.Item.code)
            .join(models.Item)
            .where(models.IssueLine.issue_doc_id == d.id))
        lines = lines_r.all()
        out.append({
            "id": d.id, "issue_no": d.issue_no, "req_no": d.req_no,
            "department": d.department, "created_by": d.created_by,
            "issue_date": d.issue_date.isoformat() if d.issue_date else None,
            "lines": [{"item_code": l.code, "item_name": l.name,
                       "qty_requested": l.IssueLine.qty_requested,
                       "qty_issued": l.IssueLine.qty_issued,
                       "issue_type": l.IssueLine.issue_type,
                       "project_code": l.IssueLine.project_code,
                       "unit_cost": l.IssueLine.unit_cost} for l in lines]
        })
    return out
