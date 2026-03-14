const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const cheerio = require("cheerio");
const { fileTypeFromBuffer } = require("file-type");

// Ensure tmp directory exists
const TMP_DIR = path.join(process.cwd(), "temp");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

class XMinusVocalCut {
    constructor() {
        this.baseUrl = "https://x-minus.pro";
        this.uploadUrl = "https://mmd.uvronline.app/upload/vocalCutAi?catch-file";
        this.checkUrl = "https://mmd.uvronline.app/upload/vocalCutAi?check-job-status";
        this.downloadBase = "https://mmd.uvronline.app/dl/vocalCutAi";

        this.http = axios.create({
            headers: {
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            withCredentials: true,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        });

        this.authKey = null;
    }

    async getAuthKey() {
        if (this.authKey) return this.authKey;
        
        const res = await this.http.get(`${this.baseUrl}/ai`);
        const $ = cheerio.load(res.data);
        const key = $("#vocal-cut-auth-key").val();
        
        if (!key) throw new Error("Auth key not found");
        
        this.authKey = key;
        return key;
    }

    async uploadAudio(filePath) {
        const authKey = await this.getAuthKey();
        const form = new FormData();

        form.append("auth_key", authKey);
        form.append("locale", "en_US");
        form.append("separation", "inst_vocal");
        form.append("separation_type", "vocals_music");
        form.append("format", "mp3");
        form.append("version", "3-4-0");
        form.append("model", "mdx_v2_vocft");
        form.append("aggressiveness", "2");
        form.append("hostname", "x-minus.pro");

        form.append("myfile", fs.createReadStream(filePath), {
            filename: "audio.mp3",
            contentType: "audio/mpeg",
        });

        const res = await this.http.post(this.uploadUrl, form, {
            headers: {
                ...form.getHeaders(),
                origin: "https://x-minus.pro",
                referer: "https://x-minus.pro/",
            },
        });

        return res.data;
    }

    async checkJob(jobId) {
        const form = new FormData();
        form.append("job_id", jobId);
        form.append("auth_key", this.authKey);
        form.append("locale", "en_US");

        const res = await this.http.post(this.checkUrl, form, {
            headers: {
                ...form.getHeaders(),
                origin: "https://x-minus.pro",
                referer: "https://x-minus.pro/",
            },
        });

        return res.data;
    }

    buildUrls(jobId) {
        return {
            instrumental: `${this.downloadBase}?job-id=${jobId}&stem=inst&fmt=mp3&cdn=0`,
            vocal: `${this.downloadBase}?job-id=${jobId}&stem=vocal&fmt=mp3&cdn=0`,
        };
    }

    async process(filePath) {
        const up = await this.uploadAudio(filePath);
        const jobId = up.job_id;

        let status;
        let attempts = 0;
        const maxAttempts = 60; // 3 minutes max (60 * 3s = 180s)

        do {
            await new Promise(r => setTimeout(r, 3000));
            status = await this.checkJob(jobId);
            attempts++;
            
            // Status update every 10 attempts (30 seconds)
            if (attempts % 10 === 0) {
                console.log(`⏳ X-Minus processing: attempt ${attempts}/${maxAttempts}`);
            }
            
        } while (status.status === "processing" && attempts < maxAttempts);

        if (status.status !== "done") {
            throw new Error(`Processing failed: ${status.status || 'timeout'}`);
        }

        return this.buildUrls(jobId);
    }
}

const xminusCommand = async (sock, chatId, message, args) => {
    try {
        // Check if there's a quoted message with audio
        const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedParticipant = message.message?.extendedTextMessage?.contextInfo?.participant;
        
        if (!quotedMessage || (!quotedMessage.audioMessage && !quotedMessage.documentMessage)) {
            await sock.sendMessage(chatId, { 
                text: `❌ *Please reply to an audio file*\n\n*Supported formats:* MP3, M4A, OGG, etc.\n\n*Example:*\n1. Send an audio file\n2. Reply to it with .xminus\n\n*Available commands:*\n• .xminus\n• .vocalcut\n• .separate`,
                ...global.channelInfo 
            }, { quoted: message });
            return;
        }

        // Send initial reaction and message
        await sock.sendMessage(chatId, { 
            text: '🎧 *X-MINUS Vocal Separator*\n\n⏳ Downloading audio file...',
            ...global.channelInfo 
        }, { quoted: message });

        // Get the correct message ID
        let messageId;
        if (message.message?.extendedTextMessage?.contextInfo?.stanzaId) {
            messageId = message.message.extendedTextMessage.contextInfo.stanzaId;
        } else {
            // Alternative way to get message ID
            messageId = message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.message?.key?.id || 
                       message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.key?.id ||
                       message.key.id;
        }

        // Create a proper message object for download
        const downloadObj = {
            key: {
                remoteJid: chatId,
                id: messageId,
                participant: quotedParticipant || message.key.participant
            },
            message: quotedMessage
        };

        // Download the quoted audio
        const media = await sock.downloadMediaMessage(downloadObj);

        if (!media) {
            throw new Error('Failed to download audio');
        }

        // Check if it's actually audio
        const type = await fileTypeFromBuffer(media);
        if (!type || !type.mime.startsWith("audio")) {
            await sock.sendMessage(chatId, { 
                text: '❌ *Invalid audio format*\nPlease send a valid audio file (MP3, M4A, OGG, etc.)',
                ...global.channelInfo 
            }, { quoted: message });
            return;
        }

        // Save to temp file
        const filePath = path.join(TMP_DIR, `xminus_${Date.now()}.${type.ext || 'mp3'}`);
        fs.writeFileSync(filePath, media);

        // Update status
        await sock.sendMessage(chatId, { 
            text: '🔍 *Processing audio...*\nThis may take 1-2 minutes',
            ...global.channelInfo 
        }, { quoted: message });

        // Process with X-Minus
        const cutter = new XMinusVocalCut();
        let result;

        try {
            result = await cutter.process(filePath);
        } catch (error) {
            // Clean up temp file
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            throw error;
        }

        // Clean up temp file
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        // Send the result links
        await sock.sendMessage(chatId, {
            text: `🎼 *X-MINUS VOCAL CUT COMPLETE* 🎼\n\n` +
                  `✅ *Successfully separated vocals from instrumental*\n\n` +
                  `🎤 *VOCAL TRACK:*\n${result.vocal}\n\n` +
                  `🎹 *INSTRUMENTAL TRACK:*\n${result.instrumental}\n\n` +
                  `📌 *Download links expire in 24 hours*\n` +
                  `⚡ *Powered by:* X-Minus & OMEGATECH`,
            ...global.channelInfo
        }, { quoted: message });

    } catch (error) {
        console.error('❌ X-Minus error:', error);
        
        let errorMessage = 'Vocal separation failed';
        
        if (error.message.includes('Auth key')) {
            errorMessage = 'Authentication failed. Service may be down.';
        } else if (error.message.includes('timeout')) {
            errorMessage = 'Processing timeout. Please try again with a shorter audio file.';
        } else if (error.message.includes('ECONNREFUSED')) {
            errorMessage = 'Cannot connect to X-Minus service. Server may be down.';
        } else if (error.message.includes('stanzaId') || error.message.includes('Cannot read properties')) {
            errorMessage = 'Failed to download audio. Please try again.';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        await sock.sendMessage(chatId, { 
            text: `❌ *X-Minus Error*\n\n📋 ${errorMessage}`,
            ...global.channelInfo 
        }, { quoted: message });
    }
};

module.exports = xminusCommand;