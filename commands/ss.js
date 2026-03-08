const fetch = require('node-fetch');

async function handleSsCommand(sock, chatId, message, match) {
    if (!match) {
        await sock.sendMessage(chatId, {
            text: `*SCREENSHOT TOOL*\n\n*.ss <url>*\n\nExample:\n.ss https://google.com`
        });
        return;
    }

    try {
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);

        const url = match.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return sock.sendMessage(chatId, { text: '❌ Please provide a valid URL' });
        }

        const apiUrl = `https://api.siputzx.my.id/api/tools/ssweb?url=${encodeURIComponent(url)}&theme=light&device=desktop`;
        const response = await fetch(apiUrl);
        const imageBuffer = await response.buffer();

        await sock.sendMessage(chatId, { image: imageBuffer }, { quoted: message });
    } catch (error) {
        console.error('❌ Error in ss command:', error);
    }
}

module.exports = { handleSsCommand };