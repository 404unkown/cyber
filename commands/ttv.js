const axios = require('axios');
const FormData = require('form-data');

const AgungDevX = {
    config: {
        base: 'https://text2video.aritek.app',
        cipher: 'hbMcgZLlzvghRlLbPcTbCpfcQKM0PcU0zhPcTlOFMxBZ1oLmruzlVp9remPgi0QWP0QW',
        shift: 3,
        ua: 'AgungDevX Coder/1.0.0 (WhatsApp Bot)'
    },
    _decryptToken: () => {
        const input = AgungDevX.config.cipher;
        const shift = AgungDevX.config.shift;
        return [...input].map(c =>
            /[a-z]/.test(c) ? String.fromCharCode((c.charCodeAt(0) - 97 - shift + 26) % 26 + 97) :
            /[A-Z]/.test(c) ? String.fromCharCode((c.charCodeAt(0) - 65 - shift + 26) % 26 + 65) : c
        ).join('');
    }
};

const ttvCommand = async (sock, chatId, message, args) => {
    try {
        // Get the full text from args
        const text = args.join(' ').trim();
        
        if (!text) {
            await sock.sendMessage(chatId, { 
                text: `*⚠️ Usage:* Provide a description for the generation.\n\n*Example:* .ttv Astronaut on Mars\n*Video Mode:* Add \`--video\` at the end.\n\n*Aliases:* .ttv, .t2v, .gen`,
                ...global.channelInfo 
            }, { quoted: message });
            return;
        }

        // Check if it's video mode
        const isVideo = text.endsWith('--video');
        const prompt = text.replace('--video', '').trim();

        // Send processing message
        await sock.sendMessage(chatId, { 
            text: `🎞️ *mad max Neural Engine:* Generating ${isVideo ? 'video' : 'image'} from prompt...\n⏳ Please wait 1-2 minutes`,
            ...global.channelInfo 
        }, { quoted: message });

        // Get decrypted token
        const token = AgungDevX._decryptToken();

        if (isVideo) {
            // VIDEO GENERATION
            const resKey = await axios.post(`${AgungDevX.config.base}/txt2videov3`, {
                deviceID: Math.random().toString(16).slice(2, 10),
                isPremium: 1,
                prompt: prompt,
                used: [],
                versionCode: 59
            }, { 
                headers: { 'authorization': token } 
            });

            const key = resKey.data.key;
            let videoUrl = null;

            // Poll for video generation (up to 40 attempts = ~2 minutes)
            for (let i = 0; i < 40; i++) {
                await new Promise(r => setTimeout(r, 3000));
                
                const resVideo = await axios.post(`${AgungDevX.config.base}/video`, 
                    { keys: [key] }, 
                    { headers: { 'authorization': token } }
                );
                
                if (resVideo.data.datas?.[0]?.url) { 
                    videoUrl = resVideo.data.datas[0].url; 
                    break; 
                }
                
                // Send progress update every 10 attempts
                if (i % 10 === 9) {
                    await sock.sendMessage(chatId, { 
                        text: `⏳ Still rendering... ${Math.round((i+1)/40*100)}% complete`,
                        ...global.channelInfo 
                    }, { quoted: message });
                }
            }
            
            if (!videoUrl) throw new Error('Render timeout - Generation took too long');
            
            // Send the video
            await sock.sendMessage(chatId, {
                video: { url: videoUrl },
                caption: `🎥 *CYBERDARK TECH*\n📝 *Prompt:* ${prompt}\n⚡ *Powered by:* cyberdark`,
                gifPlayback: false,
                ...global.channelInfo
            }, { quoted: message });

        } else {
            // IMAGE GENERATION
            const form = new FormData();
            form.append('prompt', prompt);
            form.append('token', token);
            
            const { data } = await axios.post(`${AgungDevX.config.base}/text2img`, 
                form, 
                { 
                    headers: { 
                        'authorization': token, 
                        ...form.getHeaders() 
                    } 
                }
            );
            
            if (!data.url) throw new Error('Render failed - No URL returned');
            
            // Send the image
            await sock.sendMessage(chatId, {
                image: { url: data.url },
                caption: `🖼️ *CYBERDARK TECH*\n📝 *Prompt:* ${prompt}\n⚡ *Powered by:* CYBERDRK`,
                ...global.channelInfo
            }, { quoted: message });
        }

    } catch (error) {
        console.error('❌ TTV error:', error);
        
        let errorMessage = 'The neural engine is currently offline.';
        
        if (error.message.includes('timeout')) {
            errorMessage = 'Generation timed out. Please try again with a simpler prompt.';
        } else if (error.message.includes('403') || error.message.includes('401')) {
            errorMessage = 'Authentication failed. Token may have expired.';
        } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
            errorMessage = 'Cannot connect to the AI service. Server may be down.';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        await sock.sendMessage(chatId, { 
            text: `❌ *Render Failed*\n📋 ${errorMessage}`,
            ...global.channelInfo 
        }, { quoted: message });
    }
};

module.exports = ttvCommand;