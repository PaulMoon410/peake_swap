// keychain.js - Handles all Hive Keychain transaction logic for atomic swap
import { logDebug } from './utils.js';

export function performKeychainSell(account, symbol, quantity, swapResult, getSwapHivePayoutForTx, getLastSwapHivePayout, performBuyPEK) {
    if (!window.hive_keychain) {
        swapResult.innerHTML = "Hive Keychain extension not detected.";
        logDebug('Hive Keychain not detected.');
        return;
    }
    // Always generate a unique memo for tracking
    const memo = `AtomicSwap-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
    const sellJson = {
        contractName: "market",
        contractAction: "marketSell",
        contractPayload: {
            symbol: symbol,
            quantity: String(quantity),
            memo: memo
        }
    };
    logDebug('Requesting Keychain signature for marketSell with memo: ' + memo);
    window.hive_keychain.requestCustomJson(
        account,
        'ssc-mainnet-hive',
        'Active',
        JSON.stringify(sellJson),
        `Sell ${quantity} ${symbol} for SWAP.HIVE`,
        function(response) {
            logDebug('Keychain response: ' + JSON.stringify(response));
            if (response.success) {
                swapResult.innerHTML = `Sell order broadcasted! Waiting for your SWAP.HIVE payout...<br><b>Memo:</b> <code>${memo}</code>`;
                let payout = 0;
                let pollCount = 0;
                let lastPayout = 0;
                const txId = response.result && response.result.tx_id ? response.result.tx_id : null;
                setTimeout(function() {
                    const pollPayout = async function() {
                        payout = txId ? await getSwapHivePayoutForTx(account, symbol, txId, memo) : 0;
                        if (!payout || payout <= 0) {
                            payout = await getLastSwapHivePayout(account, symbol);
                        }
                        logDebug(`Polling payout (txId=${txId}, memo=${memo}): ${payout}`);
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
                    pollPayout();
                }, 7000);
            } else {
                swapResult.innerHTML = "Keychain error: " + (response.message || "Unknown error");
                logDebug('Keychain error: ' + (response.message || 'Unknown error'));
            }
        }
    );
}

export function performKeychainBuy(account, swapHiveAmount, swapResult) {
    const MULTI_TX_FEE = 0.001;
    let buyAmount = swapHiveAmount - MULTI_TX_FEE;
    logDebug(`Preparing to buy PEK: swapHiveAmount=${swapHiveAmount}, buyAmount=${buyAmount}, useKeychain=true`);
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
}
