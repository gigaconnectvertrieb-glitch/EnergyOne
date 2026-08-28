from backend.app import Customer, Employee, Price, SessionLocal, pwd

with SessionLocal() as s:
    admin=s.query(Employee).filter_by(email="admin@ihre-agentur.de").first()
    if not admin:
        admin=Employee(email="admin@ihre-agentur.de",password_hash=pwd.hash("admin123"),name="Administrator",role="admin");s.add(admin);s.flush()
    if not s.query(Price).first(): s.add(Price(operator="Standardnetz",postal_from="00000",postal_to="99999",work_price_ct=32.5,base_price_month=12.0))
    if not s.query(Customer).first():
        for i in range(1,6): s.add(Customer(kind="privat",first_name="Demo",last_name=f"Kunde {i}",email=f"kunde{i}@demo.de",postal_code="10115",usage_kwh=2500,owner_id=admin.id))
    s.commit()
print("Demodaten angelegt.")
