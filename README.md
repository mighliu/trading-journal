# TradeFlow Journal 📈

A premium trading journal application designed to track performance, analyze behavioral tendencies, manage risk, and optimize your trading strategy. Built with a stunning Obsidian-glassmorphic style and fully responsive layouts.

## Features 🚀

### 1. Advanced Performance Analytics
*   **Drawdown & Streak Metrics**: Track your maximum completed drawdown duration in trades/days, current drawdown levels, and binomial win/loss streak probability compared to actual outcomes.
*   **R-Multiple Distribution**: Understand your risk-to-reward metrics with automated bucket calculations.
*   **Rolling Performance Window**: A 20-trade rolling lookback displaying your Win Rate and Profit Factor trend lines over time.
*   **Behavioral Tracking**: Analyze performance by daily trade sequence (to identify overtrading) and post-loss performance (to detect revenge trading/tilting).
*   **MFE & MAE Excursions**: Scatter plots mapping Maximum Favorable Excursion (MFE) and Maximum Adverse Excursion (MAE) against realized P&L to optimize exit and stop-loss placements.
*   **Intraday Timeline Replay**: Interactive date-selectable replay showing exactly how long you held positions and overlapping trades throughout the day.
*   **P&L by Daily Sequence + Win Rate**: Track both cumulative sequence profit/loss and win rate per trade sequence order.
*   **Integrated Efficiency Metrics**: Exit Efficiency (MFE Capture Ratio) and Drawdown Control (MAE Savings Ratio) are displayed directly in the scatter chart headers.

### 2. Risk Management Dashboard
*   **Position Sizing Calculator**: Input your account balance, risk preference percentage, entry price, and stop-loss price to instantly calculate your maximum recommended share size.
*   **Live Account Balance Sync**: Dynamic calculator syncs directly with your current live account equity (starting balance + cumulative net P&L of executed trades).
*   **Dynamic Severity Colors**: Live metrics warn you in amber or bold red if your current drawdown parameters cross risk thresholds.

### 3. Intervention Edge Tracker
*   **IER (Intervention Efficiency Ratio)**: Measures the percentage of manual interventions (overrides, early exits, skipped setups) that improved your trade's net financial outcome compared to original strategy rules.
*   **Attribution Analysis**: Cumulative dollar metrics breakdown by manual intervention categories (e.g., *early profit take*, *discipline error*, *followed strategy*).
*   **Attribution Gauges & Highlighted Metrics**: Clear, color-coded gauge ring and row highlights for key comparative stats.

### 4. Interactive Log & Calendar
*   **Clickable Calendar View**: Color-coded cell shading corresponding to daily profits, losses, and breakeven stats.
*   **Sortable Trade Logs**: Instantly sort logs by Date, Symbol, Direction, Net P&L, %, R:R, and Duration.
*   **Notes & Lesson Search**: Live, real-time matching filter across symbols, notes, lessons, and mistakes.
*   **Clean Skipped Trade UX**: Skipped trades are styled with a subtle opacity, labeled with a dedicated tag, and automatically excluded from standard performance analytics to keep metrics clean.

### 5. Customization & UI Extras
*   **Dynamic Futures Multiplier Engine**: Supports automatic point-to-dollar contract multipliers for futures contracts (e.g. `ES`, `NQ`, `MES`, `MNQ`, `YM`, `MYM`, `CL`, `MCL`, `GC`, `MGC`) or standard options multipliers (e.g. 100 shares), with support for custom multipliers via `Override P&L`.
*   **Premium Themes**: Obsidian dark mode and off-white light theme overrides with custom zinc/indigo variables.
*   **Keyboard Shortcuts**: Press `?` on your keyboard to open the helper modal overlay listing keyboard shortcut binds (e.g., `N` to add new trade, `Esc` to close panel, `Alt + 1` to `Alt + 6` for quick tab switching).

---

## File Structure 📂

*   `index.html` — Layout elements, overlays, tab grids, and modals.
*   `style.css` — Core Obsidian glassmorphism designs, layout grids, and the 75-rule light theme override system.
*   `demo-data.js` — Realistic seed data containing 36 executed trades.
*   `js/` — Modular JavaScript components:
    *   `main.js` — App router, tab controllers, and theme initialization.
    *   `state.js` — Storage engine, account switching, filter states, and data import/export parser.
    *   `ui.js` — Log builders, calculators, dynamic styling events, and slide-over panel controllers.
    *   `charts.js` — Chart.js definitions, empty state renderers, and timeline selectors.
    *   `utils.js` — Statistical, streak, drawdown, and financial logic.
    *   `calendar.js` — Calendar layout generator and date mappings.

---

## Getting Started ⚙️

### Prerequisites
You only need a modern browser. The application is written using native ES6 JavaScript modules and does not require a compilation step.

### Running Locally
To run the development server locally, you can use any static file server. For example, using Node.js:

1. Clone this repository:
   ```bash
   git clone https://github.com/Kasdu/trading-journal.git
   cd trading-journal
   ```
2. Start a local server (e.g., `serve` or Python's `http.server`):
   ```bash
   npx serve
   ```
3. Open `http://localhost:3000` (or the port specified by your server).
