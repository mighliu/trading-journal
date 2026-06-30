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
  renderRiskTab
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
  renderInterventionChart,
  renderInterventionAttributionChart,
  renderInterventionHourlyChart,
  renderInterventionStreakChart,
  renderAdherenceDrawdownChart,
  renderHoldTimeChart,
  destroyAllCharts,
  renderMfeMaeCharts,
  renderRMultipleChart,
  renderRollingPerformanceChart,
  renderTradeSequenceChart,
  renderPostLossBehaviorChart,
  renderTimelineReplayChart
} from './charts.js';
import { hasSevereDeviation } from './utils.js';

let currentTab = "dashboard";
const calendarToday = new Date("2026-06-29T17:34:00"); // Base date context
let calendarYear = calendarToday.getFullYear();
let calendarMonth = calendarToday.getMonth();

function init() {
  // 1. Load data
  AppState.loadFromStorage();

  // Populate dynamic accounts list
  populateAccountSelector();

  // 2. Setup general DOM listeners
  setupUIListeners();
  setupTabRouting();
  setupActionButtons();

  // 3. Register state change callbacks
  AppState.onChange(handleStateChange);

  // 4. Initial render
  handleStateChange();

  // Render static icons on load
  lucide.createIcons();

  // If no trades exist, show seed notice
  toggleSeedNotice();
}

function handleStateChange() {
  const filteredTrades = AppState.getFilteredTrades();
  const allTrades = AppState.trades;

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

  // Handle seed notice toggle
  toggleSeedNotice();
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

      // Render the newly opened tab
      const filteredTrades = AppState.getFilteredTrades();
      renderActiveView(filteredTrades);
    });
  });
}

function renderActiveView(filteredTrades) {
  // Clear charts before rendering to avoid overlay bugs
  destroyAllCharts();

  if (currentTab === "dashboard") {
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
    renderMfeMaeCharts(tradesForRisk);
    renderRMultipleChart(tradesForRisk);
    renderRollingPerformanceChart(tradesForRisk);
    renderTradeSequenceChart(tradesForRisk);
    renderPostLossBehaviorChart(tradesForRisk);
    renderTimelineReplayChart(tradesForRisk);
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

      const ext = file.name.split('.').pop().toLowerCase();
      if (ext === "json") {
        AppState.importJSON(file)
          .then(count => {
            showToast(`Successfully imported ${count} trades from JSON file!`, "success");
            handleStateChange();
          })
          .catch(err => showToast(err.message, "error"));
      } else if (ext === "csv") {
        AppState.importCSV(file)
          .then(count => {
            showToast(`Successfully imported ${count} trades from CSV file!`, "success");
            handleStateChange();
          })
          .catch(err => showToast(err.message, "error"));
      } else if (ext === "xlsx") {
        AppState.importXLSX(file)
          .then(count => {
            showToast(`Successfully imported ${count} trades from Excel file!`, "success");
            handleStateChange();
          })
          .catch(err => showToast(err.message, "error"));
      } else {
        showToast("Unsupported file format. Please upload JSON, CSV, or XLSX.", "error");
      }
      
      // Reset file input value
      importFileInput.value = "";
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

window.addEventListener("themeChanged", () => {
  renderActiveView(AppState.getFilteredTrades());
});

// Kick off when DOM is ready
document.addEventListener("DOMContentLoaded", init);
