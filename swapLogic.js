// swapLogic.js - Handles the main swap workflow and transaction orchestration
import { fetchWithBackups, getHiveBlockNumberForTxId } from './api.js';
import { logDebug } from './utils.js';
import { performKeychainSell, performKeychainBuy } from './keychain.js';

export async function getSwapHivePayoutForTx(account, symbol, txId, memo) {
    if (!txId) return 0;
    let hiveBlockNum = await getHiveBlockNumberForTxId(txId);
    logDebug('Hive block number for txId ' + txId + ': ' + hiveBlockNum);
    const blockRangeStart = Math.max(hiveBlockNum - 50, 0);
    const blockRangeEnd = hiveBlockNum + 50;
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
                    query: { blockNumber: { $gte: blockRangeStart, $lte: blockRangeEnd } },
                    limit: 100,
                    indexes: [{ index: 'blockNumber', descending: false }]
                }
            })
        });
        logDebug('blockLog API response: ' + JSON.stringify(data));
        if (data && data.result && data.result.length > 0 && hiveBlockNum) {
            for (const block of data.result) {
                logDebug('BlockLog blockNumber: ' + block.blockNumber + ', tx count: ' + (block.transactions ? block.transactions.length : 0));
                if (block.transactions) {
                    for (const tx of block.transactions) {
                        logDebug('BlockLog TX: ' + JSON.stringify({
                            refBlockNum: tx.refHiveBlockNumber,
                            sender: tx.sender,
                            contract: tx.contract,
                            action: tx.action,
                            payload: tx.payload,
                            logs: tx.logs
                        }));
                        const refBlockNum = typeof tx.refHiveBlockNumber === 'string' ? parseInt(tx.refHiveBlockNumber) : tx.refHiveBlockNumber;
                        const hiveBlockNumInt = typeof hiveBlockNum === 'string' ? parseInt(hiveBlockNum) : hiveBlockNum;
                        logDebug('Checking tx: refHiveBlockNumber=' + refBlockNum + ', hiveBlockNum=' + hiveBlockNumInt + ', sender=' + tx.sender + ', contract=' + tx.contract + ', action=' + tx.action + ', symbol=' + (tx.payload && tx.payload.symbol) + ', memo=' + (tx.payload && tx.payload.memo));
                        if (
                            refBlockNum === hiveBlockNumInt &&
                            tx.sender === account &&
                            tx.contract === 'market' &&
                            tx.action === 'marketSell' &&
                            tx.payload && tx.payload.symbol === symbol &&
                            (!memo || (tx.payload.memo && tx.payload.memo === memo))
                        ) {
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
    } catch (e) { logDebug('blockLog error: ' + e); }
    // Fallback: check trades table
    try {
        const trades = await fetchWithBackups({
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
        logDebug('trades API response: ' + JSON.stringify(trades));
        if (trades && trades.result && trades.result.length > 0) {
            for (const trade of trades.result) {
                if (trade.account === account && trade.symbol === symbol && trade.payoutSymbol === 'SWAP.HIVE') {
                    return parseFloat(trade.payoutQuantity);
                }
            }
        }
    } catch (e) { logDebug('trades fallback error: ' + e); }
    return 0;
}

// Helper: generate Hivesigner URL for custom_json
function generateHivesignerCustomJsonUrl(account, json, description) {
    const op = [
        "custom_json",
        {
            required_auths: [account],
            required_posting_auths: [],
            id: "ssc-mainnet-hive",
            json: JSON.stringify(json)
        }
    ];
    const opStr = encodeURIComponent(JSON.stringify([op]));
    const desc = encodeURIComponent(description || "Sign Hive Engine transaction");
    return `https://hivesigner.com/sign/custom-json?authority=active&required_auths=%5B%22${account}%22%5D&required_posting_auths=%5B%5D&id=ssc-mainnet-hive&json=${encodeURIComponent(JSON.stringify(json))}&display_msg=${desc}`;
}

// Main swap workflow (exported)
export async function performSwap(useKeychain) {
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
        swapResult.innerHTML = 'Scala swap not implemented in this module.';
        return;
    }
    if (useKeychain) {
        // Pass polling helpers as arguments to avoid circular import
        performKeychainSell(account, symbol, quantity, swapResult, getSwapHivePayoutForTx, getLastSwapHivePayout, performBuyPEK);
    } else {
        // --- HIVESIGNER FLOW ---
        // 1. Generate unique memo and store swap info
        const memo = `AtomicSwap-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
        const swapInfo = {
            memo,
            symbol,
            quantity: String(quantity),
            account,
            timestamp: Date.now(),
            status: 'pending',
            method: 'hivesigner',
            step: 'sell'
        };
        localStorage.setItem('pendingSwap', JSON.stringify(swapInfo));
        // 2. Prepare custom_json for marketSell
        const sellJson = {
            contractName: "market",
            contractAction: "marketSell",
            contractPayload: {
                symbol: symbol,
                quantity: String(quantity),
                memo: memo
            }
        };
        // 3. Generate Hivesigner URL
        const url = generateHivesignerCustomJsonUrl(account, sellJson, `Sell ${quantity} ${symbol} for SWAP.HIVE`);
        logDebug('Opening Hivesigner for marketSell: ' + url);
        swapResult.innerHTML = `Step 1: <b>Sell ${quantity} ${symbol} for SWAP.HIVE</b> via Hivesigner.<br><b>Memo:</b> <code>${memo}</code><br><a href="${url}" target="_blank" class="hivesigner-btn">Sign with Hivesigner</a><br>After signing, return to this page to continue.`;
        // 4. Poll for payout after user returns
        window.pendingHivesignerStep = 'sell';
        window.hivesignerSwapInfo = swapInfo;
        // Attach a polling function to window for manual resume
        window.resumeHivesignerSwap = async function() {
            swapResult.innerHTML = `Polling for SWAP.HIVE payout for <b>${symbol}</b> (<b>${quantity}</b>)<br>Memo: <code>${memo}</code>...`;
            let payout = 0;
            let pollCount = 0;
            let lastPayout = 0;
            setTimeout(function() {
                const pollPayout = async function() {
                    payout = await getLastSwapHivePayout(account, symbol);
                    logDebug(`Hivesigner polling payout (memo=${memo}): ${payout}`);
                    if (payout > lastPayout + 0.0000001) {
                        lastPayout = payout;
                        swapResult.innerHTML += '<br>SWAP.HIVE payout detected! Waiting 10 seconds before buying PEK...';
                        let done = JSON.parse(localStorage.getItem('pendingSwap'));
                        if (done) {
                            done.status = 'complete';
                            done.step = 'buy';
                            localStorage.setItem('pendingSwap', JSON.stringify(done));
                        }
                        setTimeout(function() {
                            logDebug('Auto-buying PEK after 10s delay (Hivesigner).');
                            performHivesignerBuy(account, payout, memo);
                            // Remove from localStorage after buy
                            //localStorage.removeItem('pendingSwap');
                        }, 10000);
                    } else if (++pollCount < 90) {
                        setTimeout(pollPayout, 2000);
                    } else {
                        swapResult.innerHTML = "No new SWAP.HIVE payout detected from your sale after 3 minutes. Please check your wallet and try again.";
                        logDebug('Hivesigner payout polling timed out.');
                        let fail = JSON.parse(localStorage.getItem('pendingSwap'));
                        if (fail) {
                            fail.status = 'timeout';
                            localStorage.setItem('pendingSwap', JSON.stringify(fail));
                        }
                    }
                };
                pollPayout();
            }, 7000);
        };
        // Optionally, auto-start polling after a short delay (user may click after signing)
        setTimeout(() => {
            if (window.pendingHivesignerStep === 'sell') {
                swapResult.innerHTML += '<br><button id="resumeHivesignerBtn">I have signed, continue</button>';
                document.getElementById('resumeHivesignerBtn').onclick = window.resumeHivesignerSwap;
            }
        }, 2000);
    }
}

// Helper: performHivesignerBuy
async function performHivesignerBuy(account, swapHiveAmount, memo) {
    const swapResult = document.getElementById('swapResult');
    const MULTI_TX_FEE = 0.001;
    let buyAmount = swapHiveAmount - MULTI_TX_FEE;
    logDebug(`Preparing to buy PEK (Hivesigner): swapHiveAmount=${swapHiveAmount}, buyAmount=${buyAmount}`);
    if (buyAmount <= 0) {
        swapResult.innerHTML = "Insufficient SWAP.HIVE amount after fee deduction.";
        logDebug('Buy aborted: insufficient SWAP.HIVE after fee.');
        return;
    }
    const buyJson = {
        contractName: "market",
        contractAction: "marketBuy",
        contractPayload: {
            symbol: 'PEK',
            quantity: String(buyAmount)
        }
    };
    const url = generateHivesignerCustomJsonUrl(account, buyJson, `Buy PEK with ${buyAmount} SWAP.HIVE`);
    swapResult.innerHTML = `Step 2: <b>Buy PEK with your SWAP.HIVE</b> via Hivesigner.<br><a href="${url}" target="_blank" class="hivesigner-btn">Sign with Hivesigner</a><br>After signing, your swap is complete!`;
    logDebug('Opening Hivesigner for marketBuy: ' + url);
    // Mark as done in localStorage after buy
    let done = JSON.parse(localStorage.getItem('pendingSwap'));
    if (done) {
        done.status = 'complete';
        done.step = 'done';
        localStorage.setItem('pendingSwap', JSON.stringify(done));
    }
    // Optionally, remove from localStorage after a delay
    setTimeout(() => {
        localStorage.removeItem('pendingSwap');
    }, 30000);
}

// Helper: getLastSwapHivePayout (for fallback)
export async function getLastSwapHivePayout(account, symbol) {
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
            for (const trade of data.result) {
                if (trade.account === account && trade.symbol === symbol && trade.payoutSymbol === 'SWAP.HIVE') {
                    return parseFloat(trade.payoutQuantity);
                }
            }
        }
    } catch (e) {}
    return 0;
}

// Helper: performBuyPEK (for Keychain)
export async function performBuyPEK(account, swapHiveAmount, useKeychain) {
    const swapResult = document.getElementById('swapResult');
    if (useKeychain) {
        performKeychainBuy(account, swapHiveAmount, swapResult);
        return;
    }
    const MULTI_TX_FEE = 0.001;
    let buyAmount = swapHiveAmount - MULTI_TX_FEE;
    logDebug(`Preparing to buy PEK: swapHiveAmount=${swapHiveAmount}, buyAmount=${buyAmount}, useKeychain=${useKeychain}`);
    if (buyAmount <= 0) {
        swapResult.innerHTML = "Insufficient SWAP.HIVE amount after fee deduction.";
        logDebug('Buy aborted: insufficient SWAP.HIVE after fee.');
        return;
    }
    const buyJson = {
        contractName: "market",
        contractAction: "marketBuy",
        contractPayload: {
            symbol: 'PEK',
            quantity: String(buyAmount)
        }
    };
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
        logDebug('Hivesigner buy not implemented in this module.');
    }
}
