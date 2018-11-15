const log4js = require('log4js');
const logger = log4js.getLogger('account');
const knex = appRequire('init/knex').knex;
const flow = appRequire('plugins/flowSaver/flow');
const manager = appRequire('services/manager');
const config = appRequire('services/config').all();
const sleepTime = 150;
const accountFlow = appRequire('plugins/account/accountFlow');
const cron = appRequire('init/cron');
//记录错误次数
var error_count = [];
const isTelegram = config.plugins.webgui_telegram && config.plugins.webgui_telegram.use;
let telegram;
if (isTelegram) {
  telegram = appRequire('plugins/webgui_telegram/admin');
}

const sleep = time => {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(), time);
  });
};

const randomInt = max => {
  return Math.ceil(Math.random() * max % max);
};

const modifyAccountFlow = async (serverId, accountId, time) => {
  await knex('account_flow').update({
    checkTime: Date.now(),
    nextCheckTime: Date.now() + time,
  }).where({ serverId, accountId });
};

const isPortExists = async (server, account) => {
  const ports = (await manager.send({ command: 'list' }, {
    host: server.host,
    port: server.port,
    password: server.password,
  })).map(m => m.port);
  if (ports.indexOf(server.shift + account.port) >= 0) {
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
    if (expireTime <= Date.now() || data.create >= Date.now()) {
      const nextCheckTime = 20 * 60 * 1000 + randomInt(30000);
      if (account.active && account.autoRemove && expireTime + account.autoRemoveDelay < Date.now()) {
        modifyAccountFlow(server.id, account.id, nextCheckTime > account.autoRemoveDelay ? account.autoRemoveDelay : nextCheckTime);
        knex('account_plugin').delete().where({ id: account.id }).then();
      } else {
        modifyAccountFlow(server.id, account.id, nextCheckTime);
      }
      return true;
    } else {
      return false;
    }
  } else {
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
  const writeFlow = async (serverId, accountId, flow, time) => {
    const exists = await knex('account_flow').where({ serverId, accountId }).then(s => s[0]);
    if (exists) {
      await knex('account_flow').update({
        flow,
        checkTime: Date.now(),
        nextCheckTime: Date.now() + Math.ceil(time),
      }).where({ id: exists.id });
    }
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

    let nextCheckTime = (flowWithFlowPacks - sumFlow) / 200000000 * 60 * 1000 / server.scale;
    if (nextCheckTime >= account.expireTime - Date.now() && account.expireTime - Date.now() > 0) { nextCheckTime = account.expireTime - Date.now(); }
    if (nextCheckTime <= 0) { nextCheckTime = 600 * 1000; }
    if (nextCheckTime >= 3 * 60 * 60 * 1000) { nextCheckTime = 3 * 60 * 60 * 1000; }
    await writeFlow(server.id, account.id, realFlow, nextCheckTime);

    return sumFlow >= flowWithFlowPacks;
  } else {
    await writeFlow(server.id, account.id, 0, 30 * 60 * 1000 + Number(Math.random().toString().substr(2, 7)));
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
    }).catch();
};
const addPort = (server, account) => {
  const portNumber = server.shift + account.port;
  manager.send({
    command: 'add',
    port: portNumber,
    password: account.password,
  }, {
      host: server.host,
      port: server.port,
      password: server.password
    }).catch();
};
var option_list = [];
var ser_list = [];
//批量删除
const delPortList = (server, account) => {
  const portNumber = server.shift + account.port;
  var data = {
    command: 'del',
    userport: portNumber
  };
  option_list[server.id] = option_list[server.id] || [];
  option_list[server.id].push(data);
};
//批量添加
const addPortList = (server, account) => {
  const portNumber = server.shift + account.port;
  var data = {
    command: 'add',
    userport: portNumber,
    userpwd: account.password,
  };
  option_list[server.id] = option_list[server.id] || [];
  option_list[server.id].push(data);
};
//批量发送数据
const sendOptions = async () => {
  console.log('开始批量发送数据');
  for (let i = 0; i < option_list.length; i++) {
    let option = option_list[i];
    if (option) {
      await sleep(200);
      manager.send({
        command: 'batch_options',
        list: option
      }, ser_list[i]).catch();
    }
  }

}
const deleteExtraPorts = async serverInfo => {
  try {
    const currentPorts = await manager.send({ command: 'list' }, {
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
      if (accountObj[p.port - serverInfo.shift]) { continue; }
      await sleep(sleepTime);
      deletePort(serverInfo, { port: p.port - serverInfo.shift });
    }
  } catch (err) {
    console.log(err);
  }
};

const checkAccount = async (servers, serverId, accountId) => {

  try {
    //const serverInfo = await knex('server').where({ id: serverId }).then(s => s[0]);
    const serverInfo = servers[serverId];
    if (!serverInfo) {
      await knex('account_flow').delete().where({ serverId });
      return;
    }
    const accountInfo = await knex('account_plugin').where({ id: accountId }).then(s => s[0]);
    if (!accountInfo) {
      await knex('account_flow').delete().where({ serverId, accountId });
      return;
    }

    // 检查当前端口是否存在
    const exists = await isPortExists(serverInfo, accountInfo);

    // 检查账号是否激活
    if (!isAccountActive(serverInfo, accountInfo)) {
      exists && deletePort(serverInfo, accountInfo);
      return;
    }

    // 检查账号是否包含该服务器
    if (!hasServer(serverInfo, accountInfo)) {
      await modifyAccountFlow(serverInfo.id, accountInfo.id, 30 * 60 * 1000 + randomInt(300000));
      exists && deletePort(serverInfo, accountInfo);
      return;
    }

    // 检查账号是否过期
    if (isExpired(serverInfo, accountInfo)) {
      exists && deletePort(serverInfo, accountInfo);
      return;
    }

    // 检查账号是否被ban
    if (await isBaned(serverInfo, accountInfo)) {
      exists && deletePort(serverInfo, accountInfo);
      return;
    }

    // 检查账号是否超流量
    if (await isOverFlow(serverInfo, accountInfo)) {
      exists && deletePort(serverInfo, accountInfo);
      return;
    }

    !exists && addPort(serverInfo, accountInfo);
  } catch (err) {
    let count = error_count[serverId] || 0;
    error_count[serverId] = count + 1;
    //掉线提醒
    if (error_count[serverId] == 3) {
      let ser = servers[serverId];
      isTelegram && telegram.push(`[${ser.name}]似乎掉线了，快来看看吧！`);
    }
    console.log('line-271', `count-${error_count[serverId]}`, serverId, accountId, err);
  }
};

(async () => {
  let time = 67;
  while (true) {
    const start = Date.now();
    try {
      await sleep(sleepTime);
      const servers = await knex('server').where({});
      for (const server of servers) {
        await sleep(500);
        await deleteExtraPorts(server);
      }
      await sleep(sleepTime);
      // const accounts = await knex('account_plugin').select([
      //   'account_plugin.id as id'
      // ]).crossJoin('server')
      //   .leftJoin('account_flow', function () {
      //     this
      //       .on('account_flow.serverId', 'server.id')
      //       .on('account_flow.accountId', 'account_plugin.id');
      //   }).whereNull('account_flow.id');
      console.log('开始：', new Date())
      const data_account_flow = await knex('account_flow').select();
      const data_aacount_plugin = await knex('account_plugin').select();
      console.log('数量1', data_account_flow.length, data_aacount_plugin.length);
      var acc_ser = [];
      for (let i = 0; i < data_aacount_plugin.length; i++) {
        let item = data_aacount_plugin[i];
        let server = [];
        if (item.server) {
          server = JSON.parse(item.server).map(s => {
            return `${item.id},${s}`;
          })
        }
        acc_ser = acc_ser.concat(server)
      }
      console.log('数量2', acc_ser.length);
      for (let i = 0; i < data_account_flow.length; i++) {
        let item = data_account_flow[i];
        let index = acc_ser.indexOf(`${item.accountId},${item.serverId}`)
        acc_ser.splice(index, 1)
      }
      console.log('数量3', acc_ser.length);
      let ids = [];
      for (let i = 0; i < acc_ser.length; i++) {
        let id = acc_ser[i].split(',')[0]
        if (ids.indexOf(id) < 0) {
          ids.push(id);
        }
      }
      console.log('数量4', ids.length);
      for (let id of ids) {
        await sleep(sleepTime);
        await accountFlow.add(id);
      }
      console.log('结束：', new Date())
      // for (let account of accounts) {
      //   await sleep(sleepTime);
      //   await accountFlow.add(account.id);
      // }
      const end = Date.now();
      if (end - start <= time * 1000) {
        await sleep(time * 1000 - (end - start));
      }
      if (time <= 300) { time += 10; }
    } catch (err) {
      console.log(err);
      const end = Date.now();
      if (end - start <= time * 1000) {
        await sleep(time * 1000 - (end - start));
      }
    }
  }
})();

cron.minute(() => {
  logger.info('重置错误次数');
  error_count = [];
}, 15);

(async () => {
  while (true) {
    var servers = [];
    await knex('server').then(res => {
      res.map(s => {
        servers[s.id] = s;
        ser_list[s.id] = {
          host: s.host,
          port: s.port,
          password: s.password
        };
      })
    });

    logger.info('check account');
    const start = Date.now();
    let accounts = [];
    let server_not = [];
    error_count.map((v, i) => {
      if (v > 2) server_not.push(i);
    })

    try {
      console.log('不检查服务器：', server_not);
      const datas = await knex('account_flow').select()
        .where('nextCheckTime', '<', Date.now())
        .whereNotIn('serverId', server_not)
        .orderBy('nextCheckTime', 'asc').limit(600);
      console.log(`服务器端口数: ${datas.length}`);
      accounts = [...accounts, ...datas];
      if (datas.length < 30) {
        accounts = [...accounts, ...(await knex('account_flow').select()
          .where('nextCheckTime', '>', Date.now())
          .orderBy('nextCheckTime', 'asc').limit(30 - datas.length))];
      }
    } catch (err) { console.log('line-376', err); }
    try {
      const datas = await knex('account_flow').select()
        .orderBy('updateTime', 'desc').where('checkTime', '<', Date.now() - 60000).limit(15);
      accounts = [...accounts, ...datas];
    } catch (err) { console.log(err); }
    try {
      datas = await knex('account_flow').select()
        .orderByRaw('rand()').limit(5);
      accounts = [...accounts, ...datas];
    } catch (err) { }
    try {
      datas = await knex('account_flow').select()
        .orderByRaw('random()').limit(5);
      accounts = [...accounts, ...datas];
    } catch (err) { }

    try {
      console.log(`开始检查，数量：${accounts.length},时间：${start}`);
      if (accounts.length <= 120) {
        for (const account of accounts) {
          const start = Date.now();
          //console.log('checkAccount1',accounts.length, error_count[account.serverId])
          error_count[account.serverId] = error_count[account.serverId] || 0;
          if (error_count[account.serverId] < 3)
            await checkAccount(servers, account.serverId, account.accountId);
          const time = 60 * 1000 / accounts.length - (Date.now() - start);
          await sleep((time <= 0 || time > sleepTime) ? sleepTime : time);
        }
      } else {
        await Promise.all(accounts.map((account, index) => {
          return sleep(index * (60 + Math.ceil(accounts.length % 10)) * 1000 / accounts.length).then(() => {
            //如果请求同一个服务器三次出错，15分钟内不再请求这个服务器，虽然不是同步的
            error_count[account.serverId] = error_count[account.serverId] || 0;
            //console.log('checkAccount2', accounts.length, error_count[account.serverId], `server-${account.serverId}`)
            if (error_count[account.serverId] < 3) {
              return checkAccount(servers, account.serverId, account.accountId);
            }
          });
        }));
      }
      //await sendOptions();
      if (accounts.length) {
        logger.info(`check ${accounts.length} accounts, ${Date.now() - start} ms, begin at ${start}`);
        if (accounts.length < 30) {
          await sleep((30 - accounts.length) * 1000);
        }
      } else {
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
})();
