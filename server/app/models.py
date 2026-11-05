"""Database models. All money is NUMERIC(14,2) and handled as Decimal in Python."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

Money = Numeric(14, 2)
Price = Numeric(16, 4)
Units = Numeric(18, 6)
Rate = Numeric(6, 3)


def _check_in(column: str, values: tuple[str, ...], name: str) -> CheckConstraint:
    quoted = ", ".join(f"'{v}'" for v in values)
    return CheckConstraint(f"{column} IN ({quoted})", name=name)


# ---- Constants shared with the API layer -------------------------------------------------

ACCOUNT_TYPES = ("bank", "cash", "credit_card", "loan", "other_debt")
LIABILITY_ACCOUNT_TYPES = ("credit_card", "loan", "other_debt")
TXN_TYPES = ("income", "expense", "transfer")
CATEGORY_KINDS = ("income", "expense")
INVESTMENT_TYPES = ("stock", "mutual_fund", "sip", "fd", "rd", "ppf", "epf", "nps", "gold", "other")
INVESTMENT_TXN_TYPES = ("buy", "sell", "deposit", "withdrawal", "interest", "dividend")
COMPOUNDING = ("monthly", "quarterly", "half_yearly", "yearly")
ASSET_TYPES = ("property", "gold_physical", "vehicle", "other")
GOAL_CATEGORIES = ("car", "vacation", "house", "emergency_fund", "education", "other")
PRIORITIES = ("high", "medium", "low")
RISK_LEVELS = ("low", "medium", "high")
THEMES = ("light", "dark", "system")


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (_check_in("theme", THEMES, "ck_users_theme"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    theme: Mapped[str] = mapped_column(String(10), default="system", server_default="system")


class Account(TimestampMixin, Base):
    """Bank/cash accounts (assets) and credit cards/loans/debts (liabilities).

    For liabilities, opening_balance is the amount owed when the account was added.
    """

    __tablename__ = "accounts"
    __table_args__ = (_check_in("type", ACCOUNT_TYPES, "ck_accounts_type"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    type: Mapped[str] = mapped_column(String(20))
    institution: Mapped[str | None] = mapped_column(String(120))
    opening_balance: Mapped[Decimal] = mapped_column(Money, default=0, server_default="0")
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class Category(TimestampMixin, Base):
    __tablename__ = "categories"
    __table_args__ = (
        _check_in("kind", CATEGORY_KINDS, "ck_categories_kind"),
        UniqueConstraint("user_id", "kind", "name", name="uq_categories_user_kind_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    kind: Mapped[str] = mapped_column(String(10))
    color: Mapped[str] = mapped_column(String(9), default="#64748b", server_default="#64748b")
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class Transaction(TimestampMixin, Base):
    """Income, expense or transfer.

    Transfers move money between the user's own accounts (to_account_id) or into/out of an
    investment (investment_txn_id). Transfers are never counted as income or expense.
    """

    __tablename__ = "transactions"
    __table_args__ = (
        _check_in("type", TXN_TYPES, "ck_transactions_type"),
        CheckConstraint("amount > 0", name="ck_transactions_amount_positive"),
        # A transfer goes account -> account, or account <-> investment
        CheckConstraint(
            "type <> 'transfer' OR to_account_id IS NOT NULL OR investment_txn_id IS NOT NULL",
            name="ck_transactions_transfer_target",
        ),
        # Income/expense always have an account and a category, and never a destination account
        CheckConstraint(
            "type = 'transfer' OR (account_id IS NOT NULL AND category_id IS NOT NULL AND to_account_id IS NULL)",
            name="ck_transactions_income_expense_fields",
        ),
        CheckConstraint("account_id IS NOT NULL OR to_account_id IS NOT NULL", name="ck_transactions_has_account"),
        CheckConstraint("account_id IS DISTINCT FROM to_account_id", name="ck_transactions_distinct_accounts"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(10))
    amount: Mapped[Decimal] = mapped_column(Money)
    date: Mapped[date] = mapped_column(Date, index=True)
    # Money leaves account_id (expense / transfer out) or arrives in it (income).
    # Money arrives in to_account_id (transfer in).
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"), index=True)
    to_account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    investment_txn_id: Mapped[int | None] = mapped_column(
        ForeignKey("investment_txns.id", ondelete="CASCADE"), unique=True
    )
    note: Mapped[str | None] = mapped_column(String(255))

    account: Mapped[Account | None] = relationship(foreign_keys=[account_id], lazy="joined")
    to_account: Mapped[Account | None] = relationship(foreign_keys=[to_account_id], lazy="joined")
    category: Mapped[Category | None] = relationship(lazy="joined")


class Budget(TimestampMixin, Base):
    """One row per category per month, which doubles as budget history."""

    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("user_id", "category_id", "month", name="uq_budgets_user_category_month"),
        CheckConstraint("amount > 0", name="ck_budgets_amount_positive"),
        CheckConstraint("EXTRACT(DAY FROM month) = 1", name="ck_budgets_month_first_day"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"))
    month: Mapped[date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(Money)

    category: Mapped[Category] = relationship(lazy="joined")


class Investment(TimestampMixin, Base):
    __tablename__ = "investments"
    __table_args__ = (
        _check_in("type", INVESTMENT_TYPES, "ck_investments_type"),
        CheckConstraint(
            "compounding IS NULL OR compounding IN ('monthly', 'quarterly', 'half_yearly', 'yearly')",
            name="ck_investments_compounding",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(150))
    type: Mapped[str] = mapped_column(String(20))
    folio_number: Mapped[str | None] = mapped_column(String(60))
    institution: Mapped[str | None] = mapped_column(String(120))
    symbol: Mapped[str | None] = mapped_column(String(40))
    # Market-linked: latest price/NAV entered by the user
    current_price: Mapped[Decimal | None] = mapped_column(Price)
    price_updated_at: Mapped[date | None] = mapped_column(Date)
    # Optional manual override of the current value (any type)
    manual_current_value: Mapped[Decimal | None] = mapped_column(Money)
    value_updated_at: Mapped[date | None] = mapped_column(Date)
    # Fixed-interest instruments
    interest_rate: Mapped[Decimal | None] = mapped_column(Rate)
    compounding: Mapped[str | None] = mapped_column(String(12))
    start_date: Mapped[date | None] = mapped_column(Date)
    maturity_date: Mapped[date | None] = mapped_column(Date)
    installment_amount: Mapped[Decimal | None] = mapped_column(Money)  # RD instalment / SIP amount
    notes: Mapped[str | None] = mapped_column(Text)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    txns: Mapped[list["InvestmentTxn"]] = relationship(
        back_populates="investment", cascade="all, delete-orphan", order_by="InvestmentTxn.date"
    )


class InvestmentTxn(TimestampMixin, Base):
    __tablename__ = "investment_txns"
    __table_args__ = (
        _check_in("type", INVESTMENT_TXN_TYPES, "ck_investment_txns_type"),
        CheckConstraint("amount > 0", name="ck_investment_txns_amount_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    investment_id: Mapped[int] = mapped_column(ForeignKey("investments.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(12))
    date: Mapped[date] = mapped_column(Date)
    units: Mapped[Decimal | None] = mapped_column(Units)
    price: Mapped[Decimal | None] = mapped_column(Price)
    amount: Mapped[Decimal] = mapped_column(Money)
    note: Mapped[str | None] = mapped_column(String(255))

    investment: Mapped[Investment] = relationship(back_populates="txns")


class Asset(TimestampMixin, Base):
    """Manually valued assets that are not investments or accounts (property, physical gold...)."""

    __tablename__ = "assets"
    __table_args__ = (_check_in("type", ASSET_TYPES, "ck_assets_type"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    type: Mapped[str] = mapped_column(String(20))
    value: Mapped[Decimal] = mapped_column(Money)
    notes: Mapped[str | None] = mapped_column(String(255))

    valuations: Mapped[list["AssetValuation"]] = relationship(
        cascade="all, delete-orphan", order_by="AssetValuation.as_of"
    )


class AssetValuation(Base):
    __tablename__ = "asset_valuations"

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), index=True)
    value: Mapped[Decimal] = mapped_column(Money)
    as_of: Mapped[date] = mapped_column(Date)


class NetWorthSnapshot(Base):
    __tablename__ = "networth_snapshots"
    __table_args__ = (UniqueConstraint("user_id", "month", name="uq_networth_user_month"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    month: Mapped[date] = mapped_column(Date)
    total_assets: Mapped[Decimal] = mapped_column(Money)
    total_liabilities: Mapped[Decimal] = mapped_column(Money)
    net_worth: Mapped[Decimal] = mapped_column(Money)
    breakdown: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Goal(TimestampMixin, Base):
    __tablename__ = "goals"
    __table_args__ = (
        _check_in("category", GOAL_CATEGORIES, "ck_goals_category"),
        _check_in("priority", PRIORITIES, "ck_goals_priority"),
        _check_in("risk_preference", RISK_LEVELS, "ck_goals_risk"),
        CheckConstraint("target_amount > 0", name="ck_goals_target_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(20), default="other")
    target_amount: Mapped[Decimal] = mapped_column(Money)
    current_savings: Mapped[Decimal] = mapped_column(Money, default=0, server_default="0")
    target_date: Mapped[date] = mapped_column(Date)
    priority: Mapped[str] = mapped_column(String(10), default="medium")
    risk_preference: Mapped[str] = mapped_column(String(10), default="low")
    conservative_return_pct: Mapped[Decimal] = mapped_column(Rate, default=Decimal("6.5"))
    moderate_return_pct: Mapped[Decimal] = mapped_column(Rate, default=Decimal("10"))
    # What the user plans to save each month; used to estimate the completion date
    monthly_contribution: Mapped[Decimal | None] = mapped_column(Money)
    notes: Mapped[str | None] = mapped_column(String(255))


class FireProfile(Base):
    __tablename__ = "fire_profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    current_age: Mapped[int] = mapped_column(Integer)
    retirement_age: Mapped[int] = mapped_column(Integer)
    annual_expenses: Mapped[Decimal] = mapped_column(Money)
    current_portfolio: Mapped[Decimal] = mapped_column(Money, default=0)
    use_tracked_portfolio: Mapped[bool] = mapped_column(Boolean, default=True)
    monthly_contribution: Mapped[Decimal] = mapped_column(Money, default=0)
    inflation_pct: Mapped[Decimal] = mapped_column(Rate, default=Decimal("6"))
    return_pct: Mapped[Decimal] = mapped_column(Rate, default=Decimal("10"))
    withdrawal_rate_pct: Mapped[Decimal] = mapped_column(Rate, default=Decimal("4"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AdvisorThread(TimestampMixin, Base):
    __tablename__ = "advisor_threads"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))

    messages: Mapped[list["AdvisorMessage"]] = relationship(
        cascade="all, delete-orphan", order_by="AdvisorMessage.id"
    )


class AdvisorMessage(TimestampMixin, Base):
    __tablename__ = "advisor_messages"
    __table_args__ = (_check_in("role", ("user", "assistant"), "ck_advisor_messages_role"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    thread_id: Mapped[int] = mapped_column(ForeignKey("advisor_threads.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(10))
    content: Mapped[str] = mapped_column(Text)
    sources: Mapped[list] = mapped_column(JSONB, default=list)
