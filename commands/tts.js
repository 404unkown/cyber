const axios = require('axios');

const IFRAME_URL = 'https://plachta-vits-umamusume-voice-synthesizer.hf.space';

const CHAR_MAP = {
    grass: '草上飞 Grass Wonder (Umamusume Pretty Derby)',
    goldship: '黄金船 Gold Ship (Umamusume Pretty Derby)',
    teio: '东海帝王 Tokai Teio (Umamusume Pretty Derby)',
    raiden: '雷电将军 Raiden Shogun (Genshin Impact)',
    hutao: '胡桃 Hu Tao (Genshin Impact)',
    ayaka: '神里绫华 Kamisato Ayaka (Genshin Impact)',
    paimon: '派蒙 Paimon (Genshin Impact)'
};

const LANG_MAP = {
    jp: '日本語',
    en: 'English',
    cn: '简体中文',
    mix: 'Mix'
};

async function generateTTS(text, character, language) {
    const session = Math.random().toString(36).slice(2);

    await axios.post(`${IFRAME_URL}/gradio_api/queue/join`, {
        data: [
            text,
            character,
            language,
            1.0,
            false
        ],
        fn_index: 2,
        session_hash: session,
        trigger_id: 24
    });

    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));

        const res = await axios.get(
            `${IFRAME_URL}/gradio_api/queue/data?session_hash=${session}`,
            { responseType: 'text' }
        );

        const lines = res.data.split('\n');
        for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            
            try {
                const json = JSON.parse(line.replace('data: ', ''));

                if (json.msg === 'process_completed') {
                    for (const item of json.output.data) {
                        if (typeof item === 'string' && item.endsWith('.wav')) {
                            return `${IFRAME_URL}/gradio_api/file=${item}`;
                        }
                    }
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
    }

    throw new Error('TTS generation timeout');
}

const ttsCommand = async (sock, chatId, message, input) => {
    try {
        // Handle both array and string input
        let text;
        if (Array.isArray(input)) {
            text = input.join(' ').trim();
        } else if (typeof input === 'string') {
            text = input;
        } else {
            text = '';
        }
        
        if (!text) {
            await sock.sendMessage(chatId, { 
                text: `🧪 *TTS (Text-to-Speech)*\n\n` +
                      `*Usage:*\n.tts <character>|<lang> <text>\n\n` +
                      `*Characters:*\n` +
                      `• grass - Grass Wonder\n` +
                      `• goldship - Gold Ship\n` +
                      `• teio - Tokai Teio\n` +
                      `• raiden - Raiden Shogun\n` +
                      `• hutao - Hu Tao\n` +
                      `• ayaka - Kamisato Ayaka\n` +
                      `• paimon - Paimon\n\n` +
                      `*Languages:* jp, en, cn, mix\n\n` +
                      `*Example:*\n.tts grass|jp Hello trainer`,
                ...global.channelInfo 
            }, { quoted: message });
            return;
        }

        // Parse command format: character|lang text
        const parts = text.split(' ');
        const meta = parts[0];
        const content = parts.slice(1).join(' ');

        if (!content) {
            await sock.sendMessage(chatId, { 
                text: `❌ Please provide text to speak!\n\n*Example:* .tts grass|jp Hello trainer`,
                ...global.channelInfo 
            }, { quoted: message });
            return;
        }

        // Parse character and language from meta
        const [charKey, langKey] = meta.split('|');
        
        const character = CHAR_MAP[charKey?.toLowerCase()] || CHAR_MAP.grass;
        const language = LANG_MAP[langKey?.toLowerCase()] || LANG_MAP.jp;

        // Get character display name
        const charDisplay = Object.keys(CHAR_MAP).find(key => CHAR_MAP[key] === character) || 'grass';
        const langDisplay = Object.keys(LANG_MAP).find(key => LANG_MAP[key] === language) || 'jp';

        // Send processing message with reaction
        await sock.sendMessage(chatId, { 
            react: { text: '🧪', key: message.key } 
        });

        await sock.sendMessage(chatId, {
            text: `🎙️ *Generating TTS...*\n\n` +
                  `🗣️ *Character:* ${character}\n` +
                  `🌐 *Language:* ${language}\n` +
                  `📝 *Text:* "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"\n\n` +
                  `⏳ Please wait 20-40 seconds...`,
            ...global.channelInfo
        }, { quoted: message });

        // Generate TTS
        const audioUrl = await generateTTS(content, character, language);

        // Send the audio as voice message
        await sock.sendMessage(chatId, {
            audio: { url: audioUrl },
            mimetype: 'audio/mpeg',
            ptt: true,
            fileName: `tts-${charDisplay}-${langDisplay}.mp3`,
            ...global.channelInfo
        }, { quoted: message });

        // Success reaction
        await sock.sendMessage(chatId, { 
            react: { text: '✅', key: message.key } 
        });

    } catch (error) {
        console.error('❌ TTS error:', error);
        
        let errorMessage = 'TTS generation failed';
        
        if (error.message.includes('timeout')) {
            errorMessage = 'Generation timed out. Please try again with shorter text.';
        } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
            errorMessage = 'Cannot connect to TTS service. Server may be down.';
        } else if (error.message.includes('400')) {
            errorMessage = 'Invalid request. Check your format.';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        await sock.sendMessage(chatId, { 
            text: `❌ *TTS Error*\n\n📋 ${errorMessage}`,
            ...global.channelInfo 
        }, { quoted: message });
        
        await sock.sendMessage(chatId, { 
            react: { text: '❌', key: message.key } 
        });
    }
};

module.exports = ttsCommand;