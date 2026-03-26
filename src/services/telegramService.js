const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const mongoose = require('mongoose');
const fs = require('fs-extra');
const path = require('path');

// MongoDB schema for Telegram session
const telegramSessionSchema = new mongoose.Schema({
    id: { type: String, default: 'main' },
    session: String
});
const TelegramSession = mongoose.models.TelegramSession || mongoose.model('TelegramSession', telegramSessionSchema);

class TelegramService {
    constructor() {
        this.client = null;
        this.tempDir = path.join(__dirname, '..', '..', 'temp');
        this.lastMessageId = null;

        // Web auth state
        this.isConnected = false;
        this.authState = 'idle'; // idle | waitingForCode | waitingForPassword | done
        this.authError = null;
        this._resolvePhone = null;
        this._resolveCode = null;
        this._resolvePassword = null;
    }

    async _connectMongo() {
        if (mongoose.connection.readyState === 1) return;
        try {
            await mongoose.connect(process.env.MONGODB_URI);
        } catch (err) {
            console.error('[Telegram] MongoDB connection error:', err.message);
        }
    }

    async initialize(apiId, apiHash) {
        if (!apiId || !apiHash) {
            console.error('[Telegram] ERROR: API_ID or API_HASH missing.');
            return false;
        }

        await this._connectMongo();

        let sessionString = '';
        try {
            const savedSession = await TelegramSession.findOne({ id: 'main' });
            if (savedSession) {
                sessionString = savedSession.session;
                console.log('[Telegram] Saved session found in MongoDB.');
            }
        } catch (err) {
            console.error('[Telegram] Error loading session from MongoDB:', err.message);
        }

        const stringSession = new StringSession(sessionString);

        this.client = new TelegramClient(stringSession, parseInt(apiId), apiHash, {
            connectionRetries: 10,
            useWSS: true,
        });

        // If we already have a session, try to connect directly
        if (sessionString) {
            try {
                await this.client.connect();
                if (await this.client.isUserAuthorized()) {
                    console.log('[Telegram] Connected with saved session.');
                    this.isConnected = true;
                    this.authState = 'done';
                    return true;
                }
            } catch (err) {
                console.log('[Telegram] Saved session invalid, need re-auth:', err.message);
            }
        }

        // Connect the client (but don't start auth yet — that happens via web)
        await this.client.connect();
        console.log('[Telegram] Client connected. Awaiting web authentication...');
        return true;
    }

    async startPhoneAuth(phoneNumber) {
        if (!this.client) throw new Error('Telegram client not initialized');

        this.authError = null;

        try {
            await this.client.start({
                phoneNumber: () => phoneNumber,
                phoneCode: () => {
                    this.authState = 'waitingForCode';
                    console.log('[Telegram] Waiting for OTP code from web...');
                    return new Promise((resolve) => {
                        this._resolveCode = resolve;
                    });
                },
                password: () => {
                    this.authState = 'waitingForPassword';
                    console.log('[Telegram] Waiting for 2FA password from web...');
                    return new Promise((resolve) => {
                        this._resolvePassword = resolve;
                    });
                },
                onError: (err) => {
                    console.error('[Telegram] Auth error:', err.message);
                    this.authError = err.message;
                },
            });

            // Save new session to MongoDB
            const newSession = this.client.session.save();
            await TelegramSession.findOneAndUpdate(
                { id: 'main' },
                { session: newSession },
                { upsert: true }
            );
            
            console.log('[Telegram] Session authenticated and saved to MongoDB.');
            this.isConnected = true;
            this.authState = 'done';
            return true;
        } catch (err) {
            console.error('[Telegram] Auth failed:', err.message);
            this.authError = err.message;
            this.authState = 'idle';
            return false;
        }
    }

    submitCode(code) {
        if (this._resolveCode) {
            this._resolveCode(code);
            this._resolveCode = null;
        }
    }

    submitPassword(password) {
        if (this._resolvePassword) {
            this._resolvePassword(password);
            this._resolvePassword = null;
        }
    }

    async setupListeners(sources, onMessageReceived) {
        if (!this.client) return;

        const cleanedSources = sources.map(s => {
            if (typeof s === 'string' && s.includes('t.me/')) {
                return s.split('t.me/').pop().split('/')[0];
            }
            return s;
        });

        console.log(`[Telegram] Monitoring sources: ${cleanedSources.join(', ')}`);

        this.client.addEventHandler(async (event) => {
            const message = event.message;
            if (this.lastMessageId === message.id) return;
            this.lastMessageId = message.id;

            try {
                const sender = await message.getSender();
                const senderName = sender ? (sender.firstName || sender.username || 'System') : 'Unknown';

                let mediaPath = null;
                if (message.media) {
                    const fileName = `media_${message.id}_${Date.now()}`;
                    mediaPath = path.join(this.tempDir, fileName);

                    console.log(`[Telegram] Downloading media for message ${message.id}...`);
                    const buffer = await this.client.downloadMedia(message.media, {});

                    if (buffer) {
                        await fs.writeFile(mediaPath, buffer);
                    } else {
                        mediaPath = null;
                    }
                }

                await onMessageReceived({
                    id: message.id,
                    senderName,
                    text: message.message || '',
                    mediaPath
                });
            } catch (err) {
                console.error('[Telegram] Error handling message:', err.message);
            }
        }, new NewMessage({ chats: cleanedSources }));
    }

    async stop() {
        if (this.client) await this.client.disconnect();
    }
}

module.exports = new TelegramService();
