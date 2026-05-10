# ARSUS X v1.3

**Private Trading Terminal — Alpaca Paper Bridge**

## Что внутри

- React frontend
- Node.js / Express backend
- Candlestick chart
- Scanner
- Market Watch
- BUY / SELL
- Alpaca Paper Trading bridge
- Portfolio from Alpaca when keys are valid
- Local simulation fallback

## .env

В корне проекта нужен файл `.env`:

```text
FINNHUB_API_KEY=...
ALPACA_BASE_URL=https://paper-api.alpaca.markets
ALPACA_API_KEY=...
ALPACA_SECRET_KEY=...
```

## Запуск

```bash
cd arsus_x_platform_alpaca
npm run install:all
npm run dev
```

Открыть:

```text
http://localhost:5173
```

## Важно

Используй только Paper Trading keys. Live keys не подключать до risk-control.

## Version 1.4 — Bracket Orders

BUY can send Alpaca paper bracket orders:
- market entry
- take profit limit
- stop loss

Important:
- Bracket orders are sent only for stock symbols, not crypto symbols.
- Use Paper Trading keys only.
