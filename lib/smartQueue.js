// --- START OF lib/smartQueue.js ---
const { EventEmitter } = require('events');
class SmartQueue extends EventEmitter {
    constructor(concurrency = 1) {
        super();
        this.queue = [];
        this.processing = 0;
        this.concurrency = concurrency;
    }
    add(taskFunction, metaData = {}) {
        return new Promise((resolve, reject) => {
            this.queue.push({ taskFunction, metaData, resolve, reject, attempts: 0 });
            this.processNext();
        });
    }
    async processNext() {
        if (this.processing >= this.concurrency || this.queue.length === 0) return;
        const task = this.queue.shift();
        this.processing++;
        try {
            const result = await task.taskFunction();
            task.resolve(result);
        } catch (error) {
            if (task.attempts < 3) {
                task.attempts++;
                setTimeout(() => {
                    this.queue.unshift(task);
                    this.processing--;
                    this.processNext();
                }, 5000);
                return;
            } else {
                task.reject(error);
            }
        }
        this.processing--;
        this.processNext();
    }
}
const botQueue = new SmartQueue(1);
module.exports = botQueue;
// --- END OF lib/smartQueue.js ---
