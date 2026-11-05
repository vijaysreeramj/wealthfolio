# Wealthfolio

A simple, modern personal finance tracker for India: budgets, investments, net worth, goals, FIRE planning and an AI financial advisor that thinks like a risk-aware Indian equity research analyst. All amounts are in Indian Rupees with lakh/crore formatting.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/dashboard-dark.png" />
  <source media="(prefers-color-scheme: light)" srcset="docs/screenshots/dashboard-light.png" />
  <img alt="Wealthfolio dashboard showing monthly income, expenses, savings, investments, net worth, FIRE progress, an income vs expenses chart, expense breakdown and budget utilisation" src="docs/screenshots/dashboard-light.png" />
</picture>

<p align="center"><sub>Dashboard in light and dark theme (sample data). The image follows your GitHub theme.</sub></p>

## Features

| Area | What you get |
|---|---|
| **Dashboard** | Monthly/yearly income, expenses, savings rate, investments, assets, liabilities, net worth and FIRE progress. Income vs expense chart, expense breakdown, budget utilisation, net worth growth, portfolio summary, recent transactions. |
| **Transactions** | Income, expenses and transfers with search, filters and pagination. Transfers (such as card bill payments) are never counted as spending. |
| **Budgets** | Category budgets per month, budget vs actual, remaining amount, alerts at 75% / 90% / 100%, copy from last month, 6-month history. |
| **Investments** | Stocks, mutual funds, SIP, FD, RD, PPF, EPF, NPS, gold and custom investments. Multiple entries per investment, average-cost P&L, manual price/value updates, FD/RD maturity values from interest rate and compounding. |
| **Net worth** | Assets (bank, cash, investments, property, gold…) minus liabilities (loans, cards, other debt), monthly change and history. Nothing is counted twice. |
| **FIRE tracker** | FIRE number (25× by default, configurable withdrawal rate), progress, required monthly investment, estimated FIRE date and a projection chart. |
| **Goals** | Target, saved amount, date, priority and risk preference, with no-return / conservative / moderate scenarios and horizon-appropriate saving suggestions. |
| **AI advisor** | Chat with Claude, which sees a summary of your finances and uses web search for current company and market data. Gives structured NSE/BSE stock research with sources and dates. |
| **Themes** | Light, dark and system, saved to your account and applied instantly. |

## Tech stack

- **Frontend:** React 19 + Vite, React Router, Chart.js. Plain CSS with design tokens.
- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic.
- **Database:** PostgreSQL. In development, an embedded PostgreSQL 16 starts automatically through `pgserver`, so there is nothing to install.
- **AI:** Anthropic Claude API (`claude-opus-5-5`) with web search and web fetch.

## Quick start

Requirements: Node 18+, Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
npm install          # root helper (runs API + web together)
npm run setup        # Python venv + server deps, then client deps
cp server/.env.example server/.env   # then set JWT_SECRET to a long random string
npm run dev          # runs migrations, starts API on :8000 and web on :5173
```

Open http://localhost:5173 and create an account. New accounts get a default set of Indian expense and income categories and a Cash account.

### Enable the AI advisor

Add your Claude API key to `server/.env` and restart `npm run dev`:

```
ANTHROPIC_API_KEY=sk-ant-...
ADVISOR_EFFORT=high      # optional: low | medium | high | xhigh | max
```

Without a key, everything else works and the advisor page explains how to connect it.

### Using your own PostgreSQL

Set `DATABASE_URL` in `server/.env` (for example `postgresql://user:pass@localhost:5432/wealthfolio`) and run `npm run migrate`. If `DATABASE_URL` is empty, the embedded database in `server/.pgdata/` is used.

## Tests

```bash
npm test
```

The test suite covers the financial formulas (FD/RD maturity, average-cost P&L, FIRE, goals), budgets and alerts, the dashboard numbers, no double counting of transfers and investments, data isolation between users, and the advisor request.

## How the numbers work

- **Account balances** are opening balance plus transactions, so they're never stale. For credit cards and loans the balance is the amount owed.
- **Transfers** move money between your own accounts and are excluded from income and expenses. Money paid into an investment from a bank account is recorded as a linked transfer: your bank balance goes down and the investment goes up, so net worth doesn't change and nothing is counted twice.
- **Stocks, mutual funds, SIP, NPS, gold:** value = units held × the latest price/NAV you enter. Cost uses the average-cost method. No fixed return is ever applied.
- **FD:** `P × (1 + r/n)^(n·t)` for each deposit. **RD:** each monthly instalment compounded to maturity (quarterly by default, as Indian banks do). You can override any value manually, for example from a passbook.
- **Net worth** comes from accounts (bank, cash, loans, cards) + investments + manual assets (property, physical gold, vehicles). A snapshot is saved every month for the history chart.
- **FIRE number** = annual expenses ÷ withdrawal rate, in today's rupees and inflated to your retirement age.
- All projections are labelled as assumptions, not guaranteed outcomes.

## Project structure

```
server/
  app/
    main.py            FastAPI app and routers
    models.py          SQLAlchemy models (all money is NUMERIC(14,2))
    routers/           auth, accounts, categories, transactions, budgets, dashboard,
                       investments, networth, fire, goals, advisor
    services/          finance.py (pure calculations), balances, portfolio, networth,
                       fire, advisor (Claude integration), seed
  alembic/             database migrations
  tests/
client/
  src/
    pages/             one page per sidebar item
    components/        Layout, forms, shared UI
    hooks/             auth, theme, period filter, data loading
    lib/               API client, INR formatting, chart setup
    styles/global.css  design tokens for light and dark themes
```

## Disclaimer

Wealthfolio and its AI advisor provide educational information and research, not personalised investment advice from a SEBI-registered investment adviser. The app never places trades. Check important figures against the original sources before acting on them.
