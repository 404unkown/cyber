const sharp = require('sharp');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const tempDir = './temp';
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const convertStickerToImage = async (sock, quotedMessage, chatId) => {
    try {
        const stickerMessage = quotedMessage.stickerMessage;
        if (!stickerMessage) {
            await sock.sendMessage(chatId, { text: 'Reply to a sticker with .simage to convert it.' });
            return;
        }

        const stickerFilePath = path.join(tempDir, `sticker_${Date.now()}.webp`);
        const outputImagePath = path.join(tempDir, `converted_image_${Date.now()}.png`);

        const stream = await downloadContentFromMessage(stickerMessage, 'sticker');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        await fsPromises.writeFile(stickerFilePath, buffer);
        await sharp(stickerFilePath).toFormat('png').toFile(outputImagePath);

        const imageBuffer = await fsPromises.readFile(outputImagePath);
        await sock.sendMessage(chatId, { image: imageBuffer, caption: 'Here is the converted image!' });

        // Cleanup
        setTimeout(() => {
            try { fs.unlinkSync(stickerFilePath); } catch (e) {}
            try { fs.unlinkSync(outputImagePath); } catch (e) {}
        }, 5000);
    } catch (error) {
        console.error('Error converting sticker to image:', error);
        await sock.sendMessage(chatId, { text: 'An error occurred while converting the sticker.' });
    }
};

module.exports = convertStickerToImage;