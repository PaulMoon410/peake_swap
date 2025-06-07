// script.js - Handles the frontend logic for atomic swap UI (Keychain & Hivesigner DEX version)

// List of Hive Engine API endpoints (primary and backups)
const HIVE_ENGINE_APIS = [
    'https://peake-swap.onrender.com/he-proxy'
];

// Helper: Try all APIs in order until one succeeds (with CORS proxy fallback)
const CORS_PROXY = 'https://corsproxy.io/?';
async function fetchWithBackups(options) {
    // Try direct endpoints first
    for (let i = 0; i < HIVE_ENGINE_APIS.length; i++) {
        try {
            const res = await fetch(HIVE_ENGINE_APIS[i], options);
            if (res.ok) return await res.json();
        } catch (e) {}
    }
    // If all direct fail, try with CORS proxy
    for (let i = 0; i < HIVE_ENGINE_APIS.length; i++) {
        try {
            const res = await fetch(CORS_PROXY + HIVE_ENGINE_APIS[i], options);
            if (res.ok) return await res.json();
        } catch (e) {}
    }
    return null;
}

async function fetchSwapHiveRate(token) {
    // Try buyBook (best ask)
    try {
        const data = await fetchWithBackups({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'find',
                params: {
                    contract: 'market',
                    table: 'buyBook',
                    query: { symbol: token, baseSymbol: 'SWAP.HIVE' },
                    limit: 1,
                    indexes: [{ index: 'price', descending: true }]
                }
            })
        });
        if (data && data.result && data.result.length > 0 && data.result[0].price && !isNaN(data.result[0].price)) {
            return parseFloat(data.result[0].price);
        }
    } catch (e) {}
    // Try metrics as fallback
    try {
        const data = await fetchWithBackups({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'findOne',
                params: {
                    contract: 'market',
                    table: 'metrics',
                    query: { symbol: token }
                }
            })
        });
        if (data && data.result && data.result.lastPrice && !isNaN(data.result.lastPrice)) {
            return parseFloat(data.result.lastPrice);
        }
    } catch (e) {}
    return null;
}

// --- UI Rate Display Logic (modified) ---
async function updateRateDisplay() {
    const token = document.getElementById('hiveToken').value;
    const tokenAmount = parseFloat(document.getElementById('hiveAmount').value);
    const rateDisplay = document.getElementById('rateDisplay');
    if (tokenAmount > 0) {
        const swapHiveRate = await fetchSwapHiveRate(token);
        if (swapHiveRate) {
            const pekAmount = tokenAmount * swapHiveRate;
            rateDisplay.innerHTML = `Estimated: <b>${pekAmount.toFixed(6)} PEK</b> for <b>${tokenAmount} ${token}</b><br><span style='font-size:0.95em;color:#fff;'>Final swap rate is determined by the market at the time of each transaction.</span>`;
        } else {
            rateDisplay.textContent = 'Unable to fetch live SWAP.HIVE rate.';
        }
    } else {
        rateDisplay.textContent = '';
    }
}
document.getElementById('hiveAmount').addEventListener('input', updateRateDisplay);
document.getElementById('hiveToken').addEventListener('change', updateRateDisplay);
window.addEventListener('DOMContentLoaded', updateRateDisplay);

// --- Helper: Build Hive Engine custom_json for marketSell/marketBuy ---
function buildMarketSellJson(account, symbol, quantity) {
    return {
        contractName: "market",
        contractAction: "marketSell",
        contractPayload: {
            symbol: symbol,
            quantity: String(quantity)
        }
    };
}
function buildMarketBuyJson(account, symbol, quantity) {
    return {
        contractName: "market",
        contractAction: "marketBuy",
        contractPayload: {
            symbol: symbol,
            quantity: String(quantity)
        }
    };
}

// --- Helper: Hivesigner custom_json link ---
function buildHivesignerCustomJsonLink(account, json, authority = 'Active') {
    const op = [
        'custom_json',
        {
            required_auths: [account],
            required_posting_auths: [],
            id: 'ssc-mainnet-hive',
            json: JSON.stringify(json)
        }
    ];
    const ops = encodeURIComponent(JSON.stringify([op]));
    return `https://hivesigner.com/sign/tx?operations=${ops}&authority=${authority}`;
}

// SCALA (XLA) Swap Integration
// Placeholder: You must provide Scala Vault wallet API or browser extension integration details for real swaps
async function performScalaSwap(account, scalaAmount) {
    const swapResult = document.getElementById('swapResult');
    swapResult.innerHTML = 'Initiating Scala swap...';
    // 1. Check if Scala Vault wallet is available
    if (!window.scalaVault) {
        swapResult.innerHTML = 'Scala Vault wallet extension not detected.';
        return;
    }
    // 2. Initiate transfer from Scala Vault wallet (pseudo-code, replace with real API)
    window.scalaVault.sendTransaction({
        to: 'YOUR_PEAKCOIN_SCALA_ADDRESS', // Replace with your receiving address
        amount: scalaAmount,
        asset: 'XLA',
        memo: `Swap XLA for PEK by ${account}`
    }, function(response) {
        if (response.success) {
            swapResult.innerHTML = 'Scala swap transaction broadcasted! Please wait for confirmation.';
            // Optionally, poll for confirmation or show a link to a Scala block explorer
        } else {
            swapResult.innerHTML = 'Scala Vault error: ' + (response.message || 'Unknown error');
        }
    });
}

// Debug log utility
function logDebug(msg) {
    const el = document.getElementById('debugLogContent');
    if (el) {
        const now = new Date().toLocaleTimeString();
        el.innerHTML += `[${now}] ${msg}<br>`;
        el.scrollTop = el.scrollHeight;
    }
}

// Example: log app load
logDebug('App loaded.');

// Add debug logging to Keychain and swap logic
// --- Combined Swap: Sell Token for SWAP.HIVE, then Buy PEK ---
async function performSwap(useKeychain) {
    const account = document.getElementById('hiveSender').value.trim();
    const symbol = document.getElementById('hiveToken').value;
    const quantity = parseFloat(document.getElementById('hiveAmount').value);
    const swapResult = document.getElementById('swapResult');
    logDebug(`Swap requested: account=${account}, symbol=${symbol}, quantity=${quantity}, useKeychain=${useKeychain}`);
    swapResult.innerHTML = '';
    if (!account || !symbol || !quantity || quantity <= 0) {
        swapResult.innerHTML = "Please fill in all fields.";
        logDebug('Swap aborted: missing fields.');
        return;
    }
    if (symbol === 'SCALA') {
        logDebug('Scala swap selected.');
        performScalaSwap(account, quantity);
        return;
    }
    // Step 1: Sell selected token for SWAP.HIVE
    const sellJson = buildMarketSellJson(account, symbol, quantity);
    logDebug('Prepared sellJson: ' + JSON.stringify(sellJson));
    if (useKeychain) {
        if (!window.hive_keychain) {
            swapResult.innerHTML = "Hive Keychain extension not detected.";
            logDebug('Hive Keychain not detected.');
            return;
        }
        logDebug('Requesting Keychain signature for marketSell...');
        window.hive_keychain.requestCustomJson(
            account,
            'ssc-mainnet-hive',
            'Active',
            JSON.stringify(sellJson),
            `Sell ${quantity} ${symbol} for SWAP.HIVE`,
            function(response) {
                logDebug('Keychain response: ' + JSON.stringify(response));
                if (response.success) {
                    swapResult.innerHTML = "Sell order broadcasted! Waiting for your SWAP.HIVE payout...";
                    let payout = 0;
                    let pollCount = 0;
                    let lastPayout = 0;
                    const txId = response.result && response.result.tx_id ? response.result.tx_id : null;
                    const pollPayout = async function() {
                        payout = txId ? await getSwapHivePayoutForTx(account, symbol, txId) : 0;
                        if (!payout || payout <= 0) {
                            // fallback: get most recent payout (in case txId not found in logs yet)
                            payout = await getLastSwapHivePayout(account, symbol);
                        }
                        logDebug(`Polling payout (txId=${txId}): ${payout}`);
                        if (payout > lastPayout + 0.0000001) {
                            lastPayout = payout;
                            swapResult.innerHTML += '<br>SWAP.HIVE payout detected! Waiting 10 seconds before buying PEK...';
                            logDebug('SWAP.HIVE payout detected. Waiting 10 seconds before auto-buying PEK.');
                            setTimeout(function() {
                                logDebug('Auto-buying PEK after 10s delay.');
                                performBuyPEK(account, payout, true);
                            }, 10000);
                        } else if (++pollCount < 30) {
                            setTimeout(pollPayout, 2000);
                        } else {
                            swapResult.innerHTML = "No new SWAP.HIVE payout detected from your sale after 60 seconds. Please check your wallet and try again.";
                            logDebug('Payout polling timed out.');
                        }
                    };
                    setTimeout(pollPayout, 2000);
                } else {
                    swapResult.innerHTML = "Keychain error: " + (response.message || "Unknown error");
                    logDebug('Keychain error: ' + (response.message || 'Unknown error'));
                }
            }
        );
    } else {
        logDebug('Opening Hivesigner for marketSell.');
        const url = buildHivesignerCustomJsonLink(account, sellJson, 'Active');
        window.open(url, '_blank');
        swapResult.innerHTML = "Sell order link opened in Hivesigner. Waiting for your SWAP.HIVE payout...";
        let pollCount = 0;
        let payout = 0;
        let lastPayout = 0;
        const pollPayout = async function() {
            payout = await getLastSwapHivePayout(account, symbol);
            logDebug(`Polling payout (Hivesigner): ${payout}`);
            if (payout > lastPayout + 0.0000001) {
                lastPayout = payout;
                performBuyPEK(account, payout, false);
            } else if (++pollCount < 30) {
                setTimeout(pollPayout, 2000);
            } else {
                swapResult.innerHTML = "No SWAP.HIVE payout detected from your sale after 60 seconds. Please check your wallet and try again.";
                logDebug('Payout polling timed out.');
            }
        };
        setTimeout(pollPayout, 2000);
    }
}

// Fetch the user's SWAP.HIVE balance from Hive Engine
async function getSwapHiveBalance(account) {
    try {
        const data = await fetchWithBackups({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'findOne',
                params: {
                    contract: 'tokens',
                    table: 'balances',
                    query: { account: account, symbol: 'SWAP.HIVE' }
                }
            })
        });
        if (data && data.result && data.result.balance) {
            return parseFloat(data.result.balance);
        }
    } catch (e) {}
    return 0;
}

// Fetch the most recent SWAP.HIVE payout from a marketSell for the selected token
async function getLastSwapHivePayout(account, symbol) {
    try {
        const data = await fetchWithBackups({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'find',
                params: {
                    contract: 'market',
                    table: 'trades',
                    query: { account: account, symbol: symbol, market: 'SWAP.HIVE' },
                    limit: 10,
                    indexes: [{ index: 'timestamp', descending: true }]
                }
            })
        });
        if (data && data.result && data.result.length > 0) {
            // Find the most recent trade where the user was the seller and payoutSymbol is SWAP.HIVE
            for (const trade of data.result) {
                if (trade.account === account && trade.symbol === symbol && trade.payoutSymbol === 'SWAP.HIVE') {
                    return parseFloat(trade.payoutQuantity);
                }
            }
        }
    } catch (e) {}
    return 0;
}

// Fetch the most recent SWAP.HIVE payout from a marketSell for the selected token using logs/events
async function getLastSwapHivePayoutFromLogs(account, symbol) {
    try {
        const data = await fetchWithBackups({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'find',
                params: {
                    contract: 'blockLog',
                    table: 'blocks',
                    query: {},
                    limit: 10,
                    indexes: [{ index: 'blockNumber', descending: true }]
                }
            })
        });
        if (data && data.result && data.result.length > 0) {
            for (const block of data.result) {
                if (block.transactions) {
                    for (const tx of block.transactions) {
                        if (tx.sender === account && tx.contract === 'market' && tx.action === 'marketSell' && tx.payload && tx.payload.symbol === symbol) {
                            // Look for a transferFromContract event for SWAP.HIVE to the user
                            if (tx.logs && tx.logs.events) {
                                for (let i = 0; i < tx.logs.events.length; i++) {
                                    const event = tx.logs.events[i];
                                    if (event.contract === 'tokens' && event.event === 'transferFromContract' && event.data && event.data.to === account && event.data.symbol === 'SWAP.HIVE') {
                                        return parseFloat(event.data.quantity);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {}
    return 0;
}

// --- Combined Swap: Sell Token for SWAP.HIVE, then Buy PEK ---
async function performBuyPEK(account, swapHiveAmount, useKeychain) {
    const swapResult = document.getElementById('swapResult');
    const MULTI_TX_FEE = 0.001;
    let buyAmount = swapHiveAmount - MULTI_TX_FEE;
    logDebug(`Preparing to buy PEK: swapHiveAmount=${swapHiveAmount}, buyAmount=${buyAmount}, useKeychain=${useKeychain}`);
    if (buyAmount <= 0) {
        swapResult.innerHTML = "Insufficient SWAP.HIVE amount after fee deduction.";
        logDebug('Buy aborted: insufficient SWAP.HIVE after fee.');
        return;
    }
    const buyJson = buildMarketBuyJson(account, 'PEK', buyAmount);
    logDebug('Prepared buyJson: ' + JSON.stringify(buyJson));
    if (useKeychain) {
        if (!window.hive_keychain) {
            swapResult.innerHTML = "Hive Keychain extension not detected.";
            logDebug('Hive Keychain not detected for buy.');
            return;
        }
        logDebug('Requesting Keychain signature for marketBuy...');
        window.hive_keychain.requestCustomJson(
            account,
            'ssc-mainnet-hive',
            'Active',
            JSON.stringify(buyJson),
            `Buy PEK with ${buyAmount} SWAP.HIVE`,
            function(response) {
                logDebug('Keychain response (buy): ' + JSON.stringify(response));
                if (response.success) {
                    swapResult.innerHTML = "Buy order broadcasted!";
                } else {
                    swapResult.innerHTML = "Keychain error: " + (response.message || "Unknown error");
                    logDebug('Keychain error (buy): ' + (response.message || 'Unknown error'));
                }
            }
        );
    } else {
        logDebug('Opening Hivesigner for marketBuy.');
        const url = buildHivesignerCustomJsonLink(account, buyJson, 'Active');
        window.open(url, '_blank');
        swapResult.innerHTML = "Buy order link opened in Hivesigner.";
    }
}

// Helper: Get SWAP.HIVE payout for a specific txId (marketSell)
async function getSwapHivePayoutForTx(account, symbol, txId) {
    if (!txId) return 0;
    try {
        const data = await fetchWithBackups({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'find',
                params: {
                    contract: 'blockLog',
                    table: 'blocks',
                    query: {},
                    limit: 15,
                    indexes: [{ index: 'blockNumber', descending: true }]
                }
            })
        });
        if (data && data.result && data.result.length > 0) {
            for (const block of data.result) {
                if (block.transactions) {
                    for (const tx of block.transactions) {
                        if (tx.transactionId === txId && tx.contract === 'market' && tx.action === 'marketSell' && tx.payload && tx.payload.symbol === symbol) {
                            // Look for a transferFromContract event for SWAP.HIVE to the user
                            if (tx.logs && tx.logs.events) {
                                for (let i = 0; i < tx.logs.events.length; i++) {
                                    const event = tx.logs.events[i];
                                    if (event.contract === 'tokens' && event.event === 'transferFromContract' && event.data && event.data.to === account && event.data.symbol === 'SWAP.HIVE') {
                                        return parseFloat(event.data.quantity);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {}
    return 0;
}

// Add event listeners for swap buttons if not already present
// This ensures the swapKeychain and swapHivesigner buttons trigger the swap logic

document.getElementById('swapKeychain').addEventListener('click', function(e) {
    e.preventDefault();
    logDebug('swapKeychain button clicked');
    performSwap(true);
});
document.getElementById('swapHivesigner').addEventListener('click', function(e) {
    e.preventDefault();
    logDebug('swapHivesigner button clicked');
    performSwap(false);
});