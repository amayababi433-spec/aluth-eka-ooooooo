const fs = require('fs');
const path = './task_store.json';

// 👑 ᴘᴏᴡᴇʀᴇᴅ ʙʏ ＤＭＣ™ 👑 - TASK RECOVERY SYSTEM
const TaskManager = {
    // නව Task එකක් සේව් කිරීම
    saveTask: (taskId, data) => {
        let tasks = {};
        if (fs.existsSync(path)) {
            try {
                tasks = JSON.parse(fs.readFileSync(path));
            } catch (e) {
                tasks = {};
            }
        }
        tasks[taskId] = { ...data, status: 'pending', timestamp: Date.now() };
        fs.writeFileSync(path, JSON.stringify(tasks, null, 2));
    },

    // වැඩේ ඉවර වුණාම අයින් කිරීම
    removeTask: (taskId) => {
        if (!fs.existsSync(path)) return;
        try {
            let tasks = JSON.parse(fs.readFileSync(path));
            if (tasks[taskId]) {
                delete tasks[taskId];
                fs.writeFileSync(path, JSON.stringify(tasks, null, 2));
            }
        } catch (e) {
            console.error("Error removing task:", e);
        }
    },

    // අතරමඟ නැවතුණු වැඩ බැලීම
    getPendingTasks: () => {
        if (!fs.existsSync(path)) return [];
        try {
            let tasks = JSON.parse(fs.readFileSync(path));
            return Object.entries(tasks).map(([id, details]) => ({ id, ...details }));
        } catch (e) {
            return [];
        }
    }
};

module.exports = TaskManager;
