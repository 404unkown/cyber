const fs = require("fs");
const path = require("path");
const axios = require('axios');
const yts = require('yt-search');
const fetch = require('node-fetch');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');
const fse = require('fs-extra');
const { performance } = require('perf_hooks');

// Import feature modules
const { anticallCommand, readState: readAnticallState } = require('./commands/anticall');
const { handleAntideleteCommand, handleMessageRevocation, storeMessage } = require('./commands/antidelete');
const { handleAntilinkCommand, handleLinkDetection } = require('./commands/antilink');
const { autoStatusCommand, handleStatusUpdate, isAutoStatusEnabled, isStatusReactionEnabled } = require('./commands/autostatus');
const { autotypingCommand, isAutotypingEnabled, showTypingAfterCommand } = require('./commands/autotyping');
const { handleTranslateCommand } = require('./commands/translate');
const { handleSsCommand } = require('./commands/ss');
const spotifyCommand = require('./commands/spotify');
const convertStickerToImage = require('./commands/simage');
const setProfilePicture = require('./commands/setpp');
const settingsCommand = require('./commands/settings');
const AUTO_STATUS_CONFIG = path.join(__dirname, '..', 'data', 'autoStatus.json');
const AUTO_REACT_CONFIG = path.join(__dirname, '..', 'data', 'autoReact.json');
const AUTO_READ_CONFIG = path.join(__dirname, '..', 'data', 'autoRead.json');
const AUTO_TYPING_CONFIG = path.join(__dirname, '..', 'data', 'autoTyping.json');

// Helper functions for auto features
function getAutoStatus(sessionId) {
    const userPath = getUserDataPath(sessionId, 'autoStatus.json');
    try {
        if (fs.existsSync(userPath)) {
            return JSON.parse(fs.readFileSync(userPath, 'utf8')).enabled || false;
        }
    } catch (e) {}
    return process.env.AUTO_STATUS === "true"; // Default from env
}

function setAutoStatus(sessionId, enabled) {
    const userPath = getUserDataPath(sessionId, 'autoStatus.json');
    fs.writeFileSync(userPath, JSON.stringify({ enabled }));
}

function getAutoReact(sessionId) {
    const userPath = getUserDataPath(sessionId, 'autoReact.json');
    try {
        if (fs.existsSync(userPath)) {
            return JSON.parse(fs.readFileSync(userPath, 'utf8')).enabled || false;
        }
    } catch (e) {}
    return process.env.AUTO_REACT_STATUS === "true";
}

function setAutoReact(sessionId, enabled) {
    const userPath = getUserDataPath(sessionId, 'autoReact.json');
    fs.writeFileSync(userPath, JSON.stringify({ enabled }));
}

function getAutoRead(sessionId) {
    const userPath = getUserDataPath(sessionId, 'autoRead.json');
    try {
        if (fs.existsSync(userPath)) {
            return JSON.parse(fs.readFileSync(userPath, 'utf8')).enabled || false;
        }
    } catch (e) {}
    return process.env.AUTO_READ === "true";
}

function setAutoRead(sessionId, enabled) {
    const userPath = getUserDataPath(sessionId, 'autoRead.json');
    fs.writeFileSync(userPath, JSON.stringify({ enabled }));
}

function getAutoTyping(sessionId) {
    const userPath = getUserDataPath(sessionId, 'autoTyping.json');
    try {
        if (fs.existsSync(userPath)) {
            return JSON.parse(fs.readFileSync(userPath, 'utf8')).enabled || false;
        }
    } catch (e) {}
    return process.env.AUTO_TYPING === "true";
}

function setAutoTyping(sessionId, enabled) {
    const userPath = getUserDataPath(sessionId, 'autoTyping.json');
    fs.writeFileSync(userPath, JSON.stringify({ enabled }));
}

// Utility functions for multi-user settings
const getUserDataPath = (sessionId, fileName) => {
    const userDataDir = path.join(__dirname, '..', 'data', 'users', sessionId);
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }
    return path.join(userDataDir, fileName);
};

const readUserJson = (sessionId, fileName, fallback = {}) => {
    try {
        const filePath = getUserDataPath(sessionId, fileName);
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        return fallback;
    } catch (error) {
        console.error(`Error reading ${fileName} for user ${sessionId}:`, error);
        return fallback;
    }
};

const writeUserJson = (sessionId, fileName, data) => {
    try {
        const filePath = getUserDataPath(sessionId, fileName);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error writing ${fileName} for user ${sessionId}:`, error);
        return false;
    }
};

// Check if user is admin in group
const isUserAdmin = async (conn, groupId, userId) => {
    try {
        const groupMetadata = await conn.groupMetadata(groupId);
        const participant = groupMetadata.participants.find(p => p.id === userId);
        return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
};

// Check if user is owner (matches bot owner number)
const isOwner = (userId, conn) => {
    const ownerNumber = process.env.OWNER_NUMBER?.replace(/\D/g, '') + '@s.whatsapp.net';
    return userId === ownerNumber;
};

// Forward long messages
const sendLongMessage = async (conn, chatId, text, quoted = null, options = {}) => {
    const MAX_LENGTH = 4096;
    
    if (text.length <= MAX_LENGTH) {
        return await conn.sendMessage(chatId, { text, ...options }, { quoted });
    }
    
    // Split into chunks
    const chunks = [];
    for (let i = 0; i < text.length; i += MAX_LENGTH) {
        chunks.push(text.substring(i, i + MAX_LENGTH));
    }
    
    // Send first chunk with forward indicator
    for (let i = 0; i < chunks.length; i++) {
        const chunkText = i === 0 
            ? `📎 *Forwarded Message (Part ${i+1}/${chunks.length})*\n\n${chunks[i]}`
            : `📎 *Part ${i+1}/${chunks.length}*\n\n${chunks[i]}`;
        
        await conn.sendMessage(chatId, { text: chunkText, ...options }, { quoted: i === 0 ? quoted : null });
        
        // Small delay between chunks
        if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
};

// Format runtime
const runtime = (seconds) => {
    seconds = Number(seconds);
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor(seconds % (3600 * 24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    
    const dDisplay = d > 0 ? d + (d == 1 ? " day, " : " days, ") : "";
    const hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : "";
    const mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : "";
    const sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : "";
    return dDisplay + hDisplay + mDisplay + sDisplay;
};

// Get greeting based on time
const getGreeting = () => {
    const currentHour = new Date().getHours();
    if (currentHour >= 5 && currentHour < 12) return 'Good Morning 🌅';
    if (currentHour >= 12 && currentHour < 16) return 'Good Afternoon ☀️';
    if (currentHour >= 16 && currentHour < 20) return 'Good Evening 🌇';
    return 'Good Night 😴';
};

class CommandHandler {
    constructor() {
        this.commands = new Map();
        this.userPrefixes = new Map();
        this.defaultPrefix = process.env.PREFIX || ".";
        this.botName = process.env.BOT_NAME || "CYBER";
        this.ownerName = process.env.OWNER_NAME || "OWNER";
        this.ownerNumber = process.env.OWNER_NUMBER || "";
        this.menuImageUrl = process.env.MENU_IMAGE_URL || "https://files.catbox.moe/lgj3y5.jpeg";
        this.repoLink = process.env.REPO_LINK || "https://github.com";
        this.commandsPath = path.join(__dirname, 'commands');
        
        // Load all commands
        this.loadAllCommands();
    }

    // Show typing indicator
    async showTyping(conn, chatId, duration = 2000) {
        try {
            await conn.presenceSubscribe(chatId);
            await conn.sendPresenceUpdate('composing', chatId);
            await new Promise(resolve => setTimeout(resolve, duration));
        } catch (error) {
            console.error('Error showing typing indicator:', error);
        }
    }

    loadAllCommands() {
        this.commands.clear();
        
        // ==================== DOWNLOAD COMMANDS ====================
        
        // Video download command
        this.commands.set('video', {
            pattern: 'video',
            alias: ['ytv', 'ytmp4'],
            desc: 'Download YouTube video',
            category: 'download',
            emoji: '🎬',
            execute: async (conn, message, m, { args, q, reply, from, sessionId, isOwner, isAdmin }) => {
                if (!q) return reply("Please provide a video name or YouTube link!");
                await this.showTyping(conn, from, 3000);
                
                try {
                    const { videos } = await yts(q);
                    if (!videos || videos.length === 0) return reply("No videos found!");
                    
                    const video = videos[0];
                    const response = await axios.get(`https://api.dreaded.site/api/ytdl/video?url=${video.url}`);
                    
                    if (response.data?.result?.url) {
                        await conn.sendMessage(from, {
                            video: { url: response.data.result.url },
                            mimetype: "video/mp4",
                            caption: `📹 *${video.title}*\n\nDownloaded by ${this.botName}`
                        }, { quoted: message });
                    }
                } catch (e) {
                    reply("Download failed: " + e.message);
                }
            }
        });

        // Play/Song download command
        this.commands.set('play', {
            pattern: 'play',
            alias: ['song', 'ytmp3', 'yta'],
            desc: 'Download YouTube audio',
            category: 'download',
            emoji: '🎵',
            execute: async (conn, message, m, { args, q, reply, from, sessionId }) => {
                if (!q) return reply("What song do you want to download?");
                await this.showTyping(conn, from, 3000);
                
                try {
                    const { videos } = await yts(q);
                    if (!videos || videos.length === 0) return reply("No songs found!");
                    
                    const video = videos[0];
                    const response = await axios.get(`https://api.dreaded.site/api/ytdl/audio?url=${video.url}`);
                    
                    if (response.data?.result?.url) {
                        await conn.sendMessage(from, {
                            audio: { url: response.data.result.url },
                            mimetype: "audio/mpeg",
                            fileName: `${video.title}.mp3`
                        }, { quoted: message });
                    }
                } catch (e) {
                    reply("Download failed: " + e.message);
                }
            }
        });

        // TikTok download command
        this.commands.set('tiktok', {
            pattern: 'tiktok',
            alias: ['tikdl', 'tt'],
            desc: 'Download TikTok video',
            category: 'download',
            emoji: '🎵',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                if (!q || !q.includes('tiktok.com')) return reply("Please provide a TikTok link!");
                await this.showTyping(conn, from, 3000);
                
                try {
                    const response = await axios.get(`https://api.bk9.dev/download/tiktok?url=${encodeURIComponent(q)}`);
                    
                    if (response.data.status && response.data.BK9) {
                        await conn.sendMessage(from, {
                            video: { url: response.data.BK9.BK9 },
                            caption: "Downloaded by " + this.botName
                        }, { quoted: message });
                    }
                } catch (e) {
                    reply("Download failed: " + e.message);
                }
            }
        });

        // Facebook download command
        this.commands.set('facebook', {
            pattern: 'facebook',
            alias: ['fb', 'fbdl'],
            desc: 'Download Facebook video',
            category: 'download',
            emoji: '📱',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                if (!q || !q.includes('facebook.com')) return reply("Please provide a Facebook link!");
                await this.showTyping(conn, from, 3000);
                
                try {
                    const data = await fetch(`https://api.dreaded.site/api/facebook?url=${q}`).then(res => res.json());
                    
                    if (data?.facebook?.sdVideo) {
                        await conn.sendMessage(from, {
                            video: { url: data.facebook.sdVideo },
                            caption: "Downloaded by " + this.botName
                        }, { quoted: message });
                    }
                } catch (e) {
                    reply("Download failed: " + e.message);
                }
            }
        });

// Auto Status command
this.commands.set('autostatus', {
    pattern: 'autostatus',
    alias: ['as'],
    desc: 'Toggle auto status view',
    category: 'owner',
    ownerOnly: true,
    emoji: '👁️',
    execute: async (conn, message, m, { args, q, reply, from, sessionId }) => {
        const current = getAutoStatus(sessionId);
        const newStatus = !current;
        setAutoStatus(sessionId, newStatus);
        
        reply(`👁️ *Auto Status View* ${newStatus ? '✅ ENABLED' : '❌ DISABLED'}\n\nBot will ${newStatus ? 'now' : 'no longer'} automatically view statuses.`);
    }
});

// Auto React command
this.commands.set('autoreact', {
    pattern: 'autoreact',
    alias: ['ar'],
    desc: 'Toggle auto react to status',
    category: 'owner',
    ownerOnly: true,
    emoji: '💫',
    execute: async (conn, message, m, { args, q, reply, from, sessionId }) => {
        const current = getAutoReact(sessionId);
        const newStatus = !current;
        setAutoReact(sessionId, newStatus);
        
        reply(`💫 *Auto React* ${newStatus ? '✅ ENABLED' : '❌ DISABLED'}\n\nBot will ${newStatus ? 'now' : 'no longer'} automatically react to statuses.`);
    }
});

// Auto Read command
this.commands.set('autoread', {
    pattern: 'autoread',
    alias: ['read'],
    desc: 'Toggle auto read messages',
    category: 'owner',
    ownerOnly: true,
    emoji: '📖',
    execute: async (conn, message, m, { args, q, reply, from, sessionId }) => {
        const current = getAutoRead(sessionId);
        const newStatus = !current;
        setAutoRead(sessionId, newStatus);
        
        reply(`📖 *Auto Read* ${newStatus ? '✅ ENABLED' : '❌ DISABLED'}\n\nBot will ${newStatus ? 'now' : 'no longer'} automatically read messages.`);
    }
});

// Auto Typing command
this.commands.set('autotyping', {
    pattern: 'autotyping',
    alias: ['at'],
    desc: 'Toggle auto typing indicator',
    category: 'owner',
    ownerOnly: true,
    emoji: '⌨️',
    execute: async (conn, message, m, { args, q, reply, from, sessionId }) => {
        const current = getAutoTyping(sessionId);
        const newStatus = !current;
        setAutoTyping(sessionId, newStatus);
        
        reply(`⌨️ *Auto Typing* ${newStatus ? '✅ ENABLED' : '❌ DISABLED'}\n\nBot will ${newStatus ? 'now' : 'no longer'} show typing indicators.`);
    }
});

// Auto settings status command
this.commands.set('autostatus', {
    pattern: 'autostatus',
    alias: ['astatus'],
    desc: 'View all auto feature settings',
    category: 'owner',
    ownerOnly: true,
    emoji: '⚙️',
    execute: async (conn, message, m, { args, q, reply, from, sessionId }) => {
        const autoStatus = getAutoStatus(sessionId) ? '✅ ON' : '❌ OFF';
        const autoReact = getAutoReact(sessionId) ? '✅ ON' : '❌ OFF';
        const autoRead = getAutoRead(sessionId) ? '✅ ON' : '❌ OFF';
        const autoTyping = getAutoTyping(sessionId) ? '✅ ON' : '❌ OFF';
        
        const msg = `╔══════════════════════╗
║   ⚙️ *AUTO SETTINGS*   ║
╚══════════════════════╝

👁️ *Auto Status View:* ${autoStatus}
💫 *Auto React:* ${autoReact}
📖 *Auto Read:* ${autoRead}
⌨️ *Auto Typing:* ${autoTyping}

*Commands:*
• .autostatus - Toggle status view
• .autoreact - Toggle status reactions
• .autoread - Toggle auto read
• .autotyping - Toggle typing indicator`;
        
        reply(msg);
    }
});
        // Instagram download command
        this.commands.set('instagram', {
            pattern: 'instagram',
            alias: ['ig', 'igdl'],
            desc: 'Download Instagram video',
            category: 'download',
            emoji: '📸',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                if (!q || !q.includes('instagram.com')) return reply("Please provide an Instagram link!");
                await this.showTyping(conn, from, 3000);
                
                try {
                    const { igdl } = require('ruhend-scraper');
                    const downloadData = await igdl(q);
                    
                    if (downloadData?.data?.length > 0) {
                        await conn.sendMessage(from, {
                            video: { url: downloadData.data[0].url },
                            caption: "Downloaded by " + this.botName
                        }, { quoted: message });
                    }
                } catch (e) {
                    reply("Download failed: " + e.message);
                }
            }
        });

        // Twitter download command
        this.commands.set('twitter', {
            pattern: 'twitter',
            alias: ['twtdl', 'xdl'],
            desc: 'Download Twitter video',
            category: 'download',
            emoji: '🐦',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                if (!q) return reply("Please provide a Twitter link!");
                await this.showTyping(conn, from, 3000);
                
                try {
                    const data = await fetch(`https://api.dreaded.site/api/alldl?url=${q}`).then(res => res.json());
                    
                    if (data?.data?.videoUrl) {
                        await conn.sendMessage(from, {
                            video: { url: data.data.videoUrl },
                            caption: "Downloaded by " + this.botName
                        }, { quoted: message });
                    }
                } catch (e) {
                    reply("Download failed: " + e.message);
                }
            }
        });

        // Spotify command
        this.commands.set('spotify', {
            pattern: 'spotify',
            alias: ['sp', 'spdl'],
            desc: 'Download from Spotify',
            category: 'download',
            emoji: '🎧',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                await spotifyCommand(conn, from, message, q);
            }
        });

        // ==================== STICKER COMMANDS ====================

        // Sticker command
        this.commands.set('sticker', {
            pattern: 'sticker',
            alias: ['s', 'stiker'],
            desc: 'Convert image/video to sticker',
            category: 'sticker',
            emoji: '🖼️',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                const quoted = message.quoted || message;
                const mime = (quoted.msg || quoted).mimetype || "";
                
                if (!/image|video/.test(mime)) return reply("Please quote an image or video!");
                await this.showTyping(conn, from, 2000);
                
                try {
                    const media = await conn.downloadMediaMessage(quoted);
                    const sticker = new Sticker(media, {
                        pack: this.botName,
                        author: this.ownerName,
                        type: StickerTypes.FULL,
                        quality: 70
                    });
                    
                    const buffer = await sticker.toBuffer();
                    await conn.sendMessage(from, { sticker: buffer }, { quoted: message });
                } catch (e) {
                    reply("Failed to create sticker: " + e.message);
                }
            }
        });

        // Take command (change sticker watermark)
        this.commands.set('take', {
            pattern: 'take',
            alias: ['wm'],
            desc: 'Change sticker watermark',
            category: 'sticker',
            emoji: '✂️',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                const quoted = message.quoted || message;
                const mime = (quoted.msg || quoted).mimetype || "";
                
                if (!/webp|image|video/.test(mime)) return reply("Please quote a sticker, image or video!");
                await this.showTyping(conn, from, 2000);
                
                try {
                    const media = await conn.downloadMediaMessage(quoted);
                    const sticker = new Sticker(media, {
                        pack: message.pushName || "User",
                        author: message.pushName || "User",
                        type: StickerTypes.FULL,
                        quality: 70
                    });
                    
                    const buffer = await sticker.toBuffer();
                    await conn.sendMessage(from, { sticker: buffer }, { quoted: message });
                } catch (e) {
                    reply("Failed: " + e.message);
                }
            }
        });

        // Toimage command (sticker to image)
        this.commands.set('toimage', {
            pattern: 'toimage',
            alias: ['simage', 'photo'],
            desc: 'Convert sticker to image',
            category: 'sticker',
            emoji: '📷',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                const quoted = message.quoted || message;
                if (!quoted.message?.stickerMessage) {
                    return reply("Please quote a sticker!");
                }
                await this.showTyping(conn, from, 2000);
                await convertStickerToImage(conn, quoted.message, from);
            }
        });

        // Attp command (animated text sticker)
        this.commands.set('attp', {
            pattern: 'attp',
            alias: ['textsticker'],
            desc: 'Create animated text sticker',
            category: 'sticker',
            emoji: '📝',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                if (!q) return reply("Provide text!");
                await this.showTyping(conn, from, 2000);
                
                try {
                    const url = `https://api.lolhuman.xyz/api/attp?apikey=cde5404984da80591a2692b6&text=${encodeURIComponent(q)}`;
                    const buffer = await fetch(url).then(res => res.buffer());
                    await conn.sendMessage(from, { sticker: buffer }, { quoted: message });
                } catch (e) {
                    reply("Failed: " + e.message);
                }
            }
        });

        // Mix command (emoji mixing)
        this.commands.set('mix', {
            pattern: 'mix',
            alias: ['emix'],
            desc: 'Mix two emojis',
            category: 'sticker',
            emoji: '🔄',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                if (!q) return reply("Provide emojis (e.g., 😂+😭)");
                await this.showTyping(conn, from, 2000);
                
                const emojis = q.split('+');
                if (emojis.length !== 2) return reply("Use format: emoji1+emoji2");
                
                try {
                    const response = await axios.get(`https://levanter.onrender.com/emix?q=${emojis[0]}${emojis[1]}`);
                    
                    if (response.data.status) {
                        const sticker = new Sticker(response.data.result, {
                            pack: this.botName,
                            type: StickerTypes.CROPPED,
                            quality: 70
                        });
                        const buffer = await sticker.toBuffer();
                        await conn.sendMessage(from, { sticker: buffer }, { quoted: message });
                    }
                } catch (e) {
                    reply("Failed to create emoji mix");
                }
            }
        });

        // ==================== AI COMMANDS ====================

        // Gemini AI command
        this.commands.set('gemini', {
            pattern: 'gemini',
            alias: ['ai'],
            desc: 'Ask Gemini AI',
            category: 'ai',
            emoji: '🤖',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                if (!q) return reply("What's your question?");
                await this.showTyping(conn, from, 3000);
                
                try {
                    const { default: Gemini } = await import('gemini-ai');
                    const gemini = new Gemini("AIzaSyDJUtskTG-MvQdlT4tNE319zBqLMFei8nQ");
                    const chat = gemini.createChat();
                    const res = await chat.ask(q);
                    
                    // Send long response with forwarding if needed
                    await sendLongMessage(conn, from, res, message);
                } catch (e) {
                    reply("Error: " + e.message);
                }
            }
        });

        // GPT command
        this.commands.set('gpt', {
            pattern: 'gpt',
            alias: ['gpt3', 'gpt4'],
            desc: 'Ask GPT AI',
            category: 'ai',
            emoji: '🧠',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                if (!q) return reply("What's your question?");
                await this.showTyping(conn, from, 3000);
                
                try {
                    const d = await fetch(`https://bk9.fun/ai/jeeves-chat2?q=${encodeURIComponent(q)}`).then(res => res.json());
                    const response = d.BK9 || "No response";
                    await sendLongMessage(conn, from, response, message);
                } catch (e) {
                    reply("Error: " + e.message);
                }
            }
        });

        // DarkGPT command
        this.commands.set('darkgpt', {
            pattern: 'darkgpt',
            alias: ['dai'],
            desc: 'Ask DarkGPT',
            category: 'ai',
            emoji: '👿',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                if (!q) return reply("What do you want to ask?");
                await this.showTyping(conn, from, 3000);
                
                try {
                    const data = await fetch(`https://api.dreaded.site/api/makgpt?text=${encodeURIComponent(q)}`).then(res => res.json());
                    const response = data.result || "No response";
                    await sendLongMessage(conn, from, response, message);
                } catch (e) {
                    reply("Error: " + e.message);
                }
            }
        });

        // ==================== GROUP COMMANDS ====================

        // Tagall command
        this.commands.set('tagall', {
            pattern: 'tagall',
            alias: ['everyone'],
            desc: 'Tag all group members',
            category: 'group',
            adminOnly: true,
            emoji: '📢',
            execute: async (conn, message, m, { args, q, reply, from, isGroup, groupMetadata, isAdmin }) => {
                if (!isGroup) return reply("This command only works in groups!");
                if (!isAdmin) return reply("❌ This command requires admin privileges!");
                
                await this.showTyping(conn, from, 2000);
                
                const participants = groupMetadata?.participants || [];
                let teks = `╔═━════━【📢 𝐓𝐀𝐆𝐀𝐋𝐋】━════━╗\n\n`;
                if (q) teks += `Message: ${q}\n\n`;
                
                for (let mem of participants) {
                    teks += `➤ @${mem.id.split('@')[0]}\n`;
                }
                
                teks += `\n╚═━════【${this.botName}】════━╝`;
                
                await conn.sendMessage(from, {
                    text: teks,
                    mentions: participants.map(a => a.id)
                }, { quoted: message });
            }
        });

        // Hidetag command
        this.commands.set('hidetag', {
            pattern: 'hidetag',
            alias: ['htag'],
            desc: 'Hidden tag all members',
            category: 'group',
            adminOnly: true,
            emoji: '👻',
            execute: async (conn, message, m, { args, q, reply, from, isGroup, groupMetadata, isAdmin }) => {
                if (!isGroup) return reply("This command only works in groups!");
                if (!isAdmin) return reply("❌ This command requires admin privileges!");
                
                const participants = groupMetadata?.participants || [];
                await conn.sendMessage(from, {
                    text: q || "👀",
                    mentions: participants.map(a => a.id)
                }, { quoted: message });
            }
        });

        // Kick command
        this.commands.set('kick', {
            pattern: 'kick',
            alias: ['remove'],
            desc: 'Remove user from group',
            category: 'group',
            adminOnly: true,
            emoji: '👢',
            execute: async (conn, message, m, { args, q, reply, from, isGroup, sender, isAdmin }) => {
                if (!isGroup) return reply("This command only works in groups!");
                if (!isAdmin) return reply("❌ This command requires admin privileges!");
                
                let users = message.mentionedJid?.[0] || m.quoted?.sender;
                if (!users) return reply("Tag someone to kick!");
                
                await conn.groupParticipantsUpdate(from, [users], 'remove');
                await reply(`@${users.split('@')[0]} removed!`, { mentions: [users] });
            }
        });

        // Promote command
        this.commands.set('promote', {
            pattern: 'promote',
            alias: ['admin'],
            desc: 'Promote user to admin',
            category: 'group',
            adminOnly: true,
            emoji: '⬆️',
            execute: async (conn, message, m, { args, q, reply, from, isGroup, isAdmin }) => {
                if (!isGroup) return reply("This command only works in groups!");
                if (!isAdmin) return reply("❌ This command requires admin privileges!");
                
                let users = message.mentionedJid?.[0] || m.quoted?.sender;
                if (!users) return reply("Tag someone to promote!");
                
                await conn.groupParticipantsUpdate(from, [users], 'promote');
                await reply(`@${users.split('@')[0]} is now admin!`, { mentions: [users] });
            }
        });

        // Demote command
        this.commands.set('demote', {
            pattern: 'demote',
            alias: [],
            desc: 'Demote user from admin',
            category: 'group',
            adminOnly: true,
            emoji: '⬇️',
            execute: async (conn, message, m, { args, q, reply, from, isGroup, isAdmin }) => {
                if (!isGroup) return reply("This command only works in groups!");
                if (!isAdmin) return reply("❌ This command requires admin privileges!");
                
                let users = message.mentionedJid?.[0] || m.quoted?.sender;
                if (!users) return reply("Tag someone to demote!");
                
                await conn.groupParticipantsUpdate(from, [users], 'demote');
                await reply(`@${users.split('@')[0]} is no longer admin!`, { mentions: [users] });
            }
        });

        // Close group command
        this.commands.set('close', {
            pattern: 'close',
            alias: ['mute'],
            desc: 'Close group (only admins can chat)',
            category: 'group',
            adminOnly: true,
            emoji: '🔒',
            execute: async (conn, message, m, { args, q, reply, from, isGroup, isAdmin }) => {
                if (!isGroup) return reply("This command only works in groups!");
                if (!isAdmin) return reply("❌ This command requires admin privileges!");
                
                await conn.groupSettingUpdate(from, 'announcement');
                reply("🔒 Group closed. Only admins can send messages.");
            }
        });

        // Open group command
        this.commands.set('open', {
            pattern: 'open',
            alias: ['unmute'],
            desc: 'Open group (everyone can chat)',
            category: 'group',
            adminOnly: true,
            emoji: '🔓',
            execute: async (conn, message, m, { args, q, reply, from, isGroup, isAdmin }) => {
                if (!isGroup) return reply("This command only works in groups!");
                if (!isAdmin) return reply("❌ This command requires admin privileges!");
                
                await conn.groupSettingUpdate(from, 'not_announcement');
                reply("🔓 Group opened. Everyone can send messages.");
            }
        });

        // Group link command
        this.commands.set('link', {
            pattern: 'link',
            alias: ['linkgroup', 'grouplink'],
            desc: 'Get group invite link',
            category: 'group',
            adminOnly: true,
            emoji: '🔗',
            execute: async (conn, message, m, { args, q, reply, from, isGroup, isAdmin }) => {
                if (!isGroup) return reply("This command only works in groups!");
                if (!isAdmin) return reply("❌ This command requires admin privileges!");
                
                const code = await conn.groupInviteCode(from);
                reply(`https://chat.whatsapp.com/${code}`);
            }
        });

        // Revoke link command
        this.commands.set('revoke', {
            pattern: 'revoke',
            alias: ['newlink'],
            desc: 'Revoke and generate new group link',
            category: 'group',
            adminOnly: true,
            emoji: '🔄',
            execute: async (conn, message, m, { args, q, reply, from, isGroup, isAdmin }) => {
                if (!isGroup) return reply("This command only works in groups!");
                if (!isAdmin) return reply("❌ This command requires admin privileges!");
                
                await conn.groupRevokeInvite(from);
                const code = await conn.groupInviteCode(from);
                reply(`✅ New group link generated!\nhttps://chat.whatsapp.com/${code}`);
            }
        });

        // Leave group command
        this.commands.set('leave', {
            pattern: 'leave',
            alias: ['exit'],
            desc: 'Bot leave the group',
            category: 'group',
            ownerOnly: true,
            emoji: '🚪',
            execute: async (conn, message, m, { args, q, reply, from, isGroup, isOwner }) => {
                if (!isGroup) return reply("This command only works in groups!");
                if (!isOwner) return reply("❌ This command is only for the bot owner!");
                
                await conn.sendMessage(from, { text: "👋 Goodbye everyone!" });
                await conn.groupLeave(from);
            }
        });

        // Delete message command
        this.commands.set('delete', {
            pattern: 'delete',
            alias: ['del'],
            desc: 'Delete a message',
            category: 'group',
            emoji: '🗑️',
            execute: async (conn, message, m, { args, q, reply, from, isGroup, isAdmin, isOwner }) => {
                if (!m.quoted) return reply("Quote a message to delete!");
                
                // Check if user can delete (admin or owner or own message)
                const canDelete = isAdmin || isOwner || m.quoted.sender === (message.key.participant || message.key.remoteJid);
                if (!canDelete) return reply("❌ You can only delete your own messages!");
                
                await conn.sendMessage(from, {
                    delete: {
                        remoteJid: from,
                        fromMe: false,
                        id: m.quoted.message.key.id,
                        participant: m.quoted.sender
                    }
                });
            }
        });

        // Antilink command
        this.commands.set('antilink', {
            pattern: 'antilink',
            alias: ['antilink'],
            desc: 'Manage antilink protection',
            category: 'group',
            adminOnly: true,
            emoji: '🚫',
            execute: async (conn, message, m, { args, q, reply, from, isGroup, sessionId, isAdmin }) => {
                if (!isGroup) return reply("This command only works in groups!");
                if (!isAdmin) return reply("❌ This command requires admin privileges!");
                
                await handleAntilinkCommand(conn, from, message, q, message.key.participant || message.key.remoteJid, isAdmin, message);
            }
        });

        // ==================== OWNER COMMANDS ====================

        // Block command
        this.commands.set('block', {
            pattern: 'block',
            alias: [],
            desc: 'Block a user',
            category: 'owner',
            ownerOnly: true,
            emoji: '⛔',
            execute: async (conn, message, m, { args, q, reply, from, isOwner }) => {
                if (!isOwner) return reply("❌ This command is only for the bot owner!");
                
                let users = message.mentionedJid?.[0] || m.quoted?.sender || (q ? q + '@s.whatsapp.net' : null);
                if (!users) return reply("Tag someone to block!");
                
                await conn.updateBlockStatus(users, 'block');
                reply(`@${users.split('@')[0]} blocked!`, { mentions: [users] });
            }
        });

        // Unblock command
        this.commands.set('unblock', {
            pattern: 'unblock',
            alias: [],
            desc: 'Unblock a user',
            category: 'owner',
            ownerOnly: true,
            emoji: '✅',
            execute: async (conn, message, m, { args, q, reply, from, isOwner }) => {
                if (!isOwner) return reply("❌ This command is only for the bot owner!");
                
                let users = message.mentionedJid?.[0] || m.quoted?.sender || (q ? q + '@s.whatsapp.net' : null);
                if (!users) return reply("Tag someone to unblock!");
                
                await conn.updateBlockStatus(users, 'unblock');
                reply(`@${users.split('@')[0]} unblocked!`, { mentions: [users] });
            }
        });

        // Join group command
        this.commands.set('join', {
            pattern: 'join',
            alias: [],
            desc: 'Bot join a group',
            category: 'owner',
            ownerOnly: true,
            emoji: '➕',
            execute: async (conn, message, m, { args, q, reply, from, isOwner }) => {
                if (!isOwner) return reply("❌ This command is only for the bot owner!");
                if (!q) return reply("Provide a group link!");
                
                const inviteCode = q.split('https://chat.whatsapp.com/')[1];
                if (!inviteCode) return reply("Invalid group link!");
                
                try {
                    await conn.groupAcceptInvite(inviteCode);
                    reply("✅ Successfully joined group!");
                } catch (e) {
                    reply("Failed to join: " + e.message);
                }
            }
        });

        // Broadcast command
        this.commands.set('broadcast', {
            pattern: 'broadcast',
            alias: ['cast', 'bc'],
            desc: 'Broadcast message to all groups',
            category: 'owner',
            ownerOnly: true,
            emoji: '📢',
            execute: async (conn, message, m, { args, q, reply, from, isOwner }) => {
                if (!isOwner) return reply("❌ This command is only for the bot owner!");
                if (!q) return reply("Provide a message to broadcast!");
                
                await this.showTyping(conn, from, 2000);
                
                const getGroups = await conn.groupFetchAllParticipating();
                const groups = Object.keys(getGroups);
                
                await reply(`📢 Broadcasting to ${groups.length} groups...`);
                
                for (let group of groups) {
                    try {
                        await conn.sendMessage(group, { text: `📢 *BROADCAST*\n\n${q}` });
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    } catch (e) {}
                }
                
                reply(`✅ Broadcast sent to ${groups.length} groups!`);
            }
        });

        // Eval command
        this.commands.set('>', {
            pattern: '>',
            alias: ['eval'],
            desc: 'Evaluate JavaScript code',
            category: 'owner',
            ownerOnly: true,
            emoji: '💻',
            execute: async (conn, message, m, { args, q, reply, from, isOwner }) => {
                if (!isOwner) return reply("❌ This command is only for the bot owner!");
                
                try {
                    let evaled = await eval(q);
                    if (typeof evaled !== 'string') evaled = require('util').inspect(evaled);
                    
                    // Send long evaluation results with forwarding
                    await sendLongMessage(conn, from, String(evaled), message);
                } catch (err) {
                    reply(String(err));
                }
            }
        });

        // Restart command
        this.commands.set('restart', {
            pattern: 'restart',
            alias: ['reboot'],
            desc: 'Restart the bot',
            category: 'owner',
            ownerOnly: true,
            emoji: '🔄',
            execute: async (conn, message, m, { args, q, reply, from, isOwner }) => {
                if (!isOwner) return reply("❌ This command is only for the bot owner!");
                
                await reply("Restarting...");
                process.exit();
            }
        });

        // Set profile picture command
        this.commands.set('setpp', {
            pattern: 'setpp',
            alias: ['setprofile'],
            desc: 'Set bot profile picture',
            category: 'owner',
            ownerOnly: true,
            emoji: '🖼️',
            execute: async (conn, message, m, { args, q, reply, from, isOwner }) => {
                if (!isOwner) return reply("❌ This command is only for the bot owner!");
                await setProfilePicture(conn, from, message);
            }
        });

        // Anticall command
        this.commands.set('anticall', {
            pattern: 'anticall',
            alias: [],
            desc: 'Manage anticall feature',
            category: 'owner',
            ownerOnly: true,
            emoji: '📞',
            execute: async (conn, message, m, { args, q, reply, from, sessionId, isOwner }) => {
                if (!isOwner) return reply("❌ This command is only for the bot owner!");
                await anticallCommand(conn, from, message, q);
            }
        });

        // Antidelete command
        this.commands.set('antidelete', {
            pattern: 'antidelete',
            alias: ['antidel'],
            desc: 'Manage antidelete feature',
            category: 'owner',
            ownerOnly: true,
            emoji: '🗑️',
            execute: async (conn, message, m, { args, q, reply, from, sessionId, isOwner }) => {
                if (!isOwner) return reply("❌ This command is only for the bot owner!");
                await handleAntideleteCommand(conn, from, message, q);
            }
        });

        // Autostatus command
        this.commands.set('autostatus', {
            pattern: 'autostatus',
            alias: ['astatus'],
            desc: 'Manage auto status feature',
            category: 'owner',
            ownerOnly: true,
            emoji: '📱',
            execute: async (conn, message, m, { args, q, reply, from, sessionId, isOwner }) => {
                if (!isOwner) return reply("❌ This command is only for the bot owner!");
                const argsArray = q ? q.split(' ') : [];
                await autoStatusCommand(conn, from, message, argsArray);
            }
        });

        // Autotyping command
        this.commands.set('autotyping', {
            pattern: 'autotyping',
            alias: ['atype'],
            desc: 'Manage autotyping feature',
            category: 'owner',
            ownerOnly: true,
            emoji: '⌨️',
            execute: async (conn, message, m, { args, q, reply, from, sessionId, isOwner }) => {
                if (!isOwner) return reply("❌ This command is only for the bot owner!");
                await autotypingCommand(conn, from, message);
            }
        });

        // Settings command
        this.commands.set('settings', {
            pattern: 'settings',
            alias: ['config', 'cfg'],
            desc: 'View bot settings',
            category: 'owner',
            ownerOnly: true,
            emoji: '⚙️',
            execute: async (conn, message, m, { args, q, reply, from, sessionId, isOwner }) => {
                if (!isOwner) return reply("❌ This command is only for the bot owner!");
                await settingsCommand(conn, from, message);
            }
        });

        // ==================== UTILITY COMMANDS ====================

        // Ping command
        this.commands.set('ping', {
            pattern: 'ping',
            alias: ['speed', 'pong'],
            desc: 'Check bot response time',
            category: 'utility',
            emoji: '🏓',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                const start = Date.now();
                await reply("🏓 *Pong!*");
                const end = Date.now();
                const responseTime = (end - start);
                await reply(`⚡ *Speed:* ${responseTime}ms`);
            }
        });

        // Uptime command
        this.commands.set('uptime', {
            pattern: 'uptime',
            alias: ['runtime', 'up'],
            desc: 'Check bot uptime',
            category: 'utility',
            emoji: '⏱️',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                const uptime = process.uptime();
                reply(`🤖 *Bot Uptime:* ${runtime(uptime)}`);
            }
        });

        // Menu command (Enhanced with cool emojis like your friend's)
        this.commands.set('menu', {
            pattern: 'menu',
            alias: ['help', 'cmd', 'commands'],
            desc: 'Show bot menu',
            category: 'utility',
            emoji: '📋',
            execute: async (conn, message, m, { args, q, reply, from, sessionId }) => {
                await this.showTyping(conn, from, 3000);
                
                // Get user-specific prefix
                const userPrefix = this.userPrefixes.get(sessionId) || this.defaultPrefix;
                const uptime = process.uptime();
                const speed = performance.now().toFixed(2);
                
                // Group commands by category with emojis
                const categories = {
                    'download': { name: '𝐃𝐎𝐖𝐍𝐋𝐎𝐀𝐃 𝐌𝐎𝐃𝐔𝐋𝐄𝐒', emoji: '📥', count: 0 },
                    'sticker': { name: '𝐄𝐃𝐈𝐓 𝐌𝐎𝐃𝐔𝐋𝐄𝐒', emoji: '🖼️', count: 0 },
                    'ai': { name: '𝐀𝐈 𝐌𝐎𝐃𝐔𝐋𝐄𝐒', emoji: '🤖', count: 0 },
                    'group': { name: '𝐆𝐑𝐎𝐔𝐏 𝐌𝐀𝐍𝐀𝐆𝐄𝐌𝐄𝐍𝐓', emoji: '👥', count: 0 },
                    'owner': { name: '𝐎𝐖𝐍𝐄𝐑 𝐂𝐎𝐌𝐌𝐀𝐍𝐃𝐒', emoji: '👑', count: 0 },
                    'utility': { name: '𝐔𝐓𝐈𝐋𝐈𝐓𝐘', emoji: '🛠️', count: 0 },
                    'tools': { name: '𝐓𝐎𝐎𝐋𝐒 & 𝐔𝐓𝐈𝐋𝐈𝐓𝐈𝐄𝐒', emoji: '🔧', count: 0 },
                    'search': { name: '𝐒𝐄𝐀𝐑𝐂𝐇', emoji: '🔍', count: 0 },
                    'misc': { name: '𝐌𝐈𝐒𝐂𝐄𝐋𝐋𝐀𝐍𝐄𝐎𝐔𝐒', emoji: '🎯', count: 0 }
                };
                
                // Organize commands by category
                const categorizedCmds = {};
                for (const [name, cmd] of this.commands) {
                    const category = cmd.category || 'misc';
                    if (!categorizedCmds[category]) categorizedCmds[category] = [];
                    categorizedCmds[category].push({ name, cmd });
                    if (categories[category]) categories[category].count++;
                }
                
                // Build menu with cool design like your friend's example
                let menuText = `╔══════════════════════╗\n`;
                menuText += `║   🚀 *${this.botName}* 🚀   ║\n`;
                menuText += `╚══════════════════════╝\n\n`;
                
                menuText += `👋 *${getGreeting()}*, *${message.pushName || 'User'}*!\n\n`;
                
                menuText += `╔═━════━【📊 𝐒𝐓𝐀𝐓𝐒】━════━╗\n`;
                menuText += `║ ✦ *User:* ${message.pushName || 'User'}\n`;
                menuText += `║ ✦ *Prefix:* \`${userPrefix}\`\n`;
                menuText += `║ ✦ *Speed:* ${speed} Ms\n`;
                menuText += `║ ✦ *Uptime:* ${runtime(uptime)}\n`;
                menuText += `║ ✦ *Commands:* ${this.commands.size}\n`;
                menuText += `╚═━════【🔒 𝐒𝐄𝐂𝐔𝐑𝐄】════━═╝\n\n`;
                
                // Add categorized commands
                for (const [catKey, catData] of Object.entries(categories)) {
                    if (categorizedCmds[catKey] && categorizedCmds[catKey].length > 0) {
                        menuText += `╔═━════━【${catData.emoji} ${catData.name}】━════━╗\n`;
                        
                        // Sort commands alphabetically
                        categorizedCmds[catKey].sort((a, b) => a.name.localeCompare(b.name));
                        
                        for (const { name, cmd } of categorizedCmds[catKey]) {
                            // Show only the main command, not aliases
                            if (cmd.pattern === name) {
                                menuText += `║   ${cmd.emoji || '•'} ${userPrefix}${name} - ${cmd.desc}\n`;
                            }
                        }
                        menuText += `╚═━════【${this.botName}】════━═╝\n\n`;
                    }
                }
                
                menuText += `╔══════════════════════╗\n`;
                menuText += `║  Made with ❤️ by ${this.ownerName}  ║\n`;
                menuText += `║    ©® 𝕮𝖄𝕭𝕰𝕽 𝕭𝕺𝕿     ║\n`;
                menuText += `╚══════════════════════╝`;
                
                // Send with image if available
                try {
                    await conn.sendMessage(from, {
                        image: { url: this.menuImageUrl },
                        caption: menuText
                    }, { quoted: message });
                } catch {
                    await sendLongMessage(conn, from, menuText, message);
                }
            }
        });

        // Owner command
        this.commands.set('owner', {
            pattern: 'owner',
            alias: ['creator', 'dev'],
            desc: 'Get owner contact',
            category: 'utility',
            emoji: '👑',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                const ownerNumber = this.ownerNumber?.replace(/\D/g, '') || this.ownerName?.replace(/\D/g, '');
                if (!ownerNumber) return reply("Owner number not configured!");
                
                const vcard = 'BEGIN:VCARD\n' +
                    'VERSION:3.0\n' +
                    `FN:${this.botName} Owner\n` +
                    `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:+${ownerNumber}\n` +
                    'END:VCARD';
                
                await conn.sendMessage(from, {
                    contacts: {
                        displayName: this.botName + ' Owner',
                        contacts: [{ vcard }]
                    }
                }, { quoted: message });
            }
        });

        // Repo command
        this.commands.set('repo', {
            pattern: 'repo',
            alias: ['sc', 'script', 'source'],
            desc: 'Get bot repository',
            category: 'utility',
            emoji: '📁',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                const repoMsg = `╔══════════════════════╗\n` +
                    `║   🤖 *${this.botName}* 🤖   ║\n` +
                    `╚══════════════════════╝\n\n` +
                    `📌 *Repository:*\n${this.repoLink}\n\n` +
                    `⚡ *Features:*\n` +
                    `• 50+ Commands\n` +
                    `• Download videos/music\n` +
                    `• Group management\n` +
                    `• AI Chatbot\n` +
                    `• Sticker maker\n` +
                    `• Anti-Link/Delete/Call\n` +
                    `• Auto Status & Typing\n` +
                    `• And much more!\n\n` +
                    `╔══════════════════════╗\n` +
                    `║  Made with ❤️ by ${this.ownerName}  ║\n` +
                    `╚══════════════════════╝`;
                
                await conn.sendMessage(from, {
                    image: { url: this.menuImageUrl },
                    caption: repoMsg
                }, { quoted: message });
            }
        });

        // Translate command
        this.commands.set('translate', {
            pattern: 'translate',
            alias: ['trt', 'tl'],
            desc: 'Translate text',
            category: 'tools',
            emoji: '🌐',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                await handleTranslateCommand(conn, from, message, q);
            }
        });

        // SS command (screenshot)
        this.commands.set('ss', {
            pattern: 'ss',
            alias: ['ssweb', 'screenshot'],
            desc: 'Take website screenshot',
            category: 'tools',
            emoji: '📸',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                await handleSsCommand(conn, from, message, q);
            }
        });

        // Weather command
        this.commands.set('weather', {
            pattern: 'weather',
            alias: ['wthr'],
            desc: 'Get weather info',
            category: 'tools',
            emoji: '🌦️',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                if (!q) return reply("Provide a city name!");
                await this.showTyping(conn, from, 2000);
                
                try {
                    const response = await fetch(`http://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(q)}&units=metric&appid=1ad47ec6172f19dfaf89eb3307f74785`);
                    const data = await response.json();
                    
                    if (data.cod !== 200) return reply("City not found!");
                    
                    const weatherMsg = `🌍 *Weather in ${data.name}*\n\n` +
                        `🌡️ *Temperature:* ${data.main.temp}°C\n` +
                        `🤔 *Feels like:* ${data.main.feels_like}°C\n` +
                        `📝 *Description:* ${data.weather[0].description}\n` +
                        `💧 *Humidity:* ${data.main.humidity}%\n` +
                        `💨 *Wind Speed:* ${data.wind.speed} m/s`;
                    
                    reply(weatherMsg);
                } catch (e) {
                    reply("Error fetching weather");
                }
            }
        });

        // Lyrics command
        this.commands.set('lyrics', {
            pattern: 'lyrics',
            alias: ['lrc'],
            desc: 'Get song lyrics',
            category: 'tools',
            emoji: '📝',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                if (!q) return reply("Provide a song name!");
                await this.showTyping(conn, from, 2000);
                
                try {
                    const data = await fetch(`https://api.dreaded.site/api/lyrics?title=${encodeURIComponent(q)}`).then(res => res.json());
                    
                    if (data?.result?.lyrics) {
                        const lyrics = `*${data.result.title} - ${data.result.artist}*\n\n${data.result.lyrics}`;
                        await sendLongMessage(conn, from, lyrics, message);
                    } else {
                        reply("Lyrics not found!");
                    }
                } catch (e) {
                    reply("Error fetching lyrics");
                }
            }
        });

        // Quote command
        this.commands.set('quote', {
            pattern: 'quote',
            alias: ['quotes'],
            desc: 'Get random quote',
            category: 'tools',
            emoji: '💬',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                await this.showTyping(conn, from, 1000);
                
                try {
                    const response = await fetch('https://favqs.com/api/qotd');
                    const data = await response.json();
                    reply(`"${data.quote.body}"\n\n- ${data.quote.author}`);
                } catch (e) {
                    reply("Error fetching quote");
                }
            }
        });

        // Fact command
        this.commands.set('fact', {
            pattern: 'fact',
            alias: ['facts'],
            desc: 'Get random fact',
            category: 'tools',
            emoji: 'ℹ️',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                await this.showTyping(conn, from, 1000);
                
                try {
                    const data = await fetch('https://api.dreaded.site/api/fact').then(res => res.json());
                    reply(data.fact || "Did you know? Facts are fun!");
                } catch (e) {
                    reply("Error fetching fact");
                }
            }
        });

        // QR code command
        this.commands.set('qr', {
            pattern: 'qr',
            alias: ['qrcode'],
            desc: 'Generate QR code',
            category: 'tools',
            emoji: '📱',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                if (!q) return reply("Provide text to make QR code!");
                await this.showTyping(conn, from, 2000);
                
                const url = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(q)}`;
                await conn.sendMessage(from, {
                    image: { url },
                    caption: `✅ QR Code for: ${q}`
                }, { quoted: message });
            }
        });

        // ==================== SEARCH COMMANDS ====================

        // YTS command
        this.commands.set('yts', {
            pattern: 'yts',
            alias: ['ytsearch'],
            desc: 'Search YouTube',
            category: 'search',
            emoji: '🔍',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                if (!q) return reply("Provide a search term!");
                await this.showTyping(conn, from, 2000);
                
                const { videos } = await yts(q);
                if (!videos || videos.length === 0) return reply("No results found!");
                
                let tex = `🔍 *YouTube Search*\nQuery: ${q}\n\n`;
                for (let i = 0; i < Math.min(videos.length, 5); i++) {
                    tex += `*${i+1}. ${videos[i].title}*\n`;
                    tex += `📺 Channel: ${videos[i].author.name}\n`;
                    tex += `⏱️ Duration: ${videos[i].timestamp}\n`;
                    tex += `🔗 ${videos[i].url}\n\n`;
                }
                
                await sendLongMessage(conn, from, tex, message);
            }
        });

        // Image search command
        this.commands.set('image', {
            pattern: 'image',
            alias: ['img', 'gimage'],
            desc: 'Search images',
            category: 'search',
            emoji: '🖼️',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                if (!q) return reply("Provide a search term!");
                await this.showTyping(conn, from, 2000);
                
                try {
                    const gis = require('g-i-s');
                    gis(q, async (error, results) => {
                        if (error || !results.length) return reply("No images found");
                        
                        for (let i = 0; i < Math.min(results.length, 5); i++) {
                            await conn.sendMessage(from, {
                                image: { url: results[i].url },
                                caption: `Image ${i+1}`
                            }, { quoted: message });
                            
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    });
                } catch (e) {
                    reply("Search failed");
                }
            }
        });

        // ==================== MISC COMMANDS ====================

        // Advice command
        this.commands.set('advice', {
            pattern: 'advice',
            alias: [],
            desc: 'Get random advice',
            category: 'misc',
            emoji: '💡',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                const advice = require('badadvice');
                reply(advice());
            }
        });

        // Joke command
        this.commands.set('joke', {
            pattern: 'joke',
            alias: [],
            desc: 'Get random joke',
            category: 'misc',
            emoji: '😄',
            execute: async (conn, message, m, { args, q, reply, from }) => {
                try {
                    const response = await axios.get('https://official-joke-api.appspot.com/random_joke');
                    const joke = response.data;
                    reply(`😂 *Joke*\n\n${joke.setup}\n\n${joke.punchline}`);
                } catch (e) {
                    reply("Couldn't fetch a joke");
                }
            }
        });

        console.log(`✅ Total commands loaded: ${this.commands.size}`);
    }

    getMessageType(message) {
        if (message.message?.conversation) return 'TEXT';
        if (message.message?.extendedTextMessage) return 'TEXT';
        if (message.message?.imageMessage) return 'IMAGE';
        if (message.message?.videoMessage) return 'VIDEO';
        if (message.message?.audioMessage) return 'AUDIO';
        if (message.message?.documentMessage) return 'DOCUMENT';
        if (message.message?.stickerMessage) return 'STICKER';
        if (message.message?.contactMessage) return 'CONTACT';
        if (message.message?.locationMessage) return 'LOCATION';
        
        const messageKeys = Object.keys(message.message || {});
        for (const key of messageKeys) {
            if (key.endsWith('Message')) {
                return key.replace('Message', '').toUpperCase();
            }
        }
        
        return 'UNKNOWN';
    }

    getMessageText(message, messageType) {
        switch (messageType) {
            case 'TEXT':
                return message.message?.conversation || 
                       message.message?.extendedTextMessage?.text || '';
            case 'IMAGE':
                return message.message?.imageMessage?.caption || '[Image]';
            case 'VIDEO':
                return message.message?.videoMessage?.caption || '[Video]';
            case 'AUDIO':
                return '[Audio]';
            case 'DOCUMENT':
                return message.message?.documentMessage?.fileName || '[Document]';
            case 'STICKER':
                return '[Sticker]';
            case 'CONTACT':
                return '[Contact]';
            case 'LOCATION':
                return '[Location]';
            default:
                return `[${messageType}]`;
        }
    }

    getQuotedMessage(message) {
        if (!message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            return null;
        }
        
        const quoted = message.message.extendedTextMessage.contextInfo;
        return {
            message: {
                key: {
                    remoteJid: quoted.participant || quoted.stanzaId,
                    fromMe: quoted.participant === (message.key.participant || message.key.remoteJid),
                    id: quoted.stanzaId
                },
                message: quoted.quotedMessage,
                mtype: Object.keys(quoted.quotedMessage || {})[0]?.replace('Message', '') || 'text'
            },
            sender: quoted.participant
        };
    }

    async handleMessage(conn, message, sessionId) {
        try {
            // Handle status updates for auto-status feature
            if (message.key && message.key.remoteJid === 'status@broadcast') {
                await handleStatusUpdate(conn, message);
                return;
            }

            if (!message.message) return;

            const messageType = this.getMessageType(message);
            let body = this.getMessageText(message, messageType);

            // Get user-specific prefix
            const userPrefix = this.userPrefixes.get(sessionId) || this.defaultPrefix;
            
            if (!body.startsWith(userPrefix)) return;

            const args = body.slice(userPrefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const q = body.slice(userPrefix.length + commandName.length).trim();

            console.log(`🔍 Detected command: ${commandName} from session: ${sessionId}`);

            // Find command by name or alias
            let command = null;
            let foundCommandName = null;
            
            for (const [name, cmd] of this.commands) {
                if (cmd.pattern === commandName || (cmd.alias && cmd.alias.includes(commandName))) {
                    command = cmd;
                    foundCommandName = name;
                    break;
                }
            }

            if (!command) {
                console.log(`⚠️ Command not found: ${commandName}`);
                return;
            }

            console.log(`🔧 Executing command: ${foundCommandName} for session: ${sessionId}`);
            
            // Show typing indicator
            await this.showTyping(conn, message.key.remoteJid, 1500);
            
            try {
                const reply = (text, options = {}) => {
                    return conn.sendMessage(message.key.remoteJid, { text }, { 
                        quoted: message, 
                        ...options 
                    });
                };
                
                let groupMetadata = null;
                const from = message.key.remoteJid;
                const isGroup = from.endsWith('@g.us');
                const senderId = message.key.participant || message.key.remoteJid;
                
                // Check if user is admin in group
                let isAdmin = false;
                let isOwner = false;
                
                // Check if user is bot owner
                const ownerNumber = process.env.OWNER_NUMBER?.replace(/\D/g, '') + '@s.whatsapp.net';
                isOwner = senderId === ownerNumber;
                
                if (isGroup) {
                    try {
                        groupMetadata = await conn.groupMetadata(from);
                        const participant = groupMetadata.participants.find(p => p.id === senderId);
                        isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
                    } catch (error) {
                        console.error("Error fetching group metadata:", error);
                    }
                }
                
                // Check command permissions
                if (command.ownerOnly && !isOwner) {
                    return reply("❌ This command is only available for the bot owner!");
                }
                
                if (command.adminOnly && !isAdmin && !isOwner) {
                    return reply("❌ This command requires admin privileges!");
                }
                
                const quotedMessage = this.getQuotedMessage(message);
                
                const m = {
                    mentionedJid: message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
                    quoted: quotedMessage,
                    sender: senderId
                };
                
                await command.execute(conn, message, m, { 
                    args, 
                    q, 
                    reply, 
                    from: from,
                    isGroup: isGroup,
                    groupMetadata: groupMetadata,
                    sender: senderId,
                    isAdmin: isAdmin,
                    isOwner: isOwner,
                    sessionId: sessionId
                });
            } catch (error) {
                console.error(`❌ Error executing command ${commandName}:`, error);
                await conn.sendMessage(message.key.remoteJid, { 
                    text: `❌ Error: ${error.message}` 
                }, { quoted: message });
            }
        } catch (error) {
            console.error("Error handling message:", error);
        }
    }

    // Expose commands for API
    getCommandsList() {
        return Array.from(this.commands.entries()).map(([name, cmd]) => ({
            name,
            aliases: cmd.alias || [],
            description: cmd.desc,
            category: cmd.category || 'misc',
            adminOnly: cmd.adminOnly || false,
            ownerOnly: cmd.ownerOnly || false
        }));
    }
}

module.exports = CommandHandler;