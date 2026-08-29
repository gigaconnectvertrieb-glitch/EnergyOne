import asyncio
import base64
import csv
import io
import os
import secrets
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional

import pyotp
import qrcode
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, create_engine, func, inspect, or_, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

ISSUER = "E1 Direktvertrieb"
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./agentur.db")
if DATABASE_URL.startswith("postgresql"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {"connect_timeout": 10})
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
SECRET = os.getenv("JWT_SECRET")
if not SECRET:
    raise RuntimeError("JWT_SECRET muss gesetzt sein (keine unsichere Standardvorgabe mehr).")
GENERAL_ACCESS_KEY = os.getenv("GENERAL_ACCESS_KEY")
if not GENERAL_ACCESS_KEY:
    raise RuntimeError("GENERAL_ACCESS_KEY muss gesetzt sein (Generalschlüssel für den Notfallzugang).")
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
bearer = HTTPBearer()
STORAGE = Path("/app/storage" if Path("/app").exists() else "storage")
STORAGE.mkdir(parents=True, exist_ok=True)

class Base(DeclarativeBase): pass
class Employee(Base):
    __tablename__ = "mitarbeiter"
    id: Mapped[int] = mapped_column(primary_key=True); username: Mapped[str] = mapped_column(String(64), unique=True); email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True); totp_secret: Mapped[str] = mapped_column(String(64)); role: Mapped[str] = mapped_column(String(32), default="vertrieb"); name: Mapped[str] = mapped_column(String(120)); phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True); commission_rate: Mapped[float] = mapped_column(Float, default=0); tier: Mapped[int] = mapped_column(Integer, default=1); vp_nummer: Mapped[Optional[str]] = mapped_column(String(30), nullable=True); active: Mapped[bool] = mapped_column(Boolean, default=True); last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True); show_on_website: Mapped[bool] = mapped_column(Boolean, default=False); photo_storage_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
class Settings(Base):
    __tablename__ = "einstellungen"
    id: Mapped[int] = mapped_column(primary_key=True); master_key_hash: Mapped[str] = mapped_column(String(255))
class Customer(Base):
    __tablename__ = "kunden"
    id: Mapped[int] = mapped_column(primary_key=True); kind: Mapped[str] = mapped_column(String(10)); first_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True); last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True); company: Mapped[Optional[str]] = mapped_column(String(160), nullable=True); contact_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True); email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True); phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True); postal_code: Mapped[str] = mapped_column(String(10)); street: Mapped[Optional[str]] = mapped_column(String(200), nullable=True); city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True); current_provider_id: Mapped[Optional[int]] = mapped_column(ForeignKey("anbieter.id"), nullable=True); usage_kwh: Mapped[float] = mapped_column(Float, default=0); status: Mapped[str] = mapped_column(String(40), default="neu"); owner_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id")); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
class CustomerHistory(Base):
    __tablename__ = "kunden_history"
    id: Mapped[int] = mapped_column(primary_key=True); customer_id: Mapped[int] = mapped_column(ForeignKey("kunden.id")); employee_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id")); detail: Mapped[str] = mapped_column(Text); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
class Task(Base):
    __tablename__ = "aufgaben"
    id: Mapped[int] = mapped_column(primary_key=True); title: Mapped[str] = mapped_column(String(200)); description: Mapped[str] = mapped_column(Text, default=""); creator_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id")); assignee_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id")); due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True); status: Mapped[str] = mapped_column(String(20), default="offen"); customer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("kunden.id"), nullable=True); completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
class Activity(Base):
    __tablename__ = "aktivitaeten_log"
    id: Mapped[int] = mapped_column(primary_key=True); employee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("mitarbeiter.id"), nullable=True); action: Mapped[str] = mapped_column(String(120)); detail: Mapped[str] = mapped_column(Text, default=""); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
class JobApplication(Base):
    __tablename__ = "bewerbungen"
    id: Mapped[int] = mapped_column(primary_key=True); name: Mapped[str] = mapped_column(String(150)); email: Mapped[str] = mapped_column(String(255)); phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True); message: Mapped[str] = mapped_column(Text, default=""); photo_storage_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow); seen: Mapped[bool] = mapped_column(Boolean, default=False)

class Login(BaseModel): username: str; code: str
class EmployeeIn(BaseModel): email: Optional[EmailStr] = None; name: str; role: Literal["admin", "vertrieb", "support", "buchhaltung"] = "vertrieb"; commission_rate: float = 0; tier: int = Field(default=1, ge=1, le=3); phone: Optional[str] = None
class MasterKeyIn(BaseModel): new_key: Optional[str] = Field(default=None, min_length=8, max_length=200)
class CustomerIn(BaseModel): kind: Literal["privat", "firma"]; first_name: Optional[str] = None; last_name: Optional[str] = None; company: Optional[str] = None; contact_name: Optional[str] = None; email: EmailStr; phone: Optional[str] = None; postal_code: str; street: Optional[str] = None; city: Optional[str] = None; current_provider_id: Optional[int] = None; usage_kwh: float = 0; status: str = "neu"; owner_id: Optional[int] = None
class CustomerUpdateIn(BaseModel):
    kind: Optional[Literal["privat", "firma"]] = None; first_name: Optional[str] = None; last_name: Optional[str] = None; company: Optional[str] = None; contact_name: Optional[str] = None; email: Optional[EmailStr] = None; phone: Optional[str] = None; postal_code: Optional[str] = None; street: Optional[str] = None; city: Optional[str] = None; current_provider_id: Optional[int] = None; usage_kwh: Optional[float] = None; status: Optional[str] = None
class TaskIn(BaseModel): title: str; description: str = ""; assignee_id: int; due_date: Optional[date] = None; customer_id: Optional[int] = None

app = FastAPI(title="E1 Direktvertrieb Vertriebsportal", version="1.0.0")
@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}
def db():
    s = SessionLocal()
    try: yield s
    finally: s.close()
def token_for(e: Employee): return jwt.encode({"sub": str(e.id), "role": e.role, "exp": datetime.now(timezone.utc) + timedelta(hours=24)}, SECRET, algorithm="HS256")
def current(c: HTTPAuthorizationCredentials = Depends(bearer), s: Session = Depends(db)):
    try: eid = int(jwt.decode(c.credentials, SECRET, algorithms=["HS256"])["sub"])
    except (JWTError, ValueError): raise HTTPException(401, "Ungültige Anmeldung")
    e = s.get(Employee, eid)
    if not e or not e.active: raise HTTPException(401, "Konto nicht verfügbar")
    return e
def admin(e: Employee = Depends(current)):
    if e.role != "admin": raise HTTPException(403, "Admin-Berechtigung erforderlich")
    return e
def serialize(x):
    return {c.name: (getattr(x,c.name).isoformat() if isinstance(getattr(x,c.name),(date,datetime)) else getattr(x,c.name)) for c in x.__table__.columns}
def serialize_employee(x): return {k: v for k, v in serialize(x).items() if k != "totp_secret"}
def log(s, emp, action, detail=""): s.add(Activity(employee_id=emp.id if emp else None, action=action, detail=detail))
def make_pdf(name, title, lines):
    path = STORAGE / name; p = canvas.Canvas(str(path), pagesize=A4); p.setTitle(title); p.setFont("Helvetica-Bold", 18); p.drawString(50, 800, title); p.setFont("Helvetica", 11); y=765
    for line in lines: p.drawString(50, y, str(line)[:115]); y -= 20
    p.save(); return f"/files/{name}"
def totp_setup(username: str, secret: str):
    uri = pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=ISSUER)
    buf = io.BytesIO(); qrcode.make(uri).save(buf, format="PNG")
    return {"totp_provisioning_uri": uri, "totp_qr_base64": base64.b64encode(buf.getvalue()).decode(), "totp_secret": secret}

_login_attempts: dict[str, tuple[int, float]] = {}
def check_rate_limit(username: str):
    count, locked_until = _login_attempts.get(username, (0, 0.0))
    if time.time() < locked_until: raise HTTPException(429, "Zu viele Fehlversuche, bitte kurz warten")
def register_failed_login(username: str):
    count, _ = _login_attempts.get(username, (0, 0.0)); count += 1
    _login_attempts[username] = (count, time.time() + 60 if count >= 5 else 0.0)
def reset_login_attempts(username: str): _login_attempts.pop(username, None)

def migrate_columns():
    inspector = inspect(engine); existing_tables = set(inspector.get_table_names())
    is_pg = engine.dialect.name == "postgresql"
    def run(sql: str):
        with engine.begin() as conn:
            if is_pg: conn.execute(text("SET LOCAL lock_timeout = '5s'"))
            conn.execute(text(sql))
    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables: continue
        existing_cols = {c["name"] for c in inspector.get_columns(table.name)}
        for col in table.columns:
            if col.name in existing_cols: continue
            try: run(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col.type.compile(engine.dialect)}')
            except Exception as ex: print(f"[MIGRATE WARN] {table.name}.{col.name}: {type(ex).__name__}: {ex}", flush=True)
    if "mitarbeiter" in existing_tables and "password_hash" in {c["name"] for c in inspector.get_columns("mitarbeiter")}:
        try: run('ALTER TABLE "mitarbeiter" DROP COLUMN "password_hash"')
        except Exception: pass
    if "kunden" in existing_tables:
        try: run('ALTER TABLE "kunden" ALTER COLUMN "email" DROP NOT NULL')
        except Exception: pass

class ConnectionManager:
    def __init__(self): self.connections: list[WebSocket] = []
    async def connect(self, ws: WebSocket):
        await ws.accept(); self.connections.append(ws)
    def disconnect(self, ws: WebSocket):
        if ws in self.connections: self.connections.remove(ws)
    async def broadcast(self, message: str):
        dead = []
        for ws in self.connections:
            try: await ws.send_text(message)
            except Exception: dead.append(ws)
        for ws in dead: self.disconnect(ws)
manager = ConnectionManager()
MAIN_LOOP: Optional[asyncio.AbstractEventLoop] = None
def notify_update(kind: str = "update"):
    if MAIN_LOOP: asyncio.run_coroutine_threadsafe(manager.broadcast(kind), MAIN_LOOP)

@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket, token: str = ""):
    try: eid = int(jwt.decode(token, SECRET, algorithms=["HS256"])["sub"])
    except (JWTError, ValueError):
        await websocket.close(code=4001); return
    await manager.connect(websocket)
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.on_event("startup")
def startup():
    global MAIN_LOOP
    MAIN_LOOP = asyncio.get_event_loop()
    migrate_columns()
    Base.metadata.create_all(engine)
    with SessionLocal() as s:
        if not s.get(Settings, 1):
            s.add(Settings(id=1, master_key_hash=pwd.hash(GENERAL_ACCESS_KEY))); s.commit()
        for emp in s.scalars(select(Employee).where(Employee.username.is_(None))):
            emp.username = (emp.email or f"mitarbeiter{emp.id}").split("@")[0]
        s.commit()
        for emp in s.scalars(select(Employee).where(Employee.totp_secret.is_(None))):
            emp.totp_secret = pyotp.random_base32()
            print(f"[SETUP] Neues TOTP für {emp.username}: {totp_setup(emp.username, emp.totp_secret)['totp_provisioning_uri']}")
        s.commit()
        for emp in s.scalars(select(Employee).where(Employee.tier.is_(None))):
            emp.tier = 1
        s.commit()
        if not s.scalar(select(Employee.id).limit(1)):
            username = os.getenv("ADMIN_USERNAME", "admin"); secret = pyotp.random_base32()
            e=Employee(username=username,email=os.getenv("ADMIN_EMAIL"),totp_secret=secret,role="admin",name="Administrator",commission_rate=0); s.add(e); s.commit()
            print(f"[SETUP] Erster Admin-Zugang: Benutzername={username}")
            print(f"[SETUP] TOTP einrichten: {totp_setup(username, secret)['totp_provisioning_uri']}")

@app.post("/api/auth/login")
def login(data: Login, s: Session = Depends(db)):
    check_rate_limit(data.username)
    e=s.scalar(select(Employee).where(Employee.username==data.username))
    if not e or not e.active:
        register_failed_login(data.username); raise HTTPException(401,"Benutzername oder Code falsch")
    settings=s.get(Settings,1)
    used_master_key = bool(settings) and pwd.verify(data.code, settings.master_key_hash)
    if not used_master_key and not pyotp.TOTP(e.totp_secret).verify(data.code, valid_window=1):
        register_failed_login(data.username); raise HTTPException(401,"Benutzername oder Code falsch")
    reset_login_attempts(data.username); e.last_login=datetime.utcnow()
    if used_master_key: log(s,e,"Notfallzugang (Generalschlüssel)",data.username)
    s.commit(); return {"access_token":token_for(e),"employee":serialize_employee(e)}
@app.get("/api/me")
def me(e: Employee = Depends(current)): return serialize_employee(e)
@app.post("/api/auth/master-key")
def rotate_master_key(data: MasterKeyIn, e: Employee=Depends(admin), s: Session=Depends(db)):
    new_key = data.new_key or secrets.token_urlsafe(12)
    settings=s.get(Settings,1)
    if settings: settings.master_key_hash=pwd.hash(new_key)
    else: s.add(Settings(id=1,master_key_hash=pwd.hash(new_key)))
    log(s,e,"Generalschlüssel geändert"); s.commit(); return {"status":"ok","new_key":new_key}
@app.get("/api/dashboard")
def dashboard(e: Employee = Depends(current), s: Session = Depends(db)):
    scope = [] if e.role=="admin" else [Customer.owner_id==e.id]
    customers=s.scalar(select(func.count(Customer.id)).where(*scope)) or 0
    tasks=s.scalar(select(func.count(Task.id)).where(Task.assignee_id==e.id, Task.status!="erledigt")) or 0
    return {"customers":customers,"open_tasks":tasks,"activities":[serialize(x) for x in s.scalars(select(Activity).order_by(Activity.created_at.desc()).limit(10))]}
@app.get("/api/customers")
def customers(q: str="", limit: int=100, offset: int=0, e: Employee=Depends(current), s: Session=Depends(db)):
    stmt=select(Customer).where(or_(Customer.email.ilike(f"%{q}%"),Customer.last_name.ilike(f"%{q}%"),Customer.company.ilike(f"%{q}%"))) if q else select(Customer)
    if e.role!="admin": stmt=stmt.where(Customer.owner_id==e.id)
    return [serialize(x) for x in s.scalars(stmt.order_by(Customer.created_at.desc()).limit(limit).offset(offset))]
@app.post("/api/customers")
def create_customer(data: CustomerIn, e: Employee=Depends(current), s: Session=Depends(db)):
    owner=data.owner_id if e.role=="admin" and data.owner_id else e.id; c=Customer(**data.model_dump(exclude={"owner_id"}),owner_id=owner); s.add(c); s.flush(); s.add(CustomerHistory(customer_id=c.id,employee_id=e.id,detail="Kunde angelegt")); log(s,e,"Kunde angelegt",str(c.id)); s.commit(); notify_update(); return serialize(c)
@app.put("/api/customers/{customer_id}")
def update_customer(customer_id: int, data: CustomerUpdateIn, e: Employee=Depends(current), s: Session=Depends(db)):
    c=s.get(Customer,customer_id)
    if not c: raise HTTPException(404,"Kunde nicht gefunden")
    if e.role!="admin" and c.owner_id!=e.id: raise HTTPException(403,"Keine Berechtigung")
    if data.status is not None and e.role!="admin": raise HTTPException(403,"Nur Admin darf den Status ändern")
    for field,value in data.model_dump(exclude_unset=True).items(): setattr(c,field,value)
    s.add(CustomerHistory(customer_id=c.id,employee_id=e.id,detail="Kunde bearbeitet")); log(s,e,"Kunde bearbeitet",str(c.id)); s.commit(); notify_update(); return serialize(c)
@app.get("/api/employees")
def employees(_: Employee=Depends(admin), s: Session=Depends(db)): return [serialize_employee(x) for x in s.scalars(select(Employee).order_by(Employee.name))]
def generate_vp_nummer(s: Session) -> str:
    n = (s.scalar(select(func.count(Employee.id))) or 0) + 10001
    while s.scalar(select(Employee.id).where(Employee.username==str(n))): n += 1
    return str(n)
@app.post("/api/employees")
def create_employee(data: EmployeeIn, e: Employee=Depends(admin), s: Session=Depends(db)):
    vp = generate_vp_nummer(s)
    secret=pyotp.random_base32(); x=Employee(**data.model_dump(),username=vp,vp_nummer=vp,totp_secret=secret); s.add(x); log(s,e,"Mitarbeiter angelegt",vp); s.commit(); notify_update()
    return {**serialize_employee(x), **totp_setup(x.username, secret)}
@app.post("/api/employees/{employee_id}/reset-totp")
def reset_totp(employee_id: int, e: Employee=Depends(admin), s: Session=Depends(db)):
    x=s.get(Employee,employee_id)
    if not x: raise HTTPException(404,"Mitarbeiter nicht gefunden")
    x.totp_secret=pyotp.random_base32(); log(s,e,"TOTP zurückgesetzt",x.username); s.commit()
    return totp_setup(x.username, x.totp_secret)
@app.post("/api/employees/{employee_id}/toggle-active")
def toggle_employee_active(employee_id: int, e: Employee=Depends(admin), s: Session=Depends(db)):
    x=s.get(Employee,employee_id)
    if not x: raise HTTPException(404,"Mitarbeiter nicht gefunden")
    if x.id==e.id: raise HTTPException(400,"Eigenen Account nicht deaktivieren")
    x.active=not x.active; log(s,e,"Mitarbeiter deaktiviert" if not x.active else "Mitarbeiter aktiviert",x.username); s.commit(); notify_update()
    return serialize_employee(x)
@app.get("/api/tasks")
def tasks(e: Employee=Depends(current), s: Session=Depends(db)):
    stmt=select(Task) if e.role=="admin" else select(Task).where(Task.assignee_id==e.id)
    return [serialize(x) for x in s.scalars(stmt.order_by(Task.due_date))]
@app.post("/api/tasks")
def create_task(data: TaskIn,e: Employee=Depends(current),s: Session=Depends(db)):
    if e.role!="admin" and data.assignee_id!=e.id: raise HTTPException(403,"Keine Berechtigung")
    x=Task(**data.model_dump(),creator_id=e.id);s.add(x);log(s,e,"Aufgabe angelegt",data.title);s.commit();return serialize(x)
@app.put("/api/employees/{employee_id}")
def update_employee(employee_id: int, data: dict, e: Employee=Depends(admin), s: Session=Depends(db)):
    x=s.get(Employee,employee_id)
    if not x: raise HTTPException(404,"Mitarbeiter nicht gefunden")
    for field in ("name","phone","commission_rate","tier","vp_nummer","role","active","email","show_on_website"):
        if field in data: setattr(x,field,data[field])
    log(s,e,"Mitarbeiter geändert",x.username); s.commit(); notify_update(); return serialize_employee(x)
@app.post("/api/employees/{employee_id}/photo")
def upload_employee_photo(employee_id: int, file: UploadFile = File(...), e: Employee=Depends(admin), s: Session=Depends(db)):
    x=s.get(Employee,employee_id)
    if not x: raise HTTPException(404,"Mitarbeiter nicht gefunden")
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    if ext not in (".jpg",".jpeg",".png",".webp"): raise HTTPException(422,"Nur JPG/PNG/WEBP erlaubt")
    storage_name = f"photo-{employee_id}-{secrets.token_hex(6)}{ext}"
    (STORAGE / storage_name).write_bytes(file.file.read())
    x.photo_storage_name = storage_name
    log(s,e,"Mitarbeiterfoto hochgeladen",x.username); s.commit(); notify_update()
    return serialize_employee(x)
@app.get("/api/employees/{employee_id}/photo")
def employee_photo(employee_id: int, s: Session=Depends(db)):
    x=s.get(Employee,employee_id)
    if not x or not x.photo_storage_name: raise HTTPException(404,"Kein Foto")
    p = STORAGE / x.photo_storage_name
    if not p.exists(): raise HTTPException(404,"Kein Foto")
    ext = p.suffix.lower()
    media = {"jpg":"image/jpeg",".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".webp":"image/webp"}.get(ext,"application/octet-stream")
    return Response(p.read_bytes(), media_type=media)
@app.get("/api/public/team")
def public_team(s: Session=Depends(db)):
    rows = s.scalars(select(Employee).where(Employee.show_on_website.is_(True), Employee.active.is_(True)).order_by(Employee.role.desc(), Employee.name))
    return [{"name":x.name, "role": "Teamleitung" if x.role=="admin" else "Vertriebsberater:in", "tier": x.tier, "has_photo": bool(x.photo_storage_name), "photo_url": f"/api/employees/{x.id}/photo" if x.photo_storage_name else None} for x in rows]
@app.get("/api/admin/applications")
def list_applications(_: Employee=Depends(admin), s: Session=Depends(db)):
    rows = s.scalars(select(JobApplication).order_by(JobApplication.created_at.desc()))
    return [{**serialize(x), "photo_url": f"/api/admin/applications/{x.id}/photo" if x.photo_storage_name else None} for x in rows]
@app.post("/api/admin/applications/{application_id}/seen")
def mark_application_seen(application_id: int, e: Employee=Depends(admin), s: Session=Depends(db)):
    x = s.get(JobApplication, application_id)
    if not x: raise HTTPException(404, "Bewerbung nicht gefunden")
    x.seen = True; s.commit(); return serialize(x)
@app.get("/api/export/customers.csv")
def export_customers(_:Employee=Depends(admin),s:Session=Depends(db)):
    rows=[serialize(x) for x in s.scalars(select(Customer))];out=io.StringIO(); w=csv.DictWriter(out,fieldnames=rows[0].keys() if rows else ["id"]);w.writeheader();w.writerows(rows);return Response(out.getvalue(),media_type="text/csv",headers={"Content-Disposition":"attachment; filename=kunden.csv"})
@app.get("/files/{name}")
def files(name:str):
    p=STORAGE/name
    if not p.exists() or p.parent != STORAGE: raise HTTPException(404,"Datei nicht gefunden")
    return Response(p.read_bytes(),media_type="application/pdf")
@app.get("/static/logo.svg")
def static_logo():
    p = Path(__file__).parent / "static" / "logo.svg"
    return Response(p.read_bytes(), media_type="image/svg+xml")
@app.get("/static/logo-icon.png")
def static_logo_icon():
    p = Path(__file__).parent / "static" / "logo-icon.png"
    return Response(p.read_bytes(), media_type="image/png")
@app.get("/", response_class=HTMLResponse)
def home(): return LANDING_HTML
@app.get("/login", response_class=HTMLResponse)
def employee_login_page(): return HTML
@app.get("/admin", response_class=HTMLResponse)
def admin_login_page(): return HTML_ADMIN
@app.get("/karriere", response_class=HTMLResponse)
def karriere_page(): return KARRIERE_HTML
@app.get("/impressum", response_class=HTMLResponse)
def impressum_page(): return IMPRESSUM_HTML
@app.get("/datenschutz", response_class=HTMLResponse)
def datenschutz_page(): return DATENSCHUTZ_HTML

CSS = '''*{box-sizing:border-box}body{font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto;margin:0;background:#f3f2fa;color:#1c1a2e}
header{background:linear-gradient(100deg,#12102a,#221c4d 60%,#2d1f5e);color:#fff;padding:14px 24px;display:flex;justify-content:space-between;align-items:center;gap:14px;box-shadow:0 4px 18px rgba(20,10,60,.25);position:sticky;top:0;z-index:20}
header b{letter-spacing:.2px;display:inline-flex;align-items:center;gap:8px}
.badge{background:rgba(255,255,255,.14);padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.4px;margin-left:10px;text-transform:uppercase;vertical-align:middle}
.headerRight{display:flex;align-items:center;gap:14px;margin-left:auto}
.shell{display:flex;max-width:1300px;margin:0 auto;min-height:calc(100vh - 60px)}
.navcol{width:225px;flex:none;padding:20px 12px;display:flex;flex-direction:column;gap:4px;position:sticky;top:60px;align-self:flex-start;height:calc(100vh - 60px);overflow-y:auto}
.navbtn{display:flex;align-items:center;gap:10px;background:transparent;color:#4b4768;border:0;text-align:left;padding:11px 14px;border-radius:12px;font-weight:600;font-size:14px;cursor:pointer;margin:0;transition:background .18s,color .18s,transform .12s}
.navbtn:hover{background:#efeafd;color:#7c3aed;transform:translateX(2px)}
.navbtn.active{background:linear-gradient(90deg,#7c3aed,#2563eb);color:#fff;box-shadow:0 6px 16px -6px rgba(124,58,237,.6)}
.pages{flex:1;min-width:0;padding:20px 24px 60px;overflow:hidden}
.page{display:none}
.page.active{display:block;animation:pageIn .4s cubic-bezier(.22,1,.36,1) both}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px}
.card,section{background:#fff;border-radius:16px;padding:20px;margin:0 0 18px;box-shadow:0 4px 16px -6px rgba(30,20,70,.12);overflow-x:auto;animation:fadeUp .4s ease both;transition:box-shadow .2s,transform .2s}
.card:hover{box-shadow:0 10px 24px -8px rgba(30,20,70,.2);transform:translateY(-2px)}
.n{font-size:30px;font-weight:800;background:linear-gradient(90deg,#7c3aed,#2563eb);-webkit-background-clip:text;background-clip:text;color:transparent}
input,select,button{padding:10px 12px;margin:4px 4px 4px 0;border:1px solid #dcd9ec;border-radius:10px;font:inherit}
input:focus,select:focus{outline:none;border-color:#8b5cf6;box-shadow:0 0 0 3px rgba(139,92,246,.15)}
button{background:linear-gradient(90deg,#7c3aed,#2563eb);color:#fff;border:0;cursor:pointer;font-weight:600;transition:transform .12s,opacity .12s}
button:hover{opacity:.92;transform:translateY(-1px)}
button:active{transform:translateY(0)}
table{width:100%;border-collapse:collapse}
td,th{padding:9px 8px;border-bottom:1px solid #f0eef8;text-align:left}
tr:hover td{background:#faf9ff}
.hidden{display:none}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes pageIn{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
#login.fadeOut{opacity:0;transform:scale(.98);transition:opacity .35s,transform .35s}
#login.hidden{display:none}
.loginWrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(circle at 50% 0%,#161c2b,#0d1320 60%);transition:opacity .35s,transform .35s}
.loginBox{width:100%;max-width:380px;text-align:center;animation:fadeUp .5s ease both}
.loginIconImg{width:88px;height:auto;margin:0 auto 14px;display:block}
.loginWordmark{font-size:24px;font-weight:700;color:#fff;letter-spacing:.3px;margin-bottom:6px}
.loginWordmark b{color:#f5b942}
.loginTag{color:#8a7550;font-size:11.5px;letter-spacing:1px;margin:0 0 32px}
.loginStep{display:none}
.loginStep.active{display:block;animation:fadeUp .3s ease both}
.loginBox input{width:100%;box-sizing:border-box;background:#171d2c;border:1px solid #34405c;color:#fff;padding:15px 16px;font-size:15px;outline:none;margin:0 0 14px;border-radius:12px;text-align:center;letter-spacing:.5px}
.loginBox input::placeholder{color:#6b7590}
.loginBox input:focus{border-color:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.2)}
.loginBox button{width:100%;background:linear-gradient(90deg,#f59e0b,#ea580c);border:0;color:#0d1320;padding:14px;border-radius:12px;font-weight:700;cursor:pointer;font-size:15px;margin:4px 0 0}
.loginVpShown{color:#9ca3b8;font-size:13px;margin-bottom:14px}
.loginVpShown a{color:#fbbf24;text-decoration:none;margin-left:6px}
.loginHint{color:#5b6478;font-size:12px;margin-top:22px;line-height:1.5}
.loginHint a{color:#8f97ab}
.internalLoginBtn{display:block;margin:22px auto 0;width:fit-content;padding:9px 18px;border:1px solid #34405c;border-radius:999px;color:#9ca3b8;font-size:12.5px;font-weight:600;text-decoration:none;transition:border-color .15s,color .15s}
.internalLoginBtn:hover{border-color:#f59e0b;color:#fbbf24}
.adminLoginWrap{background:radial-gradient(circle at 50% 0%,#1c2230,#090a0d 60%)}
.abar{background:#eef0f7;border-radius:8px;overflow:hidden;height:18px}
.abar>div{height:100%;width:0;transition:width 1s cubic-bezier(.22,1,.36,1);background:linear-gradient(90deg,#7c3aed,#2563eb)}
.chatWrap{display:flex;flex-direction:column;gap:10px;max-height:420px;overflow-y:auto;padding:6px 2px;margin-bottom:10px}
.bubble{max-width:78%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.45;white-space:pre-wrap;animation:fadeUp .25s ease both}
.bubble.user{align-self:flex-end;background:linear-gradient(90deg,#7c3aed,#2563eb);color:#fff;border-bottom-right-radius:4px}
.bubble.bot{align-self:flex-start;background:#f1f0f8;color:#1c1a2e;border-bottom-left-radius:4px}
.chatBar{display:flex;gap:6px;align-items:center}
.chatBar input{flex:1;margin:0}
.fileBtn{cursor:pointer;padding:10px 12px;border:1px solid #dcd9ec;border-radius:10px;background:#f6f5fb}
.pageHead{margin-bottom:20px;padding-left:16px;border-left:4px solid var(--pageAccent,#7c3aed)}
.pageHead h1{font-size:24px;margin:0 0 4px}
.pageHead p{margin:0;color:#6b6885;font-size:13.5px}
.grid .card{border-top:3px solid var(--kpiAccent,#7c3aed)}
.empty{color:#8f8ca8;font-size:13.5px;padding:8px 0}
.searchHit{display:inline-block;background:#f6f5fb;border:1px solid #e3e0f5;border-radius:10px;padding:6px 12px;margin:3px;cursor:pointer;font-size:13px;font-weight:600;color:#4b4768;transition:background .15s,color .15s}
.searchHit:hover{background:#7c3aed;color:#fff}
#coachBubble{position:fixed;bottom:24px;right:24px;width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#2563eb);display:flex;align-items:center;justify-content:center;font-size:26px;cursor:pointer;box-shadow:0 10px 30px -8px rgba(124,58,237,.6);z-index:60;transition:transform .18s}
#coachBubble:hover{transform:scale(1.08)}
#coachBubble.hidden{display:none}
#coachWindow{position:fixed;bottom:96px;right:24px;width:370px;max-width:calc(100vw - 32px);background:#fff;border-radius:18px;box-shadow:0 24px 60px -12px rgba(20,10,60,.4);z-index:60;display:flex;flex-direction:column;overflow:hidden;max-height:min(560px,70vh);animation:fadeUp .25s ease both}
#coachWindow.hidden{display:none}
.coachWinHeader{background:linear-gradient(90deg,#7c3aed,#2563eb);color:#fff;padding:13px 16px;font-weight:700;font-size:14px;display:flex;justify-content:space-between;align-items:center;cursor:move;user-select:none}
.coachWinHeader span{display:flex;align-items:center;gap:8px}
.coachWinClose{background:transparent;border:0;color:#fff;font-size:15px;cursor:pointer;padding:2px;margin:0}
#coachWindow .chatWrap{padding:14px;margin:0;max-height:none;flex:1;min-height:120px}
#coachWindow .chatBar{padding:0 14px 12px}
@media(max-width:480px){#coachWindow{right:16px;left:16px;width:auto}}
@media(max-width:900px){.shell{flex-direction:column}.navcol{position:static;flex-direction:row;overflow-x:auto;width:100%;height:auto;padding:10px}.navbtn{white-space:nowrap}}'''

NAV = '''<nav class="navcol">
<button class="navbtn active" id="navDashboard" onclick="showPage('dashboard',this)">📊 Dashboard</button>
<button class="navbtn hidden" id="navAufgaben" onclick="showPage('aufgaben',this)">✅ Aufgaben</button>
<button class="navbtn hidden" id="navMitarbeiter" onclick="showPage('mitarbeiter',this)">👥 Mitarbeiter</button>
<button class="navbtn hidden" id="navProvision" onclick="showPage('provision',this)">💶 Provision</button>
<button class="navbtn hidden" id="navZiele" onclick="showPage('ziele',this)">🎯 Ziele &amp; Incentives</button>
<button class="navbtn hidden" id="navLoginzugaenge" onclick="showPage('loginzugaenge',this)">🔑 Loginzugänge</button>
<button class="navbtn hidden" id="navBuchhaltung" onclick="showPage('buchhaltung',this)">🧾 Buchhaltung</button>
<button class="navbtn" id="navLernpfad" onclick="showPage('lernpfad',this)">🎓 Lernpfad &amp; KI</button>
</nav>'''

PAGE_DASHBOARD = '''<div class="page active" id="page-dashboard">
<div class="pageHead" style="--pageAccent:#7c3aed"><h1 id="dashTitle">Dashboard</h1><p id="dashSub">Deine Zahlen auf einen Blick.</p></div>
<div class="grid" id="kpis"></div>
<div id="empDashboardExtra" class="hidden">
<section><h2>Neuer Kunde</h2><input id="custName" placeholder="Name / Firma"><input id="mail" placeholder="E-Mail"><input id="cphone" placeholder="Telefon"><input id="plz" placeholder="PLZ"><input id="street" placeholder="Straße, Nr."><input id="city" placeholder="Ort"><input id="usage" placeholder="Verbrauch kWh" type="number"><select id="kind"><option value="privat">Privat</option><option value="firma">Firma</option></select><select id="curProvider"><option value="">Aktueller Anbieter (optional)</option></select><button id="custSubmitBtn" onclick="customer()">Anlegen</button></section>
<section><h2>Meine Kunden</h2><table><thead><tr><th>Name</th><th>Status</th><th>PLZ</th><th></th></tr></thead><tbody id="customers"></tbody></table></section>
<section><h2>Abschluss melden</h2><select id="clCustomerId" onchange="fillClosureFromCustomer()"><option value="">Neuer Kunde (unten eintragen)</option></select><span id="clNewCustomerFields"><input id="clCustName" placeholder="Kundenname"><input id="clPlz" placeholder="PLZ"><input id="clPhone" placeholder="Telefonnummer"></span><br><select id="clProviderId" onchange="loadClTariffs()"><option value="">Anbieter wählen</option></select><select id="clTariffId" onchange="updateLiveCommission()"><option value="">Tarif wählen</option></select><select id="clProduct"><option value="strom">Strom</option><option value="gas">Gas</option></select><select id="clKind"><option value="privat">Privat</option><option value="firma">Firma</option></select><input id="clUsage" placeholder="Verbrauch kWh" type="number" oninput="updateLiveCommission()"><input id="clNote" placeholder="Bemerkung (optional)"><div id="clCommissionPreview"></div><button onclick="submitClosure()">Melden</button><p id="closureResult"></p></section>
<section><h2>Meine Tagesmeldung</h2><label>Datum <input id="dailyDate" type="date"></label><button onclick="changeDaily(-1,'contracts')">−</button><b id="contractsCount">0</b><button onclick="changeDaily(1,'contracts')">+</button> Verträge <button onclick="changeDaily(-1,'cancellations')">−</button><b id="cancellationsCount">0</b><button onclick="changeDaily(1,'cancellations')">+</button> Stornos<br><input id="dailyNote" placeholder="Bemerkung (optional)"><button onclick="saveDaily()">Tagesmeldung speichern</button><p id="dailyResult"></p></section>
<section><h2>Meine Provisionen &amp; Vertragsstatus</h2><div class="grid" id="commissionKpis"></div><table><thead><tr><th>Kunde</th><th>Produkt</th><th>Datum</th><th>Status</th><th>Provision</th></tr></thead><tbody id="closureList"></tbody></table></section>
<section><h2>Team-Rangliste</h2><p><small>Wer steht wo — zur gegenseitigen Motivation.</small></p><div id="teamLeaderboard"></div></section>
<section><h2>Provision suchen</h2><p><small>Anbieter eingeben, um die Provision je Stufe für alle Tarife zu sehen.</small></p><input id="provSearchInput" placeholder="Anbieter suchen (z. B. Vattenfall)" oninput="searchProvider('')"><div id="provSearchResults"></div><div id="provCommissionResult"></div></section>
<section><h2>Meine Unterlagen</h2><select id="myDocCategory"><option value="gewerbeanmeldung">Gewerbeanmeldung</option><option value="fuehrungszeugnis">Führungszeugnis</option><option value="rechnung">Rechnung/Beleg</option><option value="sonstiges">Sonstiges</option></select><input id="myDocFile" type="file"><label>Ablaufdatum (optional) <input id="myDocExpires" type="date"></label><button onclick="uploadMyDocument()">Hochladen</button><table><thead><tr><th>Kategorie</th><th>Datei</th><th>Ablauf</th><th></th></tr></thead><tbody id="myDocumentList"></tbody></table></section>
</div>
<section id="adminDashboard" class="hidden"><h2>Team-Übersicht <button onclick="exportTeamCsv()" style="float:right">CSV exportieren</button></h2><div id="teamBars"></div></section>
<section id="adminDailyOverview" class="hidden"><h2>Tagesmeldungen (alle Mitarbeiter)</h2><table><thead><tr><th>Datum</th><th>Mitarbeiter</th><th>Verträge</th><th>Stornos</th><th>Netto</th></tr></thead><tbody id="allDailyList"></tbody></table></section>
</div>'''

PAGE_AUFGABEN = '''<div class="page" id="page-aufgaben">
<div class="pageHead" style="--pageAccent:#16a34a"><h1>Aufgaben</h1><p>Kunden, Termine und offene Aufgaben der Agentur.</p></div>
<section><h2>Neuer Kunde</h2><input id="custName2" placeholder="Name / Firma"><input id="mail2" placeholder="E-Mail"><input id="cphone2" placeholder="Telefon"><input id="plz2" placeholder="PLZ"><input id="street2" placeholder="Straße, Nr."><input id="city2" placeholder="Ort"><input id="usage2" placeholder="Verbrauch kWh" type="number"><select id="kind2"><option value="privat">Privat</option><option value="firma">Firma</option></select><select id="curProvider2"><option value="">Aktueller Anbieter (optional)</option></select><select id="custStatus2" class="hidden"><option value="neu">Neu</option><option value="bearbeitung">In Bearbeitung</option><option value="abgeschlossen">Abgeschlossen</option><option value="storno">Storno</option><option value="klaerung">Klärungsbedarf</option></select><button id="custSubmitBtn2" onclick="customer2()">Anlegen</button></section>
<section><h2>Kunden <button onclick="load()">Aktualisieren</button> <button onclick="downloadFile('/export/customers.csv','kunden.csv')">CSV exportieren</button></h2><table><thead><tr><th>Name</th><th>Status</th><th>PLZ</th><th></th></tr></thead><tbody id="customersAdmin"></tbody></table></section>
<section><h2>Offene Aufgaben</h2><table><tbody id="tasks"></tbody></table></section>
<section><h2>Kalender / Termine</h2><div id="calendarAdmin" class="hidden"><input id="calEmpId" placeholder="Mitarbeiter-ID" type="number"><input id="calTitle" placeholder="Titel"><label>Start <input id="calStart" type="datetime-local"></label><label>Ende <input id="calEnd" type="datetime-local"></label><button onclick="createSchedule()">Termin anlegen</button></div><table><thead><tr><th>Start</th><th>Ende</th><th>Art/Titel</th></tr></thead><tbody id="calendarList"></tbody></table></section>
</div>'''

PAGE_MITARBEITER = '''<div class="page" id="page-mitarbeiter">
<div class="pageHead" style="--pageAccent:#2563eb"><h1>Mitarbeiter</h1><p>Anlegen, Rollen, Stufen und Status.</p></div>
<section><h2>Mitarbeiter anlegen</h2><p><small>Die VP-Nummer (Benutzername) wird automatisch vergeben.</small></p><input id="empName" placeholder="Name"><input id="empEmail" placeholder="E-Mail (optional)"><label>Rolle <select id="empRole"><option value="vertrieb">Vertriebler</option><option value="support">Support</option><option value="buchhaltung">Buchhaltung</option><option value="admin">Admin</option></select></label><label>Status/Stufe <select id="empTier"><option value="1">Stufe 1</option><option value="2">Stufe 2</option><option value="3">Stufe 3</option></select></label><button onclick="createEmployee()">Anlegen</button><div id="empQr"></div></section>
<section><h2>Mitarbeiterliste</h2><p><small>"Website" zeigt Name+Foto öffentlich auf der Landingpage (Vertrauens-Sektion für Besucher).</small></p><table><thead><tr><th>ID</th><th>Benutzername</th><th>Name</th><th>Rolle</th><th>Stufe</th><th>Status</th><th>Öffentlich</th><th></th></tr></thead><tbody id="employeeList"></tbody></table></section>
<section><h2>Mein öffentliches Profil (Teamleitung)</h2><p><small>Erscheint mit auf der Landingpage, wenn aktiviert.</small></p><label style="font-size:13px;font-weight:600"><input type="checkbox" id="myShowOnWebsite" onchange="toggleMyShowOnWebsite(this.checked)" style="width:auto;margin:0 6px 0 0"> Auf Website zeigen</label><label class="fileBtn" style="margin-left:12px">📷 Foto hochladen<input type="file" accept=".jpg,.jpeg,.png,.webp" class="hidden" onchange="uploadMyPhoto(this)"></label></section>
<section><h2>Kundennachtrag (falls Mitarbeiter vergessen hat)</h2><input id="closureEmpId" placeholder="Mitarbeiter-ID" type="number"><input id="closureCustName" placeholder="Kundenname"><input id="closureProduct" placeholder="Produkt (strom/gas)"><input id="closureUsage" placeholder="Verbrauch kWh" type="number"><button onclick="submitClosureForEmployee()">Eintragen</button></section>
<section><h2>Bewerbungen (Website)</h2><table><thead><tr><th>Foto</th><th>Datum</th><th>Name</th><th>E-Mail</th><th>Telefon</th><th>Nachricht</th><th></th></tr></thead><tbody id="applicationsList"></tbody></table></section>
</div>'''

PAGE_LOGINZUGAENGE = '''<div class="page" id="page-loginzugaenge">
<div class="pageHead" style="--pageAccent:#dc2626"><h1>Loginzugänge</h1><p>TOTP-Zugang je Mitarbeiter neu einrichten und Generalschlüssel verwalten.</p></div>
<section><h2>TOTP neu einrichten</h2><p><small>Setzt den Google-Authenticator-Schlüssel des gewählten Mitarbeiters zurück (z.B. bei Handy-Verlust).</small></p><select id="resetEmpId"></select><button onclick="resetTotp()">Neu einrichten</button><div id="resetQr"></div></section>
<section><h2>Generalschlüssel</h2><p><small>Universeller Notfall-Zugang für alle Accounts. Nur persönlich/telefonisch weitergeben.</small></p><input id="newMasterKey" placeholder="Eigener Schlüssel (leer = automatisch generieren)"><button onclick="rotateMasterKey()">Neu setzen</button><p id="masterKeyResult"></p></section>
</div>'''

PAGE_PROVISION = '''<div class="page" id="page-provision">
<div class="pageHead" style="--pageAccent:#d97706"><h1>Provision</h1><p>Suche, Prüfung eingereichter Abschlüsse, Team- und Einzelprovision.</p></div>
<section><h2>Provision suchen</h2><p><small>Anbieter eingeben, um die Provision je Stufe für alle Tarife zu sehen.</small></p><input id="provSearchInput2" placeholder="Anbieter suchen (z. B. Vattenfall)" oninput="searchProvider('2')"><div id="provSearchResults2"></div><div id="provCommissionResult2"></div></section>
<section><h2>Abschlüsse prüfen</h2><p><small>Anbieter/Tarif zuweisen — die Provision wird automatisch nach Stufe des Mitarbeiters berechnet.</small></p><div id="pendingClosures"></div></section>
<section><h2>Team-Provision Gesamt</h2><p><small>IST = abgeschlossene Verträge. Potenzial = wenn auch alle offenen Verträge abgeschlossen würden. "Details" zeigt, welche Aufträge noch offen sind.</small></p><div class="grid" id="teamProvisionKpi"></div><table><thead><tr><th>Mitarbeiter</th><th>IST-Provision</th><th>Offen</th><th>Potenzial</th><th></th></tr></thead><tbody id="teamProvisionList"></tbody></table></section>
<section><h2>Stornoquoten</h2><div id="stornoOverview"></div></section>
<section><h2>Anbieter</h2><input id="provName" placeholder="Anbietername"><input id="provStreet" placeholder="Straße"><input id="provPlz" placeholder="PLZ"><input id="provCity" placeholder="Ort"><input id="provPhone" placeholder="Telefon"><input id="provContact" placeholder="Ansprechpartner"><button onclick="createProvider()">Anbieter anlegen</button><p><small>Tarife &amp; Provisionsstaffeln über <code>/docs</code> (<code>/api/providers/import</code> für Massenimport).</small></p><div id="providerList"></div></section>
</div>'''

PAGE_BUCHHALTUNG = '''<div class="page" id="page-buchhaltung">
<div class="pageHead" style="--pageAccent:#475569"><h1>Buchhaltung</h1><p>Agentur-Unterlagen, Mitarbeiter-Abrechnungen und ablaufende Dokumente.</p></div>
<section><h2>Unterlagen (Agentur)</h2><select id="docCategory"><option value="gewerbeanmeldung">Gewerbeanmeldung</option><option value="fuehrungszeugnis">Führungszeugnis</option><option value="rechnung">Rechnung/Beleg</option><option value="sonstiges">Sonstiges</option></select><input id="docFile" type="file"><label>Ablaufdatum (optional) <input id="docExpires" type="date"></label><label>Betrag € (optional) <input id="docAmount" type="number"></label><button onclick="uploadDocument()">Hochladen</button><table><thead><tr><th>Kategorie</th><th>Datei</th><th>Ablauf</th><th></th></tr></thead><tbody id="documentList"></tbody></table></section>
<section><h2>Mitarbeiter-Abrechnung hochladen</h2><input id="abrEmpId" placeholder="Mitarbeiter-ID" type="number"><select id="abrCategory"><option value="abrechnung">Provisionsabrechnung</option><option value="lohnabrechnung">Lohnabrechnung</option></select><input id="abrFile" type="file"><label>Betrag € (optional) <input id="abrAmount" type="number"></label><button onclick="uploadStaffDocument()">Hochladen</button></section>
<section><h2>Abrechnungen &amp; Unterlagen der Mitarbeiter</h2><table><thead><tr><th>Mitarbeiter</th><th>Kategorie</th><th>Datei</th><th>Betrag</th><th></th></tr></thead><tbody id="staffDocsList"></tbody></table></section>
<section><h2>Ablaufende Unterlagen</h2><table><thead><tr><th>Mitarbeiter</th><th>Kategorie</th><th>Datei</th><th>Ablauf</th></tr></thead><tbody id="expiringDocs"></tbody></table></section>
</div>'''

PAGE_ZIELE = '''<div class="page" id="page-ziele">
<div class="pageHead" style="--pageAccent:#ea580c"><h1>Ziele &amp; Incentives</h1><p>Zielerreichung, Teamziele und Prämien.</p></div>
<section><h2>Zielerreichung</h2><div id="scoreCharts"></div></section>
<section><h2>Teams gesamt</h2><div id="teamCharts"></div></section>
<section><h2>Ziel anlegen</h2><input id="goalEmpId" placeholder="Mitarbeiter-ID" type="number"><label>Von <input id="goalStart" type="date"></label><label>Bis <input id="goalEnd" type="date"></label><input id="goalContracts" placeholder="Ziel-Verträge" type="number"><input id="goalRevenue" placeholder="Ziel-Provision €" type="number"><button onclick="createGoal()">Anlegen</button></section>
<section><h2>Incentives</h2><input id="incName" placeholder="Name"><input id="incDesc" placeholder="Beschreibung"><input id="incMin" placeholder="Min. Verträge" type="number"><input id="incReward" placeholder="Prämie €" type="number"><button onclick="createIncentive()">Anlegen</button><div id="incentiveList"></div></section>
<section><h2>News</h2><p><small>Interne Team-News (nur im Portal sichtbar). Die "Aktuelles"-Sektion auf der Website zeigt automatisch aktuelle Strom/Gas-Nachrichten aus dem Internet, dafür ist hier keine Pflege nötig.</small></p><input id="newsTitle" placeholder="Titel"><textarea id="newsText" placeholder="Text" rows="3" style="width:100%;box-sizing:border-box"></textarea><label><input type="checkbox" id="newsImportant" style="width:auto"> Wichtig</label><button onclick="createNews()">Veröffentlichen</button><div id="newsList"></div></section>
</div>'''

PAGE_LERNPFAD = '''<div class="page" id="page-lernpfad">
<div class="pageHead" style="--pageAccent:#0d9488"><h1>Lernpfad &amp; KI</h1><p>Schulungen und dein persönlicher Vertriebscoach.</p></div>
<section><h2>Schulungen</h2><div id="trainingAdmin" class="hidden"><input id="trTitle" placeholder="Titel"><label>Start <input id="trStart" type="datetime-local"></label><label>Ende <input id="trEnd" type="datetime-local"></label><input id="trMax" placeholder="Max. Teilnehmer" type="number"><button onclick="createTraining()">Anlegen</button></div><div id="trainingList"></div></section>
<section><h2>EnergyOne Vertriebscoach</h2><p><small>Dein Coach ist jetzt jederzeit über das Chat-Symbol unten rechts erreichbar.</small></p></section>
</div>'''

SCRIPT = '''let token='';let isAdmin=false;let myTier=null;let myId=null;
const api=async(p,o={})=>{o.headers={...(o.headers||{}),Authorization:'Bearer '+token};let r=await fetch('/api'+p,o);if(!r.ok)throw Error(await r.text());return r.json()};
async function downloadFile(p,filename){let r=await fetch('/api'+p,{headers:{Authorization:'Bearer '+token}});if(!r.ok){alert(await r.text());return}let blob=await r.blob();let url=URL.createObjectURL(blob);let a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url)}
function toCsv(rows){if(!rows.length)return'';let headers=Object.keys(rows[0]);return [headers.join(';'),...rows.map(r=>headers.map(h=>String(r[h]??'').replace(/;/g,',')).join(';'))].join('\\n')}
function tierBadge(t){const c={1:'#2463eb',2:'#eab308',3:'#7c3aed'}[t]||'#94a3b8';return `<span style="background:${c};color:#fff;border-radius:4px;padding:2px 8px;font-size:12px">Stufe ${t}</span>`}
function statusBadge(s){const c={neu:'#eab308',bearbeitung:'#eab308',abgeschlossen:'#16a34a',storno:'#dc2626',klaerung:'#eab308',eingereicht:'#eab308'}[s]||'#94a3b8';const l={neu:'Neu',bearbeitung:'In Bearbeitung',abgeschlossen:'Abgeschlossen',storno:'Storno',klaerung:'Klärungsbedarf',eingereicht:'Eingereicht'}[s]||s;return `<span style="background:${c};color:#fff;border-radius:4px;padding:2px 8px;font-size:12px">${l}</span>`}
function bar(pct,scale){const c=scale==='gruen'?'#16a34a':scale==='gelb'?'#eab308':'#dc2626';return `<div style="background:#eef1f6;border-radius:4px;overflow:hidden;height:14px;width:100%"><div style="background:${c};height:14px;width:${Math.min(100,pct)}%"></div></div>`}
function showPage(id,btn){document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));document.getElementById('page-'+id).classList.add('active');document.querySelectorAll('.navbtn').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active')}
function goToStep2(){if(!username.value.trim())return;vpShown.textContent=username.value;loginStep1.classList.remove('active');loginStep2.classList.add('active');code.focus()}
function backToStep1(){loginStep2.classList.remove('active');loginStep1.classList.add('active');code.value='';username.focus()}
function applyRoleUI(admin){
coachBubble.classList.remove('hidden');
connectWs();
if(admin){navAufgaben.classList.remove('hidden');navMitarbeiter.classList.remove('hidden');navProvision.classList.remove('hidden');navZiele.classList.remove('hidden');navLoginzugaenge.classList.remove('hidden');navBuchhaltung.classList.remove('hidden');adminDashboard.classList.remove('hidden');adminDailyOverview.classList.remove('hidden');trainingAdmin.classList.remove('hidden');calendarAdmin.classList.remove('hidden');dashTitle.textContent='Admin Dashboard';dashSub.textContent='Live-Übersicht über alle Mitarbeiter und Tagesmeldungen.';loadEmployees();loadLoginAccess();loadMyPublicProfile();loadApplications();loadTeamBars();loadAllDaily();loadTeamProvision();loadStornoOverview();loadExpiringDocs();loadDocuments();loadStaffDocs();loadPendingClosures()}
else{empDashboardExtra.classList.remove('hidden');coachHint.classList.remove('hidden');loadCommissions();loadMyDocuments();loadTeamLeaderboard()}
}
let ws=null;
function connectWs(){
if(ws){try{ws.onclose=null;ws.close()}catch(err){}}
let proto=location.protocol==='https:'?'wss:':'ws:';
ws=new WebSocket(proto+'//'+location.host+'/ws?token='+encodeURIComponent(token));
ws.onmessage=()=>refreshActivePage();
ws.onclose=()=>{if(token)setTimeout(connectWs,3000)};
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshActivePage()});
async function signIn(){try{
let r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:username.value,code:code.value})});
let d=await r.json();if(!r.ok)throw Error(d.detail);
token=d.access_token;isAdmin=d.employee.role==='admin';myTier=d.employee.tier;myId=d.employee.id;
localStorage.setItem('e1_token',token);
who.innerHTML=d.employee.name+' · '+d.employee.role+(d.employee.role==='admin'?'':' · '+tierBadge(d.employee.tier));
portalBadge.textContent=isAdmin?'Admin Portal':'Mitarbeiter Portal';
login.classList.add('fadeOut');await new Promise(res=>setTimeout(res,350));login.classList.add('hidden');app.classList.remove('hidden');logoutBtn.classList.remove('hidden');armIdleTimer();
applyRoleUI(isAdmin);
load()
}catch(e){alert(e.message)}}
function doLogout(){token='';localStorage.removeItem('e1_token');document.location.reload()}
(async function restoreSession(){
let saved=localStorage.getItem('e1_token');if(!saved)return;
token=saved;
try{
let me=await api('/me');
isAdmin=me.role==='admin';myTier=me.tier;myId=me.id;
who.innerHTML=me.name+' · '+me.role+(me.role==='admin'?'':' · '+tierBadge(me.tier));
portalBadge.textContent=isAdmin?'Admin Portal':'Mitarbeiter Portal';
login.classList.add('hidden');app.classList.remove('hidden');logoutBtn.classList.remove('hidden');armIdleTimer();
applyRoleUI(isAdmin);
load()
}catch(e){localStorage.removeItem('e1_token');token=''}
})();
let idleTimer=null;function armIdleTimer(){['click','keydown','mousemove','scroll'].forEach(ev=>document.addEventListener(ev,resetIdleTimer));resetIdleTimer()}
function resetIdleTimer(){clearTimeout(idleTimer);idleTimer=setTimeout(()=>{alert('Automatisch abgemeldet wegen Inaktivität.');doLogout()},15*60*1000)}
function refreshActivePage(){
if(!token||document.hidden)return;
let active=document.querySelector('.page.active');if(!active)return;
if(active.id==='page-dashboard'){if(isAdmin){loadTeamBars();loadAllDaily();load()}else{loadCommissions();loadTeamLeaderboard()}}
else if(active.id==='page-provision'){loadTeamProvision();loadStornoOverview();loadPendingClosures()}
else if(active.id==='page-ziele'){loadCharts()}
else if(active.id==='page-mitarbeiter'){loadEmployees()}
}
setInterval(refreshActivePage,20000);
document.getElementById('dailyDate') && (dailyDate.value=new Date().toISOString().slice(0,10));
let daily={contracts:0,cancellations:0};
function changeDaily(delta,key){daily[key]=Math.max(0,daily[key]+delta);document.getElementById(key+'Count').textContent=daily[key]}
async function saveDaily(){try{let x=await api('/employee/daily-performance',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({entry_date:dailyDate.value,contracts:daily.contracts,cancellations:daily.cancellations,note:dailyNote.value})});dailyResult.textContent='Gespeichert · Netto: '+x.net}catch(e){alert(e.message)}}
let custCache=[];let editingCustomerId=null;let editingCustomerId2=null;
async function load(){let[d,cs,ts]=await Promise.all([api('/dashboard'),api('/customers'),api('/tasks')]);
custCache=cs;
kpis.innerHTML=Object.entries({Kunden:d.customers,'Offene Aufgaben':d.open_tasks}).map(([k,v])=>`<div class=card><small>${k}</small><div class=n>${v}</div></div>`).join('');
if(document.getElementById('customers'))customers.innerHTML=cs.map(x=>`<tr><td>${x.company||x.first_name+' '+(x.last_name||'')}</td><td>${statusBadge(x.status)}</td><td>${x.postal_code}</td><td><button onclick="editCustomer(${x.id})">Bearbeiten</button> <button onclick="quickClosure(${x.id})">Abschluss melden</button> <button onclick="deleteCustomer(${x.id})" style="background:linear-gradient(90deg,#dc2626,#b91c1c)">Löschen</button></td></tr>`).join('')||'<tr><td colspan=4 class=empty>Noch keine Kunden angelegt.</td></tr>';
if(document.getElementById('clCustomerId'))clCustomerId.innerHTML='<option value="">Kunde wählen...</option>'+cs.map(x=>`<option value="${x.id}">${x.company||x.first_name+' '+(x.last_name||'')}</option>`).join('');
if(document.getElementById('customersAdmin'))customersAdmin.innerHTML=cs.map(x=>`<tr><td>${x.company||x.first_name+' '+(x.last_name||'')}</td><td>${statusBadge(x.status)}</td><td>${x.postal_code}</td><td><button onclick="editCustomer2(${x.id})">Bearbeiten</button> <button onclick="deleteCustomer(${x.id})" style="background:linear-gradient(90deg,#dc2626,#b91c1c)">Löschen</button></td></tr>`).join('')||'<tr><td colspan=4 class=empty>Noch keine Kunden angelegt.</td></tr>';
if(document.getElementById('tasks'))tasks.innerHTML=ts.map(x=>`<tr><td>${x.title}</td><td>${x.status}</td><td>${x.due_date||''}</td></tr>`).join('');
loadProviders();loadClProviders();loadCharts();loadCalendar();loadTrainings()
}
function fillCustomerForm(sfx,c){document.getElementById('kind'+sfx).value=c.kind;document.getElementById('mail'+sfx).value=c.email||'';document.getElementById('cphone'+sfx).value=c.phone||'';document.getElementById('plz'+sfx).value=c.postal_code||'';document.getElementById('street'+sfx).value=c.street||'';document.getElementById('city'+sfx).value=c.city||'';document.getElementById('usage'+sfx).value=c.usage_kwh||0;let cp=document.getElementById('curProvider'+sfx);if(cp)cp.value=c.current_provider_id||'';document.getElementById('custName'+sfx).value=c.company||((c.first_name||'')+' '+(c.last_name||'')).trim()}
function resetCustomerForm(sfx){['custName','mail','cphone','plz','street','city','usage'].forEach(id=>document.getElementById(id+sfx).value='')}
function editCustomer(id){let c=custCache.find(x=>x.id===id);if(!c)return;editingCustomerId=id;fillCustomerForm('',c);custSubmitBtn.textContent='Speichern'}
function editCustomer2(id){let c=custCache.find(x=>x.id===id);if(!c)return;editingCustomerId2=id;fillCustomerForm('2',c);custStatus2.value=c.status||'neu';custStatus2.classList.remove('hidden');custSubmitBtn2.textContent='Speichern'}
async function customer(){let v={kind:kind.value,email:mail.value,phone:cphone.value,postal_code:plz.value,street:street.value,city:city.value,usage_kwh:+usage.value||0};if(curProvider.value)v.current_provider_id=+curProvider.value;if(v.kind==='firma')v.company=custName.value;else{let a=custName.value.split(' ');v.first_name=a.shift();v.last_name=a.join(' ')}
if(editingCustomerId){await api('/customers/'+editingCustomerId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)});editingCustomerId=null;custSubmitBtn.textContent='Anlegen'}
else{await api('/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)})}
resetCustomerForm('');load()}
async function customer2(){let v={kind:kind2.value,email:mail2.value,phone:cphone2.value,postal_code:plz2.value,street:street2.value,city:city2.value,usage_kwh:+usage2.value||0};if(curProvider2.value)v.current_provider_id=+curProvider2.value;if(v.kind==='firma')v.company=custName2.value;else{let a=custName2.value.split(' ');v.first_name=a.shift();v.last_name=a.join(' ')}
if(editingCustomerId2){v.status=custStatus2.value;await api('/customers/'+editingCustomerId2,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)});editingCustomerId2=null;custSubmitBtn2.textContent='Anlegen';custStatus2.classList.add('hidden')}
else{await api('/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)})}
resetCustomerForm('2');load()}
async function deleteCustomer(id){let c=custCache.find(x=>x.id===id);let name=c?(c.company||c.first_name+' '+(c.last_name||'')):id;if(!confirm('Kunde "'+name+'" wirklich löschen?'))return;try{await api('/customers/'+id,{method:'DELETE'});await load()}catch(e){alert(e.message)}}
function fillClosureFromCustomer(){document.getElementById('clNewCustomerFields').style.display=clCustomerId.value?'none':'inline';let c=custCache.find(x=>x.id===+clCustomerId.value);if(!c)return;clKind.value=c.kind;if(c.usage_kwh)clUsage.value=c.usage_kwh;updateLiveCommission()}
function quickClosure(id){clCustomerId.value=id;fillClosureFromCustomer();document.getElementById('clCustomerId').closest('section').scrollIntoView({behavior:'smooth'})}
async function loadClProviders(){let el=document.getElementById('clProviderId');if(!el)return;let rows=await api('/providers');el.innerHTML='<option value="">Anbieter wählen</option>'+rows.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}
async function loadClTariffs(){let pid=clProviderId.value;let sel=clTariffId;if(!pid){sel.innerHTML='<option value="">Tarif wählen</option>';updateLiveCommission();return}let rows=await api('/providers/'+pid+'/tariffs');sel.innerHTML='<option value="">Tarif wählen</option>'+rows.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');updateLiveCommission()}
async function updateLiveCommission(){let tid=clTariffId.value;let usage=+clUsage.value||0;if(!tid||!myTier){clCommissionPreview.innerHTML='';return}let brackets=await api('/tariffs/'+tid+'/brackets');let b=brackets.filter(x=>x.tier===myTier&&x.usage_from<=usage&&(x.usage_to==null||x.usage_to>=usage)).sort((a,b)=>b.usage_from-a.usage_from)[0];clCommissionPreview.innerHTML=b?`<b style="color:#16a34a">Voraussichtliche Provision: ${(b.commission_amount+(b.commission_per_kwh||0)*usage).toFixed(2)} €</b>`:'<small style="color:#8f8ca8">Keine passende Provisionsstaffel für diesen Verbrauch.</small>'}
async function submitClosure(){
let payload={product:clProduct.value,customer_kind:clKind.value,usage_kwh:+clUsage.value||0,note:clNote.value};
if(clProviderId.value)payload.provider_id=+clProviderId.value;
if(clTariffId.value)payload.tariff_id=+clTariffId.value;
if(clCustomerId.value){payload.customer_id=+clCustomerId.value}
else{if(!clCustName.value.trim()){alert('Bitte Kundenname angeben oder bestehenden Kunden wählen');return}payload.customer_name=clCustName.value;payload.postal_code=clPlz.value;payload.phone=clPhone.value}
try{
await api('/employee/closures',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
clCustomerId.value='';clCustName.value='';clPlz.value='';clPhone.value='';clUsage.value='';clNote.value='';clProviderId.value='';clTariffId.innerHTML='<option value="">Tarif wählen</option>';clCommissionPreview.innerHTML='';fillClosureFromCustomer();
closureResult.textContent='Abschluss gemeldet — wird von der Agentur geprüft.';
await loadCommissions();await load()
}catch(e){alert(e.message)}}
async function loadCommissions(){let c=await api('/employee/commission-overview');commissionKpis.innerHTML=Object.entries({'IST-Provision (abgeschlossen)':c.total_commission.toFixed(2)+' €','Offene Provision':c.pending_commission.toFixed(2)+' €','Potenzial (wenn alles abgeschlossen)':(c.total_commission+c.pending_commission).toFixed(2)+' €',Abgeschlossen:c.contracts_completed,Offen:c.contracts_pending}).map(([k,v])=>`<div class=card><small>${k}</small><div class=n>${v}</div></div>`).join('');let rows=await api('/employee/closures');closureList.innerHTML=rows.map(x=>`<tr><td>${x.customer_name}</td><td>${x.product}</td><td>${x.completed_on}</td><td>${statusBadge(x.status)}</td><td>${x.expected_commission.toFixed(2)} €</td></tr>`).join('')||'<tr><td colspan=5 class=empty>Noch keine Abschlüsse gemeldet.</td></tr>'}
async function loadStornoOverview(){let rows=await api('/admin/commission-overview');stornoOverview.innerHTML='<table><thead><tr><th>Mitarbeiter</th><th>Stornoquote</th><th>Storno</th><th>Abgeschlossen</th></tr></thead><tbody>'+rows.map(x=>`<tr><td>${x.name}</td><td style="color:${x.storno_alert?'#dc2626':'#16a34a'};font-weight:700">${x.cancellation_rate} %</td><td>${x.contracts_cancelled}</td><td>${x.contracts_completed}</td></tr>`).join('')+'</tbody></table>'}
async function loadTeamProvision(){let rows=await api('/admin/commission-overview');let total=rows.reduce((s,x)=>s+x.total_commission,0);let potential=rows.reduce((s,x)=>s+x.total_commission+x.pending_commission,0);teamProvisionKpi.innerHTML=`<div class="card"><small>IST-Provision Team (abgeschlossen)</small><div class="n">${total.toFixed(2)} €</div></div><div class="card"><small>Potenzial (wenn alle Verträge abgeschlossen)</small><div class="n">${potential.toFixed(2)} €</div></div>`;teamProvisionList.innerHTML=rows.map(x=>`<tr><td>${x.name}</td><td>${x.total_commission.toFixed(2)} €</td><td>${x.pending_commission.toFixed(2)} €</td><td>${(x.total_commission+x.pending_commission).toFixed(2)} €</td><td><button onclick="toggleEmployeeClosureDetail(${x.employee_id})">Details</button></td></tr><tr id="empClosureDetail${x.employee_id}" class="hidden"><td colspan=5><div id="empClosureDetailBody${x.employee_id}"></div></td></tr>`).join('')||'<tr><td colspan=5 class=empty>Noch keine Daten.</td></tr>'}
async function toggleEmployeeClosureDetail(id){let row=document.getElementById('empClosureDetail'+id);let wasHidden=row.classList.contains('hidden');document.querySelectorAll('[id^=empClosureDetail]').forEach(r=>r.classList.add('hidden'));if(!wasHidden)return;row.classList.remove('hidden');let all=await api('/admin/closures');let rows=all.filter(x=>x.employee_id===id);document.getElementById('empClosureDetailBody'+id).innerHTML='<table><thead><tr><th>Kunde</th><th>Produkt</th><th>Datum</th><th>Status</th><th>Provision</th></tr></thead><tbody>'+rows.map(x=>`<tr><td>${x.customer_name}</td><td>${x.product}</td><td>${x.completed_on}</td><td>${statusBadge(x.status)}</td><td>${x.expected_commission.toFixed(2)} €</td></tr>`).join('')+'</tbody></table>'||'<p class=empty>Keine Abschlüsse.</p>'}
async function loadCharts(){let sc=await api('/agency/scorecards');scoreCharts.innerHTML=sc.employees.map(x=>`<div class=card><b>${x.name}</b><br>Verträge ${x.contracts.actual}/${x.contracts.target} (${x.contracts.percent}%)${bar(x.contracts.percent,x.contracts.scale)}Umsatz ${x.revenue.actual.toFixed(0)}/${x.revenue.target.toFixed(0)} € (${x.revenue.percent}%)${bar(x.revenue.percent,x.revenue.scale)}</div>`).join('')||'<p>Keine Ziele hinterlegt.</p>';let tc=await api('/agency/team-scorecards');teamCharts.innerHTML=tc.teams.map(x=>`<div class=card><b>${x.name}</b> (${x.members} Mitarbeiter)<br>Verträge ${x.contracts.actual}/${x.contracts.target} (${x.contracts.percent}%)${bar(x.contracts.percent,x.contracts.scale)}</div>`).join('')||'<p>Keine Teams.</p>';let inc=await api('/incentives');incentiveList.innerHTML=inc.map(x=>`<p><b>${x.name}</b> — ab ${x.minimum_contracts} Verträgen: ${x.reward_eur.toFixed(2)} €<br>${x.description}</p>`).join('')||'<p>Keine Incentives.</p>';await loadNews()}
async function createGoal(){await api('/goals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({employee_id:goalEmpId.value?+goalEmpId.value:null,period_start:goalStart.value,period_end:goalEnd.value,target_contracts:+goalContracts.value||0,target_revenue:+goalRevenue.value||0})});alert('Ziel angelegt');await loadCharts()}
async function createIncentive(){await api('/incentives',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:incName.value,description:incDesc.value,minimum_contracts:+incMin.value||0,reward_eur:+incReward.value||0})});incName.value='';await loadCharts()}
async function createNews(){if(!newsTitle.value.trim())return;await api('/news',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:newsTitle.value,text:newsText.value,important:newsImportant.checked})});newsTitle.value='';newsText.value='';newsImportant.checked=false;await loadNews()}
async function loadNews(){let rows=await api('/news');newsList.innerHTML=rows.map(x=>`<div class="card"><b>${x.title}</b>${x.important?' <small style="color:#dc2626">(wichtig)</small>':''}<br>${x.text}<br><button onclick="deleteNews(${x.id})" style="background:linear-gradient(90deg,#dc2626,#b91c1c);margin-top:6px">Löschen</button></div>`).join('')||'<p class=empty>Keine News.</p>'}
async function deleteNews(id){if(!confirm('News löschen?'))return;await api('/news/'+id,{method:'DELETE'});await loadNews()}
async function uploadDocument(){let f=docFile.files[0];if(!f){alert('Bitte Datei wählen');return}let fd=new FormData();fd.append('file',f);fd.append('category',docCategory.value);if(docExpires.value)fd.append('expires_on',docExpires.value);if(docAmount.value)fd.append('amount',docAmount.value);await fetch('/api/documents',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd});docFile.value='';docExpires.value='';docAmount.value='';await loadDocuments()}
async function loadDocuments(){let rows=await api('/documents');if(!document.getElementById('documentList'))return;let filtered=isAdmin?rows.filter(x=>!x.owner_employee_id):rows;documentList.innerHTML=filtered.map(x=>`<tr><td>${x.category}</td><td>${x.filename}</td><td>${x.expires_on||'-'}</td><td><button onclick="downloadFile('/documents/${x.id}/file','${x.filename}')">Download</button></td></tr>`).join('')||'<tr><td colspan=4 class=empty>Keine Unterlagen.</td></tr>'}
async function uploadMyDocument(){let f=myDocFile.files[0];if(!f){alert('Bitte Datei wählen');return}let fd=new FormData();fd.append('file',f);fd.append('category',myDocCategory.value);if(myDocExpires.value)fd.append('expires_on',myDocExpires.value);await fetch('/api/documents',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd});myDocFile.value='';myDocExpires.value='';await loadMyDocuments()}
async function loadMyDocuments(){let rows=await api('/documents');myDocumentList.innerHTML=rows.map(x=>`<tr><td>${x.category}</td><td>${x.filename}</td><td>${x.expires_on||'-'}</td><td><button onclick="downloadFile('/documents/${x.id}/file','${x.filename}')">Download</button></td></tr>`).join('')||'<tr><td colspan=4 class=empty>Noch keine Unterlagen.</td></tr>'}
async function uploadStaffDocument(){let f=abrFile.files[0];if(!f){alert('Bitte Datei wählen');return}if(!abrEmpId.value){alert('Bitte Mitarbeiter-ID angeben');return}let fd=new FormData();fd.append('file',f);fd.append('category',abrCategory.value);fd.append('owner_employee_id',abrEmpId.value);if(abrAmount.value)fd.append('amount',abrAmount.value);await fetch('/api/documents',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd});abrFile.value='';abrAmount.value='';await loadStaffDocs()}
async function loadStaffDocs(){let[rows,emps]=await Promise.all([api('/documents'),api('/employees')]);let byId={};emps.forEach(e=>byId[e.id]=e.name);staffDocsList.innerHTML=rows.filter(x=>x.owner_employee_id).map(x=>`<tr><td>${byId[x.owner_employee_id]||x.owner_employee_id}</td><td>${x.category}</td><td>${x.filename}</td><td>${x.amount?x.amount.toFixed(2)+' €':'-'}</td><td><button onclick="downloadFile('/documents/${x.id}/file','${x.filename}')">Download</button></td></tr>`).join('')||'<tr><td colspan=5 class=empty>Keine Abrechnungen hochgeladen.</td></tr>'}
async function loadExpiringDocs(){let rows=await api('/admin/documents/expiring');expiringDocs.innerHTML=rows.map(x=>`<tr><td>${x.employee_name||'Agentur'}</td><td>${x.category}</td><td>${x.filename}</td><td>${x.expires_on}</td></tr>`).join('')||'<tr><td colspan=4 class=empty>Nichts läuft bald ab.</td></tr>'}
async function searchProvider(sfx){let q=document.getElementById('provSearchInput'+sfx).value.trim().toLowerCase();let providers=await api('/providers');let matches=q?providers.filter(p=>p.name.toLowerCase().includes(q)):providers.slice(0,15);document.getElementById('provSearchResults'+sfx).innerHTML=matches.slice(0,25).map(p=>`<span class="searchHit" onclick="showProviderCommission('${sfx}',${p.id},'${p.name.replace(/'/g,"\\'")}')">${p.name}</span>`).join('')||'<p class=empty>Keine Treffer.</p>'}
async function showProviderCommission(sfx,id,name){let tariffs=await api('/providers/'+id+'/tariffs');let html=`<h3>${name}</h3>`;for(const t of tariffs){let brackets=await api('/tariffs/'+t.id+'/brackets');let byTier={1:[],2:[],3:[]};brackets.forEach(b=>{if(byTier[b.tier])byTier[b.tier].push(b)});let froms=[...new Set(brackets.map(b=>b.usage_from))].sort((a,b)=>a-b);html+=`<div class="card"><b>${t.name}</b><table><thead><tr><th>Verbrauch ab</th><th>Stufe 1</th><th>Stufe 2</th><th>Stufe 3</th></tr></thead><tbody>`+froms.map(f=>`<tr><td>${f} kWh</td>`+[1,2,3].map(tier=>{let b=byTier[tier].find(x=>x.usage_from===f);return `<td>${b?b.commission_amount.toFixed(2)+' €':'-'}</td>`}).join('')+`</tr>`).join('')+'</tbody></table></div>'}document.getElementById('provCommissionResult'+sfx).innerHTML=html}
async function loadPendingClosures(){let[rows,providers]=await Promise.all([api('/admin/closures'),api('/providers')]);let pending=rows.filter(x=>['eingereicht','bearbeitung','klaerung'].includes(x.status));pendingClosures.innerHTML=pending.map(c=>`<div class="card"><b>${c.customer_name}</b> · ${c.product} · ${c.usage_kwh} kWh · ${c.completed_on} · ${statusBadge(c.status)}<div style="margin-top:8px"><select id="revProv${c.id}" onchange="loadRevTariffs(${c.id})"><option value="">Anbieter wählen</option>${providers.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select><select id="revTariff${c.id}"><option value="">Tarif wählen</option></select><select id="revStatus${c.id}"><option value="bearbeitung">In Bearbeitung</option><option value="abgeschlossen">Abgeschlossen</option><option value="storno">Storno</option><option value="klaerung">Klärungsbedarf</option></select><button onclick="reviewClosure(${c.id})">Prüfen</button></div></div>`).join('')||'<p class=empty>Keine offenen Abschlüsse zur Prüfung.</p>'}
async function loadRevTariffs(closureId){let pid=document.getElementById('revProv'+closureId).value;let sel=document.getElementById('revTariff'+closureId);if(!pid){sel.innerHTML='<option value="">Tarif wählen</option>';return}let rows=await api('/providers/'+pid+'/tariffs');sel.innerHTML='<option value="">Tarif wählen</option>'+rows.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}
async function reviewClosure(id){let tariffId=document.getElementById('revTariff'+id).value;let providerId=document.getElementById('revProv'+id).value;let status=document.getElementById('revStatus'+id).value;try{await api('/admin/closures/'+id+'/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,provider_id:providerId?+providerId:null,tariff_id:tariffId?+tariffId:null})});await loadPendingClosures();await loadTeamProvision();await loadTeamBars()}catch(e){alert(e.message)}}
async function loadCalendar(){let rows=await api('/planning');calendarList.innerHTML=rows.map(x=>`<tr><td>${x.starts_at.replace('T',' ')}</td><td>${x.ends_at.replace('T',' ')}</td><td>${x.kind}${x.note?' — '+x.note:''}</td></tr>`).join('')||'<p>Keine Termine.</p>'}
async function createSchedule(){await api('/planning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({employee_id:+calEmpId.value,starts_at:calStart.value,ends_at:calEnd.value,kind:'Termin',note:calTitle.value})});calTitle.value='';await loadCalendar()}
async function loadTrainings(){let rows=await api('/trainings');trainingList.innerHTML=rows.map(x=>`<div class="card"><b>${x.title}</b> · ${x.starts_at.replace('T',' ')} · ${x.participants}${x.max_participants?'/'+x.max_participants:''} Teilnehmer ${x.registered?'✓ angemeldet':`<button onclick="registerTraining(${x.id})">Anmelden</button>`}${isAdmin?` <button onclick="registerAll(${x.id})">Alle anmelden</button>`:''}</div>`).join('')||'<p>Keine Schulungen geplant.</p>'}
async function registerTraining(id){await api('/trainings/'+id+'/register',{method:'POST'});await loadTrainings()}
async function registerAll(id){let emps=await api('/employees');for(const emp of emps){try{await api('/trainings/'+id+'/register?employee_id='+emp.id,{method:'POST'})}catch(e){}}await loadTrainings()}
async function createTraining(){await api('/trainings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:trTitle.value,starts_at:trStart.value,ends_at:trEnd.value,max_participants:trMax.value?+trMax.value:null})});trTitle.value='';trMax.value='';await loadTrainings()}
let coachOpen=false;
function toggleCoachWindow(){coachOpen=!coachOpen;coachWindow.classList.toggle('hidden',!coachOpen);if(coachOpen){loadCoach();coachInput.focus()}}
(function makeCoachDraggable(){
let win=document.getElementById('coachWindow');let header=document.getElementById('coachWinHeader');
let dragging=false,offX=0,offY=0;
header.addEventListener('mousedown',e=>{if(e.target.closest('.coachWinClose'))return;dragging=true;let r=win.getBoundingClientRect();offX=e.clientX-r.left;offY=e.clientY-r.top;win.style.right='auto';win.style.bottom='auto';win.style.left=r.left+'px';win.style.top=r.top+'px'});
document.addEventListener('mousemove',e=>{if(!dragging)return;win.style.left=Math.max(4,Math.min(window.innerWidth-40,e.clientX-offX))+'px';win.style.top=Math.max(4,Math.min(window.innerHeight-40,e.clientY-offY))+'px'});
document.addEventListener('mouseup',()=>dragging=false);
})();
async function loadCoach(){let rows=await api('/training/coach/history');coachLog.innerHTML=rows.map(x=>`<div class="bubble ${x.role==='assistant'?'bot':'user'}">${x.text}</div>`).join('');coachLog.scrollTop=coachLog.scrollHeight}
async function clearCoach(){if(!confirm('Chatverlauf wirklich löschen?'))return;await api('/training/coach/history',{method:'DELETE'});coachLog.innerHTML=''}
async function askCoach(){let input=document.getElementById('coachInput');let fileInput=document.getElementById('coachFile');if(!input.value.trim()&&!fileInput.files[0])return;
try{
if(fileInput.files[0]){let fd=new FormData();fd.append('file',fileInput.files[0]);fd.append('message',input.value);let r=await fetch('/api/training/coach/upload',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd});if(!r.ok)throw Error(await r.text());fileInput.value=''}
else{await api('/training/coach/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:input.value})})}
input.value='';await loadCoach()
}catch(e){alert('Coach-Nachricht fehlgeschlagen: '+e.message)}}
async function createEmployee(){let r=await api('/employees',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:empName.value,email:empEmail.value||null,role:empRole.value,tier:+empTier.value})});empQr.innerHTML='<p>Neue VP-Nummer: <b>'+r.username+'</b> — QR scannen (oder Schlüssel manuell eingeben: <code>'+r.totp_secret+'</code>):</p><img src="data:image/png;base64,'+r.totp_qr_base64+'">';empName.value='';empEmail.value='';await loadEmployees();await loadLoginAccess()}
async function loadEmployees(){let rows=(await api('/employees')).filter(x=>x.role!=='admin');employeeList.innerHTML=rows.map(x=>`<tr><td>${x.id}</td><td>${x.username}</td><td>${x.name}</td><td>${x.role}</td><td>${tierBadge(x.tier)}</td><td>${x.active?'Aktiv':'<span style="color:#dc2626;font-weight:700">Inaktiv</span>'}</td><td><label style="font-size:12px;font-weight:600"><input type="checkbox" ${x.show_on_website?'checked':''} onchange="toggleShowOnWebsite(${x.id},this.checked)" style="width:auto;margin:0 4px 0 0"> Website</label> <label class="fileBtn" style="padding:6px 10px;font-size:12px">📷<input type="file" accept=".jpg,.jpeg,.png,.webp" class="hidden" onchange="uploadEmployeePhoto(${x.id},this)"></label></td><td><button onclick="downloadFile('/employees/${x.id}/report.pdf','report-${x.username}.pdf')">PDF</button> <button onclick="toggleEmployeeActive(${x.id})">${x.active?'Deaktivieren':'Aktivieren'}</button> <button onclick="deleteEmployeeAccount(${x.id},'${x.name.replace(/'/g,"\\'")}')" style="background:linear-gradient(90deg,#dc2626,#b91c1c)">Löschen</button> <button onclick="purgeEmployee(${x.id},'${x.name.replace(/'/g,"\\'")}')" style="background:#7f1d1d">Endgültig löschen</button></td></tr>`).join('')}
async function toggleShowOnWebsite(id,checked){await api('/employees/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({show_on_website:checked})})}
async function uploadEmployeePhoto(id,input){let f=input.files[0];if(!f)return;let fd=new FormData();fd.append('file',f);await fetch('/api/employees/'+id+'/photo',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd});alert('Foto hochgeladen')}
async function loadMyPublicProfile(){let me=await api('/me');let cb=document.getElementById('myShowOnWebsite');if(cb)cb.checked=!!me.show_on_website}
async function toggleMyShowOnWebsite(checked){await api('/employees/'+myId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({show_on_website:checked})})}
async function uploadMyPhoto(input){let f=input.files[0];if(!f)return;let fd=new FormData();fd.append('file',f);await fetch('/api/employees/'+myId+'/photo',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd});alert('Foto hochgeladen')}
async function toggleEmployeeActive(id){if(!confirm('Status wirklich ändern?'))return;try{await api('/employees/'+id+'/toggle-active',{method:'POST'});await loadEmployees()}catch(e){alert(e.message)}}
async function deleteEmployeeAccount(id,name){if(!confirm('Account von "'+name+'" löschen? Login/TOTP werden entfernt, Kunden/Provisionen bleiben für die Buchhaltung erhalten.'))return;try{await api('/employees/'+id+'/delete-account',{method:'POST'});await loadEmployees()}catch(e){alert(e.message)}}
async function purgeEmployee(id,name){if(!confirm('ACHTUNG: "'+name+'" WIRKLICH ALLES löschen? Kunden, Abschlüsse, Provisionen, Tagesmeldungen und Dokumente werden unwiderruflich entfernt. Das kann nicht rückgängig gemacht werden!'))return;if(prompt('Zum Bestätigen "LÖSCHEN" eingeben:')!=='LÖSCHEN')return;try{await api('/employees/'+id,{method:'DELETE'});await loadEmployees()}catch(e){alert(e.message)}}
async function resetTotp(){if(!resetEmpId.value)return;let label=resetEmpId.options[resetEmpId.selectedIndex].textContent;let r=await api('/employees/'+resetEmpId.value+'/reset-totp',{method:'POST'});resetQr.innerHTML='<p>Neuer Schlüssel für <b>'+label+'</b> — manuell: <code>'+r.totp_secret+'</code></p><img src="data:image/png;base64,'+r.totp_qr_base64+'">'}
async function loadLoginAccess(){let rows=(await api('/employees')).filter(x=>x.role!=='admin');let sel=document.getElementById('resetEmpId');if(sel)sel.innerHTML='<option value="">Mitarbeiter wählen</option>'+rows.map(x=>`<option value="${x.id}">${x.name} (${x.username})</option>`).join('')}
async function loadApplications(){let rows=await api('/admin/applications');applicationsList.innerHTML=rows.map(x=>`<tr style="${x.seen?'':'font-weight:700'}"><td>${x.photo_url?`<img id="applyPhotoImg${x.id}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">`:'-'}</td><td>${x.created_at.slice(0,10)}</td><td>${x.name}</td><td>${x.email}</td><td>${x.phone||'-'}</td><td>${x.message||'-'}</td><td>${x.seen?'':`<button onclick="markApplicationSeen(${x.id})">Gesehen</button>`}</td></tr><tr><td></td><td></td><td colspan=5><input id="replyMsg${x.id}" placeholder="Antwort an ${x.name}..." style="width:60%"><button onclick="replyApplication(${x.id})">Antworten</button><span id="replyStatus${x.id}"></span></td></tr>`).join('')||'<tr><td colspan=7 class=empty>Noch keine Bewerbungen.</td></tr>';rows.forEach(x=>{if(x.photo_url)loadAuthImage(x.photo_url,'applyPhotoImg'+x.id)})}
async function loadAuthImage(url,imgId){let r=await fetch(url,{headers:{Authorization:'Bearer '+token}});if(!r.ok)return;let blob=await r.blob();let img=document.getElementById(imgId);if(img)img.src=URL.createObjectURL(blob)}
async function markApplicationSeen(id){await api('/admin/applications/'+id+'/seen',{method:'POST'});await loadApplications()}
async function replyApplication(id){let msg=document.getElementById('replyMsg'+id).value.trim();if(!msg)return;let status=document.getElementById('replyStatus'+id);try{await api('/admin/applications/'+id+'/reply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:msg})});status.textContent=' Gesendet.';await loadApplications()}catch(e){status.textContent=' Fehler: '+e.message}}
async function createProvider(){await api('/providers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:provName.value,street:provStreet.value,postal_code:provPlz.value,city:provCity.value,phone:provPhone.value,contact_person:provContact.value})});await loadProviders()}
async function loadProviders(){let rows=await api('/providers');if(document.getElementById('providerList'))providerList.innerHTML='<table><tbody>'+rows.map(x=>`<tr><td>${x.id}</td><td>${x.name}</td><td>${x.city||''}</td></tr>`).join('')+'</tbody></table>';['curProvider','curProvider2'].forEach(id=>{let el=document.getElementById(id);if(el)el.innerHTML='<option value="">Aktueller Anbieter (optional)</option>'+rows.map(x=>`<option value="${x.id}">${x.name}</option>`).join('')})}
async function submitClosureForEmployee(){await api('/employee/closures',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customer_name:closureCustName.value,product:closureProduct.value||'strom',usage_kwh:+closureUsage.value||0,employee_id:+closureEmpId.value})});closureCustName.value='';closureUsage.value='';alert('Eingetragen')}
async function rotateMasterKey(){let r=await api('/auth/master-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({new_key:newMasterKey.value||null})});masterKeyResult.innerHTML='Neuer Generalschlüssel (persönlich/telefonisch weitergeben, wird nirgends automatisch verschickt): <b>'+r.new_key+'</b>';newMasterKey.value=''}
async function loadAllDaily(){let rows=await api('/admin/daily-performance');allDailyList.innerHTML=rows.map(x=>`<tr><td>${x.entry_date}</td><td>${x.employee}</td><td>${x.contracts}</td><td>${x.cancellations}</td><td>${x.net}</td></tr>`).join('')||'<p>Keine Meldungen.</p>'}
async function loadTeamBars(){let rows=await api('/admin/commission-overview');let max=Math.max(1,...rows.map(x=>x.contracts_completed));teamBars.innerHTML=rows.map(x=>`<div style="margin:12px 0"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><b>${x.name}</b><span>${x.contracts_completed} Verträge · Storno ${x.contracts_cancelled} (<span style="color:${x.storno_alert?'#dc2626':'#16a34a'};font-weight:700">${x.cancellation_rate}%</span>)</span></div><div class="abar"><div data-w="${Math.round(x.contracts_completed/max*100)}"></div></div></div>`).join('')||'<p>Keine Daten.</p>';requestAnimationFrame(()=>requestAnimationFrame(()=>document.querySelectorAll('#teamBars .abar>div').forEach(el=>el.style.width=el.dataset.w+'%')))}
async function loadTeamLeaderboard(){let rows=await api('/team-leaderboard');let max=Math.max(1,...rows.map(x=>x.contracts_completed));teamLeaderboard.innerHTML=rows.map((x,i)=>`<div style="margin:12px 0"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><b>${i===0&&x.contracts_completed>0?'🏆 ':''}${x.name}</b> ${tierBadge(x.tier)}<span>${x.contracts_completed} Verträge</span></div><div class="abar"><div data-w="${Math.round(x.contracts_completed/max*100)}"></div></div></div>`).join('')||'<p class=empty>Noch keine Daten.</p>';requestAnimationFrame(()=>requestAnimationFrame(()=>document.querySelectorAll('#teamLeaderboard .abar>div').forEach(el=>el.style.width=el.dataset.w+'%')))}
async function exportTeamCsv(){let rows=await api('/admin/commission-overview');let blob=new Blob([toCsv(rows)],{type:'text/csv'});let url=URL.createObjectURL(blob);let a=document.createElement('a');a.href=url;a.download='mitarbeiter-zahlen.csv';a.click();URL.revokeObjectURL(url)}'''

LOGO_ICON = '''<svg width="30" height="30" viewBox="0 0 72 72" style="vertical-align:middle;margin-right:2px"><defs><linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7c3aed"/><stop offset="100%" stop-color="#2563eb"/></linearGradient></defs><rect width="72" height="72" rx="18" fill="url(#lg1)"/><path d="M39 11 L21 41 H33 L30.5 63 L51 31 H37.5 L39 11 Z" fill="#fff"/></svg>'''

LOGIN_EMPLOYEE = '''<div id="login" class="loginWrap"><div class="loginBox">
<img src="/static/logo-icon.png" alt="E1 Direktvertrieb" class="loginIconImg">
<div class="loginWordmark">E1 <b>Direktvertrieb</b></div>
<div class="loginTag">ENERGIE, DIE ZU IHNEN PASST.</div>
<div class="loginStep active" id="loginStep1"><input id="username" placeholder="VP-Nummer" onkeydown="if(event.key==='Enter')goToStep2()"><button onclick="goToStep2()">Weiter</button></div>
<div class="loginStep" id="loginStep2"><div class="loginVpShown"><span id="vpShown"></span><a href="#" onclick="backToStep1();return false">ändern</a></div><input id="code" placeholder="Authentifizierungs-Code" onkeydown="if(event.key==='Enter')signIn()"><button onclick="signIn()">Bestätigen</button></div>
<p class="loginHint">Code aus Google Authenticator. Bei Verlust: Generalschlüssel oder Admin um TOTP-Reset bitten.</p>
<a href="/admin" class="internalLoginBtn">Interner Login</a>
</div></div>'''

LOGIN_ADMIN = '''<div id="login" class="loginWrap adminLoginWrap"><div class="loginBox">
<img src="/static/logo-icon.png" alt="E1 Direktvertrieb Admin" class="loginIconImg">
<div class="loginWordmark">E1 <b>Direktvertrieb</b></div>
<div class="loginTag">ADMIN PORTAL ZUGANG</div>
<div class="loginStep active" id="loginStep1"><input id="username" placeholder="Benutzername"><input id="code" placeholder="Code / Generalschlüssel" onkeydown="if(event.key==='Enter')signIn()"><button onclick="signIn()">Anmelden</button></div>
<p class="loginHint">Nur für Administratoren.<br><a href="/">Zum Mitarbeiter-Login</a></p>
</div></div>'''

APP_SHELL = '''<header><div><b>''' + LOGO_ICON + ''' E1 Direktvertrieb</b><span class="badge" id="portalBadge">Portal</span></div><div class="headerRight"><span id="who"></span><button id="logoutBtn" class="hidden" onclick="doLogout()">Logout</button></div></header>
__LOGIN__
<div id="app" class="hidden"><div class="shell">''' + NAV + '''<div class="pages">''' + PAGE_DASHBOARD + PAGE_AUFGABEN + PAGE_MITARBEITER + PAGE_PROVISION + PAGE_LOGINZUGAENGE + PAGE_BUCHHALTUNG + PAGE_ZIELE + PAGE_LERNPFAD + '''</div></div>
<div id="coachBubble" class="hidden" onclick="toggleCoachWindow()">💬</div>
<div id="coachWindow" class="hidden">
<div id="coachWinHeader" class="coachWinHeader"><span>''' + LOGO_ICON.replace('width="30" height="30"','width="20" height="20"') + ''' EnergyOne Coach</span><button class="coachWinClose" onclick="toggleCoachWindow()">✕</button></div>
<p id="coachHint" class="hidden" style="padding:10px 14px 0"><small>Die KI ist auf deinen eigenen Bereich beschränkt (deine Kunden, Aufgaben, Abschlüsse).</small></p>
<div class="chatWrap" id="coachLog"></div>
<div class="chatBar"><input id="coachInput" placeholder="Nachricht an den Coach..." onkeydown="if(event.key==='Enter')askCoach()"><label class="fileBtn">📎<input id="coachFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" class="hidden" onchange="askCoach()"></label><button onclick="askCoach()">➤</button></div>
<p style="padding:0 14px 12px"><small><a href="#" onclick="clearCoach();return false">Chat leeren</a></small></p>
</div>
</div>
<script>''' + SCRIPT + '''</script></body></html>'''

HTML = ('''<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>E1 Direktvertrieb · Vertriebsportal</title><style>''' + CSS + '''</style></head><body>''' + APP_SHELL).replace("__LOGIN__", LOGIN_EMPLOYEE)
HTML_ADMIN = ('''<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>E1 Direktvertrieb · Admin</title><style>''' + CSS + '''</style></head><body>''' + APP_SHELL).replace("__LOGIN__", LOGIN_ADMIN)

LANDING_JS = '''<script>document.addEventListener('click',function(e){var m=document.getElementById('lLoginMenu');if(!m)return;if(!e.target.closest('.lLoginWrap'))m.classList.remove('open')});</script>'''

LANDING_CSS = '''*{box-sizing:border-box}
body{margin:0;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto;color:#1c1a2e;background:#fff}
.lHeader{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;padding:14px 6%;background:rgba(13,19,32,.92);backdrop-filter:blur(8px);border-bottom:1px solid rgba(255,255,255,.08)}
.lLogo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:17px;color:#fff;text-decoration:none}
.lLogo img{width:34px;height:auto}
.lLoginWrap{position:relative}
.lLoginBtn{background:linear-gradient(90deg,#f59e0b,#ea580c);color:#0d1320;border:0;padding:11px 22px;border-radius:999px;font-weight:700;cursor:pointer;font-size:14px;transition:transform .15s,opacity .15s}
.lLoginMenu{display:none;position:absolute;top:calc(100% + 10px);right:0;background:#171d2c;border:1px solid #2c3650;border-radius:14px;padding:8px;min-width:180px;box-shadow:0 20px 40px -12px rgba(0,0,0,.5)}
.lLoginMenu.open{display:block;animation:fadeUp .2s ease both}
.lLoginMenu a{display:block;padding:10px 14px;border-radius:9px;color:#e5e7eb;text-decoration:none;font-size:14px;font-weight:600}
.lLoginMenu a:hover{background:#232b40;color:#fbbf24}
.lLoginMenu a small{display:block;color:#8a93a8;font-weight:400;font-size:12px;margin-top:1px}
.lLoginBtn:hover{opacity:.92;transform:translateY(-1px)}
.hero{position:relative;overflow:hidden;padding:90px 6% 100px;text-align:center;background:radial-gradient(circle at 50% 0%,#1a2338,#0d1320 65%);color:#fff}
.hero h1{font-size:clamp(32px,5vw,52px);font-weight:800;margin:0 0 18px;line-height:1.15}
.hero h1 span{background:linear-gradient(90deg,#fbbf24,#f59e0b);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p{max-width:600px;margin:0 auto 34px;color:#c4c1e0;font-size:17px}
.heroBtns{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.heroBtns a{padding:14px 28px;border-radius:999px;font-weight:700;text-decoration:none;font-size:15px}
.btnPrimary{background:linear-gradient(90deg,#f59e0b,#ea580c);color:#0d1320}
.btnGhost{border:1px solid #4b4780;color:#fff}
.section{padding:80px 6%;max-width:1100px;margin:0 auto}
.section h2{font-size:clamp(24px,3vw,32px);text-align:center;margin:0 0 12px}
.section p.lead{text-align:center;color:#6b6885;max-width:560px;margin:0 auto 48px}
.grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px}
.featCard{background:#f8f7fd;border-radius:18px;padding:30px;text-align:left;border-top:4px solid var(--accent,#7c3aed)}
.featCard .ico{font-size:28px;margin-bottom:14px;width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:var(--accentSoft,#ede9fe)}
.featCard h3{margin:0 0 8px;font-size:17px}
.featCard p{margin:0;color:#6b6885;font-size:14.5px}
.ctaBand{background:linear-gradient(100deg,#0d1320,#1a2338 60%,#0d1320);color:#fff;text-align:center;padding:70px 6%}
.ctaBand h2{margin:0 0 10px}
.ctaBand p{color:#c4c1e0;margin:0 0 28px}
.lFooter{padding:40px 6%;text-align:center;color:#8f8ca8;font-size:13.5px;border-top:1px solid #eeecf7}
.lFooter a{color:#6b6885;text-decoration:none;margin:0 10px}
.lFooter a:hover{color:#7c3aed}
.legal{max-width:720px;margin:0 auto;padding:70px 6% 100px}
.legal h1{font-size:28px}
.legal h2{font-size:18px;margin-top:32px}
.legal a{color:#7c3aed}
.heroWrap{display:grid;grid-template-columns:1.1fr .9fr;gap:50px;align-items:center;max-width:1100px;margin:0 auto;text-align:left}
.heroWrap h1{text-align:left}
.heroWrap p{margin:0 0 34px}
.heroWrap .heroBtns{justify-content:flex-start}
.heroArt{position:relative}
@media(max-width:860px){.heroWrap{grid-template-columns:1fr;text-align:center}.heroWrap h1,.heroWrap p{text-align:center}.heroWrap .heroBtns{justify-content:center}.heroArt{display:none}}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:28px;counter-reset:step}
.step{position:relative;padding:28px 24px 24px;background:#f8f7fd;border-radius:18px}
.step .num{width:36px;height:36px;border-radius:50%;background:var(--stepGrad,linear-gradient(135deg,#7c3aed,#2563eb));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;margin-bottom:16px}
.step h3{margin:0 0 8px;font-size:16px}
.step p{margin:0;color:#6b6885;font-size:14.5px}
.teamGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:28px}
.teamCard{background:#f8f7fd;border-radius:20px;padding:30px;text-align:center}
.avatar{width:76px;height:76px;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:22px;background:var(--avatarGrad,linear-gradient(135deg,#7c3aed,#2563eb))}
.teamCard h3{margin:0 0 4px}
.teamCard .role{color:#7c3aed;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px}
.teamCard p{color:#6b6885;font-size:14px;margin:0}
.contactBand{background:#f8f7fd;border-radius:24px;padding:44px;display:flex;flex-wrap:wrap;gap:28px;justify-content:space-between;align-items:center}
.contactBand a.tel{display:flex;align-items:center;gap:10px;font-weight:700;color:#1c1a2e;text-decoration:none;font-size:16px}
.contactBand a.tel:hover{color:#7c3aed}
.lNav{display:flex;gap:28px;margin:0 auto}
.lNav a{color:#c4c9d6;text-decoration:none;font-size:14.5px;font-weight:600;transition:color .15s}
.lNav a:hover{color:#fbbf24}
@media(max-width:760px){.lNav{display:none}}
.applyForm{max-width:520px;margin:0 auto;text-align:left;display:flex;flex-direction:column;gap:12px}
.applyForm input,.applyForm textarea{width:100%;box-sizing:border-box;padding:14px 16px;border:1px solid #e3e0f5;border-radius:12px;font:inherit;resize:vertical}
.applyForm textarea{font-family:inherit}
.applyForm button{align-self:flex-start;padding:13px 30px;border-radius:999px}
.applyResult{color:#16a34a;font-weight:600;margin:0}
.careerHero{background:radial-gradient(circle at 50% 0%,#1a2338,#0d1320 65%);color:#fff;padding:80px 6% 90px;text-align:center}
.careerHero h1{font-size:clamp(28px,4vw,42px);font-weight:800;margin:0 0 16px}
.careerHero h1 span{background:linear-gradient(90deg,#fbbf24,#f59e0b);-webkit-background-clip:text;background-clip:text;color:transparent}
.careerHero p{max-width:600px;margin:0 auto;color:#c4c1e0;font-size:16.5px}
.benefitGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:22px;margin-top:20px}
.benefitCard{background:#f8f7fd;border-radius:16px;padding:26px}
.benefitCard .ico{font-size:26px;margin-bottom:10px}
.benefitCard h3{margin:0 0 6px;font-size:15.5px}
.benefitCard p{margin:0;color:#6b6885;font-size:13.5px}
.profileList{max-width:640px;margin:0 auto;text-align:left}
.profileList li{margin-bottom:12px;padding-left:28px;position:relative;color:#3d3a52}
.profileList li:before{content:"✓";position:absolute;left:0;color:#16a34a;font-weight:800}'''

LANDING_HTML = '''<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>E1 Direktvertrieb</title><style>''' + LANDING_CSS + '''</style></head><body>
<header class="lHeader"><a class="lLogo" href="/"><img src="/static/logo-icon.png" alt="E1"> E1 Direktvertrieb</a><nav class="lNav"><a href="/karriere">Karriere</a><a href="/#kontakt">Kontakt</a></nav><div class="lLoginWrap"><button class="lLoginBtn" onclick="document.getElementById('lLoginMenu').classList.toggle('open')">Login</button><div class="lLoginMenu" id="lLoginMenu"><a href="/login">Mitarbeiter-Login<small>Für Vertriebspartner</small></a><a href="/admin">Admin-Login<small>Für Teamleitung</small></a></div></div></header>
<section class="hero"><div class="heroWrap">
<div>
<h1>Ein Gesicht für Ihre <span>Energieberatung</span>. Kein Callcenter.</h1>
<p>Steigende Preise, verwirrende Tarife, anonyme Hotlines. E1 Direktvertrieb macht es anders: Wir kommen persönlich vorbei, hören zu und finden gemeinsam den passenden Tarif. Fair, transparent und ohne Druck.</p>
<div class="heroBtns"><a class="btnPrimary" href="#leistungen">Warum E1?</a><a class="btnGhost" href="#kontakt">Kontakt aufnehmen</a></div>
</div>
<div class="heroArt" style="text-align:center"><img src="/static/logo-icon.png" alt="E1 Direktvertrieb" style="width:100%;max-width:340px;filter:drop-shadow(0 20px 60px rgba(245,158,11,.25))"></div>
</div></section>
<section class="section" id="leistungen">
<h2>Warum Kund:innen uns vertrauen</h2>
<p class="lead">Wir sind kein Konzern ohne Gesicht. Wir stehen mit unserem Namen dafür ein, dass Beratung wieder persönlich wird.</p>
<div class="grid3">
<div class="featCard" style="--accent:#7c3aed;--accentSoft:#ede9fe"><div class="ico">🤝</div><h3>Ein echter Mensch, kein Skript</h3><p>Sie sprechen mit jemandem, der Ihre Situation wirklich versteht, nicht mit einer Warteschleife.</p></div>
<div class="featCard" style="--accent:#0d9488;--accentSoft:#ccfbf1"><div class="ico">🔍</div><h3>Volle Transparenz</h3><p>Wir zeigen Ihnen genau, was Sie zahlen und warum. Keine versteckten Kosten, kein Kleingedrucktes, das überrascht.</p></div>
<div class="featCard" style="--accent:#ea580c;--accentSoft:#ffedd5"><div class="ico">🛡️</div><h3>Beratung ohne Druck</h3><p>Sie entscheiden in Ihrem Tempo. Unser Ziel ist eine Empfehlung, die zu Ihnen passt, nicht der schnellste Abschluss.</p></div>
</div>
</section>
<section class="section" id="ablauf">
<h2>So läuft Ihre Beratung ab</h2>
<p class="lead">Drei einfache Schritte, keine Verpflichtung.</p>
<div class="steps">
<div class="step" style="--stepGrad:linear-gradient(135deg,#7c3aed,#2563eb)"><div class="num">1</div><h3>Persönliches Gespräch</h3><p>Wir kommen zu Ihnen und hören uns Ihre aktuelle Situation und Ihren Verbrauch an.</p></div>
<div class="step" style="--stepGrad:linear-gradient(135deg,#0d9488,#0891b2)"><div class="num">2</div><h3>Individueller Vergleich</h3><p>Wir zeigen transparent, welcher Tarif zu Ihnen passt, inklusive aller Kosten.</p></div>
<div class="step" style="--stepGrad:linear-gradient(135deg,#ea580c,#d97706)"><div class="num">3</div><h3>Sie entscheiden</h3><p>Keine Hektik, kein Druck. Der Wechsel läuft erst, wenn Sie wirklich überzeugt sind.</p></div>
</div>
</section>
<section class="section" id="team">
<h2>Die Köpfe hinter E1</h2>
<p class="lead">Wir stehen mit unserem Namen für persönliche, ehrliche Beratung.</p>
<div class="teamGrid">
<div class="teamCard"><div class="avatar" style="--avatarGrad:linear-gradient(135deg,#f59e0b,#ea580c)">OS</div><h3>Orhan Salo</h3><div class="role">Head of Sales &amp; Mitgründer</div><p>Verantwortet Vertrieb und Vertriebsstrategie bei E1 Direktvertrieb. Orhan steht selbst im direkten Kundenkontakt und lebt vor, wie faire Beratung funktioniert.</p></div>
<div class="teamCard"><div class="avatar" style="--avatarGrad:linear-gradient(135deg,#ea580c,#dc2626)">LM</div><h3>Luca-Marco Marrancone</h3><div class="role">Head of Team &amp; Mitgründer</div><p>Verantwortet Teamaufbau und Organisation bei E1 Direktvertrieb. Luca-Marco sorgt dafür, dass aus Einzelkämpfern ein eingespieltes Team wird.</p></div>
</div>
</section>
<section class="section" id="wissen">
<h2>Strom &amp; Gas: Was Sie wissen sollten</h2>
<p class="lead">Ein paar grundlegende Fakten zum deutschen Energiemarkt, unabhängig davon, mit wem Sie am Ende sprechen.</p>
<div class="teamGrid">
<div class="teamCard"><h3>Freie Anbieterwahl</h3><p>Der Strom- und Gasmarkt in Deutschland ist liberalisiert. Jeder Haushalt kann den Anbieter frei wählen, unabhängig vom örtlichen Netzbetreiber, der weiterhin für Leitungen und Versorgungssicherheit zuständig bleibt.</p></div>
<div class="teamCard"><h3>Grundversorgung als Auffangnetz</h3><p>Ohne aktiven Vertrag beliefert automatisch der örtliche Grundversorger. Das ist rechtlich abgesichert, in der Regel aber teurer als ein regulärer Tarif, ein Wechsel lohnt sich meist.</p></div>
<div class="teamCard"><h3>Wechsel ohne Versorgungslücke</h3><p>Ein Anbieterwechsel läuft im Hintergrund über die Netzbetreiber ab. Der Strom bzw. das Gas fließt währenddessen ununterbrochen weiter, es kommt zu keiner Versorgungsunterbrechung.</p></div>
<div class="teamCard"><h3>Was den Preis beeinflusst</h3><p>Neben dem reinen Energiepreis fließen Netzentgelte, Steuern, Abgaben und Umlagen in den Endpreis ein. Diese Bestandteile sind gesetzlich geregelt und für alle Anbieter weitgehend gleich.</p></div>
</div>
</section>
<section class="section" id="aktuelles">
<h2>Aktuelles aus dem Energiemarkt</h2>
<p class="lead">Automatisch aktualisierte Nachrichten rund um Strom und Gas in Deutschland.</p>
<div id="dynamicNewsGrid" class="teamGrid"><p class="lead">Nachrichten werden geladen…</p></div>
</section>
<script>
fetch('/api/public/energy-news').then(r=>r.json()).then(rows=>{
let grid=document.getElementById('dynamicNewsGrid');
if(!rows.length){grid.innerHTML='<p class="lead">Aktuell keine Nachrichten verfügbar.</p>';return}
grid.innerHTML=rows.map(x=>`<div class="teamCard" style="text-align:left"><div class="role" style="margin-bottom:8px">${x.source||'Nachricht'}</div><h3 style="font-size:1.05rem;line-height:1.4"><a href="${x.link}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none">${x.title}</a></h3></div>`).join('');
}).catch(()=>{document.getElementById('dynamicNewsGrid').innerHTML='<p class="lead">Aktuell keine Nachrichten verfügbar.</p>'});
</script>
<section class="section" id="unser-team">
<h2>Unser Vertriebsteam</h2>
<p class="lead">Die Menschen, die Ihnen persönlich gegenübersitzen.</p>
<div class="teamGrid" id="dynamicTeamGrid"><p class="lead">Team wird geladen…</p></div>
<p style="text-align:center;margin-top:28px"><a class="btnPrimary" href="/karriere" style="padding:13px 26px;border-radius:999px;text-decoration:none;font-weight:700">Werden Sie Teil des Teams</a></p>
</section>
<script>
fetch('/api/public/team').then(r=>r.json()).then(rows=>{
let list=rows.filter(x=>x.role!=='Teamleitung');
let grid=document.getElementById('dynamicTeamGrid');
if(!list.length){grid.innerHTML='<p class="lead">Team im Aufbau. Bald sehen Sie hier unsere Vertriebsberater:innen.</p>';return}
grid.innerHTML=list.map(x=>{
let initials=x.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
let avatar=x.photo_url?`<img src="${x.photo_url}" style="width:76px;height:76px;border-radius:50%;object-fit:cover;margin:0 auto 16px;display:block">`:`<div class="avatar">${initials}</div>`;
return `<div class="teamCard">${avatar}<h3>${x.name}</h3><div class="role">${x.role}${x.tier?' · Stufe '+x.tier:''}</div></div>`;
}).join('');
}).catch(()=>{document.getElementById('dynamicTeamGrid').innerHTML='<p class="lead">Team im Aufbau. Bald sehen Sie hier unsere Vertriebsberater:innen.</p>'});
</script>
<section class="section" id="kontakt">
<div class="contactBand">
<div><h2 style="text-align:left;margin:0 0 6px">Fragen? Wir sind erreichbar.</h2><p style="color:#6b6885;margin:0">Rufen Sie uns direkt an, persönlich und ohne Callcenter.</p></div>
<div style="display:flex;flex-direction:column;gap:10px"><a class="tel" href="tel:+4917684109958">📞 0176 84109958 (Orhan Salo)</a><a class="tel" href="tel:+491782209604">📞 0178 2209604 (Luca-Marco Marrancone)</a></div>
</div>
</section>
<div class="ctaBand"><h2>Sie sind Teil unseres Teams?</h2><p>Mitarbeiter melden sich hier im Vertriebsportal an.</p><a class="btnPrimary" href="/login" style="padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:700">Zum Login</a></div>
<footer class="lFooter">© ''' + str(datetime.utcnow().year) + ''' E1 Direktvertrieb · <a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a></footer>
''' + LANDING_JS + '''
</body></html>'''

KARRIERE_HTML = '''<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Karriere · E1 Direktvertrieb</title><style>''' + LANDING_CSS + '''</style></head><body>
<header class="lHeader"><a class="lLogo" href="/"><img src="/static/logo-icon.png" alt="E1"> E1 Direktvertrieb</a><nav class="lNav"><a href="/karriere">Karriere</a><a href="/#kontakt">Kontakt</a></nav><div class="lLoginWrap"><button class="lLoginBtn" onclick="document.getElementById('lLoginMenu').classList.toggle('open')">Login</button><div class="lLoginMenu" id="lLoginMenu"><a href="/login">Mitarbeiter-Login<small>Für Vertriebspartner</small></a><a href="/admin">Admin-Login<small>Für Teamleitung</small></a></div></div></header>
<section class="careerHero">
<h1>Verkaufen, ohne sich zu <span>verbiegen</span>.</h1>
<p>Bei E1 Direktvertrieb arbeiten Sie eigenverantwortlich, werden persönlich von der Geschäftsführung begleitet und verdienen fair an dem, was Sie leisten. Kein Konzern, keine Warteschleifen, kein Kleingedrucktes.</p>
</section>
<section class="section">
<h2>Warum E1</h2>
<p class="lead">Wir haben E1 selbst aus dem Vertrieb heraus aufgebaut. Wir wissen, worauf es ankommt.</p>
<div class="benefitGrid">
<div class="benefitCard"><div class="ico">🎯</div><h3>Eigenverantwortung</h3><p>Sie organisieren sich selbst. Wir geben den Rahmen, nicht die Kontrolle.</p></div>
<div class="benefitCard"><div class="ico">💶</div><h3>Faire Provision</h3><p>Transparente, stufenbasierte Provisionsstruktur, live einsehbar im Mitarbeiterportal.</p></div>
<div class="benefitCard"><div class="ico">🤝</div><h3>Direkter Draht</h3><p>Kein anonymer Konzern. Sie sprechen direkt mit der Geschäftsführung, nicht mit einer Personalabteilung.</p></div>
<div class="benefitCard"><div class="ico">📈</div><h3>Echtes Wachstum</h3><p>Persönliches Coaching, Schulungen und ein KI-Vertriebscoach helfen Ihnen, sich stetig zu verbessern.</p></div>
</div>
</section>
<section class="section">
<h2>Wer zu uns passt</h2>
<ul class="profileList">
<li>Sie sprechen gerne mit Menschen und hören genauso gut zu, wie Sie reden.</li>
<li>Sie wollen für Ihre Leistung fair bezahlt werden, nicht nach Anwesenheit.</li>
<li>Sie arbeiten selbstständig, ohne dass jemand über Ihre Schulter schaut.</li>
<li>Vertriebserfahrung ist willkommen, aber kein Muss. Wir bringen Ihnen alles bei, was Sie brauchen.</li>
</ul>
</section>
<section class="section">
<h2>Jetzt bewerben</h2>
<p class="lead">Kein Anschreiben nötig. Ein paar Zeilen reichen, wir melden uns persönlich bei Ihnen.</p>
<form class="applyForm" id="applyForm" onsubmit="return false">
<input id="applyName" placeholder="Ihr Name" required>
<input id="applyEmail" type="email" placeholder="E-Mail" required>
<input id="applyPhone" placeholder="Telefon (optional)">
<textarea id="applyMessage" placeholder="Kurz zu Ihnen (optional)" rows="4"></textarea>
<label style="font-size:13.5px;color:#6b6885">Foto (Passbild o.ä., optional aber gerne gesehen)<input id="applyPhoto" type="file" accept=".jpg,.jpeg,.png,.webp" style="display:block;margin-top:6px"></label>
<button type="submit" onclick="submitApplication()">Bewerbung senden</button>
<p class="applyResult" id="applyResult"></p>
</form>
</section>
<footer class="lFooter">© ''' + str(datetime.utcnow().year) + ''' E1 Direktvertrieb · <a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a></footer>
<script>
async function submitApplication(){
let name=document.getElementById('applyName').value.trim();
let email=document.getElementById('applyEmail').value.trim();
if(!name||!email){document.getElementById('applyResult').textContent='Bitte Name und E-Mail angeben.';return}
let fd=new FormData();
fd.append('name',name);fd.append('email',email);fd.append('phone',document.getElementById('applyPhone').value);fd.append('message',document.getElementById('applyMessage').value);
let photoFile=document.getElementById('applyPhoto').files[0];
if(photoFile)fd.append('photo',photoFile);
try{
let r=await fetch('/api/public/apply',{method:'POST',body:fd});
if(!r.ok)throw Error(await r.text());
document.getElementById('applyForm').reset();
document.getElementById('applyResult').textContent='Danke! Wir melden uns bei Ihnen.';
}catch(e){document.getElementById('applyResult').textContent='Senden fehlgeschlagen, bitte später erneut versuchen.'}
}
</script>
''' + LANDING_JS + '''
</body></html>'''

IMPRESSUM_HTML = '''<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Impressum · E1 Direktvertrieb</title><style>''' + LANDING_CSS + '''</style></head><body>
<header class="lHeader"><a class="lLogo" href="/"><img src="/static/logo-icon.png" alt="E1"> E1 Direktvertrieb</a><nav class="lNav"><a href="/karriere">Karriere</a><a href="/#kontakt">Kontakt</a></nav><div class="lLoginWrap"><button class="lLoginBtn" onclick="document.getElementById('lLoginMenu').classList.toggle('open')">Login</button><div class="lLoginMenu" id="lLoginMenu"><a href="/login">Mitarbeiter-Login<small>Für Vertriebspartner</small></a><a href="/admin">Admin-Login<small>Für Teamleitung</small></a></div></div></header>
<div class="legal">
<h1>Impressum</h1>
<h2>Angaben gemäß § 5 TMG</h2>
<p>E1 Direktvertrieb<br>Einzelunternehmen von Orhan Salo und Luca-Marco Marrancone<br>[Anschrift folgt]</p>
<h2>Kontakt</h2>
<p>Telefon: 0176 84109958 · 0178 2209604<br>E-Mail: saloorhan96@gmail.com · luca.marrancone@gmail.com</p>
<h2>Registereintrag</h2>
<p>[Handelsregister, Registergericht, Registernummer — falls vorhanden]</p>
<h2>Umsatzsteuer-ID</h2>
<p>[USt-IdNr. gemäß § 27a UStG — falls vorhanden]</p>
<h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
<p>[Name, Anschrift wie oben]</p>
<p><a href="/">Zurück zur Startseite</a></p>
</div>
''' + LANDING_JS + '''
</body></html>'''

DATENSCHUTZ_HTML = '''<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Datenschutz · E1 Direktvertrieb</title><style>''' + LANDING_CSS + '''</style></head><body>
<header class="lHeader"><a class="lLogo" href="/"><img src="/static/logo-icon.png" alt="E1"> E1 Direktvertrieb</a><nav class="lNav"><a href="/karriere">Karriere</a><a href="/#kontakt">Kontakt</a></nav><div class="lLoginWrap"><button class="lLoginBtn" onclick="document.getElementById('lLoginMenu').classList.toggle('open')">Login</button><div class="lLoginMenu" id="lLoginMenu"><a href="/login">Mitarbeiter-Login<small>Für Vertriebspartner</small></a><a href="/admin">Admin-Login<small>Für Teamleitung</small></a></div></div></header>
<div class="legal">
<h1>Datenschutzerklärung</h1>
<h2>1. Verantwortlicher</h2>
<p>[Firmenname, Anschrift, Kontakt — siehe <a href="/impressum">Impressum</a>]</p>
<h2>2. Verarbeitung im Vertriebsportal</h2>
<p>Über dieses Portal verarbeiten wir personenbezogene Daten unserer Mitarbeiter:innen (Zugangsdaten, Provisions- und Leistungsdaten) sowie Daten von Kund:innen, die im Rahmen der Vertriebstätigkeit erfasst werden (Name, Kontaktdaten, Adresse, Verbrauchsdaten). Rechtsgrundlage ist die Erfüllung des Arbeits- bzw. Vertragsverhältnisses (Art. 6 Abs. 1 lit. b DSGVO) sowie berechtigtes Interesse an einer geordneten Vertriebssteuerung (Art. 6 Abs. 1 lit. f DSGVO).</p>
<h2>3. Speicherdauer</h2>
<p>Daten werden nur so lange gespeichert, wie es für die genannten Zwecke sowie gesetzliche Aufbewahrungspflichten erforderlich ist.</p>
<h2>4. Ihre Rechte</h2>
<p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Wenden Sie sich hierzu an die im Impressum genannte Kontaktadresse.</p>
<p><a href="/">Zurück zur Startseite</a></p>
</div>
''' + LANDING_JS + '''
</body></html>'''

from . import agency
