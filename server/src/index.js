import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import dotenv from "dotenv";
import { nanoid } from "nanoid";
import fs from "fs";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

const app = express();

const __dirname = path.dirname(__filename);

app.use(express.static(
  path.join(__dirname, "../../client/dist")
));


const PORT = process.env.PORT || 3001;

const __dirname = path.dirname(__filename);
const DB_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DB_DIR, "arsus-x-db.json");

app.use(cors());
app.use(express.json());

const AUTO_BOT = {
  enabled: false,
  lastRunAt: null,
  cycleMs: 15000,
  maxPositions: 10,
  usdPerTrade: 500,
  symbols:["BTCUSDT","ETHUSDT","SOLUSDT"]
};

const defaultAssets = [
  { symbol: "AAPL", name: "Apple Inc.", market: "Stocks", price: 193.42 },
  { symbol: "TSLA", name: "Tesla Inc.", market: "Stocks", price: 178.72 },
  { symbol: "NVDA", name: "NVIDIA Corp.", market: "Stocks", price: 915.30 },
  { symbol: "AMD", name: "Advanced Micro Devices", market: "Stocks", price: 152.10 },
  { symbol: "PYPL", name: "PayPal Holdings", market: "Stocks", price: 67.80 },
  { symbol: "NIO", name: "NIO Inc.", market: "Stocks", price: 5.42 },
  { symbol: "BTCUSDT", name: "Bitcoin / Tether", market: "Crypto", price: 63842.21 },
  { symbol: "ETHUSDT", name: "Ethereum / Tether", market: "Crypto", price: 3128.65 },
  { symbol: "SOLUSDT", name: "Solana / Tether", market: "Crypto", price: 142.32 }
];

function alpacaConfigured() {
  return Boolean(
    process.env.ALPACA_BASE_URL &&
    process.env.ALPACA_API_KEY &&
    process.env.ALPACA_SECRET_KEY &&
    !process.env.ALPACA_API_KEY.includes("ТВОЙ") &&
    !process.env.ALPACA_SECRET_KEY.includes("ТВОЙ")
  );
}

function alpacaSymbol(symbol) {
  const map = { BTCUSDT: "BTC/USD", ETHUSDT: "ETH/USD", SOLUSDT: "SOL/USD" };
  return map[symbol] || symbol;
}

async function alpacaRequest(endpoint, options = {}) {
  if (!alpacaConfigured()) {
    throw new Error("Alpaca keys are not configured");
  }

  const base = process.env.ALPACA_BASE_URL.replace(/\/$/, "");
  const response = await fetch(`${base}${endpoint}`, {
    ...options,
    headers: {
      "APCA-API-KEY-ID": process.env.ALPACA_API_KEY,
      "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!response.ok) {
    const error = new Error(data.message || data.error || `Alpaca error ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function randomMove(symbol) {
  if (symbol.includes("USDT")) return (Math.random() - 0.48) * 0.012;
  return (Math.random() - 0.48) * 0.018;
}

function roundPrice(symbol, price) {
  return Number(price.toFixed(2));
}

function seedCandles(startPrice, symbol) {
  const candles = [];
  let price = startPrice;
  const start = nowUnix() - 60 * 120;

  for (let i = 0; i < 120; i++) {
    const open = price;
    const close = Math.max(0.01, open * (1 + randomMove(symbol)));
    const high = Math.max(open, close) * (1 + Math.random() * 0.006);
    const low = Math.min(open, close) * (1 - Math.random() * 0.006);

    candles.push({
      time: start + i * 60,
      open: roundPrice(symbol, open),
      high: roundPrice(symbol, high),
      low: roundPrice(symbol, low),
      close: roundPrice(symbol, close)
    });
    price = close;
  }
  return candles;
}

function ensureDb() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  if (!fs.existsSync(DB_FILE)) {
    const quotes = defaultAssets.map(asset => ({
      ...asset,
      changePct: 0,
      volume: Math.floor(Math.random() * 9000000) + 100000,
      updatedAt: new Date().toISOString()
    }));

    const candles = {};
    for (const asset of quotes) candles[asset.symbol] = seedCandles(asset.price, asset.symbol);

    fs.writeFileSync(DB_FILE, JSON.stringify({
      cash: 25000,
      positions: {},
      trades: [],
      quotes,
      candles
    }, null, 2));
  }
}

function readDb() {
  ensureDb();
  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  if (!db.candles) {
    db.candles = {};
    for (const quote of db.quotes) db.candles[quote.symbol] = seedCandles(quote.price, quote.symbol);
  }
  return db;
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function updateCandles(db, quote) {
  if (!db.candles) db.candles = {};
  if (!db.candles[quote.symbol]) db.candles[quote.symbol] = seedCandles(quote.price, quote.symbol);

  const list = db.candles[quote.symbol];
  const last = list[list.length - 1];
  const open = last ? last.close : quote.price;
  const close = quote.price;
  const high = Math.max(open, close) * (1 + Math.random() * 0.003);
  const low = Math.min(open, close) * (1 - Math.random() * 0.003);

  list.push({
    time: last ? last.time + 60 : nowUnix(),
    open: roundPrice(quote.symbol, open),
    high: roundPrice(quote.symbol, high),
    low: roundPrice(quote.symbol, low),
    close: roundPrice(quote.symbol, close)
  });
  db.candles[quote.symbol] = list.slice(-160);
}

function tickQuotes(db) {
  db.quotes = db.quotes.map(q => {
    const move = randomMove(q.symbol);
    const price = Math.max(0.01, q.price * (1 + move));
    const quote = {
      ...q,
      price: roundPrice(q.symbol, price),
      changePct: Number((move * 100).toFixed(2)),
      volume: Math.max(1000, Math.floor(q.volume * (1 + ((Math.random() - 0.5) * 0.08)))),
      updatedAt: new Date().toISOString()
    };
    updateCandles(db, quote);
    return quote;
  });
  return db.quotes;
}

function getQuote(db, symbol) {
  return db.quotes.find(q => q.symbol.toUpperCase() === String(symbol).toUpperCase());
}

function buildScanner(db) {
  return db.quotes.map(q => {
    const score = Math.min(99, Math.max(1, Math.round(Math.abs(q.changePct) * 24 + Math.log10(Math.max(q.volume, 1)) * 7)));
    let setup = "Momentum Watch";
    if (q.changePct >= 1.2) setup = "Breakout";
    if (q.changePct <= -1.2) setup = "Breakdown";
    if (Math.abs(q.changePct) >= 0.8 && q.volume > 3000000) setup = "Volume Spike";
    return {
      symbol: q.symbol,
      name: q.name,
      market: q.market,
      price: q.price,
      changePct: q.changePct,
      volume: q.volume,
      setup,
      signal: ((q.market === "Crypto" && score >= 45 && q.changePct > 0) || (score >= 60 && q.changePct > 0)) ? "BUY WATCH" : q.changePct <= -1 ? "SELL WATCH" : "WATCH",
      score
    };
  }).sort((a, b) => b.score - a.score).slice(0, 10);
}

function buildLocalPortfolio(db) {
  let positionsValue = 0;
  const positions = Object.values(db.positions).map(pos => {
    const quote = getQuote(db, pos.symbol);
    const marketPrice = quote?.price || pos.avgPrice;
    const value = pos.qty * marketPrice;
    const cost = pos.qty * pos.avgPrice;
    const pnl = value - cost;
    positionsValue += value;
    return {
      ...pos,
      marketPrice,
      value: Number(value.toFixed(2)),
      pnl: Number(pnl.toFixed(2)),
      pnlPct: cost ? Number(((pnl / cost) * 100).toFixed(2)) : 0
    };
  });

  return {
    mode: "LOCAL_SIM",
    cash: Number(db.cash.toFixed(2)),
    buyingPower: Number(db.cash.toFixed(2)),
    positionsValue: Number(positionsValue.toFixed(2)),
    totalEquity: Number((db.cash + positionsValue).toFixed(2)),
    openPositions: positions.length,
    positions
  };
}

async function buildPortfolio(db) {
  if (!alpacaConfigured()) return buildLocalPortfolio(db);

  try {
    const [account, positions] = await Promise.all([
      alpacaRequest("/v2/account"),
      alpacaRequest("/v2/positions")
    ]);

    const mapped = positions.map(p => ({
      symbol: p.symbol,
      name: p.symbol,
      market: "Alpaca",
      qty: Number(p.qty),
      avgPrice: Number(p.avg_entry_price),
      marketPrice: Number(p.current_price),
      value: Number(p.market_value),
      pnl: Number(p.unrealized_pl),
      pnlPct: Number(p.unrealized_plpc) * 100
    }));

    return {
      mode: "ALPACA_PAPER",
      cash: Number(account.cash),
      buyingPower: Number(account.buying_power),
      positionsValue: Number(account.long_market_value || 0) + Number(account.short_market_value || 0),
      totalEquity: Number(account.equity),
      openPositions: mapped.length,
      accountStatus: account.status,
      positions: mapped
    };
  } catch (error) {
    return { ...buildLocalPortfolio(db), mode: "ALPACA_ERROR", alpacaError: error.message };
  }
}

function localOrder(db, side, symbol, qty, quote) {
  const value = Number((quote.price * qty).toFixed(2));
  const current = db.positions[symbol];

  if (side === "BUY") {
    if (db.cash < value) throw new Error("Not enough cash");
    db.cash -= value;
    if (!current) db.positions[symbol] = { symbol, name: quote.name, market: quote.market, qty, avgPrice: quote.price };
    else {
      const newQty = current.qty + qty;
      const newAvg = ((current.qty * current.avgPrice) + value) / newQty;
      db.positions[symbol] = { ...current, qty: Number(newQty.toFixed(6)), avgPrice: Number(newAvg.toFixed(2)) };
    }
  }

  if (side === "SELL") {
    if (!current || current.qty < qty) throw new Error("Not enough position to sell");
    db.cash += value;
    const newQty = current.qty - qty;
    if (newQty <= 0) delete db.positions[symbol];
    else db.positions[symbol] = { ...current, qty: Number(newQty.toFixed(6)) };
  }

  return {
    id: nanoid(),
    broker: "LOCAL_SIM",
    side,
    symbol,
    qty,
    price: quote.price,
    value,
    status: "FILLED",
    time: new Date().toISOString()
  };
}

async function alpacaOrder(side, symbol, qty, options = {}) {
  const payload = {
    symbol: alpacaSymbol(symbol),
    qty: String(qty),
    side: side.toLowerCase(),
    type: "market",
    time_in_force: symbol.includes("USDT") ? "gtc" : "day"
  };

  const stopLossPct = Number(options.stopLossPct || 0);
  const takeProfitPct = Number(options.takeProfitPct || 0);
  const currentPrice = Number(options.currentPrice || 0);

  if (side === "BUY" && currentPrice > 0 && stopLossPct > 0 && takeProfitPct > 0 && !symbol.includes("USDT")) {
    const stopPrice = Number((currentPrice * (1 - stopLossPct / 100)).toFixed(2));
    const takeProfitPrice = Number((currentPrice * (1 + takeProfitPct / 100)).toFixed(2));

    payload.order_class = "bracket";
    payload.take_profit = { limit_price: String(takeProfitPrice) };
    payload.stop_loss = { stop_price: String(stopPrice) };
  }

  const order = await alpacaRequest("/v2/orders", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  return {
    id: order.id,
    broker: "ALPACA_PAPER",
    side,
    symbol,
    alpacaSymbol: payload.symbol,
    qty,
    price: Number(order.filled_avg_price || 0),
    value: 0,
    status: String(order.status || "submitted").toUpperCase(),
    orderClass: payload.order_class || "simple",
    stopLossPct,
    takeProfitPct,
    stopPrice: payload.stop_loss?.stop_price || null,
    takeProfitPrice: payload.take_profit?.limit_price || null,
    time: order.submitted_at || new Date().toISOString()
  };
}

async function runAutoBot() {
  if (!AUTO_BOT.enabled) return;

  const db = readDb();
  tickQuotes(db);

  const portfolio = await buildPortfolio(db);
  if (Number(portfolio.openPositions || 0) >= AUTO_BOT.maxPositions) {
    AUTO_BOT.lastRunAt = new Date().toISOString();
    return;
  }

  const candidate = buildScanner(db)
    .filter(x => AUTO_BOT.symbols.includes(x.symbol))
    .filter(x => x.signal === "BUY WATCH")
    .sort((a, b) => b.score - a.score)[0];

  if (!candidate) {
    AUTO_BOT.lastRunAt = new Date().toISOString();
    return;
  }

  const quote = getQuote(db, candidate.symbol);
  if (!quote) return;

  const alreadyOpen = (portfolio.positions || []).some(p => p.symbol === candidate.symbol);
  if (alreadyOpen) return;

  const qty = Math.max(1, Math.floor(AUTO_BOT.usdPerTrade / Math.max(quote.price, 1)));

  try {
    const trade = alpacaConfigured()
      ? await alpacaOrder("BUY", candidate.symbol, qty, { stopLossPct: 1.5, takeProfitPct: 3, currentPrice: quote.price })
      : localOrder(db, "BUY", candidate.symbol, qty, quote);

    db.trades.push({ ...trade, autoBot: true, savedAt: new Date().toISOString() });
    writeDb(db);
  } catch (e) {}

  AUTO_BOT.lastRunAt = new Date().toISOString();
}

setInterval(() => {
  runAutoBot().catch(() => {});
}, AUTO_BOT.cycleMs);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, platform: "ARSUS X", mode: "alpaca-bracket-orders", alpacaConfigured: alpacaConfigured() });
});

app.get("/api/bot", (req, res) => {
  res.json(AUTO_BOT);
});

app.post("/api/bot/toggle", (req, res) => {
  AUTO_BOT.enabled = !AUTO_BOT.enabled;
  res.json({ ok: true, enabled: AUTO_BOT.enabled });
});

app.get("/api/config", (req, res) => {
  res.json({ alpacaConfigured: alpacaConfigured(), paperMode: true, baseUrl: process.env.ALPACA_BASE_URL || null });
});

app.get("/api/alpaca/account", async (req, res) => {
  try {
    const account = await alpacaRequest("/v2/account");
    res.json({ ok: true, account });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message, data: error.data || null });
  }
});

app.get("/api/alpaca/orders", async (req, res) => {
  try {
    const orders = await alpacaRequest("/v2/orders?status=all&limit=50&direction=desc");
    res.json(orders);
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message, data: error.data || null });
  }
});

app.get("/api/alpaca/positions", async (req, res) => {
  try {
    res.json(await alpacaRequest("/v2/positions"));
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message, data: error.data || null });
  }
});

app.get("/api/quotes", (req, res) => {
  const db = readDb();
  tickQuotes(db);
  writeDb(db);
  res.json(db.quotes);
});

app.get("/api/candles/:symbol", (req, res) => {
  const db = readDb();
  tickQuotes(db);
  const quote = getQuote(db, req.params.symbol);
  if (!quote) return res.status(404).json({ error: "Symbol not found" });
  writeDb(db);
  res.json(db.candles[quote.symbol] || []);
});

app.get("/api/portfolio", async (req, res) => {
  res.json(await buildPortfolio(readDb()));
});

app.get("/api/trades", async (req, res) => {
  const db = readDb();

  if (alpacaConfigured()) {
    try {
      const orders = await alpacaRequest("/v2/orders?status=all&limit=50&direction=desc");
      return res.json(orders.map(o => ({
        id: o.id,
        broker: "ALPACA_PAPER",
        side: String(o.side || "").toUpperCase(),
        symbol: o.symbol,
        qty: Number(o.qty),
        price: Number(o.filled_avg_price || o.limit_price || 0),
        status: String(o.status || "").toUpperCase(),
        time: o.submitted_at || o.created_at
      })));
    } catch {}
  }

  res.json(db.trades.slice().reverse());
});

app.get("/api/scanner", (req, res) => {
  const db = readDb();
  tickQuotes(db);
  writeDb(db);
  res.json(buildScanner(db));
});


app.post("/api/order", async (req, res) => {
  const side = String(req.body.side || "").toUpperCase();
  const symbol = String(req.body.symbol || "").toUpperCase();
  const qty = Number(req.body.qty);
  const stopLossPct = Number(req.body.stopLossPct || 0);
  const takeProfitPct = Number(req.body.takeProfitPct || 0);

  if (!["BUY", "SELL"].includes(side)) return res.status(400).json({ ok: false, error: "Side must be BUY or SELL" });
  if (!symbol || !Number.isFinite(qty) || qty <= 0) return res.status(400).json({ ok: false, error: "Invalid symbol or quantity" });

  const db = readDb();
  tickQuotes(db);
  const quote = getQuote(db, symbol);
  if (!quote) return res.status(404).json({ ok: false, error: "Symbol not found" });

  try {
    const trade = alpacaConfigured()
      ? await alpacaOrder(side, symbol, qty, { stopLossPct, takeProfitPct, currentPrice: quote.price })
      : localOrder(db, side, symbol, qty, quote);

    db.trades.push({ ...trade, savedAt: new Date().toISOString(), localSnapshotPrice: quote.price });
    writeDb(db);

    res.json({ ok: true, mode: trade.broker, trade, portfolio: await buildPortfolio(db) });
  } catch (error) {
    writeDb(db);
    res.status(error.status || 400).json({ ok: false, mode: alpacaConfigured() ? "ALPACA_PAPER" : "LOCAL_SIM", error: error.message, data: error.data || null });
  }
});

app.post("/api/reset", (req, res) => {
  if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
  ensureDb();
  res.json({ ok: true });
});




app.get("/api/news", async (req, res) => {
  try {
    const url = "https://news.google.com/rss/search?q=мировые%20рынки%20экономика%20криптовалюта%20нефть%20золото&hl=ru&gl=RU&ceid=RU:ru";
    const r = await fetch(url);
    const xml = await r.text();

    const items = [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)].slice(0, 25);

    const clean = (x) => String(x || "")
      .replace(/<!\[CDATA\[/g, "")
      .replace(/\]\]>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/<[^>]+>/g, "")
      .trim();

    const news = items.map((m, i) => {
      const block = m[0];
      const title = clean((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
      const link = clean((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
      const pubDate = clean((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]);
      const source = clean((block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1]);

      return {
        id: link || String(i),
        symbol: "WORLD",
        title,
        summary: `${source || "Google News"} • ${pubDate}`,
        url: link,
        source: source || "Google News",
        time: pubDate,
        sentiment: "NEUTRAL"
      };
    }).filter(x => x.title);

    res.json(news.length ? news : [{
      id: "empty",
      symbol: "WORLD",
      title: "Новостей пока нет",
      summary: "Источник не вернул данные",
      source: "ARSUS X"
    }]);
  } catch (e) {
    res.json([{
      id: "fallback",
      symbol: "WORLD",
      title: "Новости временно недоступны",
      summary: e.message,
      source: "ARSUS X"
    }]);
  }
});

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../../client/dist/index.html")
  );
});

app.listen(PORT, () => {
  ensureDb();
  console.log(`ARSUS X server running on http://localhost:${PORT}`);
  console.log(`Alpaca configured: ${alpacaConfigured() ? "YES / PAPER" : "NO / LOCAL SIM"}`);
});



setInterval(async ()=> {
  try {
    if (!AUTO_BOT.enabled) return;

    const positions = await alpaca.getPositions();

    for (const pos of positions) {

      const pnl = Number(pos.unrealized_plpc) * 100;

      if (pnl >= 3 || pnl <= -1.5) {

        await alpaca.createOrder({
          symbol: pos.symbol,
          qty: Math.abs(Number(pos.qty)),
          side: "sell",
          type: "market",
          time_in_force: "day"
        });

        AUTO_BOT.botLog.unshift(
          `${new Date().toLocaleTimeString()} ${pnl >= 3 ? "TAKE PROFIT" : "STOP LOSS"} ${pos.symbol} ${pnl.toFixed(2)}%`
        );
      }
    }

  } catch(e){}
}, 8000);