const os = require('os');
const settings = require('../settings.js');

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
}

function getNairobiTime() {
    // Directly create Nairobi time (EAT = UTC+3)
    const now = new Date();
    const nairobiOffset = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
    const nairobiTime = new Date(now.getTime() + nairobiOffset);

    // Format as HH:MM:SS AM/PM
    let hours = nairobiTime.getUTCHours();
    const minutes = nairobiTime.getUTCMinutes().toString().padStart(2, '0');
    const seconds = nairobiTime.getUTCSeconds().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';

    hours = hours % 12;
    hours = hours ? hours : 12; // Convert 0 to 12

    return `${hours}:${minutes}:${seconds} ${ampm}`;
}

function getNairobiDate() {
    const now = new Date();
    const nairobiOffset = 3 * 60 * 60 * 1000;
    const nairobiTime = new Date(now.getTime() + nairobiOffset);

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const day = days[nairobiTime.getUTCDay()];
    const date = nairobiTime.getUTCDate();
    const month = months[nairobiTime.getUTCMonth()];
    const year = nairobiTime.getUTCFullYear();

    return `${day}, ${month} ${date}, ${year}`;
}

async function pingCommand(sock, chatId, message) {
    try {
        const start = Date.now();
        await sock.sendMessage(chatId, { text: '‼️' }, { quoted: message });
        const end = Date.now();
        const ping = end - start;

        const uptime = formatTime(process.uptime());
        const totalMem = (os.totalmem() / (1024 ** 3)).toFixed(1);
        const usedMem = ((os.totalmem() - os.freemem()) / (1024 ** 3)).toFixed(1);

        const nairobiTime = getNairobiTime();
        const nairobiDate = getNairobiDate();

        const status = `
┌── *404-XMD STATUS* ──
│
│ ⚡ *Speed:* ${ping}ms
│ ⏱️ *Uptime:* ${uptime}
│ 🟢 *Status:* Online
│ 🧠 *RAM:* ${usedMem}GB/${totalMem}GB
│ 🏷️ *Version:* v${settings.version}
│
│ 📍 *Location:* Nairobi, KE
│ 🕒 *Time:* ${nairobiTime}
│ 📅 *Date:* ${nairobiDate}
│
└─────────────────────
        `.trim();

        await sock.sendMessage(chatId, { text: status }, { quoted: message });

    } catch (error) {
        console.error('Ping error:', error);
        await sock.sendMessage(chatId, { 
            text: `❌ Error: ${error.message}` 
        }, { quoted: message });
    }
}

module.exports = pingCommand;