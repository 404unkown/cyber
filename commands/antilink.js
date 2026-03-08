async function handleAntilinkCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message) {
    try {
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: '```For Group Admins Only!```' }, { quoted: message });
            return;
        }

        const args = userMessage.toLowerCase().trim().split(' ');
        const action = args[0];

        if (!action) {
            const usage = `\`\`\`ANTILINK SETUP\n\n.antilink on\n.antilink off\n\`\`\``;
            await sock.sendMessage(chatId, { text: usage }, { quoted: message });
            return;
        }

        if (action === 'on') {
            await sock.sendMessage(chatId, { text: '*_Antilink has been turned ON_*' },{ quoted: message });
        } else if (action === 'off') {
            await sock.sendMessage(chatId, { text: '*_Antilink has been turned OFF_*' }, { quoted: message });
        }
    } catch (error) {
        console.error('Error in antilink command:', error);
        await sock.sendMessage(chatId, { text: '*_Error processing antilink command_*' });
    }
}

async function handleLinkDetection(sock, chatId, message, userMessage, senderId) {
    if (userMessage.includes('chat.whatsapp.com')) {
        try {
            await sock.sendMessage(chatId, {
                delete: { remoteJid: chatId, fromMe: false, id: message.key.id, participant: senderId },
            });
            await sock.sendMessage(chatId, { text: `@${senderId.split('@')[0]}, posting links is not allowed.`, mentions: [senderId] });
        } catch (error) {
            console.error('Failed to delete message:', error);
        }
    }
}

module.exports = {
    handleAntilinkCommand,
    handleLinkDetection,
};