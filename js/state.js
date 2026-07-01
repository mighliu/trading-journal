import { calcNetPnl, getDateRange, normalizeDateTime, parseLocalDate, getSymbolMultiplier } from './utils.js';


class StateManager {
  constructor() {
    this.trades = [];
    this.settings = {
      startingBalance: 25000,
      defaultFees: 0,
      accounts: {
        "Personal": { startingBalance: 25000, defaultFees: 0 },
        "Prop Firm": { startingBalance: 50000, defaultFees: 1.50 }
      },
      currentAccount: "Personal"
    };
    this.activeFilters = {
      datePreset: "allTime",
      startDate: null,
      endDate: null,
      symbol: "",
      direction: "all",
      outcome: "all",
      setup: "all",
      assetClass: "all",
      status: "executed"
    };
    this.callbacks = [];
  }

  loadFromStorage() {
    try {
      const storedTrades = localStorage.getItem("tf_trades");
      if (storedTrades) {
        this.trades = JSON.parse(storedTrades);
      } else {
        this.trades = [];
      }

      const storedSettings = localStorage.getItem("tf_settings");
      if (storedSettings) {
        this.settings = { ...this.settings, ...JSON.parse(storedSettings) };
      }

      // Migration check for accounts
      if (!this.settings.accounts) {
        const oldBal = this.settings.startingBalance || 25000;
        const oldFees = this.settings.defaultFees || 0;
        this.settings.accounts = {
          "Personal": { startingBalance: oldBal, defaultFees: oldFees },
          "Prop Firm": { startingBalance: 50000, defaultFees: 1.50 }
        };
        this.settings.currentAccount = "Personal";
      }

      // Migration check for trade accountIds and analytics properties
      let needsSave = false;
      this.trades.forEach(t => {
        if (!t.accountId) {
          t.accountId = "Personal";
          needsSave = true;
        }
        if (!t.mistake) {
          t.mistake = "";
          needsSave = true;
        }
        if (!t.status) {
          t.status = "executed";
          needsSave = true;
        }
        if (t.maxPrice == null || t.minPrice == null) {
          const higher = Math.max(t.entryPrice, t.exitPrice);
          const lower = Math.min(t.entryPrice, t.exitPrice);
          const diff = higher - lower;
          
          if (t.direction === "long") {
            t.maxPrice = parseFloat((higher + (diff > 0 ? diff * (0.1 + Math.random() * 0.8) : higher * 0.015)).toFixed(2));
            let stopVal = t.stopLoss || (lower * 0.95);
            if (t.exitPrice <= stopVal) {
              t.minPrice = t.exitPrice;
            } else {
              t.minPrice = parseFloat((lower - (lower - stopVal) * (Math.random() * 0.8)).toFixed(2));
            }
          } else {
            t.minPrice = parseFloat((lower - (diff > 0 ? diff * (0.1 + Math.random() * 0.8) : lower * 0.015)).toFixed(2));
            let stopVal = t.stopLoss || (higher * 1.05);
            if (t.exitPrice >= stopVal) {
              t.maxPrice = t.exitPrice;
            } else {
              t.maxPrice = parseFloat((higher + (stopVal - higher) * (Math.random() * 0.8)).toFixed(2));
            }
          }
          needsSave = true;
        }
      });
      if (needsSave) {
        this.saveToStorage();
      }
    } catch (e) {
      console.error("Failed to load from localStorage:", e);
      this.trades = [];
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem("tf_trades", JSON.stringify(this.trades));
      localStorage.setItem("tf_settings", JSON.stringify(this.settings));
      this.notify();
    } catch (e) {
      console.error("Failed to save to localStorage:", e);
      throw new Error("Storage quota exceeded or storage disabled.");
    }
  }

  onChange(callback) {
    this.callbacks.push(callback);
  }

  notify() {
    for (const cb of this.callbacks) {
      cb();
    }
  }

  addTrade(tradeData) {
    const trade = {
      id: "trade_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
      symbol: (tradeData.symbol || "").toUpperCase().trim(),
      direction: tradeData.direction === "short" ? "short" : "long",
      entryDateTime: normalizeDateTime(tradeData.entryDateTime),
      exitDateTime: normalizeDateTime(tradeData.exitDateTime),
      entryPrice: parseFloat(tradeData.entryPrice) || 0,
      exitPrice: parseFloat(tradeData.exitPrice) || 0,
      qty: parseFloat(tradeData.qty) || 0,
      stopLoss: tradeData.stopLoss ? parseFloat(tradeData.stopLoss) : null,
      fees: parseFloat(tradeData.fees) || 0,
      setup: (tradeData.setup || "").trim(),
      notes: (tradeData.notes || "").trim(),
      lessons: (tradeData.lessons || "").trim(),
      screenshotUrl: (tradeData.screenshotUrl || "").trim(),
      signalEntryPrice: tradeData.signalEntryPrice ? parseFloat(tradeData.signalEntryPrice) : null,
      signalExitPrice: tradeData.signalExitPrice ? parseFloat(tradeData.signalExitPrice) : null,
      accountId: tradeData.accountId || this.settings.currentAccount || "Personal",
      mistake: (tradeData.mistake || "").trim(),
      assetClass: tradeData.assetClass || "stocks",
      status: tradeData.status || "executed",
      overridePnl: tradeData.overridePnl === true,
      manualPnl: tradeData.manualPnl != null ? parseFloat(tradeData.manualPnl) : null,
      interventionType: tradeData.interventionType || "followed",
      maxPrice: tradeData.maxPrice != null && tradeData.maxPrice !== "" ? parseFloat(tradeData.maxPrice) : null,
      minPrice: tradeData.minPrice != null && tradeData.minPrice !== "" ? parseFloat(tradeData.minPrice) : null,
      mfe: tradeData.mfe != null ? parseFloat(tradeData.mfe) : null,
      mae: tradeData.mae != null ? parseFloat(tradeData.mae) : null,
      checklistItems: tradeData.checklistItems || null,
      adherenceScore: tradeData.adherenceScore !== undefined ? tradeData.adherenceScore : null
    };
    
    this.trades.push(trade);
    this.saveToStorage();
    return trade;
  }

  updateTrade(id, tradeData) {
    const idx = this.trades.findIndex(t => t.id === id);
    if (idx === -1) throw new Error("Trade not found");
    
    this.trades[idx] = {
      ...this.trades[idx],
      symbol: (tradeData.symbol || "").toUpperCase().trim(),
      direction: tradeData.direction === "short" ? "short" : "long",
      entryDateTime: normalizeDateTime(tradeData.entryDateTime),
      exitDateTime: normalizeDateTime(tradeData.exitDateTime),
      entryPrice: parseFloat(tradeData.entryPrice) || 0,
      exitPrice: parseFloat(tradeData.exitPrice) || 0,
      qty: parseFloat(tradeData.qty) || 0,
      stopLoss: tradeData.stopLoss ? parseFloat(tradeData.stopLoss) : null,
      fees: parseFloat(tradeData.fees) || 0,
      setup: (tradeData.setup || "").trim(),
      notes: (tradeData.notes || "").trim(),
      lessons: (tradeData.lessons || "").trim(),
      screenshotUrl: (tradeData.screenshotUrl || "").trim(),
      signalEntryPrice: tradeData.signalEntryPrice ? parseFloat(tradeData.signalEntryPrice) : null,
      signalExitPrice: tradeData.signalExitPrice ? parseFloat(tradeData.signalExitPrice) : null,
      accountId: tradeData.accountId || this.trades[idx].accountId || "Personal",
      mistake: (tradeData.mistake || "").trim(),
      assetClass: tradeData.assetClass || "stocks",
      status: tradeData.status || "executed",
      overridePnl: tradeData.overridePnl === true,
      manualPnl: tradeData.manualPnl != null ? parseFloat(tradeData.manualPnl) : null,
      interventionType: tradeData.interventionType || "followed",
      maxPrice: tradeData.maxPrice != null && tradeData.maxPrice !== "" ? parseFloat(tradeData.maxPrice) : null,
      minPrice: tradeData.minPrice != null && tradeData.minPrice !== "" ? parseFloat(tradeData.minPrice) : null,
      mfe: tradeData.mfe != null ? parseFloat(tradeData.mfe) : null,
      mae: tradeData.mae != null ? parseFloat(tradeData.mae) : null,
      checklistItems: tradeData.checklistItems || null,
      adherenceScore: tradeData.adherenceScore !== undefined ? tradeData.adherenceScore : null
    };
    
    this.saveToStorage();
    return this.trades[idx];
  }

  deleteTrade(id) {
    const beforeLen = this.trades.length;
    this.trades = this.trades.filter(t => t.id !== id);
    if (this.trades.length === beforeLen) throw new Error("Trade not found");
    this.saveToStorage();
  }

  clearAllData() {
    this.trades = [];
    const accounts = this.settings.accounts || {
      "Personal": { startingBalance: 25000, defaultFees: 0 },
      "Prop Firm": { startingBalance: 50000, defaultFees: 1.50 }
    };
    const currentAccount = this.settings.currentAccount || "Personal";
    this.settings = {
      startingBalance: accounts[currentAccount]?.startingBalance || 25000,
      defaultFees: accounts[currentAccount]?.defaultFees || 0,
      accounts,
      currentAccount
    };
    this.saveToStorage();
  }

  clearCurrentAccountTrades() {
    const activeAccount = this.settings.currentAccount || "Personal";
    this.trades = this.trades.filter(t => t.accountId !== activeAccount);
    this.saveToStorage();
  }

  deleteCurrentAccount() {
    const activeAccount = this.settings.currentAccount || "Personal";
    const accountKeys = Object.keys(this.settings.accounts || {});
    if (accountKeys.length <= 1) {
      throw new Error("Cannot delete the only remaining account. Create or switch to another account first.");
    }
    
    // 1. Delete matching trades
    this.trades = this.trades.filter(t => t.accountId !== activeAccount);
    
    // 2. Remove configuration
    delete this.settings.accounts[activeAccount];
    
    // 3. Switch to the next available account
    const remainingKeys = Object.keys(this.settings.accounts);
    const nextAccount = remainingKeys[0];
    this.settings.currentAccount = nextAccount;
    this.settings.startingBalance = this.settings.accounts[nextAccount].startingBalance || 25000;
    this.settings.defaultFees = this.settings.accounts[nextAccount].defaultFees || 0;
    
    this.saveToStorage();
  }

  seedDemoData(demoTrades) {
    this.trades = demoTrades.map(t => {
      let sigEntry = t.signalEntryPrice;
      let sigExit = t.signalExitPrice;
      
      // If signal price is undefined/null, generate realistic mock slippage
      if (sigEntry == null) {
        const slippagePct = 0.0005 + (Math.random() * 0.001); // 0.05% - 0.15%
        const diff = t.entryPrice * slippagePct;
        sigEntry = t.direction === "long" ? parseFloat((t.entryPrice - diff).toFixed(2)) : parseFloat((t.entryPrice + diff).toFixed(2));
      }
      if (sigExit == null) {
        const slippagePct = 0.0005 + (Math.random() * 0.001);
        const diff = t.exitPrice * slippagePct;
        sigExit = t.direction === "long" ? parseFloat((t.exitPrice + diff).toFixed(2)) : parseFloat((t.exitPrice - diff).toFixed(2));
      }

      const sym = t.symbol.toUpperCase();
      let assetClass = "stocks";
      if (sym.startsWith("BTC") || sym.startsWith("ETH")) {
        assetClass = "crypto";
      } else if (sym.startsWith("EUR") || sym.includes("/") || sym === "ES") {
        assetClass = "forex";
      } else if (sym === "SPY" || sym === "QQQ") {
        assetClass = "options";
      }

      // Generate realistic maxPrice & minPrice for MFE/MAE analysis
      let maxPrice = t.maxPrice;
      let minPrice = t.minPrice;
      if (maxPrice == null || minPrice == null) {
        const higher = Math.max(t.entryPrice, t.exitPrice);
        const lower = Math.min(t.entryPrice, t.exitPrice);
        const diff = higher - lower;
        
        if (t.direction === "long") {
          maxPrice = parseFloat((higher + (diff > 0 ? diff * (0.1 + Math.random() * 0.8) : higher * 0.015)).toFixed(2));
          let stopVal = t.stopLoss || (lower * 0.95);
          if (t.exitPrice <= stopVal) {
            minPrice = t.exitPrice;
          } else {
            minPrice = parseFloat((lower - (lower - stopVal) * (Math.random() * 0.8)).toFixed(2));
          }
        } else {
          minPrice = parseFloat((lower - (diff > 0 ? diff * (0.1 + Math.random() * 0.8) : lower * 0.015)).toFixed(2));
          let stopVal = t.stopLoss || (higher * 1.05);
          if (t.exitPrice >= stopVal) {
            maxPrice = t.exitPrice;
          } else {
            maxPrice = parseFloat((higher + (stopVal - higher) * (Math.random() * 0.8)).toFixed(2));
          }
        }
      }

      // Generate realistic mock entry checklist adherence values for demo data
      const choices = [
        { trend: true, level: true, volume: true, trigger: true, risk: true },     // 100%
        { trend: true, level: true, volume: true, trigger: true, risk: false },    // 80%
        { trend: true, level: true, volume: false, trigger: true, risk: true },    // 80%
        { trend: true, level: false, volume: true, trigger: true, risk: false },   // 60%
        { trend: false, level: true, volume: false, trigger: true, risk: true },   // 60%
        { trend: false, level: false, volume: true, trigger: false, risk: true },  // 40%
        { trend: false, level: true, volume: false, trigger: false, risk: false }, // 20%
        { trend: false, level: false, volume: false, trigger: false, risk: false } // 0%
      ];
      let checklistVal;
      if (t.mistake) {
        checklistVal = choices[4 + Math.floor(Math.random() * 4)]; // 0% - 60%
      } else {
        checklistVal = choices[Math.floor(Math.random() * 5)]; // 60% - 100%
      }
      const checkedCount = Object.values(checklistVal).filter(Boolean).length;
      const adherenceScore = Math.round((checkedCount / 5) * 100);

      return {
        ...t,
        signalEntryPrice: sigEntry,
        signalExitPrice: sigExit,
        maxPrice,
        minPrice,
        accountId: t.accountId || "Personal",
        mistake: t.mistake || "",
        assetClass: t.assetClass || assetClass,
        status: t.status || "executed",
        checklistItems: t.checklistItems || checklistVal,
        adherenceScore: t.adherenceScore != null ? t.adherenceScore : adherenceScore
      };
    });

    const accounts = this.settings.accounts || {
      "Personal": { startingBalance: 25000, defaultFees: 0 },
      "Prop Firm": { startingBalance: 50000, defaultFees: 1.50 }
    };
    const currentAccount = this.settings.currentAccount || "Personal";
    this.settings = {
      startingBalance: accounts[currentAccount]?.startingBalance || 25000,
      defaultFees: accounts[currentAccount]?.defaultFees || 0,
      accounts,
      currentAccount
    };
    this.saveToStorage();
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.saveToStorage();
  }

  addAccount(name, balance = 25000, fees = 0) {
    if (!name) throw new Error("Account name is required.");
    const formattedName = name.trim();
    if (!this.settings.accounts) {
      this.settings.accounts = {};
    }
    if (this.settings.accounts[formattedName]) {
      throw new Error("An account with this name already exists.");
    }
    this.settings.accounts[formattedName] = { startingBalance: balance, defaultFees: fees };
    this.settings.currentAccount = formattedName;
    this.settings.startingBalance = balance;
    this.settings.defaultFees = fees;
    this.saveToStorage();
  }

  setFilters(filters) {
    this.activeFilters = { ...this.activeFilters, ...filters };
    this.notify();
  }

  getFilteredTrades() {
    const activeAcc = this.settings.currentAccount || "Personal";
    let list = this.trades.filter(t => t.accountId === activeAcc);

    // Date range filter
    let startLimit = null;
    let endLimit = null;

    if (this.activeFilters.datePreset === "custom") {
      if (this.activeFilters.startDate) {
        startLimit = parseLocalDate(this.activeFilters.startDate);
        if (startLimit) startLimit.setHours(0, 0, 0, 0);
      }
      if (this.activeFilters.endDate) {
        endLimit = parseLocalDate(this.activeFilters.endDate);
        if (endLimit) endLimit.setHours(23, 59, 59, 999);
      }
    } else {
      // Use current system date for date range filtering
      const baseDate = new Date();
      const limits = getDateRange(this.activeFilters.datePreset, baseDate);
      startLimit = limits.start;
      endLimit = limits.end;
    }

    list = list.filter(trade => {
      const exitTime = new Date(trade.exitDateTime);
      if (startLimit && exitTime < startLimit) return false;
      if (endLimit && exitTime > endLimit) return false;
      return true;
    });

    // Symbol filter
    if (this.activeFilters.symbol) {
      const query = this.activeFilters.symbol.toUpperCase().trim();
      list = list.filter(t => t.symbol.includes(query));
    }

    // Direction filter
    if (this.activeFilters.direction !== "all") {
      list = list.filter(t => t.direction === this.activeFilters.direction);
    }

    // Outcome filter
    if (this.activeFilters.outcome !== "all") {
      list = list.filter(t => {
        const netPnl = calcNetPnl(t);
        if (this.activeFilters.outcome === "win") return netPnl > 0;
        if (this.activeFilters.outcome === "loss") return netPnl < 0;
        if (this.activeFilters.outcome === "breakeven") return netPnl === 0;
        return true;
      });
    }

    // Setup filter
    if (this.activeFilters.setup !== "all") {
      list = list.filter(t => {
        const tags = (t.setup || "").split(",").map(s => s.trim().toLowerCase());
        return tags.includes(this.activeFilters.setup.toLowerCase());
      });
    }

    // Asset Class filter
    if (this.activeFilters.assetClass && this.activeFilters.assetClass !== "all") {
      list = list.filter(t => t.assetClass === this.activeFilters.assetClass);
    }

    // Status filter
    if (this.activeFilters.status && this.activeFilters.status !== "all") {
      list = list.filter(t => (t.status || "executed") === this.activeFilters.status);
    }

    // Sort by exit datetime descending (most recent first)
    return list.sort((a, b) => new Date(b.exitDateTime) - new Date(a.exitDateTime));
  }

  getUniqueSetups() {
    const setups = this.trades.flatMap(t => (t.setup || "").split(",")).map(s => s.trim()).filter(Boolean);
    return [...new Set(setups)].sort();
  }

  getUniqueSymbols() {
    const symbols = this.trades.map(t => t.symbol).filter(Boolean);
    return [...new Set(symbols)].sort();
  }

  getStorageUsage() {
    const str = JSON.stringify(this.trades) + JSON.stringify(this.settings);
    // Average limit is 5MB = 5 * 1024 * 1024 bytes
    const bytesUsed = str.length * 2; // UTF-16 is 2 bytes per char in JS
    const maxBytes = 5 * 1024 * 1024;
    return {
      bytesUsed,
      maxBytes,
      percentage: Math.min((bytesUsed / maxBytes) * 100, 100)
    };
  }

  exportJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.trades, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `tradeflow_journal_export_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  exportCSV() {
    const headers = [
      "ID", "Symbol", "Direction", "EntryDateTime", "ExitDateTime", 
      "EntryPrice", "ExitPrice", "Qty", "StopLoss", "Fees", "Setup", 
      "Notes", "Lessons", "ScreenshotUrl", "SignalEntryPrice", "SignalExitPrice",
      "Mistake", "AccountId", "AssetClass", "Status", "OverridePnl", "ManualPnl", "InterventionType",
      "MaxPrice", "MinPrice", "MFE", "MAE"
    ];
    
    const rows = this.trades.map(t => [
      t.id,
      t.symbol,
      t.direction,
      t.entryDateTime,
      t.exitDateTime,
      t.entryPrice,
      t.exitPrice,
      t.qty,
      t.stopLoss || "",
      t.fees,
      `"${(t.setup || "").replace(/"/g, '""')}"`,
      `"${(t.notes || "").replace(/"/g, '""')}"`,
      `"${(t.lessons || "").replace(/"/g, '""')}"`,
      t.screenshotUrl || "",
      t.signalEntryPrice || "",
      t.signalExitPrice || "",
      `"${(t.mistake || "").replace(/"/g, '""')}"`,
      t.accountId || "Personal",
      t.assetClass || "stocks",
      t.status || "executed",
      t.overridePnl || false,
      t.manualPnl != null ? t.manualPnl : "",
      t.interventionType || "followed",
      t.maxPrice != null ? t.maxPrice : "",
      t.minPrice != null ? t.minPrice : "",
      t.mfe != null ? t.mfe : "",
      t.mae != null ? t.mae : ""
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `tradeflow_journal_export_${Date.now()}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          if (!Array.isArray(imported)) {
            return reject(new Error("Imported file must contain an array of trades."));
          }
          // Basic validation and mapping
          const validated = imported.map(t => ({
            id: t.id || "trade_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
            symbol: (t.symbol || "UNKNOWN").toUpperCase(),
            direction: t.direction === "short" ? "short" : "long",
            entryDateTime: normalizeDateTime(t.entryDateTime || new Date().toISOString()),
            exitDateTime: normalizeDateTime(t.exitDateTime || new Date().toISOString()),
            entryPrice: parseFloat(t.entryPrice) || 0,
            exitPrice: parseFloat(t.exitPrice) || 0,
            qty: parseFloat(t.qty) || 0,
            stopLoss: t.stopLoss ? parseFloat(t.stopLoss) : null,
            fees: parseFloat(t.fees) || 0,
            setup: (t.setup || "").trim(),
            notes: (t.notes || "").trim(),
            lessons: (t.lessons || "").trim(),
            screenshotUrl: (t.screenshotUrl || "").trim(),
            signalEntryPrice: t.signalEntryPrice ? parseFloat(t.signalEntryPrice) : null,
            signalExitPrice: t.signalExitPrice ? parseFloat(t.signalExitPrice) : null,
            accountId: t.accountId || "Personal",
            mistake: (t.mistake || "").trim(),
            assetClass: t.assetClass || "stocks",
            status: t.status || "executed",
            overridePnl: t.overridePnl === true,
            manualPnl: t.manualPnl != null ? parseFloat(t.manualPnl) : null,
            interventionType: t.interventionType || "followed",
            maxPrice: t.maxPrice != null && t.maxPrice !== "" ? parseFloat(t.maxPrice) : null,
            minPrice: t.minPrice != null && t.minPrice !== "" ? parseFloat(t.minPrice) : null,
            mfe: t.mfe != null ? parseFloat(t.mfe) : null,
            mae: t.mae != null ? parseFloat(t.mae) : null
          }));
          
          this.trades = [...this.trades, ...validated];
          this.saveToStorage();
          resolve(validated.length);
        } catch (err) {
          reject(new Error("Failed to parse JSON file: " + err.message));
        }
      };
      reader.onerror = () => reject(new Error("File reading error."));
      reader.readAsText(file);
    });
  }

  importCSV(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const lines = e.target.result.split(/\r?\n/);
          if (lines.length <= 1) return reject(new Error("Empty CSV file or header only."));
          
          // Parse CSV lines carefully (handling simple commas and quotes)
          const parseCSVLine = (text) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < text.length; i++) {
              const char = text[i];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }
            result.push(current.trim());
            return result;
          };

          const importedTrades = [];
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const cols = parseCSVLine(line);
            
            // Expected cols: ID, Symbol, Direction, EntryDateTime, ExitDateTime, EntryPrice, ExitPrice, Qty, StopLoss, Fees, Setup, Notes, Lessons, ScreenshotUrl
            if (cols.length < 8) continue; // Minimum columns to construct a trade
            
            importedTrades.push({
              id: cols[0] || "trade_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
              symbol: (cols[1] || "UNKNOWN").toUpperCase(),
              direction: cols[2] === "short" ? "short" : "long",
              entryDateTime: normalizeDateTime(cols[3] || new Date().toISOString()),
              exitDateTime: normalizeDateTime(cols[4] || new Date().toISOString()),
              entryPrice: parseFloat(cols[5]) || 0,
              exitPrice: parseFloat(cols[6]) || 0,
              qty: parseFloat(cols[7]) || 0,
              stopLoss: cols[8] ? parseFloat(cols[8]) : null,
              fees: parseFloat(cols[9]) || 0,
              setup: (cols[10] || "").replace(/^"|"$/g, '').replace(/""/g, '"').trim(),
              notes: (cols[11] || "").replace(/^"|"$/g, '').replace(/""/g, '"').trim(),
              lessons: (cols[12] || "").replace(/^"|"$/g, '').replace(/""/g, '"').trim(),
              screenshotUrl: (cols[13] || "").trim(),
              signalEntryPrice: cols[14] ? parseFloat(cols[14]) : null,
              signalExitPrice: cols[15] ? parseFloat(cols[15]) : null,
              mistake: (cols[16] || "").replace(/^"|"$/g, '').replace(/""/g, '"').trim(),
              accountId: cols[17] || "Personal",
              assetClass: cols[18] || "stocks",
              status: cols[19] || "executed",
              overridePnl: cols[20] === "true",
              manualPnl: cols[21] ? parseFloat(cols[21]) : null,
              interventionType: cols[22] || "followed",
              maxPrice: cols[23] ? parseFloat(cols[23]) : null,
              minPrice: cols[24] ? parseFloat(cols[24]) : null,
              mfe: cols[25] ? parseFloat(cols[25]) : null,
              mae: cols[26] ? parseFloat(cols[26]) : null
            });
          }

          this.trades = [...this.trades, ...importedTrades];
          this.saveToStorage();
          resolve(importedTrades.length);
        } catch (err) {
          reject(new Error("Failed to parse CSV file: " + err.message));
        }
      };
      reader.onerror = () => reject(new Error("File reading error."));
      reader.readAsText(file);
    });
  }

  importXLSX(file) {
    return new Promise((resolve, reject) => {
      if (typeof XLSX === "undefined") {
        return reject(new Error("Excel parsing library (SheetJS) is not loaded yet. Check your connection."));
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          let targetSheetName = workbook.SheetNames[0];
          const tradesSheetName = workbook.SheetNames.find(name => name.trim().toLowerCase() === "trades");
          if (tradesSheetName) {
            targetSheetName = tradesSheetName;
          }
          const worksheet = workbook.Sheets[targetSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          if (jsonData.length <= 1) {
            return reject(new Error("Excel sheet is empty or header only."));
          }
          
          const headers = jsonData[0].map(h => String(h || "").trim().toLowerCase());
          
          // Detect TradingView Strategy Tester export
          const isTradingView = (headers.includes("trade number") || headers.includes("trade #")) && 
                                headers.includes("type") && 
                                (headers.includes("date and time") || headers.includes("date/time"));
          
          const importedTrades = [];
          
          if (isTradingView) {
            const tradeNoIdx = headers.includes("trade number") ? headers.indexOf("trade number") : headers.indexOf("trade #");
            const typeIdx = headers.indexOf("type");
            const signalIdx = headers.indexOf("signal");
            const dateTimeIdx = headers.includes("date and time") ? headers.indexOf("date and time") : headers.indexOf("date/time");
            
            const priceIdx = headers.includes("price usd") ? headers.indexOf("price usd") : headers.findIndex(h => h.includes("price"));
            const contractsIdx = headers.includes("size (qty)") ? headers.indexOf("size (qty)") : headers.indexOf("contracts");
            const profitIdx = headers.includes("net pnl usd") ? headers.indexOf("net pnl usd") : headers.findIndex(h => h.includes("profit"));
            
            const mfePctIdx = headers.includes("favorable excursion %") ? headers.indexOf("favorable excursion %") : headers.findIndex(h => h.includes("favorable excursion %"));
            const maePctIdx = headers.includes("adverse excursion %") ? headers.indexOf("adverse excursion %") : headers.findIndex(h => h.includes("adverse excursion %"));
            
            const mfeValIdx = headers.findIndex(h => h.includes("run-up usd") || h.includes("run-up ($)") || h === "run-up" || h.includes("max run-up") || h.includes("favorable excursion usd") || h.includes("favorable excursion ($)"));
            const maeValIdx = headers.findIndex(h => h.includes("drawdown usd") || h.includes("drawdown ($)") || h === "drawdown" || h.includes("max drawdown") || h.includes("adverse excursion usd") || h.includes("adverse excursion ($)"));
            
            // Group rows by trade number
            const groups = {};
            for (let i = 1; i < jsonData.length; i++) {
              const row = jsonData[i];
              if (!row || row.length === 0) continue;
              const tradeNo = String(row[tradeNoIdx] || "").trim();
              if (!tradeNo) continue;
              
              if (!groups[tradeNo]) {
                groups[tradeNo] = [];
              }
              groups[tradeNo].push(row);
            }
            
            // Reconstruct trades from paired entry/exit rows
            Object.keys(groups).forEach(tradeNo => {
              const rows = groups[tradeNo];
              const entryRow = rows.find(r => String(r[typeIdx] || "").toLowerCase().includes("entry"));
              const exitRow = rows.find(r => String(r[typeIdx] || "").toLowerCase().includes("exit"));
              
              if (entryRow && exitRow) {
                const typeStr = String(entryRow[typeIdx]).toLowerCase();
                const direction = typeStr.includes("long") ? "long" : "short";
                
                const entryDateTime = normalizeDateTime(entryRow[dateTimeIdx]);
                const exitDateTime = normalizeDateTime(exitRow[dateTimeIdx]);
                
                const entryPrice = parseFloat(entryRow[priceIdx]) || 0;
                const exitPrice = parseFloat(exitRow[priceIdx]) || 0;
                const qty = parseFloat(entryRow[contractsIdx]) || 0;
                const profitVal = parseFloat(exitRow[profitIdx]) || 0;
                
                // Reconstruct maxPrice and minPrice from excursions
                let maxPrice = null;
                let minPrice = null;
                let mfeVal = null;
                let maeVal = null;
                
                const mfePct = mfePctIdx !== -1 && exitRow[mfePctIdx] !== undefined ? Math.abs(parseFloat(exitRow[mfePctIdx])) : null;
                const maePct = maePctIdx !== -1 && exitRow[maePctIdx] !== undefined ? Math.abs(parseFloat(exitRow[maePctIdx])) : null;
                
                if (mfeValIdx !== -1 && exitRow[mfeValIdx] !== undefined) {
                  const val = parseFloat(exitRow[mfeValIdx]);
                  if (!isNaN(val)) mfeVal = Math.abs(val);
                }
                if (maeValIdx !== -1 && exitRow[maeValIdx] !== undefined) {
                  const val = parseFloat(exitRow[maeValIdx]);
                  if (!isNaN(val)) maeVal = Math.abs(val);
                }
                
                // If dollar values not found directly, try percent values and convert
                if (mfeVal === null) {
                  if (mfePct !== null && !isNaN(mfePct) && entryPrice > 0 && qty > 0) {
                    const directionMultiplier = direction === "short" ? -1 : 1;
                    const priceDiff = (exitPrice - entryPrice) * directionMultiplier;
                    let mult = getSymbolMultiplier(symbol, "stocks");
                    if (priceDiff !== 0) {
                      mult = Math.abs(profitVal / (priceDiff * qty));
                    }
                    mfeVal = entryPrice * (mfePct / 100) * qty * mult;
                  }
                }
                
                if (maeVal === null) {
                  if (maePct !== null && !isNaN(maePct) && entryPrice > 0 && qty > 0) {
                    const directionMultiplier = direction === "short" ? -1 : 1;
                    const priceDiff = (exitPrice - entryPrice) * directionMultiplier;
                    let mult = getSymbolMultiplier(symbol, "stocks");
                    if (priceDiff !== 0) {
                      mult = Math.abs(profitVal / (priceDiff * qty));
                    }
                    maeVal = entryPrice * (maePct / 100) * qty * mult;
                  }
                }
                
                if (entryPrice > 0) {
                  if (direction === "long") {
                    if (mfePct !== null && !isNaN(mfePct)) {
                      maxPrice = entryPrice * (1 + mfePct / 100);
                    }
                    if (maePct !== null && !isNaN(maePct)) {
                      minPrice = entryPrice * (1 - maePct / 100);
                    }
                  } else {
                    if (mfePct !== null && !isNaN(mfePct)) {
                      minPrice = entryPrice * (1 - mfePct / 100);
                    }
                    if (maePct !== null && !isNaN(maePct)) {
                      maxPrice = entryPrice * (1 + maePct / 100);
                    }
                  }
                }
                
                const signalText = String(entryRow[signalIdx] || "").trim();
                let symbol = "UNKNOWN";
                if (signalText) {
                  symbol = signalText.split(" ")[0].toUpperCase();
                  if (symbol.includes("ENTRY") || symbol.includes("EXIT") || symbol.includes("BUY") || symbol.includes("SELL")) {
                    symbol = "TV_STRAT";
                  }
                }
                
                importedTrades.push({
                  id: "tv_" + tradeNo + "_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
                  symbol: symbol,
                  direction: direction,
                  entryDateTime: entryDateTime,
                  exitDateTime: exitDateTime,
                  entryPrice: entryPrice,
                  exitPrice: exitPrice,
                  qty: qty,
                  stopLoss: null,
                  fees: 0,
                  setup: "TradingView Strategy",
                  notes: `Imported TradingView Trade #${tradeNo}. Signal: ${signalText}`,
                  lessons: "",
                  screenshotUrl: "",
                  signalEntryPrice: entryPrice,
                  signalExitPrice: exitPrice,
                  accountId: this.settings.currentAccount || "Personal",
                  assetClass: "stocks",
                  status: "executed",
                  overridePnl: true,
                  manualPnl: profitVal,
                  interventionType: "followed",
                  maxPrice: maxPrice,
                  minPrice: minPrice,
                  mfe: mfeVal,
                  mae: maeVal
                });
              }
            });
          } else {
            // General custom template Excel import (matching CSV headers)
            const getColIdx = (name) => headers.indexOf(name);
            
            const symbolIdx = getColIdx("symbol");
            const directionIdx = getColIdx("direction");
            const entryTimeIdx = getColIdx("entrydatetime");
            const exitTimeIdx = getColIdx("exitdatetime");
            const entryPriceIdx = getColIdx("entryprice");
            const exitPriceIdx = getColIdx("exitprice");
            const qtyIdx = getColIdx("qty");
            
            if (symbolIdx === -1 || entryPriceIdx === -1 || exitPriceIdx === -1 || qtyIdx === -1) {
              return reject(new Error("Excel sheet missing required headers (symbol, entryprice, exitprice, qty)"));
            }
            
            for (let i = 1; i < jsonData.length; i++) {
              const row = jsonData[i];
              if (!row || row.length === 0) continue;
              
              const symbol = String(row[symbolIdx] || "UNKNOWN").toUpperCase();
              const entryPrice = parseFloat(row[entryPriceIdx]) || 0;
              const exitPrice = parseFloat(row[exitPriceIdx]) || 0;
              const qty = parseFloat(row[qtyIdx]) || 0;
              if (!symbol || isNaN(entryPrice) || isNaN(exitPrice) || isNaN(qty)) continue;
              
              const direction = String(row[directionIdx] || "").toLowerCase() === "short" ? "short" : "long";
              const entryTime = normalizeDateTime(row[entryTimeIdx]);
              const exitTime = normalizeDateTime(row[exitTimeIdx]);
              
              const stopLoss = row[getColIdx("stoploss")] ? parseFloat(row[getColIdx("stoploss")]) : null;
              const fees = row[getColIdx("fees")] ? parseFloat(row[getColIdx("fees")]) : 0;
              const setup = String(row[getColIdx("setup")] || "").trim();
              const notes = String(row[getColIdx("notes")] || "").trim();
              const lessons = String(row[getColIdx("lessons")] || "").trim();
              const screenshotUrl = String(row[getColIdx("screenshoturl")] || "").trim();
              const signalEntryPrice = row[getColIdx("signalentryprice")] ? parseFloat(row[getColIdx("signalentryprice")]) : null;
              const signalExitPrice = row[getColIdx("signalexitprice")] ? parseFloat(row[getColIdx("signalexitprice")]) : null;
              const mistake = String(row[getColIdx("mistake")] || "").trim();
              const accountId = String(row[getColIdx("accountid")] || "").trim() || (this.settings.currentAccount || "Personal");
              const assetClass = String(row[getColIdx("assetclass")] || "").trim() || "stocks";
              const status = String(row[getColIdx("status")] || "").trim() || "executed";
              const overridePnl = String(row[getColIdx("overridepnl")] || "").trim() === "true";
              const manualPnl = row[getColIdx("manualpnl")] ? parseFloat(row[getColIdx("manualpnl")]) : null;
              const interventionType = String(row[getColIdx("interventiontype")] || "").trim() || "followed";
              const maxPrice = row[getColIdx("maxprice")] ? parseFloat(row[getColIdx("maxprice")]) : null;
              const minPrice = row[getColIdx("minprice")] ? parseFloat(row[getColIdx("minprice")]) : null;
              
              importedTrades.push({
                id: String(row[getColIdx("id")] || "").trim() || "trade_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
                symbol,
                direction,
                entryDateTime: entryTime || new Date().toISOString(),
                exitDateTime: exitTime || new Date().toISOString(),
                entryPrice,
                exitPrice,
                qty,
                stopLoss,
                fees,
                setup,
                notes,
                lessons,
                screenshotUrl,
                signalEntryPrice,
                signalExitPrice,
                mistake,
                accountId,
                assetClass,
                status,
                overridePnl,
                manualPnl,
                interventionType,
                maxPrice,
                minPrice
              });
            }
          }
          
          if (importedTrades.length === 0) {
            return reject(new Error("No valid trades found in Excel sheet."));
          }
          
          this.trades = [...this.trades, ...importedTrades];
          this.saveToStorage();
          resolve(importedTrades.length);
        } catch (err) {
          reject(new Error("Failed to parse Excel file: " + err.message));
        }
      };
      reader.onerror = () => reject(new Error("File reading error."));
      reader.readAsArrayBuffer(file);
    });
  }
}

export const AppState = new StateManager();
