const fs = require('fs');
const path = require('path');

// Base directory for user-specific configs
const DATA_DIR = path.join(__dirname, '../data/anticall');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Legacy global config path (for backward compatibility)
const LEGACY_PATH = path.join(__dirname, '../data/anticall.json');

/**
 * Get user-specific config path
 */
function getUserConfigPath(userId) {
    const sanitizedId = userId.replace(/[^a-zA-Z0-9@._-]/g, '_');
    return path.join(DATA_DIR, `${sanitizedId}.json`);
}

/**
 * Read state for a specific user
 * If userId is provided, use per-user config
 * If no userId, try legacy config
 */
function readState(userId) {
    try {
        // If userId is provided, use per-user config
        if (userId) {
            const configPath = getUserConfigPath(userId);
            if (!fs.existsSync(configPath)) {
                return { enabled: false };
            }
            const raw = fs.readFileSync(configPath, 'utf8');
            const data = JSON.parse(raw || '{}');
            return { enabled: !!data.enabled };
        }
        
        // No userId - try legacy config (for backward compatibility)
        if (fs.existsSync(LEGACY_PATH)) {
            const raw = fs.readFileSync(LEGACY_PATH, 'utf8');
            const data = JSON.parse(raw || '{}');
            return { enabled: !!data.enabled };
        }
        
        return { enabled: false };
    } catch {
        return { enabled: false };
    }
}

/**
 * Write state for a specific user
 */
function writeState(userId, enabled) {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        
        const configPath = getUserConfigPath(userId);
        fs.writeFileSync(configPath, JSON.stringify({ enabled: !!enabled }, null, 2));
        
        // Also update legacy file for backward compatibility
        try {
            fs.writeFileSync(LEGACY_PATH, JSON.stringify({ enabled: !!enabled }, null, 2));
        } catch {}
        
    } catch (error) {
        console.error(`Error writing anticall config for ${userId}:`, error);
    }
}

/**
 * Check if anticall is enabled for a specific user
 */
function isAnticallEnabled(userId) {
    try {
        const state = readState(userId);
        return state.enabled;
    } catch {
        return false;
    }
}

/**
 * Anticall command handler
 */
async function anticallCommand(sock, chatId, message, args) {
    try {
        // Get the owner ID for this session
        const ownerId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const senderId = message.key.participant || message.key.remoteJid;
        
        // Check if the command sender is the owner of this session
        if (senderId !== ownerId && !message.key.fromMe) {
            await sock.sendMessage(chatId, { 
                text: '❌ This command is only available for the owner of this bot session!' 
            }, { quoted: message });
            return;
        }

        const state = readState(ownerId);
        const sub = (args || '').trim().toLowerCase();

        if (!sub || (sub !== 'on' && sub !== 'off' && sub !== 'status')) {
            await sock.sendMessage(chatId, { 
                text: '*📞 ANTICALL (Your Session)*\n\n' +
                      '• *.anticall on*  - Enable auto-block on incoming calls\n' +
                      '• *.anticall off* - Disable anticall\n' +
                      '• *.anticall status* - Show current status\n\n' +
                      `Current status: *${state.enabled ? 'ON' : 'OFF'}*` 
            }, { quoted: message });
            return;
        }

        if (sub === 'status') {
            await sock.sendMessage(chatId, { 
                text: `📞 Anticall is currently *${state.enabled ? 'ON' : 'OFF'}* for your session.` 
            }, { quoted: message });
            return;
        }

        const enable = sub === 'on';
        writeState(ownerId, enable);
        
        await sock.sendMessage(chatId, { 
            text: `✅ Anticall is now *${enable ? 'ENABLED' : 'DISABLED'}* for your session.` 
        }, { quoted: message });
        
    } catch (error) {
        console.error('Error in anticall command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Error processing anticall command!' 
        }, { quoted: message });
    }
}

module.exports = { 
    anticallCommand, 
    readState,  // Now works with or without userId
    isAnticallEnabled
};