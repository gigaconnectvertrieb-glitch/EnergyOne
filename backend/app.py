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
from fastapi import Depends, FastAPI, HTTPException, Request
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
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
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
    id: Mapped[int] = mapped_column(primary_key=True); username: Mapped[str] = mapped_column(String(64), unique=True); email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True); totp_secret: Mapped[str] = mapped_column(String(64)); role: Mapped[str] = mapped_column(String(32), default="vertrieb"); name: Mapped[str] = mapped_column(String(120)); phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True); commission_rate: Mapped[float] = mapped_column(Float, default=0); tier: Mapped[int] = mapped_column(Integer, default=1); vp_nummer: Mapped[Optional[str]] = mapped_column(String(30), nullable=True); active: Mapped[bool] = mapped_column(Boolean, default=True); last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
class Settings(Base):
    __tablename__ = "einstellungen"
    id: Mapped[int] = mapped_column(primary_key=True); master_key_hash: Mapped[str] = mapped_column(String(255))
class Customer(Base):
    __tablename__ = "kunden"
    id: Mapped[int] = mapped_column(primary_key=True); kind: Mapped[str] = mapped_column(String(10)); first_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True); last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True); company: Mapped[Optional[str]] = mapped_column(String(160), nullable=True); contact_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True); email: Mapped[str] = mapped_column(String(255)); phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True); postal_code: Mapped[str] = mapped_column(String(10)); street: Mapped[Optional[str]] = mapped_column(String(200), nullable=True); city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True); current_provider_id: Mapped[Optional[int]] = mapped_column(ForeignKey("anbieter.id"), nullable=True); usage_kwh: Mapped[float] = mapped_column(Float, default=0); status: Mapped[str] = mapped_column(String(40), default="neu"); owner_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id")); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
class CustomerHistory(Base):
    __tablename__ = "kunden_history"
    id: Mapped[int] = mapped_column(primary_key=True); customer_id: Mapped[int] = mapped_column(ForeignKey("kunden.id")); employee_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id")); detail: Mapped[str] = mapped_column(Text); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
class Task(Base):
    __tablename__ = "aufgaben"
    id: Mapped[int] = mapped_column(primary_key=True); title: Mapped[str] = mapped_column(String(200)); description: Mapped[str] = mapped_column(Text, default=""); creator_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id")); assignee_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id")); due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True); status: Mapped[str] = mapped_column(String(20), default="offen"); customer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("kunden.id"), nullable=True); completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
class Activity(Base):
    __tablename__ = "aktivitaeten_log"
    id: Mapped[int] = mapped_column(primary_key=True); employee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("mitarbeiter.id"), nullable=True); action: Mapped[str] = mapped_column(String(120)); detail: Mapped[str] = mapped_column(Text, default=""); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Login(BaseModel): username: str; code: str
class EmployeeIn(BaseModel): username: str = Field(min_length=3, max_length=64); email: Optional[EmailStr] = None; name: str; role: Literal["admin", "vertrieb", "support", "buchhaltung"] = "vertrieb"; commission_rate: float = 0; tier: int = Field(default=1, ge=1, le=3); vp_nummer: Optional[str] = None; phone: Optional[str] = None
class MasterKeyIn(BaseModel): new_key: Optional[str] = Field(default=None, min_length=8, max_length=200)
class CustomerIn(BaseModel): kind: Literal["privat", "firma"]; first_name: Optional[str] = None; last_name: Optional[str] = None; company: Optional[str] = None; contact_name: Optional[str] = None; email: EmailStr; phone: Optional[str] = None; postal_code: str; street: Optional[str] = None; city: Optional[str] = None; current_provider_id: Optional[int] = None; usage_kwh: float = 0; status: str = "neu"; owner_id: Optional[int] = None
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
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables: continue
            existing_cols = {c["name"] for c in inspector.get_columns(table.name)}
            for col in table.columns:
                if col.name in existing_cols: continue
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col.type.compile(engine.dialect)}'))
        if "mitarbeiter" in existing_tables and "password_hash" in {c["name"] for c in inspector.get_columns("mitarbeiter")}:
            try: conn.execute(text('ALTER TABLE "mitarbeiter" DROP COLUMN "password_hash"'))
            except Exception: pass

@app.on_event("startup")
def startup():
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
    owner=data.owner_id if e.role=="admin" and data.owner_id else e.id; c=Customer(**data.model_dump(exclude={"owner_id"}),owner_id=owner); s.add(c); s.flush(); s.add(CustomerHistory(customer_id=c.id,employee_id=e.id,detail="Kunde angelegt")); log(s,e,"Kunde angelegt",str(c.id)); s.commit(); return serialize(c)
@app.get("/api/employees")
def employees(_: Employee=Depends(admin), s: Session=Depends(db)): return [serialize_employee(x) for x in s.scalars(select(Employee).order_by(Employee.name))]
@app.post("/api/employees")
def create_employee(data: EmployeeIn, e: Employee=Depends(admin), s: Session=Depends(db)):
    if s.scalar(select(Employee).where(Employee.username==data.username)): raise HTTPException(409,"Benutzername bereits vergeben")
    secret=pyotp.random_base32(); x=Employee(**data.model_dump(),totp_secret=secret); s.add(x); log(s,e,"Mitarbeiter angelegt",data.username); s.commit()
    return {**serialize_employee(x), **totp_setup(x.username, secret)}
@app.post("/api/employees/{employee_id}/reset-totp")
def reset_totp(employee_id: int, e: Employee=Depends(admin), s: Session=Depends(db)):
    x=s.get(Employee,employee_id)
    if not x: raise HTTPException(404,"Mitarbeiter nicht gefunden")
    x.totp_secret=pyotp.random_base32(); log(s,e,"TOTP zurückgesetzt",x.username); s.commit()
    return totp_setup(x.username, x.totp_secret)
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
    for field in ("name","phone","commission_rate","tier","vp_nummer","role","active","email"):
        if field in data: setattr(x,field,data[field])
    log(s,e,"Mitarbeiter geändert",x.username); s.commit(); return serialize_employee(x)
@app.get("/api/export/customers.csv")
def export_customers(_:Employee=Depends(admin),s:Session=Depends(db)):
    rows=[serialize(x) for x in s.scalars(select(Customer))];out=io.StringIO(); w=csv.DictWriter(out,fieldnames=rows[0].keys() if rows else ["id"]);w.writeheader();w.writerows(rows);return Response(out.getvalue(),media_type="text/csv",headers={"Content-Disposition":"attachment; filename=kunden.csv"})
@app.get("/files/{name}")
def files(name:str):
    p=STORAGE/name
    if not p.exists() or p.parent != STORAGE: raise HTTPException(404,"Datei nicht gefunden")
    return Response(p.read_bytes(),media_type="application/pdf")
@app.get("/", response_class=HTMLResponse)
def home(): return HTML

HTML = '''<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>E1 Direktvertrieb · Vertriebsportal</title><style>body{font:15px system-ui;margin:0;background:#f4f6fa;color:#172033}header{background:#172033;color:white;padding:14px 6%;display:flex;justify-content:space-between}main{max-width:1100px;margin:28px auto;padding:0 16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.card,section{background:white;border-radius:10px;padding:18px;margin:14px 0;box-shadow:0 1px 4px #dce1eb;overflow-x:auto}.n{font-size:28px;font-weight:700}input,select,button{padding:9px;margin:4px;border:1px solid #d0d6e2;border-radius:6px}button{background:#2463eb;color:#fff;border:0;cursor:pointer}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #eef1f6;text-align:left}.hidden{display:none}</style></head><body><header><b>⚡ E1 Direktvertrieb · Vertriebsportal</b><span id="who"></span><button id="logoutBtn" class="hidden" onclick="doLogout()">Logout</button></header><main><div id="login" class="card"><h2>Anmelden</h2><input id="username" placeholder="Benutzername"><input id="code" placeholder="Code (Authenticator)"><button onclick="signIn()">Login</button><p>Code aus Google Authenticator. Bei Verlust: Generalschlüssel oder Admin um TOTP-Reset bitten.</p></div><div id="app" class="hidden"><div class="grid" id="kpis"></div><section><h2>Neuer Kunde</h2><input id="custName" placeholder="Name / Firma"><input id="mail" placeholder="E-Mail"><input id="cphone" placeholder="Telefon"><input id="plz" placeholder="PLZ"><input id="street" placeholder="Straße, Nr."><input id="city" placeholder="Ort"><input id="usage" placeholder="Verbrauch kWh" type="number"><select id="kind"><option value="privat">Privat</option><option value="firma">Firma</option></select><select id="curProvider"><option value="">Aktueller Anbieter (optional)</option></select><button onclick="customer()">Anlegen</button></section><section><h2>Kunden <button onclick="load()">Aktualisieren</button> <button onclick="downloadFile('/export/customers.csv','kunden.csv')">CSV exportieren</button></h2><table><thead><tr><th>Name</th><th>Status</th><th>PLZ</th></tr></thead><tbody id="customers"></tbody></table></section><section><h2>Offene Aufgaben</h2><table><tbody id="tasks"></tbody></table></section></div></main><script>let token='';const api=async(p,o={})=>{o.headers={...(o.headers||{}),Authorization:'Bearer '+token};let r=await fetch('/api'+p,o);if(!r.ok)throw Error(await r.text());return r.json()};async function downloadFile(p,filename){let r=await fetch('/api'+p,{headers:{Authorization:'Bearer '+token}});if(!r.ok){alert(await r.text());return}let blob=await r.blob();let url=URL.createObjectURL(blob);let a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url)}async function signIn(){try{let r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:username.value,code:code.value})});let d=await r.json();if(!r.ok)throw Error(d.detail);token=d.access_token;who.innerHTML=d.employee.name+' · '+d.employee.role+' · '+tierBadge(d.employee.tier);login.classList.add('hidden');app.classList.remove('hidden');logoutBtn.classList.remove('hidden');armIdleTimer();if(d.employee.role==='admin'){adminSection.classList.remove('hidden');loadEmployees();loadStornoOverview()}if(d.employee.role==='admin'||d.employee.role==='buchhaltung'){accountingSection.classList.remove('hidden');loadExpiringDocs()}load()}catch(e){alert(e.message)}}function doLogout(){token='';document.location.reload()}let idleTimer=null;function armIdleTimer(){['click','keydown','mousemove','scroll'].forEach(ev=>document.addEventListener(ev,resetIdleTimer));resetIdleTimer()}function resetIdleTimer(){clearTimeout(idleTimer);idleTimer=setTimeout(()=>{alert('Automatisch abgemeldet wegen Inaktivität.');doLogout()},15*60*1000)}async function load(){let[d,cs,ts]=await Promise.all([api('/dashboard'),api('/customers'),api('/tasks')]);kpis.innerHTML=Object.entries({Kunden:d.customers,'Offene Aufgaben':d.open_tasks}).map(([k,v])=>`<div class=card><small>${k}</small><div class=n>${v}</div></div>`).join('');customers.innerHTML=cs.map(x=>`<tr><td>${x.company||x.first_name+' '+(x.last_name||'')}</td><td>${x.status}</td><td>${x.postal_code}</td></tr>`).join('');tasks.innerHTML=ts.map(x=>`<tr><td>${x.title}</td><td>${x.status}</td><td>${x.due_date||''}</td></tr>`).join('');loadProviders();loadCharts();loadCommissions();loadDocuments()}async function customer(){let v={kind:kind.value,email:mail.value,phone:cphone.value,postal_code:plz.value,street:street.value,city:city.value,usage_kwh:+usage.value||0};if(curProvider.value)v.current_provider_id=+curProvider.value;if(v.kind==='firma')v.company=custName.value;else{let a=custName.value.split(' ');v.first_name=a.shift();v.last_name=a.join(' ')}await api('/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)});load()}</script></body></html>'''
DAILY_SECTION = '''<section><h2>Meine Tagesmeldung</h2><label>Datum <input id="dailyDate" type="date"></label><button onclick="changeDaily(-1,'contracts')">−</button><b id="contractsCount">0</b><button onclick="changeDaily(1,'contracts')">+</button> Verträge <button onclick="changeDaily(-1,'cancellations')">−</button><b id="cancellationsCount">0</b><button onclick="changeDaily(1,'cancellations')">+</button> Stornos<br><input id="dailyNote" placeholder="Bemerkung (optional)"><button onclick="saveDaily()">Tagesmeldung speichern</button><p id="dailyResult"></p></section>'''
HTML = HTML.replace("<section><h2>Offene Aufgaben</h2>", DAILY_SECTION + "<section><h2>Offene Aufgaben</h2>")
HTML = HTML.replace("</script>", '''let daily={contracts:0,cancellations:0};document.getElementById('dailyDate').value=new Date().toISOString().slice(0,10);function changeDaily(delta,key){daily[key]=Math.max(0,daily[key]+delta);document.getElementById(key+'Count').textContent=daily[key]}async function saveDaily(){try{let x=await api('/employee/daily-performance',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({entry_date:document.getElementById('dailyDate').value,contracts:daily.contracts,cancellations:daily.cancellations,note:document.getElementById('dailyNote').value})});document.getElementById('dailyResult').textContent='Gespeichert · Netto: '+x.net}catch(e){alert(e.message)}}</script>''')
TRAINING_SECTION = '''<section><h2>Schulungen & KI-Training</h2><button onclick="loadTrainings()">Termine anzeigen</button><button onclick="showPitches()">Pitches & Einwände</button><div id="trainingList"></div><div id="pitchList"></div></section>'''
HTML = HTML.replace(DAILY_SECTION, DAILY_SECTION + TRAINING_SECTION)
HTML = HTML.replace("async function customer()", '''async function loadTrainings(){let rows=await api('/trainings');document.getElementById('trainingList').innerHTML=rows.map(x=>`<p><b>${x.title}</b> · ${x.starts_at.replace('T',' ')} · ${x.participants} Teilnehmer ${x.registered?'✓ angemeldet':`<button onclick="registerTraining(${x.id})">Anmelden</button>`}</p>`).join('')||'<p>Keine Schulungen geplant.</p>'}async function registerTraining(id){await api('/trainings/'+id+'/register',{method:'POST'});loadTrainings()}async function showPitches(){let rows=await api('/training/pitches');document.getElementById('pitchList').innerHTML=rows.map(x=>`<p><b>${x.title}</b><br>${x.text}</p>`).join('')}async function customer()''')
COACH_SECTION = '''<section><h2>EnergyOne Vertriebscoach <button onclick="clearCoach()" style="float:right">Chat leeren</button></h2><div id="coachLog"></div><input id="coachInput" placeholder="z. B. Kunde sagt: Ich habe kein Interesse"><input id="coachFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp"><button onclick="askCoach()">Fragen</button><p><small>Chat leeren löscht nur die Anzeige — die KI erinnert sich weiterhin an den Verlauf.</small></p></section>'''
HTML = HTML.replace(TRAINING_SECTION, TRAINING_SECTION + COACH_SECTION)
HTML = HTML.replace("async function customer()", '''let coachClearedAt=null;async function loadCoach(){let rows=await api('/training/coach/history');document.getElementById('coachLog').innerHTML=rows.filter(x=>!coachClearedAt||x.created_at>coachClearedAt).map(x=>`<p><b>${x.role==='assistant'?'Coach':'Ich'}:</b> ${x.text}</p>`).join('')}function clearCoach(){coachClearedAt=new Date().toISOString();coachLog.innerHTML=''}async function askCoach(){let input=document.getElementById('coachInput');let fileInput=document.getElementById('coachFile');if(!input.value.trim()&&!fileInput.files[0])return;if(fileInput.files[0]){let fd=new FormData();fd.append('file',fileInput.files[0]);fd.append('message',input.value);await fetch('/api/training/coach/upload',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd});fileInput.value=''}else{await api('/training/coach/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:input.value})})}input.value='';await loadCoach()}async function customer()''')

COMMISSION_SECTION = '''<section><h2>Meine Provisionen</h2><div class="grid" id="commissionKpis"></div><table><thead><tr><th>Kunde</th><th>Produkt</th><th>Datum</th><th>Status</th><th>Provision</th></tr></thead><tbody id="closureList"></tbody></table></section>'''
HTML = HTML.replace(COACH_SECTION, COACH_SECTION + COMMISSION_SECTION)
HTML = HTML.replace("async function customer()", '''function statusBadge(s){const c={bearbeitung:'#eab308',abgeschlossen:'#16a34a',storno:'#dc2626',klaerung:'#2463eb',eingereicht:'#94a3b8'}[s]||'#94a3b8';const l={bearbeitung:'In Bearbeitung',abgeschlossen:'Abgeschlossen',storno:'Storno',klaerung:'Klärungsbedarf',eingereicht:'Eingereicht'}[s]||s;return `<span style="background:${c};color:#fff;border-radius:4px;padding:2px 8px;font-size:12px">${l}</span>`}async function loadCommissions(){let c=await api('/employee/commission-overview');commissionKpis.innerHTML=Object.entries({'Provision (abgeschlossen)':c.total_commission.toFixed(2)+' €','Offene Provision':c.pending_commission.toFixed(2)+' €',Abgeschlossen:c.contracts_completed,Offen:c.contracts_pending}).map(([k,v])=>`<div class=card><small>${k}</small><div class=n>${v}</div></div>`).join('');let rows=await api('/employee/closures');closureList.innerHTML=rows.map(x=>`<tr><td>${x.customer_name}</td><td>${x.product}</td><td>${x.completed_on}</td><td>${statusBadge(x.status)}</td><td>${x.expected_commission.toFixed(2)} €</td></tr>`).join('')}async function loadStornoOverview(){let rows=await api('/admin/commission-overview');stornoOverview.innerHTML='<table><thead><tr><th>Mitarbeiter</th><th>Stornoquote</th><th>Storno</th><th>Abgeschlossen</th></tr></thead><tbody>'+rows.map(x=>`<tr><td>${x.name}</td><td style="color:${x.storno_alert?'#dc2626':'#16a34a'};font-weight:700">${x.cancellation_rate} %</td><td>${x.contracts_cancelled}</td><td>${x.contracts_completed}</td></tr>`).join('')+'</tbody></table>'}async function customer()''')
CHARTS_SECTION = '''<section><h2>Zielerreichung</h2><div id="scoreCharts"></div></section><section><h2>Teams gesamt</h2><div id="teamCharts"></div></section><section><h2>Incentives</h2><div id="incentiveList"></div></section>'''
HTML = HTML.replace(COMMISSION_SECTION, COMMISSION_SECTION + CHARTS_SECTION)
HTML = HTML.replace("async function customer()", '''function bar(pct,scale){const c=scale==='gruen'?'#16a34a':scale==='gelb'?'#eab308':'#dc2626';return `<div style="background:#eef1f6;border-radius:4px;overflow:hidden;height:14px;width:100%"><div style="background:${c};height:14px;width:${Math.min(100,pct)}%"></div></div>`}async function loadCharts(){let sc=await api('/agency/scorecards');scoreCharts.innerHTML=sc.employees.map(x=>`<div class=card><b>${x.name}</b><br>Verträge ${x.contracts.actual}/${x.contracts.target} (${x.contracts.percent}%)${bar(x.contracts.percent,x.contracts.scale)}Umsatz ${x.revenue.actual.toFixed(0)}/${x.revenue.target.toFixed(0)} € (${x.revenue.percent}%)${bar(x.revenue.percent,x.revenue.scale)}</div>`).join('')||'<p>Keine Ziele hinterlegt.</p>';let tc=await api('/agency/team-scorecards');teamCharts.innerHTML=tc.teams.map(x=>`<div class=card><b>${x.name}</b> (${x.members} Mitarbeiter)<br>Verträge ${x.contracts.actual}/${x.contracts.target} (${x.contracts.percent}%)${bar(x.contracts.percent,x.contracts.scale)}</div>`).join('')||'<p>Keine Teams.</p>';let inc=await api('/incentives');incentiveList.innerHTML=inc.map(x=>`<p><b>${x.name}</b> — ab ${x.minimum_contracts} Verträgen: ${x.reward_eur.toFixed(2)} €<br>${x.description}</p>`).join('')||'<p>Keine Incentives.</p>'}async function customer()''')
DOCUMENTS_SECTION = '''<section><h2>Meine Unterlagen</h2><select id="docCategory"><option value="ausweis">Ausweis</option><option value="bankkarte">Bankkarte</option><option value="gewerbeanmeldung">Gewerbeanmeldung</option><option value="fuehrungszeugnis">Führungszeugnis</option><option value="rechnung">Rechnung/Beleg</option><option value="sonstiges">Sonstiges</option></select><input id="docFile" type="file"><label>Ablaufdatum (optional, z.B. Führungszeugnis) <input id="docExpires" type="date"></label><label>Betrag € (optional, bei Rechnung) <input id="docAmount" type="number"></label><button onclick="uploadDocument()">Hochladen</button><table><thead><tr><th>Kategorie</th><th>Datei</th><th>Ablauf</th><th></th></tr></thead><tbody id="documentList"></tbody></table></section><section id="accountingSection" class="hidden"><h2>Buchhaltung · Ablaufende Unterlagen</h2><table><thead><tr><th>Mitarbeiter</th><th>Kategorie</th><th>Datei</th><th>Ablauf</th></tr></thead><tbody id="expiringDocs"></tbody></table></section>'''
HTML = HTML.replace(CHARTS_SECTION, CHARTS_SECTION + DOCUMENTS_SECTION)
HTML = HTML.replace("async function customer()", '''async function uploadDocument(){let f=docFile.files[0];if(!f){alert('Bitte Datei wählen');return}let fd=new FormData();fd.append('file',f);fd.append('category',docCategory.value);if(docExpires.value)fd.append('expires_on',docExpires.value);if(docAmount.value)fd.append('amount',docAmount.value);await fetch('/api/documents',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd});docFile.value='';docExpires.value='';docAmount.value='';loadDocuments()}async function loadDocuments(){let rows=await api('/documents');documentList.innerHTML=rows.map(x=>`<tr><td>${x.category}</td><td>${x.filename}</td><td>${x.expires_on||'-'}</td><td><button onclick="downloadFile('/documents/${x.id}/file','${x.filename}')">Download</button></td></tr>`).join('')}async function loadExpiringDocs(){let rows=await api('/admin/documents/expiring');expiringDocs.innerHTML=rows.map(x=>`<tr><td>${x.employee_name||'Agentur'}</td><td>${x.category}</td><td>${x.filename}</td><td>${x.expires_on}</td></tr>`).join('')||'<p>Nichts läuft bald ab.</p>'}async function customer()''')

ADMIN_SECTION = '''<section id="adminSection" class="hidden"><h2>Admin · Mitarbeiter</h2><input id="empVpNummer" placeholder="VP-Nummer (= Benutzername für Login)"><input id="empName" placeholder="Name"><input id="empEmail" placeholder="E-Mail (optional)"><select id="empRole"><option value="vertrieb">Vertrieb</option><option value="support">Support</option><option value="buchhaltung">Buchhaltung</option><option value="admin">Admin</option></select><select id="empTier"><option value="1">Stufe 1</option><option value="2">Stufe 2</option><option value="3">Stufe 3</option></select><button onclick="createEmployee()">Anlegen</button><div id="empQr"></div><table><thead><tr><th>ID</th><th>Benutzername</th><th>Name</th><th>Rolle</th><th>Stufe</th><th>Report</th></tr></thead><tbody id="employeeList"></tbody></table><h3>TOTP zurücksetzen</h3><input id="resetEmpId" placeholder="Mitarbeiter-ID" type="number"><button onclick="resetTotp()">Neu einrichten</button><div id="resetQr"></div><h2>Admin · Anbieter</h2><input id="provName" placeholder="Anbietername"><input id="provStreet" placeholder="Straße"><input id="provPlz" placeholder="PLZ"><input id="provCity" placeholder="Ort"><input id="provPhone" placeholder="Telefon"><input id="provContact" placeholder="Ansprechpartner"><button onclick="createProvider()">Anbieter anlegen</button><h2>Admin · Stornoquoten</h2><div id="stornoOverview"></div><p><small>Tarife &amp; Provisionsstaffeln werden über <code>/docs</code> (<code>/api/providers/import</code> für Massenimport, oder <code>/api/providers/{id}/tariffs</code> einzeln) gepflegt.</small></p><div id="providerList"></div><h2>Admin · Generalschlüssel</h2><input id="newMasterKey" placeholder="Eigener Schlüssel (leer = automatisch generieren)"><button onclick="rotateMasterKey()">Neu setzen</button><p id="masterKeyResult"></p></section>'''
HTML = HTML.replace(CHARTS_SECTION, CHARTS_SECTION + ADMIN_SECTION)
HTML = HTML.replace("async function customer()", '''function tierBadge(t){const c={1:'#2463eb',2:'#eab308',3:'#7c3aed'}[t]||'#94a3b8';return `<span style="background:${c};color:#fff;border-radius:4px;padding:2px 8px;font-size:12px">Stufe ${t}</span>`}async function createEmployee(){let r=await api('/employees',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:empVpNummer.value,name:empName.value,email:empEmail.value||null,role:empRole.value,tier:+empTier.value,vp_nummer:empVpNummer.value})});empQr.innerHTML='<p>QR für '+r.username+' scannen (oder Schlüssel manuell eingeben: <code>'+r.totp_secret+'</code>):</p><img src="data:image/png;base64,'+r.totp_qr_base64+'">';loadEmployees()}async function loadEmployees(){let rows=await api('/employees');employeeList.innerHTML=rows.map(x=>`<tr><td>${x.id}</td><td>${x.username}</td><td>${x.name}</td><td>${x.role}</td><td>${tierBadge(x.tier)}</td><td><button onclick="downloadFile('/employees/${x.id}/report.pdf','report-${x.username}.pdf')">PDF</button> <button onclick="downloadFile('/employees/${x.id}/report.xlsx','report-${x.username}.xlsx')">Excel</button></td></tr>`).join('')}async function resetTotp(){let r=await api('/employees/'+resetEmpId.value+'/reset-totp',{method:'POST'});resetQr.innerHTML='<p>Schlüssel manuell: <code>'+r.totp_secret+'</code></p><img src="data:image/png;base64,'+r.totp_qr_base64+'">'}async function createProvider(){await api('/providers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:provName.value,street:provStreet.value,postal_code:provPlz.value,city:provCity.value,phone:provPhone.value,contact_person:provContact.value})});loadProviders()}async function loadProviders(){let rows=await api('/providers');providerList.innerHTML='<table><tbody>'+rows.map(x=>`<tr><td>${x.id}</td><td>${x.name}</td><td>${x.city||''}</td></tr>`).join('')+'</tbody></table>';curProvider.innerHTML='<option value="">Aktueller Anbieter (optional)</option>'+rows.map(x=>`<option value="${x.id}">${x.name}</option>`).join('')}async function rotateMasterKey(){let r=await api('/auth/master-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({new_key:newMasterKey.value||null})});masterKeyResult.innerHTML='Neuer Generalschlüssel (jetzt persönlich/telefonisch weitergeben, wird nirgends automatisch verschickt): <b>'+r.new_key+'</b>';newMasterKey.value=''}async function customer()''')

from . import agency
