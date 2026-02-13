/**
 * QQ经典农场 挂机脚本 - 入口文件
 *
 * 模块结构:
 *   src/config.js   - 配置常量与枚举
 *   src/utils.js    - 通用工具函数
 *   src/proto.js    - Protobuf 加载与类型管理
 *   src/network.js  - WebSocket 连接/消息编解码/登录/心跳
 *   src/farm.js     - 自己农场操作与巡田循环
 *   src/friend.js   - 好友农场操作与巡查循环
 *   src/decode.js   - PB解码/验证工具模式
 */

const { CONFIG } = require('./src/config');
const { loadProto } = require('./src/proto');
const { connect, cleanup, getWs } = require('./src/network');
const { startFarmCheckLoop, stopFarmCheckLoop } = require('./src/farm');
const { startFriendCheckLoop, stopFriendCheckLoop } = require('./src/friend');
const { initTaskSystem, cleanupTaskSystem } = require('./src/task');
const { initStatusBar, cleanupStatusBar, setStatusPlatform } = require('./src/status');
const { startSellLoop, stopSellLoop, debugSellFruits } = require('./src/warehouse');
const { processInviteCodes } = require('./src/invite');
const { verifyMode, decodeMode } = require('./src/decode');
const { emitRuntimeHint, sleep, parseBoolean } = require('./src/utils');
const { startInteractive, safeLog } = require('./src/interactive');

// ============ 帮助信息 ============
function showHelp() {
    console.log(`
QQ经典农场 挂机脚本
====================

用法:
  node client.js --code <登录code> [--wx] [--interval <秒>] [--friend-interval <秒>]
  node client.js --verify
  node client.js --decode <数据> [--hex] [--gate] [--type <消息类型>]

参数:
  --code              小程序 login() 返回的临时凭证 (必需)
  --wx                使用微信登录 (默认为QQ小程序)
  --interval          自己农场巡查完成后等待秒数, 默认10秒, 最低10秒
  --friend-interval   好友巡查完成后等待秒数, 默认1秒, 最低1秒
  --verify            验证proto定义
  --decode            解码PB数据 (运行 --decode 无参数查看详细帮助)

功能:
  - 自动收获成熟作物 → 购买种子 → 种植 → 施肥
  - 自动除草、除虫、浇水
  - 自动铲除枯死作物
  - 自动巡查好友农场: 帮忙浇水/除草/除虫 + 偷菜
  - 自动领取任务奖励 (支持分享翻倍)
  - 每分钟自动出售仓库果实
  - 启动时读取 share.txt 处理邀请码 (仅微信)
  - 心跳保活

邀请码文件 (share.txt):
  每行一个邀请链接，格式: ?uid=xxx&openid=xxx&share_source=xxx&doc_id=xxx
  启动时会尝试通过 SyncAll API 同步这些好友
`);
}

// ============ 参数解析 ============
function parseArgs(args) {
    const options = {
        code: '',
        deleteAccountMode: false,
        name: '',
        certId: '',
        certType: 0,
    };

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--code' && args[i + 1]) {
            options.code = args[++i];
        }
        if (args[i] === '--wx') {
            CONFIG.platform = 'wx';
        }
        if (args[i] === '--seed-id' && args[i + 1]) {
            CONFIG.farmSeedId = parseInt(args[++i]);
        }
        if (args[i] === '--interval' && args[i + 1]) {
            const sec = parseInt(args[++i]);
            CONFIG.farmCheckInterval = Math.max(sec, 1) * 1000;
        }
        if (args[i] === '--friend-interval' && args[i + 1]) {
            const sec = parseInt(args[++i]);
            CONFIG.friendCheckInterval = Math.max(sec, 1) * 1000;  // 最低1秒
        }
    }
    return options;
}

// ============ 主函数 ============
async function main() {
    const args = process.argv.slice(2);

    // 加载 proto 定义
    await loadProto();

    // 验证模式
    if (args.includes('--verify')) {
        await verifyMode();
        return;
    }

    // 解码模式
    if (args.includes('--decode')) {
        await decodeMode(args);
        return;
    }

    // 正常挂机模式
    const options = parseArgs(args);
    if (!options.code) {
        showHelp();
        process.exit(1);
    }
    if (options.deleteAccountMode && (!options.name || !options.certId)) {
        console.log('[参数] 注销账号模式必须提供 --name 和 --cert-id');
        showHelp();
        process.exit(1);
    }

    // 初始化状态栏
    initStatusBar();
    setStatusPlatform(CONFIG.platform);
    emitRuntimeHint(true);

    const platformName = CONFIG.platform === 'wx' ? '微信' : 'QQ';
    console.log(`[启动] ${platformName} code=${options.code.substring(0, 8)}... 农场${CONFIG.farmCheckInterval / 1000}s 好友${CONFIG.friendCheckInterval / 1000}s`);

    // 连接并登录，登录成功后启动各功能模块
    connect(options.code, async () => {
        // 处理邀请码 (仅微信环境)
        await processInviteCodes();
        
        startFarmCheckLoop();
        startFriendCheckLoop();

        if(CONFIG.autoClaimEnabled)
            initTaskSystem();
        
        // 启动时立即检查一次背包
        // setTimeout(() => debugSellFruits(), 5000);
        // startSellLoop(60000);  // 每分钟自动出售仓库果实
        startInteractive((cmd) => {
            const parts = cmd.trim().split(/\s+/);
            const name = parts[0]?.toLowerCase();
            const arg = parts[1]; // 第二个参数，可能为空

            // ---------- 1. 种子ID ----------
            if (name === 'seed') {
                if (!arg) {
                    safeLog(`[CONFIG] 当前 farmSeedId = ${CONFIG.farmSeedId}`);
                    return;
                }
                const id = parseInt(arg);
                if (isNaN(id) || id <= 0) {
                    safeLog('[错误] seed <id> 必须是正整数');
                    return;
                }
                CONFIG.farmSeedId = id;
                safeLog(`[CONFIG] 已更新 farmSeedId = ${id}`);
                return;
            }

            // ---------- 2. 好友巡查开关 ----------
            if (name === 'friend' || name === 'friendcheck') {
                if (!arg) {
                    safeLog(`[CONFIG] 好友巡查开关: ${CONFIG.friendCheck ? '开启' : '关闭'}`);
                    return;
                }
                const enabled = parseBoolean(arg);
                if (enabled === undefined) {
                    safeLog('[错误] friend 参数应为 on/off, true/false, 1/0');
                    return;
                }
                CONFIG.friendCheck = enabled;
                safeLog(`[CONFIG] 好友巡查已${enabled ? '开启' : '关闭'}`);
                return;
            }

            // ---------- 3. 自动领取任务开关 ----------
            // if (name === 'auto' || name === 'claim' || name === 'autoclaim') {
            //     if (!arg) {
            //         safeLog(`[CONFIG] 自动领取任务开关: ${CONFIG.autoClaimEnabled ? '开启' : '关闭'}`);
            //         return;
            //     }
            //     const enabled = parseBoolean(arg);
            //     if (enabled === undefined) {
            //         safeLog('[错误] auto 参数应为 on/off, true/false, 1/0');
            //         return;
            //     }
            //     CONFIG.autoClaimEnabled = enabled;
            //     safeLog(`[CONFIG] 自动领取任务已${enabled ? '开启' : '关闭'}`);
            //     return;
            // }

            // ---------- 4. 自己农场巡查间隔 ----------
            if (name === 'interval') {
                if (!arg) {
                    safeLog(`[CONFIG] 当前 farmCheckInterval = ${CONFIG.farmCheckInterval} ms`);
                    return;
                }
                const val = parseInt(arg);
                if (isNaN(val) || val < 1000) {
                    safeLog('[错误] interval 必须为 ≥1000 的整数（毫秒）');
                    return;
                }
                CONFIG.farmCheckInterval = val;
                safeLog(`[CONFIG] 已更新 farmCheckInterval = ${val} ms`);
                return;
            }

            // ---------- 5. 好友农场巡查间隔 ----------
            if (name === 'finterval' || name === 'friendinterval') {
                if (!arg) {
                    safeLog(`[CONFIG] 当前 friendCheckInterval = ${CONFIG.friendCheckInterval} ms`);
                    return;
                }
                const val = parseInt(arg);
                if (isNaN(val) || val < 1000) {
                    safeLog('[错误] finterval 必须为 ≥1000 的整数（毫秒）');
                    return;
                }
                CONFIG.friendCheckInterval = val;
                safeLog(`[CONFIG] 已更新 friendCheckInterval = ${val} ms`);
                return;
            }
            // ---------- 7. 显示全部配置 ----------
            if (name === 'config' || name === 'show') {
                safeLog('========== 当前配置 ==========');
                safeLog(`服务器: ${CONFIG.serverUrl}`);
                safeLog(`客户端版本: ${CONFIG.clientVersion}`);
                safeLog(`平台: ${CONFIG.platform}`);
                safeLog(`操作系统: ${CONFIG.os}`);
                safeLog(`心跳间隔: ${CONFIG.heartbeatInterval} ms`);
                safeLog(`自己农场巡查间隔: ${CONFIG.farmCheckInterval} ms`);
                safeLog(`好友巡查间隔: ${CONFIG.friendCheckInterval} ms`);
                safeLog(`种子 ID: ${CONFIG.farmSeedId ?? '未设置'}`);
                safeLog(`自动领取任务: ${CONFIG.autoClaimEnabled ? '开启' : '关闭'}`);
                safeLog(`好友巡查: ${CONFIG.friendCheck ? '开启' : '关闭'}`);
                safeLog('==============================');
                return;
            }

            // ---------- 8. 退出 ----------
            if (name === 'exit' || name === 'quit') {
                safeLog('[交互] 正在退出...');
                process.kill(process.pid, 'SIGINT');
                return;
            }

            // ---------- 未知命令 ----------
            safeLog(`[未知命令] ${cmd}`);
        });

    });

    // 退出处理
    process.on('SIGINT', () => {
        cleanupStatusBar();
        console.log('\n[退出] 正在断开...');
        stopFarmCheckLoop();
        stopFriendCheckLoop();
        cleanupTaskSystem();
        stopSellLoop();
        cleanup();
        const ws = getWs();
        if (ws) ws.close();
        process.exit(0);
    });
}

main().catch(err => {
    console.error('启动失败:', err);
    process.exit(1);
});
