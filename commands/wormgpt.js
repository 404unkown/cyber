const fetch = require('node-fetch');

const rand = (n) => {
    return Array.from({ length: n }, () =>
        'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]
    ).join('');
};

async function wormgptChat(query) {
    const messageId = `${rand(8)}-${rand(4)}-${rand(4)}-${rand(4)}-${rand(12)}`;
    const userId = `${rand(8)}-${rand(4)}-${rand(4)}-${rand(4)}-${rand(12)}`;

    const cookie = '__Secure-authjs.session-token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2Q0JDLUhTNTEyIiwia2lkIjoiRnlESjQ1UXFQeDVRSVhoaVNSQk5uNFBHcFBFVnQzbjBZTVhRVGlEZ3hNeS1KaEZCNTJQOWx6d0lvNTRIODU1X3JNVzhWTHE0UUVDUExTWF9aLTh2aXcifQ..BC1-RXYYZM0oVmP7FaXUsw.f5LshHBNgG24G0uaj9te9vcDqm7zynNtVRvuuFjiHJzChQHQ4TYDCG35JXFCtiy29JcTWULM3ynjMp9l3ygwnv4FVIo9BIZBcyUQBzFyPNYcF6FGQEYke-D5ebIXcQi_tXLbxkhLTh9jTJJ4qfqZC13CgeaG-8je-x_dLT7yDe7A0s9QYqk7edr0YT_AmngvgS3MvcvhNmVC35aDurZO3dV2egpNvwgjlJaCn3aNRoiXjmtZow8pX3BUig8pfdE1.TiCtK3B8lnk4_K7R9ZxQvjqd3SVeoBzEUr8V9BKjGN0; __Secure-authjs.callback-url=https%3A%2F%2Fchat.wrmgpt.com%2Flogin';

    const res = await fetch('https://chat.wrmgpt.com/api/chat', {
        method: 'POST',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
            'Content-Type': 'application/json',
            'Accept': '*/*',
            'Origin': 'https://chat.wrmgpt.com',
            'Referer': 'https://chat.wrmgpt.com/',
            'Cookie': cookie,
            'sec-ch-ua-platform': '"Android"',
            'sec-ch-ua-mobile': '?1'
        },
        body: JSON.stringify({
            id: messageId,
            message: {
                role: 'user',
                parts: [{ type: 'text', text: query }],
                id: userId
            },
            selectedChatModel: 'wormgpt-v5.5',
            selectedVisibilityType: 'private',
            searchEnabled: false,
            memoryLength: 8
        })
    });

    if (!res.ok) {
        throw new Error(`API Error: ${res.status} ${res.statusText}`);
    }

    const raw = await res.text();
    let result = '';

    for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6).trim();
        if (data === '[DONE]') break;

        try {
            const json = JSON.parse(data);
            if (json.type === 'text-delta' && json.delta) {
                result += json.delta;
            }
        } catch (e) {
            // Ignore parse errors
        }
    }

    if (!result) throw new Error('No output content generated');
    return result;
}

const wormgptCommand = async (sock, chatId, message, args) => {
    try {
        // Get the query from args
        const query = args.join(' ').trim();
        
        if (!query) {
            await sock.sendMessage(chatId, { 
                text: `❌ Please provide a query!\n\nExample: .wormgpt What is the meaning of life?`,
                ...global.channelInfo 
            }, { quoted: message });
            return;
        }

        // Send processing message
        await sock.sendMessage(chatId, { 
            text: '🤖 _Sedang memproses..._',
            ...global.channelInfo 
        }, { quoted: message });

        // Get response from WormGPT
        const result = await wormgptChat(query);

        // Send the response
        await sock.sendMessage(chatId, { 
            text: result,
            ...global.channelInfo 
        }, { quoted: message });

    } catch (error) {
        console.error('❌ WormGPT error:', error);
        await sock.sendMessage(chatId, { 
            text: `❌ Error: ${error.message || 'Unknown error occurred'}`,
            ...global.channelInfo 
        }, { quoted: message });
    }
};

module.exports = wormgptCommand;