// script.js - Fixed version with all issues resolved
// API Configuration is loaded from config.js
// corsProxyFetch helper is also loaded from config.js

let calculationHistory = JSON.parse(localStorage.getItem('steamCalculatorHistory')) || [];
let currentCalculation = null;
let autoCalculateTimeout = null;
let darkMode = localStorage.getItem('darkMode') === 'true';
let deals = []; // Initialize deals array to prevent ReferenceError

// Deals variables
let currentDeals = [];
let displayedDeals = []; // Track currently displayed deals (for pagination)
let dealsLoading = false;

// Cache for deals data
let dealsCache = {
    data: [],
    timestamp: 0,
    ttl: 3600000 // 1 hour cache
};

// Search cache
let gameSearchCache = [];
let searchTimeout = null;
let currentGameSuggestions = []; // Store current suggestions for Enter key display

// Pagination
let currentPage = 1;
const dealsPerPage = 12;



// Initialize the calculator
document.addEventListener('DOMContentLoaded', function() {
    // Apply dark mode if enabled
    if (darkMode) {
        document.body.classList.add('dark-mode');
    }
    
    updateGameFields();
    loadHistory();
    setupEventListeners();
    initializeTaxPresets();
    calculateTotal();
    initializeDealsFilters();
    loadDeals();
    
    // Update current tax display
    updateTaxDisplay();
    updateTotalGamesCount();
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
        // Enforce limits: minimum 0, maximum 20
        if (value < 0) value = 0;
        if (value > 20) value = 20;
        this.value = value;
        // Update slider to match input
        taxRateSlider.value = value;
        // Remove active class from all preset buttons when input is changed
        document.querySelectorAll('.preset-btn').forEach(btn => 
            btn.classList.remove('active'));
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
    
    // Setup tax preset buttons
    document.querySelectorAll('.preset-btn').forEach(button => {
        button.addEventListener('click', function() {
            const taxRate = parseFloat(this.dataset.tax);
            taxRateSlider.value = taxRate;
            taxRateInput.value = taxRate;
            
            // Update active state
            document.querySelectorAll('.preset-btn').forEach(btn => 
                btn.classList.remove('active'));
            this.classList.add('active');
            
            updateTaxDisplay();
            triggerAutoCalculate();
        });
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
    // Set default active preset
    const defaultPreset = document.querySelector('.tax-preset[data-tax="8"]');
    if (defaultPreset) {
        defaultPreset.classList.add('active');
    }
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

function updateGameFields() {
    const count = parseInt(document.getElementById("gameCount").value) || 1;
    const container = document.getElementById("gameInputs");
    
    // Get current values before clearing
    const currentValues = [];
    const currentInputs = container.querySelectorAll('input');
    currentInputs.forEach(input => {
        currentValues.push(input.value);
    });
    
    container.innerHTML = "";

    for (let i = 0; i < count; i++) {
        const card = document.createElement("div");
        card.className = "game-input-card";
        card.dataset.index = i;
        
        const label = document.createElement("label");
        label.textContent = `Game ${i + 1}`;
        label.htmlFor = `gamePrice${i}`;
        
        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "decimal";
        input.pattern = "[0-9]*\\.?[0-9]*";
        input.value = i < currentValues.length ? currentValues[i] : "";
        input.id = `gamePrice${i}`;
        input.placeholder = `Enter price`;
        input.dataset.index = i;
        
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
            removeBtn.onclick = function() {
                const currentCount = parseInt(document.getElementById("gameCount").value);
                if (currentCount > 1) {
                    document.getElementById("gameCount").value = currentCount - 1;
                    updateGameFields();
                }
            };
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
                name: `Game ${parseInt(input.dataset.index) + 1}`
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
        
        setTimeout(() => {
            element.classList.remove('value-updating');
        }, 300);
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

function saveToHistory() {
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
    
    showNotification("Calculation saved to history!", "success");
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
                }
            });
        }
        
        // Restore tax rate and input (taxRate saved as percent)
        const restoredTax = cachedData.taxRate;
        document.getElementById('taxRateSlider').value = restoredTax;
        document.getElementById('taxRateInput').value = restoredTax;
        // Update preset active state
        document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.tax-preset[data-tax="${restoredTax}"]`);
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
                }
            });
        }
        
        const restoredTax = item.taxRate;
        document.getElementById('taxRateSlider').value = restoredTax;
        document.getElementById('taxRateInput').value = restoredTax;
        document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.tax-preset[data-tax="${restoredTax}"]`);
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
    
    // Recalculate
    calculateTotal();
    
    showNotification('Calculation restored', 'success');


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
        document.querySelectorAll('.tax-preset').forEach(btn => 
            btn.classList.remove('active'));
        document.querySelector('.tax-preset[data-tax="8"]').classList.add('active');
        
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
    document.body.classList.toggle('dark-mode');
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
            
            // If deals are already loaded, just apply the filter
            if (currentDeals.length > 0 && !dealsLoading) {
                filterDeals(platform);
            } else if (!dealsLoading) {
                // If deals haven't loaded yet, load them
                loadDeals(true);
            } else {
                showNotification("Already loading deals...", "warning");
            }
        });
    });
    
    // Setup sort dropdown
    const dealsSort = document.getElementById('dealsSort');
    if (dealsSort) {
        dealsSort.addEventListener('change', function() {
            sortDeals(this.value);
        });
    }
    
    // Setup game search
    const gameSearchInput = document.getElementById('gameSearchInput');
    if (gameSearchInput) {
        gameSearchInput.addEventListener('input', function(e) {
            handleGameSearch(e.target.value);
        });
        
        gameSearchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                // Close suggestions
                document.getElementById('searchSuggestions').innerHTML = '';
            }
        });
    }
}

// Handle game search with autocomplete
function handleGameSearch(query) {
    clearTimeout(searchTimeout);
    const suggestionsDiv = document.getElementById('searchSuggestions');
    
    if (!query.trim()) {
        suggestionsDiv.innerHTML = '';
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        try {
            const suggestions = await fetchGameSuggestions(query);
            displaySearchSuggestions(suggestions, query);
        } catch (error) {
            console.error('Search error:', error);
        }
    }, 300);
}

// Fetch game suggestions from RAWG API
async function fetchGameSuggestions(query) {
    try {
        const rawgUrl = appConfig.getRawgUrl();
        const rawgKey = appConfig.getRawgApiKey();
        
        if (!rawgKey || rawgKey === '') {
            console.warn('RAWG API key not configured. Please set RAWG_API_KEY in .env');
            return [];
        }
        
        const response = await fetch(
            `${rawgUrl}/games?search=${encodeURIComponent(query)}&page_size=8&key=${rawgKey}`
        );
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        // Map RAWG response to expected format
        return (data.results || []).map(game => ({
            id: game.id,
            title: game.name,
            displayTitle: game.name,
            image: game.background_image,
            rating: game.rating,
            platforms: game.platforms || []
        }));
    } catch (error) {
        console.error('RAWG game suggestion error:', error);
        return [];
    }
}

// Display search suggestions
function displaySearchSuggestions(games, query) {
    const suggestionsDiv = document.getElementById('searchSuggestions');
    
    // Store current suggestions for Enter key handling
    currentGameSuggestions = games || [];
    
    if (!games || games.length === 0) {
        suggestionsDiv.innerHTML = `
            <div class="search-suggestion-item" style="text-align: center; color: var(--text-tertiary);">
                <i class="fas fa-search"></i>
                <p>No games found for "${query}"</p>
            </div>
        `;
        return;
    }
    
    suggestionsDiv.innerHTML = games.map((game, index) => {
        const gameTitle = game.displayTitle || game.title || game.name;
        const gameID = game.id || index;
        const gameName = gameTitle.replace(/'/g, "\\'");
        const gameImage = game.image || '';
        const rating = game.rating ? `★${game.rating.toFixed(1)}` : '';
        
        return `
            <div class="search-suggestion-item" onclick="lookupGamePrices('${gameName}', ${gameID})">
                ${gameImage ? `<img src="${gameImage}" alt="${gameTitle}" class="search-suggestion-thumbnail">` : `<div class="search-suggestion-thumbnail" style="background: var(--bg-primary);"><i class="fas fa-image"></i></div>`}
                <div class="search-suggestion-info">
                    <div class="search-suggestion-name">${gameTitle}</div>
                    ${rating ? `<div class="search-suggestion-meta">${rating}</div>` : `<div class="search-suggestion-meta">Click to view prices</div>`}
                </div>
            </div>
        `;
    }).join('');
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
        const rating = game.rating ? `★${game.rating.toFixed(1)}` : 'No rating';
        const gameName = gameTitle.replace(/'/g, "\\'");
        const gameID = game.id || 0;
        
        return `
            <div class="deal-card">
                <div class="deal-header">
                    <h3 class="deal-title">${gameTitle}</h3>
                </div>
                
                ${gameImage ? `<div class="deal-game-image" style="background-image: url('${gameImage}'); background-size: cover; background-position: center; height: 150px; width: 100%;"></div>` : ''}
                
                <div class="deal-body">
                    <div class="deal-info-row">
                        <span class="info-label"><i class="fas fa-star"></i> Rating</span>
                        <span class="info-value">${rating}</span>
                    </div>
                    <div class="deal-info-row">
                        <span class="info-label"><i class="fas fa-info-circle"></i> Source</span>
                        <span class="info-value">RAWG Database</span>
                    </div>
                </div>
                
                <div class="deal-footer">
                    <button class="deal-link" onclick="lookupGamePrices('${gameName}', ${gameID})">
                        <i class="fas fa-search"></i> View Prices
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    dealsList.innerHTML = htmlContent;
}

// Lookup game prices (when clicking suggestion)
async function lookupGamePrices(gameName, gameID) {
    const searchInput = document.getElementById('gameSearchInput');
    if (searchInput) {
        searchInput.value = gameName;
    }
    
    // Hide suggestions
    document.getElementById('searchSuggestions').innerHTML = '';
    
    // Show loading - use searchResultsList if it exists
    const resultsList = document.getElementById('searchResultsList') || document.getElementById('dealsList');
    resultsList.innerHTML = `
        <div class="loading-deals">
            <div class="spinner"></div>
            <p>Looking up game details and prices for "${gameName}"...</p>
        </div>
    `;
    
    try {
        // Fetch game details from RAWG
        const rawgUrl = appConfig.getRawgUrl();
        const rawgKey = appConfig.getRawgApiKey();
        
        if (!rawgKey) {
            throw new Error('RAWG API key not configured');
        }
        
        const gameDetailsResponse = await fetch(
            `${rawgUrl}/games/${gameID}?key=${rawgKey}`
        );
        
        if (!gameDetailsResponse.ok) throw new Error('Failed to fetch game details');
        const gameDetails = await gameDetailsResponse.json();
        
        // Fetch prices from backend deals API (includes Steam from CheapShark)
        let pricesData = [];
        
        try {
            // Call Steam search endpoint via backend (server can fetch Steam directly)
            const searchResponse = await fetch(`/api/steam-search?gameName=${encodeURIComponent(gameName)}`);
            const searchData = await searchResponse.json();
            
            console.log(`[GAME LOOKUP] Status: ${searchResponse.status}`);
            console.log(`[GAME LOOKUP] Response:`, searchData);
            
            if (searchResponse.ok) {
                if (searchData.titleMismatch) {
                    console.warn(`[GAME LOOKUP] Title mismatch - returned "${searchData.title}" for search "${gameName}"`);
                    console.warn(`[GAME LOOKUP] Consider using fallback: ${searchData.searchFallbackUrl}`);
                }
                
                if (searchData.prices && searchData.prices.length > 0) {
                    pricesData = searchData.prices;
                    console.log(`[GAME LOOKUP] Found prices for ${searchData.title}`);
                }
            } else {
                console.warn(`[GAME LOOKUP] Backend error: ${searchData.error}`);
            }
        } catch (e) {
            console.warn('Could not fetch game prices:', e);
        }
        
        console.log(`[LOOKUP] Found ${pricesData.length} prices for display`);
        displayGamePricesLookup(gameName, gameID, gameDetails, pricesData);
        
    } catch (error) {
        console.error('Price lookup error:', error);
        resultsList.innerHTML = `
            <div class="empty-history">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Couldn't fetch details for "${gameName}"</p>
                <p class="subtext">You can add this game and enter the price manually</p>
                <button class="deals-btn" onclick="addGameManual('${gameName}')" style="margin-top: 15px;">
                    <i class="fas fa-plus-circle"></i>
                    Add "${gameName}" to Calculator
                </button>
                <button class="deals-btn" onclick="clearGameSearch()" style="margin-top: 10px;">
                    <i class="fas fa-redo"></i>
                    Clear Search
                </button>
            </div>
        `;
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
        displayGamePricesLookup(gameName, null, null, allPrices);
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

function displayGamePricesLookup(gameName, gameID, gameDetails, pricesData) {
    const resultsList = document.getElementById('dealsList');

    // pricesData is expected to be an array of Steam price objects from /api/steam-search
    if (!pricesData || pricesData.length === 0) {
        resultsList.innerHTML = `
            <div class="deal-card">
                <div class="deal-header">
                    <h3 class="deal-title">${gameName}</h3>
                </div>
                <div class="deal-body" style="text-align: center; padding: var(--spacing-lg);">
                    <p style="margin: 0; color: var(--text-tertiary);">
                        <i class="fas fa-info-circle"></i> Price data unavailable
                    </p>
                </div>
                <div class="deal-footer">
                    <button class="deal-link" onclick="addGameManual('${gameName}')">
                        <i class="fas fa-plus"></i> Add to Calculator
                    </button>
                </div>
            </div>
        `;
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
                    <h3 class="deal-title">${gameName}</h3>
                </div>
                <div class="deal-body" style="text-align: center; padding: var(--spacing-lg);">
                    <p style="margin: 0; color: var(--text-tertiary);">
                        <i class="fas fa-info-circle"></i> Price data unavailable
                    </p>
                </div>
                <div class="deal-footer">
                    <button class="deal-link" onclick="addGameManual('${gameName}')">
                        <i class="fas fa-plus"></i> Add to Calculator
                    </button>
                </div>
            </div>
        `;
        return;
    }

    const savings = (best.regular || best.original_price || 0) - best.price;

    resultsList.innerHTML = `
        <div class="deal-card">
            <div class="deal-header">
                <h3 class="deal-title">${gameName}</h3>
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
                <button class="deal-link" onclick="addGameWithPrice('${gameName}', ${best.price})">
                    <i class="fas fa-plus"></i> Add to Calculator
                </button>
                <a href="${best.url}" target="_blank" class="deal-link" style="background: var(--success); margin-top: 8px; display: block; text-align: center;">
                    <i class="fas fa-external-link-alt"></i> Visit Steam
                </a>
            </div>
        </div>
    `;
}

// Add game manually without a deal
function addGameManual(gameName) {
    const inputs = document.querySelectorAll("#gameInputs input");
    let added = false;
    
    for (const input of inputs) {
        if (!input.value || input.value === '0' || input.value === '0.00') {
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
                    newInput.focus();
                    newInput.select();
                    showNotification(`Added "${gameName}" - Enter price manually`, "info");
                }
            }, 100);
        } else {
            showNotification("Maximum 50 games reached!", "warning");
        }
    }
    
    clearGameSearch();
}

// Add game with specific price
function addGameWithPrice(gameName, price) {
    // Find first empty game input
    const inputs = document.querySelectorAll("#gameInputs input");
    let added = false;
    
    for (const input of inputs) {
        if (!input.value || input.value === '0' || input.value === '0.00') {
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
    
    clearGameSearch();
}

// Clear game search
function clearGameSearch() {
    const searchInput = document.getElementById('gameSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    document.getElementById('searchSuggestions').innerHTML = '';
    
    // Reload all deals
    if (currentDeals.length > 0) {
        displayDeals(currentDeals);
        sortDeals(document.getElementById('dealsSort').value);
    } else {
        loadDeals();
    }
}

// Load deals with real API
async function loadDeals(forceRefresh = false) {
    if (dealsLoading) return;
    
    dealsLoading = true;
    const dealsList = document.getElementById('dealsList');
    dealsList.innerHTML = `
        <div class="loading-deals">
            <div class="spinner"></div>
            <p>Loading current deals...</p>
        </div>
    `;
    
    try {
        // Check cache first
        const now = Date.now();
        if (!forceRefresh && dealsCache.data.length > 0 && 
            (now - dealsCache.timestamp) < dealsCache.ttl) {
            currentDeals = dealsCache.data;
            displayDeals(currentDeals);
            sortDeals(document.getElementById('dealsSort').value);
            showNotification("Deals loaded from cache!", "success");
            return;
        }
        
        console.log('Fetching fresh deals data...');
        
        // Try to use real API with your credentials
        let deals = await fetchDealsWithCredentials();
        
        // If API fails, fall back to sample data
        if (!deals || deals.length === 0) {
            console.log('API failed, using sample data');
            deals = await loadSampleDeals();
        }
        
        // Remove duplicate deals and keep the best discount
        deals = dedupeDeals(deals);
        console.log(`Deduped deals: ${deals.length} unique deals after removing duplicates`);
        
        // Filter out fake/stale discounts - ensure actual price is less than original
        deals = deals.filter(d => {
            const salePrice = d.price || 0;
            const normalPrice = d.originalPrice || d.normalPrice || 0;
            const discount = d.discountPercent || d.discount || 0;
            
            // Keep deals where: price < original AND discount > 0
            // Also filter out absurdly high prices (max $1000)
            return salePrice < normalPrice && discount > 0 && salePrice < 1000 && normalPrice < 1000;
        });
        console.log(`Filtered deals: ${deals.length} deals after removing fake discounts and invalid prices`);
        
        // Cache the results
        currentDeals = deals;
        dealsCache = {
            data: deals,
            timestamp: now,
            ttl: 3600000
        };
        
        displayDeals(deals);
        
        // Reapply current filter after displaying deals
        const activeFilterBtn = document.querySelector('.deals-filter-btn.active');
        if (activeFilterBtn) {
            const platform = activeFilterBtn.dataset.platform;
            filterDeals(platform);
        }
        
        sortDeals(document.getElementById('dealsSort').value);
        
        showNotification(`Loaded ${deals.length} current deals!`, "success");
        
    } catch (error) {
        console.error('Error loading deals:', error);
        dealsList.innerHTML = `
            <div class="empty-history">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Failed to load deals</p>
                <p class="subtext">${error.message || 'Please try again later'}</p>
            </div>
        `;
        showNotification("Failed to load deals", "danger");
    } finally {
        dealsLoading = false;
    }
}

// Fetch real deals from Steam, Epic Games using serverless API (CORS-safe)
async function fetchDealsWithCredentials() {
    try {
        console.log('📡 Fetching deals via serverless API...');

        const response = await fetch('/api/deals');

        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        const apiResponse = await response.json();

        if (!apiResponse.success) {
            throw new Error(apiResponse.error || 'API returned error');
        }

        console.log(`✅ Loaded ${apiResponse.count} deals`);

        if (!apiResponse.deals || apiResponse.deals.length === 0) {
            console.log('⚠️ No deals available, showing sample deals');
            showNotification(
                'No deals available at the moment',
                'warning'
            );
            return [];
        }

        // Transform API response to client-side format
        return apiResponse.deals.map(deal => {
            // Ensure prices are in dollars, not cents
            // If price > 100, it's likely in cents (e.g., 4990 cents = $49.90)
            let salePrice = parseFloat(deal.salePrice) || 0;
            let normalPrice = parseFloat(deal.normalPrice) || 0;
            
            if (salePrice > 100) {
                salePrice = salePrice / 100;
            }
            if (normalPrice > 100) {
                normalPrice = normalPrice / 100;
            }
            
            return {
                // Normalized from API
                title: deal.title,
                price: salePrice,
                originalPrice: normalPrice,
                discountPercent: deal.discount,
                discount: deal.discount,
                expirationDate: deal.expiry, // Unix timestamp (seconds) - will be handled by getExpiryText
                type: deal.type,
                store: deal.store,
                source: deal.source,
                
                // Derived data
                platform: 'steam',
                rating: 4.5,
                storeID: '1',
                storeName: 'Steam',
                
                // IDs
                steamAppID: deal.steamAppID,
                appId: deal.steamAppID,
                id: deal.steamAppID,
                
                // URLs - use getSteamUrl function
                storeUrl: getSteamUrl({ steamAppID: deal.steamAppID, title: deal.title }),
                dealUrl: getSteamUrl({ steamAppID: deal.steamAppID, title: deal.title })
            };
        });

    } catch (error) {
        console.error('❌ Deals fetch error:', error);
        console.log('⚠️ Falling back to empty deals');
        return [];
    }
}

// Fetch Steam store featured games/deals
async function fetchSteamStoreDeals() {
    try {
        const steamFeaturedUrl = 'https://store.steampowered.com/api/featured/';
        const response = await corsProxyFetch(steamFeaturedUrl);
        
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
                rating: 4.5,
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

// Display deals in the list
function displayDeals(deals, resetPage = true) {
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
    
    // Store currently displayed deals for pagination
    displayedDeals = deals;
    
    // Reset to page 1 only when displaying new deals (not when just changing pages)
    if (resetPage) {
        currentPage = 1;
    }
    
    // Calculate pagination
    const totalPages = Math.ceil(deals.length / dealsPerPage);
    const startIndex = (currentPage - 1) * dealsPerPage;
    const endIndex = startIndex + dealsPerPage;
    const paginatedDeals = deals.slice(startIndex, endIndex);
    
    // Create deals HTML
    let dealsHTML = paginatedDeals.map(deal => {
        return `
            <div class="deal-card">
                <div class="deal-header">
                    <h3 class="deal-title">${deal.title}</h3>
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
                    <button class="deal-link" onclick="quickAddToCalculator(${deal.price})" title="Add to calculator">
                        <i class="fas fa-plus"></i> Add to Calculator
                    </button>
                    <a href="${deal.storeUrl}" target="_blank" class="deal-link" style="background: var(--success); margin-top: 8px; display: block; text-align: center;">
                        <i class="fas fa-external-link-alt"></i> View Deal
                    </a>
                </div>
            </div>
        `;
    }).join('');
    
    // Create pagination controls
    let paginationHTML = '';
    if (totalPages > 1) {
        paginationHTML = `
            <div class="pagination">
                <div class="pagination-info">
                    Page <span class="current-page">${currentPage}</span> out of <span class="total-pages">${totalPages}</span>
                </div>
                <div class="pagination-controls">
                    ${currentPage > 1 ? `<button class="pagination-btn" onclick="goToPage(${currentPage - 1})"><i class="fas fa-chevron-left"></i> Prev</button>` : ''}
        `;
        
        // Show page numbers
        const maxPagesToShow = 5;
        const startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
        const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
        
        for (let i = startPage; i <= endPage; i++) {
            if (i === currentPage) {
                paginationHTML += `<button class="pagination-btn active">${i}</button>`;
            } else {
                paginationHTML += `<button class="pagination-btn" onclick="goToPage(${i})">${i}</button>`;
            }
        }
        
        paginationHTML += `
                    ${currentPage < totalPages ? `<button class="pagination-btn" onclick="goToPage(${currentPage + 1})">Next <i class="fas fa-chevron-right"></i></button>` : ''}
                </div>
            </div>
        `;
    }
    
    dealsList.innerHTML = dealsHTML + paginationHTML;
}

// Navigate to a specific page
function goToPage(page) {
    currentPage = page;
    displayDeals(displayedDeals, false);
    // Scroll to deals section
    document.getElementById('dealsList').scrollIntoView({ behavior: 'smooth' });
}

// Sort deals based on selected option
function sortDeals(sortBy) {
    if (!currentDeals || currentDeals.length === 0) return;
    
    let sortedDeals = [...currentDeals];
    
    switch(sortBy) {
        case 'deal':
            // Sort by deal rating (best deals first)
            sortedDeals.sort((a, b) => (b.dealRating || 0) - (a.dealRating || 0));
            break;
        case 'discount':
            // Sort by discount percentage (highest first)
            sortedDeals.sort((a, b) => b.discountPercent - a.discountPercent);
            break;
        case 'price':
            // Sort by actual price (lowest first)
            sortedDeals.sort((a, b) => a.price - b.price);
            break;
        case 'rating':
            // Sort by game rating (highest first)
            sortedDeals.sort((a, b) => b.rating - a.rating);
            break;
        default:
            return;
    }
    
    // Update display with sorted deals
    displayDeals(sortedDeals);
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
    if (dealsLoading) {
        showNotification("Already loading deals...", "warning");
        return;
    }
    // Force refresh by bypassing cache
    loadDeals(true);
}

// Quick add deal price to calculator
function quickAddToCalculator(price) {
    // Find first empty game input
    const inputs = document.querySelectorAll("#gameInputs input");
    for (const input of inputs) {
        if (!input.value || input.value === '0' || input.value === '0.00') {
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

function dedupeDeals(deals) {
  const map = new Map();

  for (const deal of deals) {
    // Use title (normalized) as primary key, appid as secondary
    const titleKey = deal.title ? deal.title.toLowerCase().trim() : '';
    const key = deal.appid || titleKey;

    if (!key) continue; // Skip deals without identifier

    // Keep the BEST discount for each game
    const existingDeal = map.get(key);
    if (!existingDeal) {
      map.set(key, deal);
    } else {
      const existingDiscount = existingDeal.discountPercent || existingDeal.discount || 0;
      const newDiscount = deal.discountPercent || deal.discount || 0;
      // Keep the deal with higher discount
      if (newDiscount > existingDiscount) {
        map.set(key, deal);
      } else if (newDiscount === existingDiscount && deal.price < existingDeal.price) {
        // If same discount, keep the cheaper one
        map.set(key, deal);
      }
    }
  }

  return Array.from(map.values());
}
