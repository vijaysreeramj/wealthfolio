from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..common import add_months, get_owned, month_start
from ..db import get_db
from ..models import Asset, AssetValuation, User
from ..security import current_user
from ..services import networth as svc
from ..services.balances import balances

router = APIRouter(prefix="/api/net-worth", tags=["net worth"])


class AssetIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: Literal["property", "gold_physical", "vehicle", "other"]
    value: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    notes: str | None = Field(default=None, max_length=255)
    as_of: date | None = None


def _asset_out(a: Asset) -> dict:
    return {
        "id": a.id, "name": a.name, "type": a.type, "value": a.value, "notes": a.notes,
        "valuations": [{"value": v.value, "as_of": v.as_of} for v in a.valuations],
    }


@router.get("")
def net_worth(user: User = Depends(current_user), db: Session = Depends(get_db)):
    nw = svc.current_networth(db, user.id)
    svc.record_snapshot(db, user.id, nw)
    hist = svc.history(db, user.id, 36)

    prev_month = add_months(month_start(date.today()), -1)
    prev = next((h for h in hist if h.month == prev_month), None)

    accounts = [
        {"id": a.id, "name": a.name, "type": a.type, "institution": a.institution, "balance": bal, "is_archived": a.is_archived}
        for a, bal in balances(db, user.id)
        if not (a.is_archived and bal == 0)
    ]
    investments = [
        {"id": inv.id, "name": inv.name, "type": inv.type, "current_value": m.current_value}
        for inv, m in nw["portfolio"]["holdings"]
        if not inv.is_closed
    ]
    assets = db.scalars(select(Asset).where(Asset.user_id == user.id).order_by(Asset.name)).all()

    return {
        "total_assets": nw["total_assets"],
        "total_liabilities": nw["total_liabilities"],
        "net_worth": nw["net_worth"],
        "assets": nw["assets"],
        "liabilities": nw["liabilities"],
        "monthly_change": nw["net_worth"] - prev.net_worth if prev else None,
        "previous_month": prev_month if prev else None,
        "history": [
            {"month": h.month, "total_assets": h.total_assets, "total_liabilities": h.total_liabilities, "net_worth": h.net_worth}
            for h in hist
        ],
        "accounts": accounts,
        "investments": investments,
        "manual_assets": [_asset_out(a) for a in assets],
    }


@router.post("/assets", status_code=201)
def create_asset(data: AssetIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    asset = Asset(user_id=user.id, **data.model_dump(exclude={"as_of"}))
    asset.valuations.append(AssetValuation(value=data.value, as_of=data.as_of or date.today()))
    db.add(asset)
    db.commit()
    return _asset_out(asset)


@router.put("/assets/{asset_id}")
def update_asset(asset_id: int, data: AssetIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    asset = get_owned(db, Asset, asset_id, user.id, "Asset")
    if data.value != asset.value:
        asset.valuations.append(AssetValuation(value=data.value, as_of=data.as_of or date.today()))
    for k, v in data.model_dump(exclude={"as_of"}).items():
        setattr(asset, k, v)
    db.commit()
    return _asset_out(asset)


@router.delete("/assets/{asset_id}", status_code=204)
def delete_asset(asset_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, Asset, asset_id, user.id, "Asset"))
    db.commit()
