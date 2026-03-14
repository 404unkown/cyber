const fs = require('fs');
const path = require('path');

// ✅ THIS IS NEEDED - defines where to store user settings
const USERS_DIR = path.join(__dirname, '../data/users');

// ✅ THIS IS NEEDED - creates the directory if it doesn't exist
if (!fs.existsSync(USERS_DIR)) {
    fs.mkdirSync(USERS_DIR, { recursive: true });
}

// Default settings for new users
const DEFAULT_USER_SETTINGS = {
    autotyping: false,
    autoread: false,
    antidelete: false,
    autostatus: false,
    autoreact: false,
    anticall: false,
    pmblocker: false,
    chatbot: false,
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString()
};

// Load user settings
function loadUserSettings(userId) {
    try {
        const safeId = userId.replace(/[^0-9]/g, '');
        // ✅ USES USERS_DIR to build the file path
        const userFile = path.join(USERS_DIR, `${safeId}.json`);
        
        if (!fs.existsSync(userFile)) {
            const newSettings = {
                ...DEFAULT_USER_SETTINGS,
                userId: safeId,
                createdAt: new Date().toISOString()
            };
            fs.writeFileSync(userFile, JSON.stringify(newSettings, null, 2));
            return newSettings;
        }
        
        const data = fs.readFileSync(userFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error loading settings for user ${userId}:`, error);
        return { ...DEFAULT_USER_SETTINGS };
    }
}

// Save user settings
function saveUserSettings(userId, settings) {
    try {
        const safeId = userId.replace(/[^0-9]/g, '');
        // ✅ USES USERS_DIR to build the file path
        const userFile = path.join(USERS_DIR, `${safeId}.json`);
        
        settings.lastSeen = new Date().toISOString();
        
        fs.writeFileSync(userFile, JSON.stringify(settings, null, 2));
        return true;
    } catch (error) {
        console.error(`Error saving settings for user ${userId}:`, error);
        return false;
    }
}

// Update a single setting
function updateUserSetting(userId, key, value) {
    const settings = loadUserSettings(userId);
    settings[key] = value;
    return saveUserSettings(userId, settings);
}

// Get a single setting
function getUserSetting(userId, key, defaultValue = false) {
    const settings = loadUserSettings(userId);
    return settings.hasOwnProperty(key) ? settings[key] : defaultValue;
}

module.exports = {
    loadUserSettings,
    saveUserSettings,
    updateUserSetting,
    getUserSetting,
    DEFAULT_USER_SETTINGS
};