const axios = require('axios');
const FormData = require('form-data');
const { fetchBuffer, getBuffer } = require('../lib/myfunc');

const uploadToCatbox = async (buffer) => {
    const form = new FormData();
    form.append('fileToUpload', buffer, 'image.jpg');
    form.append('reqtype', 'fileupload');

    const res = await axios.post(
        'https://catbox.moe/user/api.php',
        form,
        { headers: form.getHeaders() }
    );

    return res.data.trim();
};

const editfotoCommand = async (sock, chatId, message, args) => {
    try {
        // Get image from quoted message
        const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!quotedMessage || !quotedMessage.imageMessage) {
            await sock.sendMessage(chatId, { 
                text: '❌ *Please reply to an image!*\n\n*Usage:* `.editfoto make this a cartoon`',
                ...global.channelInfo 
            }, { quoted: message });
            return;
        }

        // Get the prompt from args
        const prompt = args.join(' ').trim();
        if (!prompt) {
            await sock.sendMessage(chatId, { 
                text: '❌ *Please provide a prompt!*\n\n*Example:* `.editfoto make this a cartoon style`',
                ...global.channelInfo 
            }, { quoted: message });
            return;
        }

        // Send processing message
        await sock.sendMessage(chatId, { 
            text: '⏳ *Processing image...*',
            ...global.channelInfo 
        }, { quoted: message });

        // Get the image URL from the quoted message
        const imageUrl = quotedMessage.imageMessage.url;
        
        // Download image using getBuffer from your myfunc
        const imageBuffer = await getBuffer(imageUrl);
        
        if (!imageBuffer || imageBuffer.length < 1000) {
            throw new Error('Failed to download image');
        }

        // Upload to Catbox
        await sock.sendMessage(chatId, { 
            text: '📤 *Uploading image...*',
            ...global.channelInfo 
        }, { quoted: message });

        const catboxUrl = await uploadToCatbox(imageBuffer);

        if (!catboxUrl.startsWith('https')) {
            throw new Error('Catbox upload failed');
        }

        // Call the edit API
        await sock.sendMessage(chatId, { 
            text: `🎨 *Editing image...*\n📝 *Prompt:* ${prompt}`,
            ...global.channelInfo 
        }, { quoted: message });

        const apiUrl = `https://api-faa.my.id/faa/editfoto?url=${encodeURIComponent(catboxUrl)}&prompt=${encodeURIComponent(prompt)}`;
        
        const response = await axios.get(apiUrl, {
            responseType: 'arraybuffer',
            timeout: 30000
        });

        // Check if response is valid image
        const firstBytes = response.data.slice(0, 4).toString('hex');
        const isValidImage = firstBytes.startsWith('ffd8') || // JPEG
                            firstBytes.startsWith('8950') || // PNG
                            firstBytes.startsWith('4749');   // GIF

        if (!isValidImage) {
            throw new Error('API returned invalid image format');
        }

        // Send the edited image
        await sock.sendMessage(chatId, {
            image: Buffer.from(response.data),
            caption: `✅ *Image edited successfully!*\n\n📝 *Prompt:* ${prompt}`,
            mimetype: 'image/jpeg',
            ...global.channelInfo
        }, { quoted: message });

    } catch (error) {
        console.error('❌ Editfoto error:', error);
        await sock.sendMessage(chatId, { 
            text: `❌ *Failed to edit image*\n\n📋 ${error.message || 'Unknown error'}`,
            ...global.channelInfo 
        }, { quoted: message });
    }
};

module.exports = editfotoCommand;