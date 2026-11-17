import { createInterface } from "node:readline";

const SYMBOL = "CBBTC";
const MIN_DEPTH_USD = 300_000;
const MAX_HISTORY = 160;
const BUY_SLIPPAGE_BPS = 100;
const SELL_SLIPPAGE_BPS = 150;

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
let hello = null;
let history = [];
let pending = null;
let entryPrice = 0;
let entryBar = -1;
let entryCost = 0;
let highWater = 0;
let peakEquity = 0;
let losingStreak = 0;
let filledBuys = 0;
let halted = false;

function n(value) {
  return Number(value ?? 0);
}

function mean(values) {
  if (!values.length) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

function sma(values, period) {
  if (values.length < period) return 0;
  let total = 0;
  for (let i = values.length - period; i < values.length; i++) total += values[i].c;
  return total / period;
}

function maxHigh(values) {
  let result = 0;
  for (const value of values) if (value.h > result) result = value.h;
  return result;
}

function reply(seq, orders = []) {
  process.stdout.write(JSON.stringify({ type: "reply", seq, orders }) + "\n");
}

function makeSell(batch, position, reason) {
  if (!position || pending) return [];
  const qty = String(position.qty);
  if (!qty || qty === "0") return [];
  pending = {
    id: "sell-" + batch.seq,
    side: "sell",
    seq: batch.seq,
    entryCost: n(position.cost_quote_units),
    reason
  };
  return [{
    side: "sell",
    client_id: pending.id,
    symbol: SYMBOL,
    qty,
    max_slippage_bps: SELL_SLIPPAGE_BPS
  }];
}

function makeBuy(batch, account, weightBps, reason) {
  if (pending || halted) return [];
  const cash = n(account.cash_quote_units);
  const equity = n(account.equity_quote_units);
  const minNotional = n(hello.fees.min_notional_quote_units);
  const target = Math.floor(equity * weightBps / 10_000);
  const spend = Math.min(cash, target);
  if (spend < minNotional) return [];
  pending = {
    id: "buy-" + batch.seq,
    side: "buy",
    seq: batch.seq,
    reason
  };
  return [{
    side: "buy",
    client_id: pending.id,
    symbol: SYMBOL,
    notional_quote_units: String(Math.floor(spend)),
    max_slippage_bps: BUY_SLIPPAGE_BPS
  }];
}

function updateFills(batch) {
  if (!pending || batch.seq <= pending.seq) return;
  const fill = batch.fills.find(item => item.client_id === pending.id);
  if (fill && fill.status === "filled") {
    if (pending.side === "buy") {
      filledBuys += 1;
      const position = batch.account.positions.find(item => item.symbol === SYMBOL);
      entryPrice = n(fill.price);
      highWater = entryPrice;
      entryBar = n(fill.fill_bar);
      entryCost = position ? n(position.cost_quote_units) :
        n(fill.notional_quote_units) + n(fill.fee_quote_units);
    } else {
      const proceeds = Math.max(0, n(fill.notional_quote_units) - n(fill.fee_quote_units));
      const realized = proceeds - pending.entryCost;
      losingStreak = realized < 0 ? losingStreak + 1 : 0;
      entryPrice = 0;
      highWater = 0;
      entryBar = -1;
      entryCost = 0;
    }
  }
  pending = null;
}

function currentMetrics(bar, seq) {
  const closes = history.map(item => item.c);
  const close = bar.c;
  const sma24 = sma(history, 24);
  const sma72 = sma(history, 72);
  const previous12 = history.slice(-13, -1);
  const previous36 = history.slice(-37, -1);
  const high12 = maxHigh(previous12);
  const high36 = maxHigh(previous36);
  const breakout12 = high12 > 0 ? (close / high12 - 1) * 10_000 : -10_000;
  const breakout36 = high36 > 0 ? (close / high36 - 1) * 10_000 : -10_000;
  const mom12 = closes.length >= 13 ? (close / closes[closes.length - 13] - 1) * 10_000 : 0;
  const mom24 = closes.length >= 25 ? (close / closes[closes.length - 25] - 1) * 10_000 : 0;
  const mom72 = closes.length >= 73 ? (close / closes[closes.length - 73] - 1) * 10_000 : 0;

  const ranges = history.map(item => item.rangeBps);
  const recentRange = mean(ranges.slice(-8));
  const baseRange = mean(ranges.slice(-56, -8));
  const expansionRatio = baseRange > 0 ? recentRange / baseRange : 0;
  const progress = Math.max(0, Math.min(1, (seq - 240) / 960));
  const breakoutThreshold = 18 - 13 * progress;

  const trendUp = sma24 > 0 && sma72 > 0 &&
    sma24 >= sma72 * 0.9995 &&
    close >= sma24 * 0.9995;
  const mediumContext = breakout36 >= -18 && close >= sma72 * 0.999;
  const volatilityExpanded = expansionRatio >= 1.05 && recentRange >= 3.0;
  const shortBreakout = breakout12 >= breakoutThreshold;
  const momentumConfirmed = mom24 >= -5 || (mom12 >= 12 && close >= sma24);
  const depthUsd = Math.min(
    ...bar.o_depth.map(n),
    ...bar.c_depth.map(n)
  ) / 1_000_000;

  return {
    close, sma24, sma72, mom12, mom24, mom72,
    breakout12, breakout36, breakoutThreshold,
    expansionRatio, recentRange, baseRange,
    trendUp, mediumContext, volatilityExpanded,
    shortBreakout, momentumConfirmed, depthUsd
  };
}

for await (const line of rl) {
  if (!line.trim()) continue;
  const message = JSON.parse(line);

  if (message.type === "hello") {
    hello = message;
    peakEquity = n(hello.capital.quote_units);
    continue;
  }

  if (message.type === "done") break;
  if (message.type !== "batch" || !hello) throw new Error("Unexpected protocol message");

  const batch = message;
  updateFills(batch);

  const account = batch.account;
  const equity = n(account.equity_quote_units);
  peakEquity = Math.max(peakEquity, equity);
  if (peakEquity > 0 && equity <= peakEquity * 0.82) halted = true;

  const position = account.positions.find(item => item.symbol === SYMBOL) ?? null;
  const bar = batch.bars.find(item => item.symbol === SYMBOL) ?? null;

  if (position && entryPrice <= 0 && bar) {
    entryPrice = n(bar.c);
    highWater = entryPrice;
    entryBar = batch.seq;
    entryCost = n(position.cost_quote_units);
  }

  if (position && bar) highWater = Math.max(highWater, n(bar.c));

  if (bar) {
    const o = n(bar.o), h = n(bar.h), l = n(bar.l), c = n(bar.c);
    const rangeBps = c > 0 ? (h - l) / c * 10_000 : 0;
    const nonFlat = h > l && c !== o;
    history.push({ o, h, l, c, rangeBps, nonFlat, t: bar.t });
    if (history.length > MAX_HISTORY) history.shift();
  }

  let orders = [];

  if (position && bar) {
    const close = n(bar.c);
    const gainBps = entryPrice > 0 ? (close / entryPrice - 1) * 10_000 : 0;
    const pullbackBps = highWater > 0 ? (close / highWater - 1) * 10_000 : 0;
    const metrics = history.length >= 72 ? currentMetrics(bar, batch.seq) : null;
    const heldBars = entryBar >= 0 ? batch.seq - entryBar : 0;

    const hardStop = halted;
    const initialStop = gainBps <= -150;
    const takeProfit = gainBps >= 120;
    const trailingStop = highWater >= entryPrice * 1.007 &&
      pullbackBps <= -60;
    const trendBreak = metrics && heldBars >= 8 &&
      close < metrics.sma24 &&
      (metrics.mom12 < -8 || metrics.sma24 < metrics.sma72);
    const timeStop = heldBars >= 180 && gainBps < 45;

    if (hardStop || initialStop || takeProfit || trailingStop || trendBreak || timeStop) {
      orders = makeSell(batch, position,
        hardStop ? "equity-hard-stop" :
        initialStop ? "initial-stop" :
        takeProfit ? "take-profit" :
        trailingStop ? "trailing-stop" :
        trendBreak ? "trend-break" : "time-stop");
    }
  }

  if (!position && !pending && !halted && bar && orders.length === 0) {
    const current = history[history.length - 1];
    const previous = history[history.length - 2];
    const enoughHistory = history.length >= 72;
    const nonFlat = current && current.nonFlat;
    const depthOk = currentMetrics(bar, batch.seq).depthUsd >= MIN_DEPTH_USD;
    if (enoughHistory && nonFlat && depthOk) {
      const m = currentMetrics(bar, batch.seq);
      const normalSignal = m.trendUp &&
        m.mediumContext &&
        m.volatilityExpanded &&
        m.shortBreakout &&
        m.momentumConfirmed &&
        m.depthUsd >= MIN_DEPTH_USD;

      const fallbackSignal = batch.seq >= 1200 &&
        filledBuys === 0 &&
        previous &&
        m.trendUp &&
        m.close > previous.c &&
        m.close >= m.sma24 * 0.999 &&
        m.breakout12 >= Math.max(1, m.breakoutThreshold * 0.25) &&
        m.mediumContext &&
        m.depthUsd >= MIN_DEPTH_USD;

      if (normalSignal || fallbackSignal) {
        let weightBps;
        let reason;
        if (fallbackSignal && filledBuys === 0) {
          weightBps = 500;
          reason = "minimum-trade-fallback";
        } else {
          const strong = m.breakout12 >= m.breakoutThreshold + 8 &&
            m.expansionRatio >= 1.35 &&
            m.mom24 >= 20 &&
            m.sma24 > m.sma72;
          weightBps = strong ? 5_800 : 3_200;
          const streakFactor = Math.max(0.4, 1 - 0.22 * losingStreak);
          weightBps = Math.floor(weightBps * streakFactor);
          reason = strong ? "strong-volatility-breakout" : "selective-breakout";
        }
        orders = makeBuy(batch, account, weightBps, reason);
      }
    }
  }

  reply(batch.seq, orders);
}
