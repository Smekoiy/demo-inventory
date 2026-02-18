# 🏭 Inventory Management System

Web App จัดการสต็อกสินค้า Realtime — React + FastAPI + PostgreSQL

---

## 📁 โครงสร้างโปรเจค

```
inventory-app/
├── backend/          ← FastAPI (Deploy บน Render)
│   ├── main.py
│   ├── models.py
│   ├── crud.py
│   ├── database.py
│   ├── ws_manager.py
│   ├── routers/
│   │   ├── items.py
│   │   ├── receive.py
│   │   ├── issue.py
│   │   ├── qc.py
│   │   ├── project.py
│   │   └── analytics.py
│   ├── requirements.txt
│   └── render.yaml
└── frontend/         ← React + Vite (Deploy บน Vercel)
    ├── src/
    │   ├── App.jsx   ← ทุก Page อยู่ในไฟล์เดียว
    │   ├── main.jsx
    │   └── index.css
    ├── package.json
    ├── vite.config.js
    └── .env.example
```

---

## 🚀 วิธี Deploy (ฟรี 100%)

### STEP 1 — Upload โค้ดขึ้น GitHub

1. สร้าง GitHub account (ถ้ายังไม่มี) ที่ github.com
2. สร้าง Repository ใหม่ ชื่อ `inventory-app`
3. Upload โฟลเดอร์ทั้งหมดขึ้น GitHub

```bash
cd inventory-app
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/inventory-app.git
git push -u origin main
```

---

### STEP 2 — Deploy Backend บน Render (ฟรี)

1. เปิด [render.com](https://render.com) → Sign Up ด้วย GitHub
2. คลิก **New +** → **Web Service**
3. Connect GitHub repo ที่สร้างไว้
4. ตั้งค่าดังนี้:

| ฟิลด์ | ค่า |
|-------|-----|
| Name | `inventory-api` |
| Root Directory | `backend` |
| Runtime | `Python 3` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Instance Type | `Free` |

5. เพิ่ม **Environment Variables**:
   - `SECRET_KEY` = พิมพ์อะไรก็ได้ยาวๆ เช่น `mySuperSecretKey2024!`

6. เพิ่ม **PostgreSQL Database**:
   - คลิก **New +** → **PostgreSQL**
   - Name: `inventory-db`, Plan: `Free`
   - หลังสร้างเสร็จ → Copy **Internal Database URL**
   - ไปที่ Web Service → Environment → เพิ่ม `DATABASE_URL` = URL ที่ copy มา

7. คลิก **Create Web Service** → รอ Deploy ~3 นาที
8. จะได้ URL ประมาณ: `https://inventory-api.onrender.com`

> ⚠️ Free tier จะ Sleep หลังไม่มีคนใช้ 15 นาที ครั้งแรกอาจช้า ~30 วิ

---

### STEP 3 — Deploy Frontend บน Vercel (ฟรี)

1. เปิด [vercel.com](https://vercel.com) → Sign Up ด้วย GitHub
2. คลิก **Add New Project** → Import GitHub repo
3. ตั้งค่าดังนี้:

| ฟิลด์ | ค่า |
|-------|-----|
| Root Directory | `frontend` |
| Framework | `Vite` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

4. เพิ่ม **Environment Variables**:
   - `VITE_API_URL` = URL จาก Render เช่น `https://inventory-api.onrender.com`

5. คลิก **Deploy** → รอ ~1 นาที
6. จะได้ URL เช่น: `https://inventory-app.vercel.app`

---

## ✅ ทดสอบระบบ

เปิด URL จาก Vercel แล้ว Login ด้วย:

| Username | Password | สิทธิ์ |
|----------|----------|--------|
| `admin` | `admin1234` | ผู้ดูแลระบบ (ทำได้ทุกอย่าง) |
| `manager` | `manager1234` | ผู้จัดการคลัง |
| `staff1` | `staff1234` | พนักงาน (รับ/จ่าย/QC) |
| `viewer` | `viewer1234` | ดูรายงานอย่างเดียว |

---

## 🔌 Realtime คืออะไร?

ระบบใช้ **WebSocket** — เมื่อพนักงานคนหนึ่งบันทึก GRN หรือ Issue:
- ทุก Browser ที่เปิดอยู่จะอัพเดตสต็อกทันที
- Dashboard KPI เปลี่ยนแบบ Live
- ไม่ต้อง Refresh หน้า

---

## 📋 Features

| หน้า | ฟีเจอร์ |
|------|---------|
| 📊 Dashboard | KPI Realtime, ABC breakdown, Stock status |
| 📥 รับสินค้า/GRN | บันทึกรับสินค้า, QC Pass/Fail อัตโนมัติ |
| 📤 จ่ายสินค้า | ตรวจสต็อกก่อนจ่าย, แยก General/Project |
| 🔬 QC Hold | อนุมัติ/ปฏิเสธ QC, ดูวันที่ Hold |
| 🏗️ Project Stock | ดูสต็อกจองแต่ละ Project, % ใช้งาน |
| 📈 Analytics | Fast/Slow Moving, Stock Aging, ABC Analysis |

---

## 🛠️ รัน Local (สำหรับทดสอบ)

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
# เปิด http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
cp .env.example .env.local
# แก้ VITE_API_URL=http://localhost:8000
npm install
npm run dev
# เปิด http://localhost:3000
```
