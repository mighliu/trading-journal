import { calcNetPnl, getDateRange, normalizeDateTime, parseLocalDate, getSymbolMultiplier } from './utils.js';

// IndexedDB persistence helpers for SQLite binary database array
const IDB_NAME = "TradeFlowDB";
const IDB_STORE = "sqlite_binary_store";
const IDB_KEY = "sqlite_db_bytes";

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function loadDbBinaryFromIndexedDB() {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("Could not load from IndexedDB:", e);
    return null;
  }
}

async function saveDbBinaryToIndexedDB(uint8Array) {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(uint8Array, IDB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error("Failed saving SQLite binary to IndexedDB:", e);
  }
}

class StateManager {
  constructor() {
    this.trades = [];
    this.db = null;
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

  async initDatabase() {
    try {
      if (typeof window === "undefined" || typeof window.initSqlJs !== "function") {
        console.warn("sql.js library not loaded, falling back to localStorage.");
        this.loadFromStorage();
        return;
      }
      
      const SQL = await window.initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
      });

      const existingBinary = await loadDbBinaryFromIndexedDB();
      if (existingBinary) {
        this.db = new SQL.Database(existingBinary);
      } else {
        this.db = new SQL.Database();
      }

      this.createTables();
      await this.migrateFromLocalStorage();
      this.loadFromSqlite();
      console.log("SQLite WASM Engine initialized successfully!");
    } catch (e) {
      console.error("Error initializing SQLite WASM database:", e);
      this.loadFromStorage();
    }
  }

  createTables() {
    if (!this.db) return;
    this.db.run(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL,
        entry_date_time TEXT,
        exit_date_time TEXT,
        entry_price REAL,
        exit_price REAL,
        qty REAL,
        stop_loss REAL,
        fees REAL,
        setup TEXT,
        notes TEXT,
        lessons TEXT,
        screenshot_url TEXT,
        signal_entry_price REAL,
        signal_exit_price REAL,
        account_id TEXT NOT NULL,
        mistake TEXT,
        asset_class TEXT,
        status TEXT NOT NULL DEFAULT 'executed',
        override_pnl INTEGER DEFAULT 0,
        manual_pnl REAL,
        intervention_type TEXT,
        max_price REAL,
        min_price REAL,
        mfe REAL,
        mae REAL,
        checklist_items TEXT,
        adherence_score REAL
      );
      CREATE INDEX IF NOT EXISTS idx_trades_account ON trades(account_id);
      CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
      CREATE INDEX IF NOT EXISTS idx_trades_exit ON trades(exit_date_time);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  async migrateFromLocalStorage() {
    if (!this.db) return;
    try {
      const storedTrades = localStorage.getItem("tf_trades");
      const storedSettings = localStorage.getItem("tf_settings");

      let didMigrate = false;
      if (storedTrades) {
        const tradesArr = JSON.parse(storedTrades);
        if (Array.isArray(tradesArr) && tradesArr.length > 0) {
          console.log(`Migrating ${tradesArr.length} trades from localStorage to SQLite WASM...`);
          for (const t of tradesArr) {
            this.insertTradeSql(t);
          }
          didMigrate = true;
        }
      }

      if (storedSettings) {
        const settingsObj = JSON.parse(storedSettings);
        this.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('app_settings', ?)", [JSON.stringify(settingsObj)]);
        didMigrate = true;
      }

      if (didMigrate) {
        await this.saveToStorage();
        localStorage.removeItem("tf_trades");
        localStorage.removeItem("tf_settings");
        console.log("Successfully migrated localStorage data into SQLite WASM!");
      }
    } catch (err) {
      console.error("Migration error:", err);
    }
  }

  insertTradeSql(t) {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO trades (
        id, symbol, direction, entry_date_time, exit_date_time, entry_price, exit_price,
        qty, stop_loss, fees, setup, notes, lessons, screenshot_url, signal_entry_price,
        signal_exit_price, account_id, mistake, asset_class, status, override_pnl,
        manual_pnl, intervention_type, max_price, min_price, mfe, mae, checklist_items, adherence_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      t.id,
      (t.symbol || "").toUpperCase(),
      t.direction === "short" ? "short" : "long",
      normalizeDateTime(t.entryDateTime),
      normalizeDateTime(t.exitDateTime),
      parseFloat(t.entryPrice) || 0,
      parseFloat(t.exitPrice) || 0,
      parseFloat(t.qty) || 0,
      t.stopLoss ? parseFloat(t.stopLoss) : null,
      parseFloat(t.fees) || 0,
      (t.setup || "").trim(),
      (t.notes || "").trim(),
      (t.lessons || "").trim(),
      (t.screenshotUrl || "").trim(),
      t.signalEntryPrice ? parseFloat(t.signalEntryPrice) : null,
      t.signalExitPrice ? parseFloat(t.signalExitPrice) : null,
      t.accountId || "Personal",
      (t.mistake || "").trim(),
      t.assetClass || "stocks",
      t.status || "executed",
      t.overridePnl ? 1 : 0,
      t.manualPnl != null ? parseFloat(t.manualPnl) : null,
      t.interventionType || "followed",
      t.maxPrice != null ? parseFloat(t.maxPrice) : null,
      t.minPrice != null ? parseFloat(t.minPrice) : null,
      t.mfe != null ? parseFloat(t.mfe) : null,
      t.mae != null ? parseFloat(t.mae) : null,
      t.checklistItems ? JSON.stringify(t.checklistItems) : null,
      t.adherenceScore != null ? parseFloat(t.adherenceScore) : null
    ]);
    stmt.free();
  }

  loadFromSqlite() {
    if (!this.db) return;
    
    // Load Settings
    const stmtSet = this.db.prepare("SELECT value FROM settings WHERE key = 'app_settings'");
    if (stmtSet.step()) {
      const row = stmtSet.getAsObject();
      if (row.value) {
        try {
          this.settings = { ...this.settings, ...JSON.parse(row.value) };
        } catch (e) {}
      }
    }
    stmtSet.free();

    if (!this.settings.accounts) {
      const oldBal = this.settings.startingBalance || 25000;
      const oldFees = this.settings.defaultFees || 0;
      this.settings.accounts = {
        "Personal": { startingBalance: oldBal, defaultFees: oldFees },
        "Prop Firm": { startingBalance: 50000, defaultFees: 1.50 }
      };
      this.settings.currentAccount = "Personal";
    }

    // Load Trades
    const stmtTrades = this.db.prepare("SELECT * FROM trades ORDER BY exit_date_time DESC");
    const loadedTrades = [];
    while (stmtTrades.step()) {
      const r = stmtTrades.getAsObject();
      let checklist = null;
      if (r.checklist_items) {
        try { checklist = JSON.parse(r.checklist_items); } catch(e) {}
      }
      loadedTrades.push({
        id: r.id,
        symbol: r.symbol,
        direction: r.direction,
        entryDateTime: r.entry_date_time,
        exitDateTime: r.exit_date_time,
        entryPrice: r.entry_price,
        exitPrice: r.exit_price,
        qty: r.qty,
        stopLoss: r.stop_loss,
        fees: r.fees,
        setup: r.setup,
        notes: r.notes,
        lessons: r.lessons,
        screenshotUrl: r.screenshot_url,
        signalEntryPrice: r.signal_entry_price,
        signalExitPrice: r.signal_exit_price,
        accountId: r.account_id,
        mistake: r.mistake,
        assetClass: r.asset_class,
        status: r.status,
        overridePnl: r.override_pnl === 1,
        manualPnl: r.manual_pnl,
        interventionType: r.intervention_type,
        maxPrice: r.max_price,
        minPrice: r.min_price,
        mfe: r.mfe,
        mae: r.mae,
        checklistItems: checklist,
        adherenceScore: r.adherence_score
      });
    }
    stmtTrades.free();
    this.trades = loadedTrades;
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

      if (!this.settings.accounts) {
        const oldBal = this.settings.startingBalance || 25000;
        const oldFees = this.settings.defaultFees || 0;
        this.settings.accounts = {
          "Personal": { startingBalance: oldBal, defaultFees: oldFees },
          "Prop Firm": { startingBalance: 50000, defaultFees: 1.50 }
        };
        this.settings.currentAccount = "Personal";
      }

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
      });
      if (needsSave) {
        this.saveToStorage();
      }
    } catch (e) {
      console.error("Failed to load from localStorage:", e);
      this.trades = [];
    }
  }

  async saveToStorage() {
    try {
      if (this.db) {
        this.db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('app_settings', ?)", [JSON.stringify(this.settings)]);
        const binary = this.db.export();
        await saveDbBinaryToIndexedDB(binary);
      } else {
        localStorage.setItem("tf_trades", JSON.stringify(this.trades));
        localStorage.setItem("tf_settings", JSON.stringify(this.settings));
      }
      this.notify();
    } catch (e) {
      console.error("Failed to save to storage:", e);
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

  isDuplicateTrade(newTrade) {
    return this.trades.some(t => {
      if (newTrade.id && t.id === newTrade.id) return true;

      const entryA = new Date(t.entryDateTime).getTime();
      const entryB = new Date(newTrade.entryDateTime).getTime();
      const exitA = new Date(t.exitDateTime).getTime();
      const exitB = new Date(newTrade.exitDateTime).getTime();

      const sameEntry = Math.abs(entryA - entryB) < 1500; // 1.5 seconds tolerance
      const sameExit = Math.abs(exitA - exitB) < 1500;

      return t.symbol === newTrade.symbol &&
             t.direction === newTrade.direction &&
             sameEntry &&
             sameExit &&
             Math.abs(t.entryPrice - newTrade.entryPrice) < 0.0001 &&
             Math.abs(t.exitPrice - newTrade.exitPrice) < 0.0001 &&
             Math.abs(t.qty - newTrade.qty) < 0.0001 &&
             (t.accountId || "Personal") === (newTrade.accountId || "Personal");
    });
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
    
    if (this.db) {
      this.insertTradeSql(trade);
    }
    this.trades.unshift(trade);
    this.saveToStorage();
    return trade;
  }

  updateTrade(id, tradeData) {
    const idx = this.trades.findIndex(t => t.id === id);
    if (idx === -1) throw new Error("Trade not found");
    
    const updated = {
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

    if (this.db) {
      this.insertTradeSql(updated);
    }
    this.trades[idx] = updated;
    this.saveToStorage();
    return this.trades[idx];
  }

  deleteTrade(id) {
    const beforeLen = this.trades.length;
    if (this.db) {
      this.db.run("DELETE FROM trades WHERE id = ?", [id]);
    }
    this.trades = this.trades.filter(t => t.id !== id);
    if (this.trades.length === beforeLen) throw new Error("Trade not found");
    this.saveToStorage();
  }

  clearAllData() {
    if (this.db) {
      this.db.run("DELETE FROM trades");
    }
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
    if (this.db) {
      this.db.run("DELETE FROM trades WHERE account_id = ?", [activeAccount]);
    }
    this.trades = this.trades.filter(t => t.accountId !== activeAccount);
    this.saveToStorage();
  }

  deleteCurrentAccount() {
    const activeAccount = this.settings.currentAccount || "Personal";
    const accountKeys = Object.keys(this.settings.accounts || {});
    if (accountKeys.length <= 1) {
      throw new Error("Cannot delete the only remaining account. Create or switch to another account first.");
    }
    
    if (this.db) {
      this.db.run("DELETE FROM trades WHERE account_id = ?", [activeAccount]);
    }
    this.trades = this.trades.filter(t => t.accountId !== activeAccount);
    
    delete this.settings.accounts[activeAccount];
    
    const remainingKeys = Object.keys(this.settings.accounts);
    const nextAccount = remainingKeys[0];
    this.settings.currentAccount = nextAccount;
    this.settings.startingBalance = this.settings.accounts[nextAccount].startingBalance || 25000;
    this.settings.defaultFees = this.settings.accounts[nextAccount].defaultFees || 0;
    
    this.saveToStorage();
  }

  seedDemoData(demoTrades) {
    if (this.db) {
      this.db.run("DELETE FROM trades");
    }
    this.trades = demoTrades.map(t => {
      let sigEntry = t.signalEntryPrice;
      let sigExit = t.signalExitPrice;
      
      if (sigEntry == null) {
        const slippagePct = 0.0005 + (Math.random() * 0.001);
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

      const formatted = {
        id: t.id || "trade_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
        symbol: sym,
        direction: t.direction,
        entryDateTime: normalizeDateTime(t.entryDateTime),
        exitDateTime: normalizeDateTime(t.exitDateTime),
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        qty: t.qty,
        stopLoss: t.stopLoss,
        fees: t.fees,
        setup: t.setup,
        notes: t.notes,
        lessons: t.lessons,
        screenshotUrl: t.screenshotUrl,
        signalEntryPrice: sigEntry,
        signalExitPrice: sigExit,
        accountId: t.accountId || "Personal",
        mistake: t.mistake || "",
        assetClass,
        status: t.status || "executed",
        overridePnl: t.overridePnl === true,
        manualPnl: t.manualPnl != null ? parseFloat(t.manualPnl) : null,
        interventionType: t.interventionType || "followed",
        maxPrice,
        minPrice,
        mfe: t.mfe != null ? parseFloat(t.mfe) : null,
        mae: t.mae != null ? parseFloat(t.mae) : null,
        checklistItems: t.checklistItems || null,
        adherenceScore: t.adherenceScore !== undefined ? t.adherenceScore : null
      };

      if (this.db) {
        this.insertTradeSql(formatted);
      }
      return formatted;
    });

    this.saveToStorage();
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.saveToStorage();
  }

  getFilteredTrades() {
    let list = [...this.trades];

    const activeAccount = this.settings.currentAccount || "Personal";
    list = list.filter(t => (t.accountId || "Personal") === activeAccount);

    const baseDate = new Date("2026-06-29T17:34:00");
    let startLimit = null;
    let endLimit = null;

    if (this.activeFilters.datePreset === "custom") {
      startLimit = parseLocalDate(this.activeFilters.startDate);
      endLimit = parseLocalDate(this.activeFilters.endDate);
      if (endLimit) endLimit.setHours(23, 59, 59, 999);
    } else if (this.activeFilters.datePreset && this.activeFilters.datePreset !== "allTime") {
      const limits = getDateRange(this.activeFilters.datePreset, baseDate);
      startLimit = limits.start;
      endLimit = limits.end;
    }

    if (startLimit || endLimit) {
      list = list.filter(t => {
        const exit = new Date(t.exitDateTime);
        if (isNaN(exit.getTime())) return false;
        if (startLimit && exit < startLimit) return false;
        if (endLimit && exit > endLimit) return false;
        return true;
      });
    }

    if (this.activeFilters.symbol) {
      const query = this.activeFilters.symbol.toUpperCase().trim();
      list = list.filter(t => t.symbol.toUpperCase().includes(query));
    }

    if (this.activeFilters.direction !== "all") {
      list = list.filter(t => t.direction === this.activeFilters.direction);
    }

    if (this.activeFilters.outcome !== "all") {
      list = list.filter(t => {
        const netPnl = calcNetPnl(t);
        if (this.activeFilters.outcome === "win") return netPnl > 0;
        if (this.activeFilters.outcome === "loss") return netPnl < 0;
        if (this.activeFilters.outcome === "breakeven") return netPnl === 0;
        return true;
      });
    }

    if (this.activeFilters.setup !== "all") {
      list = list.filter(t => {
        const tags = (t.setup || "").split(",").map(s => s.trim().toLowerCase());
        return tags.includes(this.activeFilters.setup.toLowerCase());
      });
    }

    if (this.activeFilters.assetClass && this.activeFilters.assetClass !== "all") {
      list = list.filter(t => t.assetClass === this.activeFilters.assetClass);
    }

    if (this.activeFilters.status && this.activeFilters.status !== "all") {
      list = list.filter(t => (t.status || "executed") === this.activeFilters.status);
    }

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
    const bytesUsed = str.length * 2;
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
    if (this.trades.length === 0) {
      alert("No trades available to export.");
      return;
    }

    const headers = [
      "ID", "Symbol", "Direction", "Entry Date", "Exit Date", "Entry Price", "Exit Price",
      "Quantity", "Stop Loss", "Fees ($)", "Setup Tag", "Notes", "Lessons", "Screenshot URL",
      "Signal Entry Price", "Signal Exit Price", "Account ID", "Mistake Tag", "Asset Class",
      "Status", "Override P&L", "Manual P&L", "Intervention Type", "Max Price (MFE)", "Min Price (MAE)",
      "MFE Pct", "MAE Pct"
    ];

    const escapeCsvField = (field) => {
      if (field === null || field === undefined) return '""';
      const str = String(field).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = this.trades.map(t => [
      escapeCsvField(t.id),
      escapeCsvField(t.symbol),
      escapeCsvField(t.direction),
      escapeCsvField(t.entryDateTime),
      escapeCsvField(t.exitDateTime),
      t.entryPrice,
      t.exitPrice,
      t.qty,
      t.stopLoss != null ? t.stopLoss : "",
      t.fees,
      escapeCsvField(t.setup),
      escapeCsvField(t.notes),
      escapeCsvField(t.lessons),
      escapeCsvField(t.screenshotUrl),
      t.signalEntryPrice != null ? t.signalEntryPrice : "",
      t.signalExitPrice != null ? t.signalExitPrice : "",
      escapeCsvField(t.accountId || "Personal"),
      escapeCsvField(t.mistake || ""),
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

  exportSQLite() {
    if (!this.db) {
      alert("SQLite database engine is not active.");
      return;
    }
    const binary = this.db.export();
    const blob = new Blob([binary], { type: "application/x-sqlite3" });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `tradeflow_journal_database_${Date.now()}.sqlite`);
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

          let addedCount = 0;
          let skippedCount = 0;

          validated.forEach(t => {
            if (this.isDuplicateTrade(t)) {
              skippedCount++;
            } else {
              if (this.db) {
                this.insertTradeSql(t);
              }
              this.trades.unshift(t);
              addedCount++;
            }
          });

          this.saveToStorage();
          resolve({ total: validated.length, added: addedCount, skipped: skippedCount });
        } catch (err) {
          reject(new Error("Invalid JSON format: " + err.message));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsText(file);
    });
  }

  importCSV(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
          if (lines.length < 2) {
            return reject(new Error("CSV file must contain a header row and at least one data row."));
          }

          const parseCsvLine = (line) => {
            const result = [];
            let start = 0;
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              if (line[i] === '"') {
                inQuotes = !inQuotes;
              } else if (line[i] === ',' && !inQuotes) {
                let field = line.substring(start, i).trim();
                if (field.startsWith('"') && field.endsWith('"')) {
                  field = field.substring(1, field.length - 1).replace(/""/g, '"');
                }
                result.push(field);
                start = i + 1;
              }
            }
            let lastField = line.substring(start).trim();
            if (lastField.startsWith('"') && lastField.endsWith('"')) {
              lastField = lastField.substring(1, lastField.length - 1).replace(/""/g, '"');
            }
            result.push(lastField);
            return result;
          };

          const headerRow = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());
          const getColIdx = (name) => headerRow.findIndex(h => h.includes(name));

          const dataRows = lines.slice(1);
          let addedCount = 0;
          let skippedCount = 0;

          dataRows.forEach(rowStr => {
            const cols = parseCsvLine(rowStr);
            if (cols.length < 3) return;

            const symbol = (cols[getColIdx("symbol")] || cols[1] || "UNKNOWN").toUpperCase();
            const direction = (cols[getColIdx("direction")] || cols[2] || "long").toLowerCase() === "short" ? "short" : "long";

            const rawEntryDate = cols[getColIdx("entry date")] || cols[3] || new Date().toISOString();
            const rawExitDate = cols[getColIdx("exit date")] || cols[4] || new Date().toISOString();

            const entryPrice = parseFloat(cols[getColIdx("entry price")] || cols[5]) || 0;
            const exitPrice = parseFloat(cols[getColIdx("exit price")] || cols[6]) || 0;
            const qty = parseFloat(cols[getColIdx("quantity")] || cols[7]) || 0;

            const stopLossRaw = cols[getColIdx("stop loss")] || cols[8];
            const stopLoss = stopLossRaw ? parseFloat(stopLossRaw) : null;
            const fees = parseFloat(cols[getColIdx("fees")] || cols[9]) || 0;

            const setup = cols[getColIdx("setup")] || cols[10] || "";
            const notes = cols[getColIdx("notes")] || cols[11] || "";
            const lessons = cols[getColIdx("lessons")] || cols[12] || "";
            const screenshotUrl = cols[getColIdx("screenshot")] || cols[13] || "";

            const sigEntryRaw = cols[getColIdx("signal entry")] || cols[14];
            const sigExitRaw = cols[getColIdx("signal exit")] || cols[15];

            const accountId = cols[getColIdx("account")] || cols[16] || "Personal";
            const mistake = cols[getColIdx("mistake")] || cols[17] || "";
            const assetClass = cols[getColIdx("asset class")] || cols[18] || "stocks";
            const status = cols[getColIdx("status")] || cols[19] || "executed";

            const trade = {
              id: "trade_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
              symbol,
              direction,
              entryDateTime: normalizeDateTime(rawEntryDate),
              exitDateTime: normalizeDateTime(rawExitDate),
              entryPrice,
              exitPrice,
              qty,
              stopLoss,
              fees,
              setup,
              notes,
              lessons,
              screenshotUrl,
              signalEntryPrice: sigEntryRaw ? parseFloat(sigEntryRaw) : null,
              signalExitPrice: sigExitRaw ? parseFloat(sigExitRaw) : null,
              accountId,
              mistake,
              assetClass,
              status,
              overridePnl: false,
              manualPnl: null,
              interventionType: "followed",
              maxPrice: cols[getColIdx("maxprice")] ? parseFloat(cols[getColIdx("maxprice")]) : null,
              minPrice: cols[getColIdx("minprice")] ? parseFloat(cols[getColIdx("minprice")]) : null
            };

            if (this.isDuplicateTrade(trade)) {
              skippedCount++;
            } else {
              if (this.db) {
                this.insertTradeSql(trade);
              }
              this.trades.unshift(trade);
              addedCount++;
            }
          });

          this.saveToStorage();
          resolve({ total: dataRows.length, added: addedCount, skipped: skippedCount });
        } catch (err) {
          reject(new Error("Failed to parse CSV file: " + err.message));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsText(file);
    });
  }

  importXLSX(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          let text = "";
          for (let i = 0; i < data.length; i++) {
            text += String.fromCharCode(data[i]);
          }
          
          const rawRows = text.split(/\r?\n/).filter(r => r.trim() !== "");
          if (rawRows.length < 2) {
            return reject(new Error("Excel/XLSX text stream does not contain valid tabular data."));
          }
          
          const parseTabLine = (line) => line.split(/\t|,/).map(cell => {
            let c = cell.trim();
            if (c.startsWith('"') && c.endsWith('"')) {
              c = c.substring(1, c.length - 1).replace(/""/g, '"');
            }
            return c;
          });

          const headerRow = parseTabLine(rawRows[0]).map(h => h.toLowerCase());
          const getColIdx = (name) => headerRow.findIndex(h => h.includes(name));

          let addedCount = 0;
          let skippedCount = 0;

          rawRows.slice(1).forEach(rowStr => {
            const row = parseTabLine(rowStr);
            if (row.length < 3) return;

            const symbol = (row[getColIdx("symbol")] || row[1] || "UNKNOWN").toUpperCase();
            const direction = (row[getColIdx("direction")] || row[2] || "long").toLowerCase() === "short" ? "short" : "long";

            const rawEntryDate = row[getColIdx("entry date")] || row[3] || new Date().toISOString();
            const rawExitDate = row[getColIdx("exit date")] || row[4] || new Date().toISOString();

            const entryPrice = parseFloat(row[getColIdx("entry price")] || row[5]) || 0;
            const exitPrice = parseFloat(row[getColIdx("exit price")] || row[6]) || 0;
            const qty = parseFloat(row[getColIdx("quantity")] || row[7]) || 0;
            const stopLoss = row[getColIdx("stop loss")] ? parseFloat(row[getColIdx("stop loss")]) : null;
            const fees = parseFloat(row[getColIdx("fees")] || row[9]) || 0;

            const setup = row[getColIdx("setup")] || row[10] || "";
            const notes = row[getColIdx("notes")] || row[11] || "";
            const lessons = row[getColIdx("lessons")] || row[12] || "";
            const screenshotUrl = row[getColIdx("screenshot")] || row[13] || "";

            const sigEntry = row[getColIdx("signal entry")] ? parseFloat(row[getColIdx("signal entry")]) : null;
            const sigExit = row[getColIdx("signal exit")] ? parseFloat(row[getColIdx("signal exit")]) : null;

            const accountId = row[getColIdx("account")] || row[16] || "Personal";
            const mistake = row[getColIdx("mistake")] || row[17] || "";
            const assetClass = row[getColIdx("asset class")] || row[18] || "stocks";
            const status = row[getColIdx("status")] || row[19] || "executed";

            const trade = {
              id: "trade_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
              symbol,
              direction,
              entryDateTime: normalizeDateTime(rawEntryDate),
              exitDateTime: normalizeDateTime(rawExitDate),
              entryPrice,
              exitPrice,
              qty,
              stopLoss,
              fees,
              setup,
              notes,
              lessons,
              screenshotUrl,
              signalEntryPrice: sigEntry,
              signalExitPrice: sigExit,
              accountId,
              mistake,
              assetClass,
              status,
              overridePnl: false,
              manualPnl: null,
              interventionType: "followed",
              maxPrice: row[getColIdx("maxprice")] ? parseFloat(row[getColIdx("maxprice")]) : null,
              minPrice: row[getColIdx("minprice")] ? parseFloat(row[getColIdx("minprice")]) : null
            };

            if (this.isDuplicateTrade(trade)) {
              skippedCount++;
            } else {
              if (this.db) {
                this.insertTradeSql(trade);
              }
              this.trades.unshift(trade);
              addedCount++;
            }
          });

          this.saveToStorage();
          resolve({ total: rawRows.length - 1, added: addedCount, skipped: skippedCount });
        } catch (err) {
          reject(new Error("Failed to parse XLSX data stream: " + err.message));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsArrayBuffer(file);
    });
  }
}

export const AppState = new StateManager();
