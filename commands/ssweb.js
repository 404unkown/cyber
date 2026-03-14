const fetch = require('node-fetch');

const ssweb = {
    _static: Object.freeze({
        baseUrl: 'https://www.screenshotmachine.com',
        baseHeaders: { 'content-encoding': 'zstd' },
        maxOutputLength: 200,
    }),
    
    pretyError(string) {
        if (!string) return '(empty message)';
        let message = '';
        try {
            message = JSON.stringify(string, null, 2);
        } catch {
            message = string;
        }
        return message.length >= this._static.maxOutputLength ? 
            message.substring(0, this._static.maxOutputLength) + ' [trimmed]' : 
            message;
    },
    
    async getCookie() {
        const r = await fetch(this._static.baseUrl, { headers: this._static.baseHeaders });
        if (!r.ok) throw Error(`${r.status} ${r.statusText} ${this.pretyError(await r.text())}`);
        
        const cookie = r.headers
            .get('set-cookie')
            ?.split(',')
            .map((v) => v.split(';')[0])
            .join('; ') || '';
            
        if (!cookie) throw Error('Failed to get cookie');
        return { cookie };
    },
    
    async getBuffer(reqObj, cookie) {
        if (reqObj.status !== 'success') throw Error('Status not success');
        const { link } = reqObj;
        const r = await fetch(this._static.baseUrl + '/' + link, { headers: { cookie } });
        if (!r.ok) throw Error(`${r.status} ${r.statusText} ${this.pretyError(await r.text())}`);
        
        const ab = await r.arrayBuffer();
        return { buffer: Buffer.from(ab) };
    },
    
    async req(url, cookie) {
        const headers = {
            cookie,
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            ...this._static.baseHeaders,
        };
        
        const r = await fetch(this._static.baseUrl + '/capture.php', {
            headers,
            body: 'url=' + encodeURIComponent(url) + '&device=desktop&cacheLimit=0',
            method: 'POST',
        });
        
        if (!r.ok) throw Error(`${r.status} ${r.statusText} ${this.pretyError(await r.text())}`);
        
        const reqObj = await r.json();
        return { reqObj };
    },
    
    async capture(url) {
        if (!url) throw Error('URL parameter cannot be empty');
        const { cookie } = await this.getCookie();
        const { reqObj } = await this.req(url, cookie);
        const { buffer } = await this.getBuffer(reqObj, cookie);
        return buffer;
    },
};

const sswebCommand = async (sock, chatId, message, args) => {
    try {
        // Get URL from args
        const url = args.join(' ').trim();
        
        if (!url) {
            await sock.sendMessage(chatId, { 
                text: `❌ Please provide a URL!\n\n*Example:* .ssweb https://example.com`,
                ...global.channelInfo 
            }, { quoted: message });
            return;
        }

        // Validate URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            await sock.sendMessage(chatId, { 
                text: `❌ Invalid URL! URL must start with http:// or https://`,
                ...global.channelInfo 
            }, { quoted: message });
            return;
        }

        // Send processing message
        await sock.sendMessage(chatId, { 
            text: '📸 *Taking screenshot...*\n⏳ Please wait a moment',
            ...global.channelInfo 
        }, { quoted: message });

        // Get screenshot
        const screenshotBuffer = await ssweb.capture(url);

        // Send the screenshot
        await sock.sendMessage(chatId, {
            image: screenshotBuffer,
            caption: `✅ *Screenshot captured successfully!*\n\n🌐 *URL:* ${url}`,
            ...global.channelInfo
        }, { quoted: message });

    } catch (error) {
        console.error('❌ SSWeb error:', error);
        
        // Handle specific error messages
        let errorMessage = error.message || 'Unknown error occurred';
        
        if (errorMessage.includes('cookie')) {
            errorMessage = 'Failed to get session cookie. Please try again.';
        } else if (errorMessage.includes('status nya gak sukses') || errorMessage.includes('not success')) {
            errorMessage = 'Failed to capture screenshot. The website might be blocking screenshots.';
        } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
            errorMessage = 'Network error. Please check your connection.';
        }
        
        await sock.sendMessage(chatId, { 
            text: `❌ *Failed to capture screenshot*\n\n📋 *Error:* ${errorMessage}\n\n💡 Try another website or check if the URL is correct.`,
            ...global.channelInfo 
        }, { quoted: message });
    }
};

// Also create a mobile version
const sswebMobileCommand = async (sock, chatId, message, args) => {
    try {
        const url = args.join(' ').trim();
        
        if (!url) {
            await sock.sendMessage(chatId, { 
                text: `❌ Please provide a URL!\n\n*Example:* .sswebm https://example.com`,
                ...global.channelInfo 
            }, { quoted: message });
            return;
        }

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            await sock.sendMessage(chatId, { 
                text: `❌ Invalid URL! URL must start with http:// or https://`,
                ...global.channelInfo 
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, { 
            text: '📱 *Taking mobile screenshot...*\n⏳ Please wait a moment',
            ...global.channelInfo 
        }, { quoted: message });

        // For mobile version, we need to modify the device parameter
        const { cookie } = await ssweb.getCookie();
        
        const headers = {
            cookie,
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            ...ssweb._static.baseHeaders,
        };
        
        const r = await fetch(ssweb._static.baseUrl + '/capture.php', {
            headers,
            body: 'url=' + encodeURIComponent(url) + '&device=phone&cacheLimit=0',
            method: 'POST',
        });
        
        if (!r.ok) throw Error(`${r.status} ${r.statusText}`);
        
        const reqObj = await r.json();
        const { buffer } = await ssweb.getBuffer(reqObj, cookie);

        await sock.sendMessage(chatId, {
            image: buffer,
            caption: `✅ *Mobile screenshot captured successfully!*\n\n🌐 *URL:* ${url}`,
            ...global.channelInfo
        }, { quoted: message });

    } catch (error) {
        console.error('❌ SSWeb Mobile error:', error);
        await sock.sendMessage(chatId, { 
            text: `❌ *Failed to capture mobile screenshot*\n\n📋 *Error:* ${error.message || 'Unknown error'}`,
            ...global.channelInfo 
        }, { quoted: message });
    }
};

module.exports = {
    sswebCommand,
    sswebMobileCommand
};