const fs = require('fs');

function readJsonSafe(path, fallback) {
    try {
        const txt = fs.readFileSync(path, 'utf8');
        return JSON.parse(txt);
    } catch (_) {
        return fallback;
    }
}

async function settingsCommand(sock, chatId, message) {
    try {
        const dataDir = './data';
        const autoStatus = readJsonSafe(`${dataDir}/autoStatus.json`, { enabled: false });
        const autoReact = readJsonSafe(`${dataDir}/autoReact.json`, { enabled: false });
        const autoRead = readJsonSafe(`${dataDir}/autoRead.json`, { enabled: false });
        const autoTyping = readJsonSafe(`${dataDir}/autoTyping.json`, { enabled: false });
        const anticall = readJsonSafe(`${dataDir}/anticall.json`, { enabled: false });

        const lines = [];
        lines.push('*BOT SETTINGS*');
        lines.push('');
        lines.push(`• Auto Status: ${autoStatus.enabled ? 'ON' : 'OFF'}`);
        lines.push(`• Auto React: ${autoReact.enabled ? 'ON' : 'OFF'}`);
        lines.push(`• Auto Read: ${autoRead.enabled ? 'ON' : 'OFF'}`);
        lines.push(`• Auto Typing: ${autoTyping.enabled ? 'ON' : 'OFF'}`);
        lines.push(`• Anticall: ${anticall.enabled ? 'ON' : 'OFF'}`);

        await sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: message });
    } catch (error) {
        console.error('Error in settings command:', error);
        await sock.sendMessage(chatId, { text: 'Failed to read settings.' }, { quoted: message });
    }
}

module.exports = settingsCommand;