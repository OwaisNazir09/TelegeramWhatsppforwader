require('dotenv').config();
const fs = require('fs');
const path = require('path');
const telegramService = require('./services/telegramService');
const whatsappService = require('./services/whatsappService');

// Load config
const configPath = path.join(__dirname, '..', 'config.json');
let config;
try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
    console.error('Error loading config.json:', error);
    process.exit(1);
}

const { TELEGRAM_SOURCE, WHATSAPP_GROUP_NAME } = config;

async function start() {
    console.log('--- Starting Telegram to WhatsApp Forwarder (User Account) ---');

    try {
        console.log('Initializing WhatsApp Service...');
        await whatsappService.initialize();

        console.log(`Searching for WhatsApp Group: "${WHATSAPP_GROUP_NAME}"...`);
        const targetGroup = await whatsappService.findGroupByName(WHATSAPP_GROUP_NAME);

        if (!targetGroup) {
            console.error(`ERROR: WhatsApp Group "${WHATSAPP_GROUP_NAME}" not found.`);
            process.exit(1);
        }
        console.log(`WhatsApp Group Found!`);

        // Initialize Telegram (Direct User Account)
        console.log('Initializing Telegram User Account...');
        const telegramInitialized = await telegramService.initialize(
            process.env.TELEGRAM_API_ID,
            process.env.TELEGRAM_API_HASH
        );

        if (!telegramInitialized) {
            console.error('Failed to initialize Telegram Service.');
            process.exit(1);
        }

        // Setup message forwarding logic
        await telegramService.setupListeners(TELEGRAM_SOURCE, async (senderName, text, messageId) => {
            if (!text) return;

            const forwardText = `[Telegram News]\nSender: ${senderName}\n\n${text}`;

            console.log(`[Forwarder] New message (ID: ${messageId}) from ${senderName}.`);

            const delay = Math.floor(Math.random() * 1000) + 1000;
            console.log(`[Forwarder] Waiting ${delay}ms before sending to WhatsApp...`);

            await new Promise(resolve => setTimeout(resolve, delay));

            const success = await whatsappService.sendMessage(targetGroup, forwardText);

            if (success) {
                console.log(`[Forwarder] Message successfully forwarded!`);
            } else {
                console.error(`[Forwarder] FAILED to forward message.`);
            }
        });

        console.log('\nApp is running continuously.');
        console.log(`Listening to Telegram source: ${TELEGRAM_SOURCE}`);
        console.log(`Forwarding to WhatsApp: ${WHATSAPP_GROUP_NAME}`);

    } catch (error) {
        console.error('Critical initialization error:', error);
        process.exit(1);
    }
}

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

start();
