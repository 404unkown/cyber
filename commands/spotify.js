const axios = require('axios');

async function spotifyCommand(sock, chatId, message, query) {
    try {
        if (!query) {
            await sock.sendMessage(chatId, { text: 'Usage: .spotify <song name>' }, { quoted: message });
            return;
        }

        const apiUrl = `https://api.dreaded.site/api/spotify?q=${encodeURIComponent(query)}`;
        const { data } = await axios.get(apiUrl);

        if (data?.result?.audio) {
            await sock.sendMessage(chatId, {
                audio: { url: data.result.audio },
                mimetype: 'audio/mpeg',
                fileName: `${data.result.title}.mp3`
            }, { quoted: message });
        }
    } catch (error) {
        console.error('[SPOTIFY] error:', error?.message || error);
        await sock.sendMessage(chatId, { text: 'Failed to fetch Spotify audio.' }, { quoted: message });
    }
}

module.exports = spotifyCommand;