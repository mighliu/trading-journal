import { AppState } from './state.js';
import { demoTrades } from '../demo-data.js';
import { 
  renderStatsBanner, 
  renderTradeLog, 
  setupUIListeners, 
  populateSetupFilterOptions, 
  populateAccountSelector,
  showToast,
  renderInterventionMatrix,
  renderRiskTab,
  renderAnalyticsTab,
  renderEdgeInsights,
  renderPsychologyAnalyticsCard
} from './ui.js';
import { 
  renderCalendar, 
  navigateMonth, 
  closeDayPanel 
} from './calendar.js';
import { 
  renderEquityCurve, 
  renderDailyPnlChart, 
  renderDayOfWeekChart, 
  renderSetupTagChart, 
  renderSymbolChart, 
  renderDistributionChart, 
  renderMistakeChart, 
  renderSlippageSymbolChart,
  renderHourPnlChart,
  renderCumulativeSlippageChart,
  renderAssetClassChart,
  renderHoldTimeChart,
  renderHoldTimeScatterChart,
  renderFatiguePivotChart,
  renderTradeSequenceChart,
  renderInterventionChart,
  renderInterventionAttributionChart,
  renderInterventionHourlyChart,
  renderInterventionStreakChart,
  renderAdherenceDrawdownChart,
  renderMfeMaeCharts,
  renderRMultipleChart,
  renderRollingPerformanceChart,
  renderPostLossBehaviorChart,
  renderTimelineReplayChart,
  renderAdherencePerformanceChart,
  renderDrawdownScatterChart,
  renderMonteCarloChart,
  renderTrailingDrawdownChart,
  renderSessionHeatmap,
  destroyAllCharts
} from './charts.js';
import { compressImage, hasSevereDeviation, calcNetPnl } from './utils.js';

let currentTab = "dashboard";
const calendarToday = new Date("2026-06-29T17:34:00"); // Base date context
let calendarYear = calendarToday.getFullYear();
let calendarMonth = calendarToday.getMonth();
let darkStreakDismissed = false; // Track if user dismissed the banner this state cycle

async function init() {
  // 1. Initialize SQLite WASM database
  await AppState.initDatabase();

  // Populate dynamic accounts list
  populateAccountSelector();

  // 2. Setup general DOM listeners
  setupUIListeners();
  setupTabRouting();
  setupScreenshotDropzones();
  setupActionButtons();

  // 3. Register state change callbacks
  AppState.onChange(handleStateChange);

  // 4. Initial render
  handleStateChange();

  // Render static icons on load
  lucide.createIcons();

  // If no trades exist, show seed notice
  toggleSeedNotice();

  // Setup keyboard shortcuts
  setupKeyboardShortcuts();

  // Setup note templates
  setupNoteTemplates();
}

function handleStateChange() {
  const filteredTrades = AppState.getFilteredTrades();
  const allTrades = AppState.trades;

  // Sync filter dropdowns UI
  syncFilterUI();

  // Sync accounts list
  populateAccountSelector();

  // Populate setups in filter list and datalist
  populateSetupFilterOptions(AppState.getUniqueSetups());

  // Render main stats banner (applies to filtered trades)
  renderStatsBanner(filteredTrades, AppState.settings.startingBalance);

  // Conditional tab visibility check
  const tabBtn = document.getElementById("tabInterventionBtn");
  if (tabBtn) {
    const activeAcc = AppState.settings.currentAccount || "Personal";
    const accountTrades = allTrades.filter(t => t.accountId === activeAcc);
    const hasInterventions = accountTrades.some(t => hasSevereDeviation(t));
    if (hasInterventions) {
      tabBtn.classList.remove("hidden");
    } else {
      tabBtn.classList.add("hidden");
      // Fallback if we are on the hidden tab
      if (currentTab === "intervention") {
        currentTab = "dashboard";
        const tabBtns = document.querySelectorAll(".nav-tab-btn");
        tabBtns.forEach(b => {
          if (b.dataset.tab === "dashboard") {
            b.classList.add("active");
          } else {
            b.classList.remove("active");
          }
        });
        const tabContents = document.querySelectorAll(".tab-content");
        tabContents.forEach(c => {
          if (c.id === "dashboardTabContent") {
            c.classList.remove("hidden");
          } else {
            c.classList.add("hidden");
          }
        });
      }
    }
  }

  // Render active tab view
  renderActiveView(filteredTrades);

  // Update dark streak banner
  updateDarkStreakBanner(allTrades);

  // Handle seed notice toggle
  toggleSeedNotice();
}

function syncFilterUI() {
  const datePresetElem = document.getElementById("filterDatePreset");
  if (datePresetElem) datePresetElem.value = AppState.activeFilters.datePreset || "allTime";

  const symbolElem = document.getElementById("filterSymbol");
  if (symbolElem && document.activeElement !== symbolElem) symbolElem.value = AppState.activeFilters.symbol || "";

  const dirElem = document.getElementById("filterDirection");
  if (dirElem) dirElem.value = AppState.activeFilters.direction || "all";

  const assetElem = document.getElementById("filterAssetClass");
  if (assetElem) assetElem.value = AppState.activeFilters.assetClass || "all";

  const statusElem = document.getElementById("filterStatus");
  if (statusElem) statusElem.value = AppState.activeFilters.status || "executed";

  const outcomeElem = document.getElementById("filterOutcome");
  if (outcomeElem) outcomeElem.value = AppState.activeFilters.outcome || "all";

  const setupElem = document.getElementById("filterSetup");
  if (setupElem) setupElem.value = AppState.activeFilters.setup || "all";
}

function setupTabRouting() {
  const tabBtns = document.querySelectorAll(".nav-tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;
      currentTab = tabId;

      // Update button classes
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Update content visibilities
      tabContents.forEach(c => {
        if (c.id === `${tabId}TabContent`) {
          c.classList.remove("hidden");
        } else {
          c.classList.add("hidden");
        }
      });

      // Render the newly opened tab after DOM reflow/repaint frame
      requestAnimationFrame(() => {
        const filteredTrades = AppState.getFilteredTrades();
        renderActiveView(filteredTrades);
      });
    });
  });
}

function renderActiveView(filteredTrades) {
  // Clear charts before rendering to avoid overlay bugs
  destroyAllCharts();

  if (currentTab === "dashboard") {
    renderEdgeInsights();
    renderEquityCurve(filteredTrades, AppState.settings.startingBalance);
    renderDailyPnlChart(filteredTrades);
  } else if (currentTab === "tradeLog") {
    renderTradeLog(filteredTrades, 1);
  } else if (currentTab === "calendar") {
    // For calendar, we show all trades matching setups/symbols filters, but date filtering is visual (by month)
    // So we fetch all trades filtered by everything EXCEPT date preset
    const backupPreset = AppState.activeFilters.datePreset;
    AppState.activeFilters.datePreset = "allTime";
    const tradesForCalendar = AppState.getFilteredTrades();
    AppState.activeFilters.datePreset = backupPreset;
    
    renderCalendar(calendarYear, calendarMonth, tradesForCalendar);
  } else if (currentTab === "analytics") {
    renderDayOfWeekChart(filteredTrades);
    renderSetupTagChart(filteredTrades);
    renderSymbolChart(filteredTrades);
    renderDistributionChart(filteredTrades);
    renderMistakeChart(filteredTrades);
    renderSlippageSymbolChart(filteredTrades);
    renderHourPnlChart(filteredTrades);
    renderCumulativeSlippageChart(filteredTrades);
    renderAssetClassChart(filteredTrades);
    renderHoldTimeChart(filteredTrades);
    renderAnalyticsTab(filteredTrades);
    renderHoldTimeScatterChart(filteredTrades);
    renderFatiguePivotChart(filteredTrades);
    renderTradeSequenceChart(filteredTrades);
    renderPsychologyAnalyticsCard();
    renderSessionHeatmap(filteredTrades);

  } else if (currentTab === "intervention") {
    const backupStatus = AppState.activeFilters.status;
    AppState.activeFilters.status = "all";
    const tradesForIntervention = AppState.getFilteredTrades();
    AppState.activeFilters.status = backupStatus;

    renderInterventionMatrix(tradesForIntervention);

    const startingBalance = AppState.settings.startingBalance || 25000;
    renderInterventionChart(tradesForIntervention, startingBalance);
    renderInterventionAttributionChart(tradesForIntervention);
    renderInterventionHourlyChart(tradesForIntervention);
    renderInterventionStreakChart(tradesForIntervention);
    renderAdherenceDrawdownChart(tradesForIntervention, startingBalance);
  } else if (currentTab === "risk") {
    const backupStatus = AppState.activeFilters.status;
    AppState.activeFilters.status = "all";
    const tradesForRisk = AppState.getFilteredTrades();
    AppState.activeFilters.status = backupStatus;

    renderRiskTab(tradesForRisk);
    renderMonteCarloChart(tradesForRisk, AppState.settings.startingBalance);
    renderMfeMaeCharts(tradesForRisk);
    renderRMultipleChart(tradesForRisk);
    renderRollingPerformanceChart(tradesForRisk);
    renderTradeSequenceChart(tradesForRisk);
    renderPostLossBehaviorChart(tradesForRisk);
    renderTimelineReplayChart(tradesForRisk);
    renderAdherencePerformanceChart(tradesForRisk);
    renderDrawdownScatterChart(tradesForRisk, AppState.settings.startingBalance);
    // Auto-run trailing drawdown with current sim settings
    const simAccountSize = parseFloat(document.getElementById("simAccountSize")?.value) || AppState.settings.startingBalance || 50000;
    const simMaxDDPct = parseFloat(document.getElementById("simMaxDrawdownPct")?.value) || 5;
    const simStyle = document.getElementById("simDrawdownStyle")?.value || "trailing_from_peak";
    renderTrailingDrawdownChart(tradesForRisk, simAccountSize, simMaxDDPct, simStyle);
  }
}

function setupActionButtons() {
  // Seed demo data button (Notice banner)
  const seedDemoNoticeBtn = document.getElementById("seedDemoNoticeBtn");
  const seedDemoHeaderBtn = document.getElementById("seedDemoHeaderBtn");
  
  const seedAction = () => {
    if (confirm("Would you like to seed the journal with 36 realistic trades across June 2026? This will overwrite existing empty data and set starting balance to $25,000.")) {
      AppState.seedDemoData(demoTrades);
      showToast("Seed data loaded successfully! 36 trades added.", "success");
    }
  };

  if (seedDemoNoticeBtn) seedDemoNoticeBtn.addEventListener("click", seedAction);
  if (seedDemoHeaderBtn) seedDemoHeaderBtn.addEventListener("click", seedAction);

  // Export buttons
  const exportJsonBtn = document.getElementById("exportJsonBtn");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const exportSqliteBtn = document.getElementById("exportSqliteBtn");
  
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener("click", () => {
      AppState.exportJSON();
      showToast("Data exported as JSON file.", "success");
    });
  }
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", () => {
      AppState.exportCSV();
      showToast("Data exported as CSV file.", "success");
    });
  }
  if (exportSqliteBtn) {
    exportSqliteBtn.addEventListener("click", () => {
      AppState.exportSQLite();
      showToast("Database exported as SQLite file.", "success");
    });
  }

  // Import button trigger
  const importBtn = document.getElementById("importBtn");
  const importFileInput = document.getElementById("importFileInput");

  if (importBtn && importFileInput) {
    importBtn.addEventListener("click", () => {
      importFileInput.click();
    });

    importFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const handleImportResult = (res, typeLabel) => {
        const added = typeof res === "object" ? res.added : res;
        const skipped = typeof res === "object" ? res.skipped : 0;
        if (added === 0) {
          if (skipped > 0) {
            showToast(`All ${skipped} trades in this ${typeLabel} file were already imported (duplicates skipped).`, "warning");
          } else {
            showToast(`No valid trades were imported from ${typeLabel} file.`, "warning");
          }
        } else {
          let msg = `Successfully imported ${added} new trade${added > 1 ? 's' : ''}!`;
          if (skipped > 0) msg += ` (${skipped} duplicate${skipped > 1 ? 's' : ''} skipped)`;
          showToast(msg, "success");
          handleStateChange();
        }
      };

      const ext = file.name.split('.').pop().toLowerCase();

      if (ext === "json") {
        AppState.importJSON(file)
          .then(res => handleImportResult(res, "JSON"))
          .catch(err => showToast(err.message, "error"));
      } else if (ext === "csv") {
        AppState.importCSV(file)
          .then(res => handleImportResult(res, "CSV"))
          .catch(err => showToast(err.message, "error"));
      } else if (ext === "xlsx" || ext === "xls") {
        AppState.importXLSX(file)
          .then(res => handleImportResult(res, "Excel"))
          .catch(err => showToast(err.message, "error"));
      } else {
        showToast("Unsupported file format. Please select a .json, .csv, or .xlsx file.", "error");
      }
      e.target.value = "";
    });
  }

  // Calendar Controls
  const prevMonthBtn = document.getElementById("calendarPrevMonth");
  const nextMonthBtn = document.getElementById("calendarNextMonth");
  const closeDayPanelBtn = document.getElementById("closeDayPanelBtn");

  if (prevMonthBtn) {
    prevMonthBtn.addEventListener("click", () => {
      calendarMonth--;
      if (calendarMonth < 0) {
        calendarMonth = 11;
        calendarYear--;
      }
      const backupPreset = AppState.activeFilters.datePreset;
      AppState.activeFilters.datePreset = "allTime";
      const tradesForCalendar = AppState.getFilteredTrades();
      AppState.activeFilters.datePreset = backupPreset;
      renderCalendar(calendarYear, calendarMonth, tradesForCalendar);
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.addEventListener("click", () => {
      calendarMonth++;
      if (calendarMonth > 11) {
        calendarMonth = 0;
        calendarYear++;
      }
      const backupPreset = AppState.activeFilters.datePreset;
      AppState.activeFilters.datePreset = "allTime";
      const tradesForCalendar = AppState.getFilteredTrades();
      AppState.activeFilters.datePreset = backupPreset;
      renderCalendar(calendarYear, calendarMonth, tradesForCalendar);
    });
  }

  if (closeDayPanelBtn) {
    closeDayPanelBtn.addEventListener("click", closeDayPanel);
  }
}

function toggleSeedNotice() {
  const seedNotice = document.getElementById("seedNotice");
  const seedDemoHeaderBtn = document.getElementById("seedDemoHeaderBtn");
  
  if (!seedNotice) return;

  if (AppState.trades.length === 0) {
    seedNotice.classList.remove("hidden");
    if (seedDemoHeaderBtn) seedDemoHeaderBtn.classList.remove("hidden");
  } else {
    seedNotice.classList.add("hidden");
    if (seedDemoHeaderBtn) seedDemoHeaderBtn.classList.add("hidden");
  }
}

// ============================================================
// FEATURE 1: Dark Streak Warning Banner
// ============================================================
function updateDarkStreakBanner(allTrades) {
  const banner = document.getElementById("darkStreakBanner");
  const titleEl = document.getElementById("darkStreakTitle");
  const msgEl = document.getElementById("darkStreakMessage");
  if (!banner || !titleEl || !msgEl) return;

  // Only use executed trades for current account, sorted by exit date
  const activeAcc = AppState.settings.currentAccount || "Personal";
  const executed = allTrades
    .filter(t => t.accountId === activeAcc && t.status !== "skipped")
    .sort((a, b) => new Date(b.exitDateTime) - new Date(a.exitDateTime));

  if (executed.length === 0) {
    banner.classList.add("hidden");
    return;
  }

  // Count consecutive losses from the most recent trade backwards
  let streak = 0;
  let totalLoss = 0;
  for (const t of executed) {
    const pnl = calcNetPnl(t);
    if (pnl < 0) {
      streak++;
      totalLoss += pnl;
    } else {
      break; // streak broken
    }
  }

  // Reset dismissed if streak changed (new trade added or streak broken)
  const prevStreakKey = `__darkStreakLast`;
  const prevStreak = window[prevStreakKey] || 0;
  if (streak !== prevStreak) {
    darkStreakDismissed = false;
  }
  window[prevStreakKey] = streak;

  if (streak < 3 || darkStreakDismissed) {
    banner.classList.add("hidden");
    return;
  }

  banner.classList.remove("hidden", "streak-warning", "streak-danger", "streak-critical");

  if (streak >= 7) {
    banner.classList.add("streak-critical");
    titleEl.textContent = `🚨 ${streak}-Trade Losing Streak — Risk Management Alert`;
    msgEl.textContent = `You've lost ${streak} trades in a row (${Math.abs(totalLoss).toFixed(2)} total). Consider stopping for the day and reviewing your trading plan.`;
  } else if (streak >= 5) {
    banner.classList.add("streak-danger");
    titleEl.textContent = `🔴 ${streak}-Trade Losing Streak — Caution Required`;
    msgEl.textContent = `${streak} consecutive losses totaling $${Math.abs(totalLoss).toFixed(2)}. Recommended: Step away and review your setup criteria before the next trade.`;
  } else {
    banner.classList.add("streak-warning");
    titleEl.textContent = `⚠️ ${streak}-Trade Losing Streak — Review Your Setup`;
    msgEl.textContent = `You've had ${streak} consecutive losses ($${Math.abs(totalLoss).toFixed(2)} total). Take a breath and ensure your next trade fully meets your criteria.`;
  }

  if (typeof lucide !== "undefined") lucide.createIcons();
}

// ============================================================
// FEATURE 3: Keyboard-First Trade Entry
// ============================================================
function setupKeyboardShortcuts() {
  const TAB_MAP = {
    "1": "dashboard",
    "2": "tradeLog",
    "3": "calendar",
    "4": "analytics",
    "5": "risk",
    "6": "intervention"
  };

  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    const inInput = active && (
      active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.tagName === "SELECT" ||
      active.isContentEditable
    );

    // Escape: close any open modal or day panel
    if (e.key === "Escape") {
      const tradeModal = document.getElementById("tradeModal");
      const settingsModal = document.getElementById("settingsModal");
      const shortcutsModal = document.getElementById("shortcutsModal");
      if (tradeModal && tradeModal.classList.contains("open")) { tradeModal.classList.remove("open"); return; }
      if (settingsModal && settingsModal.classList.contains("open")) { settingsModal.classList.remove("open"); return; }
      if (shortcutsModal && shortcutsModal.classList.contains("open")) { shortcutsModal.classList.remove("open"); return; }
      // Close day panel
      const dayPanel = document.getElementById("dayDetailPanel");
      if (dayPanel && dayPanel.classList.contains("open")) { dayPanel.classList.remove("open"); return; }
      return;
    }

    if (inInput) return; // Don't fire shortcuts while typing

    // ? key: toggle shortcuts modal
    if (e.key === "?" || e.key === "/") {
      e.preventDefault();
      const shortcutsModal = document.getElementById("shortcutsModal");
      if (shortcutsModal) shortcutsModal.classList.toggle("open");
      return;
    }

    // N: open new trade modal
    if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      const addBtn = document.getElementById("addNewTradeBtn");
      if (addBtn) addBtn.click();
      return;
    }

    // Alt+1-6: switch tabs
    if (e.altKey && TAB_MAP[e.key]) {
      e.preventDefault();
      const tabId = TAB_MAP[e.key];
      const tabBtn = document.querySelector(`.nav-tab-btn[data-tab="${tabId}"]`);
      if (tabBtn && !tabBtn.classList.contains("hidden") && !tabBtn.disabled) {
        tabBtn.click();
      }
    }
  });
}

// ============================================================
// FEATURE 2: Note Templates for Trade Journal Entries
// ============================================================
const NOTE_TEMPLATES = {
  setup: `📊 SETUP EXECUTED\n─────────────────\nSignal: \nEntry Trigger: \nKey Level / Confirmation: \nRisk Notes: \nExpected Outcome: `,
  psychology: `🧠 PSYCHOLOGY CHECK\n─────────────────\nPre-Trade Mental State: \nFear / Greed Level (1-10): \nEmotional Bias: \nPost-Trade Reflection: `,
  mistake: `❌ MISTAKE REVIEW\n─────────────────\nWhat Went Wrong: \nRoot Cause: \nRule Violated: \nCorrection for Next Time: `,
  winning: `✅ WINNING TRADE\n─────────────────\nWhat Worked: \nSetup Quality (1-10): \nExecution Rating: \nKey Insight to Keep: `,
  skipped: `⏭️ SKIPPED TRADE\n─────────────────\nSignal Details: \nWhy Skipped: \nOpportunity Cost Estimate: \nWould I Take It Again? `,
  lesson: `📖 LESSON LEARNED\n─────────────────\nKey Takeaway: \nHow to Apply Next Time: \nRule to Add / Reinforce: `,
  process: `⚙️ PROCESS REVIEW\n─────────────────\nChecklist Adherence: \nExecution vs Plan: \nAreas to Improve: \nProcess Grade (A-F): `
};

function setupNoteTemplates() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".note-tpl-btn");
    if (!btn) return;

    const templateKey = btn.dataset.template;
    const targetField = btn.dataset.target || "notes"; // default to notes
    const textareaId = targetField === "lessons" ? "tradeLessons" : "tradeNotes";
    const textarea = document.getElementById(textareaId);
    if (!textarea || !NOTE_TEMPLATES[templateKey]) return;

    const existing = textarea.value.trim();
    if (existing) {
      textarea.value = existing + "\n\n─────────────────\n" + NOTE_TEMPLATES[templateKey];
    } else {
      textarea.value = NOTE_TEMPLATES[templateKey];
    }

    textarea.focus();
    textarea.scrollTop = textarea.scrollHeight;
  });
}

// ============================================================
// FEATURE 6: PDF Performance Report Export
// ============================================================
async function exportPdfReport() {
  if (typeof window.jspdf === "undefined") {
    showToast("PDF library not loaded. Please check your internet connection.", "error");
    return;
  }

  showToast("Generating PDF report...", "info");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const trades = AppState.getFilteredTrades();
  const balance = AppState.settings.startingBalance || 25000;
  const account = AppState.settings.currentAccount || "Personal";

  // ── Helpers ──
  const W = 210; // A4 width mm
  const MARGIN = 18;
  const contentW = W - MARGIN * 2;
  let y = 20;

  const fmtCurrency = (v) => {
    const sign = v >= 0 ? "+" : "";
    return `${sign}$${Math.abs(v).toFixed(2)}`;
  };

  // ── Header ──
  doc.setFillColor(14, 14, 18);
  doc.rect(0, 0, W, 30, "F");
  doc.setTextColor(99, 102, 241);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("TradeFlow", MARGIN, 14);
  doc.setTextColor(200, 200, 210);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Performance Report — ${account} Account`, MARGIN, 21);

  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.text(`Generated: ${now}`, W - MARGIN, 21, { align: "right" });

  y = 40;

  // ── Summary Stats ──
  let totalPnl = 0, wins = 0, losses = 0, grossWin = 0, grossLoss = 0;
  for (const t of trades) {
    const pnl = calcNetPnl(t);
    totalPnl += pnl;
    if (pnl > 0) { wins++; grossWin += pnl; }
    else if (pnl < 0) { losses++; grossLoss += Math.abs(pnl); }
  }
  const winRate = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(1) : "0.0";
  const pf = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : "∞";
  const endBalance = balance + totalPnl;

  const statBoxes = [
    { label: "Net Profit", value: fmtCurrency(totalPnl), color: totalPnl >= 0 ? [16, 185, 129] : [239, 68, 68] },
    { label: "End Balance", value: `$${endBalance.toFixed(2)}`, color: [99, 102, 241] },
    { label: "Win Rate", value: `${winRate}%`, color: [250, 250, 250] },
    { label: "Profit Factor", value: pf, color: [250, 250, 250] },
    { label: "Trades Taken", value: `${trades.length}`, color: [250, 250, 250] },
    { label: "W / L", value: `${wins} / ${losses}`, color: [250, 250, 250] }
  ];

  const boxW = contentW / 3;
  const boxH = 18;
  for (let i = 0; i < statBoxes.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const bx = MARGIN + col * boxW;
    const by = y + row * (boxH + 4);
    doc.setFillColor(24, 24, 27);
    doc.roundedRect(bx, by, boxW - 3, boxH, 3, 3, "F");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 130);
    doc.setFont("helvetica", "normal");
    doc.text(statBoxes[i].label.toUpperCase(), bx + 4, by + 6);
    doc.setFontSize(12);
    doc.setTextColor(...statBoxes[i].color);
    doc.setFont("helvetica", "bold");
    doc.text(statBoxes[i].value, bx + 4, by + 13);
  }

  y += (Math.ceil(statBoxes.length / 3)) * (boxH + 4) + 10;

  // ── Top 5 Winning & Losing Trades ──
  const sorted = [...trades].sort((a, b) => calcNetPnl(b) - calcNetPnl(a));
  const top5 = sorted.slice(0, 5);
  const bot5 = sorted.slice(-5).reverse();

  const drawTradeTable = (title, tradeList, startY) => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(180, 180, 200);
    doc.text(title, MARGIN, startY);
    startY += 6;

    const cols = ["#", "Symbol", "Date", "P&L", "Direction"];
    const colW = [8, 28, 40, 30, 28];
    let cx = MARGIN;
    doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 110);
    doc.setFont("helvetica", "normal");
    for (let c = 0; c < cols.length; c++) {
      doc.text(cols[c], cx, startY);
      cx += colW[c];
    }
    startY += 2;
    doc.setDrawColor(50, 50, 60);
    doc.line(MARGIN, startY, MARGIN + contentW, startY);
    startY += 4;

    for (let i = 0; i < tradeList.length; i++) {
      const t = tradeList[i];
      const pnl = calcNetPnl(t);
      const color = pnl >= 0 ? [16, 185, 129] : [239, 68, 68];
      const dateStr = t.exitDateTime ? new Date(t.exitDateTime).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "--";
      const rowData = [
        String(i + 1),
        (t.symbol || "--").toUpperCase(),
        dateStr,
        fmtCurrency(pnl),
        (t.direction || "--").toUpperCase()
      ];
      cx = MARGIN;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      for (let c = 0; c < rowData.length; c++) {
        if (c === 3) {
          doc.setTextColor(...color);
          doc.setFont("helvetica", "bold");
        } else {
          doc.setTextColor(210, 210, 220);
          doc.setFont("helvetica", "normal");
        }
        doc.text(rowData[c], cx, startY);
        cx += colW[c];
      }
      startY += 6;
    }
    return startY + 4;
  };

  y = drawTradeTable("Top 5 Winning Trades", top5, y);
  y = drawTradeTable("Top 5 Losing Trades", bot5, y);

  // ── Footer ──
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 90);
  doc.setFont("helvetica", "italic");
  doc.text("Generated by TradeFlow Journal  •  For informational purposes only. Not financial advice.", W / 2, 285, { align: "center" });

  doc.save(`TradeFlow-Report-${account.replace(/\s+/g, "-")}-${now.replace(/\s+/g, "-")}.pdf`);
  showToast("PDF report exported successfully!", "success");
}

window.addEventListener("themeChanged", () => {
  renderActiveView(AppState.getFilteredTrades());
});

// Kick off when DOM is ready
document.addEventListener("DOMContentLoaded", init);


function setupScreenshotDropzones() {
  const setupDropzone = (zoneId, inputId, previewId, fileInputId) => {
    const zone = document.getElementById(zoneId);
    const urlInput = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    const fileInput = document.getElementById(fileInputId);

    if (!zone || !urlInput) return;

    zone.addEventListener("click", () => fileInput && fileInput.click());

    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("dragover");
    });

    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));

    const handleFile = async (file) => {
      if (!file || !file.type.startsWith("image/")) return;
      try {
        const compressed = await compressImage(file, 1000, 0.8);
        urlInput.value = compressed;
        if (preview) {
          preview.style.display = "block";
          preview.querySelector("img").src = compressed;
        }
      } catch (err) {
        console.error("Image compression failed:", err);
      }
    };

    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    });

    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) {
          handleFile(e.target.files[0]);
        }
      });
    }
  };

  setupDropzone("screenshotDropzone1", "tradeScreenshotUrl", "screenshotPreview1", "screenshotFile1");
  setupDropzone("screenshotDropzone2", "tradeScreenshotUrl2", "screenshotPreview2", "screenshotFile2");

  // Global Paste Listener for Trade Modal
  document.addEventListener("paste", async (e) => {
    const modal = document.getElementById("tradeModal");
    if (!modal || modal.classList.contains("hidden")) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (let item of items) {
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        if (file) {
          try {
            const compressed = await compressImage(file, 1000, 0.8);
            const input1 = document.getElementById("tradeScreenshotUrl");
            const input2 = document.getElementById("tradeScreenshotUrl2");
            const preview1 = document.getElementById("screenshotPreview1");
            const preview2 = document.getElementById("screenshotPreview2");

            if (!input1.value) {
              input1.value = compressed;
              if (preview1) { preview1.style.display = "block"; preview1.querySelector("img").src = compressed; }
              showToast("Pasted image to Entry Chart!", "success");
            } else {
              input2.value = compressed;
              if (preview2) { preview2.style.display = "block"; preview2.querySelector("img").src = compressed; }
              showToast("Pasted image to Exit Chart!", "success");
            }
          } catch (err) {
            console.error("Paste image compression error:", err);
          }
        }
      }
    }
  });

  const mcBtn = document.getElementById("runMonteCarloBtn");
  if (mcBtn) {
    mcBtn.addEventListener("click", () => {
      const tradesForRisk = AppState.getFilteredTrades();
      renderMonteCarloChart(tradesForRisk, AppState.settings.startingBalance);
      showToast("Re-ran 500 Monte Carlo simulation paths!", "info");
    });
  }

  // Trailing Drawdown Sim button
  const trailingSimBtn = document.getElementById("runTrailingSimBtn");
  if (trailingSimBtn) {
    trailingSimBtn.addEventListener("click", () => {
      const backupStatus = AppState.activeFilters.status;
      AppState.activeFilters.status = "all";
      const tradesForRisk = AppState.getFilteredTrades();
      AppState.activeFilters.status = backupStatus;
      const simAccountSize = parseFloat(document.getElementById("simAccountSize")?.value) || 50000;
      const simMaxDDPct = parseFloat(document.getElementById("simMaxDrawdownPct")?.value) || 5;
      const simStyle = document.getElementById("simDrawdownStyle")?.value || "trailing_from_peak";
      renderTrailingDrawdownChart(tradesForRisk, simAccountSize, simMaxDDPct, simStyle);
      showToast("Prop firm trailing drawdown simulation updated!", "info");
    });
  }

  // PDF Export button
  const exportPdfBtn = document.getElementById("exportPdfBtn");
  if (exportPdfBtn) {
    exportPdfBtn.addEventListener("click", () => {
      exportPdfReport();
    });
  }

  // Dark streak banner dismiss
  const darkStreakDismissBtn = document.getElementById("darkStreakDismissBtn");
  if (darkStreakDismissBtn) {
    darkStreakDismissBtn.addEventListener("click", () => {
      darkStreakDismissed = true;
      const banner = document.getElementById("darkStreakBanner");
      if (banner) banner.classList.add("hidden");
    });
  }

  // Keyboard shortcuts modal
  const shortcutsBtn = document.getElementById("keyboardShortcutsBtn");
  const closeShortcutsBtn = document.getElementById("closeShortcutsBtn");
  const closeShortcutsOkBtn = document.getElementById("closeShortcutsOkBtn");
  const shortcutsModal = document.getElementById("shortcutsModal");
  const openShortcuts = () => { if (shortcutsModal) shortcutsModal.classList.add("open"); };
  const closeShortcuts = () => { if (shortcutsModal) shortcutsModal.classList.remove("open"); };
  if (shortcutsBtn) shortcutsBtn.addEventListener("click", openShortcuts);
  if (closeShortcutsBtn) closeShortcutsBtn.addEventListener("click", closeShortcuts);
  if (closeShortcutsOkBtn) closeShortcutsOkBtn.addEventListener("click", closeShortcuts);
  if (shortcutsModal) {
    shortcutsModal.addEventListener("click", (e) => {
      if (e.target === shortcutsModal) closeShortcuts();
    });
  }
}
