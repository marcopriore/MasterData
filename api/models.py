from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID, uuid4

class ProductCreate(BaseModel):
    name: str
    description: Optional[str] = None

class Product(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    description: Optional[str] = None


class AttributeValue(BaseModel):
    value: str
    abbreviation: str


class PDMAttribute(BaseModel):
    id: str
    order: int
    name: str
    dataType: str  # "numeric" | "text" | "lov"
    isRequired: bool
    includeInDescription: bool
    abbreviation: str
    allowedValues: list[AttributeValue] = Field(default_factory=list)


class PDMCreate(BaseModel):
    name: str
    internal_code: str
    is_active: bool = True
    attributes: list[PDMAttribute] = Field(default_factory=list)