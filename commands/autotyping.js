const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');

// Base directory for user-specific configs
const DATA_DIR = path.join(__dirname, '..', 'data', 'autotyping');

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
        console.error(`Error reading autotyping config for ${userId}:`, error);
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
        console.error(`Error saving autotyping config for ${userId}:`, error);
    }
}

/**
 * Check if autotyping is enabled for a specific user
 * @param {string} userId - The user's JID
 * @returns {boolean} Whether autotyping is enabled
 */
function isAutotypingEnabled(userId) {
    try {
        if (!userId) return false;
        const config = initUserConfig(userId);
        return config.enabled === true;
    } catch (error) {
        console.error('Error checking autotyping status:', error);
        return false;
    }
}

/**
 * Toggle autotyping feature for a specific user
 */
async function autotypingCommand(sock, chatId, message) {
    try {
        // Get the owner ID for this session
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
                    text: '❌ Invalid option! Use: .autotyping on/off',
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
            text: `✅ Auto-typing has been ${config.enabled ? 'enabled' : 'disabled'} for your session!`,
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
        console.error('Error in autotyping command:', error);
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
 * Function to handle autotyping for regular messages
 */
async function handleAutotypingForMessage(sock, chatId, userMessage) {
    try {
        const ownerId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        
        if (!isAutotypingEnabled(ownerId)) {
            return false;
        }
        
        try {
            // First subscribe to presence updates for this chat
            await sock.presenceSubscribe(chatId);
            
            // Send available status first
            await sock.sendPresenceUpdate('available', chatId);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Then send the composing status
            await sock.sendPresenceUpdate('composing', chatId);
            
            // Simulate typing time based on message length with increased minimum time
            const typingDelay = Math.max(3000, Math.min(8000, userMessage.length * 150));
            await new Promise(resolve => setTimeout(resolve, typingDelay));
            
            // Send composing again to ensure it stays visible
            await sock.sendPresenceUpdate('composing', chatId);
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Finally send paused status
            await sock.sendPresenceUpdate('paused', chatId);
            
            return true; // Indicates typing was shown
        } catch (error) {
            console.error('❌ Error sending typing indicator:', error);
            return false; // Indicates typing failed
        }
    } catch (error) {
        return false;
    }
}

/**
 * Function to handle autotyping for commands - BEFORE command execution
 */
async function handleAutotypingForCommand(sock, chatId) {
    try {
        const ownerId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        
        if (!isAutotypingEnabled(ownerId)) {
            return false;
        }
        
        try {
            // First subscribe to presence updates for this chat
            await sock.presenceSubscribe(chatId);
            
            // Send available status first
            await sock.sendPresenceUpdate('available', chatId);
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Then send the composing status
            await sock.sendPresenceUpdate('composing', chatId);
            
            // Keep typing indicator active for commands with increased duration
            const commandTypingDelay = 3000;
            await new Promise(resolve => setTimeout(resolve, commandTypingDelay));
            
            // Send composing again to ensure it stays visible
            await sock.sendPresenceUpdate('composing', chatId);
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Finally send paused status
            await sock.sendPresenceUpdate('paused', chatId);
            
            return true; // Indicates typing was shown
        } catch (error) {
            console.error('❌ Error sending command typing indicator:', error);
            return false; // Indicates typing failed
        }
    } catch (error) {
        return false;
    }
}

/**
 * Function to show typing status AFTER command execution
 */
async function showTypingAfterCommand(sock, chatId) {
    try {
        const ownerId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        
        if (!isAutotypingEnabled(ownerId)) {
            return false;
        }
        
        try {
            // Subscribe to presence updates
            await sock.presenceSubscribe(chatId);
            
            // Show typing status briefly
            await sock.sendPresenceUpdate('composing', chatId);
            
            // Keep typing visible for a short time
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Then pause
            await sock.sendPresenceUpdate('paused', chatId);
            
            return true;
        } catch (error) {
            console.error('❌ Error sending post-command typing indicator:', error);
            return false;
        }
    } catch (error) {
        return false;
    }
}

/**
 * Get all users with autotyping enabled (for stats/admin purposes)
 */
function getAutotypingEnabledUsers() {
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
        console.error('Error getting autotyping enabled users:', error);
        return [];
    }
}

module.exports = {
    autotypingCommand,
    isAutotypingEnabled,
    handleAutotypingForMessage,
    handleAutotypingForCommand,
    showTypingAfterCommand,
    getAutotypingEnabledUsers
};