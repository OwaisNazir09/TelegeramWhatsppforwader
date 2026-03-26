require('dotenv').config();
const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const fs = require('fs-extra');
const http = require('http');

const telegramService = require('./services/telegramService');
const whatsappService = require('./services/whatsappService');

// ============ CONFIG ============
const configPath = path.join(__dirname, '..', 'config.json');
let config;
try {
    config = fs.readJsonSync(configPath);
} catch (error) {
    console.error('Error: Could not load config.json');
    process.exit(1);
}

const { TELEGRAM_SOURCES, WHATSAPP_GROUP_NAME } = config;
const TEMP_DIR = path.join(__dirname, '..', 'temp');
const PORT = process.env.PORT || 3000;

const logs = [];
function addLog(msg) {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${msg}`;
    logs.unshift(entry);
    if (logs.length > 50) logs.pop();
    console.log(entry);
}

class MessageQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
    }

    push(task) {
        this.queue.push(task);
        this.process();
    }

    async process() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;

        const task = this.queue.shift();
        try {
            await task();
        } catch (err) {
            addLog(`Task error: ${err.message}`);
        } finally {
            const delay = Math.floor(Math.random() * 1000) + 1000;
            setTimeout(() => {
                this.processing = false;
                this.process();
            }, delay);
        }
    }
}

const queue = new MessageQueue();
let forwarderActive = false;

// ============ EXPRESS APP ============
const app = express();

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: 'layout',
    layoutsDir: path.join(__dirname, 'views'),
    partialsDir: path.join(__dirname, 'views'),
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// ============ ROUTES ============

// Dashboard
app.get('/', (req, res) => {
    res.render('dashboard', {
        title: 'Dashboard',
        whatsappReady: whatsappService.isReady,
        telegramReady: telegramService.isConnected,
        forwarderActive,
        logs: logs.slice(0, 20),
        layout: 'layout',
    });
});

// WhatsApp QR Page
app.get('/whatsapp', async (req, res) => {
    // Start WhatsApp initialization if not already running
    if (!whatsappService.isReady && !whatsappService.initializing) {
        addLog('Starting WhatsApp client...');
        whatsappService.initialize().catch(err => {
            addLog(`WhatsApp init error: ${err.message}`);
        });
    }

    res.render('whatsapp', {
        title: 'WhatsApp Setup',
        qrDataUrl: whatsappService.latestQrDataUrl,
        connected: whatsappService.isReady,
        layout: 'layout',
    });
});

// Telegram Auth Page
app.get('/telegram', async (req, res) => {
    // Initialize telegram client if not done
    if (!telegramService.client) {
        try {
            await telegramService.initialize(
                process.env.TELEGRAM_API_ID,
                process.env.TELEGRAM_API_HASH
            );
        } catch (err) {
            addLog(`Telegram init error: ${err.message}`);
        }
    }

    res.render('telegram', {
        title: 'Telegram Setup',
        connected: telegramService.isConnected,
        waitingForCode: telegramService.authState === 'waitingForCode',
        waitingForPassword: telegramService.authState === 'waitingForPassword',
        error: telegramService.authError,
        layout: 'layout',
    });
});

// Telegram: Submit Phone Number
app.post('/telegram/phone', async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.render('telegram', {
            title: 'Telegram Setup',
            error: 'Phone number is required.',
            layout: 'layout',
        });
    }

    addLog(`Telegram: Starting auth for ${phone}`);

    // Start auth in background (don't await — it will block until code/password)
    telegramService.startPhoneAuth(phone).then(success => {
        if (success) {
            addLog('Telegram: Authentication successful!');
        } else {
            addLog(`Telegram: Authentication failed — ${telegramService.authError}`);
        }
    });

    // Wait a moment for the auth state to transition
    await new Promise(r => setTimeout(r, 3000));

    res.redirect('/telegram');
});

// Telegram: Submit OTP Code
app.post('/telegram/code', async (req, res) => {
    const { code } = req.body;
    if (code) {
        addLog('Telegram: OTP code submitted');
        telegramService.submitCode(code);
    }

    // Wait for auth to process
    await new Promise(r => setTimeout(r, 3000));

    res.redirect('/telegram');
});

// Telegram: Submit 2FA Password
app.post('/telegram/password', async (req, res) => {
    const { password } = req.body;
    if (password) {
        addLog('Telegram: 2FA password submitted');
        telegramService.submitPassword(password);
    }

    // Wait for auth to process
    await new Promise(r => setTimeout(r, 3000));

    res.redirect('/telegram');
});

// Start Forwarder Function
async function startForwarder() {
    if (forwarderActive) return;

    // Check if both services are ready
    if (!whatsappService.isReady || !telegramService.isConnected) {
        addLog('Attempted to start forwarder, but services are not ready yet...');
        return;
    }

    try {
        await fs.ensureDir(TEMP_DIR);

        const targetGroup = await whatsappService.findGroupByName(WHATSAPP_GROUP_NAME);
        if (!targetGroup) {
            addLog(`ERROR: WhatsApp group "${WHATSAPP_GROUP_NAME}" not found. Verify the name in config.json.`);
            return;
        }

        addLog(`Found WhatsApp group: ${WHATSAPP_GROUP_NAME}`);

        // Set up Telegram listeners
        await telegramService.setupListeners(TELEGRAM_SOURCES, async (msgData) => {
            const { senderName, text, mediaPath, id } = msgData;

            queue.push(async () => {
                addLog(`Processing message ${id} from ${senderName}...`);

                const caption = `[Telegram News]\nSender: ${senderName}\n\n${text}`;

                try {
                    const success = await whatsappService.sendMessage(targetGroup, {
                        text: caption,
                        mediaPath,
                        caption,
                    });

                    if (success) {
                        addLog(`✅ Forwarded message ${id}`);
                    } else {
                        addLog(`❌ Failed to forward message ${id}`);
                    }
                } finally {
                    if (mediaPath && fs.existsSync(mediaPath)) {
                        await fs.remove(mediaPath);
                    }
                }
            });
        });

        forwarderActive = true;
        addLog('🚀 Forwarder is now active!');
    } catch (err) {
        addLog(`Start error: ${err.message}`);
    }
}

// ============ CRON: SELF-PING TO KEEP SERVER ALIVE ============
function startSelfPing() {
    const RENDER_URL = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;

    if (!RENDER_URL) {
        console.log('[Cron] No RENDER_EXTERNAL_URL or APP_URL set. Self-ping disabled.');
        console.log('[Cron] Set RENDER_EXTERNAL_URL in Render environment variables to enable.');
        return;
    }

    const pingUrl = `${RENDER_URL}/health`;
    const INTERVAL = 14 * 60 * 1000; // Every 14 minutes

    setInterval(() => {
        const protocol = pingUrl.startsWith('https') ? require('https') : http;
        protocol.get(pingUrl, (res) => {
            addLog(`[Cron] Self-ping OK (status: ${res.statusCode})`);
        }).on('error', (err) => {
            addLog(`[Cron] Self-ping failed: ${err.message}`);
        });

        // While we are at it, try to auto-start if not active
        if (!forwarderActive && whatsappService.isReady && telegramService.isConnected) {
            startForwarder().catch(e => console.error('Auto-start error:', e));
        }
    }, INTERVAL);

    addLog(`[Cron] Self-ping enabled — pinging ${pingUrl} every 14 minutes`);
}

// ============ ROUTES CONTINUED ============

// Manual Start Forwarder route (kept for UI compatibility)
app.get('/start', async (req, res) => {
    if (!forwarderActive) {
        await startForwarder();
    }
    res.redirect('/');
});

// Health check endpoint (required for Render/Cron)
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        whatsapp: whatsappService.isReady,
        telegram: telegramService.isConnected,
        forwarder: forwarderActive,
    });
});

// ============ START SERVER ============
app.listen(PORT, async () => {
    console.log(`\n🌐 Dashboard running at http://localhost:${PORT}`);
    console.log('Open this URL in your browser to set up WhatsApp & Telegram.\n');
    addLog('Server started - checking for existing sessions...');

    // Auto-initialize services on startup
    addLog('Searching for saved sessions in MongoDB...');
    
    // Initialize WhatsApp
    whatsappService.initialize().catch(err => {
        addLog(`WhatsApp auto-init error: ${err.message}`);
    });

    // Initialize Telegram
    if (process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH) {
        telegramService.initialize(
            process.env.TELEGRAM_API_ID,
            process.env.TELEGRAM_API_HASH
        ).catch(err => {
            addLog(`Telegram auto-init error: ${err.message}`);
        });
    }

    // Auto-start check every 5 seconds until active
    const autoStartInterval = setInterval(() => {
        if (forwarderActive) {
            clearInterval(autoStartInterval);
        } else if (whatsappService.isReady && telegramService.isConnected) {
            startForwarder().catch(e => console.error('Auto-start error:', e));
        }
    }, 5000);

    startSelfPing();
});
