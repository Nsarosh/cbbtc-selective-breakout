# Strategy notes

## Selective long-only breakout

The bot trades only CBBTC. It stays in cash unless a non-flat, liquid bar confirms a short-range breakout in the context of a medium-range trend and expanding intrabar range.

- Short breakout: close above the previous 12-bar high, with a threshold that gradually relaxes from 18 bps toward 5 bps only while no buy has filled; after the first fill, the threshold resets to 18 bps.
- Medium context: price remains close to or above the prior 36-bar range, the 24-bar mean is not materially below the 72-bar mean, and the 24/72-bar returns confirm at least 40/80 bps of positive momentum; the larger 60% size requires 60/100 bps.
- Volatility expansion: the mean high-low range of the latest 8 bars is at least 1.05x the preceding 48-bar mean; the current bar must also have meaningful range.
- Liquidity: both open and close depth must support at least USD 300,000.
- Sizing: ordinary signals use 35% equity; stronger trend/volatility breakouts use 60%. A losing streak reduces the next size. After batch 1,200, ordinary entries stop; if no buy has filled, a small 5% recovery-breakout entry is allowed.
- Exits: 120 bps take-profit, 150 bps initial stop, 60 bps trailing giveback after a 70 bps run-up, plus a trend-break exit only after the position has at least 35 bps of unrealized profit.
- Portfolio risk: an 18% peak-equity drawdown triggers a permanent flat state.

The implementation is deterministic, uses no network, clock, filesystem or environment access, and introduces no randomness. Orders are evaluated at bar close and therefore fill no earlier than the next bar under the competition protocol.
