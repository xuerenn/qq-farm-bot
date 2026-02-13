const readline = require('readline');
const util = require('util');
const fs = require('fs');
const { exit } = require('process');


// ---------- 生成带时间戳的日志文件名 ----------
function generateLogFileName() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');

    // 格式：interactive-YYYYMMDD-HHMMSS.log
    return `interactive-${year}${month}${day}-${hour}${minute}${second}.log`;
}

const LOG_FILE = generateLogFileName();
try {
    logStream = fs.createWriteStream(LOG_FILE, {
        flags: 'a',
        encoding: 'utf8',
        autoClose: true,
    });
} catch (err) {
    console.error(`[WARN] 无法打开日志文件 "${LOG_FILE}":`, err.message);
    process.exit();
}

// 处理进程退出，关闭流
process.on('exit', () => {
    console.log(`[INFO] 日志将写入文件: ${LOG_FILE}`);
    if (logStream) {
        logStream.end();
    }
});
// 也可以处理意外退出
process.on('SIGINT', () => {
    if (logStream) logStream.end();
    process.exit();
});


let rl = null;
let inputCache = '';

function startInteractive(onCommand) {
    if (!process.stdin.isTTY) return;

    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '> ',
    });

    // 记录用户正在输入的内容
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }

    process.stdin.on('keypress', (_, key) => {
        if (!key) return;
        if (key.name === 'return') {
            inputCache = '';
        } else if (key.name === 'backspace') {
            inputCache = inputCache.slice(0, -1);
        } else if (key.sequence && key.sequence.length === 1) {
            inputCache += key.sequence;
        }
    });

    rl.on('line', (line) => {
        inputCache = '';
        onCommand(line.trim());
        rl.prompt();
    });

    rl.on('SIGINT', () => {
        process.kill(process.pid, 'SIGINT');
    });

    rl.prompt();
}

function logStreamWrite(message)
{
    if (logStream) {
        logStream.write(message);
    }
}

/**
 * 安全输出日志（不会打断输入）
 */
function safeLog(...args) {

    // 写入文件
    const message = util.format(...args) + '\n';
    if (logStream) {
        logStream.write(message);
    }

    if (!rl) {
        console.log(...args);
        return;
    }

    // 清除当前输入行
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);

    console.log(...args);

    // 重绘输入行
    // process.stdout.write(rl._prompt + inputCache);
    rl.prompt(true);
}

module.exports = {
    startInteractive,
    safeLog,
    logStreamWrite
};
