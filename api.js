// api.js - Handles all API/network logic for Hive Engine and Hive

export const HIVE_ENGINE_APIS = [
    'https://peake-swap.onrender.com/he-proxy'
];

export const CORS_PROXY = 'https://corsproxy.io/?';

export async function fetchWithBackups(options) {
    for (let i = 0; i < HIVE_ENGINE_APIS.length; i++) {
        try {
            const res = await fetch(HIVE_ENGINE_APIS[i], options);
            if (res.ok) return await res.json();
        } catch (e) {}
    }
    for (let i = 0; i < HIVE_ENGINE_APIS.length; i++) {
        try {
            const res = await fetch(CORS_PROXY + HIVE_ENGINE_APIS[i], options);
            if (res.ok) return await res.json();
        } catch (e) {}
    }
    return null;
}

export async function getHiveBlockNumberForTxId(txId, maxRetries = 10, delayMs = 1000) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const res = await fetch('https://api.hive.blog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'condenser_api.get_transaction',
                    params: [txId]
                })
            });
            const data = await res.json();
            if (data && data.result && data.result.block_num) {
                return data.result.block_num;
            }
        } catch (e) {}
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return null;
}

export async function fetchSwapHiveRate(tokenSymbol) {
    // Fetch best buy price for the token (what user gets for selling)
    let tokenSellPrice = 0;
    let pekBuyPrice = 0;
    try {
        // 1. Get the highest buy order for the token (user is selling this token for SWAP.HIVE)
        const tokenOrderbook = await fetchWithBackups({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'find',
                params: {
                    contract: 'market',
                    table: 'buyBook',
                    query: { symbol: tokenSymbol, market: 'SWAP.HIVE' },
                    limit: 1,
                    indexes: [{ index: 'price', descending: true }]
                }
            })
        });
        if (tokenOrderbook && tokenOrderbook.result && tokenOrderbook.result.length > 0) {
            tokenSellPrice = parseFloat(tokenOrderbook.result[0].price);
        }
        // 2. Get the lowest sell order for PEK (user is buying PEK with SWAP.HIVE)
        const pekOrderbook = await fetchWithBackups({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'find',
                params: {
                    contract: 'market',
                    table: 'sellBook',
                    query: { symbol: 'PEK', market: 'SWAP.HIVE' },
                    limit: 1,
                    indexes: [{ index: 'price', descending: false }]
                }
            })
        });
        if (pekOrderbook && pekOrderbook.result && pekOrderbook.result.length > 0) {
            pekBuyPrice = parseFloat(pekOrderbook.result[0].price);
        }
        // If both prices are found, calculate the effective rate
        if (tokenSellPrice > 0 && pekBuyPrice > 0) {
            // 1 token -> tokenSellPrice SWAP.HIVE -> 1/pekBuyPrice PEK
            // So, 1 token = tokenSellPrice / pekBuyPrice PEK
            return tokenSellPrice / pekBuyPrice;
        }
    } catch (e) {
        logDebug('fetchSwapHiveRate error: ' + e);
    }
    return null;
}
