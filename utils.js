// utils.js - General-purpose helpers and debug logging

export function logDebug(msg) {
    const el = document.getElementById('debugLogContent');
    if (el) {
        const now = new Date().toLocaleTimeString();
        const entry = `<span style="font-size:0.82em;line-height:1.5;display:block;margin-bottom:2px;">[${now}] ${msg}</span>`;
        el.innerHTML += entry;
        el.scrollTop = el.scrollHeight;
    }
}
