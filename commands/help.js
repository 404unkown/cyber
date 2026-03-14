const settings = require('../settings');
const fs = require('fs');
const path = require('path');

async function helpCommand(sock, chatId, message) {
    const helpMessage = `
╔════════════════════════════╗
║     🚀 *${settings.botName || 'MAD MAX FREE BOT'}* 🚀     ║
║        Version: *${settings.version || '3.0.0'}*            ║
║        👑 by ${settings.botOwner || '404unkown'} 👑         ║
║        📺 YT : ${global.ytch || '404UNKOWN'}         ║
╚════════════════════════════╝

╔════════════════════════════╗
║     🌐 *GENERAL COMMANDS*    ║
╠════════════════════════════╣
║ 🏠 .help or .menu          
║ 🏓 .ping                    
║ 💚 .alive                   
║ 🔊 .tts <text>              
║ 👑 .owner                   
║ 😂 .joke                    
║ 💬 .quote                   
║ 📊 .fact                    
║ 🌤️ .weather <city>          
║ 📰 .news                    
║ ✏️ .attp <text>             
║ 🎵 .lyrics <song_title>     
║ 🎱 .8ball <question>        
║ 📋 .groupinfo               
║ 👥 .staff or .admins        
║ 👁️ .vv                      
║ 🌐 .trt <text> <lang>       
║ 📸 .ss <link>               
║ 🆔 .jid                      
║ 🔗 .url                     
╚════════════════════════════╝

╔════════════════════════════╗
║    👮‍♂️ *ADMIN COMMANDS*     ║
╠════════════════════════════╣
║ 🔨 .ban @user              
║ ⬆️ .promote @user          
║ ⬇️ .demote @user           
║ 🔇 .mute <minutes>         
║ 🔊 .unmute                 
║ 🗑️ .delete or .del         
║ 👢 .kick @user             
║ ⚠️ .warnings @user         
║ ⚠️ .warn @user             
║ 🔗 .antilink               
║ 🚫 .antibadword            
║ 🧹 .clear                  
║ 🏷️ .tag <message>          
║ 📢 .tagall                 
║ 👥 .tagnotadmin            
║ 👻 .hidetag <message>      
║ 🤖 .chatbot                
║ 🔄 .resetlink              
║ 🚫 .antitag <on/off>       
║ 👋 .welcome <on/off>       
║ 👋 .goodbye <on/off>       
║ 📝 .setgdesc <description> 
║ ✏️ .setgname <new name>    
║ 🖼️ .setgpp (reply to image) 
╚════════════════════════════╝

╔════════════════════════════╗
║    🔒 *OWNER COMMANDS*      ║
╠════════════════════════════╣
║ ⚙️ .mode <public/private>  
║ 🧹 .clearsession           
║ 🛡️ .antidelete             
║ 🗑️ .cleartmp               
║ 🔄 .update                 
║ ⚙️ .settings               
║ 🖼️ .setpp <reply to image> 
║ 💫 .autoreact <on/off>     
║ 📱 .autostatus <on/off>    
║ 💫 .autostatus react <on/off> 
║ ⌨️ .autotyping <on/off>    
║ 👁️ .autoread <on/off>      
║ 📞 .anticall <on/off>      
║ 🚫 .pmblocker <on/off/status> 
║ 📝 .pmblocker setmsg <text> 
║ 📌 .setmention <reply to msg> 
║ 🔔 .mention <on/off>       
╚════════════════════════════╝

╔════════════════════════════╗
║    🎨 *IMAGE/STICKER*       ║
╠════════════════════════════╣
║ 🌫️ .blur <image>           
║ 🎭 .simage <reply to sticker> 
║ 🎨 .sticker <reply to image> 
║ ✂️ .removebg                
║ ✨ .remini                  
║ ✂️ .crop <reply to image>   
║ 📱 .tgsticker <Link>        
║ 😂 .meme                    
║ 📦 .take <packname>         
║ 😊 .emojimix <emj1>+<emj2>  
║ 📷 .igs <insta link>        
║ 📷 .igsc <insta link>       
║ ✏️ .editfoto <prompt> (reply img)
║ ✏️ .nano <prompt> (reply img)
╚════════════════════════════╝

╔════════════════════════════╗
║    🖼️ *PIES COMMANDS*      ║
╠════════════════════════════╣
║ 🥧 .pies <country>         
║ 🇨🇳 .china                  
║ 🇮🇩 .indonesia              
║ 🇯🇵 .japan                  
║ 🇰🇷 .korea                  
║ 🧕 .hijab                   
╚════════════════════════════╝

╔════════════════════════════╗
║     🎮 *GAME COMMANDS*      ║
╠════════════════════════════╣
║ 🎯 .tictactoe @user        
║ 🎮 .hangman                 
║ 🔤 .guess <letter>          
║ ❓ .trivia                  
║ ✅ .answer <answer>         
║ 🤔 .truth                   
║ 😈 .dare                    
╚════════════════════════════╝

╔════════════════════════════╗
║     🤖 *AI COMMANDS*        ║
╠════════════════════════════╣
║ 🧠 .gpt <question>         
║ 🤖 .gemini <question>       
║ 🎨 .imagine <prompt>        
║ 🔥 .flux <prompt>           
║ 🌊 .sora <prompt> (img2vid) 
║ 🤖 .wormgpt <question>      
║ 🪱 .worm <question>         
║ 🎬 .veo3 <prompt> (txt2vid) 
║ 🎨 .aiedit <prompt> (reply img)
║ 🗿 .aifigure (reply img)    
║ 📖 .aicomic (reply img)     
║ 🧼 .aiwm (reply img)        
║ 🎬 .ttv <prompt> (txt2vid)  
║ 🎬 .t2v <prompt>            
║ 🎬 .gen <prompt>            
║ 🎨 .render <prompt>         
║ 🎬 .ttv <prompt> --video    
╚════════════════════════════╝

╔════════════════════════════╗
║    🎤 *TTS & AUDIO*         ║
╠════════════════════════════╣
║ 🎙️ .tts <char>|<lang> <text>
║ 🗣️ .xminus (reply to audio) 
║ 🎤 .vocalcut (reply to audio)
║ 🔪 .separate (reply to audio)
║ 🎵 .tts grass|jp Hello       
║ 🎵 .tts raiden|en Hi         
║ 🎵 .tts paimon|cn 你好       
║ 🎵 .tts teio|mix 无敌        
╚════════════════════════════╝

╔════════════════════════════╗
║     🎯 *FUN COMMANDS*       ║
╠════════════════════════════╣
║ 💖 .compliment @user       
║ 😤 .insult @user           
║ 💕 .flirt                  
║ 📜 .shayari                
║ 🌙 .goodnight              
║ 🌹 .roseday                
║ 🎭 .character @user        
║ 💀 .wasted @user           
║ 💘 .ship @user             
║ 🔥 .simp @user             
║ 🤪 .stupid @user [text]    
╚════════════════════════════╝

╔════════════════════════════╗
║    🔤 *TEXT MAKER*          ║
╠════════════════════════════╣
║ ⚙️ .metallic <text>        
║ ❄️ .ice <text>             
║ ☃️ .snow <text>            
║ 🌟 .impressive <text>      
║ 💊 .matrix <text>          
║ 💡 .light <text>           
║ 🌈 .neon <text>            
║ 👿 .devil <text>           
║ 🟣 .purple <text>          
║ ⚡ .thunder <text>          
║ 🍃 .leaves <text>          
║ 📜 .1917 <text>            
║ 🏟️ .arena <text>           
║ 💻 .hacker <text>          
║ 🏖️ .sand <text>            
║ 💖 .blackpink <text>       
║ 🌀 .glitch <text>          
║ 🔥 .fire <text>            
╚════════════════════════════╝

╔════════════════════════════╗
║    📥 *DOWNLOADER*          ║
╠════════════════════════════╣
║ 🎵 .play <song_name>       
║ 🎶 .song <song_name>       
║ 🎧 .spotify <query>        
║ 📷 .instagram <link>       
║ 📘 .facebook <link>        
║ 📱 .tiktok <link>          
║ 🎬 .video <song name>      
║ 🎥 .ytmp4 <Link>           
║ 📸 .ssweb <url>            
║ 📱 .sswebm <url>           
║ 📱 .ssmobile <url>         
╚════════════════════════════╝

╔════════════════════════════╗
║     🧩 *MISC COMMANDS*      ║
╠════════════════════════════╣
║ ❤️ .heart                  
║ 🥵 .horny                  
║ ⭕ .circle                 
║ 🏳️‍🌈 .lgbt                  
║ 👮 .lolice                 
║ 🤪 .its-so-stupid          
║ 📇 .namecard               
║ 🐢 .oogway                 
║ 🐦 .tweet                  
║ 💬 .ytcomment              
║ 👨‍🚀 .comrade               
║ 🏳️‍🌈 .gay                   
║ 🥃 .glass                  
║ ⛓️ .jail                   
║ ✅ .passed                 
║ 😱 .triggered              
╚════════════════════════════╝

╔════════════════════════════╗
║     🖼️ *ANIME COMMANDS*     ║
╠════════════════════════════╣
║ 🍚 .nom                    
║ 👉 .poke                   
║ 😢 .cry                    
║ 💋 .kiss                   
║ 🖐️ .pat                    
║ 🤗 .hug                    
║ 😉 .wink                   
║ 🤦 .facepalm               
╚════════════════════════════╝

╔════════════════════════════╗
║    💻 *GITHUB COMMANDS*     ║
╠════════════════════════════╣
║ 🐙 .git                    
║ 🐙 .github                 
║ 📜 .sc                     
║ 📄 .script                 
║ 📦 .repo                   
╚════════════════════════════╝

╔════════════════════════════╗
║    🎭 *TTS CHARACTERS*      ║
╠════════════════════════════╣
║ 🐎 grass - Grass Wonder     
║ 🐎 goldship - Gold Ship     
║ 🐎 teio - Tokai Teio        
║ ⚡ raiden - Raiden Shogun   
║ 🔥 hutao - Hu Tao           
║ ❄️ ayaka - Kamisato Ayaka   
║ 🗣️ paimon - Paimon          
║ 🌐 Languages: jp, en, cn, mix
╚════════════════════════════╝

╔════════════════════════════╗
║    📌 *TTS EXAMPLES*        ║
╠════════════════════════════╣
║ .tts grass|jp こんにちは    
║ .tts raiden|en Hello        
║ .tts paimon|cn 你好         
║ .tts teio|mix 无敌の帝王    
╚════════════════════════════╝

╔════════════════════════════╗
║    📌 *AI EXAMPLES*         ║
╠════════════════════════════╣
║ .sora make cat dance        
║ .veo3 astronaut on Mars     
║ .wormgpt tell me a joke     
║ .aiedit make cartoon style  
║ .ttv robot dancing --video  
╚════════════════════════════╝

╔════════════════════════════╗
║    📌 *AUDIO EXAMPLES*      ║
╠════════════════════════════╣
║ Reply to audio with:        
║ .xminus - separate vocals   
║ .vocalcut - separate vocals 
║ .separate - separate vocals 
╚════════════════════════════╝
`;

    try {
        const imagePath = path.join(__dirname, '../assets/bot_image.jpg');
        
        if (fs.existsSync(imagePath)) {
            const imageBuffer = fs.readFileSync(imagePath);
            
            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: helpMessage,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363401269012709@newsletter',
                        newsletterName: 'MAD MAX FREE BOT',
                        serverMessageId: -1
                    }
                }
            }, { quoted: message });
        } else {
            console.error('Bot image not found at:', imagePath);
            await sock.sendMessage(chatId, { 
                text: helpMessage,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363401269012709@newsletter',
                        newsletterName: 'MAD MAX FREE BOT by 404unkown',
                        serverMessageId: -1
                    } 
                }
            }, { quoted: message });
        }
    } catch (error) {
        console.error('Error in help command:', error);
        await sock.sendMessage(chatId, { text: helpMessage }, { quoted: message });
    }
}

module.exports = helpCommand;