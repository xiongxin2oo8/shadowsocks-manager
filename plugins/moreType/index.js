const knex = appRequire('init/knex').knex;

//获得在线ip 及 最近使用订阅的ip
const getAliveIP = async (accountId) => {
    try {
        const alive_ips = await knex('alive_ip').select(['ip', 'datetime']).where('userId', accountId).andWhere('datetime', '>', (new Date() / 1000) - 180);
        const sub_ips = await knex('subscribe_log').select(['ip', 'datetime']).where('accountId',accountId).limit(6)
        return { alive_ips, sub_ips }
    } catch (error) {
        console.log(error);
    }
};

exports.getAliveIP = getAliveIP;