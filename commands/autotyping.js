const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'data', 'autotyping.json');

function initConfig() {
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({ enabled: false }, null, 2));
    }
    return JSON.parse(fs.readFileSync(configPath));
}

async function autotypingCommand(sock, chatId, message) {
    try {
        const config = initConfig();
        config.enabled = !config.enabled;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        await sock.sendMessage(chatId, {
            text: `✅ Auto-typing has been ${config.enabled ? 'enabled' : 'disabled'}!`
        });
    } catch (error) {
        console.error('Error in autotyping command:', error);
    }
}

function isAutotypingEnabled() {
    try {
        const config = initConfig();
        return config.enabled;
    } catch {
        return false;
    }
}

async function showTypingAfterCommand(sock, chatId) {
    if (isAutotypingEnabled()) {
        try {
            await sock.presenceSubscribe(chatId);
            await sock.sendPresenceUpdate('composing', chatId);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await sock.sendPresenceUpdate('paused', chatId);
            return true;
        } catch (error) {
            return false;
        }
    }
    return false;
}

module.exports = {
    autotypingCommand,
    isAutotypingEnabled,
    showTypingAfterCommand
};