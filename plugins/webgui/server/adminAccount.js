const macAccount = appRequire('plugins/macAccount/index');
const account = appRequire('plugins/account/index');
const flow = appRequire('plugins/flowSaver/flow');
const flowPack = appRequire('plugins/webgui_order/flowPack');
const dns = require('dns');
const net = require('net');
const knex = appRequire('init/knex').knex;
const moment = require('moment');

const formatMacAddress = mac => mac.replace(/-/g, '').replace(/:/g, '').toLowerCase();

exports.getMacAccount = (req, res) => {
  const userId = +req.query.userId;
  macAccount.getAccount(userId, -1).then(success => {
    res.send(success);
  }).catch(err => {
    console.log(err);
    res.status(403).end();
  });
};

exports.addMacAccount = (req, res) => {
  const mac = formatMacAddress(req.params.macAddress);
  const userId = req.body.userId;
  const accountId = req.body.accountId;
  const serverId = req.body.serverId;
  macAccount.newAccount(mac, userId, serverId, accountId).then(success => {
    res.send('success');
  }).catch(err => {
    console.log(err);
    res.status(403).end();
  });
};

exports.editMacAccount = (req, res) => {
  const id = req.body.id;
  const mac = formatMacAddress(req.body.macAddress);
  const userId = req.body.userId;
  const accountId = req.body.accountId;
  const serverId = req.body.serverId;
  macAccount.editAccount(id, mac, serverId, accountId).then(success => {
    res.send('success');
  }).catch(err => {
    console.log(err);
    res.status(403).end();
  });
};

exports.deleteMacAccount = (req, res) => {
  const accountId = +req.query.id;
  macAccount.deleteAccount(accountId).then(success => {
    res.send('success');
  }).catch(err => {
    console.log(err);
    res.status(403).end();
  });
};

exports.getMacAccountForUser = (req, res) => {
  const mac = req.params.macAddress;
  const ip = req.headers['x-real-ip'] || req.connection.remoteAddress;
  const noPassword = !!(+req.query.noPassword);
  const noFlow = !!(+req.query.noFlow);
  macAccount.getAccountForUser(mac.toLowerCase(), ip, {
    noPassword,
    noFlow,
  }).then(success => {
    res.send(success);
  }).catch(err => {
    console.log(err);
    res.status(403).end();
  });
};

exports.getNoticeForUser = (req, res) => {
  const mac = req.params.macAddress;
  const ip = req.headers['x-real-ip'] || req.connection.remoteAddress;
  macAccount
    .getNoticeForUser(mac.toLowerCase(), ip)
    .then(success => {
      res.send(success);
    }).catch(err => {
      console.log(err);
      res.status(403).end();
    });
};

exports.banAccount = (req, res) => {
  const serverId = +req.params.serverId;
  const accountId = +req.params.accountId;
  const time = +req.body.time;
  account.banAccount({
    serverId,
    accountId,
    time,
  }).then(success => {
    res.send('success');
  }).catch(err => {
    console.log(err);
    res.status(403).end();
  });
};

exports.getBanAccount = (req, res) => {
  const serverId = +req.params.serverId;
  const accountId = +req.params.accountId;
  account.getBanAccount({
    serverId,
    accountId,
  }).then(success => {
    res.send(success);
  }).catch(err => {
    console.log(err);
    res.status(403).end();
  });
};

const isMacAddress = str => {
  return str.match(/^([A-Fa-f0-9]{2}[:-]?){5}[A-Fa-f0-9]{2}$/);
};

const getAddress = (address, ip) => {
  let myAddress = address;
  if (address.indexOf(':') >= 0) {
    const hosts = address.split(':');
    const number = Math.ceil(Math.random() * (hosts.length - 1));
    myAddress = hosts[number];
  }
  if (!ip) {
    return Promise.resolve(myAddress);
  }
  if (net.isIP(myAddress)) {
    return Promise.resolve(myAddress);
  }
  return new Promise((resolve, reject) => {
    dns.lookup(myAddress, (err, myAddress, family) => {
      if (err) {
        return reject(err);
      }
      return resolve(myAddress);
    });
  });
};

const urlsafeBase64 = str => {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

exports.getSubscribeAccountForUser = async (req, res) => {
  try {
    const stype = req.query.stype;
    let type = req.query.type || 'shadowrocket';
    //为了兼容原来的 2019.03取消
    if (stype == 1) {
      type = 'ssr'
    }
    if (stype == 2) {
      type = 'ssd'
    }
    const resolveIp = req.query.ip;
    const token = req.params.token;
    const ip = req.headers['x-real-ip'] || req.connection.remoteAddress;
    let subscribeAccount;
    if (isMacAddress(token)) {
      subscribeAccount = await macAccount.getMacAccountForSubscribe(token, ip);
    } else {
      const isSubscribeOn = await knex('webguiSetting').where({
        key: 'account'
      }).then(s => s[0]).then(s => JSON.parse(s.value).subscribe);
      if (!isSubscribeOn) { return res.status(404).end(); }
      const subscribeAccount = await account.getAccountForSubscribe(token, ip);
      for (const s of subscribeAccount.server) {
        s.host = await getAddress(s.host, +resolveIp);
      }
      const baseSetting = await knex('webguiSetting').where({
        key: 'base'
      }).then(s => s[0]).then(s => JSON.parse(s.value));

      let accountInfo = subscribeAccount.account;
      if (accountInfo.type >= 2 && accountInfo.type <= 5) {
        const time = {
          '2': 7 * 24 * 3600000,
          '3': 30 * 24 * 3600000,
          '4': 24 * 3600000,
          '5': 3600000,
        };
        accountInfo.data.expire = accountInfo.data.create + accountInfo.data.limit * time[accountInfo.type];
        accountInfo.data.from = accountInfo.data.create;
        accountInfo.data.to = accountInfo.data.create + time[accountInfo.type];
        while (accountInfo.data.to <= Date.now()) {
          accountInfo.data.from = accountInfo.data.to;
          accountInfo.data.to = accountInfo.data.from + time[accountInfo.type];
        }
        //accountInfo.server = accountInfo.server ? JSON.parse(accountInfo.server) : accountInfo.server;
        accountInfo.data.flowPack = await flowPack.getFlowPack(accountInfo.id, accountInfo.data.from, accountInfo.data.to);
      }

      const flowInfo = await flow.getServerPortFlowWithScale(0, accountInfo.id, [accountInfo.data.from, accountInfo.data.to], 1);

      let result = '';
      if (type === 'ssd') {
        let obj = {
          airport: baseSetting.title,
          port: 12580,
          encryption: 'chacha20',
          password: subscribeAccount.account.password,
          traffic_used: ((flowInfo[0] || 10) / 1000000000).toFixed(2),
          traffic_total: accountInfo.type == 1 ? 10000 : ((accountInfo.data.flow + accountInfo.data.flowPack) / 1000000000).toFixed(2),
          expiry: accountInfo.type == 1 ? '2099-12-31 23:59:59' : moment(accountInfo.data.expire).format("YYYY-MM-DD HH:mm:ss")
        };
        let servers = subscribeAccount.server.map((s, index) => {
          return {
            id: index,//这是客户端排序的顺序
            server: s.host,
            port: (subscribeAccount.account.port + s.shift),
            encryption: s.method,
            ratio: s.scale,
            remarks: s.comment || '这里显示备注'
          }
        });
        obj.servers = servers;
        result = 'ssd://' + new Buffer(JSON.stringify(obj)).toString('base64');
        return res.send(result);
      } else {
        if (accountInfo.type == 1) {
          const insert = { method: 'chacha20', host: '127.0.0.1', shift: 0, comment: '不限时不限量账号' };
          subscribeAccount.server.unshift(insert);
        } else {
          let insertExpire = {
            method: 'chacha20',
            host: '127.0.0.1',
            shift: 0,
            comment: accountInfo.data.expire <= new Date() ? '已过期' : '过期时间：' + moment(accountInfo.data.expire).format("YYYY-MM-DD HH:mm:ss")
          };
          let insertFlow = {
            method: 'chacha20',
            host: '127.0.0.1',
            shift: 0,
            comment: '使用流量：' + flowNumber(flowInfo[0]) + '/' + flowNumber(accountInfo.data.flow + accountInfo.data.flowPack)
          };
          subscribeAccount.server.unshift(insertExpire);
          subscribeAccount.server.unshift(insertFlow);
        }
        if (type === 'clash') {
          const yaml = require('js-yaml');
          const clashConfig = appRequire('plugins/webgui/server/clash');
          clashConfig.Proxy = subscribeAccount.server.map(server => {
            return {
              cipher: server.method,
              name: server.subscribeName || server.name,
              password: subscribeAccount.account.password,
              port: subscribeAccount.account.port + server.shift,
              server: server.host,
              type: 'ss'
            };
          });
          clashConfig['Proxy Group'][0] = {
            name: 'Proxy',
            type: 'select',
            proxies: subscribeAccount.server.map(server => {
              return server.subscribeName || server.name;
            }),
          };
          return res.send(yaml.safeDump(clashConfig));
        }
        result = subscribeAccount.server.map(s => {
          if (type === 'shadowrocket') {
            return 'ss://' + Buffer.from(s.method + ':' + subscribeAccount.account.password + '@' + s.host + ':' + (subscribeAccount.account.port + + s.shift)).toString('base64') + '&group=' + urlsafeBase64(baseSetting.title) + '#' + encodeURIComponent((s.comment || '这里显示备注'));
          } else if (type === 'potatso') {
            return 'ss://' + Buffer.from(s.method + ':' + subscribeAccount.account.password + '@' + s.host + ':' + (subscribeAccount.account.port + + s.shift)).toString('base64') + '#' + (s.comment || '这里显示备注');
          } else if (type === 'ssr') {
            return 'ssr://' + urlsafeBase64(s.host + ':' + (subscribeAccount.account.port + s.shift) + ':origin:' + s.method + ':plain:' + urlsafeBase64(subscribeAccount.account.password) + '/?obfsparam=&remarks=' + urlsafeBase64(s.comment || '这里显示备注') + '&group=' + urlsafeBase64(baseSetting.title));
          }
        }).join('\r\n');
        return res.send(Buffer.from(result).toString('base64'));
      }
    }
  } catch (err) {
    console.log(err);
    res.status(403).end();
  }
};
const flowNumber = (number) => {
  if (number < 1000) return number + ' B';
  else if (number < 1000 * 1000) return (number / 1000).toFixed(0) + ' KB';
  else if (number < 1000 * 1000 * 1000) return (number / 1000000).toFixed(1) + ' MB';
  else if (number < 1000 * 1000 * 1000 * 1000) return (number / 1000000000).toFixed(3) + ' GB';
};
