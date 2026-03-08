const fetch = require('node-fetch');

async function handleTranslateCommand(sock, chatId, message, match) {
    try {
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);

        let textToTranslate = '';
        let lang = '';

        const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quotedMessage) {
            textToTranslate = quotedMessage.conversation || 
                            quotedMessage.extendedTextMessage?.text || '';
            lang = match.trim();
        } else {
            const args = match.trim().split(' ');
            if (args.length < 2) {
                return sock.sendMessage(chatId, {
                    text: `*TRANSLATOR*\n\nUsage:\n.translate <lang> <text>\nExample: .translate fr hello`
                });
            }
            lang = args.pop();
            textToTranslate = args.join(' ');
        }

        if (!textToTranslate) return;

        const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(textToTranslate)}`);
        const data = await response.json();
        const translatedText = data[0][0][0];

        await sock.sendMessage(chatId, { text: translatedText }, { quoted: message });
    } catch (error) {
        console.error('❌ Error in translate command:', error);
    }
}

module.exports = { handleTranslateCommand };