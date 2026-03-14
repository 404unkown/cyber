const fs = require('fs');
const path = require('path');
const { getUserSetting } = require('../lib/userSettings');
const isOwnerOrSudo = require('../lib/isOwner');

function readJsonSafe(path, fallback) {
    try {
        const txt = fs.readFileSync(path, 'utf8');
        return JSON.parse(txt);
    } catch (_) {
        return fallback;
    }
}

async function settingsCommand(sock, chatId, message) {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
        
        if (!message.key.fromMe && !isOwner) {
            await sock.sendMessage(chatId, { text: 'Only bot owner can use this command!' }, { quoted: message });
            return;
        }

        const isGroup = chatId.endsWith('@g.us');
        const dataDir = './data';

        // Global settings (still from JSON files)
        const mode = readJsonSafe(`${dataDir}/messageCount.json`, { isPublic: true });
        
        // PER-USER settings from userSettings.js
        const autoStatus = getUserSetting(senderId, 'autostatus', false);
        const autoReact = getUserSetting(senderId, 'autoreact', false);
        const autoread = getUserSetting(senderId, 'autoread', false);
        const autotyping = getUserSetting(senderId, 'autotyping', false);
        const pmblocker = getUserSetting(senderId, 'pmblocker', false);
        const anticall = getUserSetting(senderId, 'anticall', false);
        const chatbot = getUserSetting(senderId, 'chatbot', false);
        const antidelete = getUserSetting(senderId, 'antidelete', false);

        // Group settings (still from userGroupData.json)
        const userGroupData = readJsonSafe(`${dataDir}/userGroupData.json`, {
            antilink: {}, antibadword: {}, welcome: {}, goodbye: {}, chatbot: {}, antitag: {}
        });

        const lines = [];
        lines.push('*⚙️ BOT SETTINGS*');
        lines.push('');
        lines.push('━━━━━━━━━━━━━━━━━━');
        lines.push('*🌐 GLOBAL SETTINGS*');
        lines.push('━━━━━━━━━━━━━━━━━━');
        lines.push(`• Mode: ${mode.isPublic ? 'Public 🔓' : 'Private 🔒'}`);
        lines.push('');
        
        lines.push('━━━━━━━━━━━━━━━━━━');
        lines.push('*👤 YOUR PERSONAL SETTINGS*');
        lines.push('━━━━━━━━━━━━━━━━━━');
        lines.push(`• Auto Status View: ${autoStatus ? 'ON ✅' : 'OFF ❌'}`);
        lines.push(`• Status Reactions: ${autoReact ? 'ON ✅' : 'OFF ❌'}`);
        lines.push(`• Autoread: ${autoread ? 'ON ✅' : 'OFF ❌'}`);
        lines.push(`• Autotyping: ${autotyping ? 'ON ✅' : 'OFF ❌'}`);
        lines.push(`• PM Blocker: ${pmblocker ? 'ON ✅' : 'OFF ❌'}`);
        lines.push(`• Anticall: ${anticall ? 'ON ✅' : 'OFF ❌'}`);
        lines.push(`• Chatbot: ${chatbot ? 'ON ✅' : 'OFF ❌'}`);
        lines.push(`• Antidelete: ${antidelete ? 'ON ✅' : 'OFF ❌'}`);
        
        if (isGroup) {
            // Per-group features
            const groupId = chatId;
            const antilinkOn = Boolean(userGroupData.antilink && userGroupData.antilink[groupId]);
            const antibadwordOn = Boolean(userGroupData.antibadword && userGroupData.antibadword[groupId]);
            const welcomeOn = Boolean(userGroupData.welcome && userGroupData.welcome[groupId]);
            const goodbyeOn = Boolean(userGroupData.goodbye && userGroupData.goodbye[groupId]);
            const groupChatbotOn = Boolean(userGroupData.chatbot && userGroupData.chatbot[groupId]);
            const antitagCfg = groupId ? (userGroupData.antitag && userGroupData.antitag[groupId]) : null;

            lines.push('');
            lines.push('━━━━━━━━━━━━━━━━━━');
            lines.push('*👥 GROUP SETTINGS*');
            lines.push('━━━━━━━━━━━━━━━━━━');
            lines.push(`Group: ${groupId.substring(0, 15)}...`);
            
            if (antilinkOn) {
                const al = userGroupData.antilink[groupId];
                lines.push(`• Antilink: ON ✅ (action: ${al.action || 'delete'})`);
            } else {
                lines.push('• Antilink: OFF ❌');
            }
            
            if (antibadwordOn) {
                const ab = userGroupData.antibadword[groupId];
                lines.push(`• Antibadword: ON ✅ (action: ${ab.action || 'delete'})`);
            } else {
                lines.push('• Antibadword: OFF ❌');
            }
            
            lines.push(`• Welcome: ${welcomeOn ? 'ON ✅' : 'OFF ❌'}`);
            lines.push(`• Goodbye: ${goodbyeOn ? 'ON ✅' : 'OFF ❌'}`);
            lines.push(`• Group Chatbot: ${groupChatbotOn ? 'ON ✅' : 'OFF ❌'}`);
            
            if (antitagCfg && antitagCfg.enabled) {
                lines.push(`• Antitag: ON ✅ (action: ${antitagCfg.action || 'delete'})`);
            } else {
                lines.push('• Antitag: OFF ❌');
            }
        }

        lines.push('');
        lines.push('━━━━━━━━━━━━━━━━━━');
        lines.push('📝 Use .help to see all commands');

        await sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: message });
        
    } catch (error) {
        console.error('Error in settings command:', error);
        await sock.sendMessage(chatId, { text: 'Failed to read settings.' }, { quoted: message });
    }
}

module.exports = settingsCommand;