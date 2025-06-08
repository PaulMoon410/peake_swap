// ui.js - Handles UI updates, event listeners, and user feedback
import { logDebug } from './utils.js';

export function updateRateDisplay(rate, tokenAmount, token) {
    const rateDisplay = document.getElementById('rateDisplay');
    if (rate && tokenAmount > 0) {
        const pekAmount = tokenAmount * rate;
        rateDisplay.innerHTML = `Estimated: <b>${pekAmount.toFixed(6)} PEK</b> for <b>${tokenAmount} ${token}</b><br><span style='font-size:0.95em;color:#fff;'>Final swap rate is determined by the market at the time of each transaction.</span>`;
    } else {
        rateDisplay.textContent = 'Unable to fetch live SWAP.HIVE rate.';
    }
}

export function setSwapResult(msg) {
    document.getElementById('swapResult').innerHTML = msg;
}
