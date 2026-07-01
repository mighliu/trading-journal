import {
  calcNetPnl,
  calcWinRate,
  calcSignalPnl,
  calcInterventionMetrics,
  hasSevereDeviation,
  calcDuration,
  calcMfePct,
  calcMaePct,
  calcRiskReward,
  calcDailySequence,
  calcPostLossPerformance,
  calcProfitFactor
} from './utils.js';

const chartInstances = {};

function getTradePnl(t) {
  if (t.status === "skipped") {
    return calcSignalPnl(t) || 0;
  }
  return calcNetPnl(t);
}

function destroyChart(canvasId) {
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
    delete chartInstances[canvasId];
  }
  const canvas = document.getElementById(canvasId);
  if (canvas) {
    try {
      const existing = Chart.getChart(canvas);
      if (existing) {
        existing.destroy();
      }
    } catch (e) {
      console.warn("Error finding chart for canvas", canvasId, e);
    }
  }
}

export function destroyAllCharts() {
  Object.keys(chartInstances).forEach(canvasId => destroyChart(canvasId));
}

function renderEmptyChartMessage(canvasId, message) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width || 300;
  const height = canvas.height || 150;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = document.body.classList.contains("light-theme") ? "#71717a" : "#a1a1aa";
  ctx.font = "13px Inter, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, width / 2, height / 2);
}

function getGridColor() {
  return document.body.classList.contains("light-theme") ? "rgba(0, 0, 0, 0.06)" : "#1f1f23";
}

function getTickColor() {
  return document.body.classList.contains("light-theme") ? "#71717a" : "#a1a1aa";
}

function getTooltipBg() {
  return document.body.classList.contains("light-theme") ? "#ffffff" : "#18181b";
}

function getTooltipBorder() {
  return document.body.classList.contains("light-theme") ? "#e4e4e7" : "#27272a";
}

function getTooltipTextColor() {
  return document.body.classList.contains("light-theme") ? "#18181b" : "#fafafa";
}

export function renderEquityCurve(trades, startingBalance = 25000) {
  const canvasId = "equityCurveChart";
  destroyChart(canvasId);
  
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Sort trades by exit datetime ascending
  const sortedTrades = [...trades].sort((a, b) => new Date(a.exitDateTime) - new Date(b.exitDateTime));

  let currentBalance = startingBalance;
  const labels = ["Start"];
  const data = [startingBalance];

  for (const trade of sortedTrades) {
    currentBalance += calcNetPnl(trade);
    const dateStr = new Date(trade.exitDateTime).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    labels.push(dateStr);
    data.push(currentBalance);
  }

  const ctx = canvas.getContext("2d");
  const isProfitable = currentBalance >= startingBalance;
  const mainColor = isProfitable ? "#10b981" : "#ef4444";
  
  // Create gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 300);
  gradient.addColorStop(0, isProfitable ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)");
  gradient.addColorStop(1, "rgba(9, 9, 11, 0.0)");

  chartInstances[canvasId] = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Account Balance",
        data: data,
        borderColor: mainColor,
        borderWidth: 2,
        backgroundColor: gradient,
        fill: true,
        tension: 0.2,
        pointBackgroundColor: mainColor,
        pointBorderColor: "#09090b",
        pointBorderWidth: 1.5,
        pointRadius: data.length > 50 ? 0 : 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getTooltipBg(),
          titleColor: getTooltipTextColor(),
          bodyColor: getTooltipTextColor(),
          borderColor: getTooltipBorder(),
          displayColors: false,
          callbacks: {
            label: function(context) {
              const balance = context.raw;
              const index = context.dataIndex;
              if (index === 0) {
                return `Balance: $${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
              }
              const prevBalance = context.dataset.data[index - 1];
              const diff = balance - prevBalance;
              const pct = prevBalance > 0 ? (diff / prevBalance) * 100 : 0;
              const sign = diff >= 0 ? "+" : "";
              const formattedDiff = diff.toLocaleString("en-US", { minimumFractionDigits: 2 });
              const formattedPct = pct.toFixed(2);
              return [
                `Balance: $${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
                `Change: ${sign}$${formattedDiff} (${sign}${formattedPct}%)`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(), font: { family: "Inter" } }
        },
        y: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(),
            font: { family: "Inter" },
            callback: function(value) {
              return `$${value.toLocaleString()}`;
            }
          }
        }
      }
    }
  });
}

export function renderDailyPnlChart(trades) {
  const canvasId = "dailyPnlChart";
  destroyChart(canvasId);
  
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Group P&L by Date (YYYY-MM-DD)
  const dailyData = {};
  for (const trade of trades) {
    const dateStr = trade.exitDateTime.split("T")[0];
    const pnl = calcNetPnl(trade);
    dailyData[dateStr] = (dailyData[dateStr] || 0) + pnl;
  }

  // Sort dates
  const sortedDates = Object.keys(dailyData).sort();
  const labels = sortedDates.map(d => {
    const dateObj = new Date(d + "T00:00:00");
    return dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  });
  const dataValues = sortedDates.map(d => dailyData[d]);
  const backgroundColors = dataValues.map(v => v >= 0 ? "#10b981" : "#ef4444");

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Daily P&L",
        data: dataValues,
        backgroundColor: backgroundColors,
        borderRadius: 4,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getTooltipBg(),
          titleColor: getTooltipTextColor(),
          bodyColor: getTooltipTextColor(),
          borderColor: getTooltipBorder(),
          borderWidth: 1,
          displayColors: false,
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const sign = val >= 0 ? "+" : "";
              return `P&L: ${sign}$${val.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor(), font: { family: "Inter" } }
        },
        y: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(),
            font: { family: "Inter" },
            callback: function(value) {
              return `$${value.toLocaleString()}`;
            }
          }
        }
      }
    }
  });
}

export function renderDayOfWeekChart(trades) {
  const canvasId = "dayOfWeekChart";
  destroyChart(canvasId);
  
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const weekdayTotals = [0, 0, 0, 0, 0];

  for (const trade of trades) {
    const exitDate = new Date(trade.exitDateTime);
    let dayIdx = exitDate.getDay() - 1; // 0 = Monday, 4 = Friday
    // Map Sunday/Saturday to closest week days if they occur (crypto swing trades exit on weekends)
    if (dayIdx === -1) dayIdx = 4; // Sunday -> Friday
    if (dayIdx === 5) dayIdx = 4;  // Saturday -> Friday
    
    const pnl = getTradePnl(trade);
    weekdayTotals[dayIdx] += pnl;
  }

  const backgroundColors = weekdayTotals.map(v => v >= 0 ? "#10b981" : "#ef4444");

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: weekdays,
      datasets: [{
        data: weekdayTotals,
        backgroundColor: backgroundColors,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getTooltipBg(),
          borderColor: getTooltipBorder(),
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const sign = val >= 0 ? "+" : "";
              return `Net P&L: ${sign}$${val.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor() }
        },
        y: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(),
            callback: function(value) {
              return `$${value.toLocaleString()}`;
            }
          }
        }
      }
    }
  });
}

export function renderSetupTagChart(trades) {
  const canvasId = "setupTagChart";
  destroyChart(canvasId);
  
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const setupTotals = {};
  for (const trade of trades) {
    const setup = trade.setup || "No Tag";
    setupTotals[setup] = (setupTotals[setup] || 0) + getTradePnl(trade);
  }

  // Sort setups descending by total P&L
  const sortedSetups = Object.keys(setupTotals).sort((a, b) => setupTotals[b] - setupTotals[a]);
  const labels = sortedSetups;
  const dataValues = sortedSetups.map(s => setupTotals[s]);
  const backgroundColors = dataValues.map(v => v >= 0 ? "#10b981" : "#ef4444");

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        data: dataValues,
        backgroundColor: backgroundColors,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: "y", // Horizontal bar chart
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getTooltipBg(),
          borderColor: getTooltipBorder(),
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const sign = val >= 0 ? "+" : "";
              return `Net P&L: ${sign}$${val.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(),
            callback: function(value) {
              return `$${value.toLocaleString()}`;
            }
          }
        },
        y: {
          grid: { display: false },
          ticks: { color: getTickColor() }
        }
      }
    }
  });
}

export function renderSymbolChart(trades) {
  const canvasId = "symbolChart";
  destroyChart(canvasId);
  
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Group by symbol to calculate count and win rate
  const symbolStats = {};
  for (const trade of trades) {
    const sym = trade.symbol;
    if (!symbolStats[sym]) {
      symbolStats[sym] = [];
    }
    symbolStats[sym].push(trade);
  }

  // Sort symbols by trade count descending, take top 10
  const sortedSymbols = Object.keys(symbolStats)
    .sort((a, b) => symbolStats[b].length - symbolStats[a].length)
    .slice(0, 10);

  const labels = sortedSymbols;
  const countData = sortedSymbols.map(sym => symbolStats[sym].length);
  const winRateData = sortedSymbols.map(sym => calcWinRate(symbolStats[sym]));

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Trades Count",
          data: countData,
          backgroundColor: "rgba(99, 102, 241, 0.6)",
          borderColor: "#6366f1",
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: "yCount"
        },
        {
          label: "Win Rate %",
          data: winRateData,
          type: "line",
          borderColor: "#10b981",
          borderWidth: 2,
          pointBackgroundColor: "#10b981",
          pointRadius: 4,
          yAxisID: "yWinRate",
          tension: 0.1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#a1a1aa" }
        },
        tooltip: {
          backgroundColor: getTooltipBg(),
          borderColor: getTooltipBorder(),
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor() }
        },
        yCount: {
          type: "linear",
          position: "left",
          grid: { color: getGridColor() },
          ticks: { color: getTickColor() },
          title: { display: true, text: "Number of Trades", color: "#a1a1aa" }
        },
        yWinRate: {
          type: "linear",
          position: "right",
          grid: { display: false },
          min: 0,
          max: 100,
          ticks: { color: getTickColor(), callback: (val) => `${val}%` },
          title: { display: true, text: "Win Rate (%)", color: "#a1a1aa" }
        }
      }
    }
  });
}

export function renderDistributionChart(trades) {
  const canvasId = "distributionChart";
  destroyChart(canvasId);
  
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const pnls = trades.map(t => getTradePnl(t));
  if (pnls.length === 0) return;

  // Let's create bin ranges (e.g. $100 buckets or automated)
  const minVal = Math.min(...pnls);
  const maxVal = Math.max(...pnls);
  
  // Avoid division by zero
  const range = maxVal - minVal;
  const numBins = Math.max(5, Math.min(10, Math.floor(pnls.length / 3)));
  const binWidth = range === 0 ? 10 : Math.ceil(range / numBins);
  
  // Calculate starting boundary (rounded to binWidth multiples)
  const startBound = Math.floor(minVal / binWidth) * binWidth;
  
  const bins = Array(numBins).fill(0).map((_, i) => ({
    min: startBound + i * binWidth,
    max: startBound + (i + 1) * binWidth,
    count: 0
  }));

  if (bins.length > 0) {
    bins[bins.length - 1].max = Math.max(bins[bins.length - 1].max, Math.ceil(maxVal));
  }

  // Edge case: if we only have one trade outcome, create a single custom bin
  if (bins.length === 0) {
    bins.push({ min: minVal - 10, max: minVal + 10, count: pnls.length });
  } else {
    for (const pnl of pnls) {
      let placed = false;
      for (const bin of bins) {
        if (pnl >= bin.min && pnl < bin.max) {
          bin.count++;
          placed = true;
          break;
        }
      }
      // Put max value in the last bin
      if (!placed && pnl >= bins[bins.length - 1].max) {
        bins[bins.length - 1].count++;
      }
    }
  }

  const labels = bins.map(b => `$${b.min} to $${b.max}`);
  const dataValues = bins.map(b => b.count);
  const backgroundColors = bins.map(b => {
    // If the center of the bin is positive, green, else red
    const avg = (b.min + b.max) / 2;
    return avg >= 0 ? "rgba(16, 185, 129, 0.6)" : "rgba(239, 68, 68, 0.6)";
  });

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Trade Outcomes",
        data: dataValues,
        backgroundColor: backgroundColors,
        borderColor: backgroundColors.map(c => c.replace("0.6", "1.0")),
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getTooltipBg(),
          borderColor: getTooltipBorder(),
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              return `${context.raw} trades in this range`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor() }
        },
        y: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(), stepSize: 1 }
        }
      }
    }
  });
}

export function renderMistakeChart(trades) {
  const canvasId = "mistakeChart";
  destroyChart(canvasId);
  
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const mistakeTotals = {};
  for (const trade of trades) {
    const mistake = trade.mistake || "Disciplined";
    mistakeTotals[mistake] = (mistakeTotals[mistake] || 0) + getTradePnl(trade);
  }

  // Sort mistakes descending by total P&L (worst mistake showing at bottom or top)
  const sortedMistakes = Object.keys(mistakeTotals).sort((a, b) => mistakeTotals[b] - mistakeTotals[a]);
  const labels = sortedMistakes;
  const dataValues = sortedMistakes.map(m => mistakeTotals[m]);
  const backgroundColors = dataValues.map(v => v >= 0 ? "#10b981" : "#ef4444");

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        data: dataValues,
        backgroundColor: backgroundColors,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: "y", // Horizontal bar chart
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getTooltipBg(),
          borderColor: getTooltipBorder(),
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const sign = val >= 0 ? "+" : "";
              return `Net P&L: ${sign}$${val.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(),
            callback: function(value) {
              return `$${value.toLocaleString()}`;
            }
          }
        },
        y: {
          grid: { display: false },
          ticks: { color: getTickColor() }
        }
      }
    }
  });
}

export function renderSlippageSymbolChart(trades) {
  const canvasId = "slippageSymbolChart";
  destroyChart(canvasId);
  
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const symbolSlippage = {};
  for (const trade of trades) {
    if (trade.signalEntryPrice != null || trade.signalExitPrice != null) {
      const actPnl = calcNetPnl(trade);
      const sigPnl = calcSignalPnl(trade);
      const slippage = actPnl - sigPnl; // positive is good
      
      symbolSlippage[trade.symbol] = (symbolSlippage[trade.symbol] || 0) + slippage;
    }
  }

  const symbols = Object.keys(symbolSlippage);
  if (symbols.length === 0) {
    // Render "No Slippage Data" text on canvas if empty
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#a1a1aa";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No slippage data recorded", canvas.width / 2, canvas.height / 2);
    return;
  }

  // Sort symbols by slippage value (worst negative slippage first/at top)
  const sortedSymbols = symbols.sort((a, b) => symbolSlippage[a] - symbolSlippage[b]);
  const labels = sortedSymbols;
  const dataValues = sortedSymbols.map(s => symbolSlippage[s]);
  const backgroundColors = dataValues.map(v => v >= 0 ? "#10b981" : "#ef4444");

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        data: dataValues,
        backgroundColor: backgroundColors,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: "y", // Horizontal bar chart
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getTooltipBg(),
          borderColor: getTooltipBorder(),
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const sign = val >= 0 ? "+" : "";
              return `Total Slippage: ${sign}$${val.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(),
            callback: function(value) {
              const sign = value >= 0 ? "+" : "";
              return `${sign}$${value.toLocaleString()}`;
            }
          }
        },
        y: {
          grid: { display: false },
          ticks: { color: getTickColor() }
        }
      }
    }
  });
}

export function renderHourPnlChart(trades) {
  const canvasId = "hourPnlChart";
  destroyChart(canvasId);

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const hourPnlMap = {};
  for (const t of trades) {
    if (!t.entryDateTime) continue;
    const dateObj = new Date(t.entryDateTime);
    if (isNaN(dateObj.getTime())) continue;
    const hour = dateObj.getHours();
    hourPnlMap[hour] = (hourPnlMap[hour] || 0) + getTradePnl(t);
  }

  const hours = Object.keys(hourPnlMap).map(Number).sort((a, b) => a - b);
  if (hours.length === 0) {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#a1a1aa";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No time/hourly data recorded", canvas.width / 2, canvas.height / 2);
    return;
  }

  const labels = hours.map(h => {
    const period = h >= 12 ? "PM" : "AM";
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    return `${displayHour}:00 ${period}`;
  });
  const dataValues = hours.map(h => hourPnlMap[h]);
  const backgroundColors = dataValues.map(v => v >= 0 ? "rgba(16, 185, 129, 0.6)" : "rgba(239, 68, 68, 0.6)");
  const borderColors = dataValues.map(v => v >= 0 ? "#10b981" : "#ef4444");

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        data: dataValues,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getTooltipBg(),
          borderColor: getTooltipBorder(),
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const sign = val >= 0 ? "+" : "";
              return `P&L: ${sign}$${val.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor() }
        },
        y: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(),
            callback: function(value) {
              const sign = value >= 0 ? "+" : "";
              return `${sign}$${value.toLocaleString()}`;
            }
          }
        }
      }
    }
  });
}

export function renderCumulativeSlippageChart(trades) {
  const canvasId = "cumulativeSlippageChart";
  destroyChart(canvasId);

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Filter trades that have at least one signal parameter defined
  const sigTrades = trades
    .filter(t => t.signalEntryPrice != null || t.signalExitPrice != null)
    .sort((a, b) => new Date(a.exitDateTime) - new Date(b.exitDateTime));

  if (sigTrades.length === 0) {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#a1a1aa";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No trades with signal data for trend curve", canvas.width / 2, canvas.height / 2);
    return;
  }

  let runningSlippage = 0;
  const dataPoints = [];
  const labels = [];

  // Start with 0 at date of first trade
  dataPoints.push(0);
  labels.push("Start");

  sigTrades.forEach((t, index) => {
    const actPnl = calcNetPnl(t);
    const sigPnl = calcSignalPnl(t);
    const slippage = actPnl - sigPnl; // positive is better than signal
    runningSlippage += slippage;
    
    dataPoints.push(parseFloat(runningSlippage.toFixed(2)));
    
    const d = new Date(t.exitDateTime);
    labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  });

  const ctx = canvas.getContext("2d");

  // Create blue gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, "rgba(59, 130, 246, 0.25)");
  gradient.addColorStop(1, "rgba(59, 130, 246, 0.0)");

  chartInstances[canvasId] = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Cumulative Slippage",
        data: dataPoints,
        borderColor: "#3b82f6",
        borderWidth: 2,
        fill: true,
        backgroundColor: gradient,
        tension: 0.2,
        pointBackgroundColor: "#3b82f6",
        pointRadius: dataPoints.length < 15 ? 4 : 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getTooltipBg(),
          borderColor: getTooltipBorder(),
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const sign = val >= 0 ? "+" : "";
              return `Cum. Slippage: ${sign}$${val.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor() }
        },
        y: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(),
            callback: function(value) {
              const sign = value >= 0 ? "+" : "";
              return `${sign}$${value.toLocaleString()}`;
            }
          }
        }
      }
    }
  });
}

export function renderAssetClassChart(trades) {
  const canvasId = "assetClassChart";
  destroyChart(canvasId);
  
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Group P&L by asset class
  const classData = {
    "Stocks": 0,
    "Options": 0,
    "Futures": 0,
    "Crypto": 0,
    "Forex": 0
  };

  for (const trade of trades) {
    const rawClass = trade.assetClass || "stocks";
    // Capitalize correctly for display labels
    const formattedClass = rawClass.charAt(0).toUpperCase() + rawClass.slice(1);
    
    if (classData[formattedClass] !== undefined) {
      classData[formattedClass] += getTradePnl(trade);
    }
  }

  const labels = Object.keys(classData);
  const totals = Object.values(classData);
  const backgroundColors = totals.map(v => v >= 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)");
  const borderColors = totals.map(v => v >= 0 ? "#10b981" : "#ef4444");

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: totals,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getTooltipBg(),
          borderColor: getTooltipBorder(),
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const sign = val >= 0 ? "+" : "";
              return `Net P&L: ${sign}$${val.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor(), font: { family: "Inter" } }
        },
        y: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(),
            font: { family: "Inter" },
            callback: function(value) {
              return `$${value.toLocaleString()}`;
            }
          }
        }
      }
    }
  });
}

export function renderInterventionChart(trades, startingBalance = 25000) {
  const canvasId = "interventionChart";
  destroyChart(canvasId);
  
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (trades.length === 0) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#a1a1aa";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No trades matching active filters for intervention curve", canvas.width / 2, canvas.height / 2);
    
    const actualPnlEl = document.getElementById("deltaActualPnl");
    const strategyPnlEl = document.getElementById("deltaStrategyPnl");
    const traderEdgeEl = document.getElementById("deltaTraderEdge");
    if (actualPnlEl) actualPnlEl.textContent = "$0.00";
    if (strategyPnlEl) strategyPnlEl.textContent = "$0.00";
    if (traderEdgeEl) traderEdgeEl.textContent = "$0.00";
    return;
  }

  const metrics = calcInterventionMetrics(trades);
  
  const actualPnlEl = document.getElementById("deltaActualPnl");
  const strategyPnlEl = document.getElementById("deltaStrategyPnl");
  const traderEdgeEl = document.getElementById("deltaTraderEdge");
  const badgeContainer = document.getElementById("deltaBadgeContainer");

  const fmt = (val) => {
    const sign = val < 0 ? "-" : "";
    return `${sign}$${Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (actualPnlEl) actualPnlEl.textContent = fmt(metrics.actualTotal);
  if (strategyPnlEl) strategyPnlEl.textContent = fmt(metrics.strategyTotal);
  if (traderEdgeEl) traderEdgeEl.textContent = fmt(metrics.delta);

  if (badgeContainer) {
    if (metrics.delta >= 0) {
      badgeContainer.style.background = "rgba(16, 185, 129, 0.1)";
      badgeContainer.style.borderColor = "rgba(16, 185, 129, 0.25)";
      badgeContainer.style.color = "#34d399";
    } else {
      badgeContainer.style.background = "rgba(239, 68, 68, 0.1)";
      badgeContainer.style.borderColor = "rgba(239, 68, 68, 0.25)";
      badgeContainer.style.color = "#f87171";
    }
  }

  const sortedTrades = [...trades].sort((a, b) => new Date(a.exitDateTime) - new Date(b.exitDateTime));
  let currentActual = startingBalance;
  let currentStrategy = startingBalance;

  const labels = ["Start"];
  const actualData = [startingBalance];
  const strategyData = [startingBalance];

  for (const t of sortedTrades) {
    currentActual += calcNetPnl(t);
    
    if (t.status === "skipped") {
      if (t.signalEntryPrice != null && t.signalExitPrice != null) {
        currentStrategy += calcSignalPnl(t);
      }
    } else {
      if (t.signalEntryPrice != null && t.signalExitPrice != null) {
        currentStrategy += calcSignalPnl(t);
      } else {
        currentStrategy += calcNetPnl(t);
      }
    }

    const dateStr = new Date(t.exitDateTime).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    });
    labels.push(dateStr);
    actualData.push(currentActual);
    strategyData.push(currentStrategy);
  }

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Actual Performance",
          data: actualData,
          borderColor: "#c084fc",
          backgroundColor: "rgba(192, 132, 252, 0.03)",
          borderWidth: 2,
          tension: 0.15,
          pointBackgroundColor: "#c084fc",
          pointRadius: actualData.length < 20 ? 4 : 1
        },
        {
          label: "Pure Strategy Performance",
          data: strategyData,
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.03)",
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.15,
          pointBackgroundColor: "#3b82f6",
          pointRadius: strategyData.length < 20 ? 4 : 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: "#a1a1aa",
            font: { family: "Inter", size: 11 }
          }
        },
        tooltip: {
          backgroundColor: getTooltipBg(),
          borderColor: getTooltipBorder(),
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || "";
              const val = context.raw;
              return `${label}: $${val.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor(), font: { family: "Inter" } }
        },
        y: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(),
            font: { family: "Inter" },
            callback: function(value) {
              return `$${value.toLocaleString()}`;
            }
          }
        }
      }
    }
  });
}

export function renderInterventionAttributionChart(trades) {
  const canvasId = "interventionAttributionChart";
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const categories = {
    early_profit: "Early Profit",
    early_loss: "Early Loss Cut",
    late_entry: "Late Entry Chase",
    skipped_invalid: "Skipped (Invalid)",
    skipped_fear: "Skipped (Fear)",
    manual_no_signal: "Manual (No Sig)"
  };

  const totals = {};
  Object.keys(categories).forEach(k => { totals[k] = 0; });

  trades.forEach(t => {
    const type = t.interventionType;
    if (totals[type] !== undefined) {
      const act = calcNetPnl(t);
      const sig = t.signalEntryPrice != null && t.signalExitPrice != null ? calcSignalPnl(t) : act;
      
      let delta = 0;
      if (t.status === "skipped") {
        delta = 0 - sig;
      } else {
        delta = act - sig;
      }
      totals[type] += delta;
    }
  });

  const labels = Object.values(categories);
  const data = Object.keys(categories).map(k => totals[k]);
  const backgroundColors = data.map(val => val >= 0 ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)");
  const borderColors = data.map(val => val >= 0 ? "#10b981" : "#ef4444");

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getTooltipBg(),
          borderColor: getTooltipBorder(),
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const sign = val >= 0 ? "+" : "";
              return `Delta Impact: ${sign}$${val.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor(), font: { family: "Inter", size: 9 } }
        },
        y: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(),
            font: { family: "Inter" },
            callback: function(value) {
              const sign = value >= 0 ? "+" : "-";
              return `${sign}$${Math.abs(value).toLocaleString()}`;
            }
          }
        }
      }
    }
  });
}

export function renderInterventionHourlyChart(trades) {
  const canvasId = "interventionHourlyChart";
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const hourlyDeltas = {};
  for (let h = 9; h <= 16; h++) {
    hourlyDeltas[h] = 0;
  }
  hourlyDeltas["other"] = 0;

  trades.forEach(t => {
    if (!hasSevereDeviation(t)) return;
    if (!t.entryDateTime) return;

    const dateObj = new Date(t.entryDateTime);
    const hour = dateObj.getHours();

    const act = calcNetPnl(t);
    const sig = t.signalEntryPrice != null && t.signalExitPrice != null ? calcSignalPnl(t) : act;
    
    let delta = 0;
    if (t.status === "skipped") {
      delta = 0 - sig;
    } else {
      delta = act - sig;
    }

    if (hour >= 9 && hour <= 16) {
      hourlyDeltas[hour] += delta;
    } else {
      hourlyDeltas["other"] += delta;
    }
  });

  const labels = [
    "9 AM", "10 AM", "11 AM", "12 PM", 
    "1 PM", "2 PM", "3 PM", "4 PM", "Other"
  ];
  const keys = [9, 10, 11, 12, 13, 14, 15, 16, "other"];
  const data = keys.map(k => hourlyDeltas[k]);
  const backgroundColors = data.map(val => val >= 0 ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)");
  const borderColors = data.map(val => val >= 0 ? "#10b981" : "#ef4444");

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getTooltipBg(),
          borderColor: getTooltipBorder(),
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const sign = val >= 0 ? "+" : "";
              return `Delta Impact: ${sign}$${val.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor(), font: { family: "Inter", size: 9 } }
        },
        y: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(),
            font: { family: "Inter" },
            callback: function(value) {
              const sign = value >= 0 ? "+" : "-";
              return `${sign}$${Math.abs(value).toLocaleString()}`;
            }
          }
        }
      }
    }
  });
}

export function renderInterventionStreakChart(trades) {
  const canvasId = "interventionStreakChart";
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const sorted = [...trades].sort((a, b) => new Date(a.exitDateTime) - new Date(b.exitDateTime));

  const buckets = {
    first: { label: "First Trade", total: 0 },
    win1: { label: "After 1 Win", total: 0 },
    win2: { label: "After 2+ Wins", total: 0 },
    loss1: { label: "After 1 Loss", total: 0 },
    loss2: { label: "After 2+ Losses", total: 0 }
  };

  let currentStreak = 0;

  sorted.forEach(t => {
    const act = calcNetPnl(t);
    const sig = t.signalEntryPrice != null && t.signalExitPrice != null ? calcSignalPnl(t) : act;
    
    let delta = 0;
    if (t.status === "skipped") {
      delta = 0 - sig;
    } else {
      delta = act - sig;
    }

    if (currentStreak === 0) {
      buckets.first.total += delta;
    } else if (currentStreak === 1) {
      buckets.win1.total += delta;
    } else if (currentStreak >= 2) {
      buckets.win2.total += delta;
    } else if (currentStreak === -1) {
      buckets.loss1.total += delta;
    } else if (currentStreak <= -2) {
      buckets.loss2.total += delta;
    }

    if (t.status === "executed") {
      if (act > 0) {
        currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
      } else if (act < 0) {
        currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
      }
    }
  });

  const labels = Object.values(buckets).map(b => b.label);
  const data = Object.values(buckets).map(b => b.total);
  const backgroundColors = data.map(val => val >= 0 ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)");
  const borderColors = data.map(val => val >= 0 ? "#10b981" : "#ef4444");

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getTooltipBg(),
          borderColor: getTooltipBorder(),
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const sign = val >= 0 ? "+" : "";
              return `Delta Impact: ${sign}$${val.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor(), font: { family: "Inter", size: 9 } }
        },
        y: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(),
            font: { family: "Inter" },
            callback: function(value) {
              const sign = value >= 0 ? "+" : "-";
              return `${sign}$${Math.abs(value).toLocaleString()}`;
            }
          }
        }
      }
    }
  });
}

export function renderAdherenceDrawdownChart(trades, startingBalance = 25000) {
  const canvasId = "adherenceDrawdownChart";
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const sorted = [...trades].sort((a, b) => new Date(a.exitDateTime) - new Date(b.exitDateTime));

  const labels = ["Start"];
  const adherenceData = [100];
  const drawdownData = [0];

  let currentBalance = startingBalance;
  let maxBalance = startingBalance;
  let runningFollowedCount = 0;
  let totalProcessed = 0;

  sorted.forEach(t => {
    totalProcessed++;
    if (!hasSevereDeviation(t)) {
      runningFollowedCount++;
    }

    const actPnl = calcNetPnl(t);
    currentBalance += actPnl;
    if (currentBalance > maxBalance) {
      maxBalance = currentBalance;
    }

    const drawdownPct = maxBalance > 0 ? ((maxBalance - currentBalance) / maxBalance) * 100 : 0;
    const adherencePct = (runningFollowedCount / totalProcessed) * 100;

    const dateStr = new Date(t.exitDateTime).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric"
    });

    labels.push(dateStr);
    adherenceData.push(adherencePct);
    drawdownData.push(-drawdownPct);
  });

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Strategy Adherence (%)",
          data: adherenceData,
          borderColor: "#ec4899",
          backgroundColor: "transparent",
          borderWidth: 2,
          yAxisID: "yAdherence",
          tension: 0.15,
          pointRadius: adherenceData.length < 20 ? 3 : 0
        },
        {
          label: "Actual Drawdown (%)",
          data: drawdownData,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239, 68, 68, 0.05)",
          borderWidth: 1.5,
          fill: true,
          yAxisID: "yDrawdown",
          tension: 0.15,
          pointRadius: drawdownData.length < 20 ? 3 : 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: "#a1a1aa", font: { family: "Inter", size: 10 } }
        },
        tooltip: {
          backgroundColor: getTooltipBg(),
          borderColor: getTooltipBorder(),
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || "";
              const val = context.raw;
              return `${label}: ${val.toFixed(1)}%`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor(), font: { family: "Inter", size: 9 } }
        },
        yAdherence: {
          type: "linear",
          position: "left",
          min: 0,
          max: 100,
          grid: { color: getGridColor() },
          ticks: {
            color: "#ec4899",
            font: { family: "Inter" },
            callback: function(value) { return `${value}%`; }
          },
          title: {
            display: true,
            text: "Adherence Rate",
            color: "#ec4899",
            font: { family: "Inter", size: 10 }
          }
        },
        yDrawdown: {
          type: "linear",
          position: "right",
          max: 0,
          grid: { display: false },
          ticks: {
            color: "#ef4444",
            font: { family: "Inter" },
            callback: function(value) { return `${value}%`; }
          },
          title: {
            display: true,
            text: "Drawdown",
            color: "#ef4444",
            font: { family: "Inter", size: 10 }
          }
        }
      }
    }
  });
}

export function renderHoldTimeChart(trades) {
  const canvasId = "holdTimeChart";
  destroyChart(canvasId);

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const buckets = [
    { label: "Scalp (<5m)", minMins: 0, maxMins: 5, pnl: 0, count: 0, wins: 0 },
    { label: "Short (5m-30m)", minMins: 5, maxMins: 30, pnl: 0, count: 0, wins: 0 },
    { label: "Medium (30m-2h)", minMins: 30, maxMins: 120, pnl: 0, count: 0, wins: 0 },
    { label: "Long (2h-6h)", minMins: 120, maxMins: 360, pnl: 0, count: 0, wins: 0 },
    { label: "Swing (>6h)", minMins: 360, maxMins: Infinity, pnl: 0, count: 0, wins: 0 }
  ];

  for (const t of trades) {
    if (t.status === "skipped") continue;
    const duration = calcDuration(t.entryDateTime, t.exitDateTime);
    if (!duration) continue;

    const mins = duration.totalMins;
    const net = calcNetPnl(t);

    for (const b of buckets) {
      if (mins >= b.minMins && mins < b.maxMins) {
        b.pnl += net;
        b.count++;
        if (net > 0) {
          b.wins++;
        }
        break;
      }
    }
  }

  const labels = buckets.map(b => b.label);
  const pnlValues = buckets.map(b => b.pnl);
  const backgroundColors = pnlValues.map(v => v >= 0 ? "rgba(16, 185, 129, 0.75)" : "rgba(239, 68, 68, 0.75)");
  const borderColors = pnlValues.map(v => v >= 0 ? "var(--profit)" : "var(--loss)");

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Net P&L",
          data: pnlValues,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 1.5,
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getTooltipBg(),
          borderColor: getTooltipBorder(),
          borderWidth: 1,
          titleColor: "#fff",
          bodyColor: getTooltipTextColor(),
          titleFont: { family: "Inter", weight: "bold" },
          bodyFont: { family: "Inter" },
          padding: 10,
          callbacks: {
            label: function(context) {
              const idx = context.dataIndex;
              const b = buckets[idx];
              const wr = b.count > 0 ? (b.wins / b.count) * 100 : 0;
              const sign = b.pnl >= 0 ? "+" : "";
              return [
                `Net P&L: ${sign}$${b.pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                `Win Rate: ${wr.toFixed(1)}% (${b.wins}/${b.count} trades)`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor(), font: { family: "Inter" } }
        },
        y: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(),
            font: { family: "Inter" },
            callback: function(value) {
              return `$${value.toLocaleString()}`;
            }
          }
        }
      }
    }
  });
}

export function renderMfeMaeCharts(trades) {
  // 1. MFE Scatter
  const mfeCanvasId = "mfeScatterChart";
  destroyChart(mfeCanvasId);
  const mfeCanvas = document.getElementById(mfeCanvasId);
  if (mfeCanvas) {
    const dataPoints = [];
    trades.forEach(t => {
      const mfe = calcMfePct(t);
      const pnl = calcNetPnl(t);
      if (mfe !== null && !isNaN(mfe)) {
        dataPoints.push({ x: mfe, y: pnl, symbol: t.symbol });
      }
    });

    if (dataPoints.length === 0) {
      renderEmptyChartMessage(mfeCanvasId, "No MFE data points available. Enter Max Price on your trades.");
    } else {
      const ctx = mfeCanvas.getContext("2d");
      chartInstances[mfeCanvasId] = new Chart(ctx, {
        type: "scatter",
        data: {
          datasets: [{
            label: "Trades",
            data: dataPoints,
            backgroundColor: dataPoints.map(p => p.y >= 0 ? "rgba(16, 185, 129, 0.7)" : "rgba(239, 68, 68, 0.7)"),
            borderColor: dataPoints.map(p => p.y >= 0 ? "var(--profit)" : "var(--loss)"),
            borderWidth: 1,
            pointRadius: 6,
            pointHoverRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: getTooltipBg(),
              callbacks: {
                label: function(context) {
                  const p = context.raw;
                  return `${p.symbol}: MFE ${p.x.toFixed(2)}%, P&L: $${p.y.toLocaleString(undefined, {minimumFractionDigits:2})}`;
                }
              }
            }
          },
          scales: {
            x: {
              title: { display: true, text: "MFE (%)", color: "#a1a1aa" },
              grid: { color: getGridColor() },
              ticks: { color: getTickColor() }
            },
            y: {
              title: { display: true, text: "Realized P&L ($)", color: "#a1a1aa" },
              grid: { color: getGridColor() },
              ticks: { color: getTickColor() }
            }
          }
        }
      });
    }
  }

  // 2. MAE Scatter
  const maeCanvasId = "maeScatterChart";
  destroyChart(maeCanvasId);
  const maeCanvas = document.getElementById(maeCanvasId);
  if (maeCanvas) {
    const dataPoints = [];
    trades.forEach(t => {
      const mae = calcMaePct(t);
      const pnl = calcNetPnl(t);
      if (mae !== null && !isNaN(mae)) {
        dataPoints.push({ x: mae, y: pnl, symbol: t.symbol });
      }
    });

    if (dataPoints.length === 0) {
      renderEmptyChartMessage(maeCanvasId, "No MAE data points available. Enter Min Price on your trades.");
    } else {
      const ctx = maeCanvas.getContext("2d");
      chartInstances[maeCanvasId] = new Chart(ctx, {
        type: "scatter",
        data: {
          datasets: [{
            label: "Trades",
            data: dataPoints,
            backgroundColor: dataPoints.map(p => p.y >= 0 ? "rgba(16, 185, 129, 0.7)" : "rgba(239, 68, 68, 0.7)"),
            borderColor: dataPoints.map(p => p.y >= 0 ? "var(--profit)" : "var(--loss)"),
            borderWidth: 1,
            pointRadius: 6,
            pointHoverRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: getTooltipBg(),
              callbacks: {
                label: function(context) {
                  const p = context.raw;
                  return `${p.symbol}: MAE ${p.x.toFixed(2)}%, P&L: $${p.y.toLocaleString(undefined, {minimumFractionDigits:2})}`;
                }
              }
            }
          },
          scales: {
            x: {
              title: { display: true, text: "MAE (%)", color: "#a1a1aa" },
              grid: { color: getGridColor() },
              ticks: { color: getTickColor() }
            },
            y: {
              title: { display: true, text: "Realized P&L ($)", color: "#a1a1aa" },
              grid: { color: getGridColor() },
              ticks: { color: getTickColor() }
            }
          }
        }
      });
    }
  }
}

export function renderRMultipleChart(trades) {
  const canvasId = "rMultipleChart";
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const buckets = [
    { label: "<-2R", minVal: -Infinity, maxVal: -2, count: 0 },
    { label: "-2R to -1R", minVal: -2, maxVal: -1, count: 0 },
    { label: "-1R to 0R", minVal: -1, maxVal: 0, count: 0 },
    { label: "0R to 1R", minVal: 0, maxVal: 1, count: 0 },
    { label: "1R to 2R", minVal: 1, maxVal: 2, count: 0 },
    { label: "2R to 3R", minVal: 2, maxVal: 3, count: 0 },
    { label: ">3R", minVal: 3, maxVal: Infinity, count: 0 }
  ];

  trades.forEach(t => {
    if (t.status === "skipped") return;
    const rMult = calcRiskReward(t);
    if (rMult === null || isNaN(rMult)) return;

    for (const b of buckets) {
      if (rMult >= b.minVal && rMult < b.maxVal) {
        b.count++;
        break;
      }
    }
  });

  const totalCalculated = buckets.reduce((sum, b) => sum + b.count, 0);
  if (totalCalculated === 0) {
    renderEmptyChartMessage(canvasId, "No R-Multiple outcomes. Add Stop Loss parameters to trades.");
    return;
  }

  const labels = buckets.map(b => b.label);
  const data = buckets.map(b => b.count);

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Trades Count",
        data: data,
        backgroundColor: [
          "rgba(239, 68, 68, 0.7)",
          "rgba(239, 68, 68, 0.7)",
          "rgba(239, 68, 68, 0.5)",
          "rgba(16, 185, 129, 0.5)",
          "rgba(16, 185, 129, 0.7)",
          "rgba(16, 185, 129, 0.8)",
          "rgba(16, 185, 129, 0.9)"
        ],
        borderColor: [
          "var(--loss)",
          "var(--loss)",
          "rgba(239, 68, 68, 0.8)",
          "rgba(16, 185, 129, 0.8)",
          "var(--profit)",
          "var(--profit)",
          "var(--profit)"
        ],
        borderWidth: 1.5,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor() }
        },
        y: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(), stepSize: 1 }
        }
      }
    }
  });
}

export function renderRollingPerformanceChart(trades) {
  const canvasId = "rollingPerformanceChart";
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const sorted = [...trades]
    .filter(t => t.status === "executed")
    .sort((a, b) => new Date(a.exitDateTime) - new Date(b.exitDateTime));

  if (sorted.length < 5) {
    renderEmptyChartMessage(canvasId, "Insufficient data (needs at least 5 executed trades) for rolling metrics.");
    return;
  }

  const windowSize = Math.min(20, Math.floor(sorted.length / 2) || 5);
  const labels = [];
  const winRates = [];
  const profitFactors = [];

  for (let i = windowSize - 1; i < sorted.length; i++) {
    const windowTrades = sorted.slice(i - windowSize + 1, i + 1);
    const wins = windowTrades.filter(t => calcNetPnl(t) > 0).length;
    const wr = (wins / windowSize) * 100;
    const pf = calcProfitFactor(windowTrades);

    labels.push(`T${i + 1}`);
    winRates.push(wr);
    profitFactors.push(pf === 99.9 ? 5.0 : pf);
  }

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: `Rolling ${windowSize}-Trade Win Rate (%)`,
          data: winRates,
          borderColor: "var(--accent)",
          backgroundColor: "rgba(99, 102, 241, 0.05)",
          borderWidth: 2,
          yAxisID: "yWinRate",
          tension: 0.3,
          pointRadius: winRates.length > 50 ? 1 : 4,
          pointHoverRadius: 7,
          pointHitRadius: 10
        },
        {
          label: `Rolling ${windowSize}-Trade Profit Factor`,
          data: profitFactors,
          borderColor: "#eab308",
          backgroundColor: "transparent",
          borderWidth: 2,
          yAxisID: "yProfitFactor",
          tension: 0.3,
          pointRadius: profitFactors.length > 50 ? 1 : 4,
          pointHoverRadius: 7,
          pointHitRadius: 10
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          labels: { color: "#a1a1aa", font: { family: "Inter" } }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor() }
        },
        yWinRate: {
          type: "linear",
          position: "left",
          title: { display: true, text: "Win Rate (%)", color: "var(--accent)" },
          ticks: { color: getTickColor() },
          grid: { color: getGridColor() },
          min: 0,
          max: 100
        },
        yProfitFactor: {
          type: "linear",
          position: "right",
          title: { display: true, text: "Profit Factor", color: "#eab308" },
          ticks: { color: getTickColor() },
          grid: { display: false },
          min: 0,
          max: 5
        }
      }
    }
  });
}

export function renderTradeSequenceChart(trades) {
  const canvasId = "tradeSequenceChart";
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const sequenceMap = calcDailySequence(trades);
  
  const buckets = [
    { label: "1st Trade", pnl: 0, count: 0 },
    { label: "2nd Trade", pnl: 0, count: 0 },
    { label: "3rd Trade", pnl: 0, count: 0 },
    { label: "4th+ Trade", pnl: 0, count: 0 }
  ];

  trades.forEach(t => {
    if (t.status === "skipped") return;
    const seq = sequenceMap[t.id];
    if (!seq) return;

    const net = calcNetPnl(t);
    const bucketIdx = Math.min(seq - 1, 3);
    buckets[bucketIdx].pnl += net;
    buckets[bucketIdx].count++;
  });

  const totalSequences = buckets.reduce((sum, b) => sum + b.count, 0);
  if (totalSequences === 0) {
    renderEmptyChartMessage(canvasId, "No daily sequence performance data available.");
    return;
  }

  const labels = buckets.map(b => b.label);
  const data = buckets.map(b => b.pnl);
  const colors = data.map(v => v >= 0 ? "rgba(16, 185, 129, 0.75)" : "rgba(239, 68, 68, 0.75)");

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Total Net P&L",
        data: data,
        backgroundColor: colors,
        borderColor: data.map(v => v >= 0 ? "var(--profit)" : "var(--loss)"),
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getTooltipBg(),
          callbacks: {
            label: function(context) {
              const idx = context.dataIndex;
              const b = buckets[idx];
              return `Total P&L: $${b.pnl.toLocaleString(undefined, {minimumFractionDigits: 2})} (${b.count} trades)`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor() }
        },
        y: {
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(),
            callback: function(value) { return `$${value.toLocaleString()}`; }
          }
        }
      }
    }
  });
}

export function renderPostLossBehaviorChart(trades) {
  const canvasId = "postLossBehaviorChart";
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const stats = calcPostLossPerformance(trades);

  if (stats.afterWin.count === 0 && stats.afterLoss.count === 0) {
    renderEmptyChartMessage(canvasId, "No post-win/loss sequence outcomes recorded yet.");
    return;
  }

  const labels = ["After a Win", "After a Loss"];
  const winRates = [stats.afterWin.winRate, stats.afterLoss.winRate];
  const avgPnls = [stats.afterWin.avgPnl, stats.afterLoss.avgPnl];

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Win Rate (%)",
          data: winRates,
          backgroundColor: "rgba(99, 102, 241, 0.7)",
          borderColor: "var(--accent)",
          borderWidth: 1.5,
          yAxisID: "yWR",
          borderRadius: 6
        },
        {
          label: "Avg P&L ($)",
          data: avgPnls,
          backgroundColor: avgPnls.map(v => v >= 0 ? "rgba(16, 185, 129, 0.7)" : "rgba(239, 68, 68, 0.7)"),
          borderColor: avgPnls.map(v => v >= 0 ? "var(--profit)" : "var(--loss)"),
          borderWidth: 1.5,
          yAxisID: "yPnl",
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: "#a1a1aa" }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor() }
        },
        yWR: {
          type: "linear",
          position: "left",
          title: { display: true, text: "Win Rate (%)", color: "var(--accent)" },
          ticks: { color: getTickColor() },
          grid: { color: getGridColor() },
          min: 0,
          max: 100
        },
        yPnl: {
          type: "linear",
          position: "right",
          title: { display: true, text: "Avg P&L ($)", color: "#10b981" },
          ticks: { color: getTickColor() },
          grid: { display: false }
        }
      }
    }
  });
}

let activeReplayDate = "";

export function renderTimelineReplayChart(trades) {
  const canvasId = "timelineReplayChart";
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const executedTrades = trades.filter(t => t.status === "executed");
  if (executedTrades.length === 0) {
    renderEmptyChartMessage(canvasId, "No executed trades available for timeline replay.");
    return;
  }

  const getLocalDateStr = (dateTimeStr) => {
    if (!dateTimeStr) return "";
    return dateTimeStr.split("T")[0];
  };

  // Get unique dates of executed trades (sorted descending)
  const uniqueDates = [...new Set(executedTrades.map(t => getLocalDateStr(t.entryDateTime)))]
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a));

  const select = document.getElementById("replayDateSelect");
  if (select) {
    // Clear and repopulate select options
    select.innerHTML = uniqueDates.map(d => `<option value="${d}">${d}</option>`).join("");
    
    // Set active date
    if (activeReplayDate && uniqueDates.includes(activeReplayDate)) {
      select.value = activeReplayDate;
    } else if (uniqueDates.length > 0) {
      activeReplayDate = uniqueDates[0];
      select.value = activeReplayDate;
    }
    
    // Add event listener once
    if (!select.dataset.listenerAdded) {
      select.addEventListener("change", (e) => {
        activeReplayDate = e.target.value;
        renderTimelineReplayChart(trades);
      });
      select.dataset.listenerAdded = "true";
    }
  } else {
    if (uniqueDates.length > 0) {
      activeReplayDate = uniqueDates[0];
    }
  }

  const selectedDate = activeReplayDate || (uniqueDates.length > 0 ? uniqueDates[0] : "");
  if (!selectedDate) {
    renderEmptyChartMessage(canvasId, "No trades available for date selection.");
    return;
  }

  const dayTrades = executedTrades.filter(t => 
    getLocalDateStr(t.entryDateTime) === selectedDate
  ).sort((a, b) => new Date(a.entryDateTime) - new Date(b.entryDateTime));

  if (dayTrades.length === 0) {
    renderEmptyChartMessage(canvasId, `No trades executed on ${selectedDate}`);
    return;
  }

  const labels = dayTrades.map((t, idx) => `${t.symbol} (#${idx+1})`);
  
  const datasetsData = dayTrades.map(t => {
    const entry = new Date(t.entryDateTime);
    const exit = new Date(t.exitDateTime);
    
    let entryDecimal = entry.getHours() + entry.getMinutes() / 60;
    let exitDecimal = exit.getHours() + exit.getMinutes() / 60;
    
    // Handle overnight trades spanning midnight
    if (exitDecimal < entryDecimal) {
      exitDecimal += 24;
    }
    
    return [entryDecimal, exitDecimal];
  });

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Hold Timeline",
        data: datasetsData,
        backgroundColor: dayTrades.map(t => calcNetPnl(t) >= 0 ? "rgba(16, 185, 129, 0.75)" : "rgba(239, 68, 68, 0.75)"),
        borderColor: dayTrades.map(t => calcNetPnl(t) >= 0 ? "var(--profit)" : "var(--loss)"),
        borderWidth: 1.5,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getTooltipBg(),
          callbacks: {
            label: function(context) {
              const idx = context.dataIndex;
              const t = dayTrades[idx];
              const pnl = calcNetPnl(t);
              const durObj = calcDuration(t.entryDateTime, t.exitDateTime);
              const durStr = durObj ? `${durObj.totalMins}m` : "";
              return [
                `Symbol: ${t.symbol} (${t.direction.toUpperCase()})`,
                `Net P&L: $${pnl.toLocaleString()}`,
                `Duration: ${durStr}`,
                `Time: ${new Date(t.entryDateTime).toLocaleTimeString()} - ${new Date(t.exitDateTime).toLocaleTimeString()}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: `Hour of Day (${selectedDate})`, color: "#a1a1aa" },
          grid: { color: getGridColor() },
          ticks: { color: getTickColor(),
            callback: function(value) {
              const hour = Math.floor(value);
              const mins = Math.round((value - hour) * 60);
              const ampm = hour >= 12 ? "PM" : "AM";
              const displayHour = hour % 12 === 0 ? 12 : hour % 12;
              return `${displayHour}:${String(mins).padStart(2, '0')} ${ampm}`;
            }
          }
        },
        y: {
          grid: { display: false },
          ticks: { color: getTickColor() }
        }
      }
    }
  });
}

export function renderAdherencePerformanceChart(trades) {
  const canvasId = "adherencePerformanceChart";
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const highTrades = [];
  const medTrades = [];
  const lowTrades = [];

  trades.forEach(t => {
    if (t.status === "skipped") return;
    const score = t.adherenceScore !== undefined && t.adherenceScore !== null ? t.adherenceScore : 100;
    if (score >= 80) {
      highTrades.push(t);
    } else if (score >= 40) {
      medTrades.push(t);
    } else {
      lowTrades.push(t);
    }
  });

  const avgPnls = [getAvgPnl(highTrades), getAvgPnl(medTrades), getAvgPnl(lowTrades)];
  const winRates = [getWinRate(highTrades), getWinRate(medTrades), getWinRate(lowTrades)];
  const counts = [highTrades.length, medTrades.length, lowTrades.length];

  function getAvgPnl(arr) {
    if (arr.length === 0) return 0;
    const total = arr.reduce((sum, t) => sum + calcNetPnl(t), 0);
    return parseFloat((total / arr.length).toFixed(2));
  }

  function getWinRate(arr) {
    if (arr.length === 0) return 0;
    const wins = arr.filter(t => calcNetPnl(t) > 0).length;
    return parseFloat(((wins / arr.length) * 100).toFixed(1));
  }

  const ctx = canvas.getContext("2d");
  chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: [
        `High [80-100%] (${counts[0]} trades)`,
        `Medium [40-60%] (${counts[1]} trades)`,
        `Low [0-20%] (${counts[2]} trades)`
      ],
      datasets: [
        {
          type: "bar",
          label: "Avg Net P&L ($)",
          data: avgPnls,
          backgroundColor: [
            "rgba(16, 185, 129, 0.15)", // Green for High
            "rgba(234, 179, 8, 0.15)",  // Yellow for Med
            "rgba(239, 68, 68, 0.15)"   // Red for Low
          ],
          borderColor: [
            "rgba(16, 185, 129, 0.7)",
            "rgba(234, 179, 8, 0.7)",
            "rgba(239, 68, 68, 0.7)"
          ],
          borderWidth: 1.5,
          yAxisID: "yPnl"
        },
        {
          type: "line",
          label: "Win Rate (%)",
          data: winRates,
          borderColor: "var(--accent)",
          backgroundColor: "rgba(99, 102, 241, 0.1)",
          borderWidth: 2.5,
          tension: 0.2,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointHitRadius: 10,
          yAxisID: "yWinRate"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: "#a1a1aa", font: { family: "Inter" } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || '';
              const val = context.parsed.y;
              if (context.datasetIndex === 0) {
                return `${label}: ${val >= 0 ? '+' : ''}$${val.toLocaleString()}`;
              } else {
                return `${label}: ${val}%`;
              }
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getTickColor() }
        },
        yPnl: {
          type: "linear",
          position: "left",
          title: { display: true, text: "Average P&L ($)", color: "#a1a1aa" },
          ticks: {
            color: getTickColor(),
            callback: value => `$${value}`
          },
          grid: { color: getGridColor() }
        },
        yWinRate: {
          type: "linear",
          position: "right",
          title: { display: true, text: "Win Rate (%)", color: "var(--accent)" },
          ticks: { color: getTickColor() },
          grid: { display: false },
          min: 0,
          max: 100
        }
      }
    }
  });
}



