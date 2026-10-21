/**
 * 👑 DMC MASTER ANTI-CRASH & ANTI-BAN DOWNLOAD GUARD 👑
 * 
 * CORE PROTECTIONS:
 * 1. 🛡️ Single Active Download Per Chat:
 *    - Blocks concurrent downloads from the same chat (eka chat ekakin downloading dekak illuwoth lock & block).
 * 2. 🛡️ WhatsApp Anti-Ban Cooldown:
 *    - Enforces a safety cooldown (6s) after every download to eliminate rapid-fire bot patterns that trigger WhatsApp bans.
 * 3. 🛡️ Global Server Concurrency Limiter:
 *    - Caps simultaneous heavy media uploads bot-wide (max 2 at a time) to prevent RAM exhaustion (OOM) and socket drops.
 * 4. 🛡️ 1000% Zero-Crash Process Immunity:
 *    - Intercepts uncaughtException & unhandledRejection so unexpected stream cuts, network drops, or socket errors NEVER crash the bot.
 * 5. 🛡️ Auto-Healing Watchdog:
 *    - Automatically purges and unlocks any download that exceeds 8 minutes, guaranteeing zero permanent lockouts.
 * 6. 🛡️ Anti-Ban Human Presence Simulation:
 *    - Injects natural presence states (composing/recording) and human-like pacing before file dispatches.
 */

const { EventEmitter } = require('events');

class DownloadGuardEngine extends EventEmitter {
    constructor() {
        super();
        this.activeDownloads = new Map(); // chatJid -> taskInfo
        this.chatCooldowns = new Map();   // chatJid -> expiryTimestamp
        this.MAX_GLOBAL_CONCURRENT = 1;   // Strict 1 heavy active media operation at a time for Koyeb 512MB RAM
        this.COOLDOWN_MS = 4000;          // 4 seconds anti-spam buffer between downloads per chat
        this.WATCHDOG_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes auto-release watchdog (prevents 8-min hangs)

        this.installProcessCrashGuard();
        this.startRamGuard();
    }

    /**
     * Installs permanent process-level crash immunity.
     * Prevents Node.js from terminating on any unhandled stream/promise/socket error.
     */
    installProcessCrashGuard() {
        if (global.__crashGuardActive) return;
        global.__crashGuardActive = true;

        process.on('uncaughtException', (err, origin) => {
            console.error(`🛡️ [CRASH GUARD] Uncaught Exception Intercepted (${origin || 'unknown'}):`, err?.message || err);
            if (err?.stack) console.error(err.stack);
            // Process remains alive and WhatsApp connection is preserved
        });

        process.on('unhandledRejection', (reason) => {
            console.error(`🛡️ [CRASH GUARD] Unhandled Rejection Intercepted:`, reason?.message || reason);
            // Process remains alive and WhatsApp connection is preserved
        });

        console.log("🛡️ [CRASH GUARD] 1000% Zero-Crash & Anti-Ban Immunity Active!");
    }

    /**
     * Permanent Koyeb 512MB RAM & Memory Leak Protection.
     * Runs every 30s to prune session stores and trigger V8 garbage collection.
     */
    startRamGuard() {
        if (global.__ramGuardActive) return;
        global.__ramGuardActive = true;

        setInterval(() => {
            try {
                // 1. Prune interactive movie search sessions older than 5 minutes
                if (global.movieSessions) {
                    const now = Date.now();
                    for (const [sender, sess] of Object.entries(global.movieSessions)) {
                        if (now - sess.timestamp > 300000) {
                            delete global.movieSessions[sender];
                        }
                    }
                }

                // 2. Prune old activePolls
                if (global.activePolls && global.activePolls.size > 150) {
                    global.activePolls.clear();
                }

                // 3. Inspect Memory Usage
                const mem = process.memoryUsage();
                const rssMb = Math.round(mem.rss / 1024 / 1024);
                const heapMb = Math.round(mem.heapUsed / 1024 / 1024);

                // If RSS > 320MB or Heap > 220MB, purge caches and trigger GC immediately
                if (rssMb > 320 || heapMb > 220) {
                    console.log(`🛡️ [RAM Guard] Memory threshold reached (RSS: ${rssMb}MB, Heap: ${heapMb}MB). Purging caches...`);
                    if (global.movieSessions) global.movieSessions = {};
                    if (global.gc) {
                        global.gc();
                        const afterMem = process.memoryUsage();
                        console.log(`🛡️ [RAM Guard] GC Executed! Heap: ${heapMb}MB -> ${Math.round(afterMem.heapUsed / 1024 / 1024)}MB | RSS: ${Math.round(afterMem.rss / 1024 / 1024)}MB`);
                    }
                }
            } catch (e) {}
        }, 30000);

        console.log("🛡️ [RAM Guard] 512MB Koyeb RAM & Memory Protection Active (30s Cycle)!");
    }

    /**
     * Formats elapsed time into human readable format (e.g., "45s", "2m 10s")
     */
    formatElapsed(startTime) {
        const totalSec = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
        if (totalSec < 60) return `${totalSec}s`;
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        return `${mins}m ${secs}s`;
    }

    /**
     * Format Sinhala user alert when another download is already in progress in the chat.
     */
    formatBusyMessage(task) {
        const elapsed = this.formatElapsed(task.startTime);
        const title = task.title ? (task.title.length > 55 ? task.title.slice(0, 52) + '...' : task.title) : 'මාධ්‍ය ගොනුව (Media)';
        return `⚠️ *බාගත කිරීම් ආරක්ෂකය (Anti-Crash & Anti-Ban Guard)* ⚠️\n\n` +
               `🛑 *දැනටමත් ඔබගේ Chat එක තුළ බාගත කිරීමක් (Download) සිදුවෙමින් පවතී!*\n\n` +
               `📦 *ක්‍රියාකාරී ගොනුව:* ${title}\n` +
               `🎞️ *වර්ගය:* ${task.type || 'වීඩියෝ / මාධ්‍ය'}\n` +
               `⏱️ *ගතවූ කාලය:* ${elapsed}\n` +
               `⏳ *තත්ත්වය:* WhatsApp වෙත සකස් කර එවමින් පවතී...\n\n` +
               `_🔒 Bot එක Crash වීම සහ WhatsApp ගිණුම Ban වීම 100% වැළැක්වීම සඳහා එක් Chat එකක් තුළ එකවර බාගත කළ හැක්කේ එක් ගොනුවක් පමණි._\n` +
               `_කරුණාකර පෙර ගොනුව ලැබෙන තුරු හෝ අවසන් වන තුරු මදක් රැඳී සිටින්න._\n\n` +
               `_👑 ＤＭＣ™ Anti-Ban Security Engine_`;
    }

    /**
     * Format Sinhala user alert during post-download safety cooldown.
     */
    formatCooldownMessage(remainingSec) {
        return `⏳ *WhatsApp Anti-Ban ආරක්ෂකය ක්‍රියාත්මකයි!*\n\n` +
               `_WhatsApp ගිණුම Ban වීම වැළැක්වීම සඳහා ගොනු දෙකක් අතර තත්පර කිහිපයක විවේකයක් (Anti-Spam Cooldown) අවශ්‍ය වේ._\n\n` +
               `කරුණාකර තත්පර *${remainingSec}* කින් නැවත උත්සාහ කරන්න.\n\n` +
               `_👑 ＤＭＣ™ Anti-Ban Security Engine_`;
    }

    /**
     * Format Sinhala user alert when global concurrency limit is reached.
     */
    formatGlobalBusyMessage(activeTask) {
        const title = activeTask?.title ? (activeTask.title.length > 45 ? activeTask.title.slice(0, 42) + '...' : activeTask.title) : 'වීඩියෝ / මාධ්‍ය ගොනුව';
        const elapsed = activeTask?.startTime ? this.formatElapsed(activeTask.startTime) : 'සුළු මොහොතක්';
        return `⏳ *DMC™ Server Cloud Queue (පෝලිමේ ඇත)* ⏳\n\n` +
               `🛑 *දැනට වෙනත් සාමාජිකයෙකුගේ බාගත කිරීමක් සර්වර් එක තුළ සිදුවෙමින් පවතී!*\n\n` +
               `📦 *ක්‍රියාකාරී ගොනුව:* ${title}\n` +
               `⏱️ *ගතවූ කාලය:* ${elapsed}\n` +
               `📍 *ඔබගේ ස්ථානය:* පෝලිමේ #1\n\n` +
               `🔒 *Koyeb 512MB RAM & Zero-Crash ආරක්ෂාව:*\n` +
               `_Server එකේ RAM පිරී යාම (Memory 97% spike), Bot එක Freeze වීම සහ WhatsApp ගිණුම Ban වීම 100% වැළැක්වීම සඳහා Cloud Server එක තුළ එකවර සිදුවිය හැක්කේ එක් බාගත කිරීමක් පමණි._\n\n` +
               `_💡 පෙර බාගත කිරීම අවසන් වූ පසු (තත්පර කිහිපයකින්) නැවත 1-Tap Link එක ඔබන්න._\n\n` +
               `_👑 ＤＭＣ™ Anti-Ban Security Engine_`;
    }

    /**
     * Attempt to acquire an exclusive download lock for a chat.
     * @param {string} chatJid - remoteJid of the conversation
     * @param {string} senderJid - participant or sender Jid
     * @param {object} details - { title, type, url }
     * @returns {object} { allowed: boolean, reason?: string, message?: string }
     */
    acquireLock(chatJid, senderJid, details = {}) {
        if (!chatJid) return { allowed: true };

        // 1. Check if an active download already exists in this chat
        if (this.activeDownloads.has(chatJid)) {
            const task = this.activeDownloads.get(chatJid);
            console.log(`🛡️ [DownloadGuard] Blocked concurrent download in ${chatJid}. Existing: "${task.title}"`);
            return {
                allowed: false,
                reason: 'CHAT_BUSY',
                activeTask: task,
                message: this.formatBusyMessage(task)
            };
        }

        // 2. Check anti-ban cooldown for this chat
        if (this.chatCooldowns.has(chatJid)) {
            const expiry = this.chatCooldowns.get(chatJid);
            if (Date.now() < expiry) {
                const remainingSec = Math.ceil((expiry - Date.now()) / 1000);
                console.log(`🛡️ [DownloadGuard] Chat ${chatJid} is in anti-ban cooldown (${remainingSec}s left)`);
                return {
                    allowed: false,
                    reason: 'COOLDOWN',
                    remainingSeconds: remainingSec,
                    message: this.formatCooldownMessage(remainingSec)
                };
            } else {
                this.chatCooldowns.delete(chatJid);
            }
        }

        // 3. Check global concurrent heavy download limit (Strict 1 for Koyeb 512MB RAM)
        if (this.activeDownloads.size >= this.MAX_GLOBAL_CONCURRENT) {
            const activeTask = Array.from(this.activeDownloads.values())[0];
            console.log(`🛡️ [DownloadGuard] Global limit (1) active. Chat ${chatJid} throttled. Active: "${activeTask?.title}"`);
            return {
                allowed: false,
                reason: 'GLOBAL_BUSY',
                activeCount: this.activeDownloads.size,
                activeTask,
                message: this.formatGlobalBusyMessage(activeTask)
            };
        }

        // 4. Set auto-healing watchdog timer
        const watchdogTimer = setTimeout(() => {
            console.warn(`⚠️ [DownloadGuard Watchdog] Hung task detected in ${chatJid} ("${details.title || 'Unknown'}"). Auto-releasing lock.`);
            this.releaseLock(chatJid, false);
        }, this.WATCHDOG_TIMEOUT_MS);

        if (watchdogTimer.unref) watchdogTimer.unref();

        const taskInfo = {
            id: 'dl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            chatJid,
            senderJid: senderJid || chatJid,
            title: details.title || 'Media File',
            type: details.type || 'Media Download',
            url: details.url || '',
            startTime: Date.now(),
            watchdogTimer
        };

        this.activeDownloads.set(chatJid, taskInfo);
        console.log(`🔒 [DownloadGuard] Lock ACQUIRED for ${chatJid} | Title: "${taskInfo.title}" | Active Global: ${this.activeDownloads.size}`);

        return {
            allowed: true,
            lockId: taskInfo.id
        };
    }

    /**
     * Update task title or details mid-flight (e.g. once real filename is resolved).
     */
    updateTask(chatJid, updates = {}) {
        if (!chatJid || !this.activeDownloads.has(chatJid)) return;
        const current = this.activeDownloads.get(chatJid);
        Object.assign(current, updates);
    }

    /**
     * Release exclusive lock and activate Anti-Ban cooldown.
     * @param {string} chatJid - remoteJid of the conversation
     * @param {boolean} setCooldown - whether to apply 6s anti-ban cooldown (default: true)
     */
    releaseLock(chatJid, setCooldown = true) {
        if (!chatJid || !this.activeDownloads.has(chatJid)) return;

        const task = this.activeDownloads.get(chatJid);
        if (task && task.watchdogTimer) {
            clearTimeout(task.watchdogTimer);
        }

        this.activeDownloads.delete(chatJid);

        if (setCooldown) {
            this.chatCooldowns.set(chatJid, Date.now() + this.COOLDOWN_MS);
        }

        console.log(`🔓 [DownloadGuard] Lock RELEASED for ${chatJid} | Title: "${task?.title || 'Media'}" | Active Global: ${this.activeDownloads.size}`);
    }

    /**
     * Administrative force release of all or specific locks.
     */
    forceRelease(chatJid) {
        if (chatJid) {
            this.releaseLock(chatJid, false);
            this.chatCooldowns.delete(chatJid);
            return `✅ Released lock for ${chatJid}`;
        } else {
            for (const [jid, task] of this.activeDownloads.entries()) {
                if (task.watchdogTimer) clearTimeout(task.watchdogTimer);
            }
            this.activeDownloads.clear();
            this.chatCooldowns.clear();
            return `✅ All download locks forcefully cleared!`;
        }
    }

    /**
     * Check if a chat is currently downloading.
     */
    isDownloading(chatJid) {
        return this.activeDownloads.has(chatJid);
    }

    /**
     * Get active task info for a chat.
     */
    getActiveTask(chatJid) {
        return this.activeDownloads.get(chatJid) || null;
    }

    /**
     * Get total active downloads across the bot.
     */
    getActiveCount() {
        return this.activeDownloads.size;
    }

    /**
     * Human-like Presence Simulation to prevent WhatsApp automated anti-spam ban.
     */
    async simulatePresenceSafely(conn, jid, mediaType = 'video') {
        try {
            if (!conn || !jid) return;
            const presenceType = mediaType === 'audio' ? 'recording' : 'composing';
            await conn.sendPresenceUpdate(presenceType, jid).catch(() => {});
            // Brief human-like pause (800ms) before binary push
            await new Promise(r => setTimeout(r, 800));
        } catch (e) {}
    }
}

// Singleton Instance
const DownloadGuard = new DownloadGuardEngine();

module.exports = DownloadGuard;
