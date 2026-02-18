from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, text
from passlib.context import CryptContext
from database import AsyncSessionLocal
import models
from datetime import datetime

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---- Users ----
async def get_user_by_username(db: AsyncSession, username: str):
    result = await db.execute(select(models.User).where(models.User.username == username))
    return result.scalar_one_or_none()

async def get_all_users(db: AsyncSession):
    result = await db.execute(select(models.User))
    return result.scalars().all()

async def create_user(db: AsyncSession, username, full_name, password, role="staff"):
    user = models.User(username=username, full_name=full_name,
                       hashed_password=pwd_context.hash(password), role=role)
    db.add(user); await db.flush(); return user

# ---- Items ----
async def get_all_items(db: AsyncSession):
    result = await db.execute(select(models.Item).where(models.Item.is_active == True))
    return result.scalars().all()

async def get_item_by_code(db: AsyncSession, code: str):
    result = await db.execute(select(models.Item).where(models.Item.code == code))
    return result.scalar_one_or_none()

async def create_item(db: AsyncSession, data: dict):
    item = models.Item(**data)
    db.add(item); await db.flush(); return item

# ---- Balance calculation ----
async def get_balance(db: AsyncSession, item_id: int):
    item = await db.get(models.Item, item_id)
    if not item: return None

    total_received = await db.scalar(
        select(func.coalesce(func.sum(models.ReceiveLine.qty_received), 0))
        .where(models.ReceiveLine.item_id == item_id))

    total_issued = await db.scalar(
        select(func.coalesce(func.sum(models.IssueLine.qty_issued), 0))
        .where(models.IssueLine.item_id == item_id))

    qc_hold = await db.scalar(
        select(func.coalesce(func.sum(models.QCHold.qty_hold), 0))
        .where(and_(models.QCHold.item_id == item_id,
                    models.QCHold.status.in_(["pending","review"]))))

    proj_reserved = await db.scalar(
        select(func.coalesce(
            func.sum(models.ProjectStock.qty_reserved - models.ProjectStock.qty_issued), 0))
        .join(models.Project)
        .where(and_(models.ProjectStock.item_id == item_id,
                    models.Project.status.in_(["planned","active"]))))

    total_in_wh  = item.opening_bal + total_received - total_issued
    available    = total_in_wh - qc_hold - proj_reserved

    if available <= 0:            status = "OUT_OF_STOCK"
    elif available <= item.min_stock:  status = "CRITICAL"
    elif available <= item.reorder_pt: status = "LOW"
    elif total_in_wh > item.min_stock*3: status = "OVERSTOCK"
    else:                              status = "OK"

    return {
        "item_id": item_id, "item_code": item.code, "item_name": item.name,
        "uom": item.uom, "abc_class": item.abc_class, "unit_cost": item.unit_cost,
        "opening_balance": item.opening_bal,
        "total_received": total_received, "total_issued": total_issued,
        "qc_hold": qc_hold, "project_reserved": proj_reserved,
        "total_in_warehouse": total_in_wh, "available_stock": available,
        "total_value": total_in_wh * item.unit_cost,
        "min_stock": item.min_stock, "reorder_point": item.reorder_pt,
        "status": status,
    }

async def get_all_balances(db: AsyncSession):
    items = await get_all_items(db)
    return [await get_balance(db, item.id) for item in items]

# ---- GRN / Receive ----
async def create_grn(db: AsyncSession, data: dict, lines: list):
    count = await db.scalar(select(func.count()).select_from(models.GRN))
    grn_no = f"GRN-{(count+1):04d}"
    grn = models.GRN(grn_no=grn_no, po_no=data.get("po_no"),
                     supplier=data.get("supplier"), created_by=data.get("created_by"),
                     remarks=data.get("remarks"))
    db.add(grn); await db.flush()
    for line in lines:
        item = await get_item_by_code(db, line["item_code"])
        if not item: continue
        rl = models.ReceiveLine(grn_id=grn.id, item_id=item.id,
                                qty_ordered=line.get("qty_ordered",0),
                                qty_received=line.get("qty_received",0),
                                qty_pass_qc=line.get("qty_pass_qc",0),
                                qty_fail_qc=line.get("qty_fail_qc",0),
                                unit_cost=line.get("unit_cost", item.unit_cost))
        db.add(rl)
        if line.get("qty_fail_qc",0) > 0:
            qc_count = await db.scalar(select(func.count()).select_from(models.QCHold))
            qc = models.QCHold(qc_ref=f"QC-{(qc_count+1):04d}", grn_no=grn_no,
                               item_id=item.id, qty_hold=line["qty_fail_qc"],
                               reason=line.get("qc_reason","รอตรวจสอบ"),
                               created_by=data.get("created_by"))
            db.add(qc)
    await db.flush(); return grn

# ---- Issue ----
async def create_issue(db: AsyncSession, data: dict, lines: list):
    count = await db.scalar(select(func.count()).select_from(models.IssueDoc))
    issue_no = f"ISS-{(count+1):04d}"
    doc = models.IssueDoc(issue_no=issue_no, req_no=data.get("req_no"),
                          department=data.get("department"), created_by=data.get("created_by"),
                          remarks=data.get("remarks"))
    db.add(doc); await db.flush()
    for line in lines:
        item = await get_item_by_code(db, line["item_code"])
        if not item: continue
        il = models.IssueLine(issue_doc_id=doc.id, item_id=item.id,
                              qty_requested=line.get("qty_requested",0),
                              qty_issued=line.get("qty_issued",0),
                              issue_type=line.get("issue_type","General"),
                              project_code=line.get("project_code",""),
                              unit_cost=item.unit_cost)
        db.add(il)
    await db.flush(); return doc

# ---- Analytics ----
async def get_movement_analysis(db: AsyncSession):
    items = await get_all_items(db)
    result = []
    for item in items:
        total_qty = await db.scalar(
            select(func.coalesce(func.sum(models.IssueLine.qty_issued),0))
            .where(models.IssueLine.item_id == item.id)) or 0
        txn_count = await db.scalar(
            select(func.count()).select_from(models.IssueLine)
            .where(models.IssueLine.item_id == item.id)) or 0
        last_issue = await db.scalar(
            select(func.max(models.IssueDoc.issue_date))
            .join(models.IssueLine)
            .where(models.IssueLine.item_id == item.id))
        last_receive = await db.scalar(
            select(func.max(models.GRN.receive_date))
            .join(models.ReceiveLine)
            .where(models.ReceiveLine.item_id == item.id))

        days_since_issue = None
        if last_issue:
            days_since_issue = (datetime.utcnow() - last_issue).days

        if txn_count == 0:         category = "DEAD_STOCK"
        elif txn_count >= 4:       category = "FAST_MOVING"
        elif txn_count >= 2:       category = "MOVING"
        elif days_since_issue and days_since_issue > 90: category = "SLOW_MOVING"
        else:                      category = "NORMAL"

        days_since_receive = None
        if last_receive:
            days_since_receive = (datetime.utcnow() - last_receive).days
        if days_since_receive is None:     aging = "NO_DATA"
        elif days_since_receive <= 30:     aging = "0_30"
        elif days_since_receive <= 60:     aging = "31_60"
        elif days_since_receive <= 90:     aging = "61_90"
        else:                              aging = "OVER_90"

        bal = await get_balance(db, item.id)
        result.append({
            "item_id": item.id, "item_code": item.code, "item_name": item.name,
            "uom": item.uom, "abc_class": item.abc_class,
            "current_stock": bal["available_stock"] if bal else 0,
            "total_qty_issued": total_qty, "txn_count": txn_count,
            "last_issue_date": last_issue.isoformat() if last_issue else None,
            "last_receive_date": last_receive.isoformat() if last_receive else None,
            "days_since_last_issue": days_since_issue,
            "days_since_last_receive": days_since_receive,
            "movement_category": category, "aging_bucket": aging,
            "unit_cost": item.unit_cost,
            "stock_value": (bal["available_stock"] if bal else 0) * item.unit_cost,
        })
    return sorted(result, key=lambda x: x["total_qty_issued"], reverse=True)

# ---- Seed ----
async def seed_initial_data():
    async with AsyncSessionLocal() as db:
        try:
            user_count = await db.scalar(select(func.count()).select_from(models.User))
            if user_count > 0: return

            users = [
                ("admin",   "ผู้ดูแลระบบ",    "admin1234",   "admin"),
                ("manager", "ผู้จัดการคลัง",  "manager1234", "manager"),
                ("staff1",  "พนักงานคลัง 1",  "staff1234",   "staff"),
                ("viewer",  "ผู้ดูรายงาน",    "viewer1234",  "viewer"),
            ]
            for u in users: await create_user(db, *u)

            items_data = [
                {"code":"ITM-001","name":"สายไฟ 2.5 mm²","category":"วัสดุไฟฟ้า","uom":"เมตร",
                 "min_stock":50,"max_stock":500,"reorder_pt":100,"unit_cost":45,
                 "supplier":"บ.ไทยสายไฟ","lead_time":7,"abc_class":"A","qc_required":True,
                 "location":"Rack A-01","opening_bal":170},
                {"code":"ITM-002","name":"หลอด LED 18W","category":"อุปกรณ์แสงสว่าง","uom":"หลอด",
                 "min_stock":20,"max_stock":200,"reorder_pt":50,"unit_cost":120,
                 "supplier":"บ.แสงทอง","lead_time":14,"abc_class":"B","qc_required":False,
                 "location":"Rack B-02","opening_bal":15},
                {"code":"ITM-003","name":"สวิตช์ไฟ 1 ทาง","category":"วัสดุไฟฟ้า","uom":"อัน",
                 "min_stock":30,"max_stock":300,"reorder_pt":60,"unit_cost":35,
                 "supplier":"บ.ไทยสายไฟ","lead_time":7,"abc_class":"C","qc_required":False,
                 "location":"Rack A-03","opening_bal":15},
                {"code":"ITM-004","name":"ท่อ PVC 3/4\"","category":"วัสดุประปา","uom":"เมตร",
                 "min_stock":10,"max_stock":100,"reorder_pt":25,"unit_cost":28,
                 "supplier":"บ.ท่อไทย","lead_time":10,"abc_class":"B","qc_required":False,
                 "location":"Rack C-01","opening_bal":30},
                {"code":"ITM-005","name":"ปั๊มน้ำ 1 HP","category":"เครื่องจักร","uom":"เครื่อง",
                 "min_stock":2,"max_stock":10,"reorder_pt":3,"unit_cost":3500,
                 "supplier":"บ.ปั๊มไทย","lead_time":21,"abc_class":"A","qc_required":True,
                 "location":"Zone D-01","opening_bal":1},
                {"code":"ITM-006","name":"น็อต M6","category":"อะไหล่","uom":"ชิ้น",
                 "min_stock":100,"max_stock":2000,"reorder_pt":300,"unit_cost":2,
                 "supplier":"บ.โลหะไทย","lead_time":3,"abc_class":"C","qc_required":False,
                 "location":"Rack E-05","opening_bal":1120},
                {"code":"ITM-007","name":"กาวซิลิโคน","category":"วัสดุสิ้นเปลือง","uom":"หลอด",
                 "min_stock":20,"max_stock":150,"reorder_pt":40,"unit_cost":85,
                 "supplier":"บ.เคมีภัณฑ์","lead_time":7,"abc_class":"C","qc_required":False,
                 "location":"Rack B-04","opening_bal":10},
                {"code":"ITM-008","name":"มอเตอร์ไฟฟ้า 5 HP","category":"เครื่องจักร","uom":"ตัว",
                 "min_stock":1,"max_stock":5,"reorder_pt":2,"unit_cost":12000,
                 "supplier":"บ.มอเตอร์ไทย","lead_time":30,"abc_class":"A","qc_required":True,
                 "location":"Zone D-02","opening_bal":1},
            ]
            item_objs = {}
            for d in items_data:
                item = await create_item(db, d)
                item_objs[d["code"]] = item

            await db.commit()
            print("✅ Seed data created successfully")
        except Exception as e:
            await db.rollback()
            print(f"Seed error: {e}")
