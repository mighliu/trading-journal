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
  if (trade.status === "skipped") return 0;
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
  const qty = parseFloat(trade.qty) || 0;
  const signalEntry = parseFloat(trade.signalEntryPrice);
  const entry = !isNaN(signalEntry) ? signalEntry : (parseFloat(trade.entryPrice) || 0);
  const signalExit = parseFloat(trade.signalExitPrice);
  const exit = !isNaN(signalExit) ? signalExit : (parseFloat(trade.exitPrice) || 0);
  const directionMultiplier = trade.direction === "long" ? 1 : -1;
  const fees = parseFloat(trade.fees) || 0;

  let multiplier = getEffectiveMultiplier(trade);

  return (exit - entry) * qty * multiplier * directionMultiplier - fees;
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
    const pnl = t.status === "skipped" ? calcSignalPnl(t) : calcNetPnl(t);
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
      return { start: new Date(0), end };
    default:
      // Default to allTime if preset not recognized
      return { start: new Date(0), end };
  }
  
  return { start, end };
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
      d = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
    }
  } else {
    const str = String(dateVal).trim();
    const num = Number(str);
    if (str && !isNaN(num)) {
      if (num > 10000000000) {
        d = new Date(num < 1000000000000 ? num * 1000 : num);
      } else {
        d = new Date(Math.round((num - 25569) * 86400 * 1000));
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
  const sorted = [...trades].filter(t => t.status !== "skipped" && t.exitDateTime)
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
    if (t.status === "skipped") {
      if (t.signalEntryPrice != null && t.signalExitPrice != null) {
        strategyTotal += calcSignalPnl(t);
      }
    } else {
      if (t.signalEntryPrice != null && t.signalExitPrice != null) {
        strategyTotal += calcSignalPnl(t);
      } else {
        strategyTotal += calcNetPnl(t);
      }
    }
  }

  return {
    actualTotal,
    strategyTotal,
    delta: actualTotal - strategyTotal
  };
}

export function hasSevereDeviation(trade) {
  if (trade.status === "skipped") return true;
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
    const sigPnl = t.signalEntryPrice != null && t.signalExitPrice != null ? calcSignalPnl(t) : actPnl;
    
    if (t.status === "skipped") {
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
    if (t.status === "executed") {
      if (actNet > 0) {
        actualWins++;
        actualGrossWins += actNet;
      } else if (actNet < 0) {
        actualLosses++;
        actualGrossLosses += Math.abs(actNet);
      }
    }

    let stratNet = 0;
    if (t.status === "skipped") {
      stratNet = t.signalEntryPrice != null && t.signalExitPrice != null ? calcSignalPnl(t) : 0;
    } else {
      stratNet = t.signalEntryPrice != null && t.signalExitPrice != null ? calcSignalPnl(t) : actNet;
    }
    strategyTotalPnl += stratNet;
    if (stratNet > 0) {
      strategyWins++;
      strategyGrossWins += stratNet;
    } else if (stratNet < 0) {
      strategyLosses++;
      strategyGrossLosses += Math.abs(stratNet);
    }
  }

  const actualCount = trades.filter(t => t.status === "executed").length;
  const strategyCount = trades.length;

  const actualWinRate = actualCount > 0 ? (actualWins / actualCount) * 100 : 0;
  const strategyWinRate = strategyCount > 0 ? (strategyWins / strategyCount) * 100 : 0;

  const actualProfitFactor = actualGrossLosses === 0 ? (actualGrossWins > 0 ? 99.9 : 0) : actualGrossWins / actualGrossLosses;
  const strategyProfitFactor = strategyGrossLosses === 0 ? (strategyGrossWins > 0 ? 99.9 : 0) : strategyGrossWins / strategyGrossLosses;

  const actualAvg = actualCount > 0 ? actualTotalPnl / actualCount : 0;
  const strategyAvg = strategyCount > 0 ? strategyTotalPnl / strategyCount : 0;

  const actualSharpe = calcSharpeRatio(trades.filter(t => t.status === "executed"), startingBalance);
  const actualSortino = calcSortinoRatio(trades.filter(t => t.status === "executed"), startingBalance);

  const strategyTrades = trades.map(t => {
    let stratPnl = 0;
    if (t.status === "skipped") {
      stratPnl = t.signalEntryPrice != null && t.signalExitPrice != null ? calcSignalPnl(t) : 0;
    } else {
      stratPnl = t.signalEntryPrice != null && t.signalExitPrice != null ? calcSignalPnl(t) : calcNetPnl(t);
    }
    return {
      status: "executed",
      direction: "long",
      entryPrice: stratPnl >= 0 ? 0 : 1,
      exitPrice: stratPnl >= 0 ? 1 : 0,
      qty: Math.abs(stratPnl),
      fees: 0,
      symbol: "STRAT",
      entryDateTime: t.entryDateTime
    };
  });
  const strategySharpe = calcSharpeRatio(strategyTrades, startingBalance);
  const strategySortino = calcSortinoRatio(strategyTrades, startingBalance);

  const actualDrawdown = calcMaxDrawdown(trades.filter(t => t.status === "executed"), startingBalance);
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
  if (!trade.entryPrice || trade.status === "skipped") return null;
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
  if (!trade.entryPrice || trade.status === "skipped") return null;
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
  if (trade.status === "skipped") return null;
  if (trade.mfe != null && !isNaN(parseFloat(trade.mfe))) {
    return parseFloat(trade.mfe);
  }
  
  if (!trade.entryPrice || !trade.qty) return null;
  const entry = parseFloat(trade.entryPrice);
  const qty = parseFloat(trade.qty);
  const exit = parseFloat(trade.exitPrice) || 0;
  if (isNaN(entry) || entry === 0 || isNaN(qty) || qty === 0) return null;
  
  const mult = getEffectiveMultiplier(trade);
  
  if (trade.direction === "long") {
    if (!trade.maxPrice) return null;
    const rawMax = parseFloat(trade.maxPrice);
    if (isNaN(rawMax)) return null;
    const maxVal = Math.max(rawMax, entry, exit);
    return (maxVal - entry) * qty * mult;
  } else {
    if (!trade.minPrice) return null;
    const rawMin = parseFloat(trade.minPrice);
    if (isNaN(rawMin) || rawMin === 0) return null;
    const minVal = Math.min(rawMin, entry, exit);
    return (entry - minVal) * qty * mult;
  }
}

export function calcMae(trade) {
  if (trade.status === "skipped") return null;
  if (trade.mae != null && !isNaN(parseFloat(trade.mae))) {
    return parseFloat(trade.mae);
  }
  
  if (!trade.entryPrice || !trade.qty) return null;
  const entry = parseFloat(trade.entryPrice);
  const qty = parseFloat(trade.qty);
  const exit = parseFloat(trade.exitPrice) || 0;
  if (isNaN(entry) || entry === 0 || isNaN(qty) || qty === 0) return null;
  
  const mult = getEffectiveMultiplier(trade);
  
  if (trade.direction === "long") {
    if (!trade.minPrice) return null;
    const rawMin = parseFloat(trade.minPrice);
    if (isNaN(rawMin)) return null;
    const minVal = Math.min(rawMin, entry, exit);
    return (entry - minVal) * qty * mult;
  } else {
    if (!trade.maxPrice) return null;
    const rawMax = parseFloat(trade.maxPrice);
    if (isNaN(rawMax)) return null;
    const maxVal = Math.max(rawMax, entry, exit);
    return (maxVal - entry) * qty * mult;
  }
}

export function isRevengeTrade(trade, allTrades) {
  if (trade.status !== "executed") return false;
  const sorted = [...allTrades]
    .filter(t => t.status === "executed")
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
    if (t.status === "skipped" || !t.entryDateTime) return;
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
    .filter(t => t.status === "executed")
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
    .filter(t => t.status !== "skipped" && t.status !== "draft")
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
  const count = trades.filter(t => t.status === "executed").length;
  if (count === 0) return { expectedWin: 0, expectedLoss: 0, actualWin: 0, actualLoss: 0 };
  
  const winRate = calcWinRate(trades.filter(t => t.status === "executed")) / 100;
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
