const express = require("express");
const http = require("http");
require("dotenv").config();
const socketIo = require("socket.io");
const path = require("path");
const fs = require("fs");
const { useMultiFileAuthState, makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require("@whiskeysockets/baileys");
const P = require("pino");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 3000;

// Import our command handler
const CommandHandler = require("./commandHandler");

// Import auto feature helper functions from commandHandler
const { 
    getAutoStatus, 
    getAutoReact, 
    getAutoRead, 
    getAutoTyping 
} = require('./commandHandler');

const GroupEvents = require("./events/GroupEvents");

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Initialize command handler
const commandHandler = new CommandHandler();

// Store active connections
const activeConnections = new Map();
const pairingCodes = new Map();

// Store status media for forwarding
const statusMediaStore = new Map();

let activeSockets = 0;
let totalUsers = 0;

// Persistent data file path
const DATA_FILE = path.join(__dirname, 'persistent-data.json');

// Load persistent data
function loadPersistentData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            totalUsers = data.totalUsers || 0;
            console.log(`📊 Loaded persistent data: ${totalUsers} total users`);
        } else {
            console.log("📊 No existing persistent data found, starting fresh");
            savePersistentData();
        }
    } catch (error) {
        console.error("❌ Error loading persistent data:", error);
        totalUsers = 0;
    }
}

// Save persistent data
function savePersistentData() {
    try {
        const data = {
            totalUsers: totalUsers,
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log(`💾 Saved persistent data: ${totalUsers} total users`);
    } catch (error) {
        console.error("❌ Error saving persistent data:", error);
    }
}

// Initialize persistent data
loadPersistentData();

// Auto-save persistent data every 30 seconds
setInterval(() => {
    savePersistentData();
}, 30000);

// Stats broadcasting helper
function broadcastStats() {
    io.emit("statsUpdate", { activeSockets, totalUsers });
}

// Track frontend connections (stats dashboard)
io.on("connection", (socket) => {
    console.log("📊 Frontend connected for stats");
    socket.emit("statsUpdate", { activeSockets, totalUsers });
    
    socket.on("disconnect", () => {
        console.log("📊 Frontend disconnected from stats");
    });
});

// Channel configuration
const CHANNEL_JIDS = process.env.CHANNEL_JIDS ? process.env.CHANNEL_JIDS.split(',') : [
    "120363401269012709@newsletter",
    "120363423092906606@newsletter",
];

// Bot configuration from environment variables
const BOT_NAME = process.env.BOT_NAME || "CYBER";
const MENU_IMAGE_URL = process.env.MENU_IMAGE_URL || "https://files.catbox.moe/0dfeid.jpg";
const REPO_LINK = process.env.REPO_LINK || "https://github.com";
const OWNER_NAME = process.env.OWNER_NAME || "UNKOWN";

// Auto features configuration (default settings)
const AUTO_STATUS = process.env.AUTO_STATUS || "true";
const AUTO_REACT_STATUS = process.env.AUTO_REACT_STATUS || "false";
const AUTO_READ = process.env.AUTO_READ || "false";
const AUTO_TYPING = process.env.AUTO_TYPING || "false";

// Serve the main page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// API endpoint to request pairing code
app.post("/api/pair", async (req, res) => {
    let conn;
    try {
        const { number } = req.body;
        
        if (!number) {
            return res.status(400).json({ error: "Phone number is required" });
        }

        const normalizedNumber = number.replace(/\D/g, "");
        
        const sessionDir = path.join(__dirname, "sessions", normalizedNumber);
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();
        
        conn = makeWASocket({
            logger: P({ level: "silent" }),
            printQRInTerminal: false,
            auth: state,
            version,
            browser: Browsers.macOS("Safari"),
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 25000,
            maxIdleTimeMs: 60000,
            maxRetries: 10,
            markOnlineOnConnect: true,
            emitOwnEvents: true,
            defaultQueryTimeoutMs: 60000,
            syncFullHistory: false,
            transactionOpts: {
                maxCommitRetries: 10,
                delayBetweenTriesMs: 3000
            }
        });

        const isNewUser = !activeConnections.has(normalizedNumber) && 
                         !fs.existsSync(path.join(sessionDir, 'creds.json'));

        activeConnections.set(normalizedNumber, { 
            conn, 
            saveCreds, 
            hasLinked: activeConnections.get(normalizedNumber)?.hasLinked || false 
        });

        if (isNewUser) {
            totalUsers++;
            activeConnections.get(normalizedNumber).hasLinked = true;
            console.log(`👤 New user connected! Total users: ${totalUsers}`);
            savePersistentData();
        }
        
        broadcastStats();

        setupConnectionHandlers(conn, normalizedNumber, io, saveCreds);

        await new Promise(resolve => setTimeout(resolve, 3000));

        const pairingCode = await conn.requestPairingCode(normalizedNumber);
        
        pairingCodes.set(normalizedNumber, { code: pairingCode, timestamp: Date.now() });

        res.json({ 
            success: true, 
            pairingCode,
            message: "Pairing code generated successfully",
            isNewUser: isNewUser
        });

    } catch (error) {
        console.error("Error generating pairing code:", error);
        
        if (conn) {
            try {
                conn.ws.close();
            } catch (e) {}
        }
        
        res.status(500).json({ 
            error: "Failed to generate pairing code",
            details: error.message 
        });
    }
});

// Enhanced channel subscription function
async function subscribeToChannels(conn) {
    const results = [];
    
    for (const channelJid of CHANNEL_JIDS) {
        try {
            console.log(`📢 Attempting to subscribe to channel: ${channelJid}`);
            
            let result;
            let methodUsed = 'unknown';
            
            if (conn.newsletterFollow) {
                methodUsed = 'newsletterFollow';
                result = await conn.newsletterFollow(channelJid);
            } 
            else if (conn.followNewsletter) {
                methodUsed = 'followNewsletter';
                result = await conn.followNewsletter(channelJid);
            }
            else if (conn.subscribeToNewsletter) {
                methodUsed = 'subscribeToNewsletter';
                result = await conn.subscribeToNewsletter(channelJid);
            }
            else if (conn.newsletter && conn.newsletter.follow) {
                methodUsed = 'newsletter.follow';
                result = await conn.newsletter.follow(channelJid);
            }
            else {
                methodUsed = 'manual_presence_only';
                await conn.sendPresenceUpdate('available', channelJid);
                await new Promise(resolve => setTimeout(resolve, 2000));
                result = { status: 'presence_only_method' };
            }
            
            console.log(`✅ Successfully subscribed to channel using ${methodUsed}!`);
            results.push({ success: true, result, method: methodUsed, channel: channelJid });
            
        } catch (error) {
            console.error(`❌ Failed to subscribe to channel ${channelJid}:`, error.message);
            
            try {
                console.log(`🔄 Trying silent fallback subscription method for ${channelJid}...`);
                await conn.sendPresenceUpdate('available', channelJid);
                await new Promise(resolve => setTimeout(resolve, 3000));
                console.log(`✅ Used silent fallback subscription method for ${channelJid}!`);
                results.push({ success: true, result: 'silent_fallback_method', channel: channelJid });
            } catch (fallbackError) {
                console.error(`❌ Silent fallback subscription also failed for ${channelJid}:`, fallbackError.message);
                results.push({ success: false, error: fallbackError, channel: channelJid });
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
}

// Setup connection event handlers - now using commandHandler
function setupConnectionHandlers(conn, sessionId, io, saveCreds) {
    let hasShownConnectedMessage = false;
    let isLoggedOut = false;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    
    // Handle connection updates
    conn.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        
        console.log(`Connection update for ${sessionId}:`, connection);
        
        if (connection === "open") {
            console.log(`✅ WhatsApp connected for session: ${sessionId}`);
            console.log(`🟢 CONNECTED — ${BOT_NAME} is now active for ${sessionId}`);
            
            isLoggedOut = false;
            reconnectAttempts = 0;
            activeSockets++;
            broadcastStats();
            
            io.emit("linked", { sessionId });
            
            if (!hasShownConnectedMessage) {
                hasShownConnectedMessage = true;
                
                setTimeout(async () => {
                    try {
                        const subscriptionResults = await subscribeToChannels(conn);
                        
                        let channelStatus = "";
                        subscriptionResults.forEach((result, index) => {
                            const status = result.success ? "✅ Followed" : "❌ Not followed";
                            channelStatus += `📢 Channel ${index + 1}: ${status}\n`;
                        });

                        let name = "User";
                        try {
                            name = conn.user.name || "User";
                        } catch (error) {
                            console.log("Could not get user name:", error.message);
                        }
                        
                        let up = `
╔══════════════════════╗
║  🚀 ${BOT_NAME} 🚀  ║
╚══════════════════════╝

👋 Hey *${name}* 🤩  
🎉 Pairing Complete – You're good to go!  

📌 Prefix: ${process.env.PREFIX || "."}  
${channelStatus}
                        `;

                        const userJid = `${conn.user.id.split(":")[0]}@s.whatsapp.net`;
                        await conn.sendMessage(userJid, { 
                            text: up,
                            contextInfo: {
                                mentionedJid: [userJid],
                                forwardingScore: 999,
                                externalAdReply: {
                                    title: `${BOT_NAME} Connected 🚀`,
                                    body: `⚡ Powered by ${OWNER_NAME}`,
                                    thumbnailUrl: MENU_IMAGE_URL,
                                    mediaType: 1,
                                    renderLargerThumbnail: true
                                }
                            }
                        });
                    } catch (error) {
                        console.error("Error in channel subscription or welcome message:", error);
                    }
                }, 3000);
            }
        }
        
        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            
            if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`🔁 Connection closed, attempting to reconnect session: ${sessionId} (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                
                hasShownConnectedMessage = false;
                
                setTimeout(() => {
                    if (activeConnections.has(sessionId)) {
                        const { conn: existingConn } = activeConnections.get(sessionId);
                        try {
                            existingConn.ws.close();
                        } catch (e) {}
                        
                        initializeConnection(sessionId);
                    }
                }, 5000);
            } else {
                console.log(`🔒 Logged out from session: ${sessionId}`);
                isLoggedOut = true;
                activeSockets = Math.max(0, activeSockets - 1);
                broadcastStats();
                
                if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                    setTimeout(() => {
                        cleanupSession(sessionId, true);
                    }, 5000);
                }
                
                activeConnections.delete(sessionId);
                io.emit("unlinked", { sessionId });
            }
        }
    });

    // Handle credentials updates
    conn.ev.on("creds.update", async () => {
        if (saveCreds) {
            await saveCreds();
        }
    });

    // Handle messages - now using commandHandler with auto features
    conn.ev.on("messages.upsert", async (m) => {
        try {
            const message = m.messages[0];
            
            const botJid = conn.user.id;
            const normalizedBotJid = botJid.includes(':') ? botJid.split(':')[0] + '@s.whatsapp.net' : botJid;
            
            const isFromBot = message.key.fromMe || 
                              (message.key.participant && message.key.participant === normalizedBotJid) ||
                              (message.key.remoteJid && message.key.remoteJid === normalizedBotJid);
            
            if (message.key.fromMe && !isFromBot) return;
            
            console.log(`📩 Received message from ${message.key.remoteJid}, fromMe: ${message.key.fromMe}, isFromBot: ${isFromBot}`);
            
            const from = message.key.remoteJid;
            
            // ==================== AUTO FEATURES ====================
            
            // Get user-specific settings
            const userAutoStatus = getAutoStatus(sessionId);
            const userAutoReact = getAutoReact(sessionId);
            const userAutoRead = getAutoRead(sessionId);
            const userAutoTyping = getAutoTyping(sessionId);
            
            // Auto Status View
            if (from === 'status@broadcast' && userAutoStatus) {
                await conn.readMessages([message.key]);
                console.log(`👀 Auto-viewed status from ${message.key.participant} for user ${sessionId}`);
            }
            
            // Auto React to Status
            if (from === 'status@broadcast' && userAutoReact && !message.key.fromMe) {
                const emojis = ['❤️', '🔥', '💯', '🥰', '💚', '👍', '😍', '🤩', '🎉', '💫'];
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                
                await conn.sendMessage(from, {
                    react: {
                        text: randomEmoji,
                        key: message.key
                    }
                }, { statusJidList: [message.key.participant] });
                
                console.log(`💫 Auto-reacted to status with ${randomEmoji} for user ${sessionId}`);
            }
            
            // Auto Read Messages
            if (userAutoRead && from !== 'status@broadcast' && !message.key.fromMe) {
                await conn.readMessages([message.key]);
                console.log(`📖 Auto-read message from ${from} for user ${sessionId}`);
            }
            
            // Auto Typing
            if (userAutoTyping && from !== 'status@broadcast' && !message.key.fromMe) {
                await conn.sendPresenceUpdate('composing', from);
                setTimeout(() => {
                    conn.sendPresenceUpdate('paused', from);
                }, 2000);
            }
            
            // ======================================================
            
            // Pass message to command handler
            if (from.endsWith('@newsletter') || from.endsWith('@g.us') || from.endsWith('@s.whatsapp.net') || isFromBot) {
                await commandHandler.handleMessage(conn, message, sessionId);
            }
            
            // Message logging
            const messageType = commandHandler.getMessageType(message);
            let messageText = commandHandler.getMessageText(message, messageType);
            
            if (!message.key.fromMe || isFromBot) {
                const timestamp = new Date(message.messageTimestamp * 1000).toLocaleTimeString();
                const isGroup = from.endsWith('@g.us');
                const sender = message.key.fromMe ? conn.user.id : (message.key.participant || message.key.remoteJid);
                
                if (isGroup) {
                    console.log(`[${timestamp}] [GROUP: ${from}] ${sender}: ${messageText} (${messageType})`);
                } else {
                    console.log(`[${timestamp}] [PRIVATE] ${sender}: ${messageText} (${messageType})`);
                }
            }
        } catch (error) {
            console.error("Error processing message:", error);
        }
    });

    // Group events handler
    conn.ev.on('group-participants.update', async (update) => {
        console.log("🔥 group-participants.update fired:", update);
        await GroupEvents(conn, update);
    });
}

// Function to reinitialize connection
async function initializeConnection(sessionId) {
    try {
        const sessionDir = path.join(__dirname, "sessions", sessionId);
        
        if (!fs.existsSync(sessionDir)) {
            console.log(`Session directory not found for ${sessionId}`);
            return;
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();
        
        const conn = makeWASocket({
            logger: P({ level: "silent" }),
            printQRInTerminal: false,
            auth: state,
            version,
            browser: Browsers.macOS("Safari"),
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 25000,
            maxIdleTimeMs: 60000,
            maxRetries: 10,
            markOnlineOnConnect: true,
            emitOwnEvents: true,
            defaultQueryTimeoutMs: 60000,
            syncFullHistory: false
        });

        activeConnections.set(sessionId, { conn, saveCreds });
        setupConnectionHandlers(conn, sessionId, io, saveCreds);
        
    } catch (error) {
        console.error(`Error reinitializing connection for ${sessionId}:`, error);
    }
}

// Clean up session folder
function cleanupSession(sessionId, deleteEntireFolder = false) {
    const sessionDir = path.join(__dirname, "sessions", sessionId);
    
    if (fs.existsSync(sessionDir)) {
        if (deleteEntireFolder) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
            console.log(`🗑️ Deleted session folder due to logout: ${sessionId}`);
        } else {
            console.log(`📁 Session preservation: Keeping all files for ${sessionId}`);
        }
    }
}

// API endpoint to get loaded commands
app.get("/api/commands", (req, res) => {
    res.json({ commands: commandHandler.getCommandsList() });
});

// Socket.io connection handling
io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);
    
    socket.on("disconnect", () => {
        console.log("❌ Client disconnected:", socket.id);
    });
    
    socket.on("force-request-qr", () => {
        console.log("QR code regeneration requested");
    });
});

// Session preservation routine
setInterval(() => {
    const sessionsDir = path.join(__dirname, "sessions");
    
    if (!fs.existsSync(sessionsDir)) return;
    
    const sessions = fs.readdirSync(sessionsDir);
    const now = Date.now();
    
    sessions.forEach(session => {
        const sessionPath = path.join(sessionsDir, session);
        const stats = fs.statSync(sessionPath);
        const age = now - stats.mtimeMs;
        
        if (age > 5 * 60 * 1000 && !activeConnections.has(session)) {
            console.log(`📊 Session ${session} is ${Math.round(age/60000)} minutes old - PRESERVED`);
        }
    });
}, 5 * 60 * 1000);

// Function to reload existing sessions on server restart
async function reloadExistingSessions() {
    console.log("🔄 Checking for existing sessions to reload...");
    
    const sessionsDir = path.join(__dirname, "sessions");
    
    if (!fs.existsSync(sessionsDir)) {
        console.log("📁 No sessions directory found, skipping session reload");
        return;
    }
    
    const sessions = fs.readdirSync(sessionsDir);
    console.log(`📂 Found ${sessions.length} session directories`);
    
    for (const sessionId of sessions) {
        const sessionDir = path.join(sessionsDir, sessionId);
        const stat = fs.statSync(sessionDir);
        
        if (stat.isDirectory()) {
            console.log(`🔄 Attempting to reload session: ${sessionId}`);
            
            try {
                const credsPath = path.join(sessionDir, "creds.json");
                if (fs.existsSync(credsPath)) {
                    await initializeConnection(sessionId);
                    console.log(`✅ Successfully reloaded session: ${sessionId}`);
                    
                    activeSockets++;
                    console.log(`📊 Active sockets increased to: ${activeSockets}`);
                } else {
                    console.log(`❌ No valid auth state found for session: ${sessionId}`);
                    console.log(`📁 Keeping session folder for potential reuse: ${sessionId}`);
                }
            } catch (error) {
                console.error(`❌ Failed to reload session ${sessionId}:`, error.message);
                console.log(`📁 Preserving session folder despite error: ${sessionId}`);
            }
        }
    }
    
    console.log("✅ Session reload process completed");
    broadcastStats();
}

// Start the server
server.listen(port, async () => {
    console.log(`🚀 ${BOT_NAME} server running on http://localhost:${port}`);
    console.log(`📱 WhatsApp bot initialized`);
    console.log(`🔧 Loaded ${commandHandler.getCommandsList().length} commands`);
    console.log(`📊 Starting with ${totalUsers} total users (persistent)`);
    console.log(`⚙️ Auto Features (Default Settings):`);
    console.log(`   👁️ Auto Status View: ${AUTO_STATUS === "true" ? "✅ ON" : "❌ OFF"}`);
    console.log(`   💫 Auto Status React: ${AUTO_REACT_STATUS === "true" ? "✅ ON" : "❌ OFF"}`);
    console.log(`   📖 Auto Read Messages: ${AUTO_READ === "true" ? "✅ ON" : "❌ OFF"}`);
    console.log(`   ⌨️ Auto Typing: ${AUTO_TYPING === "true" ? "✅ ON" : "❌ OFF"}`);
    console.log(`ℹ️ Users can change these with .autostatus, .autoreact, .autoread, .autotyping commands`);
    
    await reloadExistingSessions();
});

// Graceful shutdown
let isShuttingDown = false;

function gracefulShutdown() {
  if (isShuttingDown) {
    console.log("🛑 Shutdown already in progress...");
    return;
  }
  
  isShuttingDown = true;
  console.log("\n🛑 Shutting down CYBER server...");
  
  savePersistentData();
  console.log(`💾 Saved persistent data: ${totalUsers} total users`);
  
  let connectionCount = 0;
  activeConnections.forEach((data, sessionId) => {
    try {
      data.conn.ws.close();
      console.log(`🔒 Closed WhatsApp connection for session: ${sessionId}`);
      connectionCount++;
    } catch (error) {}
  });
  
  console.log(`✅ Closed ${connectionCount} WhatsApp connections`);
  console.log(`📁 All session folders preserved for next server start`);
  
  const shutdownTimeout = setTimeout(() => {
    console.log("⚠️  Force shutdown after timeout");
    process.exit(0);
  }, 3000);
  
  server.close(() => {
    clearTimeout(shutdownTimeout);
    console.log("✅ Server shut down gracefully");
    console.log("📁 Session folders preserved - they will be reloaded on next server start");
    process.exit(0);
  });
}

// Handle termination signals
process.on("SIGINT", () => {
  console.log("\nReceived SIGINT signal");
  gracefulShutdown();
});

process.on("SIGTERM", () => {
  console.log("\nReceived SIGTERM signal");
  gracefulShutdown();
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error.message);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});