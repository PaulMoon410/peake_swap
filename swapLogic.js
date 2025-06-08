// swapLogic.js - Handles the main swap workflow and transaction orchestration
import { fetchWithBackups, getHiveBlockNumberForTxId } from './api.js';
import { logDebug } from './utils.js';

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
