import { AppState } from './state.js';
import { closeDayPanel } from './calendar.js';
import { 
  calcNetPnl, 
  calcPnlPercent, 
  calcRiskReward, 
  calcDuration, 
  formatCurrency, 
  formatPercent, 
  formatDuration, 
  calcStreaks, 
  calcProfitFactor, 
  calcWinRate,
  escapeHtml,
  calcSignalPnl,
  calcPriceDiff,
  calcPnlDiff,
  calcSharpeRatio,
  calcSortinoRatio,
  getSymbolMultiplier,
  calcInterventionAnalytics,
  calcMaxDrawdown,
  isRevengeTrade,
  calcDrawdownDurations,
  calcStreakProbability,
  calcMfe,
  calcMae
} from './utils.js';

let currentEditId = null;
let currentDirection = "long"; // long by default
let currentStatus = "executed"; // executed by default
let currentPage = 1;
let tradesPerPage = 25;
let currentSortField = "exitDateTime";
let currentSortAscending = false;
let currentSearchQuery = "";

export function renderStatsBanner(trades, startingBalance = 25000) {
  const bannerPnl = document.getElementById("bannerPnl");
  const bannerBalance = document.getElementById("bannerBalance");
  const bannerGrowth = document.getElementById("bannerGrowth");
  const bannerWinRate = document.getElementById("bannerWinRate");
  const bannerWinRateProgress = document.getElementById("bannerWinRateProgress");
  const bannerProfitFactor = document.getElementById("bannerProfitFactor");
  const bannerAvgWinLoss = document.getElementById("bannerAvgWinLoss");
  const bannerBestStreak = document.getElementById("bannerBestStreak");
  const bannerCurrentStreak = document.getElementById("bannerCurrentStreak");
  const bannerSharpe = document.getElementById("bannerSharpe");
  const bannerSortino = document.getElementById("bannerSortino");
  const bannerExpectancy = document.getElementById("bannerExpectancy");
  const bannerMaxDrawdown = document.getElementById("bannerMaxDrawdown");
  const bannerRecoveryFactor = document.getElementById("bannerRecoveryFactor");

  // Computations
  let totalNetPnl = 0;
  let grossWins = 0;
  let grossLosses = 0;
  let winsCount = 0;
  let lossesCount = 0;
  
  for (const t of trades) {
    const net = calcNetPnl(t);
    totalNetPnl += net;
    if (net > 0) {
      grossWins += net;
      winsCount++;
    } else if (net < 0) {
      grossLosses += Math.abs(net);
      lossesCount++;
    }
  }

  const finalBalance = startingBalance + totalNetPnl;
  const growthPercent = startingBalance > 0 ? (totalNetPnl / startingBalance) * 100 : 0;
  const winRate = trades.length > 0 ? (winsCount / trades.length) * 100 : 0;
  const profitFactor = calcProfitFactor(trades);
  
  const avgWin = winsCount > 0 ? grossWins / winsCount : 0;
  const avgLoss = lossesCount > 0 ? grossLosses / lossesCount : 0;

  const streaks = calcStreaks(trades);

  // Render values
  if (bannerPnl) {
    const pnlSign = totalNetPnl > 0 ? "+" : "";
    bannerPnl.textContent = `${pnlSign}${formatCurrency(totalNetPnl)} (${formatPercent(growthPercent)})`;
    bannerPnl.className = `stat-value ${totalNetPnl > 0 ? "profit" : totalNetPnl < 0 ? "loss" : ""}`;

    // Apply TradingView-style theme colors and glow to the Net Profit card container
    const pnlCard = bannerPnl.closest('.stat-card');
    if (pnlCard) {
      pnlCard.classList.remove('card-tv-profit', 'card-tv-loss', 'card-profit', 'card-loss');
      if (totalNetPnl > 0) pnlCard.classList.add('card-tv-profit');
      else if (totalNetPnl < 0) pnlCard.classList.add('card-tv-loss');
    }
  }
  
  if (bannerBalance) {
    bannerBalance.textContent = formatCurrency(finalBalance);
  }
  
  if (bannerGrowth) {
    bannerGrowth.textContent = formatPercent(growthPercent);
    bannerGrowth.className = `stat-value ${growthPercent > 0 ? "profit" : growthPercent < 0 ? "loss" : ""}`;
  }
  
  if (bannerWinRate) {
    bannerWinRate.textContent = `${winRate.toFixed(1)}%`;
  }
  if (bannerWinRateProgress) {
    bannerWinRateProgress.style.strokeDasharray = `${winRate}, 100`;
  }

  if (bannerProfitFactor) {
    bannerProfitFactor.textContent = profitFactor === 99.9 ? "∞" : profitFactor.toFixed(2);
    bannerProfitFactor.className = `stat-value ${profitFactor >= 1.5 ? "profit" : profitFactor < 1 ? "loss" : ""}`;
  }

  if (bannerAvgWinLoss) {
    bannerAvgWinLoss.textContent = `${formatCurrency(avgWin)} / ${formatCurrency(avgLoss)}`;
  }
  
  if (bannerBestStreak) {
    bannerBestStreak.textContent = `🔥 ${streaks.bestWinStreak}`;
  }
  
  if (bannerCurrentStreak) {
    bannerCurrentStreak.textContent = streaks.currentStreak;
    if (streaks.currentStreak.startsWith("W")) {
      bannerCurrentStreak.className = "stat-value profit";
    } else if (streaks.currentStreak.startsWith("L")) {
      bannerCurrentStreak.className = "stat-value loss";
    } else {
      bannerCurrentStreak.className = "stat-value";
    }
  }

  // Calculate Sharpe and Sortino
  const sharpe = calcSharpeRatio(trades, startingBalance);
  const sortino = calcSortinoRatio(trades, startingBalance);

  if (bannerSharpe) {
    bannerSharpe.textContent = sharpe === 99.9 ? "∞" : sharpe.toFixed(2);
    bannerSharpe.className = `stat-value ${sharpe >= 1.5 ? "profit" : sharpe < 0 ? "loss" : ""}`;
  }

  if (bannerSortino) {
    bannerSortino.textContent = sortino === 99.9 ? "∞" : sortino.toFixed(2);
    bannerSortino.className = `stat-value ${sortino >= 1.5 ? "profit" : sortino < 0 ? "loss" : ""}`;
  }

  // Expectancy, Max Drawdown, Recovery Factor
  const expectancy = trades.length > 0 ? totalNetPnl / trades.length : 0;
  const mdd = calcMaxDrawdown(trades, startingBalance);
  const recoveryFactor = mdd.amount > 0 ? totalNetPnl / mdd.amount : (totalNetPnl > 0 ? 99.9 : 0);

  if (bannerExpectancy) {
    bannerExpectancy.textContent = formatCurrency(expectancy);
    bannerExpectancy.className = `stat-value ${expectancy > 0 ? "profit" : expectancy < 0 ? "loss" : ""}`;
  }

  if (bannerMaxDrawdown) {
    bannerMaxDrawdown.textContent = `${formatCurrency(mdd.amount)} (${mdd.percent.toFixed(1)}%)`;
    bannerMaxDrawdown.className = `stat-value ${mdd.amount > 0 ? "loss" : ""}`;
  }

  if (bannerRecoveryFactor) {
    bannerRecoveryFactor.textContent = recoveryFactor === 99.9 ? "∞" : recoveryFactor.toFixed(2);
    bannerRecoveryFactor.className = `stat-value ${recoveryFactor >= 3 ? "profit" : recoveryFactor < 1 ? "loss" : ""}`;
  }

  // Weekly & Monthly calculations
  const now = new Date();
  
  // Start of this week (Monday)
  const monday = new Date(now);
  const day = monday.getDay();
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);

  // Start of this month
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let weeklyPnl = 0;
  let monthlyPnl = 0;

  for (const t of trades) {
    const exitDate = new Date(t.exitDateTime);
    const net = calcNetPnl(t);
    if (exitDate >= monday) {
      weeklyPnl += net;
    }
    if (exitDate >= firstOfMonth) {
      monthlyPnl += net;
    }
  }

  const bannerWeeklyPnl = document.getElementById("bannerWeeklyPnl");
  const bannerMonthlyPnl = document.getElementById("bannerMonthlyPnl");

  if (bannerWeeklyPnl) {
    bannerWeeklyPnl.textContent = formatCurrency(weeklyPnl);
    bannerWeeklyPnl.className = `stat-value ${weeklyPnl > 0 ? "profit" : weeklyPnl < 0 ? "loss" : ""}`;
  }
  if (bannerMonthlyPnl) {
    bannerMonthlyPnl.textContent = formatCurrency(monthlyPnl);
    bannerMonthlyPnl.className = `stat-value ${monthlyPnl > 0 ? "profit" : monthlyPnl < 0 ? "loss" : ""}`;
  }

  // Update global trade count badge
  const globalCount = document.getElementById("globalTradeCount");
  if (globalCount) {
    globalCount.textContent = trades.length;
  }

  // Update new TradingView-style Performance Summary table
  const tvNetProfit = document.getElementById("tvNetProfitValue");
  const tvGrossProfit = document.getElementById("tvGrossProfitValue");
  const tvGrossLoss = document.getElementById("tvGrossLossValue");
  const tvProfitFactor = document.getElementById("tvProfitFactorValue");
  const tvMaxDrawdown = document.getElementById("tvMaxDrawdownValue");
  const tvSharpe = document.getElementById("tvSharpeRatioValue");
  const tvSortino = document.getElementById("tvSortinoRatioValue");
  const tvTotalTrades = document.getElementById("tvTotalTradesValue");
  const tvWinRate = document.getElementById("tvWinRateValue");
  const tvAverageTrade = document.getElementById("tvAverageTradeValue");
  const tvAvgWinLossRatio = document.getElementById("tvAvgWinLossRatioValue");

  if (tvNetProfit) {
    const pnlSign = totalNetPnl > 0 ? "+" : "";
    tvNetProfit.textContent = `${pnlSign}${formatCurrency(totalNetPnl)} (${formatPercent(growthPercent)})`;
    tvNetProfit.className = totalNetPnl > 0 ? "profit" : totalNetPnl < 0 ? "loss" : "";
  }
  if (tvGrossProfit) {
    tvGrossProfit.textContent = formatCurrency(grossWins);
    tvGrossProfit.className = grossWins > 0 ? "profit" : "";
  }
  if (tvGrossLoss) {
    tvGrossLoss.textContent = formatCurrency(-grossLosses);
    tvGrossLoss.className = grossLosses > 0 ? "loss" : "";
  }
  if (tvProfitFactor) {
    tvProfitFactor.textContent = profitFactor === 99.9 ? "∞" : profitFactor.toFixed(2);
  }
  if (tvMaxDrawdown) {
    if (mdd.amount > 0) {
      tvMaxDrawdown.textContent = `${formatCurrency(-mdd.amount)} (-${mdd.percent.toFixed(2)}%)`;
      tvMaxDrawdown.className = "loss";
    } else {
      tvMaxDrawdown.textContent = "$0.00 (0.00%)";
      tvMaxDrawdown.className = "";
    }
  }
  if (tvSharpe) {
    tvSharpe.textContent = sharpe === 99.9 ? "∞" : sharpe.toFixed(2);
    tvSharpe.className = sharpe >= 1.5 ? "profit" : sharpe < 0 ? "loss" : "";
  }
  if (tvSortino) {
    tvSortino.textContent = sortino === 99.9 ? "∞" : sortino.toFixed(2);
    tvSortino.className = sortino >= 1.5 ? "profit" : sortino < 0 ? "loss" : "";
  }
  if (tvTotalTrades) {
    tvTotalTrades.textContent = trades.length;
  }
  if (tvWinRate) {
    tvWinRate.textContent = `${winRate.toFixed(1)}%`;
  }
  if (tvAverageTrade) {
    tvAverageTrade.textContent = formatCurrency(expectancy);
    tvAverageTrade.className = expectancy > 0 ? "profit" : expectancy < 0 ? "loss" : "";
  }
  if (tvAvgWinLossRatio) {
    const ratio = avgLoss > 0 ? (avgWin / avgLoss) : (avgWin > 0 ? 99.9 : 0);
    tvAvgWinLossRatio.textContent = ratio === 99.9 ? "∞" : ratio.toFixed(2);
  }
}

export function renderTradeLog(trades, page = 1) {
  currentPage = page;
  const tbody = document.getElementById("tradeLogTbody");
  const paginationContainer = document.getElementById("logPagination");
  if (!tbody || !paginationContainer) return;

  tbody.innerHTML = "";

  // 1. Apply search filter first
  let filtered = [...trades];
  if (currentSearchQuery) {
    filtered = filtered.filter(t => 
      t.symbol.toLowerCase().includes(currentSearchQuery) ||
      (t.setup || "").toLowerCase().includes(currentSearchQuery) ||
      (t.notes || "").toLowerCase().includes(currentSearchQuery) ||
      (t.lessons || "").toLowerCase().includes(currentSearchQuery) ||
      (t.mistake || "").toLowerCase().includes(currentSearchQuery)
    );
  }

  // Update local trade log count badge with filtered count
  const logCount = document.getElementById("logTradeCount");
  if (logCount) {
    logCount.textContent = `${filtered.length} ${filtered.length === 1 ? "Trade" : "Trades"}`;
  }
  
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="14" class="empty-table-message">
          No trades logged matching active filters or search query.
        </td>
      </tr>
    `;
    paginationContainer.innerHTML = "";
    return;
  }

  const executedLosingTrades = filtered.filter(t => t.status === "executed" && calcNetPnl(t) < 0);
  const avgLoss = executedLosingTrades.length > 0 
    ? executedLosingTrades.reduce((sum, t) => sum + Math.abs(calcNetPnl(t)), 0) / executedLosingTrades.length 
    : 100;

  // 2. Apply column sorting
  const sortedTrades = filtered.sort((a, b) => {
    let valA, valB;
    if (currentSortField === "netPnl") {
      valA = calcNetPnl(a);
      valB = calcNetPnl(b);
    } else if (currentSortField === "pnlPercent") {
      valA = calcPnlPercent(a);
      valB = calcPnlPercent(b);
    } else if (currentSortField === "riskReward") {
      valA = calcRiskReward(a, avgLoss) || 0;
      valB = calcRiskReward(b, avgLoss) || 0;
    } else if (currentSortField === "duration") {
      const durA = calcDuration(a.entryDateTime, a.exitDateTime);
      const durB = calcDuration(b.entryDateTime, b.exitDateTime);
      valA = durA ? durA.totalMins : 0;
      valB = durB ? durB.totalMins : 0;
    } else {
      valA = a[currentSortField] || "";
      valB = b[currentSortField] || "";
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
    }
    
    if (valA < valB) return currentSortAscending ? -1 : 1;
    if (valA > valB) return currentSortAscending ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedTrades.length / tradesPerPage);
  const startIdx = (page - 1) * tradesPerPage;
  const paginatedTrades = sortedTrades.slice(startIdx, startIdx + tradesPerPage);

  paginatedTrades.forEach((t, index) => {
    const tradeNumber = filtered.length - (startIdx + index);
    const netPnl = calcNetPnl(t);
    const pnlPercent = calcPnlPercent(t);
    const rr = calcRiskReward(t, avgLoss);
    const durObj = calcDuration(t.entryDateTime, t.exitDateTime);

    const tr = document.createElement("tr");
    tr.className = "trade-row-main";
    tr.dataset.id = t.id;

    const pnlClass = netPnl > 0 ? "profit" : netPnl < 0 ? "loss" : "breakeven";
    const sign = netPnl > 0 ? "+" : "";

    const dateFormatted = new Date(t.exitDateTime).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "2-digit"
    });

    let slippageIcon = "";
    const hasSigEntry = t.signalEntryPrice !== null && t.signalEntryPrice !== undefined && t.signalEntryPrice !== "";
    const hasSigExit = t.signalExitPrice !== null && t.signalExitPrice !== undefined && t.signalExitPrice !== "";
    if (hasSigEntry || hasSigExit) {
      const sigEntry = hasSigEntry ? parseFloat(t.signalEntryPrice) : t.entryPrice;
      const sigExit = hasSigExit ? parseFloat(t.signalExitPrice) : t.exitPrice;
      const actEntry = t.entryPrice;
      const actExit = t.exitPrice;

      let entrySlippage = t.direction === "long" ? sigEntry - actEntry : actEntry - sigEntry;
      let exitSlippage = t.direction === "long" ? actExit - sigExit : sigExit - actExit;

      if ((hasSigEntry && entrySlippage < -0.01) || (hasSigExit && exitSlippage < -0.01)) {
        const actPnl = calcNetPnl(t);
        const sigPnl = calcSignalPnl(t);
        const totalSlippageDollar = actPnl - sigPnl;
        
        if (totalSlippageDollar < -0.01) {
          slippageIcon = ` <span class="slippage-warn-icon tooltip-trigger" data-tooltip="Negative slippage detected: ${formatCurrency(totalSlippageDollar)} (Worse execution than signal)"><i data-lucide="alert-triangle" style="width: 13px; height: 13px; color: #fbbf24; margin-left: 4px; vertical-align: middle;"></i></span>`;
        }
      }
    }

    const escapedSymbol = escapeHtml(t.symbol);
    const escapedSetup = escapeHtml(t.setup);
    const escapedNotes = escapeHtml(t.notes);
    const escapedLessons = escapeHtml(t.lessons);
    const escapedScreenshot = escapeHtml(t.screenshotUrl);

    tr.innerHTML = `
      <td><i data-lucide="chevron-right" class="row-expand-icon"></i></td>
      <td style="text-align: center; color: var(--text-secondary); font-size: 0.8125rem;">${tradeNumber}</td>
      <td>${dateFormatted}</td>
      <td class="bold">${escapedSymbol}${slippageIcon}</td>
      <td><span class="badge direction-${t.direction}">${t.direction.toUpperCase()}</span></td>
      <td>${t.qty}</td>
      <td>$${t.entryPrice.toFixed(2)}</td>
      <td>$${t.exitPrice.toFixed(2)}</td>
      <td>${rr ? `${rr.toFixed(2)}R` : "-"}</td>
      <td>${formatDuration(durObj)}</td>
      <td>$${t.fees.toFixed(2)}</td>
      <td class="bold ${pnlClass}">${sign}${formatCurrency(netPnl)}</td>
      <td class="bold ${pnlClass}">${formatPercent(pnlPercent)}</td>
      <td class="action-cell">
        <button class="btn-icon edit-trade-btn" title="Edit Trade"><i data-lucide="edit-2"></i></button>
        <button class="btn-icon delete-trade-btn" title="Delete Trade"><i data-lucide="trash-2"></i></button>
      </td>
    `;

    tbody.appendChild(tr);

    // Expandable row details
    const trDetail = document.createElement("tr");
    trDetail.className = "trade-row-detail hidden";
    trDetail.id = `detail-${t.id}`;
    
    let screenshotMarkup = "";
    const isSafeScreenshotUrl = t.screenshotUrl && (t.screenshotUrl.startsWith("http://") || t.screenshotUrl.startsWith("https://"));
    if (isSafeScreenshotUrl) {
      screenshotMarkup = `
        <div class="detail-screenshot-box">
          <span class="detail-label">Screenshot</span>
          <a href="${escapedScreenshot}" target="_blank" class="screenshot-thumbnail-link">
            <img src="${escapedScreenshot}" alt="Trade chart setup" class="screenshot-thumbnail" onerror="this.src='https://placehold.co/100x60?text=Invalid+Image'"/>
          </a>
        </div>
      `;
    }

    let comparisonMarkup = "";
    if (t.signalEntryPrice != null || t.signalExitPrice != null) {
      const sigEntry = t.signalEntryPrice != null ? t.signalEntryPrice : t.entryPrice;
      const sigExit = t.signalExitPrice != null ? t.signalExitPrice : t.exitPrice;
      const actEntry = t.entryPrice;
      const actExit = t.exitPrice;
      
      const sigPnl = calcSignalPnl(t);
      const actPnl = netPnl;
      const pnlDiff = sigPnl - actPnl;
      
      const sigPnlClass = sigPnl > 0 ? "profit" : sigPnl < 0 ? "loss" : "";
      const actPnlClass = actPnl > 0 ? "profit" : actPnl < 0 ? "loss" : "";
      
      const pnlDiffClass = pnlDiff < 0 ? "bg-pnl-cell-positive" : pnlDiff > 0 ? "bg-pnl-cell-negative" : "diff-neutral";
      const pnlDiffFormatted = pnlDiff === 0 ? "$0.00" : (pnlDiff < 0 ? `-$${Math.abs(pnlDiff).toFixed(2)}` : `+$${pnlDiff.toFixed(2)}`);
      
      // Calculate directional slippage (positive slippage means better execution than signal)
      let entrySlippage = 0;
      let exitSlippage = 0;
      if (t.direction === "long") {
        entrySlippage = sigEntry - actEntry;
        exitSlippage = actExit - sigExit;
      } else {
        entrySlippage = actEntry - sigEntry;
        exitSlippage = sigExit - actExit;
      }

      let entryClass = "slippage-neutral";
      let entryText = "$0.00";
      if (entrySlippage > 0.001) {
        entryClass = "slippage-positive";
        entryText = `+$${entrySlippage.toFixed(2)}`;
      } else if (entrySlippage < -0.001) {
        entryClass = "slippage-negative";
        entryText = `-$${Math.abs(entrySlippage).toFixed(2)}`;
      }

      let exitClass = "slippage-neutral";
      let exitText = "$0.00";
      if (exitSlippage > 0.001) {
        exitClass = "slippage-positive";
        exitText = `+$${exitSlippage.toFixed(2)}`;
      } else if (exitSlippage < -0.001) {
        exitClass = "slippage-negative";
        exitText = `-$${Math.abs(exitSlippage).toFixed(2)}`;
      }

      comparisonMarkup = `
        <div class="comparison-table-wrapper">
          <div class="comparison-title">
            <i data-lucide="cpu" style="width: 12px; height: 12px;"></i>
            Signal vs Actual Execution
          </div>
          <table class="comparison-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Signal</th>
                <th>Actual</th>
                <th>Diff (Slippage)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="bold">Entry Price</td>
                <td>$${sigEntry.toFixed(2)}</td>
                <td>$${actEntry.toFixed(2)}</td>
                <td class="${entryClass}">${entryText}</td>
              </tr>
              <tr>
                <td class="bold">Exit Price</td>
                <td>$${sigExit.toFixed(2)}</td>
                <td>$${actExit.toFixed(2)}</td>
                <td class="${exitClass}">${exitText}</td>
              </tr>
              <tr>
                <td class="bold">Net P&L</td>
                <td class="${sigPnlClass}">$${sigPnl.toFixed(2)}</td>
                <td class="${actPnlClass}">$${actPnl.toFixed(2)}</td>
                <td class="${pnlDiffClass}">${pnlDiffFormatted}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }

    trDetail.innerHTML = `
      <td colspan="14">
        <div class="trade-detail-grid">
          <div class="detail-notes-box">
            <span class="detail-label">Setup Tag</span>
            <span class="badge setup-badge">${escapedSetup || "No setup tag"}</span>
            <span class="badge asset-badge" style="background-color: rgba(59, 130, 246, 0.12); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.25); font-weight: 600; margin-left: 8px; font-size: 0.75rem; text-transform: uppercase;">${t.assetClass || "stocks"}</span>
            ${t.mistake ? `<span class="badge mistake-badge" style="background-color: rgba(239, 68, 68, 0.15); color: var(--loss); border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 600; margin-left: 8px;">MISTAKE: ${escapeHtml(t.mistake)}</span>` : ""}
            ${isRevengeTrade(t, AppState.trades) ? `<span class="badge revenge-badge" style="background-color: rgba(239, 68, 68, 0.2); color: var(--loss); border: 1px solid var(--loss-border); font-weight: 700; margin-left: 8px;"><i data-lucide="flame" style="width: 12px; height: 12px; vertical-align: text-bottom; margin-right: 4px;"></i>REVENGE RISK</span>` : ""}
            <div class="notes-content">
              <span class="detail-label">Trading Notes</span>
              <p>${escapedNotes || "No notes recorded for this trade."}</p>
            </div>
          </div>
          <div class="detail-lessons-box">
            <span class="detail-label">Lessons / Reflections</span>
            <p>${escapedLessons || "No lessons recorded for this trade."}</p>
            ${comparisonMarkup}
          </div>
          <div class="detail-checklist-box" style="background: var(--bg-input); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; height: fit-content;">
            <span class="detail-label" style="margin-bottom: 0;">Discipline Checklist</span>
            <div style="font-size: 1.25rem; font-weight: 700; color: ${(t.adherenceScore != null ? t.adherenceScore : 100) >= 80 ? 'var(--profit)' : (t.adherenceScore != null ? t.adherenceScore : 100) >= 40 ? '#eab308' : 'var(--loss)'}; margin-bottom: 4px;">
              ${t.adherenceScore != null ? t.adherenceScore + '%' : '100%'}
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8125rem; border-bottom: 1px solid var(--border); padding-bottom: 4px;">
                <span>Trend Aligned:</span>
                <span class="bold" style="color: ${!t.checklistItems || t.checklistItems.trend ? 'var(--profit)' : 'var(--loss)'}">${!t.checklistItems || t.checklistItems.trend ? 'Yes' : 'No'}</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8125rem; border-bottom: 1px solid var(--border); padding-bottom: 4px;">
                <span>Key Level:</span>
                <span class="bold" style="color: ${!t.checklistItems || t.checklistItems.level ? 'var(--profit)' : 'var(--loss)'}">${!t.checklistItems || t.checklistItems.level ? 'Yes' : 'No'}</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8125rem; border-bottom: 1px solid var(--border); padding-bottom: 4px;">
                <span>Volume Conf:</span>
                <span class="bold" style="color: ${!t.checklistItems || t.checklistItems.volume ? 'var(--profit)' : 'var(--loss)'}">${!t.checklistItems || t.checklistItems.volume ? 'Yes' : 'No'}</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8125rem; border-bottom: 1px solid var(--border); padding-bottom: 4px;">
                <span>Entry Trigger:</span>
                <span class="bold" style="color: ${!t.checklistItems || t.checklistItems.trigger ? 'var(--profit)' : 'var(--loss)'}">${!t.checklistItems || t.checklistItems.trigger ? 'Yes' : 'No'}</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8125rem;">
                <span>Risk Planned:</span>
                <span class="bold" style="color: ${!t.checklistItems || t.checklistItems.risk ? 'var(--profit)' : 'var(--loss)'}">${!t.checklistItems || t.checklistItems.risk ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>
          ${screenshotMarkup}
        </div>
      </td>
    `;
    tbody.appendChild(trDetail);
  });

  // Render Lucide icons in table
  lucide.createIcons({
    attrs: { class: "lucide" },
    nameAttr: "data-lucide",
    root: tbody
  });

  // Render pagination controls
  renderPagination(totalPages, currentPage, paginationContainer);
}

function renderPagination(totalPages, activePage, container) {
  container.innerHTML = "";
  if (totalPages <= 1) return;

  const prevBtn = document.createElement("button");
  prevBtn.className = `btn btn-sm ${activePage === 1 ? "disabled" : ""}`;
  prevBtn.innerHTML = `<i data-lucide="chevron-left"></i>`;
  prevBtn.disabled = activePage === 1;
  prevBtn.addEventListener("click", () => renderTradeLog(AppState.getFilteredTrades(), activePage - 1));
  container.appendChild(prevBtn);

  for (let i = 1; i <= totalPages; i++) {
    const pageBtn = document.createElement("button");
    pageBtn.className = `btn btn-sm ${activePage === i ? "btn-accent" : "btn-secondary"}`;
    pageBtn.textContent = i;
    pageBtn.addEventListener("click", () => renderTradeLog(AppState.getFilteredTrades(), i));
    container.appendChild(pageBtn);
  }

  const nextBtn = document.createElement("button");
  nextBtn.className = `btn btn-sm ${activePage === totalPages ? "disabled" : ""}`;
  nextBtn.innerHTML = `<i data-lucide="chevron-right"></i>`;
  nextBtn.disabled = activePage === totalPages;
  nextBtn.addEventListener("click", () => renderTradeLog(AppState.getFilteredTrades(), activePage + 1));
  container.appendChild(nextBtn);

  lucide.createIcons({ attrs: { class: "lucide-pagination" } });
}

export function openTradeModal(id = null) {
  currentEditId = id;
  const modal = document.getElementById("tradeModal");
  const title = document.getElementById("tradeModalTitle");
  const form = document.getElementById("tradeForm");
  
  if (!modal || !form) return;

  form.reset();
  document.getElementById("tradeAssetClass").value = "stocks";
  currentDirection = "long";
  currentStatus = "executed";
  document.getElementById("overridePnlToggle").checked = false;
  document.getElementById("tradeManualPnl").value = "";
  document.getElementById("tradeHasIntervention").checked = false;
  document.getElementById("tradeIntervention").value = "early_profit";
  document.getElementById("tradeMaxPrice").value = "";
  document.getElementById("tradeMinPrice").value = "";
  
  // Reset checklist elements
  const chkItems = ["chkTrend", "chkLevel", "chkVolume", "chkTrigger", "chkRisk"];
  chkItems.forEach(chkId => {
    const el = document.getElementById(chkId);
    if (el) el.checked = false;
  });
  const liveAdherence = document.getElementById("liveAdherenceScore");
  if (liveAdherence) liveAdherence.textContent = "0%";

  updateOverridePnlUI();
  updateDirectionUI();
  updateStatusUI();

  if (id) {
    title.textContent = "Edit Trade";
    const trade = AppState.trades.find(t => t.id === id);
    console.log("openTradeModal: Editing ID =", id, "Found trade =", trade);
    if (trade) {
      document.getElementById("tradeSymbol").value = trade.symbol;
      currentDirection = trade.direction;
      updateDirectionUI();
      document.getElementById("tradeEntryDateTime").value = trade.entryDateTime;
      document.getElementById("tradeExitDateTime").value = trade.exitDateTime;
      document.getElementById("tradeEntryPrice").value = trade.entryPrice;
      document.getElementById("tradeExitPrice").value = trade.exitPrice;
      document.getElementById("tradeQty").value = trade.qty;
      document.getElementById("tradeStopLoss").value = trade.stopLoss || "";
      document.getElementById("tradeFees").value = trade.fees;
      document.getElementById("tradeSetup").value = trade.setup;
      document.getElementById("tradeNotes").value = trade.notes;
      document.getElementById("tradeLessons").value = trade.lessons;
      document.getElementById("tradeScreenshotUrl").value = trade.screenshotUrl;
      document.getElementById("tradeSignalEntryPrice").value = trade.signalEntryPrice || "";
      document.getElementById("tradeSignalExitPrice").value = trade.signalExitPrice || "";
      document.getElementById("tradeMistake").value = trade.mistake || "";
      document.getElementById("tradeAssetClass").value = trade.assetClass || "stocks";
      currentStatus = trade.status || "executed";
      document.getElementById("overridePnlToggle").checked = trade.overridePnl || false;
      document.getElementById("tradeManualPnl").value = trade.manualPnl != null ? trade.manualPnl : "";
      document.getElementById("tradeMaxPrice").value = trade.maxPrice != null ? trade.maxPrice : "";
      document.getElementById("tradeMinPrice").value = trade.minPrice != null ? trade.minPrice : "";
      
      const hasInt = trade.interventionType && trade.interventionType !== "followed";
      document.getElementById("tradeHasIntervention").checked = hasInt;
      document.getElementById("tradeIntervention").value = hasInt ? trade.interventionType : (trade.status === "skipped" ? "skipped_invalid" : "early_profit");
      
      if (trade.checklistItems) {
        document.getElementById("chkTrend").checked = !!trade.checklistItems.trend;
        document.getElementById("chkLevel").checked = !!trade.checklistItems.level;
        document.getElementById("chkVolume").checked = !!trade.checklistItems.volume;
        document.getElementById("chkTrigger").checked = !!trade.checklistItems.trigger;
        document.getElementById("chkRisk").checked = !!trade.checklistItems.risk;
      }
      const score = trade.adherenceScore != null ? trade.adherenceScore : 0;
      const liveAdherenceEl = document.getElementById("liveAdherenceScore");
      if (liveAdherenceEl) liveAdherenceEl.textContent = `${score}%`;
      
      updateOverridePnlUI();
      updateDirectionUI();
      updateStatusUI();
      updateInterventionUI();
    }
  } else {
    title.textContent = "Add New Trade";
    // Set default exit date/time to current and entry to 30 mins ago
    const now = new Date();
    // Offset local datetime string
    const formatDateTimeLocal = (date) => {
      const pad = (num) => String(num).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };
    
    document.getElementById("tradeExitDateTime").value = formatDateTimeLocal(now);
    const entryDate = new Date(now.getTime() - 30 * 60000);
    document.getElementById("tradeEntryDateTime").value = formatDateTimeLocal(entryDate);
    document.getElementById("tradeFees").value = AppState.settings.defaultFees || "0.00";
    document.getElementById("tradeSignalEntryPrice").value = "";
    document.getElementById("tradeSignalExitPrice").value = "";
    document.getElementById("tradeMistake").value = "";
  }

  updateLiveCalc();
  modal.classList.add("open");
}

export function closeTradeModal() {
  const modal = document.getElementById("tradeModal");
  if (modal) modal.classList.remove("open");
  currentEditId = null;
}

export function updateDirectionUI() {
  const longBtn = document.getElementById("directionLongBtn");
  const shortBtn = document.getElementById("directionShortBtn");

  if (!longBtn || !shortBtn) return;

  if (currentDirection === "long") {
    longBtn.classList.add("active");
    shortBtn.classList.remove("active");
  } else {
    shortBtn.classList.add("active");
    longBtn.classList.remove("active");
  }
}

export function updateStatusUI() {
  const execBtn = document.getElementById("statusExecutedBtn");
  const skipBtn = document.getElementById("statusSkippedBtn");
  if (!execBtn || !skipBtn) return;

  const entryPriceInput = document.getElementById("tradeEntryPrice");
  const exitPriceInput = document.getElementById("tradeExitPrice");
  const feesInput = document.getElementById("tradeFees");
  const signalEntryInput = document.getElementById("tradeSignalEntryPrice");
  const signalExitInput = document.getElementById("tradeSignalExitPrice");

  if (currentStatus === "executed") {
    execBtn.classList.add("active");
    skipBtn.classList.remove("active");
    
    entryPriceInput.disabled = false;
    exitPriceInput.disabled = false;
    feesInput.disabled = false;
    
    // Check if overridden to toggle required
    const toggle = document.getElementById("overridePnlToggle");
    const isOverridden = toggle ? toggle.checked : false;
    entryPriceInput.required = !isOverridden;
    exitPriceInput.required = !isOverridden;
  } else {
    skipBtn.classList.add("active");
    execBtn.classList.remove("active");
    
    entryPriceInput.disabled = true;
    exitPriceInput.disabled = true;
    feesInput.disabled = true;

    // Zero out actual values since skipped trades have no real entries/exits
    entryPriceInput.value = "0.00";
    exitPriceInput.value = "0.00";
    feesInput.value = "0.00";
  }

  updateInterventionOptionsUI();
  updateInterventionUI();
}

export function updateInterventionUI() {
  const checkbox = document.getElementById("tradeHasIntervention");
  const actionGroup = document.getElementById("interventionActionGroup");
  const select = document.getElementById("tradeIntervention");
  if (!checkbox || !actionGroup || !select) return;

  if (currentStatus === "skipped") {
    checkbox.checked = true;
    checkbox.disabled = true;
  } else {
    checkbox.disabled = false;
  }

  if (checkbox.checked) {
    actionGroup.classList.remove("hidden");
  } else {
    actionGroup.classList.add("hidden");
  }
}

export function updateInterventionOptionsUI() {
  const select = document.getElementById("tradeIntervention");
  if (!select) return;

  for (let i = 0; i < select.options.length; i++) {
    const opt = select.options[i];
    const isSkippedOpt = opt.value.startsWith("skipped");
    
    if (currentStatus === "skipped") {
      opt.disabled = !isSkippedOpt;
      opt.style.display = isSkippedOpt ? "block" : "none";
    } else {
      opt.disabled = isSkippedOpt;
      opt.style.display = isSkippedOpt ? "none" : "block";
    }
  }

  // Set default if current value is disabled or incompatible
  if (currentStatus === "skipped" && !select.value.startsWith("skipped")) {
    select.value = "skipped_invalid";
  } else if (currentStatus === "executed" && select.value.startsWith("skipped")) {
    select.value = "early_profit";
  }
}

export function updateOverridePnlUI() {
  const toggle = document.getElementById("overridePnlToggle");
  const container = document.getElementById("manualPnlContainer");
  const manualPnlInput = document.getElementById("tradeManualPnl");
  const entryPriceInput = document.getElementById("tradeEntryPrice");
  const exitPriceInput = document.getElementById("tradeExitPrice");

  if (!toggle || !container || !manualPnlInput) return;

  if (toggle.checked) {
    container.classList.remove("hidden");
    manualPnlInput.required = true;
    
    // Remove required from entry/exit prices
    if (entryPriceInput) entryPriceInput.required = false;
    if (exitPriceInput) exitPriceInput.required = false;
  } else {
    container.classList.add("hidden");
    manualPnlInput.required = false;
    manualPnlInput.value = "";

    // Restore required to entry/exit prices if status is executed
    if (currentStatus === "executed") {
      if (entryPriceInput) entryPriceInput.required = true;
      if (exitPriceInput) exitPriceInput.required = true;
    }
  }
}

export function updateLiveCalc() {
  const symbol = (document.getElementById("tradeSymbol").value || "").toUpperCase();
  const entryPrice = parseFloat(document.getElementById("tradeEntryPrice").value) || 0;
  const exitPrice = parseFloat(document.getElementById("tradeExitPrice").value) || 0;
  const qty = parseFloat(document.getElementById("tradeQty").value) || 0;
  const stopLoss = parseFloat(document.getElementById("tradeStopLoss").value) || null;
  const fees = parseFloat(document.getElementById("tradeFees").value) || 0;
  const entryDate = document.getElementById("tradeEntryDateTime").value;
  const exitDate = document.getElementById("tradeExitDateTime").value;
  const assetClass = document.getElementById("tradeAssetClass").value;

  const overridePnlToggle = document.getElementById("overridePnlToggle");
  const overridePnl = overridePnlToggle ? overridePnlToggle.checked : false;
  const manualPnl = parseFloat(document.getElementById("tradeManualPnl").value) || 0;

  const maxPriceVal = document.getElementById("tradeMaxPrice")?.value;
  const minPriceVal = document.getElementById("tradeMinPrice")?.value;

  const mockTrade = {
    symbol,
    direction: currentDirection,
    status: currentStatus,
    entryPrice,
    exitPrice,
    qty,
    stopLoss,
    fees,
    entryDateTime: entryDate,
    exitDateTime: exitDate,
    assetClass,
    overridePnl,
    manualPnl,
    maxPrice: maxPriceVal ? parseFloat(maxPriceVal) : null,
    minPrice: minPriceVal ? parseFloat(minPriceVal) : null
  };

  const liveGrossEl = document.getElementById("liveGrossPnl");
  const liveNetEl = document.getElementById("liveNetPnl");
  const livePnlPctEl = document.getElementById("livePnlPercent");
  const liveRrEl = document.getElementById("liveRiskReward");
  const liveDurationEl = document.getElementById("liveDuration");
  const liveSignalPnlEl = document.getElementById("liveSignalPnl");
  const liveSignalDiffEl = document.getElementById("liveSignalDiff");

  if (!liveGrossEl) return;

  // P&L computations with correct contract multipliers
  const multiplier = getSymbolMultiplier(symbol, assetClass);
  const directionMultiplier = currentDirection === "long" ? 1 : -1;
  
  const net = calcNetPnl(mockTrade);
  const gross = overridePnl ? net + fees : (currentStatus === "skipped" ? 0 : (exitPrice - entryPrice) * qty * multiplier * directionMultiplier);
  const pct = calcPnlPercent(mockTrade);
  
  const rr = calcRiskReward(mockTrade);
  const duration = calcDuration(entryDate, exitDate);

  // Render live panel
  liveGrossEl.textContent = formatCurrency(gross);
  liveGrossEl.className = `live-math-val ${gross > 0 ? "profit" : gross < 0 ? "loss" : ""}`;

  liveNetEl.textContent = formatCurrency(net);
  liveNetEl.className = `bold ${net > 0 ? "profit" : net < 0 ? "loss" : ""}`;

  livePnlPctEl.textContent = formatPercent(pct);
  livePnlPctEl.className = `live-math-val ${pct > 0 ? "profit" : pct < 0 ? "loss" : ""}`;

  liveRrEl.textContent = rr ? `${rr.toFixed(2)} R` : "-";
  liveDurationEl.textContent = formatDuration(duration);

  // Signal live updates
  const signalEntry = parseFloat(document.getElementById("tradeSignalEntryPrice").value);
  const signalExit = parseFloat(document.getElementById("tradeSignalExitPrice").value);

  if (!isNaN(signalEntry) || !isNaN(signalExit)) {
    const mockTradeWithSignal = {
      ...mockTrade,
      signalEntryPrice: isNaN(signalEntry) ? null : signalEntry,
      signalExitPrice: isNaN(signalExit) ? null : signalExit
    };

    const sPnl = calcSignalPnl(mockTradeWithSignal);
    const diff = calcPnlDiff(sPnl, net);

    if (liveSignalPnlEl) {
      liveSignalPnlEl.textContent = formatCurrency(sPnl);
      liveSignalPnlEl.className = `live-math-val ${sPnl > 0 ? "profit" : sPnl < 0 ? "loss" : ""}`;
    }

    if (liveSignalDiffEl) {
      liveSignalDiffEl.textContent = formatCurrency(diff);
      // diff > 0 means Actual P&L is greater than Signal P&L (saved money / beat the signal)
      liveSignalDiffEl.className = `live-math-val ${diff > 0 ? "profit" : diff < 0 ? "loss" : ""}`;
    }
  } else {
    if (liveSignalPnlEl) {
      liveSignalPnlEl.textContent = "-";
      liveSignalPnlEl.className = "live-math-val";
    }
    if (liveSignalDiffEl) {
      liveSignalDiffEl.textContent = "-";
      liveSignalDiffEl.className = "live-math-val";
    }
  }
}

export function openSettingsModal() {
  const modal = document.getElementById("settingsModal");
  if (!modal) return;

  document.getElementById("startingBalanceInput").value = AppState.settings.startingBalance;
  document.getElementById("defaultFeesInput").value = AppState.settings.defaultFees;

  updateStorageIndicator();
  modal.classList.add("open");
}

export function closeSettingsModal() {
  const modal = document.getElementById("settingsModal");
  if (modal) modal.classList.remove("open");
}

function updateStorageIndicator() {
  const usage = AppState.getStorageUsage();
  const progressBar = document.getElementById("storageUsageBar");
  const label = document.getElementById("storageUsageLabel");

  if (!progressBar || !label) return;

  progressBar.style.width = `${usage.percentage}%`;
  label.textContent = `${(usage.bytesUsed / 1024).toFixed(1)} KB used of 5 MB (${usage.percentage.toFixed(2)}%)`;

  if (usage.percentage > 80) {
    progressBar.style.backgroundColor = "var(--loss)";
  } else {
    progressBar.style.backgroundColor = "var(--accent)";
  }
}

export function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let iconName = "info";
  if (type === "success") iconName = "check-circle";
  if (type === "error") iconName = "alert-triangle";
  if (type === "warning") iconName = "alert-circle";

  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  // Animation show
  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  // Auto remove
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

// Setup Form listeners and DOM binds
export function setupUIListeners() {
  // Modal toggle links
  const addNewTradeBtn = document.getElementById("addNewTradeBtn");
  const closeTradeModalBtn = document.getElementById("closeTradeModalBtn");
  const cancelTradeBtn = document.getElementById("cancelTradeBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const cancelSettingsBtn = document.getElementById("cancelSettingsBtn");

  if (addNewTradeBtn) addNewTradeBtn.addEventListener("click", () => openTradeModal());
  if (closeTradeModalBtn) closeTradeModalBtn.addEventListener("click", closeTradeModal);
  if (cancelTradeBtn) cancelTradeBtn.addEventListener("click", closeTradeModal);
  
  if (settingsBtn) settingsBtn.addEventListener("click", openSettingsModal);
  if (closeSettingsBtn) closeSettingsBtn.addEventListener("click", closeSettingsModal);
  if (cancelSettingsBtn) cancelSettingsBtn.addEventListener("click", closeSettingsModal);

  // Overlay click logic (close modal when clicking outside)
  const addTradeModal = document.getElementById("addTradeModal");
  const settingsModal = document.getElementById("settingsModal");
  if (addTradeModal) {
    addTradeModal.addEventListener("click", (e) => {
      if (e.target === addTradeModal) closeTradeModal();
    });
  }
  if (settingsModal) {
    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) closeSettingsModal();
    });
  }

  // Share Calendar Exporter
  const shareCalendarBtn = document.getElementById("shareCalendarBtn");
  if (shareCalendarBtn) {
    shareCalendarBtn.addEventListener("click", () => {
      const wrapper = document.querySelector(".calendar-wrapper");
      if (!wrapper) return;

      // Hide the share button during snapshot to avoid clutter
      shareCalendarBtn.style.visibility = "hidden";

      // Determine background color based on theme
      const bgColor = getComputedStyle(document.body).getPropertyValue("--bg-dashboard").trim() || "#0c0c0e";

      html2canvas(wrapper, {
        backgroundColor: bgColor,
        scale: 2, // High resolution export
        useCORS: true,
        logging: false
      }).then(canvas => {
        const link = document.createElement("a");
        const monthLabel = document.getElementById("calendarMonthLabel")?.textContent || "monthly";
        const formattedLabel = monthLabel.toLowerCase().replace(/\s+/g, "-");
        link.download = `trading-calendar-${formattedLabel}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        showToast("Calendar captured and downloaded successfully!", "success");
      }).catch(err => {
        showToast("Failed to export calendar: " + err.message, "error");
      }).finally(() => {
        shareCalendarBtn.style.visibility = "visible";
      });
    });
  }

  // Account Switcher selector
  const accountSelector = document.getElementById("accountSelector");
  if (accountSelector) {
    accountSelector.addEventListener("change", (e) => {
      const selected = e.target.value;
      if (selected === "__ADD_NEW__") {
        const name = prompt("Enter the name for your new trading account:");
        if (name && name.trim()) {
          try {
            AppState.addAccount(name.trim());
            populateAccountSelector();
            showToast(`Created and switched to account: ${name.trim()}`, "success");
          } catch (err) {
            showToast(err.message, "error");
            accountSelector.value = AppState.settings.currentAccount || "Personal";
          }
        } else {
          accountSelector.value = AppState.settings.currentAccount || "Personal";
        }
        return;
      }
      
      const accConfig = AppState.settings.accounts?.[selected] || { startingBalance: 25000, defaultFees: 0 };
      AppState.updateSettings({
        currentAccount: selected,
        startingBalance: accConfig.startingBalance,
        defaultFees: accConfig.defaultFees
      });
      showToast(`Switched to ${selected} Account.`, "success");
    });
  }

  // Direction toggle buttons
  const longBtn = document.getElementById("directionLongBtn");
  const shortBtn = document.getElementById("directionShortBtn");

  if (longBtn && shortBtn) {
    longBtn.addEventListener("click", () => {
      currentDirection = "long";
      updateDirectionUI();
      updateLiveCalc();
    });
    shortBtn.addEventListener("click", () => {
      currentDirection = "short";
      updateDirectionUI();
      updateLiveCalc();
    });
  }

  // Status toggle buttons
  const statusExecutedBtn = document.getElementById("statusExecutedBtn");
  const statusSkippedBtn = document.getElementById("statusSkippedBtn");

  if (statusExecutedBtn && statusSkippedBtn) {
    statusExecutedBtn.addEventListener("click", () => {
      currentStatus = "executed";
      updateStatusUI();
      updateLiveCalc();
    });
    statusSkippedBtn.addEventListener("click", () => {
      currentStatus = "skipped";
      updateStatusUI();
      updateLiveCalc();
    });
  }

  // Live calculation trigger inputs
  const liveInputs = [
    "tradeSymbol", "tradeEntryPrice", "tradeExitPrice", "tradeQty", 
    "tradeStopLoss", "tradeFees", "tradeEntryDateTime", "tradeExitDateTime",
    "tradeSignalEntryPrice", "tradeSignalExitPrice", "tradeAssetClass",
    "tradeManualPnl", "tradeIntervention", "tradeMaxPrice", "tradeMinPrice"
  ];
  liveInputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener("input", updateLiveCalc);
      input.addEventListener("change", updateLiveCalc);
    }
  });

  const overridePnlToggle = document.getElementById("overridePnlToggle");
  if (overridePnlToggle) {
    overridePnlToggle.addEventListener("change", () => {
      updateOverridePnlUI();
      updateLiveCalc();
    });
  }

  const tradeHasIntervention = document.getElementById("tradeHasIntervention");
  if (tradeHasIntervention) {
    tradeHasIntervention.addEventListener("change", () => {
      updateInterventionUI();
      updateLiveCalc();
    });
  }

  // Checklist live updates listener
  const chkItems = ["chkTrend", "chkLevel", "chkVolume", "chkTrigger", "chkRisk"];
  const liveScoreEl = document.getElementById("liveAdherenceScore");
  function updateLiveAdherence() {
    let checked = 0;
    chkItems.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.checked) checked++;
    });
    const score = Math.round((checked / 5) * 100);
    if (liveScoreEl) liveScoreEl.textContent = `${score}%`;
  }
  chkItems.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", updateLiveAdherence);
  });

  // Trade Form submit
  const form = document.getElementById("tradeForm");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      
      const isOverridden = document.getElementById("overridePnlToggle").checked;
      
      const checklistItems = {
        trend: document.getElementById("chkTrend").checked,
        level: document.getElementById("chkLevel").checked,
        volume: document.getElementById("chkVolume").checked,
        trigger: document.getElementById("chkTrigger").checked,
        risk: document.getElementById("chkRisk").checked
      };
      const checkedCount = Object.values(checklistItems).filter(Boolean).length;
      const adherenceScore = Math.round((checkedCount / 5) * 100);

      const entryPriceVal = parseFloat(document.getElementById("tradeEntryPrice").value) || 0;
      const exitPriceVal = parseFloat(document.getElementById("tradeExitPrice").value) || 0;
      const qtyVal = parseFloat(document.getElementById("tradeQty").value) || 0;
      const feesVal = parseFloat(document.getElementById("tradeFees").value) || 0;
      const assetClassVal = document.getElementById("tradeAssetClass").value;
      const symbolVal = document.getElementById("tradeSymbol").value;
      const maxPriceVal = document.getElementById("tradeMaxPrice").value ? parseFloat(document.getElementById("tradeMaxPrice").value) : null;
      const minPriceVal = document.getElementById("tradeMinPrice").value ? parseFloat(document.getElementById("tradeMinPrice").value) : null;

      let mfe = null;
      let mae = null;

      if (qtyVal > 0 && entryPriceVal > 0 && currentStatus === "executed") {
        let mult = getSymbolMultiplier(symbolVal, assetClassVal);
        if (isOverridden) {
          const manualPnl = parseFloat(document.getElementById("tradeManualPnl").value) || 0;
          const directionMultiplier = currentDirection === "short" ? -1 : 1;
          const priceDiff = (exitPriceVal - entryPriceVal) * directionMultiplier;
          if (!isNaN(priceDiff) && priceDiff !== 0) {
            mult = Math.abs((manualPnl + feesVal) / (priceDiff * qtyVal));
          }
        }

        if (maxPriceVal !== null && !isNaN(maxPriceVal)) {
          const maxVal = Math.max(maxPriceVal, entryPriceVal, exitPriceVal);
          const diff = maxVal - entryPriceVal;
          if (currentDirection === "long") {
            mfe = diff * qtyVal * mult;
          } else {
            mae = diff * qtyVal * mult;
          }
        }

        if (minPriceVal !== null && !isNaN(minPriceVal)) {
          const minVal = Math.min(minPriceVal, entryPriceVal, exitPriceVal);
          const diff = entryPriceVal - minVal;
          if (currentDirection === "long") {
            mae = diff * qtyVal * mult;
          } else {
            mfe = diff * qtyVal * mult;
          }
        }
      }

      const tradeData = {
        symbol: symbolVal,
        direction: currentDirection,
        entryDateTime: document.getElementById("tradeEntryDateTime").value,
        exitDateTime: document.getElementById("tradeExitDateTime").value,
        entryPrice: entryPriceVal,
        exitPrice: exitPriceVal,
        qty: qtyVal,
        stopLoss: document.getElementById("tradeStopLoss").value ? parseFloat(document.getElementById("tradeStopLoss").value) : null,
        fees: feesVal,
        setup: document.getElementById("tradeSetup").value,
        notes: document.getElementById("tradeNotes").value,
        lessons: document.getElementById("tradeLessons").value,
        screenshotUrl: document.getElementById("tradeScreenshotUrl").value,
        signalEntryPrice: document.getElementById("tradeSignalEntryPrice").value ? parseFloat(document.getElementById("tradeSignalEntryPrice").value) : null,
        signalExitPrice: document.getElementById("tradeSignalExitPrice").value ? parseFloat(document.getElementById("tradeSignalExitPrice").value) : null,
        mistake: document.getElementById("tradeMistake").value,
        assetClass: assetClassVal,
        status: currentStatus,
        overridePnl: isOverridden,
        manualPnl: isOverridden ? parseFloat(document.getElementById("tradeManualPnl").value) || 0 : null,
        interventionType: document.getElementById("tradeHasIntervention").checked ? document.getElementById("tradeIntervention").value : "followed",
        maxPrice: maxPriceVal,
        minPrice: minPriceVal,
        mfe: mfe,
        mae: mae,
        checklistItems,
        adherenceScore
      };

      if (!tradeData.symbol) {
        showToast("Symbol is required.", "error");
        return;
      }
      if (tradeData.status === "executed") {
        if (!tradeData.overridePnl) {
          if (isNaN(tradeData.entryPrice) || tradeData.entryPrice <= 0) {
            showToast("Valid Entry Price is required.", "error");
            return;
          }
          if (isNaN(tradeData.exitPrice) || tradeData.exitPrice <= 0) {
            showToast("Valid Exit Price is required.", "error");
            return;
          }
        } else {
          if (isNaN(tradeData.manualPnl)) {
            showToast("Valid Manual P&L is required when override is active.", "error");
            return;
          }
        }
      } else {
        if (isNaN(tradeData.signalEntryPrice) || tradeData.signalEntryPrice <= 0) {
          showToast("Valid Signal Entry Price is required for skipped trades.", "error");
          return;
        }
        if (isNaN(tradeData.signalExitPrice) || tradeData.signalExitPrice <= 0) {
          showToast("Valid Signal Exit Price is required for skipped trades.", "error");
          return;
        }
      }
      if (isNaN(tradeData.qty) || tradeData.qty <= 0) {
        showToast("Valid Quantity is required.", "error");
        return;
      }
      if (new Date(tradeData.exitDateTime) < new Date(tradeData.entryDateTime)) {
        showToast("Exit date/time must be after entry date/time.", "error");
        return;
      }

      console.log("Form submit: currentEditId =", currentEditId, "tradeData =", tradeData);
      try {
        // Automatically switch Status filter to match the saved trade so it is instantly visible
        const currentFilterStatus = AppState.activeFilters.status || "executed";
        if (currentFilterStatus !== "all" && currentFilterStatus !== tradeData.status) {
          AppState.activeFilters.status = tradeData.status;
          const statusSelector = document.getElementById("filterStatus");
          if (statusSelector) {
            statusSelector.value = tradeData.status;
          }
        }

        if (currentEditId) {
          AppState.updateTrade(currentEditId, tradeData);
          showToast("Trade updated successfully.", "success");
        } else {
          AppState.addTrade(tradeData);
          showToast("Trade added successfully.", "success");
        }
        closeTradeModal();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  }

  // Settings form submit
  const settingsForm = document.getElementById("settingsForm");
  if (settingsForm) {
    settingsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const startingBalance = parseFloat(document.getElementById("startingBalanceInput").value);
      const defaultFees = parseFloat(document.getElementById("defaultFeesInput").value) || 0;

      if (isNaN(startingBalance) || startingBalance < 0) {
        showToast("Valid Starting Balance is required.", "error");
        return;
      }

      try {
        const activeAcc = AppState.settings.currentAccount || "Personal";
        const accounts = { ...AppState.settings.accounts };
        accounts[activeAcc] = { startingBalance, defaultFees };
        AppState.updateSettings({ startingBalance, defaultFees, accounts });
        showToast("Settings updated successfully.", "success");
        closeSettingsModal();
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  }

  // Clear data danger buttons
  const clearCurrentAccountTradesBtn = document.getElementById("clearCurrentAccountTradesBtn");
  if (clearCurrentAccountTradesBtn) {
    clearCurrentAccountTradesBtn.addEventListener("click", () => {
      const activeAcc = AppState.settings.currentAccount || "Personal";
      if (confirm(`Are you sure you want to permanently delete all trades for the "${activeAcc}" account? This cannot be undone.`)) {
        AppState.clearCurrentAccountTrades();
        showToast(`Cleared trades for ${activeAcc} account.`, "warning");
        closeSettingsModal();
      }
    });
  }

  const deleteCurrentAccountBtn = document.getElementById("deleteCurrentAccountBtn");
  if (deleteCurrentAccountBtn) {
    deleteCurrentAccountBtn.addEventListener("click", () => {
      const activeAcc = AppState.settings.currentAccount || "Personal";
      if (confirm(`WARNING: This will permanently delete the "${activeAcc}" account and all its trade history. This cannot be undone! Are you absolutely sure?`)) {
        try {
          AppState.deleteCurrentAccount();
          populateAccountSelector();
          showToast(`Deleted account: ${activeAcc}`, "warning");
          closeSettingsModal();
        } catch (err) {
          showToast(err.message, "error");
        }
      }
    });
  }

  const dangerClearDataBtn = document.getElementById("dangerClearDataBtn");
  if (dangerClearDataBtn) {
    dangerClearDataBtn.addEventListener("click", () => {
      if (confirm("WARNING: This will permanently delete all trades and reset your account settings. This action cannot be undone! Are you absolutely sure?")) {
        AppState.clearAllData();
        showToast("All data cleared successfully.", "warning");
        closeSettingsModal();
      }
    });
  }

  // Date picker event handlers for date filter
  const filterDatePreset = document.getElementById("filterDatePreset");
  const customDateRange = document.getElementById("customDateRange");
  const filterStartDate = document.getElementById("filterStartDate");
  const filterEndDate = document.getElementById("filterEndDate");

  if (filterDatePreset) {
    filterDatePreset.addEventListener("change", (e) => {
      const preset = e.target.value;
      if (preset === "custom") {
        customDateRange.classList.remove("hidden");
      } else {
        customDateRange.classList.add("hidden");
        AppState.setFilters({ datePreset: preset });
      }
    });
  }

  const applyCustomDateFilter = () => {
    const start = filterStartDate.value;
    const end = filterEndDate.value;
    AppState.setFilters({ 
      datePreset: "custom", 
      startDate: start || null, 
      endDate: end || null 
    });
  };

  if (filterStartDate) filterStartDate.addEventListener("change", applyCustomDateFilter);
  if (filterEndDate) filterEndDate.addEventListener("change", applyCustomDateFilter);

  // General Filter fields
  const filterSymbol = document.getElementById("filterSymbol");
  const filterDirection = document.getElementById("filterDirection");
  const filterAssetClass = document.getElementById("filterAssetClass");
  const filterStatus = document.getElementById("filterStatus");
  const filterOutcome = document.getElementById("filterOutcome");
  const filterSetup = document.getElementById("filterSetup");

  if (filterSymbol) {
    filterSymbol.addEventListener("input", (e) => {
      AppState.setFilters({ symbol: e.target.value });
    });
  }
  if (filterDirection) {
    filterDirection.addEventListener("change", (e) => {
      AppState.setFilters({ direction: e.target.value });
    });
  }
  if (filterAssetClass) {
    filterAssetClass.addEventListener("change", (e) => {
      AppState.setFilters({ assetClass: e.target.value });
    });
  }
  if (filterStatus) {
    filterStatus.addEventListener("change", (e) => {
      AppState.setFilters({ status: e.target.value });
    });
  }
  if (filterOutcome) {
    filterOutcome.addEventListener("change", (e) => {
      AppState.setFilters({ outcome: e.target.value });
    });
  }
  if (filterSetup) {
    filterSetup.addEventListener("change", (e) => {
      AppState.setFilters({ setup: e.target.value });
    });
  }

  // Global Keyboard shortcuts handler
  document.addEventListener("keydown", (e) => {
    // If inside input, textarea or select, ignore keyboard shortcuts
    const active = document.activeElement;
    if (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT") {
      if (e.key === "Escape") {
        closeTradeModal();
        closeSettingsModal();
      }
      return;
    }

    if (e.key.toLowerCase() === "n") {
      e.preventDefault();
      openTradeModal();
    }
    
    if (e.key === "Escape") {
      closeTradeModal();
      closeSettingsModal();
      closeDayPanel();
    }
  });

  // Delegated Trade Log actions (expand, edit, delete)
  const tbody = document.getElementById("tradeLogTbody");
  if (tbody) {
    tbody.addEventListener("click", (e) => {
      // 1. Edit button handler
      const editBtn = e.target.closest(".edit-trade-btn");
      if (editBtn) {
        e.stopPropagation();
        const row = editBtn.closest(".trade-row-main");
        if (row) openTradeModal(row.dataset.id);
        return;
      }
      
      // 2. Delete button handler
      const deleteBtn = e.target.closest(".delete-trade-btn");
      if (deleteBtn) {
        e.stopPropagation();
        const row = deleteBtn.closest(".trade-row-main");
        if (row) {
          const id = row.dataset.id;
          if (confirm("Are you sure you want to delete this trade?")) {
            try {
              AppState.deleteTrade(id);
              showToast("Trade deleted successfully.", "info");
            } catch (err) {
              showToast(err.message, "error");
            }
          }
        }
        return;
      }
      
      // Ignore clicks on detail rows
      if (e.target.closest(".trade-row-detail")) return;
      
      // 3. Expand/collapse row handler
      const row = e.target.closest(".trade-row-main");
      if (!row) return;
      
      const id = row.dataset.id;
      const detailRow = document.getElementById(`detail-${id}`);
      const icon = row.querySelector(".row-expand-icon");
      if (!detailRow || !icon) return;

      detailRow.classList.toggle("hidden");
      if (detailRow.classList.contains("hidden")) {
        icon.style.transform = "rotate(0deg)";
      } else {
        icon.style.transform = "rotate(90deg)";
      }
    });
  }

  // Page Size Select listener
  const pageSizeSelect = document.getElementById("pageSizeSelect");
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", (e) => {
      tradesPerPage = parseInt(e.target.value, 10);
      renderTradeLog(AppState.getFilteredTrades(), 1);
    });
  }

  // Search input binding
  const logSearchInput = document.getElementById("logSearchInput");
  if (logSearchInput) {
    logSearchInput.addEventListener("input", (e) => {
      currentSearchQuery = e.target.value.toLowerCase().trim();
      renderTradeLog(AppState.getFilteredTrades(), 1);
    });
  }

  // Click-to-sort headers binding
  const headers = document.querySelectorAll("th.sortable");
  headers.forEach(h => {
    h.addEventListener("click", () => {
      const sortField = h.dataset.sort;
      if (currentSortField === sortField) {
        currentSortAscending = !currentSortAscending;
      } else {
        currentSortField = sortField;
        currentSortAscending = true;
      }
      
      // Update header arrow icons
      headers.forEach(header => {
        const icon = header.querySelector("i");
        if (icon) {
          if (header.dataset.sort === currentSortField) {
            icon.style.opacity = "1";
            icon.setAttribute("data-lucide", currentSortAscending ? "chevron-up" : "chevron-down");
          } else {
            icon.style.opacity = "0.5";
            icon.setAttribute("data-lucide", "chevrons-up-down");
          }
        }
      });
      lucide.createIcons();
      renderTradeLog(AppState.getFilteredTrades(), 1);
    });
  });

  // Theme & shortcuts initializers
  initTheme();
  initShortcuts();
  initPositionCalculator();
}

export function populateSetupFilterOptions(setups) {
  const filterSetup = document.getElementById("filterSetup");
  const tradeSetupDatalist = document.getElementById("setupsDatalist");

  if (!filterSetup) return;

  // Clear previous options except first "All Setups"
  filterSetup.innerHTML = '<option value="all">All Setups</option>';
  
  if (tradeSetupDatalist) {
    tradeSetupDatalist.innerHTML = "";
  }

  for (const s of setups) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    filterSetup.appendChild(opt);

    if (tradeSetupDatalist) {
      const datalistOpt = document.createElement("option");
      datalistOpt.value = s;
      tradeSetupDatalist.appendChild(datalistOpt);
    }
  }

  // Sync selected index value back to AppState filter state
  filterSetup.value = AppState.activeFilters.setup || "all";
}

export function populateAccountSelector() {
  const accountSelector = document.getElementById("accountSelector");
  if (!accountSelector) return;
  
  accountSelector.innerHTML = "";
  
  const accounts = AppState.settings.accounts || {};
  Object.keys(accounts).forEach(accName => {
    const opt = document.createElement("option");
    opt.value = accName;
    opt.textContent = `${accName} Account`;
    accountSelector.appendChild(opt);
  });
  
  const addOpt = document.createElement("option");
  addOpt.value = "__ADD_NEW__";
  addOpt.textContent = "+ Add New Account...";
  accountSelector.appendChild(addOpt);
  
  accountSelector.value = AppState.settings.currentAccount || "Personal";
}

export function renderInterventionMatrix(trades) {
  const analytics = calcInterventionAnalytics(trades, AppState.settings.startingBalance);

  // Update IER Gauge UI
  const ierValue = document.getElementById("ierGaugeValue");
  const ierProgress = document.getElementById("ierGaugeProgress");
  const ierCount = document.getElementById("ierInterventionCount");

  if (ierValue) ierValue.textContent = `${analytics.ier.toFixed(1)}%`;
  if (ierProgress) {
    ierProgress.setAttribute("stroke-dasharray", `${analytics.ier.toFixed(1)}, 100`);
    if (analytics.ier >= 70) {
      ierProgress.style.stroke = "var(--profit)";
    } else if (analytics.ier >= 40) {
      ierProgress.style.stroke = "#f59e0b"; // Amber/yellow
    } else {
      ierProgress.style.stroke = "var(--loss)";
    }
  }
  if (ierCount) ierCount.textContent = analytics.totalInterventions;

  // Render Performance Matrix Table
  const tbody = document.getElementById("performanceMatrixTbody");
  if (!tbody) return;

  const actual = analytics.matrix.actual;
  const strategy = analytics.matrix.strategy;

  const formatPnl = (val) => {
    const sign = val >= 0 ? "+" : "";
    return `${sign}$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (val) => `${val.toFixed(1)}%`;
  const formatRatio = (val) => val.toFixed(2);

  const getDeltaPnlClass = (act, strat) => act > strat ? "positive" : (act < strat ? "negative" : "neutral");
  const getDeltaClass = (act, strat, higherIsBetter = true) => {
    if (act === strat) return "neutral";
    const improved = higherIsBetter ? act > strat : act < strat;
    return improved ? "positive" : "negative";
  };

  const rows = [
    {
      label: "Total Net P&L",
      actVal: formatPnl(actual.totalPnl),
      stratVal: formatPnl(strategy.totalPnl),
      deltaVal: formatPnl(actual.totalPnl - strategy.totalPnl),
      className: getDeltaPnlClass(actual.totalPnl, strategy.totalPnl),
      highlight: true
    },
    {
      label: "Win Rate (%)",
      actVal: formatPercent(actual.winRate),
      stratVal: formatPercent(strategy.winRate),
      deltaVal: `${actual.winRate >= strategy.winRate ? "+" : ""}${(actual.winRate - strategy.winRate).toFixed(1)}%`,
      className: getDeltaClass(actual.winRate, strategy.winRate),
      highlight: true
    },
    {
      label: "Profit Factor",
      actVal: formatRatio(actual.profitFactor),
      stratVal: formatRatio(strategy.profitFactor),
      deltaVal: `${actual.profitFactor >= strategy.profitFactor ? "+" : ""}${(actual.profitFactor - strategy.profitFactor).toFixed(2)}`,
      className: getDeltaClass(actual.profitFactor, strategy.profitFactor)
    },
    {
      label: "Sharpe Ratio",
      actVal: formatRatio(actual.sharpe),
      stratVal: formatRatio(strategy.sharpe),
      deltaVal: `${actual.sharpe >= strategy.sharpe ? "+" : ""}${(actual.sharpe - strategy.sharpe).toFixed(2)}`,
      className: getDeltaClass(actual.sharpe, strategy.sharpe)
    },
    {
      label: "Sortino Ratio",
      actVal: formatRatio(actual.sortino),
      stratVal: formatRatio(strategy.sortino),
      deltaVal: `${actual.sortino >= strategy.sortino ? "+" : ""}${(actual.sortino - strategy.sortino).toFixed(2)}`,
      className: getDeltaClass(actual.sortino, strategy.sortino)
    },
    {
      label: "Expectancy",
      actVal: formatPnl(actual.expectancy),
      stratVal: formatPnl(strategy.expectancy),
      deltaVal: formatPnl(actual.expectancy - strategy.expectancy),
      className: getDeltaPnlClass(actual.expectancy, strategy.expectancy)
    },
    {
      label: "Max Drawdown",
      actVal: `${formatPnl(actual.maxDrawdown.amount)} (${actual.maxDrawdown.percent.toFixed(1)}%)`,
      stratVal: `${formatPnl(strategy.maxDrawdown.amount)} (${strategy.maxDrawdown.percent.toFixed(1)}%)`,
      deltaVal: `${actual.maxDrawdown.amount <= strategy.maxDrawdown.amount ? "+" : ""}${formatPnl(strategy.maxDrawdown.amount - actual.maxDrawdown.amount)}`,
      className: getDeltaClass(actual.maxDrawdown.amount, strategy.maxDrawdown.amount, false) // lower is better!
    },
    {
      label: "Recovery Factor",
      actVal: actual.recoveryFactor === 99.9 ? "∞" : formatRatio(actual.recoveryFactor),
      stratVal: strategy.recoveryFactor === 99.9 ? "∞" : formatRatio(strategy.recoveryFactor),
      deltaVal: `${actual.recoveryFactor >= strategy.recoveryFactor ? "+" : ""}${(actual.recoveryFactor - strategy.recoveryFactor).toFixed(2)}`,
      className: getDeltaClass(actual.recoveryFactor, strategy.recoveryFactor)
    },
    {
      label: "Average Trade P&L",
      actVal: formatPnl(actual.avgTrade),
      stratVal: formatPnl(strategy.avgTrade),
      deltaVal: formatPnl(actual.avgTrade - strategy.avgTrade),
      className: getDeltaPnlClass(actual.avgTrade, strategy.avgTrade)
    },
    {
      label: "Total Trades Count",
      actVal: actual.count,
      stratVal: strategy.count,
      deltaVal: actual.count - strategy.count,
      className: "neutral"
    }
  ];

  tbody.innerHTML = rows.map(r => {
    const highlightStyle = r.highlight ? "background-color: rgba(99, 102, 241, 0.05); font-weight: 600;" : "";
    const labelColor = r.highlight ? "var(--text-primary)" : "var(--text-muted)";
    return `
      <tr style="${highlightStyle}">
        <td style="padding: 10px 8px; color: ${labelColor}; font-weight: 500;">${r.label}</td>
        <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: var(--text-primary);">${r.actVal}</td>
        <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: var(--text-primary);">${r.stratVal}</td>
        <td class="matrix-delta-val ${r.className}" style="padding: 10px 8px; text-align: right;">${r.deltaVal}</td>
      </tr>
    `;
  }).join("");
}

export function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "dark";
  const sunIcon = document.getElementById("themeSunIcon");
  const moonIcon = document.getElementById("themeMoonIcon");
  if (savedTheme === "light") {
    document.body.classList.add("light-theme");
    if (sunIcon) sunIcon.classList.remove("hidden");
    if (moonIcon) moonIcon.classList.add("hidden");
  } else {
    document.body.classList.remove("light-theme");
    if (sunIcon) sunIcon.classList.add("hidden");
    if (moonIcon) moonIcon.classList.remove("hidden");
  }
  
  const toggleBtn = document.getElementById("themeToggleBtn");
  if (toggleBtn) {
    if (!toggleBtn.dataset.bound) {
      toggleBtn.dataset.bound = "true";
      toggleBtn.addEventListener("click", () => {
        const isLight = document.body.classList.toggle("light-theme");
        localStorage.setItem("theme", isLight ? "light" : "dark");
        if (isLight) {
          if (sunIcon) sunIcon.classList.remove("hidden");
          if (moonIcon) moonIcon.classList.add("hidden");
        } else {
          if (sunIcon) sunIcon.classList.add("hidden");
          if (moonIcon) moonIcon.classList.remove("hidden");
        }
        window.dispatchEvent(new Event("themeChanged"));
      });
    }
  }
}

export function initShortcuts() {
  const modal = document.getElementById("shortcutsModal");
  const closeBtn = document.getElementById("closeShortcutsBtn");
  const okBtn = document.getElementById("closeShortcutsOkBtn");
  
  const openShortcuts = () => {
    if (modal) modal.classList.add("open");
  };
  
  const closeShortcuts = () => {
    if (modal) modal.classList.remove("open");
  };
  
  if (closeBtn) closeBtn.addEventListener("click", closeShortcuts);
  if (okBtn) okBtn.addEventListener("click", closeShortcuts);
  
  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    if (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT") {
      return;
    }
    if (e.key === "?") {
      e.preventDefault();
      if (modal) {
        if (modal.classList.contains("open")) {
          closeShortcuts();
        } else {
          openShortcuts();
        }
      }
    }
  });
}

export function initPositionCalculator() {
  const calcBalance = document.getElementById("calcBalance");
  const calcRiskPct = document.getElementById("calcRiskPct");
  const calcEntry = document.getElementById("calcEntry");
  const calcStop = document.getElementById("calcStop");
  
  const calcRiskAmtVal = document.getElementById("calcRiskAmtVal");
  const calcStopDistPct = document.getElementById("calcStopDistPct");
  const calcRecommendShares = document.getElementById("calcRecommendShares");
  
  const updateCalc = () => {
    if (!calcBalance || !calcRiskPct || !calcEntry || !calcStop) return;
    const balance = parseFloat(calcBalance.value) || 0;
    const riskPct = parseFloat(calcRiskPct.value) || 0;
    const entry = parseFloat(calcEntry.value) || 0;
    const stop = parseFloat(calcStop.value) || 0;
    
    const riskAmt = balance * (riskPct / 100);
    calcRiskAmtVal.textContent = `$${riskAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    if (entry > 0 && stop > 0) {
      const stopDist = Math.abs(entry - stop);
      const stopDistPct = (stopDist / entry) * 100;
      calcStopDistPct.textContent = `${stopDistPct.toFixed(2)}%`;
      
      if (stopDist > 0) {
        const shares = riskAmt / stopDist;
        calcRecommendShares.textContent = `${Math.floor(shares).toLocaleString()} Shares`;
      } else {
        calcRecommendShares.textContent = "0 Shares";
      }
    } else {
      calcStopDistPct.textContent = "0.00%";
      calcRecommendShares.textContent = "0 Shares";
    }
  };
  
  [calcBalance, calcRiskPct, calcEntry, calcStop].forEach(el => {
    if (el) {
      el.addEventListener("input", updateCalc);
      el.addEventListener("change", updateCalc);
    }
  });

  if (calcBalance) {
    calcBalance.addEventListener("input", () => {
      calcBalance.dataset.userModified = "true";
    });
    calcBalance.value = AppState.settings.startingBalance || 25000;
    updateCalc();
  }
}

export function renderRiskTab(trades) {
  const dds = calcDrawdownDurations(trades, AppState.settings.startingBalance);
  const streakProb = calcStreakProbability(trades);
  
  // MFE exit efficiency calculations (across winning trades with MFE recorded)
  const tradesWithMfe = trades.filter(t => t.status === "executed" && calcMfe(t) !== null);
  const winningMfeTrades = tradesWithMfe.filter(t => calcNetPnl(t) > 0);
  const totalMfe = winningMfeTrades.reduce((sum, t) => sum + calcMfe(t), 0);
  const totalCaptured = winningMfeTrades.reduce((sum, t) => sum + calcNetPnl(t), 0);
  const exitEfficiency = totalMfe > 0 ? (totalCaptured / totalMfe) * 100 : 0;
  const leftOnTable = totalMfe - totalCaptured;

  // MAE drawdown control calculations (across all trades with MAE recorded)
  const tradesWithMae = trades.filter(t => t.status === "executed" && calcMae(t) !== null);
  const totalMae = tradesWithMae.reduce((sum, t) => sum + calcMae(t), 0);
  const losingMaeTrades = tradesWithMae.filter(t => calcNetPnl(t) < 0);
  const totalRealizedLoss = losingMaeTrades.reduce((sum, t) => sum + Math.abs(calcNetPnl(t)), 0);
  const savedDrawdown = totalMae - totalRealizedLoss;
  const drawdownControl = totalMae > 0 ? (savedDrawdown / totalMae) * 100 : 0;

  const riskExitEfficiency = document.getElementById("riskExitEfficiency");
  const riskExitEfficiencyDetail = document.getElementById("riskExitEfficiencyDetail");
  const riskDrawdownControl = document.getElementById("riskDrawdownControl");
  const riskDrawdownControlDetail = document.getElementById("riskDrawdownControlDetail");

  if (riskExitEfficiency) {
    riskExitEfficiency.textContent = totalMfe > 0 ? `${exitEfficiency.toFixed(1)}%` : "--";
  }
  if (riskExitEfficiencyDetail) {
    riskExitEfficiencyDetail.textContent = totalMfe > 0 
      ? `(Captured $${totalCaptured.toLocaleString(undefined, {maximumFractionDigits:0})} of $${totalMfe.toLocaleString(undefined, {maximumFractionDigits:0})} peak gains, $${leftOnTable.toLocaleString(undefined, {maximumFractionDigits:0})} left on table)`
      : "(No MFE data available)";
  }

  if (riskDrawdownControl) {
    riskDrawdownControl.textContent = totalMae > 0 ? `${drawdownControl.toFixed(1)}%` : "--";
  }
  if (riskDrawdownControlDetail) {
    riskDrawdownControlDetail.textContent = totalMae > 0
      ? `(Saved $${savedDrawdown.toLocaleString(undefined, {maximumFractionDigits:0})} of $${totalMae.toLocaleString(undefined, {maximumFractionDigits:0})} total drawdown, $${totalRealizedLoss.toLocaleString(undefined, {maximumFractionDigits:0})} realized loss)`
      : "(No MAE data available)";
  }

  const riskMaxDdDays = document.getElementById("riskMaxDdDays");
  const riskMaxDdTrades = document.getElementById("riskMaxDdTrades");
  const riskCurrentDdDuration = document.getElementById("riskCurrentDdDuration");
  const riskExpectedWinStreak = document.getElementById("riskExpectedWinStreak");
  const riskExpectedLossStreak = document.getElementById("riskExpectedLossStreak");
  
  if (riskMaxDdDays) riskMaxDdDays.textContent = `${dds.maxCompletedDays.toFixed(1)} Days`;
  if (riskMaxDdTrades) riskMaxDdTrades.textContent = `${dds.maxCompletedTrades} Trades`;
  if (riskCurrentDdDuration) {
    riskCurrentDdDuration.textContent = `${dds.currentDrawdownDays.toFixed(1)} Days (${dds.currentDrawdownTrades} trades)`;
    if (dds.currentDrawdownTrades > 10 || dds.currentDrawdownDays > 14) {
      riskCurrentDdDuration.className = "bold loss";
      riskCurrentDdDuration.style.color = "";
    } else if (dds.currentDrawdownTrades > 0) {
      riskCurrentDdDuration.className = "bold";
      riskCurrentDdDuration.style.color = "#f59e0b"; // Amber/warning
    } else {
      riskCurrentDdDuration.className = "bold profit";
      riskCurrentDdDuration.style.color = "";
    }
  }
  if (riskExpectedWinStreak) riskExpectedWinStreak.textContent = `${streakProb.expectedWin.toFixed(1)} (Actual: ${streakProb.actualWin})`;
  if (riskExpectedLossStreak) riskExpectedLossStreak.textContent = `${streakProb.expectedLoss.toFixed(1)} (Actual: ${streakProb.actualLoss})`;

  // Sync position calculator with current equity dynamically
  const calcBalance = document.getElementById("calcBalance");
  if (calcBalance && !calcBalance.dataset.userModified) {
    const startingBalance = AppState.settings.startingBalance || 25000;
    const executedTrades = trades.filter(t => t.status === "executed");
    const cumulativeNetPnl = executedTrades.reduce((sum, t) => sum + calcNetPnl(t), 0);
    calcBalance.value = (startingBalance + cumulativeNetPnl).toFixed(2);
    
    // Trigger update calculation manually
    const triggerEvent = new Event("input");
    calcBalance.dispatchEvent(triggerEvent);
  }
}
