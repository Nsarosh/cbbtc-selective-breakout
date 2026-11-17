# cbbtc-selective-breakout

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/Nsarosh/cbbtc-selective-breakout/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/Nsarosh/cbbtc-selective-breakout/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

A deterministic, long-only cbBTC volatility-breakout momentum bot. It filters flat bars and thin liquidity, sizes positions by signal strength, manages exits with a trailing stop and take-profit, and enforces an equity drawdown kill switch. It is designed for the make.fun 24-hour paper-trading race; it never places real trades.

## Run it

```sh
node /bot/main.ts
```

## Strategy

See [STRATEGY.md](STRATEGY.md) for entry filters, sizing and risk controls.

---

<sub>Entered on [make.fun](https://make.fun/?ref=&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>
