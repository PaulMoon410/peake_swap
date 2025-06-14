import { fetchWithBackups, getHiveBlockNumberForTxId, fetchSwapHiveRate } from './api.js';
import { getSwapHivePayoutForTx, performSwap } from './swapLogic.js';
import { updateRateDisplay, setSwapResult } from './ui.js';
import { logDebug } from './utils.js';

// Example: log app load
logDebug('App loaded.');

// --- UI Rate Display Logic ---
async function handleRateDisplay() {
    const token = document.getElementById('hiveToken').value;
    const tokenAmount = parseFloat(document.getElementById('hiveAmount').value);
    if (tokenAmount > 0) {
        // You may want to move fetchSwapHiveRate to api.js as well
        const swapHiveRate = await fetchSwapHiveRate(token);
        updateRateDisplay(swapHiveRate, tokenAmount, token);
    } else {
        updateRateDisplay(null, 0, token);
    }
}
document.getElementById('hiveAmount').addEventListener('input', handleRateDisplay);
document.getElementById('hiveToken').addEventListener('change', handleRateDisplay);
window.addEventListener('DOMContentLoaded', handleRateDisplay);

// --- Swap Button Event Listeners ---
document.getElementById('swapKeychain').addEventListener('click', function(e) {
    e.preventDefault();
    logDebug('swapKeychain button clicked');
    performSwap(true); // Call main swap logic for Keychain
});
document.getElementById('swapHivesigner').addEventListener('click', function(e) {
    e.preventDefault();
    logDebug('swapHivesigner button clicked');
    performSwap(false); // Call main swap logic for Hivesigner
});

// On page load, resume polling for any pending swap
window.addEventListener('DOMContentLoaded', () => {
    const pending = JSON.parse(localStorage.getItem('pendingSwap'));
    if (pending && pending.status === 'pending') {
        const swapResult = document.getElementById('swapResult');
        swapResult.innerHTML = `Resuming pending swap for <b>${pending.symbol}</b> (<b>${pending.quantity}</b>)<br>Memo: <code>${pending.memo}</code><br>Polling for payout...`;
        // Use the same polling logic as in performKeychainSell
        let payout = 0;
        let pollCount = 0;
        let lastPayout = 0;
        setTimeout(function() {
            const pollPayout = async function() {
                payout = pending.txId ? await window.getSwapHivePayoutForTx(
                    pending.account,
                    pending.symbol,
                    pending.txId,
                    pending.memo
                ) : 0;
                if (!payout || payout <= 0) {
                    payout = await window.getLastSwapHivePayout(pending.account, pending.symbol);
                }
                if (payout > lastPayout + 0.0000001) {
                    lastPayout = payout;
                    swapResult.innerHTML += '<br>SWAP.HIVE payout detected! Waiting 10 seconds before buying PEK...';
                    let done = JSON.parse(localStorage.getItem('pendingSwap'));
                    if (done) {
                        done.status = 'complete';
                        localStorage.setItem('pendingSwap', JSON.stringify(done));
                    }
                    setTimeout(function() {
                        window.performBuyPEK(pending.account, payout, true);
                        localStorage.removeItem('pendingSwap');
                    }, 10000);
                } else if (++pollCount < 90) {
                    setTimeout(pollPayout, 2000);
                } else {
                    swapResult.innerHTML = "No new SWAP.HIVE payout detected from your sale after 3 minutes. Please check your wallet and try again.";
                    let fail = JSON.parse(localStorage.getItem('pendingSwap'));
                    if (fail) {
                        fail.status = 'timeout';
                        localStorage.setItem('pendingSwap', JSON.stringify(fail));
                    }
                }
            };
            pollPayout();
        }, 7000);
    }
});