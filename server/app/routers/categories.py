from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..common import get_owned
from ..db import get_db
from ..models import Budget, Category, Transaction, User
from ..security import current_user

router = APIRouter(prefix="/api/categories", tags=["categories"])


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    kind: Literal["income", "expense"]
    color: str = Field(default="#64748b", pattern=r"^#[0-9a-fA-F]{6}$")
    is_archived: bool = False


class CategoryOut(CategoryIn):
    id: int


def _out(c: Category) -> CategoryOut:
    return CategoryOut(id=c.id, name=c.name, kind=c.kind, color=c.color, is_archived=c.is_archived)


@router.get("", response_model=list[CategoryOut])
def list_categories(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Category).where(Category.user_id == user.id).order_by(Category.kind, Category.name))
    return [_out(c) for c in rows]


def _save(db: Session, category: Category) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A category with this name already exists") from None


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(data: CategoryIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    category = Category(user_id=user.id, **data.model_dump())
    db.add(category)
    _save(db, category)
    return _out(category)


@router.put("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int, data: CategoryIn, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    category = get_owned(db, Category, category_id, user.id, "Category")
    if data.kind != category.kind:
        used = db.scalar(select(Transaction.id).where(Transaction.category_id == category.id).limit(1))
        if used:
            raise HTTPException(409, "Category type can't change once it has transactions")
    for key, value in data.model_dump().items():
        setattr(category, key, value)
    _save(db, category)
    return _out(category)


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    category = get_owned(db, Category, category_id, user.id, "Category")
    used = db.scalar(select(Transaction.id).where(Transaction.category_id == category.id).limit(1))
    if used:
        raise HTTPException(409, "This category has transactions. Archive it instead to keep your history.")
    db.execute(Budget.__table__.delete().where(Budget.category_id == category.id))
    db.delete(category)
    db.commit()
