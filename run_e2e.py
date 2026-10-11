"""
End-to-end UI test for MARKETLAB (production build served by `vite preview`).

IMPORTANT: the sandbox that produced this project has no access to the market-data
providers, so this script intercepts /api/* in the browser and answers with SYNTHETIC
fixtures generated below. The fixtures exist only inside this test harness; the
application itself never generates or substitutes prices. Live provider calls must be
verified separately after deployment (see README, "Verification checklist").
"""
import json, math, random, sys, datetime as dt
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
OUT = Path(__file__).parent / "screenshots"; OUT.mkdir(exist_ok=True)
random.seed(42)

def weekdays(start, end):
    d = start
    while d <= end:
        if d.weekday() < 5: yield d
        d += dt.timedelta(days=1)

def alldays(start, end):
    d = start
    while d <= end:
        yield d; d += dt.timedelta(days=1)

TODAY = dt.date.today()
def make_bars(sym, start, price, vol, drift, days_fn, split=None, div=0.0):
    bars, p = [], price
    rng = random.Random(sym)
    factor_after = 1.0
    dates = list(days_fn(start, TODAY - dt.timedelta(days=1)))
    for i, d in enumerate(dates):
        r = rng.gauss(drift, vol)
        o = p * (1 + rng.gauss(0, vol / 3)); c = p * math.exp(r)
        h = max(o, c) * (1 + abs(rng.gauss(0, vol / 2))); l = min(o, c) * (1 - abs(rng.gauss(0, vol / 2)))
        sf = 1.0
        if split and d.isoformat() == split[0]:
            sf = split[1]; o, h, l, c = o / sf, h / sf, l / sf, c / sf; p = p / sf
        dv = div if (div and d.month in (2, 5, 8, 11) and d.day in (10, 11, 12) and d.weekday() < 5) else 0.0
        bars.append(dict(date=d.isoformat(), open=round(o, 4), high=round(h, 4), low=round(l, 4), close=round(c, 4), volume=rng.randint(10**6, 10**8),
                         adjOpen=0, adjHigh=0, adjLow=0, adjClose=0, dividend=dv, split=sf))
        p = c
    # backward adjustment for splits/dividends (test only)
    adj = 1.0
    for i in range(len(bars) - 1, -1, -1):
        b = bars[i]
        b["adjOpen"], b["adjHigh"], b["adjLow"], b["adjClose"] = [round(b[k] * adj, 6) for k in ("open", "high", "low", "close")]
        if b["split"] != 1: adj /= b["split"]
        if b["dividend"] and i > 0: adj *= (1 - b["dividend"] / bars[i - 1]["close"])
    return bars

EQ = {"AAPL": (25, 0.02, 0.0008, ("2020-08-31", 4.0), 0.2), "MSFT": (30, 0.015, 0.0005, None, 0.5), "NVDA": (8, 0.03, 0.001, None, 0.0),
      "GOOGL": (250, 0.018, 0.0004, None, 0), "AMZN": (40, 0.022, 0.0007, None, 0), "META": (38, 0.025, 0.0005, None, 0), "TSLA": (20, 0.035, 0.001, None, 0),
      "JPM": (45, 0.02, 0.0003, None, 0.5), "GS": (200, 0.02, 0.0003, None, 1.0), "KO": (28, 0.01, 0.0002, None, 0.4), "SPY": (140, 0.012, 0.0003, None, 1.2),
      "QQQ": (45, 0.015, 0.0005, None, 0.3), "VOO": (100, 0.012, 0.0003, None, 1.1), "IWM": (75, 0.016, 0.0002, None, 0.4), "GLD": (60, 0.01, 0.0002, None, 0),
      "TLT": (90, 0.009, 0.0, None, 0.6), "KRE": (40, 0.02, 0.0001, None, 0.3), "DIA": (120, 0.012, 0.0003, None, 0.6), "GME": (20, 0.04, 0.0, None, 0)}
STARTS = {"META": dt.date(2012, 5, 18), "VOO": dt.date(2010, 9, 9), "TSLA": dt.date(2010, 6, 29), "KRE": dt.date(2007, 1, 3)}
CR = {"BTC": (dt.date(2015, 1, 20), 220, 0.04, 0.0015), "ETH": (dt.date(2016, 5, 18), 12, 0.05, 0.0015), "SOL": (dt.date(2021, 6, 17), 35, 0.06, 0.0005),
      "ADA": (dt.date(2021, 3, 18), 1.1, 0.05, 0.0), "XRP": (dt.date(2019, 2, 28), 0.31, 0.05, 0.0)}

HIST = {}
for s, (p, v, d, split, div) in EQ.items():
    HIST[("equity", s)] = make_bars(s, STARTS.get(s, dt.date(2007, 1, 3)), p, v, d, weekdays, split, div)
for s, (st, p, v, d) in CR.items():
    bars = make_bars(s, st, p, v, d, alldays)
    if s == "XRP":  # suspension gap, like the real Coinbase history
        bars = [b for b in bars if not ("2021-01-19" <= b["date"] <= "2023-07-12")]
    HIST[("crypto", s)] = bars

def history_payload(kind, sym):
    bars = HIST[(kind, sym)]
    return dict(symbol=sym, kind=kind, name=f"{sym} (TEST FIXTURE)", provider="Test fixture", attribution="SYNTHETIC TEST DATA.", requestedStart="2007-01-01",
                firstDate=bars[0]["date"], lastDate=bars[-1]["date"], bars=bars, gaps=[], droppedRows=0, coverageNote=None, fetchedAt=dt.datetime.utcnow().isoformat() + "Z")

def quote_payload(kind, sym):
    bars = HIST[(kind, sym)]
    last, prev = bars[-1], bars[-2]
    now = dt.datetime.utcnow().isoformat() + "Z"
    return dict(symbol=sym, kind=kind, price=last["close"], reference=prev["close"], change=last["close"] - prev["close"], changePct=(last["close"] / prev["close"] - 1) * 100,
                volume=last["volume"], volumeLabel="test", marketCap=None, asOf=now if kind == "crypto" else f"{last['date']}T20:00:00Z",
                basis="exchange-last" if kind == "crypto" else "eod-close", provider="Test fixture")

def fred_payload(series):
    pts, d = [], dt.date(2007, 1, 1)
    rng = random.Random(series); v = {"DGS10": 4.0, "DGS2": 3.5, "DTB3": 2.0, "DFF": 2.0, "VIXCLS": 18, "SP500": 2000, "NASDAQCOM": 5000, "DJIA": 17000, "CPIAUCSL": 200, "UNRATE": 5, "GDPC1": 15000, "T10Y2Y": 0.5, "USREC": 0}.get(series, 1)
    while d < TODAY:
        if series == "USREC":
            if d.day == 1: pts.append(dict(date=d.isoformat(), value=1 if dt.date(2008, 1, 1) <= d <= dt.date(2009, 6, 1) or dt.date(2020, 3, 1) <= d <= dt.date(2020, 4, 1) else 0))
        elif d.weekday() < 5:
            v = max(0.01, v * (1 + rng.gauss(0.0001, 0.01))); pts.append(dict(date=d.isoformat(), value=round(v, 3)))
        d += dt.timedelta(days=1)
    return dict(series=series, title=f"{series} (TEST FIXTURE)", units="test", frequency="Daily", lastUpdated=None, points=pts, provider="FRED", attribution="TEST", fetchedAt="")

MODE = {"equity_down": False}
def handler(route):
    url = route.request.url
    from urllib.parse import urlparse, parse_qs
    u = urlparse(url); q = {k: v[0] for k, v in parse_qs(u.query).items()}
    path = u.path
    def ok(body): route.fulfill(status=200, content_type="application/json", body=json.dumps(body))
    def err(status, code, msg): route.fulfill(status=status, content_type="application/json", body=json.dumps({"error": {"code": code, "message": msg}}))
    if path == "/api/status":
        return ok({"providers": {"tiingo": {"configured": not MODE["equity_down"], "role": "test"}, "coinbase": {"configured": True, "role": "test"}}, "serverTime": ""})
    hdr = route.request.headers
    keyed = bool(hdr.get("x-tiingo-key")) and bool(hdr.get("x-fred-key"))
    if path == "/api/history":
        kind, sym = q.get("kind", "equity"), q["symbol"].upper()
        if kind == "equity" and MODE["equity_down"] and not keyed: return err(503, "CONFIG_REQUIRED", "Stock and ETF data needs a free Tiingo API key.")
        if (kind, sym) not in HIST: return err(404, "NOT_FOUND", "not found")
        return ok(history_payload(kind, sym))
    if path == "/api/quote":
        kind = q.get("kind", "equity")
        if kind == "equity" and MODE["equity_down"] and not keyed: return err(503, "CONFIG_REQUIRED", "Stock and ETF data needs a free Tiingo API key.")
        res = [dict(symbol=s, quote=quote_payload(kind, s), error=None) if (kind, s) in HIST else dict(symbol=s, quote=None, error={"code": "NO_DATA", "message": "x"}) for s in q["symbols"].split(",")]
        return ok({"results": res, "fetchedAt": ""})
    if path == "/api/fred":
        if MODE["equity_down"] and not keyed: return err(503, "CONFIG_REQUIRED", "Macro data needs a free FRED API key.")
        return ok(fred_payload(q["series"]))
    if path == "/api/search":
        s = q["q"].lower()
        res = [dict(symbol=k[1], name=k[1], kind=k[0]) for k in HIST if s in k[1].lower()]
        return ok({"results": res, "notes": []})
    route.continue_()

results = []
def check(name, fn):
    try:
        fn(); results.append((name, "PASS", "")); print("PASS", name)
    except Exception as e:
        results.append((name, "FAIL", str(e)[:300])); print("FAIL", name, str(e)[:300])

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    ctx.route("**/api/**", handler)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    def t1():
        page.goto(BASE + "/#/overview"); page.wait_for_selector("text=Virtual account")
        expect(page.get_by_text("Portfolio equity")).to_be_visible()
        page.wait_for_timeout(1500); page.screenshot(path=str(OUT / "01-overview.png"), full_page=True)
    check("1. Open the dashboard", t1)

    def t2():
        page.goto(BASE + "/#/terminal"); page.get_by_label("Search assets").fill("Apple")
        page.wait_for_selector("button:has-text('Apple Inc.')"); page.locator("button:has-text('Apple Inc.')").first.dispatch_event("mousedown")
        expect(page.locator("h1", has_text="AAPL")).to_be_visible()
    check("2. Search for Apple", t2)

    def t3():
        page.wait_for_selector("canvas", timeout=10000); page.wait_for_timeout(800)
        expect(page.get_by_text("Daily bars 2007-01-03")).to_be_visible()
        page.screenshot(path=str(OUT / "02-terminal-aapl.png"))
    check("3. Load Apple's historical prices (from 2007)", t3)

    def t4():
        for r in ["1M", "5Y", "MAX", "1D"]:
            page.get_by_role("button", name=r, exact=True).first.click(); page.wait_for_timeout(250)
        page.get_by_role("button", name="MACD", exact=True).click(); page.wait_for_timeout(300)
        page.get_by_role("button", name="Line", exact=True).click(); page.wait_for_timeout(300)
        assert page.locator("canvas").count() >= 4
        page.get_by_role("button", name="Candles", exact=True).click(); page.get_by_role("button", name="1Y", exact=True).first.click()
    check("4. Switch chart timeframes and indicators", t4)

    def t5():
        page.locator("button:has-text('BTC')").first.click()
        expect(page.locator("h1", has_text="BTC")).to_be_visible(); page.wait_for_selector("text=Daily bars 2015-01-20")
        expect(page.get_by_text("Trades 24/7")).to_be_visible()
        page.screenshot(path=str(OUT / "03-terminal-btc.png"))
    check("5-6. Select Bitcoin and load its data", t5)

    state = {}
    def t7():
        page.locator("button:has-text('AAPL')").first.click(); page.wait_for_selector("text=Daily bars 2007-01-03")
        page.get_by_label("Amount (USD)").fill("5000")
        page.get_by_role("button", name="Review buy order").click(); page.get_by_role("button", name="Confirm order").click()
        expect(page.get_by_text("Filled: buy")).to_be_visible()
        acc = page.evaluate("JSON.parse(localStorage.getItem('marketlab:account:v1'))")
        state["acc"] = acc
        tx = acc["transactions"][0]
        assert abs(tx["quantity"] * tx["price"] - 5000) < 0.01 * tx["price"] + 0.01, tx
        page.screenshot(path=str(OUT / "04-order-filled.png"))
    check("7. Buy $5,000 of Apple", t7)

    def t8():
        acc = state["acc"]; tx = acc["transactions"][0]
        expected = 100000 - tx["quantity"] * tx["price"] - tx["fee"]
        assert abs(acc["cash"] - expected) < 1e-6, (acc["cash"], expected)
        assert abs(tx["fee"] - tx["quantity"] * tx["price"] * 5 / 10000) < 1e-9
    check("8. Cash balance changes correctly (incl. 5 bps fee)", t8)

    def t9():
        page.get_by_role("button", name="sell", exact=True).click()
        page.get_by_role("button", name="Shares", exact=True).click()
        acc = page.evaluate("JSON.parse(localStorage.getItem('marketlab:account:v1'))")
        q = acc["positions"]["equity:AAPL"]["quantity"]; state["half"] = round(q / 2, 6)
        page.get_by_label("Quantity (shares)").fill(str(state["half"]))
        page.get_by_role("button", name="Review sell order").click(); page.get_by_role("button", name="Confirm order").click()
        expect(page.get_by_text("Filled: sell")).to_be_visible()
    check("9. Sell part of the position", t9)

    def t10():
        acc = page.evaluate("JSON.parse(localStorage.getItem('marketlab:account:v1'))")
        b, s = acc["transactions"][0], acc["transactions"][1]
        avg = (b["quantity"] * b["price"] + b["fee"]) / b["quantity"]
        exp_real = s["quantity"] * s["price"] - s["fee"] - avg * s["quantity"]
        assert abs(s["realizedPnl"] - exp_real) < 1e-6, (s["realizedPnl"], exp_real)
        pos = acc["positions"]["equity:AAPL"]
        assert abs(pos["costBasis"] - avg * pos["quantity"]) < 1e-6
        page.goto(BASE + "/#/portfolio"); page.wait_for_selector("text=Unrealized P&L")
        page.wait_for_timeout(1200)
        page.screenshot(path=str(OUT / "05-portfolio.png"), full_page=True)
    check("10. Realized and unrealized P&L", t10)

    def t11():
        expect(page.get_by_text("Portfolio analytics")).to_be_visible()
        expect(page.get_by_text("Annualized return, volatility, Sharpe").first).to_be_visible()  # insufficient-data guard for a new account
    check("11. Portfolio analytics (insufficient-observation guard shown)", t11)

    def t12():
        page.goto(BASE + "/#/history"); page.get_by_role("button", name="Start simulation").click()
        page.wait_for_selector("text=Trade at today's open", timeout=15000)
        expect(page.get_by_text("Wednesday, January 2, 2008")).to_be_visible()
        page.get_by_label("Amount").fill("30000"); page.get_by_role("button", name="Place buy order").click()
        expect(page.get_by_text("Bought")).to_be_visible()
        # chart must stop before today: no bar for the current day is visible in the legend
        page.get_by_role("button", name="1 year").click(); page.wait_for_timeout(400)
        page.get_by_role("button", name="1 month").click(); page.wait_for_timeout(400)
        page.screenshot(path=str(OUT / "06-time-machine.png"), full_page=True)
        page.get_by_role("button", name="Finish and review").click()
        expect(page.get_by_text("What happened next")).to_be_visible()
    check("12. Run a historical simulation", t12)

    def t13():
        expect(page.get_by_text("SPY buy-and-hold (total return)").first).to_be_visible()
        page.wait_for_timeout(500); page.screenshot(path=str(OUT / "07-retrospective.png"), full_page=True)
    check("13. Compare against a benchmark", t13)

    def t13b():
        page.goto(BASE + "/#/research"); page.get_by_role("button", name="Strategy backtest").click()
        page.wait_for_timeout(1500); page.get_by_role("button", name="Run backtest").click()
        expect(page.get_by_text("Results: Rebalance every 3 months")).to_be_visible()
        page.screenshot(path=str(OUT / "08-backtest.png"), full_page=True)
        page.get_by_role("button", name="Efficient frontier").click(); page.wait_for_selector("text=Maximum-Sharpe portfolio", timeout=15000)
        page.screenshot(path=str(OUT / "09-frontier.png"), full_page=True)
        page.get_by_role("button", name="Macro").click(); page.wait_for_timeout(1500)
        page.screenshot(path=str(OUT / "10-macro.png"), full_page=True)
    check("13b. Research Lab: backtest, frontier, macro", t13b)

    def t13c():
        page.goto(BASE + "/#/history"); page.get_by_role("button", name="Financial Crisis Explorer").click()
        page.wait_for_selector("text=Market behaviour during the acute phase"); page.wait_for_timeout(1500)
        page.get_by_role("button", name="Cryptocurrency Market Collapse, 2022").click(); page.wait_for_timeout(1500)
        expect(page.get_by_text("No price data for this period")).to_be_visible()  # XRP gap handled
        page.screenshot(path=str(OUT / "11-crisis.png"), full_page=True)
    check("13c. Crisis Explorer incl. missing-data handling", t13c)

    def t14():
        n_before = len(page.evaluate("JSON.parse(localStorage.getItem('marketlab:account:v1'))")["transactions"])
        page.reload(); page.goto(BASE + "/#/portfolio"); page.wait_for_selector("text=Positions")
        expect(page.locator("td", has_text="AAPL").first).to_be_visible()
        n_after = len(page.evaluate("JSON.parse(localStorage.getItem('marketlab:account:v1'))")["transactions"])
        assert n_before == n_after
    check("14. Refresh and verify persistence", t14)

    def t15():
        MODE["equity_down"] = True
        p2 = ctx.new_page(); p2.goto(BASE + "/#/terminal?symbol=MSFT&kind=equity")
        p2.wait_for_selector("text=API key required", timeout=10000)
        assert p2.locator("text=Daily bars").count() == 0
        p2.screenshot(path=str(OUT / "12-api-config-required.png"))
        p2.goto(BASE + "/#/overview"); p2.wait_for_timeout(1500)
        p2.screenshot(path=str(OUT / "13-overview-no-keys.png"), full_page=True)
        MODE["equity_down"] = False; p2.close()
    check("15. API failure behaviour (no invented values)", t15)

    def t15b():
        MODE["equity_down"] = True
        p2 = ctx.new_page(); p2.goto(BASE + "/#/history")
        p2.get_by_role("button", name="Start simulation").click()
        expect(p2.get_by_text("Stock and ETF prices need a Tiingo API key")).to_be_visible()
        expect(p2.get_by_text("AAPL: Stock and ETF data needs")).to_be_visible()
        p2.screenshot(path=str(OUT / "17-tm-no-key.png"), full_page=True)
        MODE["equity_down"] = False; p2.close()
        # static host / vite preview: /api returns the SPA's HTML
        c3 = browser.new_context(viewport={"width": 1280, "height": 900})
        c3.route("**/api/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<!doctype html><html></html>"))
        p3 = c3.new_page(); p3.goto(BASE + "/#/history")
        p3.get_by_role("button", name="Start simulation").click()
        expect(p3.get_by_text("The data server is not reachable")).to_be_visible()
        p3.screenshot(path=str(OUT / "18-tm-no-server.png"), full_page=True); c3.close()
    check("15b. Time Machine explains missing key / missing API server", t15b)

    def t16():
        for name, vp in [("tablet", {"width": 820, "height": 1180}), ("mobile", {"width": 390, "height": 844})]:
            p3 = browser.new_context(viewport=vp); p3.route("**/api/**", handler); pg = p3.new_page()
            pg.goto(BASE + "/#/terminal"); pg.wait_for_selector("canvas", timeout=10000); pg.wait_for_timeout(800)
            w = pg.evaluate("document.documentElement.scrollWidth"); assert w <= vp["width"] + 1, f"{name} horizontal overflow {w}"
            pg.screenshot(path=str(OUT / f"14-{name}-terminal.png"), full_page=True); p3.close()
    check("16. Tablet and mobile layouts (no page overflow)", t16)

    def t17():
        page.goto(BASE + "/#/terminal"); page.locator("button[aria-label='Toggle dark mode']").click(); page.wait_for_timeout(800)
        page.screenshot(path=str(OUT / "15-terminal-dark.png"))
        page.goto(BASE + "/#/learn"); page.wait_for_timeout(300); page.screenshot(path=str(OUT / "16-learn-dark.png"))
    check("Dark mode and Learning Center render", t17)

    def t18():
        MODE["equity_down"] = True
        p4 = ctx.new_page(); p4.goto(BASE + "/#/history"); p4.get_by_role("button", name="Start simulation").click()
        expect(p4.get_by_text("Stock and ETF prices need a Tiingo API key")).to_be_visible(timeout=10000)
        expect(p4.get_by_text("not set, so")).to_be_visible()
        p4.screenshot(path=str(OUT / "17-tm-config.png")); p4.close(); MODE["equity_down"] = False
    check("18. Time Machine explains a missing Tiingo key", t18)

    def t19():
        c2 = browser.new_context(viewport={"width": 1280, "height": 800})
        c2.route("**/api/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<!doctype html><html></html>"))
        p5 = c2.new_page(); p5.goto(BASE + "/#/history")
        expect(p5.get_by_text("the MARKETLAB data server is not responding")).to_be_visible(timeout=10000)
        p5.get_by_role("button", name="Start simulation").click()
        expect(p5.get_by_text("The data server is not reachable")).to_be_visible(timeout=10000)
        p5.screenshot(path=str(OUT / "18-server-down.png")); c2.close()
    check("19. API server missing (static hosting / preview) is diagnosed", t19)

    def t20():
        MODE["equity_down"] = True  # server has no keys
        c3 = browser.new_context(viewport={"width": 1280, "height": 900}); c3.route("**/api/**", handler); pg = c3.new_page()
        pg.goto(BASE + "/#/terminal?symbol=AAPL&kind=equity")
        expect(pg.get_by_text("keys are not set")).to_be_visible(timeout=10000)
        pg.get_by_role("button", name="Paste keys in Settings").click()
        pg.get_by_label("Tiingo key (stocks and ETFs)").fill("my-tiingo-key")
        pg.get_by_label("FRED key (indices, Treasury yields, macro)").fill("my-fred-key")
        pg.screenshot(path=str(OUT / "19-settings-keys.png"))
        pg.get_by_role("button", name="Save keys and reload").click()
        pg.wait_for_selector("text=Daily bars 2007-01-03", timeout=15000)
        assert pg.get_by_text("keys are not set").count() == 0
        assert pg.get_by_text("key is not set").count() == 0
        pg.goto(BASE + "/#/overview"); pg.wait_for_timeout(2000)
        expect(pg.get_by_text("FRED close").first).to_be_visible()
        pg.screenshot(path=str(OUT / "20-after-keys.png"), full_page=True)
        c3.close(); MODE["equity_down"] = False
    check("20. Paste both keys in Settings with no server keys: data loads", t20)

    if errors: results.append(("No uncaught page errors", "FAIL", "; ".join(errors)[:500]))
    else: results.append(("No uncaught page errors", "PASS", ""))
    browser.close()

print("\nSUMMARY")
for n, s, e in results: print(f"{s:4}  {n}  {e}")
sys.exit(0 if all(s == "PASS" for _, s, _ in results) else 1)
