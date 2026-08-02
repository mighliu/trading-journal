/**
 * Escape HTML special characters to prevent XSS from user input.
 */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function getSymbolMultiplier(symbol, assetClass = "") {
  if (!symbol) return 1;
  const sym = symbol.toUpperCase().trim();
  const cls = (assetClass || "").toLowerCase().trim();
  
  // 1. Futures Multipliers
  const isFutures = cls === "futures" || 
                    sym.startsWith("ES") || 
                    sym.startsWith("MES") || 
                    sym.startsWith("NQ") || 
                    sym.startsWith("MNQ") || 
                    sym.startsWith("CL") || 
                    sym.startsWith("MCL") || 
                    sym.startsWith("GC") || 
                    sym.startsWith("MGC") ||
                    sym.startsWith("YM") ||
                    sym.startsWith("MYM");

  if (isFutures) {
    if (sym.startsWith("MES")) return 5;     // Micro E-mini S&P 500: $5 per point
    if (sym.startsWith("ES")) return 50;     // E-mini S&P 500: $50 per point
    if (sym.startsWith("MNQ")) return 2;     // Micro E-mini Nasdaq-100: $2 per point
    if (sym.startsWith("NQ")) return 20;     // E-mini Nasdaq-100: $20 per point
    if (sym.startsWith("MCL")) return 100;   // Micro Crude Oil: $100 per point
    if (sym.startsWith("CL")) return 1000;   // Crude Oil: $1000 per point
    if (sym.startsWith("MGC")) return 10;    // Micro Gold: $10 per point
    if (sym.startsWith("GC")) return 100;    // Gold: $100 per point
    if (sym.startsWith("MYM")) return 0.5;   // Micro E-mini Dow: $0.50 per point
    if (sym.startsWith("YM")) return 5;      // E-mini Dow: $5 per point
    return 1;
  }

  // 2. Options Multipliers
  if (cls === "options") {
    return 100; // Standard option contracts represent 100 shares
  }

  return 1;
}

export function getEffectiveMultiplier(trade) {
  if (!trade) return 1;
  const qty = parseFloat(trade.qty) || 0;
  const entry = parseFloat(trade.entryPrice) || 0;
  const exit = parseFloat(trade.exitPrice) || 0;
  const fees = parseFloat(trade.fees) || 0;
  const directionMultiplier = trade.direction === "short" ? -1 : 1;
  
  let multiplier = getSymbolMultiplier(trade.symbol, trade.assetClass);
  if (trade.overridePnl && trade.manualPnl != null) {
    const manualPnl = parseFloat(trade.manualPnl) || 0;
    const priceDiff = (exit - entry) * directionMultiplier;
    if (!isNaN(priceDiff) && priceDiff !== 0 && qty > 0) {
      multiplier = Math.abs((manualPnl + fees) / (priceDiff * qty));
    }
  }
  return multiplier;
}

export function calcNetPnl(trade) {
  if (isSkippedTrade(trade)) return 0;
  if (trade.overridePnl && trade.manualPnl != null) {
    return parseFloat(trade.manualPnl) || 0;
  }
  const multiplier = getSymbolMultiplier(trade.symbol, trade.assetClass);
  const directionMultiplier = trade.direction === "long" ? 1 : -1;
  const grossPnl = (trade.exitPrice - trade.entryPrice) * trade.qty * multiplier * directionMultiplier;
  const fees = parseFloat(trade.fees) || 0;
  return grossPnl - fees;
}

export function calcPnlPercent(trade) {
  const multiplier = getSymbolMultiplier(trade.symbol, trade.assetClass);
  const cost = trade.entryPrice * trade.qty * multiplier;
  if (cost === 0) return 0;
  const netPnl = calcNetPnl(trade);
  return (netPnl / cost) * 100;
}

export function calcSignalPnl(trade) {
  if (!trade) return 0;
  const type = trade.interventionType || "followed";
  const actPnl = calcNetPnl(trade);

  // 1. Followed trades (no intervention): Mechanical Strategy P&L is identical to Actual P&L
  if ((type === "followed" || !type) && !isSkippedTrade(trade)) {
    return actPnl;
  }

  const qty = parseFloat(trade.qty) || 0;
  const entry = parseFloat(trade.entryPrice) || 0;
  const exit = parseFloat(trade.exitPrice) || entry;
  const direction = String(trade.direction || "long").toLowerCase();
  const dirMult = direction === "short" ? -1 : 1;
  const fees = parseFloat(trade.fees) || 0;
  const mult = getEffectiveMultiplier(trade);

  // 2. Discretionary trade taken with NO strategy signal
  if (type === "manual_no_signal") {
    return 0; // Mechanical strategy rule generated $0 P&L (did not take trade)
  }

  // 3. Skipped Trades (Strategy executed trade, trader skipped it)
  if (isSkippedTrade(trade)) {
    if (exit !== 0 && entry !== 0) {
      return (exit - entry) * qty * mult * dirMult - fees;
    }
    return 0;
  }

  // 4. Early Profit Cut (Profit Protect)
  if (type === "early_profit") {
    const mfeRaw = parseFloat(trade.mfe != null ? trade.mfe : trade.maxPrice);
    if (!isNaN(mfeRaw) && mfeRaw > 0) {
      if (entry > 0 && mfeRaw > entry * 0.1 && mfeRaw < entry * 3) {
        const pts = direction === "long" ? Math.max(0, mfeRaw - entry) : Math.max(0, entry - mfeRaw);
        return pts * qty * mult - fees;
      } else {
        return mfeRaw - fees;
      }
    }
    return actPnl > 0 ? actPnl * 1.25 : Math.abs(actPnl) * 1.25;
  }

  // 5. Early Loss Cut (Loss Stop)
  if (type === "early_loss") {
    const stopRaw = parseFloat(trade.stopLoss);
    if (!isNaN(stopRaw) && stopRaw > 0) {
      if (entry > 0 && stopRaw > entry * 0.1 && stopRaw < entry * 3) {
        const pts = direction === "long" ? Math.max(0, entry - stopRaw) : Math.max(0, stopRaw - entry);
        return -(pts * qty * mult + fees);
      } else {
        return -(stopRaw + fees);
      }
    }
    const maeRaw = parseFloat(trade.mae != null ? trade.mae : trade.minPrice);
    if (!isNaN(maeRaw) && maeRaw > 0) {
      if (entry > 0 && maeRaw > entry * 0.1 && maeRaw < entry * 3) {
        const pts = direction === "long" ? Math.max(0, entry - maeRaw) : Math.max(0, maeRaw - entry);
        return -(pts * qty * mult + fees);
      } else {
        return -(maeRaw + fees);
      }
    }
    return actPnl < 0 ? actPnl * 1.25 : -Math.abs(actPnl || 100);
  }

  // 6. Late Entry Chase
  if (type === "late_entry") {
    const sigEntry = direction === "long" ? entry * 0.995 : entry * 1.005;
    return (exit - sigEntry) * qty * mult * dirMult - fees;
  }

  // 7. Explicit signal prices provided as fallback
  if (trade.signalEntryPrice != null && trade.signalExitPrice != null &&
      !isNaN(parseFloat(trade.signalEntryPrice)) && !isNaN(parseFloat(trade.signalExitPrice))) {
    const sigEntry = parseFloat(trade.signalEntryPrice);
    const sigExit = parseFloat(trade.signalExitPrice);
    return (sigExit - sigEntry) * qty * mult * dirMult - fees;
  }

  return actPnl;
}

export function calcPriceDiff(p1, p2) {
  const val1 = parseFloat(p1);
  const val2 = parseFloat(p2);
  if (isNaN(val1) || isNaN(val2)) return null;
  return Math.abs(val1 - val2);
}

export function calcPnlDiff(signalPnl, actualPnl) {
  const sPnl = parseFloat(signalPnl);
  const aPnl = parseFloat(actualPnl);
  if (isNaN(sPnl) || isNaN(aPnl)) return 0;
  return aPnl - sPnl;
}

export function calcRiskReward(trade, avgLoss = 100) {
  const entry = parseFloat(trade.entryPrice);
  const exit = parseFloat(trade.exitPrice);
  const qty = parseFloat(trade.qty) || 0;
  if (isNaN(entry) || entry === 0 || isNaN(qty) || qty === 0) return null;

  let riskVal = 0;

  // 1. If stop loss is provided, use it to calculate the risk
  if (trade.stopLoss) {
    const stop = parseFloat(trade.stopLoss);
    let riskPerUnit = 0;
    if (trade.direction === "long") {
      riskPerUnit = entry - stop;
    } else {
      riskPerUnit = stop - entry;
    }
    
    if (riskPerUnit > 0) {
      const mult = getEffectiveMultiplier(trade);
      riskVal = riskPerUnit * qty * mult;
    }
  }

  // 2. If no stop loss (or invalid risk), fallback to average loss of the system as the 1R risk unit
  if (riskVal <= 0) {
    riskVal = avgLoss;
  }

  if (riskVal <= 0) return null;

  // R-Multiple = Net P&L / Risk
  return calcNetPnl(trade) / riskVal;
}

export function calcDuration(entryDateStr, exitDateStr) {
  if (!entryDateStr || !exitDateStr) return null;
  const entry = new Date(entryDateStr);
  const exit = new Date(exitDateStr);
  const diffMs = exit - entry;
  if (diffMs < 0 || isNaN(diffMs)) return null;
  
  const totalMins = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const minutes = totalMins % 60;
  
  return { days, hours, minutes, totalMins };
}

export function formatCurrency(n) {
  const num = parseFloat(n);
  if (isNaN(num)) return "$0.00";
  const absVal = Math.abs(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return num < 0 ? `-$${absVal}` : `$${absVal}`;
}

export function formatPercent(n) {
  const num = parseFloat(n);
  if (isNaN(num)) return "0.00%";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

export function formatDuration(dur) {
  if (!dur) return "-";
  if (dur.days > 0) {
    return `${dur.days}d ${dur.hours}h`;
  }
  if (dur.hours > 0) {
    return `${dur.hours}h ${dur.minutes}m`;
  }
  return `${dur.minutes}m`;
}

export function calcStreaks(trades) {
  // Sort trades by exit datetime ascending
  const sorted = [...trades].sort((a, b) => new Date(a.exitDateTime) - new Date(b.exitDateTime));
  
  let currentStreakVal = 0;
  let currentStreakType = null; // 'W' or 'L'
  let bestWinStreak = 0;
  let worstLossStreak = 0;
  
  let tempWinStreak = 0;
  let tempLossStreak = 0;
  
  for (const trade of sorted) {
    const netPnl = calcNetPnl(trade);
    if (netPnl > 0) {
      // Win
      tempWinStreak++;
      if (tempWinStreak > bestWinStreak) bestWinStreak = tempWinStreak;
      tempLossStreak = 0;
      
      if (currentStreakType === "W") {
        currentStreakVal++;
      } else {
        currentStreakType = "W";
        currentStreakVal = 1;
      }
    } else if (netPnl < 0) {
      // Loss
      tempLossStreak++;
      if (tempLossStreak > worstLossStreak) worstLossStreak = tempLossStreak;
      tempWinStreak = 0;
      
      if (currentStreakType === "L") {
        currentStreakVal++;
      } else {
        currentStreakType = "L";
        currentStreakVal = 1;
      }
    }
    // Breakeven (0 P&L) doesn't break or increment the streak in most models,
    // or it resets both. Let's reset the streak counters for exact 0.
    else {
      tempWinStreak = 0;
      tempLossStreak = 0;
      currentStreakVal = 0;
      currentStreakType = null;
    }
  }
  
  return {
    currentStreak: currentStreakType ? `${currentStreakType}${currentStreakVal}` : "None",
    bestWinStreak,
    worstLossStreak
  };
}

export function calcProfitFactor(trades) {
  let grossWins = 0;
  let grossLosses = 0;
  
  for (const trade of trades) {
    const pnl = calcNetPnl(trade);
    if (pnl > 0) grossWins += pnl;
    else if (pnl < 0) grossLosses += Math.abs(pnl);
  }
  
  if (grossLosses === 0) return grossWins > 0 ? 99.9 : 0;
  return grossWins / grossLosses;
}

export function calcWinRate(trades) {
  if (trades.length === 0) return 0;
  const wins = trades.filter(t => {
    const pnl = isSkippedTrade(t) ? calcSignalPnl(t) : calcNetPnl(t);
    return pnl > 0;
  }).length;
  return (wins / trades.length) * 100;
}

export function getDateRange(preset, baseDate = new Date()) {
  const start = new Date(baseDate);
  const end = new Date(baseDate);
  
  // Normalize time to end of day for end
  end.setHours(23, 59, 59, 999);
  
  switch (preset) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "thisWeek":
      // Set to Monday of this week
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      break;
    case "thisMonth":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case "thisQuarter":
      const quarterMonth = Math.floor(start.getMonth() / 3) * 3;
      start.setDate(1);
      start.setMonth(quarterMonth);
      start.setHours(0, 0, 0, 0);
      break;
    case "ytd":
      start.setDate(1);
      start.setMonth(0);
      start.setHours(0, 0, 0, 0);
      break;
    case "allTime":
      return { start: new Date(0), end: new Date(8640000000000000) };
    default:
      // Default to allTime if preset not recognized
      return { start: new Date(0), end: new Date(8640000000000000) };
  }
  
  return { start, end };
}

export function excelSerialToDate(serial) {
  if (typeof serial !== "number" || isNaN(serial) || serial <= 0) return null;
  const days = Math.floor(serial);
  const fraction = serial - days;
  const totalSeconds = Math.round(fraction * 86400);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  const baseDate = new Date(1899, 11, 30);
  baseDate.setDate(baseDate.getDate() + days);
  baseDate.setHours(hours, minutes, seconds, 0);
  return baseDate;
}

export function normalizeDateTime(dateVal) {
  if (dateVal === null || dateVal === undefined || dateVal === "") return "";
  
  let d;
  if (dateVal instanceof Date) {
    d = dateVal;
  } else if (typeof dateVal === "number") {
    if (dateVal > 10000000000) {
      d = new Date(dateVal < 1000000000000 ? dateVal * 1000 : dateVal);
    } else {
      d = excelSerialToDate(dateVal);
    }
  } else {
    const str = String(dateVal).trim();
    const num = Number(str);
    if (str && !isNaN(num) && num > 1000) {
      if (num > 10000000000) {
        d = new Date(num < 1000000000000 ? num * 1000 : num);
      } else {
        d = excelSerialToDate(num);
      }
    } else {
      const match = str.match(/^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (match) {
        const [_, y, m, day, h, min, s] = match;
        d = new Date(parseInt(y), parseInt(m) - 1, parseInt(day), parseInt(h), parseInt(min), s ? parseInt(s) : 0);
      } else {
        d = new Date(str);
      }
    }
  }

  if (!d || isNaN(d.getTime())) return "";
  
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getDailyReturns(trades, startingBalance = 25000) {
  const sorted = [...trades].filter(t => !isSkippedTrade(t) && t.exitDateTime)
    .sort((a, b) => new Date(a.exitDateTime) - new Date(b.exitDateTime));
  if (sorted.length === 0) return [];

  const dailyPnlMap = {};
  let minDate = null;
  let maxDate = null;

  for (const t of sorted) {
    const day = t.exitDateTime.split("T")[0];
    dailyPnlMap[day] = (dailyPnlMap[day] || 0) + calcNetPnl(t);

    const d = new Date(day + "T00:00:00");
    if (!minDate || d < minDate) minDate = d;
    if (!maxDate || d > maxDate) maxDate = d;
  }

  if (!minDate || !maxDate) return [];

  const returns = [];
  let equity = parseFloat(startingBalance) || 25000;
  const cursor = new Date(minDate);

  while (cursor <= maxDate) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) { // Weekdays only
      const key = cursor.toISOString().split("T")[0];
      const dayPnl = dailyPnlMap[key] || 0;
      returns.push(equity > 0 ? dayPnl / equity : 0);
      equity += dayPnl;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return returns;
}

export function calcSharpeRatio(trades, startingBalance = 25000) {
  const dr = getDailyReturns(trades, startingBalance);
  if (dr.length < 2) return 0;

  const n = dr.length;
  const mean = dr.reduce((s, v) => s + v, 0) / n;
  const stdDev = Math.sqrt(dr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n);
  
  const rfrDaily = 0.02 / 252; // 2% annually / 252 trading days

  if (stdDev === 0) return 0;
  return ((mean - rfrDaily) / stdDev) * Math.sqrt(252);
}

export function calcSortinoRatio(trades, startingBalance = 25000) {
  const dr = getDailyReturns(trades, startingBalance);
  if (dr.length < 2) return 0;

  const n = dr.length;
  const mean = dr.reduce((s, v) => s + v, 0) / n;
  
  const rfrDaily = 0.02 / 252; // 2% annually / 252 trading days

  // Downside deviation with daily RFR as target return
  const downsideVariance = dr.reduce((s, v) => s + Math.pow(Math.min(0, v - rfrDaily), 2), 0) / n;
  const downsideDev = Math.sqrt(downsideVariance);

  if (downsideDev === 0) return (mean - rfrDaily) > 0 ? 99.9 : 0;
  return ((mean - rfrDaily) / downsideDev) * Math.sqrt(252);
}

export function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split("-");
  if (parts.length !== 3) return new Date(dateStr);
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // months are 0-indexed
  const day = parseInt(parts[2], 10);
  return new Date(year, month, day);
}

export function calcInterventionMetrics(trades) {
  let actualTotal = 0;
  let strategyTotal = 0;

  for (const t of trades) {
    actualTotal += calcNetPnl(t);
    strategyTotal += calcSignalPnl(t);
  }

  return {
    actualTotal,
    strategyTotal,
    delta: actualTotal - strategyTotal
  };
}

export function hasSevereDeviation(trade) {
  if (isSkippedTrade(trade)) return true;
  if (trade.overridePnl && trade.interventionType !== "followed") return true;
  return trade.interventionType != null && trade.interventionType !== "followed";
}

export function calcInterventionAnalytics(trades, startingBalance = 25000) {
  // Let's filter to only trades with manual interventions
  const intervenedTrades = trades.filter(t => hasSevereDeviation(t));

  // 1. IER (Intervention Efficiency Ratio)
  let improvedCount = 0;
  let totalInterventions = intervenedTrades.length;

  for (const t of intervenedTrades) {
    const actPnl = calcNetPnl(t);
    const sigPnl = calcSignalPnl(t);
    
    if (isSkippedTrade(t)) {
      if (sigPnl < 0) {
        // Skipped a loser = improved outcome
        improvedCount++;
      }
    } else {
      if (actPnl > sigPnl) {
        // Discretionary execution was superior
        improvedCount++;
      }
    }
  }
  const ier = totalInterventions > 0 ? (improvedCount / totalInterventions) * 100 : 100;

  // 2. Performance Matrix Metrics
  let actualWins = 0;
  let actualLosses = 0;
  let actualTotalPnl = 0;
  let actualGrossWins = 0;
  let actualGrossLosses = 0;
  
  let strategyWins = 0;
  let strategyLosses = 0;
  let strategyTotalPnl = 0;
  let strategyGrossWins = 0;
  let strategyGrossLosses = 0;

  for (const t of trades) {
    const actNet = calcNetPnl(t);
    actualTotalPnl += actNet;
    if (isExecutedTrade(t)) {
      if (actNet > 0) {
        actualWins++;
        actualGrossWins += actNet;
      } else if (actNet < 0) {
        actualLosses++;
        actualGrossLosses += Math.abs(actNet);
      }
    }

    const stratNet = calcSignalPnl(t);
    strategyTotalPnl += stratNet;
    if (stratNet > 0) {
      strategyWins++;
      strategyGrossWins += stratNet;
    } else if (stratNet < 0) {
      strategyLosses++;
      strategyGrossLosses += Math.abs(stratNet);
    }
  }

  const actualCount = trades.filter(t => isExecutedTrade(t)).length;
  const strategyCount = trades.filter(t => t.interventionType !== "manual_no_signal").length;

  const actualWinRate = actualCount > 0 ? (actualWins / actualCount) * 100 : 0;
  const strategyWinRate = strategyCount > 0 ? (strategyWins / strategyCount) * 100 : 0;

  const actualProfitFactor = actualGrossLosses === 0 ? (actualGrossWins > 0 ? 99.9 : 0) : actualGrossWins / actualGrossLosses;
  const strategyProfitFactor = strategyGrossLosses === 0 ? (strategyGrossWins > 0 ? 99.9 : 0) : strategyGrossWins / strategyGrossLosses;

  const actualAvg = actualCount > 0 ? actualTotalPnl / actualCount : 0;
  const strategyAvg = strategyCount > 0 ? strategyTotalPnl / strategyCount : 0;

  const actualSharpe = calcSharpeRatio(trades.filter(t => isExecutedTrade(t)), startingBalance);
  const actualSortino = calcSortinoRatio(trades.filter(t => isExecutedTrade(t)), startingBalance);

  const strategyTrades = trades.map(t => {
    const stratPnl = calcSignalPnl(t);
    return {
      ...t,
      status: "executed",
      overridePnl: true,
      manualPnl: stratPnl,
      fees: 0,
      exitDateTime: t.exitDateTime || t.entryDateTime
    };
  });
  const strategySharpe = calcSharpeRatio(strategyTrades, startingBalance);
  const strategySortino = calcSortinoRatio(strategyTrades, startingBalance);

  const actualDrawdown = calcMaxDrawdown(trades.filter(t => isExecutedTrade(t)), startingBalance);
  const strategyDrawdown = calcMaxDrawdown(strategyTrades, startingBalance);

  const actualExpectancy = actualCount > 0 ? actualTotalPnl / actualCount : 0;
  const strategyExpectancy = strategyCount > 0 ? strategyTotalPnl / strategyCount : 0;

  const actualRecovery = actualDrawdown.amount > 0 ? actualTotalPnl / actualDrawdown.amount : (actualTotalPnl > 0 ? 99.9 : 0);
  const strategyRecovery = strategyDrawdown.amount > 0 ? strategyTotalPnl / strategyDrawdown.amount : (strategyTotalPnl > 0 ? 99.9 : 0);

  return {
    ier,
    totalInterventions,
    matrix: {
      actual: {
        totalPnl: actualTotalPnl,
        winRate: actualWinRate,
        profitFactor: actualProfitFactor,
        sharpe: actualSharpe,
        sortino: actualSortino,
        avgTrade: actualAvg,
        count: actualCount,
        expectancy: actualExpectancy,
        maxDrawdown: actualDrawdown,
        recoveryFactor: actualRecovery
      },
      strategy: {
        totalPnl: strategyTotalPnl,
        winRate: strategyWinRate,
        profitFactor: strategyProfitFactor,
        sharpe: strategySharpe,
        sortino: strategySortino,
        avgTrade: strategyAvg,
        count: strategyCount,
        expectancy: strategyExpectancy,
        maxDrawdown: strategyDrawdown,
        recoveryFactor: strategyRecovery
      }
    }
  };
}

export function calcMaxDrawdown(trades, startingBalance = 25000) {
  const sortedTrades = [...trades].sort((a, b) => new Date(a.entryDateTime) - new Date(b.entryDateTime));
  let current = startingBalance;
  let peak = startingBalance;
  let maxDrawdownAmt = 0;
  let maxDrawdownPct = 0;

  for (const t of sortedTrades) {
    const net = calcNetPnl(t);
    current += net;
    if (current > peak) {
      peak = current;
    }
    const dd = peak - current;
    if (dd > maxDrawdownAmt) {
      maxDrawdownAmt = dd;
    }
    if (peak > 0) {
      const ddPct = (dd / peak) * 100;
      if (ddPct > maxDrawdownPct) {
        maxDrawdownPct = ddPct;
      }
    }
  }

  return {
    amount: maxDrawdownAmt,
    percent: maxDrawdownPct
  };
}

export function calcMfePct(trade) {
  if (!trade.entryPrice || isSkippedTrade(trade)) return null;
  const entry = parseFloat(trade.entryPrice);
  const exit = parseFloat(trade.exitPrice) || 0;
  if (isNaN(entry) || entry === 0) return null;
  
  if (trade.direction === "long") {
    if (!trade.maxPrice) return null;
    const rawMax = parseFloat(trade.maxPrice);
    if (isNaN(rawMax)) return null;
    const maxVal = Math.max(rawMax, entry, exit);
    return ((maxVal - entry) / entry) * 100;
  } else {
    if (!trade.minPrice) return null;
    const rawMin = parseFloat(trade.minPrice);
    if (isNaN(rawMin) || rawMin === 0) return null;
    const minVal = Math.min(rawMin, entry, exit);
    return ((entry - minVal) / entry) * 100;
  }
}

export function calcMaePct(trade) {
  if (!trade.entryPrice || isSkippedTrade(trade)) return null;
  const entry = parseFloat(trade.entryPrice);
  const exit = parseFloat(trade.exitPrice) || 0;
  if (isNaN(entry) || entry === 0) return null;
  
  if (trade.direction === "long") {
    if (!trade.minPrice) return null;
    const rawMin = parseFloat(trade.minPrice);
    if (isNaN(rawMin)) return null;
    const minVal = Math.min(rawMin, entry, exit);
    return ((entry - minVal) / entry) * 100;
  } else {
    if (!trade.maxPrice) return null;
    const rawMax = parseFloat(trade.maxPrice);
    if (isNaN(rawMax)) return null;
    const maxVal = Math.max(rawMax, entry, exit);
    return ((maxVal - entry) / entry) * 100;
  }
}

export function calcMfe(trade) {
  if (isSkippedTrade(trade)) return null;
  if (!trade.entryPrice || !trade.qty) return null;

  const entry = parseFloat(trade.entryPrice);
  const qty = parseFloat(trade.qty);
  const exit = parseFloat(trade.exitPrice) || entry;
  if (isNaN(entry) || entry === 0 || isNaN(qty) || qty === 0) return null;

  const mult = getEffectiveMultiplier(trade);
  const dir = String(trade.direction || "long").toLowerCase();
  const grossPnl = dir === "long" ? (exit - entry) * qty * mult : (entry - exit) * qty * mult;

  // Base excursion is at least gross profit realized at exit
  let mfe = Math.max(0, grossPnl);

  // 1. Direct MFE field (e.g. from imported CSV or form input)
  if (trade.mfe != null && !isNaN(parseFloat(trade.mfe))) {
    const rawVal = Math.abs(parseFloat(trade.mfe));
    if (rawVal > 0) {
      if (entry > 0 && rawVal > entry * 0.1 && rawVal < entry * 3) {
        // Asset price level (e.g., 29,520.25 for entry 29,316.75)
        const pts = dir === "long" ? Math.max(0, rawVal - entry) : Math.max(0, entry - rawVal);
        mfe = Math.max(mfe, pts * qty * mult);
      } else {
        // Direct dollar excursion (e.g., $203.50)
        mfe = Math.max(mfe, rawVal);
      }
    }
  }

  // 2. maxPrice / minPrice fields
  const maxP = parseFloat(trade.maxPrice);
  const minP = parseFloat(trade.minPrice);

  if (!isNaN(maxP) && maxP > 0) {
    if (entry > 0 && maxP > entry * 0.1 && maxP < entry * 3) {
      if (dir === "long") mfe = Math.max(mfe, Math.max(0, maxP - entry) * qty * mult);
      else mfe = Math.max(mfe, Math.max(0, entry - maxP) * qty * mult);
    } else {
      mfe = Math.max(mfe, maxP);
    }
  }

  if (!isNaN(minP) && minP > 0) {
    if (entry > 0 && minP > entry * 0.1 && minP < entry * 3) {
      if (dir === "short") mfe = Math.max(mfe, Math.max(0, entry - minP) * qty * mult);
    }
  }

  return mfe;
}

export function calcMae(trade) {
  if (isSkippedTrade(trade)) return null;
  if (!trade.entryPrice || !trade.qty) return null;

  const entry = parseFloat(trade.entryPrice);
  const qty = parseFloat(trade.qty);
  const exit = parseFloat(trade.exitPrice) || entry;
  if (isNaN(entry) || entry === 0 || isNaN(qty) || qty === 0) return null;

  const mult = getEffectiveMultiplier(trade);
  const dir = String(trade.direction || "long").toLowerCase();
  const grossPnl = dir === "long" ? (exit - entry) * qty * mult : (entry - exit) * qty * mult;

  // Base adverse excursion is at least gross loss realized at exit
  let mae = Math.max(0, -grossPnl);

  if (trade.mae != null && !isNaN(parseFloat(trade.mae))) {
    const rawVal = Math.abs(parseFloat(trade.mae));
    if (rawVal > 0) {
      if (entry > 0 && rawVal > entry * 0.1 && rawVal < entry * 3) {
        const pts = dir === "long" ? Math.max(0, entry - rawVal) : Math.max(0, rawVal - entry);
        mae = Math.max(mae, pts * qty * mult);
      } else {
        mae = Math.max(mae, rawVal);
      }
    }
  }

  const maxP = parseFloat(trade.maxPrice);
  const minP = parseFloat(trade.minPrice);

  if (!isNaN(minP) && minP > 0) {
    if (entry > 0 && minP > entry * 0.1 && minP < entry * 3) {
      if (dir === "long") mae = Math.max(mae, Math.max(0, entry - minP) * qty * mult);
      else mae = Math.max(mae, Math.max(0, minP - entry) * qty * mult);
    } else {
      mae = Math.max(mae, minP);
    }
  }

  if (!isNaN(maxP) && maxP > 0) {
    if (entry > 0 && maxP > entry * 0.1 && maxP < entry * 3) {
      if (dir === "short") mae = Math.max(mae, Math.max(0, maxP - entry) * qty * mult);
    }
  }

  return mae;
}

export function isRevengeTrade(trade, allTrades) {
  if (!isExecutedTrade(trade)) return false;
  const accId = trade.accountId || "Personal";
  const sorted = [...allTrades]
    .filter(t => isExecutedTrade(t) && (t.accountId || "Personal") === accId)
    .sort((a, b) => new Date(a.exitDateTime) - new Date(b.exitDateTime));
  const idx = sorted.findIndex(t => t.id === trade.id);
  if (idx <= 0) return false;
  
  const prevTrade = sorted[idx - 1];
  const prevPnl = calcNetPnl(prevTrade);
  if (prevPnl >= 0) return false; // previous trade was a profit/breakeven
  
  const prevExit = new Date(prevTrade.exitDateTime);
  const currentEntry = new Date(trade.entryDateTime);
  const timeDiffMins = (currentEntry - prevExit) / 60000;
  
  // Flag if taken within 15 minutes of a loss OR if size is increased after a loss
  if (timeDiffMins > 0 && timeDiffMins <= 15) {
    return true;
  }
  if (trade.qty > prevTrade.qty && timeDiffMins > 0 && timeDiffMins <= 60) {
    return true; // Size increase within 1 hour of loss
  }
  return false;
}

export function calcDailySequence(trades) {
  // Group trades by day (YYYY-MM-DD)
  const days = {};
  trades.forEach(t => {
    if (isSkippedTrade(t) || !t.entryDateTime) return;
    const dateStr = t.entryDateTime.split('T')[0];
    if (!days[dateStr]) days[dateStr] = [];
    days[dateStr].push(t);
  });
  
  // Sort trades in each day chronologically and assign sequence
  const sequenceMap = {};
  Object.keys(days).forEach(d => {
    days[d].sort((a, b) => new Date(a.entryDateTime) - new Date(b.entryDateTime));
    days[d].forEach((t, i) => {
      sequenceMap[t.id] = i + 1; // 1st, 2nd, 3rd, etc.
    });
  });
  return sequenceMap;
}

export function calcPostLossPerformance(trades) {
  const sorted = [...trades]
    .filter(t => isExecutedTrade(t))
    .sort((a, b) => new Date(a.exitDateTime) - new Date(b.exitDateTime));
    
  let afterWinCount = 0;
  let afterWinPnl = 0;
  let afterWinWins = 0;
  
  let afterLossCount = 0;
  let afterLossPnl = 0;
  let afterLossWins = 0;
  
  for (let i = 1; i < sorted.length; i++) {
    const prevTrade = sorted[i - 1];
    const currentTrade = sorted[i];
    const prevNet = calcNetPnl(prevTrade);
    const currentNet = calcNetPnl(currentTrade);
    
    if (prevNet > 0) {
      afterWinCount++;
      afterWinPnl += currentNet;
      if (currentNet > 0) afterWinWins++;
    } else if (prevNet < 0) {
      afterLossCount++;
      afterLossPnl += currentNet;
      if (currentNet > 0) afterLossWins++;
    }
  }
  
  return {
    afterWin: {
      count: afterWinCount,
      pnl: afterWinPnl,
      winRate: afterWinCount > 0 ? (afterWinWins / afterWinCount) * 100 : 0,
      avgPnl: afterWinCount > 0 ? afterWinPnl / afterWinCount : 0
    },
    afterLoss: {
      count: afterLossCount,
      pnl: afterLossPnl,
      winRate: afterLossCount > 0 ? (afterLossWins / afterLossCount) * 100 : 0,
      avgPnl: afterLossCount > 0 ? afterLossPnl / afterLossCount : 0
    }
  };
}

export function calcDrawdownDurations(trades, startingBalance = 25000) {
  const sorted = [...trades]
    .filter(t => !isSkippedTrade(t))
    .sort((a, b) => new Date(a.exitDateTime) - new Date(b.exitDateTime));
    
  if (sorted.length === 0) {
    return {
      maxCompletedTrades: 0,
      maxCompletedDays: 0,
      maxDeclineTrades: 0,
      maxDeclineDays: 0,
      currentDrawdownTrades: 0,
      currentDrawdownDays: 0,
      currentDeclineTrades: 0,
      currentDeclineDays: 0
    };
  }

  let current = startingBalance;
  const lineData = [startingBalance];
  sorted.forEach(t => {
    current += calcNetPnl(t);
    lineData.push(current);
  });

  const athIndices = [0];
  let runningMax = lineData[0];
  for (let i = 1; i < lineData.length; i++) {
    if (lineData[i] > runningMax) {
      athIndices.push(i);
      runningMax = lineData[i];
    }
  }

  const hasCurrentDd = athIndices[athIndices.length - 1] !== lineData.length - 1;
  if (hasCurrentDd) {
    athIndices.push(lineData.length - 1);
  }

  const getDateOfIdx = (idx) => {
    if (idx === 0) {
      return new Date(sorted[0].exitDateTime);
    }
    return new Date(sorted[idx - 1].exitDateTime);
  };

  const completedRecovery = [];
  const completedDecline = [];
  
  let currentDrawdownTrades = 0;
  let currentDrawdownDays = 0;
  let currentDeclineTrades = 0;
  let currentDeclineDays = 0;

  for (let k = 0; k < athIndices.length - 1; k++) {
    const idx1 = athIndices[k];
    const idx2 = athIndices[k + 1];
    
    // Find absolute minimum in [idx1, idx2]
    let troughIdx = idx1;
    let minVal = lineData[idx1];
    for (let j = idx1 + 1; j <= idx2; j++) {
      if (lineData[j] < minVal) {
        minVal = lineData[j];
        troughIdx = j;
      }
    }

    const isLastInterval = (k === athIndices.length - 2);
    const isOngoing = isLastInterval && hasCurrentDd;

    const standardTrades = idx2 - idx1;
    const standardDays = Math.max(0.1, (getDateOfIdx(idx2) - getDateOfIdx(idx1)) / (1000 * 60 * 60 * 24));
    
    const declineTrades = troughIdx - idx1;
    const declineDays = Math.max(0.1, (getDateOfIdx(troughIdx) - getDateOfIdx(idx1)) / (1000 * 60 * 60 * 24));

    if (isOngoing) {
      currentDrawdownTrades = standardTrades;
      currentDrawdownDays = standardDays;
      currentDeclineTrades = declineTrades;
      currentDeclineDays = declineDays;
    } else {
      if (standardTrades > 0) {
        completedRecovery.push({ trades: standardTrades, days: standardDays });
        completedDecline.push({ trades: declineTrades, days: declineDays });
      }
    }
  }

  const maxCompletedTrades = completedRecovery.reduce((max, d) => Math.max(max, d.trades), 0);
  const maxCompletedDays = completedRecovery.reduce((max, d) => Math.max(max, d.days), 0);
  const maxDeclineTrades = completedDecline.reduce((max, d) => Math.max(max, d.trades), 0);
  const maxDeclineDays = completedDecline.reduce((max, d) => Math.max(max, d.days), 0);

  return {
    maxCompletedTrades,
    maxCompletedDays: parseFloat(maxCompletedDays.toFixed(1)),
    maxDeclineTrades,
    maxDeclineDays: parseFloat(maxDeclineDays.toFixed(1)),
    currentDrawdownTrades,
    currentDrawdownDays: parseFloat(currentDrawdownDays.toFixed(1)),
    currentDeclineTrades,
    currentDeclineDays: parseFloat(currentDeclineDays.toFixed(1))
  };
}

export function calcStreakProbability(trades) {
  const count = trades.filter(t => isExecutedTrade(t)).length;
  if (count === 0) return { expectedWin: 0, expectedLoss: 0, actualWin: 0, actualLoss: 0 };
  
  const winRate = calcWinRate(trades.filter(t => isExecutedTrade(t))) / 100;
  const lossRate = 1 - winRate;
  
  // Expected streak lengths based on geometric/streak approximation formula:
  // Expected max streak of wins: log(N) / log(1/p)
  // Expected max streak of losses: log(N) / log(1/q)
  const expectedWin = winRate > 0 && winRate < 1 ? Math.log(count) / Math.log(1 / winRate) : (winRate === 1 ? count : 0);
  const expectedLoss = lossRate > 0 && lossRate < 1 ? Math.log(count) / Math.log(1 / lossRate) : (lossRate === 1 ? count : 0);
  
  const streaks = calcStreaks(trades);
  
  return {
    expectedWin: parseFloat(expectedWin.toFixed(1)),
    expectedLoss: parseFloat(expectedLoss.toFixed(1)),
    actualWin: streaks.bestWinStreak,
    actualLoss: streaks.worstLossStreak
  };
}

export function calcAdvancedDrawdownMetrics(trades, startingBalance = 25000) {
  const sorted = [...trades]
    .filter(t => !isSkippedTrade(t))
    .sort((a, b) => new Date(a.exitDateTime) - new Date(b.exitDateTime));
    
  if (sorted.length === 0) {
    return {
      ulcerIndex: 0,
      painIndex: 0,
      painRatio: 0,
      avgTtrDays: 0,
      avgTtrTrades: 0,
      avgDeclineSpeed: 0,
      avgRecoverySpeed: 0,
      elevatorIndex: 0
    };
  }

  let current = startingBalance;
  const lineData = [startingBalance];
  sorted.forEach(t => {
    current += calcNetPnl(t);
    lineData.push(current);
  });

  const athIndices = [0];
  let runningMax = lineData[0];
  
  let sumSqDrawdown = 0;
  let sumDrawdown = 0;
  const N = lineData.length;

  for (let i = 0; i < N; i++) {
    const val = lineData[i];
    if (val > runningMax) {
      runningMax = val;
    }
    const ddVal = runningMax - val;
    const ddPct = (ddVal / startingBalance) * 100;
    sumSqDrawdown += ddPct * ddPct;
    sumDrawdown += ddPct;
  }

  const ulcerIndex = Math.sqrt(sumSqDrawdown / N);
  const painIndex = sumDrawdown / N;

  const totalPnl = current - startingBalance;
  const totalPnlPct = (totalPnl / startingBalance) * 100;
  const painRatio = painIndex > 0 ? (totalPnlPct / painIndex) : (totalPnlPct > 0 ? 99.9 : 0);

  // ATH intervals
  let peakMax = lineData[0];
  for (let i = 1; i < lineData.length; i++) {
    if (lineData[i] > peakMax) {
      athIndices.push(i);
      peakMax = lineData[i];
    }
  }
  if (athIndices[athIndices.length - 1] !== lineData.length - 1) {
    athIndices.push(lineData.length - 1);
  }

  const getDateOfIdx = (idx) => {
    if (idx === 0) {
      return new Date(sorted[0].exitDateTime);
    }
    return new Date(sorted[idx - 1].exitDateTime);
  };

  const completedTtrDays = [];
  const completedTtrTrades = [];
  const declineSpeeds = [];
  const recoverySpeeds = [];

  for (let k = 0; k < athIndices.length - 1; k++) {
    const idx1 = athIndices[k];
    const idx2 = athIndices[k + 1];
    
    let troughIdx = idx1;
    let minVal = lineData[idx1];
    for (let j = idx1 + 1; j <= idx2; j++) {
      if (lineData[j] < minVal) {
        minVal = lineData[j];
        troughIdx = j;
      }
    }

    const hasCurrentDd = athIndices[athIndices.length - 1] !== lineData.length - 1;
    const isLastInterval = (k === athIndices.length - 2);
    const isOngoing = isLastInterval && hasCurrentDd;

    const standardTrades = idx2 - idx1;
    const standardDays = (getDateOfIdx(idx2) - getDateOfIdx(idx1)) / (1000 * 60 * 60 * 24);

    if (!isOngoing && standardTrades > 0) {
      completedTtrDays.push(standardDays);
      completedTtrTrades.push(standardTrades);
    }

    const declineTrades = troughIdx - idx1;
    const declineDays = (getDateOfIdx(troughIdx) - getDateOfIdx(idx1)) / (1000 * 60 * 60 * 24);
    const declineChange = lineData[troughIdx] - lineData[idx1];

    if (declineTrades > 0 && declineChange < 0) {
      const speed = Math.abs(declineChange) / Math.max(0.1, declineDays);
      declineSpeeds.push(speed);
    }

    const recoveryTrades = idx2 - troughIdx;
    const recoveryDays = (getDateOfIdx(idx2) - getDateOfIdx(troughIdx)) / (1000 * 60 * 60 * 24);
    const recoveryChange = lineData[idx2] - lineData[troughIdx];

    if (recoveryTrades > 0 && recoveryChange > 0) {
      const speed = recoveryChange / Math.max(0.1, recoveryDays);
      recoverySpeeds.push(speed);
    }
  }

  const avgTtrDays = completedTtrDays.length > 0 
    ? completedTtrDays.reduce((sum, v) => sum + v, 0) / completedTtrDays.length 
    : 0;
  const avgTtrTrades = completedTtrTrades.length > 0 
    ? completedTtrTrades.reduce((sum, v) => sum + v, 0) / completedTtrTrades.length 
    : 0;

  const avgDeclineSpeed = declineSpeeds.length > 0 
    ? declineSpeeds.reduce((sum, v) => sum + v, 0) / declineSpeeds.length 
    : 0;
  const avgRecoverySpeed = recoverySpeeds.length > 0 
    ? recoverySpeeds.reduce((sum, v) => sum + v, 0) / recoverySpeeds.length 
    : 0;

  const elevatorIndex = avgRecoverySpeed > 0 ? avgDeclineSpeed / avgRecoverySpeed : 0;

  return {
    ulcerIndex: parseFloat(ulcerIndex.toFixed(2)),
    painIndex: parseFloat(painIndex.toFixed(2)),
    painRatio: parseFloat(painRatio.toFixed(2)),
    avgTtrDays: parseFloat(avgTtrDays.toFixed(1)),
    avgTtrTrades: parseFloat(avgTtrTrades.toFixed(1)),
    avgDeclineSpeed: parseFloat(avgDeclineSpeed.toFixed(2)),
    avgRecoverySpeed: parseFloat(avgRecoverySpeed.toFixed(2)),
    elevatorIndex: parseFloat(elevatorIndex.toFixed(2))
  };
}

export function calcDrawdownContributions(trades, startingBalance = 25000) {
  const sorted = [...trades]
    .filter(t => !isSkippedTrade(t))
    .sort((a, b) => new Date(a.exitDateTime) - new Date(b.exitDateTime));

  if (sorted.length === 0) {
    return { setup: [], mistake: [], symbol: [], totalDeclineLoss: 0 };
  }

  let current = startingBalance;
  const lineData = [startingBalance];
  sorted.forEach(t => {
    current += calcNetPnl(t);
    lineData.push(current);
  });

  const athIndices = [0];
  let runningMax = lineData[0];
  for (let i = 1; i < lineData.length; i++) {
    if (lineData[i] > runningMax) {
      athIndices.push(i);
      runningMax = lineData[i];
    }
  }
  if (athIndices[athIndices.length - 1] !== lineData.length - 1) {
    athIndices.push(lineData.length - 1);
  }

  const declineTradeIds = new Set();
  
  for (let k = 0; k < athIndices.length - 1; k++) {
    const idx1 = athIndices[k];
    const idx2 = athIndices[k + 1];
    
    let troughIdx = idx1;
    let minVal = lineData[idx1];
    for (let j = idx1 + 1; j <= idx2; j++) {
      if (lineData[j] < minVal) {
        minVal = lineData[j];
        troughIdx = j;
      }
    }
    
    for (let j = idx1 + 1; j <= troughIdx; j++) {
      const trade = sorted[j - 1];
      if (trade) {
        declineTradeIds.add(trade.id);
      }
    }
  }

  const declineTrades = sorted.filter(t => declineTradeIds.has(t.id));

  const setupGroups = {};
  const mistakeGroups = {};
  const symbolGroups = {};

  declineTrades.forEach(t => {
    const pnl = calcNetPnl(t);
    
    const setup = t.setup || "Unspecified";
    if (!setupGroups[setup]) setupGroups[setup] = { pnl: 0, count: 0 };
    setupGroups[setup].pnl += pnl;
    setupGroups[setup].count += 1;

    const mistake = t.mistake || "None";
    if (!mistakeGroups[mistake]) mistakeGroups[mistake] = { pnl: 0, count: 0 };
    mistakeGroups[mistake].pnl += pnl;
    mistakeGroups[mistake].count += 1;

    const symbol = t.symbol || "Unknown";
    if (!symbolGroups[symbol]) symbolGroups[symbol] = { pnl: 0, count: 0 };
    symbolGroups[symbol].pnl += pnl;
    symbolGroups[symbol].count += 1;
  });

  const getSortedContributions = (groups) => {
    const negativeGroups = Object.entries(groups)
      .map(([name, data]) => ({ name, pnl: data.pnl, count: data.count }))
      .filter(g => g.pnl < 0);

    const totalNegPnl = negativeGroups.reduce((sum, g) => sum + g.pnl, 0);

    return negativeGroups
      .map(g => ({
        name: g.name,
        pnl: g.pnl,
        count: g.count,
        contribution: totalNegPnl < 0 ? (g.pnl / totalNegPnl) * 100 : 0
      }))
      .sort((a, b) => a.pnl - b.pnl);
  };

  return {
    setup: getSortedContributions(setupGroups),
    mistake: getSortedContributions(mistakeGroups),
    symbol: getSortedContributions(symbolGroups),
    totalDeclineLoss: declineTrades.reduce((sum, t) => sum + calcNetPnl(t), 0)
  };
}

export function calcHoldTimeDiagnostics(trades) {
  const executed = trades.filter(t => !isSkippedTrade(t));
  
  let winSum = 0;
  let winCount = 0;
  let lossSum = 0;
  let lossCount = 0;

  executed.forEach(t => {
    if (!t.entryDateTime || !t.exitDateTime) return;
    const durationMins = (new Date(t.exitDateTime) - new Date(t.entryDateTime)) / (1000 * 60);
    const pnl = calcNetPnl(t);
    
    if (pnl > 0) {
      winSum += durationMins;
      winCount++;
    } else if (pnl < 0) {
      lossSum += durationMins;
      lossCount++;
    }
  });

  const avgWinMins = winCount > 0 ? winSum / winCount : 0;
  const avgLossMins = lossCount > 0 ? lossSum / lossCount : 0;
  const holdTimeRatio = avgLossMins > 0 ? avgWinMins / avgLossMins : (avgWinMins > 0 ? 99.9 : 1.0);

  return {
    avgWinMins: parseFloat(avgWinMins.toFixed(1)),
    avgLossMins: parseFloat(avgLossMins.toFixed(1)),
    holdTimeRatio: parseFloat(holdTimeRatio.toFixed(2))
  };
}

export function calcFatiguePivotData(trades) {
  const executed = trades.filter(t => !isSkippedTrade(t));
  
  const dayGroups = {};
  executed.forEach(t => {
    if (!t.entryDateTime) return;
    const dateStr = t.entryDateTime.split("T")[0];
    if (!dayGroups[dateStr]) dayGroups[dateStr] = [];
    dayGroups[dateStr].push(t);
  });

  const sequenceGroups = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  
  Object.values(dayGroups).forEach(dayTrades => {
    const sorted = [...dayTrades].sort((a, b) => new Date(a.entryDateTime) - new Date(b.entryDateTime));
    sorted.forEach((t, i) => {
      const seq = Math.min(5, i + 1);
      sequenceGroups[seq].push(t);
    });
  });

  const sequenceExpectancies = {};
  const sequenceCounts = {};
  const sequenceWinRates = {};

  for (let s = 1; s <= 5; s++) {
    const group = sequenceGroups[s];
    if (group.length > 0) {
      const totalPnl = group.reduce((sum, t) => sum + calcNetPnl(t), 0);
      const wins = group.filter(t => calcNetPnl(t) > 0).length;
      sequenceExpectancies[s] = totalPnl / group.length;
      sequenceCounts[s] = group.length;
      sequenceWinRates[s] = (wins / group.length) * 100;
    } else {
      sequenceExpectancies[s] = 0;
      sequenceCounts[s] = 0;
      sequenceWinRates[s] = null; // null = no data for that bucket
    }
  }

  let pivot = null;
  for (let s = 1; s <= 5; s++) {
    let allNegative = true;
    let hasData = false;
    for (let k = s; k <= 5; k++) {
      if (sequenceCounts[k] > 0) {
        hasData = true;
        if (sequenceExpectancies[k] >= 0) {
          allNegative = false;
        }
      }
    }
    if (allNegative && hasData) {
      pivot = s;
      break;
    }
  }

  return {
    sequenceExpectancies,
    sequenceCounts,
    sequenceWinRates,
    pivot
  };
}

export function calcSetupMistakeMatrix(trades) {
  const executed = trades.filter(t => !isSkippedTrade(t));
  
  const setups = [...new Set(executed.map(t => t.setup || "Unspecified"))].sort();
  const mistakes = [...new Set(executed.map(t => t.mistake || "None"))].sort();
  
  if (!mistakes.includes("None")) {
    mistakes.unshift("None");
  } else {
    const idx = mistakes.indexOf("None");
    mistakes.splice(idx, 1);
    mistakes.unshift("None");
  }

  const matrix = {};
  setups.forEach(s => {
    matrix[s] = {};
    mistakes.forEach(m => {
      matrix[s][m] = { pnl: 0, count: 0 };
    });
  });

  executed.forEach(t => {
    const s = t.setup || "Unspecified";
    const m = t.mistake || "None";
    const pnl = calcNetPnl(t);
    
    if (matrix[s] && matrix[s][m]) {
      matrix[s][m].pnl += pnl;
      matrix[s][m].count += 1;
    }
  });

  return {
    setups,
    mistakes,
    matrix
  };
}

export function runMonteCarloSimulation(trades, startingBalance = 25000, numRuns = 500, customHorizon = null) {
  const executed = trades
    .filter(t => !isSkippedTrade(t))
    .sort((a, b) => new Date(a.exitDateTime || a.entryDateTime) - new Date(b.exitDateTime || b.entryDateTime));

  const actualTradeCount = executed.length;
  const horizon = customHorizon || Math.max(50, actualTradeCount);

  if (actualTradeCount === 0) {
    return {
      runs: [],
      p95: Array(horizon + 1).fill(startingBalance),
      p50: Array(horizon + 1).fill(startingBalance),
      p5: Array(horizon + 1).fill(startingBalance),
      actualEquityPath: [startingBalance],
      actualFinalEquity: startingBalance,
      actualPercentileRank: 50,
      maxDrawdowns: [],
      profitProbability: 0,
      avgFinalEquity: startingBalance,
      horizon,
      actualTradeCount: 0
    };
  }

  const returns = executed.map(t => calcNetPnl(t));
  const runs = [];
  const maxDrawdowns = [];

  for (let r = 0; r < numRuns; r++) {
    const path = [startingBalance];
    let peak = startingBalance;
    let maxDd = 0;

    for (let i = 0; i < horizon; i++) {
      const randomReturn = returns[Math.floor(Math.random() * returns.length)];
      const currentEq = Math.max(0, path[path.length - 1] + randomReturn);
      path.push(currentEq);

      if (currentEq > peak) peak = currentEq;
      const dd = peak > 0 ? (peak - currentEq) / peak : 0;
      if (dd > maxDd) maxDd = dd;
    }

    runs.push(path);
    maxDrawdowns.push(maxDd);
  }

  // Calculate actual cumulative equity path
  const actualEquityPath = [startingBalance];
  let currentActual = startingBalance;
  for (const t of executed) {
    currentActual += calcNetPnl(t);
    actualEquityPath.push(currentActual);
  }
  const actualFinalEquity = currentActual;

  // Calculate percentiles at each step
  const p95 = [];
  const p50 = [];
  const p5 = [];

  for (let step = 0; step <= horizon; step++) {
    const stepValues = runs.map(run => run[step]).sort((a, b) => a - b);
    p5.push(stepValues[Math.floor(numRuns * 0.05)]);
    p50.push(stepValues[Math.floor(numRuns * 0.50)]);
    p95.push(stepValues[Math.floor(numRuns * 0.95)]);
  }

  // Compare actual performance against simulated paths at step N
  const compareStep = Math.min(actualTradeCount, horizon);
  const simAtCompareStep = runs.map(run => run[compareStep]).sort((a, b) => a - b);
  const lesserOrEqualCount = simAtCompareStep.filter(val => val <= actualFinalEquity).length;
  const actualPercentileRank = Math.round((lesserOrEqualCount / numRuns) * 100);

  const profitableRuns = runs.filter(run => run[run.length - 1] > startingBalance).length;
  const profitProbability = (profitableRuns / numRuns) * 100;
  const avgFinalEquity = runs.reduce((sum, run) => sum + run[run.length - 1], 0) / numRuns;

  return {
    runs: runs.slice(0, 30), // Sample paths for visualization
    p95,
    p50,
    p5,
    actualEquityPath,
    actualFinalEquity,
    actualPercentileRank,
    maxDrawdowns,
    profitProbability,
    avgFinalEquity,
    horizon,
    actualTradeCount
  };
}

export function calcPsychologyAnalytics(trades) {
  const executed = trades.filter(t => !isSkippedTrade(t));
  
  const emotionStats = {};
  const gradeStats = {};

  const emotions = ["Disciplined", "FOMO", "Revenge", "Hesitant", "Greedy", "Anxious", "Unspecified"];
  const grades = ["A+", "A", "B", "C", "D", "F", "Unspecified"];

  emotions.forEach(e => emotionStats[e] = { count: 0, wins: 0, pnl: 0, grossProfit: 0, grossLoss: 0 });
  grades.forEach(g => gradeStats[g] = { count: 0, wins: 0, pnl: 0, grossProfit: 0, grossLoss: 0 });

  executed.forEach(t => {
    const emo = t.emotionTag || "Unspecified";
    const grade = t.executionScore || "Unspecified";
    const pnl = calcNetPnl(t);

    if (!emotionStats[emo]) emotionStats[emo] = { count: 0, wins: 0, pnl: 0, grossProfit: 0, grossLoss: 0 };
    emotionStats[emo].count++;
    emotionStats[emo].pnl += pnl;
    if (pnl > 0) { emotionStats[emo].wins++; emotionStats[emo].grossProfit += pnl; }
    else if (pnl < 0) { emotionStats[emo].grossLoss += Math.abs(pnl); }

    if (!gradeStats[grade]) gradeStats[grade] = { count: 0, wins: 0, pnl: 0, grossProfit: 0, grossLoss: 0 };
    gradeStats[grade].count++;
    gradeStats[grade].pnl += pnl;
    if (pnl > 0) { gradeStats[grade].wins++; gradeStats[grade].grossProfit += pnl; }
    else if (pnl < 0) { gradeStats[grade].grossLoss += Math.abs(pnl); }
  });

  return { emotionStats, gradeStats };
}

export function generateEdgeInsights(trades) {
  const executed = trades.filter(t => !isSkippedTrade(t));
  if (executed.length < 3) {
    return [
      { type: "info", title: "Log More Trades", message: "Complete at least 3 executed trades to unlock automated edge detection & leak analysis." }
    ];
  }

  const insights = [];

  // 1. Setup Edge Analysis
  const setupPnl = {};
  executed.forEach(t => {
    const s = t.setup || "Unspecified";
    if (!setupPnl[s]) setupPnl[s] = { pnl: 0, wins: 0, count: 0 };
    const pnl = calcNetPnl(t);
    setupPnl[s].pnl += pnl;
    setupPnl[s].count++;
    if (pnl > 0) setupPnl[s].wins++;
  });

  let bestSetup = null;
  let bestSetupPnl = -Infinity;
  Object.entries(setupPnl).forEach(([s, data]) => {
    if (data.count >= 2 && data.pnl > bestSetupPnl) {
      bestSetupPnl = data.pnl;
      bestSetup = { name: s, ...data };
    }
  });

  if (bestSetup && bestSetup.pnl > 0) {
    const wr = Math.round((bestSetup.wins / bestSetup.count) * 100);
    insights.push({
      type: "success",
      title: `Highest Performing Edge: ${bestSetup.name}`,
      message: `Your "${bestSetup.name}" setup is your top performer with ${wr}% win rate and +$${bestSetup.pnl.toLocaleString('en-US', {minimumFractionDigits: 2})} net profit.`
    });
  }

  // 2. Emotional Leak Analysis
  const { emotionStats } = calcPsychologyAnalytics(executed);
  let worstEmotion = null;
  let worstEmotionPnl = Infinity;
  Object.entries(emotionStats).forEach(([emo, data]) => {
    if (emo !== "Unspecified" && data.count >= 1 && data.pnl < worstEmotionPnl) {
      worstEmotionPnl = data.pnl;
      worstEmotion = { name: emo, ...data };
    }
  });

  if (worstEmotion && worstEmotion.pnl < 0) {
    insights.push({
      type: "warning",
      title: `Psychological Leak Detected: ${worstEmotion.name}`,
      message: `Trading under "${worstEmotion.name}" state has cost you -$${Math.abs(worstEmotion.pnl).toLocaleString('en-US', {minimumFractionDigits: 2})} across ${worstEmotion.count} trades.`
    });
  }

  // 3. Direction Preference
  const longPnl = executed.filter(t => t.direction === "long").reduce((acc, t) => acc + calcNetPnl(t), 0);
  const shortPnl = executed.filter(t => t.direction === "short").reduce((acc, t) => acc + calcNetPnl(t), 0);

  if (Math.abs(longPnl - shortPnl) > 300) {
    const strongDir = longPnl > shortPnl ? "LONG" : "SHORT";
    const weakDir = longPnl > shortPnl ? "SHORT" : "LONG";
    const diff = Math.abs(longPnl - shortPnl);
    insights.push({
      type: "info",
      title: `Directional Asymmetry: ${strongDir} Outperformance`,
      message: `You have generated +$${diff.toLocaleString('en-US', {minimumFractionDigits: 2})} more profit trading ${strongDir} positions compared to ${weakDir}.`
    });
  }

  return insights;
}

export function compressImage(file, maxWidth = 1000, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    
    // If already base64 or string URL
    if (typeof file === "string") return resolve(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error("Failed to load image."));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}


export function isExecutedTrade(trade) {
  if (!trade) return false;
  return !isSkippedTrade(trade);
}

export function isSkippedTrade(trade) {
  if (!trade) return false;
  const s = String(trade.status || "").toLowerCase().trim();
  return s === "skipped" || s === "cancelled" || s === "canceled" || s === "rejected" || s === "invalid";
}
