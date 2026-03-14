const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getUserSetting, updateUserSetting } = require('../lib/userSettings');

const DEFAULT_BOT_NAME = 'MAD-MAX FREE BOT AI';

// In-memory storage for chat history (still per user - that's fine)
const chatMemory = new Map(); // Stores last 10 messages per user

// Add typing indicator
async function showTyping(sock, chatId) {
    try {
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);
        await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
        console.error('Typing indicator error:', error);
    }
}

async function handleChatbotCommand(sock, chatId, message, match, senderId) {
    if (!match) {
        await showTyping(sock, chatId);
        return sock.sendMessage(chatId, {
            text: `*CHATBOT SETUP*\n\n*.chatbot on* - Enable for YOU\n*.chatbot off* - Disable for YOU\n\nNote: This only affects your private chats with the bot.`,
            quoted: message
        });
    }

    if (match === 'on') {
        await showTyping(sock, chatId);
        
        // Check if already enabled for this user
        const currentSetting = getUserSetting(senderId, 'chatbot', false);
        
        if (currentSetting) {
            return sock.sendMessage(chatId, { 
                text: '*Chatbot is already enabled for YOU*',
                quoted: message
            });
        }
        
        updateUserSetting(senderId, 'chatbot', true);
        console.log(`✅ Chatbot enabled for user ${senderId}`);
        return sock.sendMessage(chatId, { 
            text: '*Chatbot has been enabled for YOU*\n\nNow I will respond to your messages in private chat!',
            quoted: message
        });
    }

    if (match === 'off') {
        await showTyping(sock, chatId);
        
        const currentSetting = getUserSetting(senderId, 'chatbot', false);
        
        if (!currentSetting) {
            return sock.sendMessage(chatId, { 
                text: '*Chatbot is already disabled for YOU*',
                quoted: message
            });
        }
        
        updateUserSetting(senderId, 'chatbot', false);
        console.log(`✅ Chatbot disabled for user ${senderId}`);
        return sock.sendMessage(chatId, { 
            text: '*Chatbot has been disabled for YOU*',
            quoted: message
        });
    }

    await showTyping(sock, chatId);
    return sock.sendMessage(chatId, { 
        text: '*Invalid command. Use .chatbot to see usage*',
        quoted: message
    });
}

async function handleChatbotResponse(sock, chatId, message, userMessage, senderId) {
    // Check if this is a private chat (not a group)
    const isGroup = chatId.endsWith('@g.us');
    
    // For private chats, check user's chatbot setting
    // For groups, you might want different logic (could be per group)
    if (!isGroup) {
        const chatbotEnabled = getUserSetting(senderId, 'chatbot', false);
        if (!chatbotEnabled) return;
    } else {
        // For groups, you might want to check group settings instead
        // This is where you'd implement per-group chatbot settings if needed
        // For now, we'll just return (groups don't get chatbot)
        return;
    }

    try {
        // Don't respond to commands
        if (userMessage.startsWith('.')) return;

        // Initialize user's chat memory if not exists
        if (!chatMemory.has(senderId)) {
            chatMemory.set(senderId, []);
        }

        // Add message to history (keep last 10 messages)
        const messages = chatMemory.get(senderId);
        messages.push(userMessage);
        if (messages.length > 10) {
            messages.shift();
        }
        chatMemory.set(senderId, messages);

        // Show typing indicator
        await showTyping(sock, chatId);

        // Get AI response
        const response = await getAIResponse(userMessage, messages);

        if (!response) {
            // Fallback response if API fails
            const fallbacks = [
                "Hmm, I'm thinking... 🤔",
                "Interesting! 😊",
                "Tell me more! 👀",
                "I see! 👌",
                "Cool! 😎"
            ];
            const fallback = fallbacks[Math.floor(Math.random() * fallbacks.length)];
            await sock.sendMessage(chatId, { text: fallback }, { quoted: message });
            return;
        }

        // Send response
        await sock.sendMessage(chatId, { text: response }, { quoted: message });

    } catch (error) {
        console.error('❌ Error in chatbot response:', error);
    }
}

async function getAIResponse(userMessage, chatHistory) {
    // Try multiple APIs in order
    const apis = [
        {
            // Gemini API
            url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
            key: "AIzaSyDD79CzhemWoS4WXoMTpZcs8g0fWNytNug",
            processor: (data) => data.candidates?.[0]?.content?.parts?.[0]?.text
        },
        {
            // Alternative API
            url: "https://api.dreaded.site/api/chatgpt",
            processor: (data) => data.result
        },
        {
            // Another alternative
            url: "https://bk9.fun/ai/blackbox",
            processor: (data) => data.BK9
        }
    ];

    // Create conversation history
    const history = chatHistory.slice(-5).map(msg => `User: ${msg}`).join('\n');

    const prompt = `You are a real human chatting on WhatsApp, NOT an AI assistant.

Your name is MAD-MAX FREE BOT AI.

IMPORTANT RULES:
- If someone asks "What's your name?" or "Who are you?" or "Your name?", say "My name is MAD-MAX FREE BOT AI"
- If someone asks "Who made you?" or "Who created you?", say "I was made by 404unkown"
- Keep responses short (1-2 sentences max)
- Use casual, friendly language
- Use emojis naturally 😊
- NEVER mention that you're an AI

Recent conversation:
${history}

User: ${userMessage}
You:`;

    for (const api of apis) {
        try {
            let response;
            
            if (api.key) {
                // Gemini API
                response = await axios.post(api.url + "?key=" + api.key, {
                    contents: [{ parts: [{ text: prompt }] }]
                }, {
                    headers: { "Content-Type": "application/json" },
                    timeout: 10000
                });
            } else {
                // Other APIs
                response = await axios.get(api.url + "?text=" + encodeURIComponent(prompt), {
                    timeout: 10000
                });
            }

            const result = api.processor(response.data);
            
            if (result && result.trim()) {
                let cleanResult = result.trim()
                    .replace(/^["']|["']$/g, '')
                    .replace(/^(AI|Bot|Assistant):/i, '')
                    .replace(/\n/g, ' ')
                    .trim();
                
                // Ensure it's not too long
                if (cleanResult.length > 200) {
                    cleanResult = cleanResult.substring(0, 200) + '...';
                }
                
                return cleanResult;
            }
        } catch (error) {
            console.log(`API ${api.url} failed, trying next...`);
            continue;
        }
    }
    
    return null;
}

module.exports = {
    handleChatbotCommand,
    handleChatbotResponse
};