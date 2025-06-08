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
