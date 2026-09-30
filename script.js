// script.js - Fixed version with all issues resolved
// API Configuration is loaded from config.js

let calculationHistory = [];
try {
    const storedHistory = localStorage.getItem('steamCalculatorHistory');
    calculationHistory = storedHistory ? JSON.parse(storedHistory) : [];
    if (!Array.isArray(calculationHistory)) calculationHistory = [];
} catch (error) {
    console.warn('Unable to restore calculation history; starting empty.', error);
}
let currentCalculation = null;
let autoCalculateTimeout = null;
let darkMode = localStorage.getItem('darkMode') !== 'false';
let deals = []; // Initialize deals array to prevent ReferenceError

// Deals variables
let currentDeals = [];
let dealsLoading = false;
let dealsRequestController = null;
let dealsRequestId = 0;
let dealsSearchTimeout = null;
let dealsHasMore = false;
let currentDealsSort = 'discount';
let currentDealsSearch = '';
const dealsPageCache = new Map();
const dealsPageCacheTtl = 5 * 60 * 1000;
let failedDealsRequest = null;

// Search cache and request state
const gameSearchCache = new Map();
const gameSearchCacheTtl = 60 * 1000;
const gameSearchCacheLimit = 20;
let searchTimeout = null;
let gameSearchAbortController = null;
let gameSearchRequestId = 0;
let priceLookupAbortController = null;
let priceLookupRequestId = 0;
const priceLookupRequests = new Map();
let currentGameSuggestions = []; // Store current suggestions for Enter key display
let activeGameSuggestionIndex = -1;

let currentPage = 1;
const dealsPerPage = 20;



// Initialize the calculator
document.addEventListener('DOMContentLoaded', function() {
    // Apply dark mode if enabled
    document.body.classList.toggle('light-mode', !darkMode);
    updateDarkModeButton();
    
    document.getElementById('gameCount').value = '1';
    updateGameFields();
    loadHistory();
    setupEventListeners();
    setupExitCalculationHandling();
    initializeTaxPresets();
    calculateTotal();
    initializeTotalAmountFit();
    initializeDealsFilters();
    loadDeals();
    
    // Update current tax display
    updateTaxDisplay();
    updateTotalGamesCount();
});

function setupExitCalculationHandling() {
    window.addEventListener('beforeunload', function(event) {
        calculateTotal();
        if (!hasUnsavedCurrentCalculation()) return;

        event.preventDefault();
        event.returnValue = '';
    });

    window.addEventListener('pagehide', function() {
        calculateTotal();
        if (hasUnsavedCurrentCalculation()) saveToHistory(true);
    });

    window.addEventListener('pageshow', function(event) {
        if (!event.persisted) return;

        document.getElementById('gameCount').value = '1';
        updateGameFields();
    });
}

function getCalculationSignature(calculation) {
    const gamePrices = (calculation.gamePrices || []).map(game => ({
        index: Number(game.index),
        price: Number(game.price).toFixed(2),
        name: (game.name || '').trim()
    })).sort((first, second) => first.index - second.index);

    return JSON.stringify({
        taxRate: Number(calculation.taxRate),
        gamePrices
    });
}

function hasUnsavedCurrentCalculation() {
    if (!currentCalculation || currentCalculation.total <= 0) return false;

    const currentSignature = getCalculationSignature(currentCalculation);
    return !calculationHistory.some(item => getCalculationSignature(item) === currentSignature);
}

window.addEventListener('storage', function(event) {
    if (event.key !== 'darkMode') return;

    darkMode = event.newValue !== 'false';
    document.body.classList.toggle('light-mode', !darkMode);
    updateDarkModeButton();
});

function setupEventListeners() {
    const taxRateSlider = document.getElementById('taxRateSlider');
    const taxRateInput = document.getElementById('taxRateInput');
    const gameCountInput = document.getElementById('gameCount');
    const header = document.querySelector('.header');
    
    // Header shrinking on scroll
    window.addEventListener('scroll', function() {
        if (window.scrollY > 100) {
            header.classList.add('shrink');
        } else {
            header.classList.remove('shrink');
        }
    }, { passive: true });
    
    // Slider change handler
    taxRateSlider.addEventListener('input', function() {
        // Remove active class from all preset buttons when slider is moved
        document.querySelectorAll('.preset-btn').forEach(btn => 
            btn.classList.remove('active'));
        // Update input field to match slider
        taxRateInput.value = this.value;
        updateTaxDisplay();
        triggerAutoCalculate();
    });
    
    // Input field change handler
    taxRateInput.addEventListener('input', function() {
        let value = parseFloat(this.value) || 0;
        // Enforce limits: minimum 0, maximum 100
        if (value < 0) value = 0;
        if (value > 100) value = 100;
        // Update slider to match input
        taxRateSlider.value = value;
        // Remove active class from all preset buttons when input is changed
        document.querySelectorAll('.preset-btn').forEach(btn => 
            btn.classList.remove('active'));
        updateTaxDisplay();
        triggerAutoCalculate();
    });

    taxRateInput.addEventListener('change', function() {
        let value = parseFloat(this.value) || 0;
        value = Math.max(0, Math.min(100, value));
        this.value = value;
        taxRateSlider.value = value;
        updateTaxDisplay();
        triggerAutoCalculate();
    });
    
    gameCountInput.addEventListener('input', function() {
        let value = parseInt(this.value) || 1;
        // Enforce limits: minimum 1, maximum 50
        if (value < 1) value = 1;
        if (value > 50) value = 50;
        this.value = value;
    });
    
    gameCountInput.addEventListener('change', function() {
        this.classList.add('game-count-changing');
        setTimeout(() => {
            this.classList.remove('game-count-changing');
        }, 300);
        updateTotalGamesCount();
        updateGameFields();
    });
    
    gameCountInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            updateGameFields();
        }
    });
}

function updateTaxDisplay() {
    const taxRate = document.getElementById('taxRateSlider').value;
    document.getElementById('taxRateDisplay').textContent = `${taxRate}%`;
}

function updateTotalGamesCount() {
    const count = parseInt(document.getElementById('gameCount').value) || 1;
    document.getElementById('totalGames').textContent = `Total: ${count} game${count !== 1 ? 's' : ''}`;
}

function triggerAutoCalculate() {
    if (autoCalculateTimeout) {
        clearTimeout(autoCalculateTimeout);
    }
    
    autoCalculateTimeout = setTimeout(() => {
        calculateTotal();
        updatePerGameBreakdown();
    }, 200);
}

function initializeTaxPresets() {
    document.querySelectorAll('.preset-btn').forEach(button => {
        button.addEventListener('click', () => {
            const tax = Number(button.dataset.tax);
            document.getElementById('taxRateInput').value = tax;
            document.getElementById('taxRateSlider').value = tax;
            document.querySelectorAll('.preset-btn').forEach(preset => preset.classList.remove('active'));
            button.classList.add('active');
            updateTaxDisplay();
            triggerAutoCalculate();
        });
    });
}

function changeGameCount(delta) {
    const gameCountInput = document.getElementById('gameCount');
    let currentValue = parseInt(gameCountInput.value) || 1;
    const newValue = Math.max(1, Math.min(50, currentValue + delta));
    gameCountInput.value = newValue;
    
    gameCountInput.classList.add('game-count-changing');
    setTimeout(() => {
        gameCountInput.classList.remove('game-count-changing');
    }, 300);
    
    updateTotalGamesCount();
    updateGameFields();
}

function setCalculatorGameName(input, gameName) {
    const name = typeof gameName === 'string' ? gameName.trim() : '';
    const fallbackName = `Game ${Number(input.dataset.index) + 1}`;
    input.dataset.gameName = name;

    const label = input.closest('.game-input-card')?.querySelector('label');
    if (label) {
        label.textContent = name || fallbackName;
        label.title = name;
    }
}

function updateGameFields() {
    const count = parseInt(document.getElementById("gameCount").value) || 1;
    const container = document.getElementById("gameInputs");
    
    // Get current values before clearing
    const currentGames = [];
    const currentInputs = container.querySelectorAll('input');
    currentInputs.forEach(input => {
        currentGames.push({ value: input.value, name: input.dataset.gameName || '' });
    });
    
    container.innerHTML = "";

    for (let i = 0; i < count; i++) {
        const card = document.createElement("div");
        card.className = "game-input-card";
        card.dataset.index = i;
        
        const label = document.createElement("label");
        label.textContent = currentGames[i]?.name || `Game ${i + 1}`;
        label.title = currentGames[i]?.name || '';
        label.htmlFor = `gamePrice${i}`;
        
        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "decimal";
        input.pattern = "[0-9]*\\.?[0-9]*";
        input.value = currentGames[i]?.value || "";
        input.id = `gamePrice${i}`;
        input.placeholder = `Enter price`;
        input.dataset.index = i;
        input.dataset.gameName = currentGames[i]?.name || '';
        
        // Enhanced input handling
        input.addEventListener('input', function(e) {
            // Clean input
            this.value = this.value.replace(/[^0-9.]/g, '');
            
            // Limit decimal places
            const parts = this.value.split('.');
            if (parts.length > 2) {
                this.value = parts[0] + '.' + parts.slice(1).join('');
            }
            if (parts.length === 2 && parts[1].length > 2) {
                this.value = parts[0] + '.' + parts[1].substring(0, 2);
            }
            
            // Visual feedback
            if (this.value && parseFloat(this.value) > 0) {
                this.style.borderColor = "var(--success)";
                this.style.boxShadow = "0 0 0 2px rgba(16, 185, 129, 0.2)";
            } else {
                this.style.borderColor = "";
                this.style.boxShadow = "";
            }
            
            updatePricedGamesCount();
            toggleSaveButton();
            triggerAutoCalculate();
        });
        
        input.addEventListener('blur', function() {
            if (this.value && !isNaN(parseFloat(this.value))) {
                const value = parseFloat(this.value);
                this.value = value.toFixed(2);
            } else if (this.value === '' || this.value === '.') {
                this.value = '';
            }
        });
        
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                const nextIndex = parseInt(this.dataset.index) + 1;
                const nextInput = document.getElementById(`gamePrice${nextIndex}`);
                if (nextInput) {
                    nextInput.focus();
                    nextInput.select();
                }
            }
        });
        
        card.appendChild(label);
        card.appendChild(input);
        
        // Add remove button for multiple games
        if (count > 1) {
            const removeBtn = document.createElement("button");
            removeBtn.className = "game-remove-btn";
            removeBtn.innerHTML = '<i class="fas fa-trash"></i> Remove';
                removeBtn.addEventListener('click', () => {
                    const cardIndex = Number(card.dataset.index);
                    const games = Array.from(container.querySelectorAll('input')).map(input => ({
                        value: input.value,
                        name: input.dataset.gameName || ''
                    }));
                    games.splice(cardIndex, 1);
                    document.getElementById('gameCount').value = Math.max(1, games.length);
                    updateGameFields();
                    Array.from(container.querySelectorAll('input')).forEach((gameInput, index) => {
                        gameInput.value = games[index]?.value || '';
                        setCalculatorGameName(gameInput, games[index]?.name);
                    });
                    updatePricedGamesCount();
                    toggleSaveButton();
                    calculateTotal();
                    updatePerGameBreakdown();
                });
            card.appendChild(removeBtn);
        }
        
        container.appendChild(card);
    }

    updatePricedGamesCount();
    updateTotalGamesCount();
    toggleSaveButton();
    triggerAutoCalculate();
}

function updatePricedGamesCount() {
    const inputs = document.querySelectorAll("#gameInputs input");
    let pricedCount = 0;
    let totalValue = 0;
    
    inputs.forEach(input => {
        const value = parseFloat(input.value) || 0;
        if (value > 0) {
            pricedCount++;
            totalValue += value;
        }
    });
    
    document.getElementById("pricedGamesCount").textContent = 
        `${pricedCount} game${pricedCount !== 1 ? 's' : ''} priced`;
    
    return { count: pricedCount, total: totalValue };
}

function toggleSaveButton() {
    const inputs = document.querySelectorAll("#gameInputs input");
    const saveBtn = document.getElementById("saveBtn");

    const hasPrice = Array.from(inputs).some(
        input => parseFloat(input.value) > 0
    );

    saveBtn.disabled = !hasPrice;
}

function calculateTotal() {
    const taxRate = parseFloat(document.getElementById("taxRateSlider").value) / 100;
    const inputs = document.querySelectorAll("#gameInputs input");

    let subtotal = 0;
    let count = 0;
    let gamePrices = [];

    inputs.forEach(input => {
        const price = parseFloat(input.value) || 0;
        if (price > 0) {
            subtotal += price;
            count++;
            gamePrices.push({
                index: parseInt(input.dataset.index),
                price: price.toFixed(2),
                name: input.dataset.gameName || `Game ${parseInt(input.dataset.index) + 1}`
            });
        }
    });

    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    // Update display
    updateResultValue("subtotal", subtotal);
    updateResultValue("tax", tax);
    updateResultValue("total", total);
    
    document.getElementById("itemCount").textContent = count;
    
    // Store current calculation
    currentCalculation = {
        timestamp: new Date().toISOString(),
        taxRate: taxRate * 100,
        subtotal: subtotal,
        tax: tax,
        total: total,
        count: count,
        gamePrices: gamePrices
    };
    
    return currentCalculation;
}

function updateResultValue(elementId, newValue) {
    const element = document.getElementById(elementId);
    const formattedValue = newValue.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    if (element.textContent !== formattedValue) {
        element.classList.add('value-updating');
        element.textContent = formattedValue;
        element.title = formattedValue;
        fitResultAmounts();
        
        setTimeout(() => {
            element.classList.remove('value-updating');
        }, 300);
    }
}

function fitResultAmounts() {
    document.querySelectorAll('.results-card .result-value').forEach(amount => {
        if (amount.clientWidth === 0) return;

        amount.style.fontSize = '';
        const maxFontSize = parseFloat(getComputedStyle(amount).fontSize);
        let minFitFontSize = 6;
        let maxFitFontSize = maxFontSize;

        amount.style.fontSize = `${maxFontSize}px`;
        if (amount.scrollWidth <= amount.clientWidth) return;

        for (let attempt = 0; attempt < 12; attempt++) {
            const fontSize = (minFitFontSize + maxFitFontSize) / 2;
            amount.style.fontSize = `${fontSize}px`;

            if (amount.scrollWidth <= amount.clientWidth) {
                minFitFontSize = fontSize;
            } else {
                maxFitFontSize = fontSize;
            }
        }

        amount.style.fontSize = `${minFitFontSize}px`;
    });
}

function initializeTotalAmountFit() {
    fitResultAmounts();
    window.addEventListener('resize', fitResultAmounts);

    const resultsCard = document.querySelector('.results-card');
    if (resultsCard && 'ResizeObserver' in window) {
        let previousWidth = 0;
        const observer = new ResizeObserver(([entry]) => {
            const width = entry.contentRect.width;
            if (width !== previousWidth) {
                previousWidth = width;
                fitResultAmounts();
            }
        });
        observer.observe(resultsCard);
    }
}

function updatePerGameBreakdown() {
    const breakdownContainer = document.getElementById('perGameBreakdown');
    const taxRate = parseFloat(document.getElementById("taxRateSlider").value) / 100;
    const inputs = document.querySelectorAll("#gameInputs input");
    
    let html = '';
    let hasGames = false;
    
    // Helper to format currency
    const formatPrice = (price) => {
        return price.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };
    
    inputs.forEach(input => {
        const price = parseFloat(input.value) || 0;
        if (price > 0) {
            hasGames = true;
            const gameTax = price * taxRate;
            const gameTotal = price + gameTax;
            
            html += `
                <div class="breakdown-item">
                    <div class="breakdown-game-name">Game ${parseInt(input.dataset.index) + 1}</div>
                    <div class="breakdown-values-detailed">
                        <div class="breakdown-row">
                            <span class="breakdown-label">Price:</span>
                            <span class="breakdown-price">${formatPrice(price)}</span>
                        </div>
                        <div class="breakdown-row">
                            <span class="breakdown-label">Tax:</span>
                            <span class="breakdown-tax">+${formatPrice(gameTax)}</span>
                        </div>
                        <div class="breakdown-row total-row">
                            <span class="breakdown-label">Total:</span>
                            <span class="breakdown-total">${formatPrice(gameTotal)}</span>
                        </div>
                    </div>
                </div>
            `;
        }
    });
    
    if (!hasGames) {
        html = `
            <div class="empty-breakdown">
                <i class="fas fa-info-circle"></i>
                <p>Enter game prices to see per-game breakdown</p>
            </div>
        `;
    }
    
    breakdownContainer.innerHTML = html;
}

function saveToHistory(silent = false) {
    if (!currentCalculation || currentCalculation.total === 0) {
        showNotification("Please enter some game prices first!", "warning");
        return;
    }
    
    // Create unique ID with timestamp
    const uniqueId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
    
    const historyItem = {
        ...currentCalculation,
        id: uniqueId,
        date: new Date().toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }),
        timestamp: Date.now()
    };
    
    // Store price inputs in cache with expiry (7 days)
    const cacheData = {
        gamePrices: currentCalculation.gamePrices || [],
        gameCount: currentCalculation.count,
        taxRate: currentCalculation.taxRate,
        timestamp: Date.now(),
        expiry: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days from now
    };
    
    // Save to sessionStorage (browser cache)
    const calculationCache = JSON.parse(sessionStorage.getItem('calculationCache') || '{}');
    calculationCache[uniqueId] = cacheData;
    sessionStorage.setItem('calculationCache', JSON.stringify(calculationCache));
    
    // Clean up expired cache entries
    cleanupExpiredCache();
    
    calculationHistory.unshift(historyItem);
    
    // Keep only last 15 calculations
    if (calculationHistory.length > 15) {
        calculationHistory = calculationHistory.slice(0, 15);
    }
    
    localStorage.setItem('steamCalculatorHistory', JSON.stringify(calculationHistory));
    loadHistory();
    
    if (!silent) showNotification("Calculation saved to history!", "success");
}

// Clean up expired cache entries (older than 7 days)
function cleanupExpiredCache() {
    const calculationCache = JSON.parse(sessionStorage.getItem('calculationCache') || '{}');
    const now = Date.now();
    let cleaned = false;
    
    for (const key in calculationCache) {
        if (calculationCache[key].expiry < now) {
            delete calculationCache[key];
            cleaned = true;
        }
    }
    
    if (cleaned) {
        sessionStorage.setItem('calculationCache', JSON.stringify(calculationCache));
    }
}

function loadHistory() {
    const historyList = document.getElementById("historyList");
    const historyCount = document.getElementById("historyCount");
    
    historyCount.textContent = calculationHistory.length;
    
    if (calculationHistory.length === 0) {
        historyList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-clock"></i>
                <p>No saved calculations yet</p>
                <p class="subtext">Your calculations will appear here</p>
            </div>
        `;
        return;
    }
    
    historyList.innerHTML = calculationHistory.map(item => {
        const date = new Date(item.timestamp || item.date);
        const dateStr = date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        return `
            <div class="history-card-item">
                <div class="history-timestamp">
                    <i class="fas fa-calendar-alt"></i>
                    ${dateStr}
                </div>
                <div class="history-details">
                    <div class="history-detail-row">
                        <span class="history-detail-label">Items</span>
                        <span class="history-detail-value">${item.count}</span>
                    </div>
                    <div class="history-detail-row">
                        <span class="history-detail-label">Tax Rate</span>
                        <span class="history-detail-value">${item.taxRate.toFixed(1)}%</span>
                    </div>
                    <div class="history-detail-row">
                        <span class="history-detail-label">Subtotal</span>
                        <span class="history-detail-value">$${item.subtotal ? item.subtotal.toFixed(2) : (item.total / (1 + item.taxRate/100)).toFixed(2)}</span>
                    </div>
                    <div class="history-detail-row">
                        <span class="history-detail-label">Tax Amount</span>
                        <span class="history-detail-value">$${(item.total - (item.subtotal ? item.subtotal : (item.total / (1 + item.taxRate/100)))).toFixed(2)}</span>
                    </div>
                    <div class="history-detail-row">
                        <span class="history-detail-label">Total</span>
                        <span class="history-detail-value" style="color: var(--accent-light); font-size: var(--font-size-lg);">$${item.total.toFixed(2)}</span>
                    </div>
                </div>
                <div class="history-actions">
                    <button class="history-action-btn restore" onclick="restoreFromHistory('${item.id}')">
                        <i class="fas fa-redo"></i> Restore
                    </button>
                    <button class="history-action-btn delete" onclick="deleteHistoryItem('${item.id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function restoreFromHistory(itemId) {
    const item = calculationHistory.find(h => h.id === itemId);
    if (!item) {
        showNotification("Calculation not found", "error");
        return;
    }
    
    // Try to get cached price data first
    const calculationCache = JSON.parse(sessionStorage.getItem('calculationCache') || '{}');
    const cachedData = calculationCache[itemId];
    
    // Check if cache is still valid (not expired)
    if (cachedData && cachedData.expiry > Date.now()) {
        // Restore from cache
        document.getElementById('gameCount').value = cachedData.gameCount;
        updateGameFields();
        
        // Restore prices from cache by targeting gamePrice0, gamePrice1, etc
        if (cachedData.gamePrices && cachedData.gamePrices.length > 0) {
            cachedData.gamePrices.forEach((game) => {
                const input = document.getElementById(`gamePrice${game.index}`);
                if (input) {
                    input.value = game.price || '';
                    setCalculatorGameName(input, game.name);
                }
            });
        }
        
        // Restore tax rate and input (taxRate saved as percent)
        const restoredTax = cachedData.taxRate;
        document.getElementById('taxRateSlider').value = restoredTax;
        document.getElementById('taxRateInput').value = restoredTax;
        // Update preset active state
        document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.preset-btn[data-tax="${restoredTax}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        updateTaxDisplay();
    } else {
        // Fallback to history item data if cache is expired
        document.getElementById('gameCount').value = item.count;
        updateGameFields();
        
        if (item.gamePrices && item.gamePrices.length > 0) {
            item.gamePrices.forEach((game) => {
                const input = document.getElementById(`gamePrice${game.index}`);
                if (input) {
                    input.value = game.price || '';
                    setCalculatorGameName(input, game.name);
                }
            });
        }
        
        const restoredTax = item.taxRate;
        document.getElementById('taxRateSlider').value = restoredTax;
        document.getElementById('taxRateInput').value = restoredTax;
        document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.preset-btn[data-tax="${restoredTax}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        updateTaxDisplay();
        
        if (!cachedData) {
            showNotification("Cache expired, using saved calculation data", "info");
        }
    }
    
    // Scroll to calculator
    scrollToSection('calculator');
    
    // Recalculate
    calculateTotal();
    
    showNotification('Calculation restored', 'success');
}


function clearHistory() {
    if (calculationHistory.length === 0) {
        showNotification("History is already empty", "info");
        return;
    }
    
    if (confirm("Are you sure you want to clear all history?")) {
        calculationHistory = [];
        localStorage.removeItem('steamCalculatorHistory');
        loadHistory();
        showNotification("History cleared", "info");
    }
}

function deleteHistoryItem(itemId) {
    calculationHistory = calculationHistory.filter(item => item.id !== itemId);
    localStorage.setItem('steamCalculatorHistory', JSON.stringify(calculationHistory));
    
    // Also delete from cache
    const calculationCache = JSON.parse(sessionStorage.getItem('calculationCache') || '{}');
    delete calculationCache[itemId];
    sessionStorage.setItem('calculationCache', JSON.stringify(calculationCache));
    
    loadHistory();
    showNotification("Calculation deleted", "info");
}

function clearAllPrices() {
    const inputs = document.querySelectorAll("#gameInputs input");
    inputs.forEach(input => {
        input.value = "";
        input.style.borderColor = "";
        input.style.boxShadow = "";
    });
    toggleSaveButton();
    updatePricedGamesCount();
    calculateTotal();
    updatePerGameBreakdown();
    showNotification("All prices cleared", "info");
}

function resetCalculator() {
    if (confirm("Reset calculator to default settings?")) {
        document.getElementById("taxRateSlider").value = "8";
        document.getElementById("gameCount").value = "1";
        
        // Update tax preset
        document.querySelectorAll('.preset-btn').forEach(btn =>
            btn.classList.remove('active'));
        document.querySelector('.preset-btn[data-tax="8"]')?.classList.add('active');
        
        // Animate game count
        const gameCountInput = document.getElementById('gameCount');
        gameCountInput.classList.add('game-count-changing');
        setTimeout(() => {
            gameCountInput.classList.remove('game-count-changing');
        }, 300);
        
        updateTaxDisplay();
        updateTotalGamesCount();
        clearAllPrices();
        updateGameFields();
        showNotification("Calculator reset to default", "info");
    }
}

function copyToClipboard() {
    const total = document.getElementById("total").textContent;
    const items = document.getElementById("itemCount").textContent;
    const subtotal = document.getElementById("subtotal").textContent;
    const tax = document.getElementById("tax").textContent;
    const taxRate = document.getElementById("taxRateDisplay").textContent;
    
    const textToCopy = `Steam Price Calculator Results:
Total: ${total}
Items: ${items} games
Subtotal: ${subtotal}
Tax (${taxRate}): ${tax}`;
    
    navigator.clipboard.writeText(textToCopy).then(() => {
        showNotification("Results copied to clipboard!", "success");
    }).catch(err => {
        showNotification("Failed to copy: " + err, "danger");
    });
}

function fillSampleData() {
    const samplePrices = [19.99, 29.99, 14.99, 39.99, 9.99];
    const inputs = document.querySelectorAll("#gameInputs input");
    
    // Set game count to match sample data if needed
    if (inputs.length < samplePrices.length) {
        document.getElementById("gameCount").value = samplePrices.length;
        updateGameFields();
        // Need to requery inputs after updating
        setTimeout(() => fillSampleData(), 100);
        return;
    }
    
    inputs.forEach((input, index) => {
        if (index < samplePrices.length) {
            input.value = samplePrices[index].toFixed(2);
            input.style.borderColor = "var(--success)";
            input.style.boxShadow = "0 0 0 2px rgba(46, 204, 113, 0.1)";
        } else {
            input.value = "";
            input.style.borderColor = "";
            input.style.boxShadow = "";
        }
    });
    
    toggleSaveButton();
    updatePricedGamesCount();
    calculateTotal();
    showNotification("Sample data loaded", "success");
}

function updateDarkModeButton() {
    const button = document.querySelector('[onclick="toggleDarkMode()"]');
    if (button) {
        const icon = button.querySelector('i');
        const text = button.querySelector('span');
        
        if (darkMode) {
            icon.className = 'fas fa-sun';
            text.textContent = 'Light Mode';
        } else {
            icon.className = 'fas fa-moon';
            text.textContent = 'Dark Mode';
        }
    }
}

function toggleDarkMode() {
    darkMode = !darkMode;
    document.body.classList.toggle('light-mode', !darkMode);
    localStorage.setItem('darkMode', darkMode);
    
    updateDarkModeButton();
    
    if (darkMode) {
        showNotification("Dark mode enabled", "success");
    } else {
        showNotification("Light mode enabled", "success");
    }
}

function exportToCSV() {
    const inputs = document.querySelectorAll("#gameInputs input");
    const taxRate = parseFloat(document.getElementById('taxRateSlider').value);
    
    let csvContent = "Game,Price,Tax,Total\n";
    let gameNumber = 1;
    
    inputs.forEach(input => {
        const price = parseFloat(input.value) || 0;
        if (price > 0) {
            const tax = price * (taxRate / 100);
            const total = price + tax;
            
            csvContent += `Game ${gameNumber},$${price.toFixed(2)},$${tax.toFixed(2)},$${total.toFixed(2)}\n`;
            gameNumber++;
        }
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `steam_calculator_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    showNotification("Data exported as CSV", "success");
}

function printSummary() {
    if (!currentCalculation || currentCalculation.total === 0) {
        showNotification("Please enter some game prices first!", "warning");
        return;
    }
    
    const taxRate = parseFloat(document.getElementById('taxRateSlider').value);
    
    let printContent = `
    <html>
    <head>
        <title>Steam Price Calculator Summary</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                padding: 40px;
                background-color: #f5f5f5;
            }
            .print-container {
                background-color: white;
                padding: 30px;
                border-radius: 8px;
                max-width: 600px;
                margin: 0 auto;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            h1 {
                color: #00adee;
                text-align: center;
                margin-bottom: 10px;
            }
            .timestamp {
                text-align: center;
                color: #666;
                font-size: 14px;
                margin-bottom: 30px;
            }
            .summary-section {
                margin: 20px 0;
                padding: 15px;
                background-color: #f9f9f9;
                border-left: 4px solid #00adee;
            }
            .summary-section h2 {
                margin-top: 0;
                color: #333;
                font-size: 16px;
            }
            .game-list {
                list-style: none;
                padding: 0;
            }
            .game-list li {
                padding: 8px 0;
                border-bottom: 1px solid #eee;
                display: flex;
                justify-content: space-between;
            }
            .game-list li:last-child {
                border-bottom: none;
            }
            .totals {
                margin-top: 20px;
                padding-top: 20px;
                border-top: 2px solid #00adee;
            }
            .total-row {
                display: flex;
                justify-content: space-between;
                padding: 10px 0;
                font-size: 16px;
                font-weight: bold;
            }
            .total-row.grand-total {
                font-size: 20px;
                color: #00adee;
            }
            @media print {
                body {
                    background-color: white;
                    padding: 0;
                }
                .print-container {
                    box-shadow: none;
                    max-width: 100%;
                }
            }
        </style>
    </head>
    <body>
        <div class="print-container">
            <h1>🎮 Steam Price Calculator Summary</h1>
            <div class="timestamp">${new Date().toLocaleString()}</div>
            
            <div class="summary-section">
                <h2>Game Prices</h2>
                <ul class="game-list">`;
    
    currentCalculation.gamePrices.forEach((game, index) => {
        const tax = parseFloat(game.price) * (taxRate / 100);
        const total = parseFloat(game.price) + tax;
        printContent += `
                    <li>
                        <span>${game.name}</span>
                        <span>$${parseFloat(game.price).toFixed(2)}</span>
                    </li>`;
    });
    
    printContent += `
                </ul>
            </div>
            
            <div class="summary-section">
                <h2>Calculation Summary</h2>
                <div class="totals">
                    <div class="total-row">
                        <span>Subtotal:</span>
                        <span>$${currentCalculation.subtotal.toFixed(2)}</span>
                    </div>
                    <div class="total-row">
                        <span>Tax (${taxRate}%):</span>
                        <span>$${currentCalculation.tax.toFixed(2)}</span>
                    </div>
                    <div class="total-row grand-total">
                        <span>Total Amount:</span>
                        <span>$${currentCalculation.total.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>`;
    
    const printWindow = window.open('', '', 'width=600,height=700');
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    setTimeout(() => {
        printWindow.print();
    }, 250);
    
    showNotification("Print preview opened", "success");
}

function toggleHistoryView() {
    const historyList = document.getElementById('historyList');
    historyList.classList.toggle('compact-view');
}

function showNotification(message, type = "info") {
    // Remove existing notification
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.setAttribute('role', 'status');
    notification.setAttribute('aria-live', 'polite');
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : type === 'danger' ? 'times-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    // Style notification
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#2ecc71' : type === 'warning' ? '#f39c12' : type === 'danger' ? '#e74c3c' : '#3498db'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        animation: slideIn 0.3s ease;
        font-weight: 600;
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[character]));
}

// Add animation styles
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(styleSheet);

// ===== DEALS SECTION =====
// ===== DEALS SECTION WITH REAL API INTEGRATION =====

// Initialize deals filter buttons
function initializeDealsFilters() {
    document.querySelectorAll('.deals-filter-btn').forEach(button => {
        button.addEventListener('click', function() {
            document.querySelectorAll('.deals-filter-btn').forEach(btn => 
                btn.classList.remove('active'));
            this.classList.add('active');
            const platform = this.dataset.platform;
            
            if (!dealsLoading) loadDeals(1, true);
            else showNotification("Already loading deals...", "warning");
        });
    });
    
    // Setup sort dropdown
    const dealsSort = document.getElementById('dealsSort');
    if (dealsSort) {
        dealsSort.addEventListener('change', function() {
            clearTimeout(dealsSearchTimeout);
            dealsSearchTimeout = null;
            sortDeals(this.value);
        });
    }

    const dealsSearchInput = document.getElementById('dealsSearchInput');
    if (dealsSearchInput) {
        dealsSearchInput.addEventListener('input', function() {
            clearTimeout(dealsSearchTimeout);
            if (dealsLoading) {
                dealsRequestController?.abort();
                dealsRequestController = null;
                dealsLoading = false;
                dealsRequestId++;
                updateDealsPaginationControls();
            }
            failedDealsRequest = null;
            setDealsPageStatus('');
            dealsSearchTimeout = setTimeout(() => {
                dealsSearchTimeout = null;
                loadDeals(1, true, null, dealsSearchInput.value);
            }, 300);
            updateDealsPaginationControls();
        });
    }

    // Setup game search
    const gameSearchInput = document.getElementById('gameSearchInput');
    if (gameSearchInput) {
        gameSearchInput.addEventListener('input', function(e) {
            handleGameSearch(e.target.value);
        });
        
        gameSearchInput.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                if (!currentGameSuggestions.length) return;

                e.preventDefault();
                const direction = e.key === 'ArrowDown' ? 1 : -1;
                const suggestionCount = currentGameSuggestions.length;
                activeGameSuggestionIndex = activeGameSuggestionIndex < 0
                    ? (direction > 0 ? 0 : suggestionCount - 1)
                    : (activeGameSuggestionIndex + direction + suggestionCount) % suggestionCount;
                updateActiveGameSuggestion();
                return;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                if (currentGameSuggestions.length) {
                    selectGameSuggestion(activeGameSuggestionIndex < 0 ? 0 : activeGameSuggestionIndex);
                } else {
                    const query = gameSearchInput.value.trim();
                    if (!query) return;

                    clearTimeout(searchTimeout);
                    lookupGamePrices(query);
                }
                return;
            }

            if (e.key === 'Escape') {
                clearTimeout(searchTimeout);
                gameSearchAbortController?.abort();
                gameSearchAbortController = null;
                gameSearchRequestId++;
                document.getElementById('searchSuggestions').innerHTML = '';
                currentGameSuggestions = [];
                activeGameSuggestionIndex = -1;
                gameSearchInput.setAttribute('aria-expanded', 'false');
                gameSearchInput.removeAttribute('aria-activedescendant');
            }
        });
    }
}

function updateActiveGameSuggestion() {
    const items = document.querySelectorAll('#searchSuggestions [role="option"]');
    const gameSearchInput = document.getElementById('gameSearchInput');

    items.forEach((item, index) => {
        const isActive = index === activeGameSuggestionIndex;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-selected', String(isActive));
    });

    const activeItem = items[activeGameSuggestionIndex];
    if (activeItem) {
        gameSearchInput.setAttribute('aria-activedescendant', activeItem.id);
        activeItem.scrollIntoView({ block: 'nearest' });
    } else {
        gameSearchInput.removeAttribute('aria-activedescendant');
    }
}

function setActiveGameSuggestion(index) {
    activeGameSuggestionIndex = index;
    updateActiveGameSuggestion();
}

function selectGameSuggestion(index) {
    const game = currentGameSuggestions[index];
    if (!game) return;

    lookupGamePrices(game.displayTitle || game.title || game.name);
}

// Handle game search with autocomplete
function handleGameSearch(query) {
    clearTimeout(searchTimeout);
    gameSearchAbortController?.abort();
    gameSearchAbortController = null;
    gameSearchRequestId++;
    priceLookupAbortController?.abort();
    priceLookupRequestId++;
    const suggestionsDiv = document.getElementById('searchSuggestions');
    const resultsList = document.getElementById('gameLookupResult');
    const gameSearchInput = document.getElementById('gameSearchInput');
    const search = String(query ?? '').trim();
    const isSearching = Boolean(search);

    document.getElementById('deals').classList.toggle('searching', isSearching);
    resultsList.innerHTML = '';
    suggestionsDiv.innerHTML = '';
    currentGameSuggestions = [];
    activeGameSuggestionIndex = -1;
    gameSearchInput.setAttribute('aria-expanded', 'false');
    gameSearchInput.removeAttribute('aria-activedescendant');
    
    if (!isSearching) {
        return;
    }
    
    const requestId = gameSearchRequestId;
    searchTimeout = setTimeout(async () => {
        const controller = new AbortController();
        gameSearchAbortController = controller;

        try {
            const suggestions = await fetchGameSuggestions(search, controller.signal);
            if (requestId !== gameSearchRequestId || gameSearchInput.value.trim() !== search) return;
            displaySearchSuggestions(suggestions, search);
        } catch (error) {
            if (controller.signal.aborted || requestId !== gameSearchRequestId) return;
            console.warn('IGDB game search failed:', error.message);
            displaySearchSuggestionsError(error.message);
        }
    }, 300);
}

async function fetchGameSuggestions(query, signal) {
    if (location.protocol === 'file:') {
        throw new Error('Game suggestions require a Vercel preview/server. Open the app through the preview deployment or run vercel dev to enable suggestions.');
    }

    const cacheKey = query.trim().toLowerCase();
    const cached = gameSearchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < gameSearchCacheTtl) {
        gameSearchCache.delete(cacheKey);
        gameSearchCache.set(cacheKey, cached);
        return cached.results;
    }
    if (cached) gameSearchCache.delete(cacheKey);

    const params = new URLSearchParams({ search: query });
    const response = await fetch(`${API_CONFIG.IGDB_GAMES_URL}?${params}`, { signal });
    const data = await response.json();

    if (!response.ok || !Array.isArray(data.results)) {
        throw new Error(data.error || `Game search returned ${response.status}`);
    }

    const results = data.results.map(game => ({
            id: game.id,
            title: game.name,
            displayTitle: game.name,
            image: game.background_image,
            rating: game.rating,
            platforms: game.platforms || []
        }));

    gameSearchCache.set(cacheKey, { results, timestamp: Date.now() });
    while (gameSearchCache.size > gameSearchCacheLimit) {
        gameSearchCache.delete(gameSearchCache.keys().next().value);
    }

    return results;
}

function displaySearchSuggestionsError(message = '') {
    const suggestionsDiv = document.getElementById('searchSuggestions');
    const gameSearchInput = document.getElementById('gameSearchInput');
    const needsServer = /Vercel|preview|server/.test(message || '');

    currentGameSuggestions = [];
    activeGameSuggestionIndex = -1;
    gameSearchInput.setAttribute('aria-expanded', 'true');
    suggestionsDiv.innerHTML = `
        <div class="search-suggestion-item" role="status" style="text-align: center; color: var(--text-tertiary);">
            <i class="fas fa-exclamation-circle"></i>
            <p>${needsServer
                ? 'Game suggestions need the app running through Vercel preview or vercel dev.'
                : 'Game search is temporarily unavailable. Please try again.'}</p>
        </div>
    `;
}

// Display search suggestions
function displaySearchSuggestions(games, query) {
    const suggestionsDiv = document.getElementById('searchSuggestions');
    const gameSearchInput = document.getElementById('gameSearchInput');
    
    currentGameSuggestions = games || [];
    activeGameSuggestionIndex = -1;
    gameSearchInput.setAttribute('aria-expanded', 'true');
    
    if (!games || games.length === 0) {
        suggestionsDiv.innerHTML = `
            <div class="search-suggestion-item" style="text-align: center; color: var(--text-tertiary);">
                <i class="fas fa-search"></i>
                <p>No games found for "${escapeHtml(query)}"</p>
            </div>
        `;
        return;
    }
    
    suggestionsDiv.innerHTML = games.map((game, index) => {
        const gameTitle = game.displayTitle || game.title || game.name;
        const gameImage = game.image || '';
        const rating = game.rating ? `★${game.rating.toFixed(1)}` : '';
        
        return `
            <div class="search-suggestion-item" id="game-suggestion-${index}" role="option" aria-selected="false" data-suggestion-index="${index}">
                ${gameImage ? `<img src="${escapeHtml(gameImage)}" alt="${escapeHtml(gameTitle)}" class="search-suggestion-thumbnail">` : `<div class="search-suggestion-thumbnail" style="background: var(--bg-primary);"><i class="fas fa-image"></i></div>`}
                <div class="search-suggestion-info">
                    <div class="search-suggestion-name">${escapeHtml(gameTitle)}</div>
                    ${rating ? `<div class="search-suggestion-meta">${rating}</div>` : `<div class="search-suggestion-meta">Click to view prices</div>`}
                </div>
            </div>
        `;
    }).join('');

    suggestionsDiv.querySelectorAll('[data-suggestion-index]').forEach(item => {
        const index = Number(item.dataset.suggestionIndex);
        item.addEventListener('mouseenter', () => setActiveGameSuggestion(index));
        item.addEventListener('click', () => selectGameSuggestion(index));
    });
}

// Display all suggestions as cards when pressing Enter
function displayAllSuggestionsAsCards(games) {
    // Hide suggestions dropdown
    document.getElementById('searchSuggestions').innerHTML = '';
    
    const dealsList = document.getElementById('dealsList');
    
    if (!games || games.length === 0) {
        dealsList.innerHTML = `
            <div class="empty-history">
                <i class="fas fa-exclamation-triangle"></i>
                <p>No games to display</p>
                <p class="subtext">Try searching for another game</p>
            </div>
        `;
        return;
    }
    
    // Create cards for all suggestions
    let htmlContent = games.map((game) => {
        const gameTitle = game.displayTitle || game.title || game.name;
        const gameImage = game.image || '';
        const rating = game.rating ? `★${game.rating.toFixed(1)}` : '';
        const gameID = game.id || 0;
        
        return `
            <div class="deal-card">
                <div class="deal-header">
                    <h3 class="deal-title">${escapeHtml(gameTitle)}</h3>
                </div>
                
                ${gameImage ? `<div class="deal-game-image" style="background-image: url('${escapeHtml(gameImage)}'); background-size: cover; background-position: center; height: 150px; width: 100%;"></div>` : ''}
                
                <div class="deal-body">
                    ${rating ? `<div class="deal-info-row">
                        <span class="info-label"><i class="fas fa-star"></i> Rating</span>
                        <span class="info-value">${rating}</span>
                    </div>` : ''}
                    <div class="deal-info-row">
                        <span class="info-label"><i class="fas fa-info-circle"></i> Source</span>
                        <span class="info-value">IGDB Database</span>
                    </div>
                </div>
                
                <div class="deal-footer">
                    <button class="deal-link" data-lookup-title="${escapeHtml(gameTitle)}" data-lookup-id="${gameID}">
                        <i class="fas fa-search"></i> View Prices
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    dealsList.innerHTML = htmlContent;
    dealsList.querySelectorAll('[data-lookup-title]').forEach(button => {
        button.addEventListener('click', () => lookupGamePrices(button.dataset.lookupTitle, Number(button.dataset.lookupId)));
    });
}

// Lookup game prices (when clicking suggestion)
async function lookupGamePrices(gameName) {
    const normalizedGameName = String(gameName ?? '').trim();
    if (!normalizedGameName) return;

    clearTimeout(searchTimeout);
    gameSearchAbortController?.abort();
    gameSearchAbortController = null;
    gameSearchRequestId++;

    const requestKey = normalizedGameName.toLowerCase();
    const existingRequest = priceLookupRequests.get(requestKey);
    if (existingRequest && !existingRequest.controller.signal.aborted) return existingRequest.promise;

    priceLookupAbortController?.abort();
    const controller = new AbortController();
    priceLookupAbortController = controller;
    const requestId = ++priceLookupRequestId;
    const request = performGamePriceLookup(normalizedGameName, controller, requestId);
    priceLookupRequests.set(requestKey, { promise: request, controller });

    try {
        return await request;
    } finally {
        if (priceLookupRequests.get(requestKey)?.promise === request) {
            priceLookupRequests.delete(requestKey);
        }
    }
}

async function performGamePriceLookup(gameName, controller, requestId) {
    document.getElementById('deals').classList.add('searching');

    const searchInput = document.getElementById('gameSearchInput');
    if (searchInput) {
        searchInput.value = gameName;
        searchInput.setAttribute('aria-expanded', 'false');
        searchInput.removeAttribute('aria-activedescendant');
    }
    
    // Hide suggestions
    document.getElementById('searchSuggestions').innerHTML = '';
    currentGameSuggestions = [];
    activeGameSuggestionIndex = -1;
    
    // Show loading - use searchResultsList if it exists
    const resultsList = document.getElementById('gameLookupResult');
    resultsList.innerHTML = `
        <div class="loading-deals">
            <div class="spinner"></div>
            <p>Looking up game details and prices for "${escapeHtml(gameName)}"...</p>
        </div>
    `;
    
    try {
        // Fetch prices from backend deals API (includes Steam from CheapShark)
        let pricesData = [];
        let titleMismatch = false;
        let searchData = {};
        
        try {
            // Call Steam search endpoint via backend (server can fetch Steam directly)
            const searchResponse = await fetch(`${API_CONFIG.STEAM_SEARCH_URL}?gameName=${encodeURIComponent(gameName)}`, {
                signal: controller.signal
            });
            searchData = await searchResponse.json();
            
            if (searchResponse.ok) {
                if (searchData.titleMismatch) {
                    titleMismatch = true;
                }
                
                if (!titleMismatch && searchData.prices && searchData.prices.length > 0) {
                    pricesData = searchData.prices;
                }
            }
        } catch (e) {
            if (controller.signal.aborted || requestId !== priceLookupRequestId) return;
            console.warn('Could not fetch game prices:', e);
        }

        if (controller.signal.aborted || requestId !== priceLookupRequestId) return;
        
        displayGamePricesLookup(gameName, pricesData, titleMismatch, searchData);
        
    } catch (error) {
        if (controller.signal.aborted || requestId !== priceLookupRequestId) return;
        console.error('Price lookup error:', error);
        resultsList.innerHTML = `
            <div class="empty-history">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Couldn't fetch details for "${escapeHtml(gameName)}"</p>
                <p class="subtext">You can add this game and enter the price manually</p>
                <button class="deals-btn" data-add-game="${escapeHtml(gameName)}" style="margin-top: 15px;">
                    <i class="fas fa-plus-circle"></i>
                    Add "${escapeHtml(gameName)}" to Calculator
                </button>
                <button class="deals-btn" onclick="clearGameSearch()" style="margin-top: 10px;">
                    <i class="fas fa-redo"></i>
                    Clear Search
                </button>
            </div>
        `;
        resultsList.querySelector('[data-add-game]')?.addEventListener('click', event => addGameManual(event.currentTarget.dataset.addGame));
    } finally {
        if (!controller.signal.aborted && requestId === priceLookupRequestId) {
            resultsList.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                block: 'center'
            });
        }
    }
}

// Search games by name (filter deals)
function searchGamesByName(gameName) {
    const searchInput = document.getElementById('gameSearchInput');
    if (searchInput) {
        searchInput.value = gameName;
    }
    
    // Hide suggestions
    document.getElementById('searchSuggestions').innerHTML = '';
    
    // Filter current deals by game name
    const allDeals = document.querySelectorAll('.deal-item');
    let matchCount = 0;
    
    allDeals.forEach(deal => {
        const title = deal.querySelector('.deal-title').textContent.toLowerCase();
        if (title.includes(gameName.toLowerCase())) {
            deal.style.display = 'block';
            matchCount++;
        } else {
            deal.style.display = 'none';
        }
    });
    
    // If no deals found, fetch game price from direct APIs
    if (matchCount === 0) {
        fetchGamePrice(gameName);
    }
}

// Fetch game price from direct store APIs
async function fetchGamePrice(gameName) {
    const dealsList = document.getElementById('dealsList');
    dealsList.innerHTML = `
        <div class="loading-deals">
            <div class="spinner"></div>
            <p>Fetching prices for "${gameName}"...</p>
        </div>
    `;
    
    try {
        // Fetch Steam prices only (server-side search)
        const steamPrices = await fetchSteamPrices(gameName);
        if (!steamPrices || steamPrices.length === 0) {
            throw new Error('Game not found on Steam');
        }
        const allPrices = steamPrices.map(p => ({ ...p, storeName: 'Steam' }));
        displayGamePricesLookup(gameName, allPrices);
    } catch (error) {
        console.error('Price fetch error:', error);
        dealsList.innerHTML = `
            <div class="empty-history">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Prices not available for "${gameName}"</p>
                <p class="subtext">Try searching for another game or adjusting your search term</p>
                <button class="deals-btn" onclick="clearGameSearch()" style="margin-top: 20px; max-width: 300px; margin-left: auto; margin-right: auto;">
                    <i class="fas fa-redo"></i>
                    Clear Search
                </button>
            </div>
        `;
    }
}

// DEPRECATED: Now using backend /api/deals endpoint which includes Steam prices from CheapShark
// This function is kept commented out in case we need it in the future
/*
async function fetchSteamPrices(gameName) {
    try {
        // Use backend API instead of direct CORS proxy
        const apiUrl = `/api/steam-search?gameName=${encodeURIComponent(gameName)}`;
        
        console.log(`[STEAM] Fetching via backend: ${apiUrl}`);
        
        const response = await fetch(apiUrl);
        const result = await response.json();
        
        if (!response.ok) {
            console.warn(`[STEAM] Backend returned status ${response.status}`);
            console.warn(`[STEAM] Backend error:`, result);
            return [];
        }
        
        if (!result.prices || result.prices.length === 0) {
            console.log(`No Steam prices found for: ${gameName}`);
            return [];
        }
        
        console.log(`[STEAM] Found prices for app ID ${result.appId}: $${result.prices[0].price}`);
        
        // Apply FIX 1: Check for real Steam discount
        const prices = result.prices.map(price => {
            if (price.noPriceData) {
                return price;
            }
            
            let discountPercent = price.discount || 0;
            if (!hasRealSteamDiscount({ steamPrice: { initial: price.regular, final: price.price } })) {
                discountPercent = 0;
            }
            
            return {
                ...price,
                discount: discountPercent
            };
        });
        
        return prices;
    } catch (error) {
        console.warn('Steam API fetch error:', error);
        return [];
    }
}
*/

// Fetch Steam prices using server-side helper
async function fetchSteamPrices(gameName) {
    try {
        const apiUrl = `/api/steam-search?gameName=${encodeURIComponent(gameName)}`;
        const response = await fetch(apiUrl);
        const result = await response.json();
        if (!response.ok) {
            console.warn('[STEAM] Backend returned error for:', gameName, result);
            return [];
        }
        return result.prices || [];
    } catch (err) {
        console.warn('[STEAM] fetchSteamPrices error:', err.message);
        return [];
    }
} 

// FIX 1: Check for real Steam discount
function hasRealSteamDiscount(deal) {
    if (!deal.steamPrice) return false;
    
    const initial = deal.steamPrice.initial;
    const final = deal.steamPrice.final;
    
    return initial && final && final < initial;
}

// FIX 2: Generate safe Steam URLs with fallback
function getSteamUrl(deal) {
    // Check if deal has a valid app ID
    const appId = deal.steamAppID || deal.appId || deal.id;
    
    if (appId && Number(appId) > 0) {
        return `https://store.steampowered.com/app/${appId}`;
    }
    
    // Fallback: Steam search using game title
    if (deal.title) {
        return `https://store.steampowered.com/search/?term=${encodeURIComponent(deal.title)}`;
    }
    
    // Last resort: Steam home
    return "https://store.steampowered.com";
}

function displayGamePricesLookup(gameName, pricesData, titleMismatch = false, searchData = {}) {
    const resultsList = document.getElementById('gameLookupResult');

    if (titleMismatch) {
        resultsList.innerHTML = `
            <div class="deal-card">
                <div class="deal-header"><h3 class="deal-title">${escapeHtml(gameName)}</h3></div>
                <div class="deal-body" style="text-align: center; padding: var(--spacing-lg);">
                    <p style="margin: 0; color: var(--warning);"><i class="fas fa-exclamation-triangle"></i> No exact Steam match was found.</p>
                    <p class="subtext">Steam returned a different title, so its price was not shown.</p>
                </div>
                <div class="deal-footer">
                    <a class="deal-link" href="${escapeHtml(searchData.searchFallbackUrl || `https://store.steampowered.com/search/?term=${encodeURIComponent(gameName)}`)}" target="_blank" rel="noopener">
                        <i class="fas fa-search"></i> Search Steam
                    </a>
                </div>
            </div>`;
        return;
    }

    // pricesData is expected to be an array of Steam price objects from /api/steam-search
    if (!pricesData || pricesData.length === 0) {
        resultsList.innerHTML = `
            <div class="deal-card">
                <div class="deal-header">
                    <h3 class="deal-title">${escapeHtml(gameName)}</h3>
                </div>
                <div class="deal-body" style="text-align: center; padding: var(--spacing-lg);">
                    <p style="margin: 0; color: var(--text-tertiary);">
                        <i class="fas fa-info-circle"></i> Price data unavailable
                    </p>
                </div>
                <div class="deal-footer">
                    <button class="deal-link" data-add-game="${escapeHtml(gameName)}">
                        <i class="fas fa-plus"></i> Add to Calculator
                    </button>
                </div>
            </div>
        `;
        resultsList.querySelector('[data-add-game]')?.addEventListener('click', event => addGameManual(event.currentTarget.dataset.addGame));
        return;
    }

    // Find best (lowest) price among returned Steam prices
    const validPrices = pricesData.filter(p => !p.noPriceData && typeof p.price === 'number');
    const best = validPrices.length ? validPrices.reduce((min, p) => p.price < min.price ? p : min) : pricesData[0];

    const formatPrice = (price) => price.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

    if (best.noPriceData) {
        resultsList.innerHTML = `
            <div class="deal-card">
                <div class="deal-header">
                    <h3 class="deal-title">${escapeHtml(gameName)}</h3>
                </div>
                <div class="deal-body" style="text-align: center; padding: var(--spacing-lg);">
                    <p style="margin: 0; color: var(--text-tertiary);">
                        <i class="fas fa-info-circle"></i> Price data unavailable
                    </p>
                </div>
                <div class="deal-footer">
                    <button class="deal-link" data-add-game="${escapeHtml(gameName)}">
                        <i class="fas fa-plus"></i> Add to Calculator
                    </button>
                </div>
            </div>
        `;
        resultsList.querySelector('[data-add-game]')?.addEventListener('click', event => addGameManual(event.currentTarget.dataset.addGame));
        return;
    }

    const savings = (best.regular || best.original_price || 0) - best.price;

    resultsList.innerHTML = `
        <div class="deal-card">
            <div class="deal-header">
                <h3 class="deal-title">${escapeHtml(gameName)}</h3>
                <div class="deal-badges">
                    <span class="badge">${best.discount && best.discount > 0 ? '-' + best.discount + '%' : 'Full Price'}</span>
                </div>
            </div>
            <div class="deal-body">
                <div class="deal-prices">
                    <div class="price-item">
                        <div class="price-label">Current Price</div>
                        <div class="price-value">${formatPrice(best.price)}</div>
                        ${best.discount && best.discount > 0 ? `<div class="discount-label">${best.discount}% off</div>` : ''}
                    </div>
                    <div class="price-item">
                        <div class="price-label">Save</div>
                        <div class="price-value" style="color: var(--success);">${formatPrice(savings)}</div>
                    </div>
                </div>
            </div>
            <div class="deal-footer">
                <button class="deal-link" data-add-game="${escapeHtml(gameName)}" data-add-price="${best.price}">
                    <i class="fas fa-plus"></i> Add to Calculator
                </button>
                <a href="${escapeHtml(best.url)}" target="_blank" rel="noopener" class="deal-link" style="background: var(--success); margin-top: 8px; display: block; text-align: center;">
                    <i class="fas fa-external-link-alt"></i> Visit Steam
                </a>
            </div>
        </div>
    `;
    resultsList.querySelector('[data-add-game]')?.addEventListener('click', event => {
        addGameWithPrice(event.currentTarget.dataset.addGame, Number(event.currentTarget.dataset.addPrice));
    });
}

// Add game manually without a deal
function addGameManual(gameName) {
    const inputs = document.querySelectorAll("#gameInputs input");
    let added = false;
    
    for (const input of inputs) {
        if (!input.value || input.value === '0' || input.value === '0.00') {
            setCalculatorGameName(input, gameName);
            input.focus();
            input.select();
            showNotification(`Added "${gameName}" - Enter price manually`, "info");
            added = true;
            break;
        }
    }
    
    if (!added) {
        const gameCountInput = document.getElementById('gameCount');
        const currentCount = parseInt(gameCountInput.value) || 1;
        if (currentCount < 50) {
            gameCountInput.value = currentCount + 1;
            updateGameFields();
            
            setTimeout(() => {
                const newInput = document.querySelector(`#gameInputs input[data-index="${currentCount}"]`);
                if (newInput) {
                    setCalculatorGameName(newInput, gameName);
                    newInput.focus();
                    newInput.select();
                    showNotification(`Added "${gameName}" - Enter price manually`, "info");
                }
            }, 100);
        } else {
            showNotification("Maximum 50 games reached!", "warning");
        }
    }
    
}

// Add game with specific price
function addGameWithPrice(gameName, price) {
    // Find first empty game input
    const inputs = document.querySelectorAll("#gameInputs input");
    let added = false;
    
    for (const input of inputs) {
        if (!input.value || input.value === '0' || input.value === '0.00') {
            setCalculatorGameName(input, gameName);
            input.value = price.toFixed(2);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.style.borderColor = "var(--success)";
            input.style.boxShadow = "0 0 0 2px rgba(46, 204, 113, 0.1)";
            showNotification(`Added "${gameName}" at $${price.toFixed(2)}!`, "success");
            added = true;
            break;
        }
    }
    
    // If no empty inputs, add a new game
    if (!added) {
        const gameCountInput = document.getElementById('gameCount');
        const currentCount = parseInt(gameCountInput.value) || 1;
        if (currentCount < 50) {
            gameCountInput.value = currentCount + 1;
            updateGameFields();
            
            setTimeout(() => {
                const newInput = document.querySelector(`#gameInputs input[data-index="${currentCount}"]`);
                if (newInput) {
                    setCalculatorGameName(newInput, gameName);
                    newInput.value = price.toFixed(2);
                    newInput.dispatchEvent(new Event('input', { bubbles: true }));
                    newInput.style.borderColor = "var(--success)";
                    newInput.style.boxShadow = "0 0 0 2px rgba(46, 204, 113, 0.1)";
                    showNotification(`Added "${gameName}" at $${price.toFixed(2)}!`, "success");
                }
            }, 100);
        } else {
            showNotification("Maximum 50 games reached!", "warning");
        }
    }
    
}

// Clear game search
function clearGameSearch() {
    clearTimeout(searchTimeout);
    gameSearchAbortController?.abort();
    gameSearchAbortController = null;
    gameSearchRequestId++;
    priceLookupAbortController?.abort();
    priceLookupRequestId++;
    const searchInput = document.getElementById('gameSearchInput');
    if (searchInput) {
        searchInput.value = '';
        searchInput.setAttribute('aria-expanded', 'false');
        searchInput.removeAttribute('aria-activedescendant');
    }
    document.getElementById('searchSuggestions').innerHTML = '';
    currentGameSuggestions = [];
    activeGameSuggestionIndex = -1;
    document.getElementById('gameLookupResult').innerHTML = '';
    document.getElementById('deals').classList.remove('searching');
}

// Load deals with real API
async function loadDeals(page = 1, forceRefresh = false, requestedSort = null, requestedSearch = null) {
    if (dealsLoading) return;

    const requestedPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const sort = requestedSort || document.getElementById('dealsSort').value || currentDealsSort;
    const search = String(requestedSearch ?? document.getElementById('dealsSearchInput')?.value ?? '').trim().toLowerCase();
    const cacheKey = `${sort}:${search}:${requestedPage}`;
    const cachedPage = dealsPageCache.get(cacheKey);

    if (!forceRefresh && cachedPage && Date.now() - cachedPage.timestamp < dealsPageCacheTtl) {
        currentPage = requestedPage;
        currentDealsSort = sort;
        currentDealsSearch = search;
        currentDeals = cachedPage.deals;
        dealsHasMore = cachedPage.hasMore;
        failedDealsRequest = null;
        displayDeals(currentDeals);
        setDealsPageStatus('');
        updateDealsPaginationControls();
        return;
    }

    dealsLoading = true;
    const requestId = ++dealsRequestId;
    const controller = new AbortController();
    dealsRequestController = controller;
    updateDealsPaginationControls();
    setDealsPageStatus(search ? `Searching deals, page ${requestedPage}...` : `Loading page ${requestedPage}...`);

    const dealsList = document.getElementById('dealsList');
    if (currentDeals.length === 0) {
        dealsList.innerHTML = '<div class="loading-deals"><div class="spinner"></div><p>Loading deals...</p></div>';
    }

    try {
        const result = await fetchDealsWithCredentials(requestedPage, sort, search, controller.signal);
        if (controller.signal.aborted || requestId !== dealsRequestId) return;

        if (requestedPage > 1 && result.deals.length === 0) {
            dealsHasMore = false;
            setDealsPageStatus('No more deals are available.');
            updateDealsPaginationControls();
            return;
        }

        currentPage = requestedPage;
        currentDealsSort = sort;
        currentDealsSearch = search;
        currentDeals = result.deals;
        dealsHasMore = result.hasMore;
        failedDealsRequest = null;
        cacheDealsPage(cacheKey, currentDeals, dealsHasMore);
        displayDeals(currentDeals);
        setDealsPageStatus('');
    } catch (error) {
        if (controller.signal.aborted || requestId !== dealsRequestId) return;
        console.error('Error loading deals:', error);
        failedDealsRequest = { page: requestedPage, sort, search };
        document.getElementById('dealsSort').value = currentDealsSort;
        setDealsPageStatus('');
    } finally {
        if (requestId === dealsRequestId) {
            dealsLoading = false;
            dealsRequestController = null;
            updateDealsPaginationControls();
        }
    }
}

// Fetch real deals from Steam, Epic Games using serverless API (CORS-safe)
async function fetchDealsWithCredentials(page, sort, search, signal) {
    const params = new URLSearchParams({
        page: String(page),
        limit: String(dealsPerPage),
        sort
    });
    if (search) params.set('search', search);
    const response = await fetch(`${API_CONFIG.DEALS_URL}?${params}`, { signal });
    const apiResponse = await response.json();

    if (!response.ok || !apiResponse.success) {
        throw new Error(apiResponse.error || `API returned ${response.status}`);
    }

    const deals = (apiResponse.deals || []).map(deal => {
        const salePrice = Number(deal.salePrice) || 0;
        const normalPrice = Number(deal.normalPrice) || 0;
        return {
            title: deal.title,
            price: salePrice,
            originalPrice: normalPrice,
            discountPercent: Number(deal.discount) || 0,
            discount: Number(deal.discount) || 0,
            expirationDate: deal.expiry,
            type: deal.type,
            store: deal.store,
            source: deal.source,
            platform: 'steam',
            storeID: '1',
            storeName: deal.store || 'Steam',
            steamAppID: deal.steamAppID,
            steamGameId: deal.steamGameId,
            appId: deal.steamAppID,
            id: deal.steamAppID,
            storeUrl: deal.url || getSteamUrl({ steamAppID: deal.steamAppID, title: deal.title }),
            dealUrl: deal.url || getSteamUrl({ steamAppID: deal.steamAppID, title: deal.title })
        };
    });

    return { deals, hasMore: apiResponse.hasMore === true };
}

function cacheDealsPage(key, pageDeals, hasMore) {
    if (dealsPageCache.size >= 15 && !dealsPageCache.has(key)) {
        const oldestKey = dealsPageCache.keys().next().value;
        dealsPageCache.delete(oldestKey);
    }

    dealsPageCache.set(key, {
        deals: pageDeals,
        hasMore,
        timestamp: Date.now()
    });
}

function setDealsPageStatus(message, isError = false) {
    const status = document.getElementById('dealsPageStatus');
    if (!status) return;

    status.hidden = true;
    status.classList.remove('error');
    status.textContent = '';
}

function retryDealsPage() {
    if (!failedDealsRequest || dealsLoading) return;
    loadDeals(failedDealsRequest.page, true, failedDealsRequest.sort, failedDealsRequest.search);
}

function updateDealsPaginationControls() {
    const previousButton = document.getElementById('dealsPreviousPage');
    const nextButton = document.getElementById('dealsNextPage');
    const pageIndicator = document.getElementById('dealsPageIndicator');
    const sortSelect = document.getElementById('dealsSort');

    const filterPending = dealsSearchTimeout !== null;
    if (previousButton) previousButton.disabled = dealsLoading || filterPending || currentPage <= 1;
    if (nextButton) nextButton.disabled = dealsLoading || filterPending || !dealsHasMore;
    if (pageIndicator) pageIndicator.textContent = `Page ${currentPage}`;
    if (sortSelect) sortSelect.disabled = dealsLoading || filterPending;
}

// Fetch Steam store featured games/deals
async function fetchSteamStoreDeals() {
    try {
        const steamFeaturedUrl = 'https://store.steampowered.com/api/featured/';
        const response = await fetch(steamFeaturedUrl);
        
        if (!response.ok) {
            console.warn('Steam API returned:', response.status);
            return [];
        }
        
        const data = await response.json();
        console.log('Steam API response:', data);
        
        // Handle different Steam API response formats
        let games = [];
        
        // Try different possible data structures
        if (data.featured_win && Array.isArray(data.featured_win)) {
            games = data.featured_win;
            console.log('Using featured_win format, found', games.length, 'games');
        } else if (data.featured && Array.isArray(data.featured)) {
            games = data.featured;
            console.log('Using featured format, found', games.length, 'games');
        } else if (data.specials && Array.isArray(data.specials)) {
            games = data.specials;
            console.log('Using specials format, found', games.length, 'games');
        } else if (Array.isArray(data)) {
            games = data;
            console.log('Using array format, found', games.length, 'games');
        } else {
            console.warn('Unknown Steam API format:', Object.keys(data));
            return [];
        }
        
        if (!Array.isArray(games) || games.length === 0) {
            console.warn('No games found in Steam API response');
            return [];
        }
        
        console.log('Processing', games.length, 'Steam games for deals');
        
        // Transform Steam data to our format
        const deals = games.slice(0, 50).filter(game => {
            // Filter for games that are actually on sale with discount
            const hasDiscount = game && game.id && game.name && 
                               game.discount_percent && game.discount_percent > 0 &&
                               game.original_price && game.original_price > 0;
            return hasDiscount;
        }).map(game => {
            const finalPrice = game.final_price || (game.original_price * (1 - game.discount_percent / 100));
            
            // Apply FIX 1: Check for real discount
            let discountPercent = game.discount_percent || 0;
            if (!hasRealSteamDiscount({ steamPrice: { initial: game.original_price, final: finalPrice } })) {
                discountPercent = 0;
            }
            
            return {
                id: game.id,
                title: game.name,
                price: finalPrice / 100,
                originalPrice: game.original_price / 100,
                discount: discountPercent,
                discountPercent: discountPercent,
                platform: 'steam',
                metacriticScore: 80,
                thumb: game.header_image || '',
                storeUrl: getSteamUrl({ id: game.id, title: game.name }),
                dealUrl: getSteamUrl({ id: game.id, title: game.name }),
                releaseDate: 2020,
                expirationDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                dealRating: 8.0,
                storeName: 'Steam',
                storeID: '1'
            };
        });
        
        console.log('Returning', deals.length, 'Steam deals after filtering');
        return deals;
        
    } catch (error) {
        console.warn('Steam fetch error:', error);
        return [];
    }
}

// fetchEpicGamesDeals removed in Steam-only build (Epic support not included)
async function fetchEpicGamesDeals() {
    return []; // Stub kept for compatibility
}

// fetchGOGDeals removed in Steam-only build (GOG support not included)
async function fetchGOGDeals() {
    return []; // Stub kept for compatibility
}

// Helper to get store name from store ID
// Get store icon/logo
function getStoreIcon(storeName) {
    // Only Steam icon is used in this simplified build
    if (storeName && storeName.toLowerCase().includes('steam')) {
        return '<i class="fab fa-steam"></i>';
    }
    return '<i class="fas fa-shopping-cart"></i>';
}

function getStoreName(storeID) {
    // Only Steam is supported in this trimmed build
    const stores = {
        '1': 'Steam'
    };
    // Convert to string in case it comes as a number
    const storeKey = String(storeID);
    return stores[storeKey] || 'Store';

}
// Calculate expiration date (simulated - typically 30 days from deal creation)
function calculateExpirationDate(dealID) {
    const now = new Date();
    const expirationDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
    return expirationDate;
}

// Sample data as fallback
async function loadSampleDeals() {
    return [];
}

// Display only the deals returned for the current server page.
function displayDeals(deals) {
    const dealsList = document.getElementById('dealsList');
    
    if (!deals || deals.length === 0) {
        dealsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <p>No deals found</p>
                <p class="subtext">Try refreshing or adjusting your search</p>
            </div>
        `;
        return;
    }

    const dealsHTML = deals.map(deal => {
        return `
            <div class="deal-card">
                <div class="deal-header">
                    <h3 class="deal-title">${escapeHtml(deal.title)}</h3>
                    <div class="deal-badges">
                        <span class="badge">-${deal.discountPercent}%</span>
                        ${deal.rating ? `<span class="badge">⭐ ${deal.rating}</span>` : ''}
                    </div>
                </div>
                
                <div class="deal-body">
                    <div class="deal-prices">
                        <div class="price-item">
                            <div class="price-label">Current</div>
                            <div class="price-value">$${deal.price.toFixed(2)}</div>
                            ${deal.originalPrice > deal.price ? `<div class="original-price">Was $${deal.originalPrice.toFixed(2)}</div>` : ''}
                        </div>
                        <div class="price-item">
                            <div class="price-label">Save</div>
                            <div class="price-value" style="color: var(--success);">$${(deal.originalPrice - deal.price).toFixed(2)}</div>
                            <div class="discount-label">${deal.discountPercent}% off</div>
                        </div>
                    </div>
                </div>
                
                <div class="deal-footer">
                    <button class="deal-link" data-quick-add-title="${escapeHtml(deal.title)}" data-quick-add-price="${deal.price}" title="Add to calculator">
                        <i class="fas fa-plus"></i> Add to Calculator
                    </button>
                    <a href="${escapeHtml(deal.storeUrl)}" target="_blank" rel="noopener" class="deal-link" style="background: var(--success); margin-top: 8px; display: block; text-align: center;">
                        <i class="fas fa-external-link-alt"></i> View Deal
                    </a>
                </div>
            </div>
        `;
    }).join('');

    dealsList.innerHTML = dealsHTML;
    dealsList.querySelectorAll('[data-quick-add-title]').forEach(button => {
        button.addEventListener('click', () => {
            quickAddToCalculator(Number(button.dataset.quickAddPrice), button.dataset.quickAddTitle);
        });
    });
}

function goToPage(direction) {
    if (dealsLoading || ![-1, 1].includes(direction)) return;
    const nextPage = currentPage + direction;
    if (nextPage < 1 || (direction > 0 && !dealsHasMore)) return;
    loadDeals(nextPage);
}

// Sort order is applied by the API; changing it starts at page one.
function sortDeals(sortBy) {
    if (!['deal', 'discount', 'price'].includes(sortBy) || dealsLoading) return;
    loadDeals(1);
}

// Filter giveaways by platform - show only $0 games for Steam, all deals for All
function filterDeals(platform) {
    const allDeals = document.querySelectorAll('.deal-item');
    
    const storeIDMap = {
        'steam': '1'
    };
    
    const storeID = storeIDMap[platform];
    
    console.log('Filtering giveaways by platform:', platform, 'storeID:', storeID, 'total giveaways:', allDeals.length);
    
    let visibleCount = 0;
    allDeals.forEach(deal => {
        const price = parseFloat(deal.dataset.price);
        const isFree = price === 0;
        
        if (platform === 'all') {
            // Show all deals for "All Giveaways"
            deal.style.display = 'block';
            visibleCount++;
        } else {
            // For "Steam Giveaways", show only $0 games from Steam
            if (isFree && deal.dataset.storeid === storeID) {
                deal.style.display = 'block';
                visibleCount++;
            } else {
                deal.style.display = 'none';
            }
        }
    });
    
    console.log('Filter result: showing', visibleCount, platform === 'all' ? 'deals' : 'giveaways ($0 games)');
}

// Refresh deals
function refreshDeals() {
    clearTimeout(dealsSearchTimeout);
    dealsSearchTimeout = null;
    if (dealsLoading) {
        showNotification("Already loading deals...", "warning");
        return;
    }
    for (const key of dealsPageCache.keys()) {
        if (key.startsWith(`${currentDealsSort}:`)) dealsPageCache.delete(key);
    }
    loadDeals(1, true);
}

// Quick add deal price to calculator
function quickAddToCalculator(price, gameName = '') {
    // Find first empty game input
    const inputs = document.querySelectorAll("#gameInputs input");
    for (const input of inputs) {
        if (!input.value || input.value === '0' || input.value === '0.00') {
            setCalculatorGameName(input, gameName);
            input.value = price.toFixed(2);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.style.borderColor = "var(--success)";
            input.style.boxShadow = "0 0 0 2px rgba(46, 204, 113, 0.1)";
            
            // Focus the next input
            const nextIndex = parseInt(input.dataset.index) + 1;
            const nextInput = document.getElementById(`gamePrice${nextIndex}`);
            if (nextInput) {
                nextInput.focus();
                nextInput.select();
            }
            
            showNotification(`Added $${price.toFixed(2)} to calculator!`, "success");
            return;
        }
    }
    
    // If no empty inputs, add a new game
    const gameCountInput = document.getElementById('gameCount');
    const currentCount = parseInt(gameCountInput.value) || 1;
    if (currentCount < 50) {
        gameCountInput.value = currentCount + 1;
        updateGameFields();
        
        // Wait for new input to be created
        setTimeout(() => {
            const newInput = document.querySelector(`#gameInputs input[data-index="${currentCount}"]`);
            if (newInput) {
                setCalculatorGameName(newInput, gameName);
                newInput.value = price.toFixed(2);
                newInput.dispatchEvent(new Event('input', { bubbles: true }));
                newInput.style.borderColor = "var(--success)";
                newInput.style.boxShadow = "0 0 0 2px rgba(46, 204, 113, 0.1)";
                showNotification(`Added $${price.toFixed(2)} to calculator!`, "success");
            }
        }, 100);
    } else {
        showNotification("Maximum 50 games reached!", "warning");
    }
}

// Dashboard Navigation - Scroll to Section
function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Toggle Settings Panel
function toggleSettings() {
    const settingsPanel = document.getElementById('settingsPanel');
    settingsPanel.classList.toggle('active');
}

// Open Steam game by fetching URL
function openSteamGame(gameName) {
    // Open Steam search directly (no CORS issues)
    if (gameName && gameName.trim()) {
        window.open(
            `https://store.steampowered.com/search/?term=${encodeURIComponent(gameName)}`,
            '_blank'
        );
    }
}

