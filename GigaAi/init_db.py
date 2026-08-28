from backend.app import Base, engine
Base.metadata.create_all(engine)
print("Datenbanktabellen erstellt.")
