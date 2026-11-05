from sqlalchemy.orm import Session

from ..models import Account, Category

DEFAULT_EXPENSE = [
    ("Outside food", "#f97316"),
    ("Groceries", "#22c55e"),
    ("Rent", "#6366f1"),
    ("Utilities & bills", "#0ea5e9"),
    ("Transport", "#eab308"),
    ("Shopping", "#ec4899"),
    ("Health", "#ef4444"),
    ("Entertainment", "#a855f7"),
    ("Education", "#14b8a6"),
    ("EMI & loan interest", "#78716c"),
    ("Insurance", "#0891b2"),
    ("Travel", "#84cc16"),
    ("Personal care", "#f43f5e"),
    ("Gifts & donations", "#d946ef"),
    ("Other expenses", "#64748b"),
]
DEFAULT_INCOME = [
    ("Salary", "#16a34a"),
    ("Business", "#0d9488"),
    ("Interest", "#2563eb"),
    ("Dividends", "#7c3aed"),
    ("Rental income", "#ca8a04"),
    ("Other income", "#64748b"),
]


def seed_new_user(db: Session, user_id: int) -> None:
    for name, color in DEFAULT_EXPENSE:
        db.add(Category(user_id=user_id, name=name, kind="expense", color=color))
    for name, color in DEFAULT_INCOME:
        db.add(Category(user_id=user_id, name=name, kind="income", color=color))
    db.add(Account(user_id=user_id, name="Cash", type="cash", opening_balance=0))
