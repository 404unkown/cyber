const fs = require('fs');
const path = require('path');
const { tmpdir } = require('os');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');

// Per-user message store
const messageStore = new Map(); // Key: `${userId}_${messageId}`

// Base directories
const DATA_DIR = path.join(__dirname, '../data/antidelete');
const TEMP_MEDIA_DIR = path.join(__dirname, '../tmp');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

const isOwnerOrSudo = require('../lib/isOwner');

/**
 * Get user-specific config path
 */
function getUserConfigPath(userId) {
    const sanitizedId = userId.replace(/[^a-zA-Z0-9@._-]/g, '_');
    return path.join(DATA_DIR, `${sanitizedId}.json`);
}

/**
 * Initialize user config
 */
function initUserConfig(userId) {
    const configPath = getUserConfigPath(userId);
    
    if (!fs.existsSync(configPath)) {
        const defaultConfig = { 
            enabled: false,
            forwardViewOnce: true, // Whether to forward view-once messages
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }
    
    try {
        return JSON.parse(fs.readFileSync(configPath));
    } catch (error) {
        console.error(`Error reading config for ${userId}:`, error);
        const defaultConfig = { enabled: false, forwardViewOnce: true };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }
}

/**
 * Save user config
 */
function saveUserConfig(userId, config) {
    try {
        const configPath = getUserConfigPath(userId);
        config.lastUpdated = new Date().toISOString();
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error(`Error saving config for ${userId}:`, error);
    }
}

/**
 * Check if antidelete is enabled for a user
 */
function isAntideleteEnabled(userId) {
    try {
        if (!userId) return false;
        const config = initUserConfig(userId);
        return config.enabled === true;
    } catch (error) {
        return false;
    }
}

/**
 * Should forward view-once messages for a user
 */
function shouldForwardViewOnce(userId) {
    try {
        if (!userId) return true; // Default to true
        const config = initUserConfig(userId);
        return config.forwardViewOnce !== false; // Default to true if not set
    } catch (error) {
        return true;
    }
}

/**
 * Function to get folder size in MB
 */
const getFolderSizeInMB = (folderPath) => {
    try {
        const files = fs.readdirSync(folderPath);
        let totalSize = 0;

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            if (fs.statSync(filePath).isFile()) {
                totalSize += fs.statSync(filePath).size;
            }
        }

        return totalSize / (1024 * 1024); // Convert bytes to MB
    } catch (err) {
        console.error('Error getting folder size:', err);
        return 0;
    }
};

/**
 * Function to clean temp folder if size exceeds 200MB
 */
const cleanTempFolderIfLarge = () => {
    try {
        const sizeMB = getFolderSizeInMB(TEMP_MEDIA_DIR);
        
        if (sizeMB > 200) {
            console.log(`🧹 Temp folder size (${sizeMB.toFixed(2)}MB) exceeds limit, cleaning...`);
            const files = fs.readdirSync(TEMP_MEDIA_DIR);
            for (const file of files) {
                const filePath = path.join(TEMP_MEDIA_DIR, file);
                try {
                    fs.unlinkSync(filePath);
                } catch (e) {
                    // Ignore errors for files in use
                }
            }
            console.log('✅ Temp folder cleaned');
        }
    } catch (err) {
        console.error('Temp cleanup error:', err);
    }
};

// Start periodic cleanup check every 1 minute
setInterval(cleanTempFolderIfLarge, 60 * 1000);

/**
 * Command Handler
 */
async function handleAntideleteCommand(sock, chatId, message, match) {
    try {
        const ownerId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const senderId = message.key.participant || message.key.remoteJid;
        const isOwner = senderId === ownerId || await isOwnerOrSudo(senderId, sock, chatId);
        
        if (!message.key.fromMe && !isOwner) {
            return sock.sendMessage(chatId, { 
                text: '*Only the owner of this bot session can use this command.*' 
            }, { quoted: message });
        }

        const config = initUserConfig(ownerId);
        const args = match ? match.toLowerCase().split(' ') : [];

        if (!match || args.length === 0) {
            return sock.sendMessage(chatId, {
                text: `*🔰 ANTIDELETE SETTINGS (Your Session) 🔰*\n\n` +
                      `📝 *Status:* ${config.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                      `👁️ *Forward View-Once:* ${config.forwardViewOnce ? '✅ Yes' : '❌ No'}\n\n` +
                      `*Commands:*\n` +
                      `• *.antidelete on* - Enable antidelete\n` +
                      `• *.antidelete off* - Disable antidelete\n` +
                      `• *.antidelete vv on* - Forward view-once messages\n` +
                      `• *.antidelete vv off* - Don't forward view-once\n` +
                      `• *.antidelete status* - Show current settings`
            }, {quoted: message});
        }

        const mainArg = args[0];
        
        if (mainArg === 'on' || mainArg === 'enable') {
            config.enabled = true;
            saveUserConfig(ownerId, config);
            return sock.sendMessage(chatId, { 
                text: `✅ *Antidelete enabled* for your session!` 
            }, {quoted:message});
        } 
        else if (mainArg === 'off' || mainArg === 'disable') {
            config.enabled = false;
            saveUserConfig(ownerId, config);
            return sock.sendMessage(chatId, { 
                text: `❌ *Antidelete disabled* for your session!` 
            }, {quoted:message});
        }
        else if (mainArg === 'vv' || mainArg === 'viewonce') {
            if (args.length < 2) {
                return sock.sendMessage(chatId, { 
                    text: `*View-Once Forwarding is currently:* ${config.forwardViewOnce ? '✅ Enabled' : '❌ Disabled'}\n\nUse: *.antidelete vv on/off*` 
                }, {quoted:message});
            }
            
            const vvAction = args[1];
            if (vvAction === 'on' || vvAction === 'enable') {
                config.forwardViewOnce = true;
                saveUserConfig(ownerId, config);
                return sock.sendMessage(chatId, { 
                    text: `✅ *View-once forwarding enabled* for your session!` 
                }, {quoted:message});
            } 
            else if (vvAction === 'off' || vvAction === 'disable') {
                config.forwardViewOnce = false;
                saveUserConfig(ownerId, config);
                return sock.sendMessage(chatId, { 
                    text: `❌ *View-once forwarding disabled* for your session!` 
                }, {quoted:message});
            }
        }
        else if (mainArg === 'status') {
            return sock.sendMessage(chatId, {
                text: `*📊 ANTIDELETE STATUS (Your Session)*\n\n` +
                      `• *Enabled:* ${config.enabled ? '✅ Yes' : '❌ No'}\n` +
                      `• *Forward View-Once:* ${config.forwardViewOnce ? '✅ Yes' : '❌ No'}\n` +
                      `• *Last Updated:* ${config.lastUpdated ? new Date(config.lastUpdated).toLocaleString() : 'Never'}`
            }, {quoted:message});
        }
        else {
            return sock.sendMessage(chatId, { 
                text: '*Invalid command. Use .antidelete to see usage.*' 
            }, {quoted:message});
        }

    } catch (error) {
        console.error('Error in antidelete command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Error processing command!' 
        });
    }
}

/**
 * Store incoming messages
 */
async function storeMessage(sock, message) {
    try {
        const ownerId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        if (!isAntideleteEnabled(ownerId)) return; // Don't store if antidelete is disabled

        if (!message.key?.id) return;

        const messageId = message.key.id;
        const storeKey = `${ownerId}_${messageId}`;
        let content = '';
        let mediaType = '';
        let mediaPath = '';
        let isViewOnce = false;

        const sender = message.key.participant || message.key.remoteJid;

        // Detect content (including view-once wrappers)
        const viewOnceContainer = message.message?.viewOnceMessageV2?.message || message.message?.viewOnceMessage?.message;
        if (viewOnceContainer) {
            // unwrap view-once content
            if (viewOnceContainer.imageMessage) {
                mediaType = 'image';
                content = viewOnceContainer.imageMessage.caption || '';
                try {
                    const buffer = await downloadContentFromMessage(viewOnceContainer.imageMessage, 'image');
                    mediaPath = path.join(TEMP_MEDIA_DIR, `${ownerId}_${messageId}.jpg`);
                    await writeFile(mediaPath, buffer);
                    isViewOnce = true;
                } catch (e) {
                    console.error('Error downloading view-once image:', e);
                }
            } else if (viewOnceContainer.videoMessage) {
                mediaType = 'video';
                content = viewOnceContainer.videoMessage.caption || '';
                try {
                    const buffer = await downloadContentFromMessage(viewOnceContainer.videoMessage, 'video');
                    mediaPath = path.join(TEMP_MEDIA_DIR, `${ownerId}_${messageId}.mp4`);
                    await writeFile(mediaPath, buffer);
                    isViewOnce = true;
                } catch (e) {
                    console.error('Error downloading view-once video:', e);
                }
            }
        } else if (message.message?.conversation) {
            content = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            content = message.message.extendedTextMessage.text;
        } else if (message.message?.imageMessage) {
            mediaType = 'image';
            content = message.message.imageMessage.caption || '';
            try {
                const buffer = await downloadContentFromMessage(message.message.imageMessage, 'image');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${ownerId}_${messageId}.jpg`);
                await writeFile(mediaPath, buffer);
            } catch (e) {
                console.error('Error downloading image:', e);
            }
        } else if (message.message?.stickerMessage) {
            mediaType = 'sticker';
            try {
                const buffer = await downloadContentFromMessage(message.message.stickerMessage, 'sticker');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${ownerId}_${messageId}.webp`);
                await writeFile(mediaPath, buffer);
            } catch (e) {
                console.error('Error downloading sticker:', e);
            }
        } else if (message.message?.videoMessage) {
            mediaType = 'video';
            content = message.message.videoMessage.caption || '';
            try {
                const buffer = await downloadContentFromMessage(message.message.videoMessage, 'video');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${ownerId}_${messageId}.mp4`);
                await writeFile(mediaPath, buffer);
            } catch (e) {
                console.error('Error downloading video:', e);
            }
        } else if (message.message?.audioMessage) {
            mediaType = 'audio';
            const mime = message.message.audioMessage.mimetype || '';
            const ext = mime.includes('mpeg') ? 'mp3' : (mime.includes('ogg') ? 'ogg' : 'mp3');
            try {
                const buffer = await downloadContentFromMessage(message.message.audioMessage, 'audio');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${ownerId}_${messageId}.${ext}`);
                await writeFile(mediaPath, buffer);
            } catch (e) {
                console.error('Error downloading audio:', e);
            }
        }

        // Store message
        if (!messageStore.has(ownerId)) {
            messageStore.set(ownerId, new Map());
        }
        
        const userMessages = messageStore.get(ownerId);
        userMessages.set(messageId, {
            content,
            mediaType,
            mediaPath,
            sender,
            group: message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null,
            timestamp: new Date().toISOString(),
            isViewOnce
        });

        // Anti-ViewOnce: forward immediately to owner if enabled
        if (isViewOnce && shouldForwardViewOnce(ownerId) && mediaPath && fs.existsSync(mediaPath)) {
            try {
                const senderName = sender.split('@')[0];
                const mediaOptions = {
                    caption: `*👁️ View-Once ${mediaType} Captured*\nFrom: @${senderName}`,
                    mentions: [sender]
                };
                
                if (mediaType === 'image') {
                    await sock.sendMessage(ownerId, { image: { url: mediaPath }, ...mediaOptions });
                } else if (mediaType === 'video') {
                    await sock.sendMessage(ownerId, { video: { url: mediaPath }, ...mediaOptions });
                }
                
                // Don't delete immediately - keep for potential deletion report
                // It will be cleaned up by temp cleaner or after deletion report
            } catch (e) {
                console.error('Error forwarding view-once:', e);
            }
        }

    } catch (err) {
        console.error('storeMessage error:', err);
    }
}

/**
 * Handle message deletion
 */
async function handleMessageRevocation(sock, revocationMessage) {
    try {
        const ownerId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        if (!isAntideleteEnabled(ownerId)) return;

        const protocolMsg = revocationMessage.message?.protocolMessage;
        if (!protocolMsg) return;
        
        const messageId = protocolMsg.key.id;
        const deletedBy = revocationMessage.participant || revocationMessage.key.participant || revocationMessage.key.remoteJid;

        // Don't report if deleted by owner
        if (deletedBy === ownerId) return;

        // Get stored message
        const userMessages = messageStore.get(ownerId);
        if (!userMessages) return;
        
        const original = userMessages.get(messageId);
        if (!original) return;

        const sender = original.sender;
        const senderName = sender.split('@')[0];
        const deletedByName = deletedBy.split('@')[0];
        
        let groupName = '';
        if (original.group) {
            try {
                groupName = (await sock.groupMetadata(original.group)).subject;
            } catch (e) {
                groupName = 'Unknown Group';
            }
        }

        const time = new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Kolkata',
            hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit',
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        let text = `*🔰 ANTIDELETE REPORT 🔰*\n\n` +
            `*🗑️ Deleted By:* @${deletedByName}\n` +
            `*👤 Original Sender:* @${senderName}\n` +
            `*📱 Number:* ${sender}\n` +
            `*🕒 Time:* ${time}\n`;

        if (groupName) text += `*👥 Group:* ${groupName}\n`;
        if (original.isViewOnce) text += `*👁️ Type:* View-Once ${original.mediaType || 'Message'}\n`;

        if (original.content) {
            text += `\n*💬 Deleted Message:*\n${original.content}`;
        }

        await sock.sendMessage(ownerId, {
            text,
            mentions: [deletedBy, sender]
        });

        // Send media if exists
        if (original.mediaType && original.mediaPath && fs.existsSync(original.mediaPath)) {
            const mediaOptions = {
                caption: `*Deleted ${original.mediaType}*\nFrom: @${senderName}`,
                mentions: [sender]
            };

            try {
                switch (original.mediaType) {
                    case 'image':
                        await sock.sendMessage(ownerId, {
                            image: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'sticker':
                        await sock.sendMessage(ownerId, {
                            sticker: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'video':
                        await sock.sendMessage(ownerId, {
                            video: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'audio':
                        await sock.sendMessage(ownerId, {
                            audio: { url: original.mediaPath },
                            mimetype: 'audio/mpeg',
                            ptt: false,
                            ...mediaOptions
                        });
                        break;
                }
            } catch (err) {
                await sock.sendMessage(ownerId, {
                    text: `⚠️ Error sending media: ${err.message}`
                });
            }

            // Cleanup media file
            try {
                fs.unlinkSync(original.mediaPath);
            } catch (err) {
                console.error('Media cleanup error:', err);
            }
        }

        // Remove from store
        userMessages.delete(messageId);

    } catch (err) {
        console.error('handleMessageRevocation error:', err);
    }
}

/**
 * Clean up old messages for a user (optional)
 */
function cleanupUserMessages(userId, maxAge = 24 * 60 * 60 * 1000) { // Default 24 hours
    try {
        const userMessages = messageStore.get(userId);
        if (!userMessages) return;
        
        const now = Date.now();
        for (const [messageId, data] of userMessages.entries()) {
            const msgTime = new Date(data.timestamp).getTime();
            if (now - msgTime > maxAge) {
                // Clean up media file
                if (data.mediaPath && fs.existsSync(data.mediaPath)) {
                    try {
                        fs.unlinkSync(data.mediaPath);
                    } catch (e) {}
                }
                userMessages.delete(messageId);
            }
        }
    } catch (error) {
        console.error('Error cleaning up user messages:', error);
    }
}

// Periodic cleanup for all users (every hour)
setInterval(() => {
    for (const [userId, userMessages] of messageStore.entries()) {
        cleanupUserMessages(userId);
    }
}, 60 * 60 * 1000);

module.exports = {
    handleAntideleteCommand,
    handleMessageRevocation,
    storeMessage,
    isAntideleteEnabled
};