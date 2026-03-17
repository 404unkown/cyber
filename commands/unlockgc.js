// commands/unlockgc.js
const fs = require('fs');
const path = require('path');

// Import isAdmin
const isAdmin = require('../lib/isAdmin');

async function unlockgcCommand(sock, chatId, message, rawText, senderId, isGroup) {
    await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
    
    try {
        // Check if in group
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, {
                text: '❌ This command can only be used in groups!',
                ...global.channelInfo
            }, { quoted: message });
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            return;
        }

        // Check admin status
        const adminStatus = await isAdmin(sock, chatId, senderId);
        
        if (!adminStatus.isSenderAdmin && !message.key.fromMe) {
            await sock.sendMessage(chatId, {
                text: '❌ Only group admins can use this command!',
                ...global.channelInfo
            }, { quoted: message });
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            return;
        }

        if (!adminStatus.isBotAdmin) {
            await sock.sendMessage(chatId, {
                text: '❌ Bot must be admin to use this command!',
                ...global.channelInfo
            }, { quoted: message });
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            return;
        }

        // Unlock the group (allow all members to send messages)
        await sock.groupSettingUpdate(chatId, 'not_announcement');
        
        await sock.sendMessage(chatId, {
            text: "✅ *Group messaging has been unlocked!*\n\n🔓 *Anyone can now send messages in this group.*",
            ...global.channelInfo
        }, { quoted: message });

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        
    } catch (error) {
        console.error("Unlock group error:", error);
        
        let errorMessage = '❌ Failed to unlock group!';
        if (error.message.includes('not an admin')) {
            errorMessage = '❌ Bot is not an admin!';
        } else if (error.message.includes('404')) {
            errorMessage = '❌ Group not found!';
        }
        
        await sock.sendMessage(chatId, {
            text: `${errorMessage}\n\nError: ${error.message}`,
            ...global.channelInfo
        }, { quoted: message });
        
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
    }
}

module.exports = unlockgcCommand;