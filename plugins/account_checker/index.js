const log4js = require('log4js');
const logger = log4js.getLogger('account');
const knex = appRequire('init/knex').knex;
const flow = appRequire('plugins/flowSaver/flow');
const manager = appRequire('services/manager');
const config = appRequire('services/config').all();
const sleepTime = 150;
const accountFlow = appRequire('plugins/account/accountFlow');
const cron = appRequire('init/cron');
const emailPlugin = appRequire('plugins/email/index');
const moment = require('moment');

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
var del_list = [];
//批量删除
const delPortList = (server, account, list) => {
  const portNumber = server.shift + account.port;
  var data = {
    command: 'del',
    port: portNumber
  };
  list[server.id] = list[server.id] || [];
  list[server.id].push(data);
};
//批量添加
const addPortList = (server, account, list) => {
  const portNumber = server.shift + account.port;
  var data = {
    command: 'add',
    port: portNumber,
    password: account.password,
  };
  list[server.id] = list[server.id] || [];
  list[server.id].push(data);
};
//批量发送数据
const sendOptions = async (list) => {
  console.log('开始批量发送数据,' + list.length);
  for (let i = 0; i < list.length; i++) {
    let option = list[i];
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

const checkAccount = async (serverInfo, serverId, accountInfo, accountId) => {
  try {
    if (!serverInfo) {
      await knex('account_flow').delete().where({ serverId });
      return;
    }
    if (!accountInfo) {
      await knex('account_flow').delete().where({ serverId: serverInfo.id, accountId });
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
    //if (err.toString().toLowerCase().indexOf('timeout') > -1) {
    let count = error_count[serverId] || 0;
    error_count[serverId] = count + 1;
    //掉线提醒
    if (error_count[serverId] == 5) {
      isTelegram && telegram.push(`[${serverInfo.name}]似乎掉线了，快来看看吧！`);
    }
    console.log('line-271', `count-${error_count[serverId]}`, serverId, accountId);
    //}
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
        await sleep(1000);
        await deleteExtraPorts(server);
      }
      //await sendOptions(del_list);
      await sleep(sleepTime);
      console.log('开始：', new Date())
      const data_account_flow = await knex('account_flow').select();
      const data_account_plugin = await knex('account_plugin').select();
      console.log('数量1', data_account_flow.length, data_account_plugin.length);
      var acc_ser = [];
      for (let i = 0; i < data_account_plugin.length; i++) {
        let item = data_account_plugin[i];
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
        if (index != -1)
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

      console.log('数量4', ids.length, ids.length > 0 ? ids[0] : 0);
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
}, 10);

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

    var account_plugin = [];
    await knex('account_plugin').then(res => {
      res.forEach((item, index) => {
        account_plugin[item.id] = item;
      })
    });

    logger.info('check account');
    const start = Date.now();
    let accounts = [];
    let server_not = [];
    error_count.map((v, i) => {
      if (v > 4) server_not.push(i);
    })

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
        .orderBy('nextCheckTime', 'asc').limit(600);
      console.log(`服务器端口数: ${datas.length}`);
      accounts = [...accounts, ...datas];
      if (datas.length < 30) {
        accounts = [...accounts, ...(await knex('account_flow').select()
          .where('nextCheckTime', '>', Date.now())
          .orderBy('nextCheckTime', 'asc').limit(30 - datas.length))];
      }
    } catch (err) { console.log('line-448', err); }
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
          error_count[account.serverId] = error_count[account.serverId] || 0;
          if (error_count[account.serverId] < 5)
            await checkAccount(servers[account.serverId], account.serverId, account_plugin[account.accountId], account.accountId).catch();;
          const time = 60 * 1000 / accounts.length - (Date.now() - start);
          await sleep((time <= 0 || time > sleepTime) ? sleepTime : time);
        }
      } else {
        await Promise.all(accounts.map((account, index) => {
          return sleep(index * (60 + Math.ceil(accounts.length % 10)) * 1000 / accounts.length).then(() => {
            //如果请求同一个服务器5次出错，5分钟内不再请求这个服务器，虽然不是同步的
            error_count[account.serverId] = error_count[account.serverId] || 0;
            if (error_count[account.serverId] < 5) {
              return checkAccount(servers[account.serverId], account.serverId, account_plugin[account.accountId], account.accountId).catch();;
            }
          });
        }));
      }
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

const expireDate = (account) => {
  if (account.type >= 2 && account.type <= 5) {
    let timePeriod = 0;
    if (account.type === 2) { timePeriod = 7 * 86400 * 1000; }
    if (account.type === 3) { timePeriod = 30 * 86400 * 1000; }
    if (account.type === 4) { timePeriod = 1 * 86400 * 1000; }
    if (account.type === 5) { timePeriod = 3600 * 1000; }
    const data = JSON.parse(account.data);
    const expireTime = data.create + data.limit * timePeriod;
    const begin = Date.now() + 24 * 60 * 60 * 1000;//后一天
    const end = Date.now() + 2 * 24 * 60 * 60 * 1000;//后两天
    if (expireTime > begin && expireDate <= end) {
      return expireTime;
    }
  }
  return -1;
}

//账号过期邮件提醒
const remind = async () => {
  logger.info('开始检查账号过期');
  try {
    const users = await knex('user').select()
      .where({ 'type': 'normal' });
    let count = 0;
    for (const user of users) {
      let account = await knex('account_plugin').select()
        .where({ 'userId': user.id });
      //不提醒多账号的用户
      if (account.length != 1) {
        return;
      } else {
        account = account[0];
      }
      //检查过期时间 提前一天提醒
      let expireTime = expireDate(account);
      if (expireTime < 0) return;
      //取得网站信息
      const baseSetting = await knex('webguiSetting').where({
        key: 'base'
      }).then(s => s[0]).then(s => JSON.parse(s.value));
      await emailPlugin.sendMail(user.email, '账号过期提醒', `您的账号即将于 ${moment(expireTime).format("YYYY-MM-DD HH:mm:ss")} 过期，请及时续费，以免影响使用。(${baseSetting.title})`);
      count++;
    }
    logger.info(`账号邮件到期提醒 ${count} 人`)
  } catch (err) {
    logger.info('邮件提醒出错', err)
  }
}
cron.cron(() => {
  remind();
}, '30 11 * * *');