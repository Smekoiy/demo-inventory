from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from database import get_db
import crud, models

router = APIRouter()

@router.get("/dashboard")
async def dashboard(db: AsyncSession = Depends(get_db)):
    balances = await crud.get_all_balances(db)
    items    = await crud.get_all_items(db)

    total_value     = sum(b["total_value"] for b in balances if b)
    total_items     = len(items)
    critical_count  = sum(1 for b in balances if b and b["status"] in ["CRITICAL","OUT_OF_STOCK"])
    low_count       = sum(1 for b in balances if b and b["status"] == "LOW")
    ok_count        = sum(1 for b in balances if b and b["status"] == "OK")

    qc_count = await db.scalar(
        select(func.count()).select_from(models.QCHold)
        .where(models.QCHold.status.in_(["pending","review"])))
    qc_value = await db.scalar(
        select(func.coalesce(func.sum(models.QCHold.qty_hold * models.Item.unit_cost), 0))
        .join(models.Item)
        .where(models.QCHold.status.in_(["pending","review"]))) or 0

    active_projects = await db.scalar(
        select(func.count()).select_from(models.Project)
        .where(models.Project.status.in_(["active","planned"])))

    grn_count = await db.scalar(select(func.count()).select_from(models.GRN)) or 0
    issue_count = await db.scalar(select(func.count()).select_from(models.IssueDoc)) or 0

    abc_breakdown = {}
    for cls in ["A","B","C"]:
        abc_items = [b for b in balances if b and b["abc_class"] == cls]
        abc_breakdown[cls] = {
            "count": len(abc_items),
            "value": sum(b["total_value"] for b in abc_items)
        }

    return {
        "kpi": {
            "total_items": total_items,
            "total_stock_value": total_value,
            "critical_items": critical_count,
            "low_items": low_count,
            "ok_items": ok_count,
            "qc_hold_count": qc_count,
            "qc_hold_value": qc_value,
            "active_projects": active_projects,
            "total_grn": grn_count,
            "total_issues": issue_count,
        },
        "abc_breakdown": abc_breakdown,
        "balance_summary": balances,
    }

@router.get("/movement")
async def movement_analysis(db: AsyncSession = Depends(get_db)):
    return await crud.get_movement_analysis(db)

@router.get("/abc")
async def abc_analysis(db: AsyncSession = Depends(get_db)):
    movement = await crud.get_movement_analysis(db)
    sorted_by_value = sorted(movement, key=lambda x: x["stock_value"], reverse=True)
    total_val = sum(m["stock_value"] for m in sorted_by_value)
    cum = 0
    for i, m in enumerate(sorted_by_value):
        cum += m["stock_value"]
        m["rank"] = i + 1
        m["cumulative_value"] = cum
        m["pct_value"] = (m["stock_value"] / total_val * 100) if total_val > 0 else 0
        m["cumulative_pct"] = (cum / total_val * 100) if total_val > 0 else 0
    return sorted_by_value

@router.get("/aging")
async def stock_aging(db: AsyncSession = Depends(get_db)):
    movement = await crud.get_movement_analysis(db)
    buckets = {"0_30": [], "31_60": [], "61_90": [], "OVER_90": [], "NO_DATA": []}
    for m in movement:
        buckets.get(m["aging_bucket"], buckets["NO_DATA"]).append(m)
    return {
        "items": movement,
        "summary": {k: {"count": len(v), "total_value": sum(i["stock_value"] for i in v)}
                    for k, v in buckets.items()}
    }
