import { calcNetPnl, formatCurrency, escapeHtml, calcSignalPnl, calcPnlDiff, isSkippedTrade } from './utils.js';

let currentYear = 2026;
let currentMonth = 5; // 0-indexed, so 5 = June
let calendarTrades = [];

export function renderCalendar(year, month, trades) {
  currentYear = year;
  currentMonth = month;
  calendarTrades = trades;

  const calendarGrid = document.getElementById("calendarGrid");
  const monthLabel = document.getElementById("calendarMonthLabel");
  if (!calendarGrid || !monthLabel) return;

  // Clear previous grid
  calendarGrid.innerHTML = "";

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  monthLabel.textContent = `${monthNames[month]} ${year}`;

  // Days in week header
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  weekDays.forEach(day => {
    const dayHeader = document.createElement("div");
    dayHeader.className = "calendar-day-header";
    dayHeader.textContent = day;
    calendarGrid.appendChild(dayHeader);
  });

  // Calculate start day of week and total days in month
  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  // Prev month padding days
  const prevMonthTotalDays = new Date(year, month, 0).getDate();
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const paddingDay = document.createElement("div");
    paddingDay.className = "calendar-cell empty";
    paddingDay.innerHTML = `<span class="day-num muted">${prevMonthTotalDays - i}</span>`;
    calendarGrid.appendChild(paddingDay);
  }

  // Current month days
  let monthlyTotalPnl = 0;
  let monthlyWins = 0;
  let monthlyLosses = 0;
  let monthlyTotalTrades = 0;

  for (let day = 1; day <= totalDays; day++) {
    const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // Find trades on this day
    const dayTrades = calendarTrades.filter(t => t.exitDateTime.split("T")[0] === cellDateStr);
    
    const cell = document.createElement("div");
    cell.className = "calendar-cell";

    let cellContent = `<span class="day-num">${day}</span>`;
    
    if (dayTrades.length > 0) {
      let dayPnl = 0;
      let dayWins = 0;
      let dayLosses = 0;

      for (const t of dayTrades) {
        const pnl = calcNetPnl(t);
        dayPnl += pnl;
        if (pnl > 0) {
          dayWins++;
          monthlyWins++;
        } else if (pnl < 0) {
          dayLosses++;
          monthlyLosses++;
        }
        monthlyTotalPnl += pnl;
        monthlyTotalTrades++;
      }

      const pnlClass = dayPnl > 0 ? "profit" : dayPnl < 0 ? "loss" : "breakeven";
      const sign = dayPnl > 0 ? "+" : "";
      
      cell.classList.add(dayPnl > 0 ? "has-profit" : dayPnl < 0 ? "has-loss" : "has-breakeven");
      
      cellContent += `
        <span class="trade-count-badge">${dayTrades.length} trade${dayTrades.length > 1 ? "s" : ""}</span>
        <span class="day-pnl ${pnlClass}">${sign}${formatCurrency(dayPnl)}</span>
      `;
      
      cell.addEventListener("click", () => openDayPanel(cellDateStr, dayTrades));
    } else {
      cell.classList.add("no-trades");
    }

    cell.innerHTML = cellContent;
    calendarGrid.appendChild(cell);
  }

  // Next month padding days to fill grid (4 rows = 28, 5 rows = 35, 6 rows = 42 cells)
  const totalCellsUsed = firstDayIndex + totalDays;
  let totalGridCells = 42;
  if (totalCellsUsed <= 28) {
    totalGridCells = 28;
  } else if (totalCellsUsed <= 35) {
    totalGridCells = 35;
  }
  const remainingCells = totalGridCells - totalCellsUsed;
  for (let i = 1; i <= remainingCells; i++) {
    const paddingDay = document.createElement("div");
    paddingDay.className = "calendar-cell empty";
    paddingDay.innerHTML = `<span class="day-num muted">${i}</span>`;
    calendarGrid.appendChild(paddingDay);
  }

  // Update calendar summary row
  renderCalendarSummary(monthlyTotalPnl, monthlyWins, monthlyLosses, monthlyTotalTrades);
}

function renderCalendarSummary(totalPnl, wins, losses, totalTrades = 0) {
  const summaryPnl = document.getElementById("calSummaryPnl");
  const summaryWins = document.getElementById("calSummaryWins");
  const summaryLosses = document.getElementById("calSummaryLosses");
  const summaryWinRate = document.getElementById("calSummaryWinRate");

  if (!summaryPnl || !summaryWins || !summaryLosses || !summaryWinRate) return;

  // Use total trades (including breakeven) as denominator for consistency with stats banner
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  summaryPnl.textContent = formatCurrency(totalPnl);
  summaryPnl.className = `stat-value ${totalPnl > 0 ? "profit" : totalPnl < 0 ? "loss" : ""}`;
  summaryWins.textContent = wins;
  summaryLosses.textContent = losses;
  summaryWinRate.textContent = `${winRate.toFixed(1)}%`;
}

export function navigateMonth(delta) {
  let newMonth = currentMonth + delta;
  let newYear = currentYear;

  if (newMonth < 0) {
    newMonth = 11;
    newYear -= 1;
  } else if (newMonth > 11) {
    newMonth = 0;
    newYear += 1;
  }

  renderCalendar(newYear, newMonth, calendarTrades);
}

export function openDayPanel(dateStr, trades) {
  const panel = document.getElementById("dayDetailPanel");
  const title = document.getElementById("dayPanelTitle");
  const content = document.getElementById("dayPanelContent");
  
  if (!panel || !title || !content) return;

  // Format date header
  const dateObj = new Date(dateStr + "T00:00:00");
  title.textContent = dateObj.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  // Render day's trades
  let tradesHtml = "";
  let dayTotal = 0;

  for (const t of trades) {
    const netPnl = calcNetPnl(t);
    dayTotal += netPnl;
    const pnlClass = netPnl > 0 ? "profit" : netPnl < 0 ? "loss" : "breakeven";
    const sign = netPnl > 0 ? "+" : "";

    const escapedSymbol = escapeHtml(t.symbol);
    const escapedSetup = escapeHtml(t.setup);
    const escapedNotes = escapeHtml(t.notes);

    let signalDiffHtml = "";
    if (!isSkippedTrade(t) && (t.signalEntryPrice != null || t.signalExitPrice != null)) {
      const sigPnl = calcSignalPnl(t);
      const diff = sigPnl - netPnl;
      const diffClass = diff < 0 ? "profit" : diff > 0 ? "loss" : "";
      const diffFormatted = diff === 0 ? "$0.00" : (diff < 0 ? `-$${Math.abs(diff).toFixed(2)}` : `+$${diff.toFixed(2)}`);
      signalDiffHtml = `
        <div class="day-trade-signal-diff" style="font-size: 0.75rem; margin-top: 6px; color: var(--text-secondary); display: flex; gap: 8px; border-top: 1px dashed rgba(63, 63, 70, 0.3); padding-top: 4px;">
          <span>Sig Entry: <strong>$${(t.signalEntryPrice != null ? t.signalEntryPrice : t.entryPrice).toFixed(2)}</strong></span>
          <span>Sig Exit: <strong>$${(t.signalExitPrice != null ? t.signalExitPrice : t.exitPrice).toFixed(2)}</strong></span>
          <span>Sig-Act Diff: <strong class="${diffClass}">${diffFormatted}</strong></span>
        </div>
      `;
    }

    tradesHtml += `
      <div class="day-trade-card">
        <div class="day-trade-header">
          <div class="day-trade-symbol-direction">
            <span class="day-trade-symbol">${escapedSymbol}</span>
            <span class="badge direction-${t.direction}">${t.direction.toUpperCase()}</span>
          </div>
          <span class="day-trade-pnl ${pnlClass}">${sign}${formatCurrency(netPnl)}</span>
        </div>
        <div class="day-trade-details">
          <span>Qty: <strong>${t.qty}</strong></span>
          <span>Entry: <strong>$${t.entryPrice.toFixed(2)}</strong></span>
          <span>Exit: <strong>$${t.exitPrice.toFixed(2)}</strong></span>
        </div>
        ${t.setup ? `<div class="day-trade-setup">Setup: <strong>${escapedSetup}</strong></div>` : ""}
        ${t.notes ? `<p class="day-trade-notes">"${escapedNotes}"</p>` : ""}
        ${signalDiffHtml}
      </div>
    `;
  }

  const dayTotalClass = dayTotal > 0 ? "profit" : dayTotal < 0 ? "loss" : "";
  const daySign = dayTotal > 0 ? "+" : "";
  
  content.innerHTML = `
    <div class="day-total-banner">
      <span>Daily Net P&L</span>
      <h3 class="${dayTotalClass}">${daySign}${formatCurrency(dayTotal)}</h3>
    </div>
    <div class="day-trades-list">
      ${tradesHtml}
    </div>
  `;

  panel.classList.add("open");
}

export function closeDayPanel() {
  const panel = document.getElementById("dayDetailPanel");
  if (panel) {
    panel.classList.remove("open");
  }
}
