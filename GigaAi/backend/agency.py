import os
from datetime import date, datetime
from typing import Optional

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, func, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .app import Base, Contract, Employee, Invoice, app, current, admin, db, log, serialize


class Team(Base):
    __tablename__ = "teams"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    leader_id: Mapped[Optional[int]] = mapped_column(ForeignKey("mitarbeiter.id"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class TeamMember(Base):
    __tablename__ = "team_mitglieder"
    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    employee_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id"))
    since: Mapped[date] = mapped_column(Date, default=date.today)


class ScheduleEntry(Base):
    __tablename__ = "mitarbeiter_planung"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id"))
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    ends_at: Mapped[datetime] = mapped_column(DateTime)
    kind: Mapped[str] = mapped_column(String(30), default="arbeit")
    note: Mapped[str] = mapped_column(Text, default="")


class News(Base):
    __tablename__ = "news"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    text: Mapped[str] = mapped_column(Text)
    author_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id"))
    published_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    important: Mapped[bool] = mapped_column(Boolean, default=False)


class Incentive(Base):
    __tablename__ = "incentives"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[str] = mapped_column(Text, default="")
    minimum_contracts: Mapped[int] = mapped_column(Integer, default=0)
    reward_eur: Mapped[float] = mapped_column(Float)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Commission(Base):
    __tablename__ = "provisionen"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id"))
    contract_id: Mapped[int] = mapped_column(ForeignKey("vertraege.id"), unique=True)
    amount: Mapped[float] = mapped_column(Float)
    calculated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    paid: Mapped[bool] = mapped_column(Boolean, default=False)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class Expense(Base):
    __tablename__ = "ausgaben"
    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    amount: Mapped[float] = mapped_column(Float)
    spent_on: Mapped[date] = mapped_column(Date, default=date.today)
    created_by: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id"))


class SalesGoal(Base):
    __tablename__ = "vertriebsziele"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("mitarbeiter.id"), nullable=True)
    team_id: Mapped[Optional[int]] = mapped_column(ForeignKey("teams.id"), nullable=True)
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    target_contracts: Mapped[int] = mapped_column(Integer, default=0)
    target_revenue: Mapped[float] = mapped_column(Float, default=0)


class ClosureEntry(Base):
    __tablename__ = "abschluss_meldungen"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id"))
    customer_name: Mapped[str] = mapped_column(String(200))
    contract_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    product: Mapped[str] = mapped_column(String(20), default="strom")
    customer_kind: Mapped[str] = mapped_column(String(20), default="privat")
    usage_kwh: Mapped[float] = mapped_column(Float, default=0)
    completed_on: Mapped[date] = mapped_column(Date, default=date.today)
    status: Mapped[str] = mapped_column(String(20), default="eingereicht")
    expected_commission: Mapped[float] = mapped_column(Float, default=0)
    note: Mapped[str] = mapped_column(Text, default="")
    reviewed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("mitarbeiter.id"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class DailyPerformance(Base):
    __tablename__ = "tagesmeldungen"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id"))
    entry_date: Mapped[date] = mapped_column(Date)
    contracts: Mapped[int] = mapped_column(Integer, default=0)
    cancellations: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Training(Base):
    __tablename__ = "schulungen"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    ends_at: Mapped[datetime] = mapped_column(DateTime)
    meeting_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    max_participants: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id"))


class TrainingRegistration(Base):
    __tablename__ = "mitarbeiter_schulungen"
    id: Mapped[int] = mapped_column(primary_key=True)
    training_id: Mapped[int] = mapped_column(ForeignKey("schulungen.id"))
    employee_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id"))
    registered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    attended: Mapped[bool] = mapped_column(Boolean, default=False)


class SalesCoachMessage(Base):
    __tablename__ = "vertriebscoach_nachrichten"
    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id"))
    role: Mapped[str] = mapped_column(String(12))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TeamIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    leader_id: Optional[int] = None

class MemberIn(BaseModel): team_id: int; employee_id: int
class ScheduleIn(BaseModel): employee_id: int; starts_at: datetime; ends_at: datetime; kind: str = "arbeit"; note: str = ""
class NewsIn(BaseModel): title: str; text: str; important: bool = False
class IncentiveIn(BaseModel): name: str; description: str = ""; minimum_contracts: int = Field(ge=0); reward_eur: float = Field(gt=0)
class ExpenseIn(BaseModel): category: str; description: str = ""; amount: float = Field(gt=0); spent_on: date = Field(default_factory=date.today)
class GoalIn(BaseModel): employee_id: Optional[int] = None; team_id: Optional[int] = None; period_start: date; period_end: date; target_contracts: int = Field(ge=0); target_revenue: float = Field(ge=0)
class ClosureIn(BaseModel):
    customer_name: str = Field(min_length=2, max_length=200)
    contract_number: Optional[str] = Field(default=None, max_length=50)
    product: str = "strom"
    customer_kind: str = "privat"
    usage_kwh: float = Field(default=0, ge=0)
    completed_on: date = Field(default_factory=date.today)
    expected_commission: float = Field(default=0, ge=0)
    note: str = ""
class ReviewIn(BaseModel): status: str; note: str = ""
class DailyPerformanceIn(BaseModel): entry_date: date = Field(default_factory=date.today); contracts: int = Field(ge=0, le=100); cancellations: int = Field(ge=0, le=100); note: str = Field(default="", max_length=1000)
class TrainingIn(BaseModel): title: str = Field(min_length=3,max_length=200); description: str = ""; starts_at: datetime; ends_at: datetime; meeting_url: Optional[str] = None; max_participants: Optional[int] = Field(default=None,ge=1)
class PracticeIn(BaseModel): objection: str = Field(min_length=2,max_length=1000); product: str = "Stromvertrag"; customer_type: str = "Privatkunde"
class CoachChatIn(BaseModel): message: str = Field(min_length=2,max_length=2000)


def achievement(actual: float, target: float):
    percent = round(actual / target * 100, 1) if target else 0
    return {"actual": actual, "target": target, "percent": percent, "scale": "gruen" if percent >= 100 else "gelb" if percent >= 70 else "rot"}


@app.get("/api/agency/overview")
def overview(e: Employee = Depends(current), s: Session = Depends(db)):
    start = date.today().replace(day=1)
    contracts = select(func.count(Contract.id)).where(Contract.created_at >= datetime.combine(start, datetime.min.time()))
    if e.role not in ("admin", "buchhaltung"): contracts = contracts.where(Contract.employee_id == e.id)
    revenue = s.scalar(select(func.coalesce(func.sum(Invoice.gross), 0)).where(Invoice.status == "bezahlt", Invoice.created_at >= datetime.combine(start, datetime.min.time()))) or 0
    expenses = s.scalar(select(func.coalesce(func.sum(Expense.amount), 0)).where(Expense.spent_on >= start)) or 0
    open_commissions = s.scalar(select(func.coalesce(func.sum(Commission.amount), 0)).where(Commission.paid.is_(False))) or 0
    return {"month": start.isoformat(), "contracts": s.scalar(contracts) or 0, "active_employees": s.scalar(select(func.count(Employee.id)).where(Employee.active.is_(True))) or 0, "paid_revenue": revenue, "expenses": expenses, "open_commissions": open_commissions, "operating_result": round(revenue-expenses-open_commissions, 2)}


@app.get("/api/agency/leaderboard")
def leaderboard(_: Employee = Depends(current), s: Session = Depends(db)):
    rows = s.execute(select(Employee.id, Employee.name, func.count(Contract.id).label("count")).outerjoin(Contract, Contract.employee_id == Employee.id).where(Employee.active.is_(True)).group_by(Employee.id, Employee.name).order_by(func.count(Contract.id).desc())).all()
    return [{"employee_id": x.id, "name": x.name, "contracts": x.count} for x in rows]


@app.get("/api/agency/scorecards")
def scorecards(e: Employee = Depends(current), s: Session = Depends(db)):
    today = date.today(); first = today.replace(day=1)
    goals = list(s.scalars(select(SalesGoal).where(SalesGoal.period_start <= today, SalesGoal.period_end >= today)))
    employees = list(s.scalars(select(Employee).where(Employee.active.is_(True)).order_by(Employee.name)))
    if e.role not in ("admin", "buchhaltung"): employees = [x for x in employees if x.id == e.id]
    result = []
    for employee in employees:
        contracts = s.scalar(select(func.count(Contract.id)).where(Contract.employee_id == employee.id, Contract.status == "unterschrieben", Contract.created_at >= datetime.combine(first, datetime.min.time()))) or 0
        revenue = s.scalar(select(func.coalesce(func.sum(Invoice.gross), 0)).join(Contract, Invoice.contract_id == Contract.id).where(Contract.employee_id == employee.id, Invoice.status == "bezahlt", Invoice.created_at >= datetime.combine(first, datetime.min.time()))) or 0
        goal = next((x for x in goals if x.employee_id == employee.id), None)
        result.append({"employee_id": employee.id, "name": employee.name, "contracts": achievement(contracts, goal.target_contracts if goal else 0), "revenue": achievement(revenue, goal.target_revenue if goal else 0), "commission_rate": employee.commission_rate})
    return {"period_start": first.isoformat(), "employees": result}


@app.get("/api/agency/team-scorecards")
def team_scorecards(_: Employee = Depends(current), s: Session = Depends(db)):
    today = date.today(); first = today.replace(day=1); output=[]
    goals = list(s.scalars(select(SalesGoal).where(SalesGoal.period_start <= today, SalesGoal.period_end >= today, SalesGoal.team_id.is_not(None))))
    for team in s.scalars(select(Team).where(Team.active.is_(True))):
        members = [x.employee_id for x in s.scalars(select(TeamMember).where(TeamMember.team_id == team.id))]
        contracts = s.scalar(select(func.count(Contract.id)).where(Contract.employee_id.in_(members or [-1]), Contract.status == "unterschrieben", Contract.created_at >= datetime.combine(first, datetime.min.time()))) or 0
        goal = next((x for x in goals if x.team_id == team.id), None)
        output.append({"team_id": team.id, "name": team.name, "members": len(members), "contracts": achievement(contracts, goal.target_contracts if goal else 0)})
    return {"period_start": first.isoformat(), "teams": output}


@app.post("/api/goals")
def create_goal(data: GoalIn, e: Employee = Depends(admin), s: Session = Depends(db)):
    if not data.employee_id and not data.team_id: raise HTTPException(422, "Mitarbeiter oder Team erforderlich")
    if data.employee_id and data.team_id: raise HTTPException(422, "Nur Mitarbeiter oder Team wählen")
    if data.period_end < data.period_start: raise HTTPException(422, "Zeitraum ungültig")
    item=SalesGoal(**data.model_dump());s.add(item);log(s,e,"Vertriebsziel angelegt",str(item.employee_id or item.team_id));s.commit();return serialize(item)


@app.get("/api/employee/closures")
def my_closures(e: Employee = Depends(current), s: Session = Depends(db)):
    return [serialize(x) for x in s.scalars(select(ClosureEntry).where(ClosureEntry.employee_id == e.id).order_by(ClosureEntry.completed_on.desc(), ClosureEntry.id.desc()))]


@app.post("/api/employee/closures")
def submit_closure(data: ClosureIn, e: Employee = Depends(current), s: Session = Depends(db)):
    if e.role in ("admin", "buchhaltung"): raise HTTPException(403, "Abschlüsse werden im Mitarbeiterportal eingereicht")
    item=ClosureEntry(**data.model_dump(),employee_id=e.id);s.add(item);s.flush();log(s,e,"Abschluss eingereicht",str(item.id));s.commit();return serialize(item)


@app.get("/api/employee/performance-calendar")
def my_calendar(month: Optional[str] = None, e: Employee = Depends(current), s: Session = Depends(db)):
    start=date.fromisoformat(month+"-01") if month else date.today().replace(day=1)
    end=date(start.year + (start.month == 12), 1 if start.month == 12 else start.month+1, 1)
    rows=s.execute(select(ClosureEntry.completed_on, ClosureEntry.status, func.count(ClosureEntry.id), func.coalesce(func.sum(ClosureEntry.expected_commission),0)).where(ClosureEntry.employee_id==e.id,ClosureEntry.completed_on>=start,ClosureEntry.completed_on<end).group_by(ClosureEntry.completed_on,ClosureEntry.status).order_by(ClosureEntry.completed_on)).all()
    return [{"day":x[0].isoformat(),"status":x[1],"count":x[2],"expected_commission":x[3]} for x in rows]


@app.get("/api/admin/closures")
def all_closures(month: Optional[str] = None, _: Employee = Depends(admin), s: Session = Depends(db)):
    stmt=select(ClosureEntry)
    if month:
        start=date.fromisoformat(month+"-01"); end=date(start.year+(start.month==12),1 if start.month==12 else start.month+1,1); stmt=stmt.where(ClosureEntry.completed_on>=start,ClosureEntry.completed_on<end)
    return [serialize(x) for x in s.scalars(stmt.order_by(ClosureEntry.completed_on.desc(),ClosureEntry.id.desc()))]


@app.post("/api/admin/closures/{closure_id}/review")
def review_closure(closure_id: int, data: ReviewIn, e: Employee = Depends(admin), s: Session = Depends(db)):
    if data.status not in ("bestaetigt", "storniert", "abgelehnt"): raise HTTPException(422,"Ungültiger Prüfstatus")
    item=s.get(ClosureEntry,closure_id)
    if not item: raise HTTPException(404,"Abschluss nicht gefunden")
    item.status=data.status; item.note=(item.note+"\n"+data.note).strip(); item.reviewed_by=e.id; item.reviewed_at=datetime.utcnow();log(s,e,"Abschluss geprüft",str(item.id));s.commit();return serialize(item)


@app.get("/api/admin/performance-calendar")
def admin_calendar(month: Optional[str] = None, _: Employee = Depends(admin), s: Session = Depends(db)):
    start=date.fromisoformat(month+"-01") if month else date.today().replace(day=1)
    end=date(start.year + (start.month == 12), 1 if start.month == 12 else start.month+1, 1)
    rows=s.execute(select(ClosureEntry.completed_on, Employee.id, Employee.name, ClosureEntry.status, func.count(ClosureEntry.id)).join(Employee,Employee.id==ClosureEntry.employee_id).where(ClosureEntry.completed_on>=start,ClosureEntry.completed_on<end).group_by(ClosureEntry.completed_on,Employee.id,Employee.name,ClosureEntry.status).order_by(ClosureEntry.completed_on,Employee.name)).all()
    return [{"day":x[0].isoformat(),"employee_id":x[1],"employee":x[2],"status":x[3],"count":x[4]} for x in rows]


@app.get("/api/employee/daily-performance")
def my_daily_performance(e: Employee = Depends(current), s: Session = Depends(db)):
    return [serialize(x) for x in s.scalars(select(DailyPerformance).where(DailyPerformance.employee_id == e.id).order_by(DailyPerformance.entry_date.desc()))]


@app.put("/api/employee/daily-performance")
def save_daily_performance(data: DailyPerformanceIn, e: Employee = Depends(current), s: Session = Depends(db)):
    if e.role in ("admin", "buchhaltung"): raise HTTPException(403, "Tagesmeldungen werden im Mitarbeiterportal erfasst")
    item=s.scalar(select(DailyPerformance).where(DailyPerformance.employee_id==e.id,DailyPerformance.entry_date==data.entry_date))
    if item:
        item.contracts=data.contracts;item.cancellations=data.cancellations;item.note=data.note;item.updated_at=datetime.utcnow()
    else:
        item=DailyPerformance(**data.model_dump(),employee_id=e.id);s.add(item)
    log(s,e,"Tagesmeldung gespeichert",data.entry_date.isoformat());s.commit();return {**serialize(item),"net":item.contracts-item.cancellations}


@app.get("/api/admin/daily-performance")
def all_daily_performance(month: Optional[str] = None, _: Employee = Depends(admin), s: Session = Depends(db)):
    stmt=select(DailyPerformance,Employee).join(Employee,Employee.id==DailyPerformance.employee_id)
    if month:
        start=date.fromisoformat(month+"-01");end=date(start.year+(start.month==12),1 if start.month==12 else start.month+1,1);stmt=stmt.where(DailyPerformance.entry_date>=start,DailyPerformance.entry_date<end)
    rows=[]
    for entry, employee in s.execute(stmt.order_by(DailyPerformance.entry_date.desc())).all():
        data=serialize(entry);data.update({"employee":employee.name,"net":entry.contracts-entry.cancellations});rows.append(data)
    return rows


@app.get("/api/trainings")
def trainings(e: Employee = Depends(current), s: Session = Depends(db)):
    items=[]
    for training in s.scalars(select(Training).order_by(Training.starts_at)):
        data=serialize(training); data["registered"] = bool(s.scalar(select(TrainingRegistration.id).where(TrainingRegistration.training_id==training.id,TrainingRegistration.employee_id==e.id))); data["participants"] = s.scalar(select(func.count(TrainingRegistration.id)).where(TrainingRegistration.training_id==training.id)) or 0; items.append(data)
    return items


@app.post("/api/trainings")
def create_training(data: TrainingIn, e: Employee = Depends(admin), s: Session = Depends(db)):
    if data.ends_at <= data.starts_at: raise HTTPException(422,"Endzeit muss später sein")
    item=Training(**data.model_dump(),created_by=e.id);s.add(item);log(s,e,"Schulung angelegt",item.title);s.commit();return serialize(item)


@app.post("/api/trainings/{training_id}/register")
def register_training(training_id: int, e: Employee = Depends(current), s: Session = Depends(db)):
    training=s.get(Training,training_id)
    if not training: raise HTTPException(404,"Schulung nicht gefunden")
    if s.scalar(select(TrainingRegistration.id).where(TrainingRegistration.training_id==training_id,TrainingRegistration.employee_id==e.id)): raise HTTPException(409,"Bereits angemeldet")
    count=s.scalar(select(func.count(TrainingRegistration.id)).where(TrainingRegistration.training_id==training_id)) or 0
    if training.max_participants and count>=training.max_participants: raise HTTPException(409,"Schulung ausgebucht")
    item=TrainingRegistration(training_id=training_id,employee_id=e.id);s.add(item);log(s,e,"Zu Schulung angemeldet",str(training_id));s.commit();return serialize(item)


PITCHES = [
    {"title":"Kurzer Strom-Pitch", "text":"Ich prüfe kostenlos, ob Ihr aktueller Stromtarif noch zu Ihrem Verbrauch passt. Wenn sich kein Vorteil ergibt, entsteht Ihnen keine Verpflichtung."},
    {"title":"Einwand: Kein Interesse", "text":"Verstehe ich. Darf ich nur eine kurze Frage stellen: Wann haben Sie Ihren Tarif zuletzt geprüft? Oft reicht ein kurzer Vergleich, damit Sie wissen, ob alles passt."},
    {"title":"Einwand: Ich habe schon einen Anbieter", "text":"Das ist gut. Gerade dann lohnt sich ein neutraler Vergleich vor Ablauf oder Preisänderung. Ich schaue nur, ob Ihr bestehender Tarif weiterhin sinnvoll ist."},
    {"title":"Einwand: Ich muss überlegen", "text":"Natürlich. Ich fasse die wichtigsten Punkte kurz zusammen und Sie entscheiden in Ruhe. Was wäre für Ihre Entscheidung noch offen?"},
]


@app.get("/api/training/pitches")
def pitches(_: Employee = Depends(current)): return PITCHES


@app.post("/api/training/practice")
def practice(data: PracticeIn, _: Employee = Depends(current)):
    anthropic_key=os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key and anthropic_key != "replace-with-a-new-rotated-key":
        try:
            from anthropic import Anthropic
            result=Anthropic(api_key=anthropic_key).messages.create(model=os.getenv("ANTHROPIC_MODEL","claude-sonnet-4-20250514"),max_tokens=500,system="Du bist ein deutschsprachiger, transparenter Vertriebscoach. Gib eine kurze Einwandbehandlung ohne Druck oder Preisversprechen.",messages=[{"role":"user","content":f"Produkt: {data.product}; Kunde: {data.customer_type}; Einwand: {data.objection}"}])
            return {"source":"claude","answer":result.content[0].text}
        except Exception: pass
    key=os.getenv("OPENAI_API_KEY")
    if not key:
        match=next((x for x in PITCHES if "kein interesse" in data.objection.lower() and "Kein Interesse" in x["title"]),PITCHES[0])
        return {"source":"vorlage","answer":match["text"],"coach_tip":"Bleib freundlich, stelle nur eine offene Anschlussfrage und vermeide Druck."}
    try:
        from openai import OpenAI
        response=OpenAI(api_key=key).responses.create(model=os.getenv("OPENAI_MODEL","gpt-5.5"),store=False,instructions="Du bist ein deutschsprachiger Vertriebscoach für legale, transparente Energieberatung. Gib eine kurze respektvolle Einwandbehandlung, keine Garantien, keine irreführenden Aussagen. Strukturiere als Antwort und kurzer Coach-Tipp.",input=f"Produkt: {data.product}; Kunde: {data.customer_type}; Einwand: {data.objection}")
        return {"source":"ki","answer":response.output_text}
    except Exception:
        return {"source":"vorlage","answer":PITCHES[0]["text"],"coach_tip":"KI ist aktuell nicht erreichbar; nutze diese geprüfte Vorlage."}


COACH_INSTRUCTIONS = "Du bist EnergyOne Vertriebscoach. Hilf Mitarbeitern auf Deutsch bei Pitches, Einwandbehandlung, Gesprächsstruktur, Nachfass-Nachrichten, Selbstorganisation und Zielarbeit. Sei kurz, praktisch und respektvoll. Keine Druckmethoden, keine irreführenden Preisversprechen, keine Rechts- oder Steuerberatung. Frage bei fehlendem Kontext gezielt nach."

@app.get("/api/training/coach/history")
def coach_history(e: Employee = Depends(current), s: Session = Depends(db)):
    return [serialize(x) for x in s.scalars(select(SalesCoachMessage).where(SalesCoachMessage.employee_id==e.id).order_by(SalesCoachMessage.created_at.desc()).limit(30))][::-1]

@app.post("/api/training/coach/chat")
def coach_chat(data: CoachChatIn, e: Employee = Depends(current), s: Session = Depends(db)):
    s.add(SalesCoachMessage(employee_id=e.id,role="user",text=data.message));s.flush()
    history=list(s.scalars(select(SalesCoachMessage).where(SalesCoachMessage.employee_id==e.id).order_by(SalesCoachMessage.created_at.desc()).limit(12)))[::-1]
    anthropic_key=os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key and anthropic_key != "replace-with-a-new-rotated-key":
        try:
            from anthropic import Anthropic
            messages=[{"role":x.role,"content":x.text} for x in history]
            answer=Anthropic(api_key=anthropic_key).messages.create(model=os.getenv("ANTHROPIC_MODEL","claude-sonnet-4-20250514"),max_tokens=700,system=COACH_INSTRUCTIONS,messages=messages).content[0].text
        except Exception: answer="Der KI-Coach ist gerade nicht erreichbar. Nutze bis dahin die Pitch-Vorlagen oder frage deine Teamleitung."
    elif os.getenv("OPENAI_API_KEY"):
        try:
            from openai import OpenAI
            messages=[{"role":x.role,"content":x.text} for x in history]
            answer=OpenAI(api_key=os.getenv("OPENAI_API_KEY")).responses.create(model=os.getenv("OPENAI_MODEL","gpt-5.5"),store=False,instructions=COACH_INSTRUCTIONS,input=messages).output_text
        except Exception:
            answer="Der KI-Coach ist gerade nicht erreichbar. Nutze bis dahin die Pitch-Vorlagen oder frage deine Teamleitung."
    else:
        answer="Für individuelle Antworten bitte die KI-Anbindung aktivieren. Bis dahin: Beschreibe den Einwand kurz, bleib freundlich und stelle eine offene Frage."
    reply=SalesCoachMessage(employee_id=e.id,role="assistant",text=answer);s.add(reply);s.commit();return serialize(reply)


@app.get("/api/teams")
def teams(_: Employee = Depends(current), s: Session = Depends(db)): return [serialize(x) for x in s.scalars(select(Team).order_by(Team.name))]
@app.post("/api/teams")
def create_team(data: TeamIn, e: Employee = Depends(admin), s: Session = Depends(db)):
    item=Team(**data.model_dump()); s.add(item); s.flush(); log(s,e,"Team angelegt",item.name); s.commit(); return serialize(item)
@app.post("/api/teams/members")
def add_member(data: MemberIn, e: Employee = Depends(admin), s: Session = Depends(db)):
    if not s.get(Team,data.team_id) or not s.get(Employee,data.employee_id): raise HTTPException(404,"Team oder Mitarbeiter nicht gefunden")
    item=TeamMember(**data.model_dump());s.add(item);log(s,e,"Teammitglied zugeordnet",str(data.employee_id));s.commit();return serialize(item)


@app.get("/api/planning")
def planning(e: Employee = Depends(current), s: Session = Depends(db)):
    stmt=select(ScheduleEntry) if e.role=="admin" else select(ScheduleEntry).where(ScheduleEntry.employee_id==e.id)
    return [serialize(x) for x in s.scalars(stmt.order_by(ScheduleEntry.starts_at))]
@app.post("/api/planning")
def schedule(data: ScheduleIn, e: Employee = Depends(current), s: Session = Depends(db)):
    if e.role!="admin" and data.employee_id!=e.id: raise HTTPException(403,"Keine Berechtigung")
    if data.ends_at<=data.starts_at: raise HTTPException(422,"Endzeit muss später sein")
    item=ScheduleEntry(**data.model_dump());s.add(item);log(s,e,"Planung erstellt",str(data.employee_id));s.commit();return serialize(item)


@app.get("/api/news")
def news(_: Employee = Depends(current), s: Session = Depends(db)): return [serialize(x) for x in s.scalars(select(News).order_by(News.important.desc(),News.published_at.desc()))]
@app.post("/api/news")
def publish_news(data: NewsIn, e: Employee = Depends(admin), s: Session = Depends(db)):
    item=News(**data.model_dump(),author_id=e.id);s.add(item);log(s,e,"News veröffentlicht",item.title);s.commit();return serialize(item)


@app.get("/api/incentives")
def incentives(_: Employee = Depends(current), s: Session = Depends(db)): return [serialize(x) for x in s.scalars(select(Incentive).order_by(Incentive.id.desc()))]
@app.post("/api/incentives")
def create_incentive(data: IncentiveIn, e: Employee = Depends(admin), s: Session = Depends(db)):
    item=Incentive(**data.model_dump());s.add(item);log(s,e,"Incentive angelegt",item.name);s.commit();return serialize(item)


@app.get("/api/commissions")
def commissions(e: Employee = Depends(current), s: Session = Depends(db)):
    stmt=select(Commission) if e.role in ("admin","buchhaltung") else select(Commission).where(Commission.employee_id==e.id)
    return [serialize(x) for x in s.scalars(stmt.order_by(Commission.calculated_at.desc()))]
@app.post("/api/commissions/calculate")
def calculate(e: Employee = Depends(admin), s: Session = Depends(db)):
    made=0
    for contract, employee in s.execute(select(Contract,Employee).join(Employee,Employee.id==Contract.employee_id).where(Contract.status=="unterschrieben")).all():
        if s.scalar(select(Commission.id).where(Commission.contract_id==contract.id)): continue
        invoice=s.scalar(select(Invoice).where(Invoice.contract_id==contract.id,Invoice.status=="bezahlt"))
        if invoice: s.add(Commission(employee_id=employee.id,contract_id=contract.id,amount=round(invoice.gross*employee.commission_rate/100,2)));made+=1
    log(s,e,"Provisionen berechnet",str(made));s.commit();return {"created":made}
@app.post("/api/commissions/{commission_id}/pay")
def pay(commission_id:int,e:Employee=Depends(admin),s:Session=Depends(db)):
    item=s.get(Commission,commission_id)
    if not item: raise HTTPException(404,"Provision nicht gefunden")
    item.paid=True;item.paid_at=datetime.utcnow();log(s,e,"Provision ausgezahlt",str(commission_id));s.commit();return serialize(item)


@app.get("/api/expenses")
def expenses(_: Employee = Depends(admin), s: Session = Depends(db)): return [serialize(x) for x in s.scalars(select(Expense).order_by(Expense.spent_on.desc()))]
@app.post("/api/expenses")
def add_expense(data: ExpenseIn, e: Employee = Depends(admin), s: Session = Depends(db)):
    item=Expense(**data.model_dump(),created_by=e.id);s.add(item);log(s,e,"Ausgabe erfasst",item.category);s.commit();return serialize(item)
