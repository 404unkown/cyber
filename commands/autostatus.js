const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');

const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363401269012709@newsletter',
            newsletterName: 'MAD MAX FREE BOT',
            serverMessageId: -1
        }
    }
};

// Base directory for user-specific configs
const DATA_DIR = path.join(__dirname, '../data/autostatus');

// Ensure data directory exists
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
            reactOn: false,
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }
    
    try {
        return JSON.parse(fs.readFileSync(configPath));
    } catch (error) {
        console.error(`Error reading autostatus config for ${userId}:`, error);
        const defaultConfig = { enabled: false, reactOn: false };
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
        console.error(`Error saving autostatus config for ${userId}:`, error);
    }
}

/**
 * Check if auto status is enabled for a specific user
 * @param {string} userId - The user's JID
 * @returns {boolean} Whether auto status is enabled
 */
function isAutoStatusEnabled(userId) {
    try {
        if (!userId) return false;
        const config = initUserConfig(userId);
        return config.enabled === true;
    } catch (error) {
        console.error('Error checking auto status config:', error);
        return false;
    }
}

/**
 * Check if status reactions are enabled for a specific user
 * @param {string} userId - The user's JID
 * @returns {boolean} Whether status reactions are enabled
 */
function isStatusReactionEnabled(userId) {
    try {
        if (!userId) return false;
        const config = initUserConfig(userId);
        return config.reactOn === true;
    } catch (error) {
        console.error('Error checking status reaction config:', error);
        return false;
    }
}

async function autoStatusCommand(sock, chatId, msg, args) {
    try {
        // Get the owner ID for this session
        const ownerId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const senderId = msg.key.participant || msg.key.remoteJid;
        
        // Check if the command sender is the owner of this session
        const isOwner = senderId === ownerId || await isOwnerOrSudo(senderId, sock, chatId);
        
        if (!isOwner) {
            await sock.sendMessage(chatId, { 
                text: '❌ This command is only available for the owner of this bot session!',
                ...channelInfo
            });
            return;
        }

        // Read current config for this user
        let config = initUserConfig(ownerId);

        // If no arguments, show current status
        if (!args || args.length === 0) {
            const status = config.enabled ? 'enabled' : 'disabled';
            const reactStatus = config.reactOn ? 'enabled' : 'disabled';
            await sock.sendMessage(chatId, { 
                text: `🔄 *Auto Status Settings (Your Session)*\n\n📱 *Auto Status View:* ${status}\n💫 *Status Reactions:* ${reactStatus}\n\n*Commands:*\n.autostatus on - Enable auto status view\n.autostatus off - Disable auto status view\n.autostatus react on - Enable status reactions\n.autostatus react off - Disable status reactions`,
                ...channelInfo
            });
            return;
        }

        // Handle on/off commands
        const command = args[0].toLowerCase();
        
        if (command === 'on') {
            config.enabled = true;
            saveUserConfig(ownerId, config);
            await sock.sendMessage(chatId, { 
                text: '✅ Auto status view has been enabled for your session!\nBot will now automatically view all contact statuses.',
                ...channelInfo
            });
        } else if (command === 'off') {
            config.enabled = false;
            saveUserConfig(ownerId, config);
            await sock.sendMessage(chatId, { 
                text: '❌ Auto status view has been disabled for your session!\nBot will no longer automatically view statuses.',
                ...channelInfo
            });
        } else if (command === 'react') {
            // Handle react subcommand
            if (!args[1]) {
                await sock.sendMessage(chatId, { 
                    text: '❌ Please specify on/off for reactions!\nUse: .autostatus react on/off',
                    ...channelInfo
                });
                return;
            }
            
            const reactCommand = args[1].toLowerCase();
            if (reactCommand === 'on') {
                config.reactOn = true;
                saveUserConfig(ownerId, config);
                await sock.sendMessage(chatId, { 
                    text: '💫 Status reactions have been enabled for your session!\nBot will now react to status updates.',
                    ...channelInfo
                });
            } else if (reactCommand === 'off') {
                config.reactOn = false;
                saveUserConfig(ownerId, config);
                await sock.sendMessage(chatId, { 
                    text: '❌ Status reactions have been disabled for your session!\nBot will no longer react to status updates.',
                    ...channelInfo
                });
            } else {
                await sock.sendMessage(chatId, { 
                    text: '❌ Invalid reaction command! Use: .autostatus react on/off',
                    ...channelInfo
                });
            }
        } else {
            await sock.sendMessage(chatId, { 
                text: '❌ Invalid command! Use:\n.autostatus on/off - Enable/disable auto status view\n.autostatus react on/off - Enable/disable status reactions',
                ...channelInfo
            });
        }

    } catch (error) {
        console.error('Error in autostatus command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Error occurred while managing auto status!\n' + error.message,
            ...channelInfo
        });
    }
}

/**
 * Function to react to status using proper method
 */
async function reactToStatus(sock, statusKey) {
    try {
        const ownerId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        if (!isStatusReactionEnabled(ownerId)) {
            return;
        }

        // Use the proper relayMessage method for status reactions
        await sock.relayMessage(
            'status@broadcast',
            {
                reactionMessage: {
                    key: {
                        remoteJid: 'status@broadcast',
                        id: statusKey.id,
                        participant: statusKey.participant || statusKey.remoteJid,
                        fromMe: false
                    },
                    text: '💚'
                }
            },
            {
                messageId: statusKey.id,
                statusJidList: [statusKey.remoteJid, statusKey.participant || statusKey.remoteJid]
            }
        );
        
        // Removed success log - only keep errors
    } catch (error) {
        console.error('❌ Error reacting to status:', error.message);
    }
}

/**
 * Function to handle status updates
 */
async function handleStatusUpdate(sock, status) {
    try {
        const ownerId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        
        if (!isAutoStatusEnabled(ownerId)) {
            return;
        }

        // Add delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Handle status from messages.upsert
        if (status.messages && status.messages.length > 0) {
            const msg = status.messages[0];
            if (msg.key && msg.key.remoteJid === 'status@broadcast') {
                try {
                    await sock.readMessages([msg.key]);
                    
                    // React to status if enabled for this user
                    await reactToStatus(sock, msg.key);
                    
                    // Removed success log - only keep errors
                } catch (err) {
                    if (err.message?.includes('rate-overlimit')) {
                        console.log('⚠️ Rate limit hit, waiting before retrying...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        await sock.readMessages([msg.key]);
                    } else {
                        throw err;
                    }
                }
                return;
            }
        }

        // Handle direct status updates
        if (status.key && status.key.remoteJid === 'status@broadcast') {
            try {
                await sock.readMessages([status.key]);
                
                // React to status if enabled for this user
                await reactToStatus(sock, status.key);
                
                // Removed success log - only keep errors
            } catch (err) {
                if (err.message?.includes('rate-overlimit')) {
                    console.log('⚠️ Rate limit hit, waiting before retrying...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await sock.readMessages([status.key]);
                } else {
                    throw err;
                }
            }
            return;
        }

        // Handle status in reactions
        if (status.reaction && status.reaction.key.remoteJid === 'status@broadcast') {
            try {
                await sock.readMessages([status.reaction.key]);
                
                // React to status if enabled for this user
                await reactToStatus(sock, status.reaction.key);
                
                // Removed success log - only keep errors
            } catch (err) {
                if (err.message?.includes('rate-overlimit')) {
                    console.log('⚠️ Rate limit hit, waiting before retrying...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await sock.readMessages([status.reaction.key]);
                } else {
                    throw err;
                }
            }
            return;
        }

    } catch (error) {
        console.error('❌ Error in auto status view:', error.message);
    }
}

/**
 * Get all users with auto status enabled (for stats/admin purposes)
 */
function getAutoStatusEnabledUsers() {
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
                            reactOn: config.reactOn,
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
        console.error('Error getting auto status enabled users:', error);
        return [];
    }
}

module.exports = {
    autoStatusCommand,
    handleStatusUpdate,
    isAutoStatusEnabled,
    isStatusReactionEnabled,
    getAutoStatusEnabledUsers
};