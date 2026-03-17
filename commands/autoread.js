/**
 * mad max free bot - A WhatsApp Bot
 * Autoread Command - Automatically read all messages (Per User)
 */

const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');

// Base directory for user-specific configs
const DATA_DIR = path.join(__dirname, '..', 'data', 'autoread');

// Ensure base directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Get the config path for a specific user
 * @param {string} userId - The user's JID
 * @returns {string} Path to user's config file
 */
function getUserConfigPath(userId) {
    // Sanitize userId to create a valid filename
    const sanitizedId = userId.replace(/[^a-zA-Z0-9@._-]/g, '_');
    return path.join(DATA_DIR, `${sanitizedId}.json`);
}

/**
 * Initialize configuration for a specific user
 * @param {string} userId - The user's JID
 * @returns {Object} User's config object
 */
function initUserConfig(userId) {
    const configPath = getUserConfigPath(userId);
    
    if (!fs.existsSync(configPath)) {
        const defaultConfig = { 
            enabled: false,
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }
    
    try {
        return JSON.parse(fs.readFileSync(configPath));
    } catch (error) {
        console.error(`Error reading autoread config for ${userId}:`, error);
        const defaultConfig = { enabled: false };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }
}

/**
 * Save configuration for a specific user
 * @param {string} userId - The user's JID
 * @param {Object} config - User's config object
 */
function saveUserConfig(userId, config) {
    try {
        const configPath = getUserConfigPath(userId);
        config.lastUpdated = new Date().toISOString();
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error(`Error saving autoread config for ${userId}:`, error);
    }
}

/**
 * Check if autoread is enabled for a specific user
 * @param {string} userId - The user's JID
 * @returns {boolean} Whether autoread is enabled
 */
function isAutoreadEnabled(userId) {
    try {
        if (!userId) return false;
        const config = initUserConfig(userId);
        return config.enabled === true;
    } catch (error) {
        console.error('Error checking autoread status:', error);
        return false;
    }
}

/**
 * Toggle autoread feature for a specific user
 */
async function autoreadCommand(sock, chatId, message) {
    try {
        // Determine the owner's ID (the person who paired the bot)
        const ownerId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        
        // The user who sent the command
        const senderId = message.key.participant || message.key.remoteJid;
        
        // Check if the command sender is the owner of this session
        const isOwner = senderId === ownerId || await isOwnerOrSudo(senderId, sock, chatId);
        
        if (!isOwner) {
            await sock.sendMessage(chatId, {
                text: '❌ This command is only available for the owner of this bot session!',
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363401269012709@newsletter',
                        newsletterName: 'mad max free bot',
                        serverMessageId: -1
                    }
                }
            });
            return;
        }

        // Get command arguments
        const args = message.message?.conversation?.trim().split(' ').slice(1) || 
                    message.message?.extendedTextMessage?.text?.trim().split(' ').slice(1) || 
                    [];
        
        // Initialize or read user-specific config
        const config = initUserConfig(ownerId);
        
        // Toggle based on argument or toggle current state if no argument
        if (args.length > 0) {
            const action = args[0].toLowerCase();
            if (action === 'on' || action === 'enable') {
                config.enabled = true;
            } else if (action === 'off' || action === 'disable') {
                config.enabled = false;
            } else {
                await sock.sendMessage(chatId, {
                    text: '❌ Invalid option! Use: .autoread on/off',
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363401269012709@newsletter',
                            newsletterName: 'mad max free bot',
                            serverMessageId: -1
                        }
                    }
                });
                return;
            }
        } else {
            // Toggle current state
            config.enabled = !config.enabled;
        }
        
        // Save updated configuration for this user
        saveUserConfig(ownerId, config);
        
        // Send confirmation message
        await sock.sendMessage(chatId, {
            text: `✅ Auto-read has been ${config.enabled ? 'enabled' : 'disabled'} for your session!`,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363401269012709@newsletter',
                    newsletterName: 'mad max free bot',
                    serverMessageId: -1
                }
            }
        });
        
    } catch (error) {
        console.error('Error in autoread command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Error processing command!',
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363401269012709@newsletter',
                    newsletterName: 'mad max free bot',
                    serverMessageId: -1
                }
            }
        });
    }
}

/**
 * Function to check if bot is mentioned in a message
 */
function isBotMentionedInMessage(message, botNumber) {
    if (!message.message) return false;
    
    // Check for mentions in contextInfo (works for all message types)
    const messageTypes = [
        'extendedTextMessage', 'imageMessage', 'videoMessage', 'stickerMessage',
        'documentMessage', 'audioMessage', 'contactMessage', 'locationMessage'
    ];
    
    // Check for explicit mentions in mentionedJid array
    for (const type of messageTypes) {
        if (message.message[type]?.contextInfo?.mentionedJid) {
            const mentionedJid = message.message[type].contextInfo.mentionedJid;
            if (mentionedJid.some(jid => jid === botNumber)) {
                return true;
            }
        }
    }
    
    // Check for text mentions in various message types
    const textContent = 
        message.message.conversation || 
        message.message.extendedTextMessage?.text ||
        message.message.imageMessage?.caption ||
        message.message.videoMessage?.caption || '';
    
    if (textContent) {
        // Check for @mention format
        const botUsername = botNumber.split('@')[0];
        if (textContent.includes(`@${botUsername}`)) {
            return true;
        }
        
        // Check for bot name mentions (optional, can be customized)
        const botNames = [global.botname?.toLowerCase(), 'bot', 'knight', 'mad max free bot'];
        const words = textContent.toLowerCase().split(/\s+/);
        if (botNames.some(name => words.includes(name))) {
            return true;
        }
    }
    
    return false;
}

/**
 * Handle autoread functionality for a specific session
 * @param {Object} sock - The socket connection for this session
 * @param {Object} message - The message to potentially mark as read
 * @returns {Promise<boolean>} Whether message was marked as read
 */
async function handleAutoread(sock, message) {
    try {
        // Get the owner ID for this session
        const ownerId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        
        // Check if autoread is enabled for this specific user
        if (!isAutoreadEnabled(ownerId)) {
            return false;
        }
        
        // Get bot's ID
        const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        
        // Check if bot is mentioned
        const isBotMentioned = isBotMentionedInMessage(message, botNumber);
        
        // If bot is mentioned, read the message internally but don't mark as read in UI
        if (isBotMentioned) {
            // We don't call sock.readMessages() here, so the message stays unread in the UI
            return false; // Indicates message was not marked as read
        } else {
            // For regular messages, mark as read normally
            const key = { 
                remoteJid: message.key.remoteJid, 
                id: message.key.id, 
                participant: message.key.participant 
            };
            await sock.readMessages([key]);
            return true; // Indicates message was marked as read
        }
    } catch (error) {
        console.error('Error in handleAutoread:', error);
        return false;
    }
}

/**
 * Get all users with autoread enabled (for stats/admin purposes)
 * @returns {Array} List of users with autoread enabled
 */
function getAutoreadEnabledUsers() {
    try {
        if (!fs.existsSync(DATA_DIR)) return [];
        
        const files = fs.readdirSync(DATA_DIR);
        const enabledUsers = [];
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const configPath = path.join(DATA_DIR, file);
                    const config = JSON.parse(fs.readFileSync(configPath));
                    if (config.enabled) {
                        const userId = file.replace('.json', '');
                        enabledUsers.push({
                            userId,
                            lastUpdated: config.lastUpdated
                        });
                    }
                } catch (e) {
                    // Skip invalid files
                }
            }
        }
        
        return enabledUsers;
    } catch (error) {
        console.error('Error getting autoread enabled users:', error);
        return [];
    }
}

module.exports = {
    autoreadCommand,
    isAutoreadEnabled,
    isBotMentionedInMessage,
    handleAutoread,
    getAutoreadEnabledUsers
};