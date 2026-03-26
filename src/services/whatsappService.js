const { Client, RemoteAuth, MessageMedia } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode');
const path = require('path');
require('dotenv').config();

class WhatsAppService {
    constructor() {
        this.client = null;
        this.isReady = false;
        this.latestQrDataUrl = null;
        this.initializing = false;
        this.store = null;
    }

    async _connectMongo() {
        if (mongoose.connection.readyState === 1) return;
        try {
            await mongoose.connect(process.env.MONGODB_URI);
            console.log('[WhatsApp] MongoDB connected successfully');
        } catch (err) {
            console.error('[WhatsApp] MongoDB connection error:', err.message);
            throw err;
        }
    }

    async initialize() {
        if (this.initializing || this.isReady) return;
        this.initializing = true;
        this.latestQrDataUrl = null;

        try {
            await this._connectMongo();
            this.store = new MongoStore({ mongoose: mongoose });

            this.client = new Client({
                authStrategy: new RemoteAuth({
                    store: this.store,
                    backupSyncIntervalMs: 300000,
                    clientId: 'whatsapp-forwarder'
                }),
                puppeteer: {
                    handleSIGINT: false,
                    executablePath: process.env.CHROME_PATH || undefined,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--single-process',
                        '--disable-gpu',
                        '--disable-extensions',
                        '--disable-default-apps',
                        '--disable-setuid-sandbox',
                        '--no-default-browser-check',
                        '--disable-web-security',
                        '--disable-features=IsolateOrigins,site-per-process',
                        '--disable-site-isolation-trials',
                        '--window-size=200,200' 
                    ]
                }
            });

            this.client.on('qr', async (qr) => {
                console.log('[WhatsApp] New QR code generated');
                try {
                    this.latestQrDataUrl = await qrcode.toDataURL(qr, {
                        width: 280,
                        margin: 2,
                        color: { dark: '#000000', light: '#ffffff' }
                    });
                } catch (err) {
                    console.error('[WhatsApp] QR generation error:', err.message);
                }
            });

            this.client.on('ready', () => {
                console.log('[WhatsApp] Client is ready!');
                this.isReady = true;
                this.latestQrDataUrl = null;
                this.initializing = false;
            });

            this.client.on('remote_session_saved', () => {
                console.log('[WhatsApp] Session saved to remote storage');
            });

            this.client.on('auth_failure', (msg) => {
                console.error('[WhatsApp] Authentication failure:', msg);
            });

            this.client.on('disconnected', (reason) => {
                console.log('[WhatsApp] Disconnected:', reason);
                this.isReady = false;
                this.initializing = false;
            });

            await this.client.initialize();
        } catch (err) {
            console.error('[WhatsApp] Failed to initialize:', err.message);
            this.initializing = false;
            throw err;
        }
    }

    async findGroupByName(groupName, retries = 3) {
        if (!this.client) {
            console.error('[WhatsApp] findGroupByName called but client is not initialized');
            return null;
        }

        // Wait a bit if not ready, just in case
        if (!this.isReady) {
            console.log('[WhatsApp] Waiting for client to be ready before searching for group...');
            for (let i = 0; i < 10; i++) {
                if (this.isReady) break;
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        if (!this.isReady) {
            console.error('[WhatsApp] findGroupByName: Client still not ready after waiting.');
            return null;
        }

        try {
            console.log(`[WhatsApp] Searching for group: "${groupName}"...`);
            const chats = await this.client.getChats();
            const group = chats.find(chat => chat.isGroup && chat.name === groupName);
            
            if (!group && retries > 0) {
                console.log(`[WhatsApp] Group "${groupName}" not found. Retrying in 5s... (${retries} left)`);
                await new Promise(r => setTimeout(r, 5000));
                return this.findGroupByName(groupName, retries - 1);
            }
            
            return group;
        } catch (error) {
            console.error(`[WhatsApp] Error finding group (Retries left: ${retries}):`, error.message);
            if (retries > 0) {
                await new Promise(r => setTimeout(r, 5000));
                return this.findGroupByName(groupName, retries - 1);
            }
            return null;
        }
    }

    async sendMessage(group, context, retries = 1) {
        const { text, mediaPath, caption } = context;
        try {
            if (!this.isReady) throw new Error('WhatsApp client not ready');

            if (mediaPath) {
                const media = MessageMedia.fromFilePath(mediaPath);
                await group.sendMessage(media, { caption: caption || text });
            } else {
                await group.sendMessage(text);
            }
            return true;
        } catch (error) {
            console.error(`[WhatsApp] Send error (Attempt ${2 - retries}):`, error.message);
            if (retries > 0) {
                await new Promise(r => setTimeout(r, 2000));
                return this.sendMessage(group, context, retries - 1);
            }
            return false;
        }
    }
}

module.exports = new WhatsAppService();
