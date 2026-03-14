const axios = require('axios');

const BASE_URL = 'https://ai-studio.anisaofc.my.id/api';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome Mobile',
    'Content-Type': 'application/json',
    'Referer': 'https://ai-studio.anisaofc.my.id/',
    'Origin': 'https://ai-studio.anisaofc.my.id'
};

async function bufferToBase64(buffer, mime) {
    return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function aiStudio(endpoint, buffer, mime, prompt = '') {
    const payload = {
        image: await bufferToBase64(buffer, mime)
    };

    if (endpoint === 'edit-image') {
        if (!prompt) throw new Error('Prompt is required for image editing');
        payload.prompt = prompt;
    }

    const { data } = await axios.post(
        `${BASE_URL}/${endpoint}`,
        payload,
        { headers, maxBodyLength: Infinity }
    );

    return data;
}

const aiStudioCommand = async (sock, chatId, message, command, args) => {
    try {
        // Check if there's a quoted message
        const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!quotedMessage || !quotedMessage.imageMessage) {
            await sock.sendMessage(chatId, { 
                text: `❌ Please reply to an image with the command!\n\n*Available commands:*\n` +
                      `• .aiedit <prompt> - Edit image with AI\n` +
                      `• .aifigure - Convert image to figure style\n` +
                      `• .aicomic - Convert image to comic style\n` +
                      `• .aiwm - Remove watermark from image`,
                ...global.channelInfo 
            }, { quoted: message });
            return;
        }

        // Download the quoted image
        const messageId = message.message.extendedTextMessage.contextInfo.stanzaId;
        const participant = message.message.extendedTextMessage.contextInfo.participant || message.key.participant;
        
        const media = await sock.downloadMediaMessage({
            key: {
                remoteJid: chatId,
                id: messageId,
                participant: participant
            },
            message: quotedMessage
        });

        if (!media) {
            await sock.sendMessage(chatId, { 
                text: '❌ Failed to download image!',
                ...global.channelInfo 
            }, { quoted: message });
            return;
        }

        const buffer = media;
        const mime = quotedMessage.imageMessage.mimetype;

        // Send processing message
        await sock.sendMessage(chatId, { 
            text: '⏳ *Processing image with AI...*\nPlease wait a moment',
            ...global.channelInfo 
        }, { quoted: message });

        let endpoint, caption;
        const prompt = args.join(' ').trim();

        // Determine endpoint based on command
        switch (command) {
            case 'aiedit':
                if (!prompt) {
                    await sock.sendMessage(chatId, { 
                        text: '❌ Please provide a prompt for editing!\n\n*Example:* .aiedit make this a cartoon style',
                        ...global.channelInfo 
                    }, { quoted: message });
                    return;
                }
                endpoint = 'edit-image';
                caption = `✏️ *AI Edit*\n📝 Prompt: ${prompt}`;
                break;
                
            case 'aifigure':
                endpoint = 'to-figure';
                caption = '🗿 *Figure Mode* - Converted to figure style';
                break;
                
            case 'aicomic':
                endpoint = 'to-comic';
                caption = '📖 *Comic Style* - Converted to comic style';
                break;
                
            case 'aiwm':
                endpoint = 'remove-watermark';
                caption = '🧼 *Watermark Removed* - Image cleaned';
                break;
                
            default:
                return;
        }

        // Call AI Studio API
        const result = await aiStudio(endpoint, buffer, mime, prompt);

        if (!result?.success || !result.imageUrl) {
            throw new Error('API returned invalid response');
        }

        // Send the result
        await sock.sendMessage(chatId, {
            image: { url: result.imageUrl },
            caption: `${caption}\n\n⚙️ *Engine:* AI Studio\n👑 *OMEGATECH*`,
            ...global.channelInfo
        }, { quoted: message });

    } catch (error) {
        console.error('❌ AI Studio error:', error);
        
        let errorMessage = error.message || 'Unknown error occurred';
        
        if (errorMessage.includes('timeout') || errorMessage.includes('ECONNREFUSED')) {
            errorMessage = 'Connection to AI service failed. Please try again later.';
        } else if (errorMessage.includes('Prompt is required')) {
            errorMessage = 'Please provide a prompt for editing.';
        }
        
        await sock.sendMessage(chatId, { 
            text: `❌ *AI Studio Error*\n\n📋 ${errorMessage}`,
            ...global.channelInfo 
        }, { quoted: message });
    }
};

module.exports = aiStudioCommand;