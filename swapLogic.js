// swapLogic.js - Handles the main swap workflow and transaction orchestration
import { fetchWithBackups, getHiveBlockNumberForTxId } from './api.js';
import { logDebug } from './utils.js';
import { performKeychainSell, performKeychainBuy } from './keychain.js';

export async function getSwapHivePayoutForTx(account, symbol, txId) {
    if (!txId) return 0;
    let hiveBlockNum = await getHiveBlockNumberForTxId(txId);
    logDebug('Hive block number for txId ' + txId + ': ' + hiveBlockNum);
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
                    limit: 50,
                    indexes: [{ index: 'blockNumber', descending: true }]
                }
            })
        });
        logDebug('blockLog API response: ' + JSON.stringify(data));
        if (data && data.result && data.result.length > 0 && hiveBlockNum) {
            for (const block of data.result) {
                if (block.transactions) {
                    for (const tx of block.transactions) {
                        const refBlockNum = typeof tx.refHiveBlockNumber === 'string' ? parseInt(tx.refHiveBlockNumber) : tx.refHiveBlockNumber;
                        const hiveBlockNumInt = typeof hiveBlockNum === 'string' ? parseInt(hiveBlockNum) : hiveBlockNum;
                        logDebug('Checking tx: refHiveBlockNumber=' + refBlockNum + ', hiveBlockNum=' + hiveBlockNumInt + ', sender=' + tx.sender + ', contract=' + tx.contract + ', action=' + tx.action + ', symbol=' + (tx.payload && tx.payload.symbol));
                        if (
                            refBlockNum === hiveBlockNumInt &&
                            tx.sender === account &&
                            tx.contract === 'market' &&
                            tx.action === 'marketSell' &&
                            tx.payload && tx.payload.symbol === symbol
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
        performKeychainSell(account, symbol, quantity, swapResult);
    } else {
        logDebug('Opening Hivesigner for marketSell.');
        swapResult.innerHTML = "Hivesigner flow not implemented in this module.";
    }
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
