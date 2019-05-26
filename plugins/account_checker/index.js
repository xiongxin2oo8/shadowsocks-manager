const log4js = require('log4js');
const logger = log4js.getLogger('account');
const cluster = require('cluster');
const process = require('process');
const redis = appRequire('init/redis').redis;
const knex = appRequire('init/knex').knex;
const cron = appRequire('init/cron');
const flow = appRequire('plugins/flowSaver/flow');
const manager = appRequire('services/manager');
const config = appRequire('services/config').all();
const emailPlugin = appRequire('plugins/email/index');
const moment = require('moment');

let acConfig = {};
if (config.plugins.account_checker && config.plugins.account_checker.use) {
  acConfig = config.plugins.account_checker;
}
const speed = acConfig.speed || 5;
const sleepTime = 100;
const accountFlow = appRequire('plugins/account/accountFlow');

//记录错误次数
var error_count = [];
const isTelegram = config.plugins.webgui_telegram && config.plugins.webgui_telegram.use;
let telegram;
if (isTelegram) {
  telegram = appRequire('plugins/webgui_telegram/admin');
}
const sleep = time => new Promise(resolve => setTimeout(resolve, time));

const randomInt = max => {
  return Math.ceil(Math.random() * max % max);
};

const modifyAccountFlow = async (serverId, accountId, nextCheckTime) => {
  await knex('account_flow').update({
    checkTime: Date.now(),
    nextCheckTime,
  }).where({ serverId, accountId });
};

var portList = {};
const updatePorts = async server => {
  if (!portList[server.id] || Date.now() - portList[server.id].update >= 120 * 1000) {
    const ports = (await manager.send({ command: 'portlist' }, {
      host: server.host,
      port: server.port,
      password: server.password,
    }));
    portList[server.id] = {
      ports,
      update: Date.now(),
    };
  }
  return portList[server.id].ports;
};

const isPortExists = async (server, account) => {
  const ports = await updatePorts(server);
  if (ports.includes(server.shift + account.port)) {
    return true;
  } else {
    return false;
  }
};

const isAccountActive = (server, account) => {
  return !!account.active;
};

const hasServer = (server, account) => {
  if (!account.server) { return true; }
  const serverList = JSON.parse(account.server);
  if (serverList.indexOf(server.id) >= 0) { return true; }
  modifyAccountFlow(server.id, account.id, Date.now() + randomInt(7 * 24 * 3600 * 1000));
  return false;
};

const isExpired = (server, account) => {
  if (account.type >= 2 && account.type <= 5) {
    let timePeriod = 0;
    if (account.type === 2) { timePeriod = 7 * 86400 * 1000; }
    if (account.type === 3) { timePeriod = 30 * 86400 * 1000; }
    if (account.type === 4) { timePeriod = 1 * 86400 * 1000; }
    if (account.type === 5) { timePeriod = 3600 * 1000; }
    const data = JSON.parse(account.data);
    const expireTime = data.create + data.limit * timePeriod;
    account.expireTime = expireTime;
    let nextCheckTime = data.create;
    while (nextCheckTime <= Date.now()) {
      nextCheckTime += timePeriod;
    }
    if (expireTime <= Date.now() || data.create >= Date.now()) {
      if (account.active && account.autoRemove && expireTime + account.autoRemoveDelay < Date.now()) {
        knex('account_plugin').delete().where({ id: account.id }).then();
      } else if (account.active && account.autoRemove && expireTime + account.autoRemoveDelay >= Date.now()) {
        modifyAccountFlow(server.id, account.id, expireTime + account.autoRemoveDelay);
      } else if (account.active && !account.autoRemove) {
        modifyAccountFlow(server.id, account.id, Date.now() + randomInt(7 * 24 * 3600 * 1000));
      }
      return true;
    } else {
      modifyAccountFlow(server.id, account.id, nextCheckTime);
      return false;
    }
  } else {
    modifyAccountFlow(server.id, account.id, Date.now() + 24 * 3600 * 1000);
    return false;
  }
};

const isBaned = async (server, account) => {
  const accountFlowInfo = await knex('account_flow').where({
    serverId: server.id,
    accountId: account.id,
    status: 'ban',
  }).then(s => s[0]);
  if (!accountFlowInfo) { return false; }
  if (!accountFlowInfo.autobanTime || Date.now() > accountFlowInfo.autobanTime) {
    await knex('account_flow').update({ status: 'checked' }).where({ id: accountFlowInfo.id });
    return false;
  }
  await knex('account_flow').update({ nextCheckTime: accountFlowInfo.autobanTime }).where({ id: accountFlowInfo.id });
  return true;
};

const isOverFlow = async (server, account) => {
  let realFlow = 0;
  const writeFlow = async (serverId, accountId, flow) => {
    const exists = await knex('account_flow').where({ serverId, accountId }).then(s => s[0]);
    if (exists) {
      await knex('account_flow').update({
        flow,
        checkTime: Date.now(),
        checkFlowTime: Date.now(),
      }).where({ id: exists.id });
    }
  };
  const writeFlowForOtherServer = async (serverId, accountId) => {
    await knex('account_flow').update({
      checkFlowTime: Date.now(),
    }).where({
      accountId
    })
      .whereNotIn('serverId', [serverId])
      .where('flow', '>', 0);
  };
  const checkFlowForOtherServer = async (serverId, accountId) => {
    await knex('account_flow').update({
      nextCheckTime: Date.now(),
    }).where({ accountId })
      .whereNotIn('serverId', [serverId])
      .where('checkTime', '<', Date.now() - 10 * 60 * 1000);
  };
  if (account.type >= 2 && account.type <= 5) {
    let timePeriod = 0;
    if (account.type === 2) { timePeriod = 7 * 86400 * 1000; }
    if (account.type === 3) { timePeriod = 30 * 86400 * 1000; }
    if (account.type === 4) { timePeriod = 1 * 86400 * 1000; }
    if (account.type === 5) { timePeriod = 3600 * 1000; }
    const data = JSON.parse(account.data);
    let startTime = data.create;
    while (startTime + timePeriod <= Date.now()) {
      startTime += timePeriod;
    }
    const endTime = Date.now();

    const isMultiServerFlow = !!account.multiServerFlow;

    let servers = [];
    if (isMultiServerFlow) {
      servers = await knex('server').where({});
    } else {
      servers = await knex('server').where({ id: server.id });
    }

    const flows = await flow.getFlowFromSplitTimeWithScale(servers.map(m => m.id), account.id, startTime, endTime);

    const serverObj = {};
    servers.forEach(server => {
      serverObj[server.id] = server;
    });
    flows.forEach(flo => {
      flo.forEach(f => {
        if (serverObj[f.id]) {
          if (!serverObj[f.id].flow) {
            serverObj[f.id].flow = f.sumFlow;
          } else {
            serverObj[f.id].flow += f.sumFlow;
          }
        }
      });
    });
    let sumFlow = 0;
    for (const s in serverObj) {
      const flow = serverObj[s].flow || 0;
      if (+s === server.id) { realFlow = flow; }
      sumFlow += Math.ceil(flow * serverObj[s].scale);
    }

    const flowPacks = await knex('webgui_flow_pack').where({ accountId: account.id }).whereBetween('createTime', [startTime, endTime]);
    const flowWithFlowPacks = flowPacks.reduce((a, b) => {
      return { flow: a.flow + b.flow };
    }, { flow: data.flow }).flow;
    await writeFlow(server.id, account.id, realFlow);
    if (account.multiServerFlow && sumFlow < flowWithFlowPacks) {
      await writeFlowForOtherServer(server.id, account.id);
    }
    if (account.multiServerFlow && sumFlow >= flowWithFlowPacks) {
      await checkFlowForOtherServer(server.id, account.id);
    }
    return sumFlow >= flowWithFlowPacks;
  } else {
    await writeFlow(server.id, account.id, 0);
    return false;
  }
};

const deletePort = (server, account) => {
  const portNumber = server.shift + account.port;
  manager.send({
    command: 'del',
    port: portNumber,
  }, {
      host: server.host,
      port: server.port,
      password: server.password,
    }).then(c => {
      let index = portList[server.id].ports.indexOf(c.port);
      if (index > -1) {
        portList[server.id].ports.splice(index, 1)
      }
    }).catch();
};
//设置SSR为不可用
const deletePortSSR = async (server, account) => {
  //await knex('ssr_user').update('enable', 0).where({ serverId: server.id, accountId: account.id });
  await knex('ssr_user').delete().where({ serverId: server.id, accountId: account.id });
};
const runCommand = async cmd => {
  const exec = require('child_process').exec;
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        return reject(stderr);
      } else {
        return resolve(stdout);
      }
    });
  });
};
const generateAccountKey = async account => {
  const privateKey = await runCommand('wg genkey');
  const publicKey = await runCommand(`echo '${privateKey.trim()}' | wg pubkey`);
  await knex('account_plugin').update({
    key: publicKey.trim() + ':' + privateKey.trim(),
  }).where({ id: account.id });
  return publicKey.trim();
};
const addPort = async (server, account) => {
  // console.log(`add ${ server.name } ${ account.port }`);
  if (server.type === 'WireGuard') {
    let publicKey = account.key;
    if (!publicKey) {
      publicKey = await generateAccountKey(account);
    }
    if (publicKey.includes(':')) {
      publicKey = publicKey.split(':')[0];
    }
    const portNumber = server.shift + account.port;
    await manager.send({
      command: 'add',
      port: portNumber,
      password: publicKey,
    }, {
        host: server.host,
        port: server.port,
        password: server.password,
      }).then(c => {
        let index = portList[server.id].ports.indexOf(c.port);
        if (index == -1) {
          portList[server.id].ports.push(c.port);
        }
      }).catch();

  } else {
    const portNumber = server.shift + account.port;
    await manager.send({
      command: 'add',
      port: portNumber,
      password: account.password,
    }, {
        host: server.host,
        port: server.port,
        password: server.password,
      }).then(c => {
        let index = portList[server.id].ports.indexOf(c.port);
        if (index == -1) {
          portList[server.id].ports.push(c.port);
        }
      }).catch();
  }
};
const addPortSSR = async (server, account) => {
  const ssr = await knex('ssr_user').where({ serverId: server.id, accountId: account.id }).then(s => s[0]);
  //如果已存在，设置为可用
  if (ssr) {
    await knex('ssr_user').update('enable', 1).where({ serverId: server.id, accountId: account.id });
  } else {
    await knex('ssr_user').insert({
      passwd: account.password,
      t: 0,
      u: 0,
      d: 0,
      transfer_enable: 1000 * 1000 * 1000 * 500,//500G
      accountId: account.id,
      serverId: server.id,
      port: server.shift + account.port,
      switch: 1,
      enable: 1,
      method: account.method,
      protocol: account.protocol,
      protocol_param: account.protocol_param,
      obfs: account.obfs,
      obfs_param: account.obfs_param
    });
  }
};
const deleteExtraPorts = async serverInfo => {
  try {
    const currentPorts = await manager.send({ command: 'portlist' }, {
      host: serverInfo.host,
      port: serverInfo.port,
      password: serverInfo.password,
    });
    const accounts = await knex('account_plugin').where({});
    const accountObj = {};
    accounts.forEach(account => {
      accountObj[account.port] = account;
    });
    for (const p of currentPorts) {
      if (accountObj[p - serverInfo.shift]) { continue; }
      await sleep(sleepTime);
      deletePort(serverInfo, { port: p - serverInfo.shift });
    }
  } catch (err) {
    logger.error(err);
  }
};

const checkAccount = async (serverId, accountId) => {
  try {
    const serverInfo = await knex('server').where({ id: serverId }).then(s => s[0]);
    if (!serverInfo) {
      await knex('account_flow').delete().where({ serverId });
      return;
    }
    const accountInfo = await knex('account_plugin').where({ id: accountId }).then(s => s[0]);
    if (!accountInfo) {
      await knex('account_flow').delete().where({ serverId: serverInfo.id, accountId });
      return;
    }

    // 检查当前端口是否存在
    const exists = await isPortExists(serverInfo, accountInfo);
    // 是否配置了SSR
    let ssr_exists = await knex('ssr_user').where({ serverId: serverInfo.id, accountId: accountInfo.id, enable: 1 }).then(s => s[0]);
    if (accountInfo.connType == 'SSR' && exists) {
      deletePort(serverInfo, accountInfo);
    }
    if (ssr_exists && ssr_exists.port != (serverInfo.shift + accountInfo.port)) {
      deletePortSSR(serverInfo, accountInfo);
      ssr_exists = null;
    }
    if (accountInfo.connType != 'SSR' && ssr_exists) {
      deletePortSSR(serverInfo, accountInfo);
    }
    // 检查账号是否激活
    if (!isAccountActive(serverInfo, accountInfo)) {
      exists && deletePort(serverInfo, accountInfo);
      ssr_exists && deletePortSSR(serverInfo, accountInfo);
      return;
    }

    // 检查账号是否包含该服务器
    if (!hasServer(serverInfo, accountInfo)) {
      // await modifyAccountFlow(serverInfo.id, accountInfo.id, 20 * 60 * 1000 + randomInt(30000));
      exists && deletePort(serverInfo, accountInfo);
      ssr_exists && deletePortSSR(serverInfo, accountInfo);
      return;
    }

    // 检查账号是否过期
    if (isExpired(serverInfo, accountInfo)) {
      exists && deletePort(serverInfo, accountInfo);
      ssr_exists && deletePortSSR(serverInfo, accountInfo);
      return;
    }

    // 检查账号是否被ban
    if (await isBaned(serverInfo, accountInfo)) {
      exists && deletePort(serverInfo, accountInfo);
      ssr_exists && deletePortSSR(serverInfo, accountInfo);
      return;
    }

    // 检查账号是否超流量
    if (await isOverFlow(serverInfo, accountInfo)) {
      exists && deletePort(serverInfo, accountInfo);
      ssr_exists && deletePortSSR(serverInfo, accountInfo);
      return;
    }
    if (accountInfo.connType == "SSR") {
      !ssr_exists && addPortSSR(serverInfo, accountInfo);
    } else {
      !exists && addPort(serverInfo, accountInfo);
    }

  } catch (err) {
    //if (err.toString().toLowerCase().indexOf('timeout') > -1) {
    let count = error_count[serverId] || 0;
    error_count[serverId] = count + 1;
    //掉线提醒
    if (error_count[serverId] == 5) {
      isTelegram && telegram.push(`[${serverInfo.name}]似乎掉线了，快来看看吧！`);
    }
    console.log('line-271', `count-${error_count[serverId]}`, serverId, accountId);
    logger.error(err);
    //}
  }
};

let time = 120;
cron.loop(
  async () => {
    const start = Date.now();
    try {
      await sleep(sleepTime);
      const servers = await knex('server').where({});
      const totalAccounts = await knex('account_plugin').select(['id']);
      for (const server of servers) {
        await sleep(1000);
        await deleteExtraPorts(server);
      }
      await sleep(sleepTime);
      // if (servers.length * totalAccounts.length > 1000) {
      //   const ids = await knex('account_flow')
      //     .select(['id'])
      //     .orderBy('id', 'ASC')
      //     .limit(Math.ceil(servers.length * totalAccounts.length / 1000));
      //   await knex('account_flow').delete()
      //     .whereIn('id', ids.map(m => m.id));
      // }

      const accounts = await knex('account_plugin').select([
        'account_plugin.id as id',
      ])
        .count('account_flow.serverId as count')
        .leftOuterJoin('account_flow', 'account_flow.accountId', 'account_plugin.id')
        .groupBy('account_plugin.id')
        .having('count', '<', servers.length);

      for (const account of accounts) {
        await sleep(sleepTime);
        await accountFlow.add(account.id);
      }
      //删除不存在的账号的残留端口
      await knex('account_flow')
        .whereNotIn('accountId', knex('account_plugin').select(['id']))
        .orWhereNotIn('serverId', knex('server').select(['id']))
        .del();

      await knex('ssr_user')
        .whereNotIn('accountId', knex('account_plugin').select(['id']))
        .orWhereNotIn('serverId', knex('server').select(['id']))
        .del();

      const end = Date.now();
      if (end - start <= time * 1000) {
        await sleep(time * 1000 - (end - start));
      }
      if (time <= 600) { time += 10; }
    } catch (err) {
      logger.error(err);
      const end = Date.now();
      if (end - start <= time * 1000) {
        await sleep(time * 1000 - (end - start));
      }
    }
  },
  'AccountCheckerDeleteExtraPorts',
  360,
);

// cron.minute(async () => {
//   await knex('account_flow').delete()
//     .where('nextCheckTime', '<', Date.now() - 3 * 60 * 60 * 1000)
//     .where('nextCheckTime', '>', 10000)
// }, 'DeleteInvalidAccountFlow', 30);

cron.minute(() => {
  logger.info('重置错误次数');
  error_count = [];
}, 'reset_error', 10);

(async () => {
  const serverNumber = await knex('server').select(['id']).then(s => s.length);
  const accountNumber = await knex('account_plugin').select(['id']).then(s => s.length);

  if (serverNumber * accountNumber > 300) {
    while (true) {
      try {
        //不检查的服务器
        let server_not = [];
        error_count.map((v, i) => {
          if (v > 5) server_not.push(i);
        })
        //第一个
        const accountLeft = await redis.lpop('CheckAccount:Queue');
        //最后一个
        const accountRight = await redis.rpop('CheckAccount:Queue');
        //总数
        const queueLength = await redis.llen('CheckAccount:Queue');
        if (!accountLeft || queueLength < 1) {
          const mark = await redis.setnx('CheckAccount:Mark', 1);
          if (mark) {
            redis.expire('CheckAccount:Mark', 5);
            let accounts = [];
            //优先检查新账号数
            try {
              const datas = await knex('account_flow').select()
                .whereNull('checkTime')
                .whereNotIn('serverId', server_not);
              accounts = [...accounts, ...datas];
            } catch (err) {
              console.log('line-487', err);
            }
            try {
              const datas = await knex('account_flow').select()
                .whereNotNull('checkTime')
                .where('nextCheckTime', '<', Date.now())
                .whereNotIn('serverId', server_not)
                .orderBy('nextCheckTime', 'asc')
                .limit(200)
                .offset(0);
              accounts = [...accounts, ...datas];
            } catch (err) {
              logger.error(err);
            }
            try {
              const datas = await knex('account_flow').select()
                .where('updateTime', '>', Date.now() - 8 * 60 * 1000)
                .where('checkFlowTime', '<', Date.now() - 10 * 60 * 1000)
                .whereNotIn('id', accounts.map(account => account.id))
                .whereNotIn('serverId', server_not)
                .orderBy('updateTime', 'desc')
                .limit(50)
                .offset(0);
              accounts = [...accounts, ...datas];
            } catch (err) { logger.error(err); }
            try {
              datas = await knex('account_flow').select()
                .whereNotIn('id', accounts.map(account => account.id))
                .whereNotIn('serverId', server_not)
                .orderByRaw('rand()').limit(accounts.length < 30 ? 35 - accounts.length : 5);
              accounts = [...accounts, ...datas];
            } catch (err) { }
            try {
              datas = await knex('account_flow').select()
                .whereNotIn('id', accounts.map(account => account.id))
                .whereNotIn('serverId', server_not)
                .orderByRaw('random()').limit(accounts.length < 30 ? 35 - accounts.length : 5);
              accounts = [...accounts, ...datas];
            } catch (err) { }
            logger.info(`Add [${accounts.length}] elements to queue`);
            if (accounts.length > 0) {
              await redis.lpush('CheckAccount:Queue', accounts.map(m => `${m.serverId}:${m.accountId}`));
            }
            redis.del('CheckAccount:Mark');
            console.log(`需要检查账号 ${accounts.length} 个，暂停 3 秒`);
            await sleep(3000);
          };
        }
        if (accountLeft) {
          const serverId = +accountLeft.split(':')[0];
          const accountId = +accountLeft.split(':')[1];
          error_count[serverId] = error_count[serverId] || 0;
          const start = Date.now();
          //如果请求同一个服务器10次出错，10分钟内不再请求这个服务器
          if (error_count[serverId] < 10) {
            await checkAccount(serverId, accountId).catch(err => { });
            if (Date.now() - start < (1000 / speed)) {
              await sleep(1000 / speed - (Date.now() - start));
            }
          }
        }
        if (accountRight) {
          const serverId = +accountRight.split(':')[0];
          const accountId = +accountRight.split(':')[1];
          error_count[serverId] = error_count[serverId] || 0;
          const start = Date.now();
          if (error_count[serverId] < 5) {
            await checkAccount(serverId, accountId).catch(err => { });
            if (Date.now() - start < (1000 / speed)) {
              await sleep(1000 / speed - (Date.now() - start));
            }
          }
        }
      }
      catch (err) {
        logger.error(err);
        await sleep(5000);
      }
    }
  } else {
    while (true) {

      let server_not = [];
      error_count.map((v, i) => {
        if (v > 9) server_not.push(i);
      })

      logger.info('check account');
      await sleep(randomInt(2000));
      const start = Date.now();
      let accounts = [];
      const keys = await redis.keys('CheckAccount:*');
      const ids = keys.length === 0 ? [] : (await redis.mget(keys)).map(m => JSON.parse(m)).reduce((a, b) => {
        return b ? [...a, ...b] : a;
      }, []);

      console.log('不检查服务器：', server_not);
      try {
        //优先检查新账号数
        const datas = await knex('account_flow').select()
          .whereNull('checkTime')
          .whereNotIn('serverId', server_not)
        console.log(`新账号数: ${datas.length}`);
        accounts = [...accounts, ...datas];
      } catch (err) { console.log('line-434', err); }
      try {
        const datas = await knex('account_flow').select()
          .whereNotNull('checkTime')
          .where('nextCheckTime', '<', Date.now())
          .whereNotIn('serverId', server_not)
          .whereNotIn('id', ids)
          .orderBy('nextCheckTime', 'asc')
          .limit(400)
          .offset(0);;
        console.log(`服务器端口数: ${datas.length}`);
        accounts = [...accounts, ...datas];
      } catch (err) { console.log('line-448', err); }
      try {
        const datas = await knex('account_flow').select()
          .whereNotIn('id', ids)
          .whereNotIn('id', accounts.map(account => account.id))
          .whereNotIn('serverId', server_not)
          .where('updateTime', '>', Date.now() - 8 * 60 * 1000)
          .where('checkFlowTime', '<', Date.now() - 10 * 60 * 1000)
          .orderBy('updateTime', 'desc')
          .limit(400)
          .offset(0);
        accounts = [...accounts, ...datas];
      } catch (err) { logger.error(err); }
      try {
        datas = await knex('account_flow').select()
          .whereNotIn('id', ids)
          .whereNotIn('id', accounts.map(account => account.id))
          .whereNotIn('serverId', server_not)
          .orderByRaw('rand()').limit(accounts.length < 30 ? 35 - accounts.length : 5);
        accounts = [...accounts, ...datas];
      } catch (err) { }
      try {
        datas = await knex('account_flow').select()
          .whereNotIn('id', ids)
          .whereNotIn('id', accounts.map(account => account.id))
          .orderByRaw('random()').limit(accounts.length < 30 ? 35 - accounts.length : 5);
        accounts = [...accounts, ...datas];
      } catch (err) { }

      try {
        console.log(`开始检查，数量：${accounts.length},时间：${start}`);
        if (accounts.length <= 120) {
          for (const account of accounts) {
            const start = Date.now();
            error_count[account.serverId] = error_count[account.serverId] || 0;
            if (error_count[account.serverId] < 10)
              await checkAccount(account.serverId, account.accountId).catch(err => { });;
            const time = 60 * 1000 / accounts.length - (Date.now() - start);
            await sleep((time <= 0 || time > sleepTime) ? sleepTime : time);
          }
        } else {
          await Promise.all(accounts.map((account, index) => {
            return sleep(index * (60 + Math.ceil(accounts.length % 10)) * 1000 / accounts.length).then(() => {
              //如果请求同一个服务器5次出错，5分钟内不再请求这个服务器，虽然不是同步的
              error_count[account.serverId] = error_count[account.serverId] || 0;
              if (error_count[account.serverId] < 10) {
                return checkAccount(account.serverId, account.accountId).catch(err => { });;
              }
            });
          }));
        }
        if (accounts.length) {
          await redis.set(`CheckAccount:${process.uptime()}:${cluster.worker.id}`, JSON.stringify(accounts.map(account => account.id)), 'EX', 45);
          logger.info(`check ${accounts.length} accounts, ${Date.now() - start} ms, begin at ${start}`);
          if (accounts.length < 30) {
            await sleep((30 - accounts.length) * 1000);
          }
        } else {
          logger.info('no need to check');
          await sleep(30 * 1000);
        }
      } catch (err) {
        console.log('出错了，哈哈', err);
        const end = Date.now();
        if (end - start <= 60 * 1000) {
          await sleep(60 * 1000 - (end - start));
        }
      }
    }
  }
})();

const expireDate = (account) => {
  if (account.type > 1 && account.type < 6) {
    let timePeriod = 0;
    if (account.type === 2) { timePeriod = 7 * 86400 * 1000; }
    if (account.type === 3) { timePeriod = 30 * 86400 * 1000; }
    if (account.type === 4) { timePeriod = 1 * 86400 * 1000; }
    if (account.type === 5) { timePeriod = 3600 * 1000; }
    const data = JSON.parse(account.data);
    const expireTime = data.create + data.limit * timePeriod;
    const begin = Date.now() + 24 * 60 * 60 * 1000;//后一天
    const end = Date.now() + 2 * 24 * 60 * 60 * 1000;//后两天
    if (expireTime > begin && expireTime <= end) {
      return expireTime;
    }
  }
  return -1;
}

//账号过期邮件提醒
const remind = async () => {
  try {
    //取得网站信息
    const baseSetting = await knex('webguiSetting').where({
      key: 'base'
    }).then(s => s[0]).then(s => JSON.parse(s.value));
    let count = 0;
    let accounts = await knex('account_plugin').select();
    for (let account of accounts) {
      let length = await knex('account_plugin').select()
        .where({ 'userId': account.userId }).length;
      if (length != 1) {
        continue
      }
      //检查过期时间 提前一天提醒
      let expireTime = expireDate(account);
      if (expireTime < 0) continue;
      let user = await knex('user').select()
        .where({ 'id': account.userId });
      if (user && user.length > 0) {
        user = user[0];
      } else {
        continue;
      }
      await sleep(500);
      emailPlugin.sendMail(user.email, '账号过期提醒', `您的账号即将于 ${moment(expireTime).format("YYYY-MM-DD HH:mm:ss")} 过期，请及时续费，以免影响使用。地址：${config.plugins.webgui.site} (${baseSetting.title})`);
      count++;
    }

    isTelegram && telegram.push(`已通过邮件提醒 ${count} 人账号即将到期`);
    logger.info(`账号到期邮件提醒 ${count} 人`)
  } catch (err) {
    isTelegram && telegram.push(`邮件提醒出错(${count})[${config.plugins.webgui.site}]`);
    logger.info('邮件提醒出错', err)
  }
}
cron.cron(() => {
  logger.info('每天10点执行');
  remind();
}, 'Remind', '2 10 * * *', 23 * 3600);
