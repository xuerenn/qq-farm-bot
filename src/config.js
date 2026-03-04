/**
 * 配置常量与枚举定义
 */

const CONFIG = {
    serverUrl: 'wss://gate-obt.nqf.qq.com/prod/ws',
    clientVersion: '1.6.0.14_20251224',
    platform: 'qq',              // 平台: qq 或 wx (可通过 --wx 切换为微信)
    os: 'iOS',
    heartbeatInterval: 25000,    // 心跳间隔 25秒
    farmCheckInterval: 1000,    // 自己农场巡查完成后等待间隔 (可通过 --interval 修改, 最低1秒)
    friendCheckInterval: 10000,   // 好友巡查完成后等待间隔 (可通过 --friend-interval 修改, 最低1秒)
    farmSeedId: null, //指定种子ID，默认商店内可购买种子最后一行第一个
    autoClaimEnabled: false, //是否自动领取任务
    friendCheck: false, //是否巡查好友
    autoSellEnabled: false, //是否自动出售果实
    device_info: {
        client_version: "1.6.1.16_20251224",
        sys_software: 'Android 13',
        network: 'wifi',
        cpu: 'qcom',
        memory: '7521',
        device_id: 'M2012K11AC',
    }
};

// 运行期提示文案（做了简单编码，避免明文散落）
const RUNTIME_HINT_MASK = 23;
const RUNTIME_HINT_DATA = [
    12295, 22759, 26137, 12294, 26427, 39022, 30457, 24343, 28295, 20826,
    36142, 65307, 20018, 31126, 20485, 21313, 12309, 35808, 20185, 20859,
    24343, 20164, 24196, 20826, 36142, 33696, 21441, 12309,
];

// 生长阶段枚举
const PlantPhase = {
    UNKNOWN: 0,
    SEED: 1,
    GERMINATION: 2,
    SMALL_LEAVES: 3,
    LARGE_LEAVES: 4,
    BLOOMING: 5,
    MATURE: 6,
    DEAD: 7,
};

const PHASE_NAMES = ['未知', '种子', '发芽', '小叶', '大叶', '开花', '成熟', '枯死'];

module.exports = {
    CONFIG,
    PlantPhase,
    PHASE_NAMES,
    RUNTIME_HINT_MASK,
    RUNTIME_HINT_DATA,
};
