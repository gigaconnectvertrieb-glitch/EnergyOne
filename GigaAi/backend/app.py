import csv
import io
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, create_engine, func, or_, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./agentur.db")
if DATABASE_URL.startswith("postgresql"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
SECRET = os.getenv("JWT_SECRET", "development-secret-change-me")
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
bearer = HTTPBearer()
STORAGE = Path("/app/storage" if Path("/app").exists() else "storage")
STORAGE.mkdir(parents=True, exist_ok=True)

class Base(DeclarativeBase): pass
class Employee(Base):
    __tablename__ = "mitarbeiter"
    id: Mapped[int] = mapped_column(primary_key=True); email: Mapped[str] = mapped_column(String(255), unique=True); password_hash: Mapped[str] = mapped_column(String(255)); role: Mapped[str] = mapped_column(String(32), default="vertrieb"); name: Mapped[str] = mapped_column(String(120)); phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True); commission_rate: Mapped[float] = mapped_column(Float, default=0); active: Mapped[bool] = mapped_column(Boolean, default=True); last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
class Customer(Base):
    __tablename__ = "kunden"
    id: Mapped[int] = mapped_column(primary_key=True); kind: Mapped[str] = mapped_column(String(10)); first_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True); last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True); company: Mapped[Optional[str]] = mapped_column(String(160), nullable=True); contact_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True); email: Mapped[str] = mapped_column(String(255)); phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True); postal_code: Mapped[str] = mapped_column(String(10)); usage_kwh: Mapped[float] = mapped_column(Float, default=0); status: Mapped[str] = mapped_column(String(40), default="neu"); owner_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id")); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
class CustomerHistory(Base):
    __tablename__ = "kunden_history"
    id: Mapped[int] = mapped_column(primary_key=True); customer_id: Mapped[int] = mapped_column(ForeignKey("kunden.id")); employee_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id")); detail: Mapped[str] = mapped_column(Text); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
class Contract(Base):
    __tablename__ = "vertraege"
    id: Mapped[int] = mapped_column(primary_key=True); customer_id: Mapped[int] = mapped_column(ForeignKey("kunden.id")); employee_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id")); number: Mapped[str] = mapped_column(String(30), unique=True); status: Mapped[str] = mapped_column(String(30), default="entwurf"); envelope_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True); pdf_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
class Invoice(Base):
    __tablename__ = "rechnungen"
    id: Mapped[int] = mapped_column(primary_key=True); contract_id: Mapped[int] = mapped_column(ForeignKey("vertraege.id")); number: Mapped[str] = mapped_column(String(30), unique=True); net: Mapped[float] = mapped_column(Float); vat_rate: Mapped[float] = mapped_column(Float); gross: Mapped[float] = mapped_column(Float); due_date: Mapped[date] = mapped_column(Date); status: Mapped[str] = mapped_column(String(20), default="offen"); pdf_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
class Task(Base):
    __tablename__ = "aufgaben"
    id: Mapped[int] = mapped_column(primary_key=True); title: Mapped[str] = mapped_column(String(200)); description: Mapped[str] = mapped_column(Text, default=""); creator_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id")); assignee_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id")); due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True); status: Mapped[str] = mapped_column(String(20), default="offen"); customer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("kunden.id"), nullable=True); completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
class Price(Base):
    __tablename__ = "netzbetreiber_preise"
    id: Mapped[int] = mapped_column(primary_key=True); operator: Mapped[str] = mapped_column(String(120)); postal_from: Mapped[str] = mapped_column(String(10)); postal_to: Mapped[str] = mapped_column(String(10)); work_price_ct: Mapped[float] = mapped_column(Float); base_price_month: Mapped[float] = mapped_column(Float); valid_from: Mapped[date] = mapped_column(Date, default=date.today); valid_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
class Activity(Base):
    __tablename__ = "aktivitaeten_log"
    id: Mapped[int] = mapped_column(primary_key=True); employee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("mitarbeiter.id"), nullable=True); action: Mapped[str] = mapped_column(String(120)); detail: Mapped[str] = mapped_column(Text, default=""); created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
class CronLog(Base):
    __tablename__ = "cron_logs"
    id: Mapped[int] = mapped_column(primary_key=True); job: Mapped[str] = mapped_column(String(100)); started_at: Mapped[datetime] = mapped_column(DateTime); ended_at: Mapped[datetime] = mapped_column(DateTime); processed: Mapped[int] = mapped_column(Integer, default=0); error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

class Login(BaseModel): email: EmailStr; password: str
class EmployeeIn(BaseModel): email: EmailStr; password: str; name: str; role: Literal["admin", "vertrieb", "support", "buchhaltung"] = "vertrieb"; commission_rate: float = 0; phone: Optional[str] = None
class CustomerIn(BaseModel): kind: Literal["privat", "firma"]; first_name: Optional[str] = None; last_name: Optional[str] = None; company: Optional[str] = None; contact_name: Optional[str] = None; email: EmailStr; phone: Optional[str] = None; postal_code: str; usage_kwh: float = 0; status: str = "neu"; owner_id: Optional[int] = None
class TaskIn(BaseModel): title: str; description: str = ""; assignee_id: int; due_date: Optional[date] = None; customer_id: Optional[int] = None

app = FastAPI(title="Agentur-Zentrale", version="1.0.0")
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
def log(s, emp, action, detail=""): s.add(Activity(employee_id=emp.id if emp else None, action=action, detail=detail))
def sequence(s, cls, prefix): return f"{prefix}-{date.today().year}-{(s.scalar(select(func.count(cls.id))) or 0)+1:04d}"
def make_pdf(name, title, lines):
    path = STORAGE / name; p = canvas.Canvas(str(path), pagesize=A4); p.setTitle(title); p.setFont("Helvetica-Bold", 18); p.drawString(50, 800, title); p.setFont("Helvetica", 11); y=765
    for line in lines: p.drawString(50, y, str(line)[:115]); y -= 20
    p.save(); return f"/files/{name}"

@app.on_event("startup")
def startup():
    Base.metadata.create_all(engine)
    with SessionLocal() as s:
        if not s.scalar(select(Employee.id).limit(1)):
            e=Employee(email=os.getenv("ADMIN_EMAIL","admin@ihre-agentur.de"),password_hash=pwd.hash(os.getenv("ADMIN_PASSWORD","admin123")),role="admin",name="Administrator",commission_rate=0); s.add(e); s.commit()
    scheduler=BackgroundScheduler(); scheduler.add_job(overdue_job, "cron", hour=6, minute=0, id="mahnungen", replace_existing=True); scheduler.start()
def overdue_job():
    begun=datetime.utcnow(); count=0; err=None
    try:
        with SessionLocal() as s:
            for inv in s.scalars(select(Invoice).where(Invoice.status=="offen", Invoice.due_date < date.today()-timedelta(days=14))): inv.status="gemahnt"; count+=1
            s.add(CronLog(job="mahnungen", started_at=begun, ended_at=datetime.utcnow(), processed=count)); s.commit()
    except Exception as ex: err=str(ex)

@app.post("/api/auth/login")
def login(data: Login, s: Session = Depends(db)):
    e=s.scalar(select(Employee).where(Employee.email==data.email))
    if not e or not pwd.verify(data.password,e.password_hash): raise HTTPException(401,"E-Mail oder Passwort falsch")
    e.last_login=datetime.utcnow(); s.commit(); return {"access_token":token_for(e),"employee":serialize(e)}
@app.get("/api/me")
def me(e: Employee = Depends(current)): return serialize(e)
@app.get("/api/dashboard")
def dashboard(e: Employee = Depends(current), s: Session = Depends(db)):
    scope = [] if e.role=="admin" else [Customer.owner_id==e.id]
    customers=s.scalar(select(func.count(Customer.id)).where(*scope)) or 0
    tasks=s.scalar(select(func.count(Task.id)).where(Task.assignee_id==e.id, Task.status!="erledigt")) or 0
    return {"customers":customers,"open_contracts":s.scalar(select(func.count(Contract.id)).where(Contract.status.in_(["entwurf","gesendet","angesehen"]))) or 0,"open_tasks":tasks,"open_invoices":s.scalar(select(func.count(Invoice.id)).where(Invoice.status.in_(["offen","gemahnt"]))) or 0,"revenue":s.scalar(select(func.coalesce(func.sum(Invoice.gross),0)).where(Invoice.status=="bezahlt")) or 0,"activities":[serialize(x) for x in s.scalars(select(Activity).order_by(Activity.created_at.desc()).limit(10))]}
@app.get("/api/customers")
def customers(q: str="", e: Employee=Depends(current), s: Session=Depends(db)):
    stmt=select(Customer).where(or_(Customer.email.ilike(f"%{q}%"),Customer.last_name.ilike(f"%{q}%"),Customer.company.ilike(f"%{q}%"))) if q else select(Customer)
    if e.role!="admin": stmt=stmt.where(Customer.owner_id==e.id)
    return [serialize(x) for x in s.scalars(stmt.order_by(Customer.created_at.desc()))]
@app.post("/api/customers")
def create_customer(data: CustomerIn, e: Employee=Depends(current), s: Session=Depends(db)):
    owner=data.owner_id if e.role=="admin" and data.owner_id else e.id; c=Customer(**data.model_dump(exclude={"owner_id"}),owner_id=owner); s.add(c); s.flush(); s.add(CustomerHistory(customer_id=c.id,employee_id=e.id,detail="Kunde angelegt")); log(s,e,"Kunde angelegt",str(c.id)); s.commit(); return serialize(c)
@app.get("/api/employees")
def employees(_: Employee=Depends(admin), s: Session=Depends(db)): return [serialize(x) for x in s.scalars(select(Employee).order_by(Employee.name))]
@app.post("/api/employees")
def create_employee(data: EmployeeIn, e: Employee=Depends(admin), s: Session=Depends(db)):
    if s.scalar(select(Employee).where(Employee.email==data.email)): raise HTTPException(409,"E-Mail bereits vergeben")
    x=Employee(**data.model_dump(exclude={"password"}),password_hash=pwd.hash(data.password)); s.add(x); log(s,e,"Mitarbeiter angelegt",data.email); s.commit(); return serialize(x)
@app.get("/api/tasks")
def tasks(e: Employee=Depends(current), s: Session=Depends(db)):
    stmt=select(Task) if e.role=="admin" else select(Task).where(Task.assignee_id==e.id)
    return [serialize(x) for x in s.scalars(stmt.order_by(Task.due_date))]
@app.post("/api/tasks")
def create_task(data: TaskIn,e: Employee=Depends(current),s: Session=Depends(db)):
    if e.role!="admin" and data.assignee_id!=e.id: raise HTTPException(403,"Keine Berechtigung")
    x=Task(**data.model_dump(),creator_id=e.id);s.add(x);log(s,e,"Aufgabe angelegt",data.title);s.commit();return serialize(x)
@app.post("/api/contracts/{customer_id}")
def create_contract(customer_id:int,e: Employee=Depends(current),s: Session=Depends(db)):
    c=s.get(Customer,customer_id)
    if not c or (e.role!="admin" and c.owner_id!=e.id):raise HTTPException(404,"Kunde nicht gefunden")
    n=sequence(s,Contract,"V"); url=make_pdf(f"{n}.pdf",f"Vertrag {n}",[f"Kunde: {c.company or (c.first_name+' '+(c.last_name or ''))}",f"Verbrauch: {c.usage_kwh} kWh",f"PLZ: {c.postal_code}"])
    x=Contract(customer_id=c.id,employee_id=e.id,number=n,pdf_url=url);s.add(x);log(s,e,"Vertrag erstellt",n);s.commit();return serialize(x)
@app.post("/api/contracts/{contract_id}/signed")
def sign_contract(contract_id:int,e: Employee=Depends(current),s: Session=Depends(db)):
    if e.role not in ["admin","buchhaltung"]: raise HTTPException(403,"Keine Berechtigung")
    con=s.get(Contract,contract_id)
    if not con:raise HTTPException(404,"Vertrag nicht gefunden")
    con.status="unterschrieben"; c=s.get(Customer,con.customer_id); price=s.scalar(select(Price).where(Price.postal_from<=c.postal_code,Price.postal_to>=c.postal_code).order_by(Price.valid_from.desc()))
    net=round(((price.work_price_ct/100*c.usage_kwh/12) + price.base_price_month) if price else 0,2); vat=19; n=sequence(s,Invoice,"R"); gross=round(net*(1+vat/100),2); url=make_pdf(f"{n}.pdf",f"Rechnung {n}",[f"Vertrag: {con.number}",f"Netto: {net:.2f} EUR",f"MwSt. {vat}%",f"Brutto: {gross:.2f} EUR"]); inv=Invoice(contract_id=con.id,number=n,net=net,vat_rate=vat,gross=gross,due_date=date.today()+timedelta(days=14),pdf_url=url);s.add(inv);log(s,e,"Rechnung erstellt",n);s.commit();return serialize(inv)
@app.get("/api/invoices")
def invoices(e: Employee=Depends(current),s: Session=Depends(db)): return [serialize(x) for x in s.scalars(select(Invoice).order_by(Invoice.created_at.desc()))]
@app.post("/api/invoices/{invoice_id}/paid")
def paid(invoice_id:int,e: Employee=Depends(current),s: Session=Depends(db)):
    if e.role not in ["admin","buchhaltung"]:raise HTTPException(403,"Keine Berechtigung")
    x=s.get(Invoice,invoice_id)
    if not x:raise HTTPException(404,"Rechnung nicht gefunden")
    x.status="bezahlt";log(s,e,"Rechnung bezahlt",x.number);s.commit();return serialize(x)
@app.get("/api/prices")
def prices(_: Employee=Depends(current),s: Session=Depends(db)): return [serialize(x) for x in s.scalars(select(Price).order_by(Price.operator))]
@app.post("/api/prices")
def add_price(data:dict,e:Employee=Depends(admin),s:Session=Depends(db)):
    x=Price(**data);s.add(x);log(s,e,"Preis angelegt",x.operator);s.commit();return serialize(x)
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

HTML = '''<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agentur-Zentrale</title><style>body{font:15px system-ui;margin:0;background:#f4f6fa;color:#172033}header{background:#172033;color:white;padding:14px 6%;display:flex;justify-content:space-between}main{max-width:1100px;margin:28px auto;padding:0 16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.card,section{background:white;border-radius:10px;padding:18px;margin:14px 0;box-shadow:0 1px 4px #dce1eb}.n{font-size:28px;font-weight:700}input,select,button{padding:9px;margin:4px;border:1px solid #d0d6e2;border-radius:6px}button{background:#2463eb;color:#fff;border:0;cursor:pointer}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #eef1f6;text-align:left}.hidden{display:none}</style></head><body><header><b>⚡ Agentur-Zentrale</b><span id="who"></span></header><main><div id="login" class="card"><h2>Anmelden</h2><input id="email" value="admin@ihre-agentur.de" placeholder="E-Mail"><input id="pass" type="password" value="admin123" placeholder="Passwort"><button onclick="signIn()">Login</button><p>Ändern Sie das Startpasswort vor dem Produktiveinsatz.</p></div><div id="app" class="hidden"><div class="grid" id="kpis"></div><section><h2>Neuer Kunde</h2><input id="name" placeholder="Name / Firma"><input id="mail" placeholder="E-Mail"><input id="plz" placeholder="PLZ"><input id="usage" placeholder="Verbrauch kWh" type="number"><select id="kind"><option value="privat">Privat</option><option value="firma">Firma</option></select><button onclick="customer()">Anlegen</button></section><section><h2>Kunden <button onclick="load()">Aktualisieren</button> <a href="/api/export/customers.csv">CSV exportieren</a></h2><table><thead><tr><th>Name</th><th>Status</th><th>PLZ</th><th>Aktion</th></tr></thead><tbody id="customers"></tbody></table></section><section><h2>Offene Aufgaben</h2><table><tbody id="tasks"></tbody></table></section><section><h2>Rechnungen</h2><table><tbody id="invoices"></tbody></table></section></div></main><script>let token='';const api=async(p,o={})=>{o.headers={...(o.headers||{}),Authorization:'Bearer '+token};let r=await fetch('/api'+p,o);if(!r.ok)throw Error(await r.text());return r.json()};async function signIn(){try{let r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value,password:pass.value})});let d=await r.json();if(!r.ok)throw Error(d.detail);token=d.access_token;who.textContent=d.employee.name+' · '+d.employee.role;login.classList.add('hidden');app.classList.remove('hidden');load()}catch(e){alert(e.message)}}async function load(){let[d,cs,ts,is]=await Promise.all([api('/dashboard'),api('/customers'),api('/tasks'),api('/invoices')]);kpis.innerHTML=Object.entries({Kunden:d.customers,'Offene Verträge':d.open_contracts,'Offene Aufgaben':d.open_tasks,'Offene Rechnungen':d.open_invoices,'Umsatz bezahlt':d.revenue.toFixed(2)+' €'}).map(([k,v])=>`<div class=card><small>${k}</small><div class=n>${v}</div></div>`).join('');customers.innerHTML=cs.map(x=>`<tr><td>${x.company||x.first_name+' '+(x.last_name||'')}</td><td>${x.status}</td><td>${x.postal_code}</td><td><button onclick="contract(${x.id})">Vertrag</button></td></tr>`).join('');tasks.innerHTML=ts.map(x=>`<tr><td>${x.title}</td><td>${x.status}</td><td>${x.due_date||''}</td></tr>`).join('');invoices.innerHTML=is.map(x=>`<tr><td>${x.number}</td><td>${x.gross.toFixed(2)} €</td><td>${x.status}</td><td>${x.pdf_url?`<a href="${x.pdf_url}" target=_blank>PDF</a>`:''}</td></tr>`).join('')}async function customer(){let v={kind:kind.value,email:mail.value,postal_code:plz.value,usage_kwh:+usage.value||0};if(v.kind==='firma')v.company=name.value;else{let a=name.value.split(' ');v.first_name=a.shift();v.last_name=a.join(' ')}await api('/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)});load()}async function contract(id){await api('/contracts/'+id,{method:'POST'});alert('Vertrag als PDF erstellt');load()}</script></body></html>'''
HTML = HTML.replace("let token='';", "let token='';const customerName=document.getElementById('name');").replace("name.value", "customerName.value")
DAILY_SECTION = '''<section><h2>Meine Tagesmeldung</h2><label>Datum <input id="dailyDate" type="date"></label><button onclick="changeDaily(-1,'contracts')">−</button><b id="contractsCount">0</b><button onclick="changeDaily(1,'contracts')">+</button> Verträge <button onclick="changeDaily(-1,'cancellations')">−</button><b id="cancellationsCount">0</b><button onclick="changeDaily(1,'cancellations')">+</button> Stornos<br><input id="dailyNote" placeholder="Bemerkung (optional)"><button onclick="saveDaily()">Tagesmeldung speichern</button><p id="dailyResult"></p></section>'''
HTML = HTML.replace("<section><h2>Offene Aufgaben</h2>", DAILY_SECTION + "<section><h2>Offene Aufgaben</h2>")
HTML = HTML.replace("</script>", '''let daily={contracts:0,cancellations:0};document.getElementById('dailyDate').value=new Date().toISOString().slice(0,10);function changeDaily(delta,key){daily[key]=Math.max(0,daily[key]+delta);document.getElementById(key+'Count').textContent=daily[key]}async function saveDaily(){try{let x=await api('/employee/daily-performance',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({entry_date:document.getElementById('dailyDate').value,contracts:daily.contracts,cancellations:daily.cancellations,note:document.getElementById('dailyNote').value})});document.getElementById('dailyResult').textContent='Gespeichert · Netto: '+x.net}catch(e){alert(e.message)}}</script>''')
TRAINING_SECTION = '''<section><h2>Schulungen & KI-Training</h2><button onclick="loadTrainings()">Termine anzeigen</button><button onclick="showPitches()">Pitches & Einwände</button><div id="trainingList"></div><div id="pitchList"></div></section>'''
HTML = HTML.replace(DAILY_SECTION, DAILY_SECTION + TRAINING_SECTION)
HTML = HTML.replace("async function customer()", '''async function loadTrainings(){let rows=await api('/trainings');document.getElementById('trainingList').innerHTML=rows.map(x=>`<p><b>${x.title}</b> · ${x.starts_at.replace('T',' ')} · ${x.participants} Teilnehmer ${x.registered?'✓ angemeldet':`<button onclick="registerTraining(${x.id})">Anmelden</button>`}</p>`).join('')||'<p>Keine Schulungen geplant.</p>'}async function registerTraining(id){await api('/trainings/'+id+'/register',{method:'POST'});loadTrainings()}async function showPitches(){let rows=await api('/training/pitches');document.getElementById('pitchList').innerHTML=rows.map(x=>`<p><b>${x.title}</b><br>${x.text}</p>`).join('')}async function customer()''')
COACH_SECTION = '''<section><h2>EnergyOne Vertriebscoach</h2><div id="coachLog"></div><input id="coachInput" placeholder="z. B. Kunde sagt: Ich habe kein Interesse"><button onclick="askCoach()">Fragen</button></section>'''
HTML = HTML.replace(TRAINING_SECTION, TRAINING_SECTION + COACH_SECTION)
HTML = HTML.replace("async function customer()", '''async function loadCoach(){let rows=await api('/training/coach/history');document.getElementById('coachLog').innerHTML=rows.map(x=>`<p><b>${x.role==='assistant'?'Coach':'Ich'}:</b> ${x.text}</p>`).join('')}async function askCoach(){let input=document.getElementById('coachInput');if(!input.value.trim())return;await api('/training/coach/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:input.value})});input.value='';loadCoach()}async function customer()''')

from . import agency
