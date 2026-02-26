from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException

from deps import get_db
from orm_models import ProductORM, PDMOrm

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}


from models import Product, ProductCreate, PDMCreate

#products: list[Product] = []

#-------------------------------
# CARREGAR PRODUTO
@app.get("/products")
def list_products(db: Session = Depends(get_db)):
    rows = db.query(ProductORM).order_by(ProductORM.name.asc()).all()
    return [{"id": r.id, "name": r.name, "description": r.description} for r in rows]

#-------------------------------
# CRIAR PRODUTO
@app.post("/products")
def create_product(payload: ProductCreate, db: Session = Depends(get_db)):
    row = ProductORM(name=payload.name, description=payload.description)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "description": row.description}

# -------------------------------
# LISTAR PDMs
@app.get("/api/pdm")
def list_pdms(db: Session = Depends(get_db)):
    rows = db.query(PDMOrm).order_by(PDMOrm.name.asc()).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "internal_code": r.internal_code,
            "is_active": r.is_active,
            "attributes": r.attributes or [],
        }
        for r in rows
    ]


# -------------------------------
# CRIAR PDM
@app.post("/api/pdm")
def create_pdm(payload: PDMCreate, db: Session = Depends(get_db)):
    attributes_data = [a.model_dump() for a in payload.attributes]
    row = PDMOrm(
        name=payload.name,
        internal_code=payload.internal_code,
        is_active=payload.is_active,
        attributes=attributes_data,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "name": row.name,
        "internal_code": row.internal_code,
        "is_active": row.is_active,
        "attributes": row.attributes,
    }


# -------------------------------
# ATUALIZAR PDM
@app.put("/api/pdm/{pdm_id}")
def update_pdm(
    pdm_id: int, payload: PDMCreate, db: Session = Depends(get_db)
):
    row = db.query(PDMOrm).filter(PDMOrm.id == pdm_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="PDM not found")
    attributes_data = [a.model_dump() for a in payload.attributes]
    row.name = payload.name
    row.internal_code = payload.internal_code
    row.is_active = payload.is_active
    row.attributes = attributes_data
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "name": row.name,
        "internal_code": row.internal_code,
        "is_active": row.is_active,
        "attributes": row.attributes,
    }


# -------------------------------
# DELETAR PRODUTO
from uuid import UUID

@app.delete("/products/{product_id}")
def delete_product(product_id: UUID, db: Session = Depends(get_db)):
    row = db.query(ProductORM).filter(ProductORM.id == product_id).first()
    if not row:
        return {"ok": False}

    db.delete(row)
    db.commit()
    return {"ok": True}
