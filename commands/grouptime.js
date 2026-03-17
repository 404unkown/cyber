// commands/grouptime.js
const fs = require('fs');
const path = require('path');

// Import isAdmin
const isAdmin = require('../lib/isAdmin');

// Store active timers with persistence
const TIMERS_FILE = path.join(__dirname, '../data/grouptime_timers.json');
let activeTimers = new Map();

// Load saved timers on startup
function loadTimers() {
    try {
        if (fs.existsSync(TIMERS_FILE)) {
            const data = JSON.parse(fs.readFileSync(TIMERS_FILE, 'utf8'));
            console.log(`📊 Loaded ${Object.keys(data).length} saved timers`);
            
            // Restore timers
            Object.entries(data).forEach(([chatId, timerData]) => {
                const timeLeft = timerData.expiresAt - Date.now();
                
                if (timeLeft > 0) {
                    // Only restore if there's still time left
                    const timer = setTimeout(async () => {
                        try {
                            const sock = require('../main.js').getSock();
                            if (sock) {
                                // Get the reverse setting from stored data
                                const reverseSetting = timerData.targetSetting === 'announcement' ? 'not_announcement' : 'announcement';
                                const reverseActionText = reverseSetting === 'announcement' ? 'CLOSED' : 'OPENED';
                                
                                console.log(`🔄 Auto-reverting ${chatId} to ${reverseActionText} from saved timer`);
                                
                                await sock.groupSettingUpdate(chatId, reverseSetting);
                                
                                await sock.sendMessage(chatId, {
                                    text: `🔄 *Automatic Update*\n\nGroup has been automatically ${reverseActionText}!`,
                                    ...global.channelInfo
                                });
                            }
                        } catch (error) {
                            console.error('Auto revert error from saved timer:', error);
                        } finally {
                            activeTimers.delete(chatId);
                            saveTimers();
                        }
                    }, timeLeft);
                    
                    activeTimers.set(chatId, {
                        timer,
                        data: timerData
                    });
                    console.log(`⏰ Restored timer for ${chatId}: ${Math.round(timeLeft/60000)}min left (will ${timerData.targetSetting === 'announcement' ? 'open' : 'close'})`);
                } else {
                    // Execute immediately if timer already expired - without await
                    const sock = require('../main.js').getSock();
                    if (sock) {
                        const reverseSetting = timerData.targetSetting === 'announcement' ? 'not_announcement' : 'announcement';
                        const reverseActionText = reverseSetting === 'announcement' ? 'CLOSED' : 'OPENED';
                        
                        console.log(`Executing expired timer for ${chatId}: ${reverseActionText}`);
                        
                        // Use .then() instead of await for non-async context
                        sock.groupSettingUpdate(chatId, reverseSetting)
                            .catch(error => {
                                console.error('Failed to execute expired timer:', error);
                            });
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error loading timers:', error);
    }
}

// Save timers to file
function saveTimers() {
    try {
        const data = {};
        activeTimers.forEach((value, chatId) => {
            if (value.data) {
                data[chatId] = value.data;
            }
        });
        
        fs.writeFileSync(TIMERS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving timers:', error);
    }
}

// Format time for display (minutes/hours)
function formatDuration(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    
    if (hours === 0 && minutes === 0) {
        return 'less than a minute';
    } else if (hours === 0) {
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else if (minutes === 0) {
        return `${hours} hour${hours !== 1 ? 's' : ''}`;
    } else {
        return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
}

// Convert to Kenya time (UTC+3)
function toKenyaTime(date) {
    // Kenya is UTC+3 (no DST)
    const utcTime = date.getTime() + (date.getTimezoneOffset() * 60000);
    const kenyaTime = new Date(utcTime + (3 * 3600000)); // Add 3 hours
    
    // Format: YYYY-MM-DD HH:MM:SS
    const year = kenyaTime.getFullYear();
    const month = String(kenyaTime.getMonth() + 1).padStart(2, '0');
    const day = String(kenyaTime.getDate()).padStart(2, '0');
    const hours = String(kenyaTime.getHours()).padStart(2, '0');
    const minutes = String(kenyaTime.getMinutes()).padStart(2, '0');
    const seconds = String(kenyaTime.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Format Kenya time short (HH:MM)
function formatKenyaHourMinute(date) {
    const utcTime = date.getTime() + (date.getTimezoneOffset() * 60000);
    const kenyaTime = new Date(utcTime + (3 * 3600000));
    
    const hours = String(kenyaTime.getHours()).padStart(2, '0');
    const minutes = String(kenyaTime.getMinutes()).padStart(2, '0');
    
    return `${hours}:${minutes}`;
}

// Parse duration string (supports 1h, 30m, 1h30m, etc.)
function parseDuration(durationStr) {
    let totalMinutes = 0;
    
    // Try simple format (e.g., "1h", "30m")
    const simpleMatch = durationStr.match(/^(\d+)([hm])$/i);
    if (simpleMatch) {
        const value = parseInt(simpleMatch[1]);
        const unit = simpleMatch[2].toLowerCase();
        
        if (unit === 'h') {
            totalMinutes = value * 60;
        } else if (unit === 'm') {
            totalMinutes = value;
        }
        
        return totalMinutes;
    }
    
    // Try complex format (e.g., "1h30m", "2h 15m")
    const hourMatch = durationStr.match(/(\d+)\s*h/gi);
    const minuteMatch = durationStr.match(/(\d+)\s*m/gi);
    
    if (hourMatch) {
        hourMatch.forEach(match => {
            const hours = parseInt(match.replace(/\s*h/i, ''));
            totalMinutes += hours * 60;
        });
    }
    
    if (minuteMatch) {
        minuteMatch.forEach(match => {
            const minutes = parseInt(match.replace(/\s*m/i, ''));
            totalMinutes += minutes;
        });
    }
    
    return totalMinutes;
}

async function grouptimeCommand(sock, chatId, message, args, senderId) {
    try {
        // Check if in group
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, {
                text: '❌ This command can only be used in groups!',
                ...global.channelInfo
            }, { quoted: message });
            return;
        }

        // Check admin status
        const adminStatus = await isAdmin(sock, chatId, senderId);
        
        if (!adminStatus.isSenderAdmin && !message.key.fromMe) {
            await sock.sendMessage(chatId, {
                text: '❌ Only group admins can use this command!',
                ...global.channelInfo
            }, { quoted: message });
            return;
        }

        if (!adminStatus.isBotAdmin) {
            await sock.sendMessage(chatId, {
                text: '❌ Bot must be admin to use this command!',
                ...global.channelInfo
            }, { quoted: message });
            return;
        }

        // Define action mapping
        const action = (args[0] || '').toLowerCase();
        let targetSetting;
        
        if (['open', 'unlock', 'on', '1', 'enable'].includes(action)) {
            targetSetting = 'not_announcement'; // Group opened
        } else if (['close', 'lock', 'off', '0', 'disable'].includes(action)) {
            targetSetting = 'announcement'; // Group closed
        } else if (['status', 'check'].includes(action)) {
            // Check current timer status
            if (activeTimers.has(chatId)) {
                const timerData = activeTimers.get(chatId).data;
                const timeLeft = timerData.expiresAt - Date.now();
                
                if (timeLeft > 0) {
                    const currentActionText = timerData.targetSetting === 'announcement' ? 'CLOSED 🔒' : 'OPENED 🔓';
                    const revertActionText = timerData.targetSetting === 'announcement' ? 'opened' : 'closed';
                    
                    await sock.sendMessage(chatId, {
                        text: `⏰ *Timer Status*\n\nGroup is currently ${currentActionText}\nWill be automatically ${revertActionText} in ${formatDuration(timeLeft)}\n\nExpires: ${toKenyaTime(new Date(timerData.expiresAt))} (Kenya Time)${timerData.setBy ? `\n\nSet by: @${timerData.setBy.split('@')[0]}` : ''}`,
                        ...global.channelInfo
                    }, { quoted: message });
                } else {
                    // Timer expired but not cleared
                    activeTimers.delete(chatId);
                    saveTimers();
                    await sock.sendMessage(chatId, {
                        text: '✅ No active timer. Group settings are permanent.',
                        ...global.channelInfo
                    }, { quoted: message });
                }
            } else {
                await sock.sendMessage(chatId, {
                    text: '✅ No active timer. Group settings are permanent.',
                    ...global.channelInfo
                }, { quoted: message });
            }
            return;
        } else if (['cancel', 'stop'].includes(action)) {
            // Cancel existing timer
            if (activeTimers.has(chatId)) {
                const timerInfo = activeTimers.get(chatId);
                clearTimeout(timerInfo.timer);
                activeTimers.delete(chatId);
                saveTimers();
                
                await sock.sendMessage(chatId, {
                    text: '⏹️ *Timer Cancelled*\n\nGroup timer has been cancelled. Current setting will remain.',
                    ...global.channelInfo
                }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, {
                    text: 'ℹ️ No active timer to cancel.',
                    ...global.channelInfo
                }, { quoted: message });
            }
            return;
        } else if (['help', 'info', ''].includes(action) || !action) {
            // Show help if invalid action
            const helpMessage = `⏰ *GROUP TIMER COMMAND*\n\n*Syntax:* ${global.PREFIX || '.'}grouptime <action> <duration>\n\n*Actions:*\n• open/unlock - Open group\n• close/lock - Close group\n• status - Check timer status\n• cancel - Cancel active timer\n• help - Show this help\n\n*Duration Formats:*\n• 1h - 1 hour\n• 30m - 30 minutes\n• 1h30m - 1 hour 30 minutes\n• 2h 15m - 2 hours 15 minutes\n\n*Examples:*\n${global.PREFIX || '.'}grouptime open 1h\n${global.PREFIX || '.'}grouptime close 30m\n${global.PREFIX || '.'}grouptime lock 2h15m\n${global.PREFIX || '.'}grouptime open 2h 30m\n\n*Maximum:* 24 hours`;
            
            await sock.sendMessage(chatId, {
                text: helpMessage,
                ...global.channelInfo
            }, { quoted: message });
            return;
        } else {
            // Invalid action
            await sock.sendMessage(chatId, {
                text: `❌ Invalid action: "${action}"\nUse ${global.PREFIX || '.'}grouptime help for usage information.`,
                ...global.channelInfo
            }, { quoted: message });
            return;
        }

        // Get duration
        if (!args[1]) {
            await sock.sendMessage(chatId, {
                text: '❌ Please specify a duration!\nExample: .grouptime open 1h or .grouptime close 30m',
                ...global.channelInfo
            }, { quoted: message });
            return;
        }

        // Parse duration
        const durationMinutes = parseDuration(args[1]);
        
        if (durationMinutes === 0 || durationMinutes > 1440) { // 24 hours = 1440 minutes
            await sock.sendMessage(chatId, {
                text: '❌ Invalid duration! Please specify between 1 minute and 24 hours.\nExamples: 30m, 1h, 2h30m',
                ...global.channelInfo
            }, { quoted: message });
            return;
        }

        // Calculate timeout in milliseconds
        const timeoutset = durationMinutes * 60000; // minutes to milliseconds

        // Clear any existing timer for this group
        if (activeTimers.has(chatId)) {
            clearTimeout(activeTimers.get(chatId).timer);
            activeTimers.delete(chatId);
            saveTimers();
        }

        // Update group setting
        await sock.groupSettingUpdate(chatId, targetSetting);

        // Format duration for display
        const hours = Math.floor(durationMinutes / 60);
        const minutes = durationMinutes % 60;
        let durationText = '';
        
        if (hours > 0 && minutes > 0) {
            durationText = `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
        } else if (hours > 0) {
            durationText = `${hours} hour${hours !== 1 ? 's' : ''}`;
        } else {
            durationText = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        }

        // Send success message
        const actionText = targetSetting === 'announcement' ? 'CLOSED 🔒' : 'OPENED 🔓';
        
        await sock.sendMessage(chatId, {
            text: `✅ *SUCCESS*\n\nGroup has been ${actionText} for ${durationText}`,
            ...global.channelInfo
        }, { quoted: message });

        // Set auto-revert timer
        const expiresAt = Date.now() + timeoutset;
        const expireKenyaTime = formatKenyaHourMinute(new Date(expiresAt));
        
        const timer = setTimeout(async () => {
            try {
                // Reverse the setting (opposite of targetSetting)
                const reverseSetting = targetSetting === 'announcement' ? 'not_announcement' : 'announcement';
                const reverseActionText = reverseSetting === 'announcement' ? 'CLOSED 🔒' : 'OPENED 🔓';
                
                console.log(`⏰ Timer expired for ${chatId}, reverting from ${targetSetting} to ${reverseSetting}`);
                
                await sock.groupSettingUpdate(chatId, reverseSetting);
                
                await sock.sendMessage(chatId, {
                    text: `🔄 *Automatic Update*\n\nTimer expired! Group has been automatically ${reverseActionText}!`,
                    ...global.channelInfo
                });
                
            } catch (error) {
                console.error('Auto group update error:', error);
            } finally {
                // Remove timer from map
                activeTimers.delete(chatId);
                saveTimers();
            }
        }, timeoutset);

        // Store timer with metadata
        activeTimers.set(chatId, {
            timer,
            data: {
                targetSetting, // The setting we just applied
                durationMinutes,
                expiresAt,
                setBy: senderId,
                setAt: Date.now()
            }
        });
        
        // Save to file
        saveTimers();
        
        // Inform about auto timer
        const revertAction = targetSetting === 'announcement' ? 'opened 🔓' : 'closed 🔒';
        
        await sock.sendMessage(chatId, {
            text: `⏰ *Timer Set*\n\nGroup will be automatically ${revertAction} at ${expireKenyaTime} Kenya Time (in ${durationText}).`,
            ...global.channelInfo
        }, { quoted: message });

        // Debug log
        console.log(`Timer set for ${chatId}:`);
        console.log(`- Current setting: ${targetSetting} (${targetSetting === 'announcement' ? 'CLOSED' : 'OPENED'})`);
        console.log(`- Will revert to: ${targetSetting === 'announcement' ? 'not_announcement' : 'announcement'} (${targetSetting === 'announcement' ? 'OPENED' : 'CLOSED'})`);
        console.log(`- Duration: ${durationMinutes} minutes`);
        console.log(`- Expires at: ${toKenyaTime(new Date(expiresAt))}`);

    } catch (error) {
        console.error('Grouptime command error:', error);
        
        let errorMessage = '❌ Failed to update group settings.';
        
        if (error.message.includes('not an admin')) {
            errorMessage = '❌ Bot is not an admin or has insufficient permissions.';
        } else if (error.message.includes('404')) {
            errorMessage = '❌ Group not found or bot was removed.';
        } else if (error.message.includes('401')) {
            errorMessage = '❌ Unauthorized. Bot may have been demoted.';
        }
        
        await sock.sendMessage(chatId, {
            text: `${errorMessage}\n\nError: ${error.message}`,
            ...global.channelInfo
        }, { quoted: message });
    }
}

// Initialize timers on module load
loadTimers();

module.exports = grouptimeCommand;