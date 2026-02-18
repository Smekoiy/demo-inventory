from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum

class UserRole(str, enum.Enum):
    admin   = "admin"
    manager = "manager"
    staff   = "staff"
    viewer  = "viewer"

class ABCClass(str, enum.Enum):
    A = "A"; B = "B"; C = "C"

class QCStatus(str, enum.Enum):
    pending  = "pending"
    review   = "review"
    approved = "approved"
    rejected = "rejected"

class ProjectStatus(str, enum.Enum):
    planned   = "planned"
    active    = "active"
    completed = "completed"

class User(Base):
    __tablename__ = "users"
    id              = Column(Integer, primary_key=True)
    username        = Column(String(50), unique=True, nullable=False)
    full_name       = Column(String(100))
    hashed_password = Column(String(200), nullable=False)
    role            = Column(String(20), default="staff")
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime, server_default=func.now())

class Item(Base):
    __tablename__ = "items"
    id          = Column(Integer, primary_key=True)
    code        = Column(String(50), unique=True, nullable=False)
    name        = Column(String(200), nullable=False)
    category    = Column(String(100))
    uom         = Column(String(20))
    min_stock   = Column(Float, default=0)
    max_stock   = Column(Float, default=0)
    reorder_pt  = Column(Float, default=0)
    unit_cost   = Column(Float, default=0)
    supplier    = Column(String(200))
    lead_time   = Column(Integer, default=7)
    abc_class   = Column(String(1), default="C")
    qc_required = Column(Boolean, default=False)
    location    = Column(String(100))
    opening_bal = Column(Float, default=0)
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime, server_default=func.now())
    receives    = relationship("ReceiveLine", back_populates="item")
    issues      = relationship("IssueLine",   back_populates="item")
    qc_holds    = relationship("QCHold",      back_populates="item")
    proj_stocks = relationship("ProjectStock",back_populates="item")

class GRN(Base):
    __tablename__ = "grns"
    id          = Column(Integer, primary_key=True)
    grn_no      = Column(String(50), unique=True)
    po_no       = Column(String(50))
    supplier    = Column(String(200))
    receive_date= Column(DateTime, server_default=func.now())
    created_by  = Column(String(50))
    remarks     = Column(Text)
    lines       = relationship("ReceiveLine", back_populates="grn")

class ReceiveLine(Base):
    __tablename__ = "receive_lines"
    id           = Column(Integer, primary_key=True)
    grn_id       = Column(Integer, ForeignKey("grns.id"))
    item_id      = Column(Integer, ForeignKey("items.id"))
    qty_ordered  = Column(Float, default=0)
    qty_received = Column(Float, default=0)
    qty_pass_qc  = Column(Float, default=0)
    qty_fail_qc  = Column(Float, default=0)
    unit_cost    = Column(Float, default=0)
    created_at   = Column(DateTime, server_default=func.now())
    grn          = relationship("GRN",  back_populates="lines")
    item         = relationship("Item", back_populates="receives")

class IssueDoc(Base):
    __tablename__ = "issue_docs"
    id          = Column(Integer, primary_key=True)
    issue_no    = Column(String(50), unique=True)
    req_no      = Column(String(50))
    department  = Column(String(100))
    issue_date  = Column(DateTime, server_default=func.now())
    created_by  = Column(String(50))
    remarks     = Column(Text)
    lines       = relationship("IssueLine", back_populates="issue_doc")

class IssueLine(Base):
    __tablename__ = "issue_lines"
    id           = Column(Integer, primary_key=True)
    issue_doc_id = Column(Integer, ForeignKey("issue_docs.id"))
    item_id      = Column(Integer, ForeignKey("items.id"))
    qty_requested= Column(Float, default=0)
    qty_issued   = Column(Float, default=0)
    issue_type   = Column(String(20), default="General")
    project_code = Column(String(50))
    unit_cost    = Column(Float, default=0)
    created_at   = Column(DateTime, server_default=func.now())
    issue_doc    = relationship("IssueDoc", back_populates="lines")
    item         = relationship("Item",     back_populates="issues")

class QCHold(Base):
    __tablename__ = "qc_holds"
    id           = Column(Integer, primary_key=True)
    qc_ref       = Column(String(50), unique=True)
    grn_no       = Column(String(50))
    item_id      = Column(Integer, ForeignKey("items.id"))
    qty_hold     = Column(Float, default=0)
    reason       = Column(Text)
    status       = Column(String(20), default="pending")
    action       = Column(Text)
    receive_date = Column(DateTime, server_default=func.now())
    resolved_at  = Column(DateTime, nullable=True)
    created_by   = Column(String(50))
    item         = relationship("Item", back_populates="qc_holds")

class Project(Base):
    __tablename__ = "projects"
    id          = Column(Integer, primary_key=True)
    code        = Column(String(50), unique=True)
    name        = Column(String(200))
    start_date  = Column(DateTime)
    end_date    = Column(DateTime)
    status      = Column(String(20), default="planned")
    created_by  = Column(String(50))
    stocks      = relationship("ProjectStock", back_populates="project")

class ProjectStock(Base):
    __tablename__ = "project_stocks"
    id           = Column(Integer, primary_key=True)
    project_id   = Column(Integer, ForeignKey("projects.id"))
    item_id      = Column(Integer, ForeignKey("items.id"))
    qty_reserved = Column(Float, default=0)
    qty_issued   = Column(Float, default=0)
    unit_cost    = Column(Float, default=0)
    created_at   = Column(DateTime, server_default=func.now())
    project      = relationship("Project", back_populates="stocks")
    item         = relationship("Item",    back_populates="proj_stocks")
