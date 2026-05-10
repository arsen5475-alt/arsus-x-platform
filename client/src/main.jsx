import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, BarChart3, Bell, Bot, CalendarDays, Cpu, Gauge, History, LayoutDashboard, LineChart as LineIcon, Newspaper, PieChart, RefreshCcw, Search, Settings, Shield, Target, Wallet } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createChart, ColorType } from "lightweight-charts";
import "./styles.css";

const API = "https://arsus-x-platform-production.up.railway.app/api";

function money(v) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(v || 0));
}
function compact(v) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(Number(v || 0));
}
function pct(v) {
  const n = Number(v || 0);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function CandlestickChart({ symbol }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 330,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8d9bb4" },
      grid: { vertLines: { color: "rgba(255,255,255,0.045)" }, horzLines: { color: "rgba(255,255,255,0.045)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.10)" },
      timeScale: { borderColor: "rgba(255,255,255,0.10)", timeVisible: true, secondsVisible: false }
    });
    const series = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      borderUpColor: "#22c55e", borderDownColor: "#ef4444",
      wickUpColor: "#22c55e", wickDownColor: "#ef4444"
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const resize = () => chartRef.current?.applyOptions({ width: containerRef.current.clientWidth });
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); chart.remove(); };
  }, []);

  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const res = await fetch(`${API}/candles/${symbol}`);
        const data = await res.json();
        if (live && Array.isArray(data)) {
          seriesRef.current?.setData(data);
          chartRef.current?.timeScale().fitContent();
        }
      } catch {}
    }
    load();
    const t = setInterval(load, 2000);
    return () => { live = false; clearInterval(t); };
  }, [symbol]);

  return <div ref={containerRef} className="candles-container" />;
}

function App() {
  const [quotes, setQuotes] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [trades, setTrades] = useState([]);
  const [scanner, setScanner] = useState([]);
  const [news, setNews] = useState([]);
  const [selected, setSelected] = useState("AAPL");
  const [qty, setQty] = useState(1);
  const [stopLossPct, setStopLossPct] = useState(1.5);
  const [takeProfitPct, setTakeProfitPct] = useState(3);
  const [page, setPage] = useState("dashboard");
  const [status, setStatus] = useState("Connecting");
  const [botLog, setBotLog] = useState([]);
  const [botState, setBotState] = useState({ enabled: false, botLog: [] });
  const [botSymbols, setBotSymbols] = useState("AAPL,TSLA,NVDA,AMD,PYPL,NIO,TSSI,TE,SOC,GCTS,SGMO,LIDR,CMBT,IREN");
  const [equityCurve, setEquityCurve] = useState([]);

  const selectedQuote = useMemo(() => quotes.find(x => x.symbol === selected), [quotes, selected]);

  async function loadAll() {
    try {
      const [q, p, t, s, n, b] = await Promise.all([
        fetch(`${API}/quotes`), fetch(`${API}/portfolio`), fetch(`${API}/trades`),
        fetch(`${API}/scanner`), fetch(`${API}/news`), fetch(`${API}/bot`)
      ]);
      const nextQuotes = await q.json();
      const nextPortfolio = await p.json();
      const nextTrades = await t.json();
      const nextScanner = await s.json();
      const nextNews = await n.json();
      const nextBot = await b.json();
      setQuotes(nextQuotes);
      setPortfolio(nextPortfolio);
      setTrades(nextTrades);
      setScanner(nextScanner);
      setNews(nextNews);
      setBotState(nextBot);
      setStatus("Operational");
      setBotLog(prev => [
        ...prev.slice(-10),
        new Date().toLocaleTimeString("ru-RU")+" AI BUY AAPL breakout"
      ]);
      setEquityCurve(prev => [...prev.slice(-24), { time: new Date().toLocaleTimeString("ru-RU"), equity: nextPortfolio.totalEquity }]);
    } catch {
      setStatus("Backend offline");
    }
  }

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 2000);
    return () => clearInterval(id);
  }, []);

  async function placeOrder(side) {
    try {
      const res = await fetch(`${API}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side, symbol: selected, qty: Number(qty), stopLossPct: Number(stopLossPct), takeProfitPct: Number(takeProfitPct) })
      });
      const data = await res.json();
      if (!res.ok) {
        alert((data.mode ? data.mode + ": " : "") + (data.error || "Order rejected"));
        return;
      }
      alert(`${side} sent: ${data.mode} / ${data.trade?.status || "OK"} / ${data.trade?.orderClass || "simple"}`);
      await loadAll();
    } catch {
      alert("Backend не отвечает");
    }
  }

  async function killBot() {
    const res = await fetch(`${API}/bot/kill`, { method: "POST" });
    const data = await res.json();
    setBotState(prev => ({ ...prev, enabled: false }));
    alert("KILL SWITCH: BOT STOPPED");
  }

  async function saveBotSymbols() {
    const res = await fetch(`${API}/bot/symbols`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: botSymbols })
    });
    const data = await res.json();
    alert(`Watchlist saved: ${data.symbols?.length || 0} symbols`);
    await loadAll();
  }

  async function toggleBot() {
    const res = await fetch(`${API}/bot/toggle`, { method: "POST" });
    const data = await res.json();
    setBotState(prev => ({ ...prev, enabled: data.enabled }));
    alert(`AUTO BOT ${data.enabled ? "ON" : "OFF"}`);
  }

  async function resetPlatform() {
    await fetch(`${API}/reset`, { method: "POST" });
    setEquityCurve([]);
    await loadAll();
  }

  return (
    <div className="terminal">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">X</div><div><h1>ARSUS X</h1><p>BRACKET PAPER TERMINAL</p></div></div>
        <nav className="nav">
          <button className={page==="dashboard" ? "nav-item active" : "nav-item"} onClick={()=>setPage("dashboard")}><LayoutDashboard size={18}/> Dashboard</button>
          <button className={page==="market" ? "nav-item active" : "nav-item"} onClick={()=>setPage("market")}><BarChart3 size={18}/> Market Watch</button>
          <button className={page==="scanner" ? "nav-item active" : "nav-item"} onClick={()=>setPage("scanner")}><Target size={18}/> Scanner</button>
          <button className={page==="signals" ? "nav-item active" : "nav-item"} onClick={()=>setPage("signals")}><Activity size={18}/> Signals</button>
          <button className={page==="portfolio" ? "nav-item active" : "nav-item"} onClick={()=>setPage("portfolio")}><Wallet size={18}/> Portfolio</button>
          <button className={page==="orders" ? "nav-item active" : "nav-item"} onClick={()=>setPage("orders")}><History size={18}/> Orders</button>
          <button className={page==="news" ? "nav-item active" : "nav-item"} onClick={()=>setPage("news")}><Newspaper size={18}/> News</button>
          <button className={page==="bot" ? "nav-item active" : "nav-item"} onClick={()=>setPage("bot")}><Bot size={18}/> Auto Bot</button>
          <button className={page==="settings" ? "nav-item active" : "nav-item"} onClick={()=>setPage("settings")}><Settings size={18}/> Settings</button>
        </nav>
        <div className="security-card"><div className="security-icon"><Shield size={20}/></div><div><b>Risk Control</b><span>Paper mode only</span></div></div>
      </aside>

      <main className="main">
        <header className="header">
          <div><span className="eyebrow">ARSUS X / BRACKET ORDERS</span><h2>Trading Dashboard</h2></div>
          <div className="header-actions"><div className="search"><Search size={17}/><span>Search market...</span></div><button className="icon-btn"><Bell size={18}/></button><button className="refresh-btn" onClick={loadAll}><RefreshCcw size={17}/> Refresh</button></div>
        </header>

        <div className="news-ticker">
          <div className="ticker-track">
            {(news || []).slice(0, 12).map((n, i) => (
              <span key={i}>🌍 {n.title}</span>
            ))}
          </div>
        </div>

        <div className="page-indicator">
          Current page: <b>{page.toUpperCase()}</b>
        </div>


        
        {page==="portfolio" && (
          <section className="panel" style={{marginBottom:"16px"}}>
            <div className="panel-head">
              <div>
                <h3>Portfolio</h3>
                <p>Real Alpaca paper positions</p>
              </div>
            </div>
            <table>
              <thead>
                <tr><th>Asset</th><th>Qty</th><th>Avg</th><th>Market</th><th>Value</th><th>P/L</th></tr>
              </thead>
              <tbody>
                {(portfolio?.positions || []).map(pos => (
                  <tr key={pos.symbol}>
                    <td>{pos.symbol}</td>
                    <td>{pos.qty}</td>
                    <td>{money(pos.avgPrice)}</td>
                    <td>{money(pos.marketPrice)}</td>
                    <td>{money(pos.value)}</td>
                    <td className={pos.pnl >= 0 ? "positive" : "negative"}>{money(pos.pnl)} / {pct(pos.pnlPct)}</td>
                  </tr>
                ))}
                {(!portfolio?.positions || portfolio.positions.length===0) && (
                  <tr><td colSpan="6">No open positions</td></tr>
                )}
              </tbody>
            </table>
          </section>
        )}

        {page==="orders" && (
          <section className="panel" style={{marginBottom:"16px"}}>
            <div className="panel-head">
              <div>
                <h3>Orders</h3>
                <p>Alpaca paper order history</p>
              </div>
            </div>
            <table>
              <thead>
                <tr><th>Time</th><th>Broker</th><th>Side</th><th>Asset</th><th>Qty</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(trades || []).map(order => (
                  <tr key={order.id}>
                    <td>{order.time ? new Date(order.time).toLocaleTimeString("ru-RU") : "-"}</td>
                    <td>{order.broker || "ALPACA"}</td>
                    <td className={order.side==="BUY" ? "positive" : "negative"}>{order.side}</td>
                    <td>{order.symbol}</td>
                    <td>{order.qty}</td>
                    <td>{order.status}</td>
                  </tr>
                ))}
                {(!trades || trades.length===0) && (
                  <tr><td colSpan="6">No orders yet</td></tr>
                )}
              </tbody>
            </table>
          </section>
        )}

        
        {page==="scanner" && (
          <section className="panel" style={{marginBottom:"16px"}}>
            <div className="panel-head">
              <div>
                <h3>Scanner Pro</h3>
                <p>Momentum · Volume Spike · Breakout</p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Setup</th>
                  <th>Signal</th>
                  <th>Score</th>
                  <th>Change</th>
                  <th>Volume</th>
                </tr>
              </thead>
              <tbody>
                {(scanner || []).map(item => (
                  <tr key={item.symbol}>
                    <td>{item.symbol}</td>
                    <td>{item.setup}</td>
                    <td className={item.signal?.includes("BUY") ? "positive" : item.signal?.includes("SELL") ? "negative" : ""}>{item.signal}</td>
                    <td>{item.score}</td>
                    <td className={item.changePct >= 0 ? "positive" : "negative"}>{pct(item.changePct)}</td>
                    <td>{compact(item.volume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        
        {page==="news" && (
          <section className="panel" style={{marginBottom:"16px"}}>
            <div className="panel-head">
              <div>
                <h3>Мировые новости</h3>
                <p>Экономика · Рынки · Крипта · Геополитика</p>
              </div>
            </div>

            <div>
              {(news || []).map(item => (
                <div key={item.id} className="news-card" style={{marginBottom:"14px"}}>
                  <strong>{item.symbol}</strong><br/>
                  <span>{item.title}</span><br/>
                  <small>{item.summary}</small>
                </div>
              ))}
            </div>

          </section>
        )}

        <section className="stats">
          <div className="stat-card"><span>Total Equity</span><strong>{money(portfolio?.totalEquity)}</strong><small className="positive">{portfolio?.mode || "loading"}</small></div>
          <div className="stat-card"><span>Cash Balance</span><strong>{money(portfolio?.cash)}</strong><small>Buying power {money(portfolio?.buyingPower)}</small></div>
          <div className="stat-card"><span>Positions Value</span><strong>{money(portfolio?.positionsValue)}</strong><small>{portfolio?.openPositions || 0} open positions</small></div>
          <div className="stat-card"><span>Terminal Status</span><strong>{status}</strong><small className={status === "Operational" ? "positive" : "negative"}>{portfolio?.mode === "ALPACA_PAPER" ? "Paper broker connected" : portfolio?.mode || "Check server"}</small></div>
        </section>

        <section className="workspace">
          <div className="panel watchlist">
            <div className="panel-head"><div><h3 onClick={()=>setPage("market")}>Market Watch</h3><p>Stocks · Crypto</p></div><Gauge size={19}/></div>
            <div className="asset-list">
              {quotes.map(item => (
                <button key={item.symbol} className={item.symbol === selected ? "asset active" : "asset"} onClick={() => setSelected(item.symbol)}>
                  <div><b>{item.symbol}</b><span>{item.market}</span></div>
                  <div className="asset-right"><b>{money(item.price)}</b><span className={item.changePct >= 0 ? "positive" : "negative"}>{pct(item.changePct)}</span></div>
                </button>
              ))}
            </div>
          </div>

          <div className="panel chart-panel">
            <div className="panel-head"><div><h3>{selected} Candlestick Chart</h3><p>{selectedQuote?.name || "Select asset"} · Volume {compact(selectedQuote?.volume)}</p></div><div className="price-badge">{money(selectedQuote?.price)}<span className={selectedQuote?.changePct >= 0 ? "positive" : "negative"}>{pct(selectedQuote?.changePct)}</span></div></div>
            <div className="chart-box"><CandlestickChart symbol={selected}/></div>
            <div className="order-ticket bracket-ticket">
              <div className="ticket-input"><span>Quantity</span><input value={qty} type="number" min="0.0001" step="1" onChange={e => setQty(e.target.value)}/></div>
              <div className="ticket-input"><span>Stop Loss %</span><input value={stopLossPct} type="number" min="0" step="0.1" onChange={e => setStopLossPct(e.target.value)}/></div>
              <div className="ticket-input"><span>Take Profit %</span><input value={takeProfitPct} type="number" min="0" step="0.1" onChange={e => setTakeProfitPct(e.target.value)}/></div>
              <button className="buy" onClick={() => placeOrder("BUY")}>BUY + SL/TP</button>
              <button className="sell" onClick={() => placeOrder("SELL")}>SELL</button>
              <button className="reset" onClick={resetPlatform}>Reset</button>
            </div>
          </div>

          <div className="panel ai-panel">
            <div className="panel-head"><div><h3>AI Signals</h3><p>scanner engine</p></div><Cpu size={19}/></div>
            <div className="signal-card"><span>Broker Mode</span><b className={portfolio?.mode === "ALPACA_PAPER" ? "positive" : "negative"}>{portfolio?.mode || "Loading"}</b></div>
            <div className="signal-card"><span>Protection</span><b className="positive">SL {stopLossPct}% / TP {takeProfitPct}%</b></div>
            <div className="signal-card"><span>Trend</span><b className={selectedQuote?.changePct >= 0 ? "positive" : "negative"}>{selectedQuote?.changePct >= 0 ? "Bullish" : "Bearish"}</b></div>
            <div className="signal-card"><span>Liquidity</span><b>{compact(selectedQuote?.volume)}</b></div>
            <button className={botState?.enabled ? "buy" : "reset"} onClick={toggleBot}>{botState?.enabled ? "AUTO BOT ON" : "AUTO BOT OFF"}</button>
            <button className="sell" onClick={killBot}>KILL SWITCH</button>
            <div className="ticket-input"><span>Bot Watchlist</span><input value={botSymbols} onChange={e=>setBotSymbols(e.target.value)} /></div>
            <button className="reset" onClick={saveBotSymbols}>Save Watchlist</button><div className="scanner-mini"><b>Bot Log
            <div style={{marginTop:"8px",fontSize:"11px",maxHeight:"120px",overflow:"auto"}}>
              {(botLog || []).slice(-6).reverse().map((x,i)=>(
                <div key={i} style={{marginBottom:"4px"}}>
                  {x}
                </div>
              ))}
            </div></b>{(botState?.botLog||[]).slice(0,5).map((l,i)=><div className="scanner-row" key={i}><span>{String(l.action || '')}</span><strong>{String(l.message || '')}</strong></div>)}</div>
            <div className="scanner-mini"><b>Top Scanner Alerts</b>{scanner.slice(0, 5).map(i => <div className="scanner-row" key={i.symbol}><span>{i.symbol}</span><strong>{i.setup}</strong></div>)}</div>
          </div>
        </section>

        <section className="bottom-grid">
          <div className="panel"><div className="panel-head"><div><h3 onClick={()=>setPage("portfolio")}>Portfolio</h3><p>Alpaca paper positions when connected</p></div><PieChart size={19}/></div>
            <table><thead><tr><th>Asset</th><th>Qty</th><th>Avg</th><th>Market</th><th>Value</th><th>P/L</th></tr></thead><tbody>
              {(portfolio?.positions || []).map(p => <tr key={p.symbol}><td>{p.symbol}</td><td>{p.qty}</td><td>{money(p.avgPrice)}</td><td>{money(p.marketPrice)}</td><td>{money(p.value)}</td><td className={p.pnl >= 0 ? "positive" : "negative"}>{money(p.pnl)} / {pct(p.pnlPct)}</td></tr>)}
              {(!portfolio?.positions || portfolio.positions.length === 0) && <tr><td colSpan="6">No open positions yet</td></tr>}
            </tbody></table>
          </div>
          <div className="panel"><div className="panel-head"><div><h3>Trade History</h3><p>Alpaca paper orders</p></div><CalendarDays size={19}/></div>
            <table><thead><tr><th>Time</th><th>Broker</th><th>Side</th><th>Asset</th><th>Qty</th><th>Status</th></tr></thead><tbody>
              {trades.slice(0, 9).map(t => <tr key={t.id}><td>{new Date(t.time).toLocaleTimeString("ru-RU")}</td><td>{t.broker || "ORDER"}</td><td className={t.side === "BUY" ? "positive" : "negative"}>{t.side}</td><td>{t.symbol}</td><td>{t.qty}</td><td>{t.status}{t.orderClass ? " / " + t.orderClass : ""}</td></tr>)}
              {trades.length === 0 && <tr><td colSpan="6">No trades yet</td></tr>}
            </tbody></table>
          </div>
        </section>

        <section className="scanner-grid">
          <div className="panel"><div className="panel-head"><div><h3 onClick={()=>setPage("scanner")}>Scanner</h3><p>Breakout · Volume · Momentum</p></div><Target size={19}/></div>
            <table><thead><tr><th>Asset</th><th>Setup</th><th>Signal</th><th>Score</th><th>Change</th><th>Volume</th></tr></thead><tbody>
              {scanner.map(i => <tr key={i.symbol}><td>{i.symbol}</td><td>{i.setup}</td><td>{i.signal}</td><td>{i.score}</td><td className={i.changePct >= 0 ? "positive" : "negative"}>{pct(i.changePct)}</td><td>{compact(i.volume)}</td></tr>)}
            </tbody></table>
          </div>
          <div className="panel"><div className="panel-head"><div><h3>Market News</h3><p>Watchlist updates</p></div><Newspaper size={19}/></div><div className="news-list">{news.slice(0, 6).map(i => <div className="news-item" key={i.id}><b>{i.symbol}</b><span>{i.title}</span><p>{i.summary}</p></div>)}</div></div>
        </section>

        <section className="equity-panel panel"><div className="panel-head"><div><h3>Equity Curve</h3><p>Account equity from Alpaca paper when connected</p></div><LineIcon size={19}/></div>
          <ResponsiveContainer width="100%" height={120}><LineChart data={equityCurve}><XAxis dataKey="time" hide/><YAxis domain={["auto", "auto"]} hide/><Tooltip contentStyle={{ background: "#0b1020", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "14px", color: "#fff" }}/><Line type="monotone" dataKey="equity" stroke="#22c55e" strokeWidth={3} dot={false}/></LineChart></ResponsiveContainer>
        </section>
      )}
</main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App/>);
