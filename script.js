import { fetchWithBackups, getHiveBlockNumberForTxId } from './api.js';
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