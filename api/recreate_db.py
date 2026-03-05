"""
Recria o banco de dados do zero.

Uso (na raiz do projeto ou em api/):
    python -m api.recreate_db

Ou:
    cd api && python recreate_db.py

ATENÇÃO: Apaga TODOS os dados existentes.

Usa postgres (BYPASSRLS) para operações admin. A aplicação FastAPI
usa mdm_app (sem BYPASSRLS) via db.py.
"""
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
# noqa: E402 — imports abaixo dependem das variáveis de ambiente carregadas acima

from sqlalchemy import create_engine, text

from db import Base
import orm_models  # noqa: F401 — garante que todos os modelos estejam registrados

# Engine admin com postgres (BYPASSRLS) — não usa db.engine
_admin_url = os.getenv("DATABASE_URL", "")
if "@db:" in _admin_url:
    _admin_url = _admin_url.replace("@db:", "@localhost:")
if not _admin_url:
    raise RuntimeError("DATABASE_URL não definido")
admin_engine = create_engine(_admin_url, pool_pre_ping=True)


def setup_rls(eng):
    """Configura Row-Level Security para isolamento multi-tenant."""
    rls_tables = [
        "users",
        "roles",
        "pdm_templates",
        "workflow_header",
        "workflow_config",
        "material_requests",
        "request_history",
        "system_logs",
        "material_database",
        "notifications",
        "user_notification_prefs",
        "field_dictionary",
    ]
    with eng.connect() as conn:
        # Criar usuário de aplicação sem BYPASSRLS
        conn.execute(text("""
            DO $$ BEGIN
                IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mdm_app') THEN
                    CREATE ROLE mdm_app LOGIN PASSWORD 'mdm_app_pass';
                END IF;
            END $$
        """))
        conn.execute(text("GRANT CONNECT ON DATABASE masterdata TO mdm_app"))
        conn.execute(text("GRANT USAGE ON SCHEMA public TO mdm_app"))
        conn.execute(text("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mdm_app"))
        conn.execute(text("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mdm_app"))
        # Garantir que postgres mantém BYPASSRLS (para operações admin)
        conn.execute(text("ALTER ROLE postgres BYPASSRLS"))
        # mdm_app NÃO tem BYPASSRLS — vai respeitar o RLS

        for table in rls_tables:
            conn.execute(text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
            conn.execute(text(f"DROP POLICY IF EXISTS tenant_isolation ON {table}"))
            conn.execute(text(f"DROP POLICY IF EXISTS master_bypass ON {table}"))
            conn.execute(text(f"""
                CREATE POLICY tenant_isolation ON {table}
                FOR ALL
                USING (
                    tenant_id = current_setting('app.tenant_id', true)::integer
                )
            """))
            conn.execute(text(f"""
                CREATE POLICY master_bypass ON {table}
                FOR ALL
                USING (
                    current_setting('app.is_master', true) = 'true'
                )
            """))
        conn.commit()
    print("✅ RLS configurado para todas as tabelas")


def verify_rls(engine):
    """Confirma que as políticas RLS existem nas tabelas."""
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT tablename, policyname 
            FROM pg_policies 
            WHERE schemaname = 'public'
            ORDER BY tablename, policyname
        """))
        policies = result.fetchall()

        tables_with_rls = set(row[0] for row in policies)
        print(f"✅ RLS verificado: {len(tables_with_rls)} tabelas protegidas")
        print(f"   {len(policies)} políticas ativas")

        # Verificar se tabelas críticas têm RLS
        critical = ['users', 'roles', 'material_database', 'material_requests']
        for table in critical:
            status = "✅" if table in tables_with_rls else "⚠️  FALTANDO"
            print(f"   {table}: {status}")


def main():
    print("Dropando todas as tabelas...")
    Base.metadata.drop_all(bind=admin_engine)
    print("Criando todas as tabelas...")
    Base.metadata.create_all(bind=admin_engine)
    setup_rls(admin_engine)
    print("Populando dados iniciais (seed)...")
    import seed_data as seed_mod
    seed_mod.main()
    verify_rls(admin_engine)
    print("OK.")


if __name__ == "__main__":
    main()
