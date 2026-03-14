const { getUserSetting, updateUserSetting } = require('../lib/userSettings');
const isOwnerOrSudo = require('../lib/isOwner');

// Default message
const DEFAULT_MESSAGE = '⚠️ Direct messages are blocked!\nYou cannot DM this bot. Please contact the owner in group chats only.';

// Read state for a specific user
function readState(userId) {
    try {
        const enabled = getUserSetting(userId, 'dmblocker', false);
        const message = getUserSetting(userId, 'dmblocker_msg', DEFAULT_MESSAGE);
        
        return {
            enabled: enabled,
            message: message
        };
    } catch {
        return { enabled: false, message: DEFAULT_MESSAGE };
    }
}

// Write state for a specific user
function writeState(userId, enabled, message) {
    try {
        updateUserSetting(userId, 'dmblocker', enabled);
        
        if (message) {
            updateUserSetting(userId, 'dmblocker_msg', message);
        }
        
        return true;
    } catch (error) {
        console.error('Error writing dmblocker state:', error);
        return false;
    }
}

async function dmblockerCommand(sock, chatId, message, args) {
    const senderId = message.key.participant || message.key.remoteJid;
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
    
    // Owner only check
    if (!message.key.fromMe && !isOwner) {
        await sock.sendMessage(chatId, { text: 'Only bot owner can use this command!' }, { quoted: message });
        return;
    }
    
    const argStr = (args || '').trim();
    const [sub, ...rest] = argStr.split(' ');
    
    // Read state for THIS user
    const state = readState(senderId);

    if (!sub || !['on', 'off', 'status', 'setmsg'].includes(sub.toLowerCase())) {
        await sock.sendMessage(chatId, { 
            text: '*PM Blocker (Per User)*\n\n.dmblocker on - Enable PM auto-block for YOU\n.dmblocker off - Disable for YOU\n.dmblocker status - Show YOUR current status\n.dmblocker setmsg <text> - Set YOUR warning message' 
        }, { quoted: message });
        return;
    }

    if (sub.toLowerCase() === 'status') {
        await sock.sendMessage(chatId, { 
            text: `🔒 *Your PM Blocker Settings*\n\nStatus: *${state.enabled ? 'ON 🔴' : 'OFF ⚫'}*\nMessage: ${state.message}` 
        }, { quoted: message });
        return;
    }

    if (sub.toLowerCase() === 'setmsg') {
        const newMsg = rest.join(' ').trim();
        if (!newMsg) {
            await sock.sendMessage(chatId, { 
                text: 'Usage: .dmblocker setmsg <message>' 
            }, { quoted: message });
            return;
        }
        
        writeState(senderId, state.enabled, newMsg);
        await sock.sendMessage(chatId, { 
            text: '✅ *Your PM Blocker message has been updated!*' 
        }, { quoted: message });
        return;
    }

    const enable = sub.toLowerCase() === 'on';
    writeState(senderId, enable);
    
    await sock.sendMessage(chatId, { 
        text: `🔒 *PM Blocker for YOU is now ${enable ? 'ENABLED 🔴' : 'DISABLED ⚫'}*` 
    }, { quoted: message });
}

// Function to check if dmblocker is enabled for a specific user
function isDmblockerEnabled(userId) {
    const state = readState(userId);
    return state.enabled;
}

// Function to get dmblocker message for a specific user
function getDmblockerMessage(userId) {
    const state = readState(userId);
    return state.message;
}

module.exports = { 
    dmblockerCommand, 
    readState,
    isDmblockerEnabled,
    getDmblockerMessage
};