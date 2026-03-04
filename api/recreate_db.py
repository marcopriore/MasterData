"""
Recria o banco de dados do zero.

Uso (na raiz do projeto ou em api/):
    python -m api.recreate_db

Ou:
    cd api && python recreate_db.py

ATENÇÃO: Apaga TODOS os dados existentes.
"""
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")

from db import engine
from db import Base
import orm_models  # noqa: F401 — garante que todos os modelos estejam registrados


def main():
    print("Dropando todas as tabelas...")
    Base.metadata.drop_all(bind=engine)
    print("Criando todas as tabelas...")
    Base.metadata.create_all(bind=engine)
    print("OK. Execute 'python seed_data.py' para popular os dados iniciais.")


if __name__ == "__main__":
    main()
