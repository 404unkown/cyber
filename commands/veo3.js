const axios = require('axios');

const veo3Command = async (sock, chatId, message, args) => {
    try {
        // Send initial reaction
        await sock.sendMessage(chatId, { 
            react: { text: '⏳', key: message.key } 
        });

        const apiKey = 'sk-paxsenix-JACAA3a2W-KIX9a6FDIZDYPyCnrnxc2yqJ9AWYEDu-woDlyq';
        const baseUrl = 'https://api.paxsenix.org/ai-video/veo-3';
        
        const timeGMT = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'GMT',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).format(new Date());

        // Get prompt from args
        let prompt = args.join(' ').trim();
        
        // Default settings
        let ratio = '16:9';
        let model = 'veo-3-fast';
        let type = 'text-to-video';

        if (!prompt || prompt.length < 3) {
            await sock.sendMessage(chatId, { 
                text: `❌ *Prompt too short!*\n\n📝 *Example:* .veo3 goat playing football\n\n✨ *Tips:* Be descriptive for better results!`,
                ...global.channelInfo 
            }, { quoted: message });
            
            await sock.sendMessage(chatId, { 
                react: { text: '❌', key: message.key } 
            });
            return;
        }

        // Notify user of processing
        await sock.sendMessage(chatId, {
            text: `🎮 *Veo-3: Video Generation Started*\n\n` +
                  `✨═════🔮═════✨\n\n` +
                  `📝 *Prompt:* ${prompt}\n` +
                  `📹 *Model:* ${model}\n` +
                  `📏 *Ratio:* ${ratio}\n\n` +
                  `⏳ *Processing...* (may take 2-3 minutes)`,
            ...global.channelInfo
        }, { quoted: message });

        // Step 1: Start generation
        const queryParams = `?prompt=${encodeURIComponent(prompt)}&ratio=${ratio}&model=${model}&type=${type}`;
        const startUrl = `${baseUrl}${queryParams}`;
        
        const startRes = await axios.get(startUrl, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'User-Agent': 'mad-max free bot/1.0'
            },
            timeout: 30000 // 30 second timeout
        });

        const job = startRes.data;
        
        if (!job || !job.task_url) {
            throw new Error(`Bad response from API: ${JSON.stringify(job)}`);
        }

        // Step 2: Poll for completion with progress updates
        let pollData = job;
        let pollAttempts = 0;
        const maxAttempts = 40; // 40 attempts * 5s = 200s (~3.3 minutes)
        
        await sock.sendMessage(chatId, {
            text: `🔄 *Generating video...*\n\nThis may take a few minutes. I'll update you on progress!`,
            ...global.channelInfo
        }, { quoted: message });

        while (pollAttempts < maxAttempts) {
            try {
                const pollRes = await axios.get(job.task_url, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'User-Agent': 'mad-max free bot/1.0'
                    },
                    timeout: 30000
                });

                pollData = pollRes.data;

                if (pollData.status === 'done') break;
                if (pollData.status === 'failed') throw new Error("Generation failed from API.");

                // Send progress update every 8 attempts (every 40 seconds)
                if (pollAttempts > 0 && pollAttempts % 8 === 0) {
                    const percent = Math.min(Math.round((pollAttempts / maxAttempts) * 100), 99);
                    await sock.sendMessage(chatId, {
                        text: `⏳ *Still generating...* ${percent}% complete\nPlease wait a bit longer.`,
                        ...global.channelInfo
                    }, { quoted: message });
                }

                // Check for rate limit hint and adjust delay
                const retryAfter = pollRes.headers['retry-after'];
                const delay = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
                
                await new Promise(r => setTimeout(r, delay));
                pollAttempts++;
                
            } catch (pollError) {
                console.error('Polling error:', pollError);
                // Continue polling despite errors
                await new Promise(r => setTimeout(r, 8000));
                pollAttempts++;
            }
        }

        if (pollData.status !== 'done' || !pollData.url) {
            throw new Error(`Video generation failed or timed out. Last status: ${pollData.status || 'unknown'}`);
        }

        // Step 3: Fetch the video
        await sock.sendMessage(chatId, {
            text: `📥 *Downloading video...*\nAlmost there!`,
            ...global.channelInfo
        }, { quoted: message });

        const videoRes = await axios.get(pollData.url, { 
            responseType: 'arraybuffer',
            timeout: 60000 // 60 second timeout for video download
        });
        
        const videoBuffer = Buffer.from(videoRes.data);

        // Step 4: Send the video
        await sock.sendMessage(chatId, {
            video: videoBuffer,
            mimetype: 'video/mp4',
            fileName: `veo3-${timeGMT.replace(/:/g, '-')}.mp4`,
            caption: `🎮 *Veo-3 Generated Video*\n\n` +
                    `📝 *Prompt:* ${prompt}\n` +
                    `📹 *Model:* ${model}\n` +
                    `📏 *Ratio:* ${ratio}\n` +
                    `⏰ *Generated:* ${timeGMT} GMT\n\n` +
                    `🌟 *Powered by:* cyberdark 🤖`,
            ...global.channelInfo
        }, { quoted: message });

        // Success reaction
        await sock.sendMessage(chatId, { 
            react: { text: '✅', key: message.key } 
        });

    } catch (error) {
        console.error('❌ Veo-3 error:', error);
        
        let errorMessage = error.message || 'Unknown error occurred';
        
        if (error.message.includes('timeout') || error.code === 'ECONNABORTED') {
            errorMessage = 'Connection timeout. The service might be busy.';
        } else if (error.message.includes('403')) {
            errorMessage = 'API key expired or invalid. Please contact the bot owner.';
        } else if (error.message.includes('429')) {
            errorMessage = 'Rate limit exceeded. Please try again later.';
        } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
            errorMessage = 'Cannot connect to the AI service. Server may be down.';
        } else if (error.message.includes('Failed to fetch')) {
            errorMessage = 'Network error. Please check your connection.';
        }
        
        await sock.sendMessage(chatId, { 
            text: `😞 *Failed to generate Veo-3 video.*\n\n💡 *Error:* ${errorMessage}\n\nTry again with a different prompt or try later.`,
            ...global.channelInfo 
        }, { quoted: message });
        
        await sock.sendMessage(chatId, { 
            react: { text: '❌', key: message.key } 
        });
    }
};

module.exports = veo3Command;