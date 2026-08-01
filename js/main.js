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
  renderTimelineReplayChart,
  renderAdherencePerformanceChart,
  renderDrawdownScatterChart,
  renderMonteCarloChart,
  destroyAllCharts
} from './charts.js';
import { compressImage, hasSevereDeviation } from './utils.js';

let currentTab = "dashboard";
const calendarToday = new Date("2026-06-29T17:34:00"); // Base date context
let calendarYear = calendarToday.getFullYear();
let calendarMonth = calendarToday.getMonth();

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
}

function handleStateChange() {
  const filteredTrades = AppState.getFilteredTrades();
  const allTrades = AppState.trades;

  // Sync filter dropdowns UI
  const datePresetElem = document.getElementById("filterDatePreset");
  if (datePresetElem) datePresetElem.value = AppState.activeFilters.datePreset || "allTime";

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
}
