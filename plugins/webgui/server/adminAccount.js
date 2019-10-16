const macAccount = appRequire('plugins/macAccount/index');
const account = appRequire('plugins/account/index');
const flow = appRequire('plugins/flowSaver/flow');
const flowPack = appRequire('plugins/webgui_order/flowPack');
const dns = require('dns');
const net = require('net');
const knex = appRequire('init/knex').knex;
const moment = require('moment');
const config = appRequire('services/config').all();

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
    let type = req.query.type;
    const app = req.query.app;
    const resolveIp = req.query.ip;
    const showFlow = req.query.flow || 0;
    const singlePort = req.query.port;
    const token = req.params.token;
    const ip = req.headers['x-real-ip'] || req.connection.remoteAddress;
    if (isMacAddress(token)) {
      subscribeAccount = await macAccount.getMacAccountForSubscribe(token, ip);
    } else {
      const accountSetting = await knex('webguiSetting').where({
        key: 'account'
      }).then(s => s[0]).then(s => JSON.parse(s.value));
      if (!accountSetting.subscribe) { return res.status(404).end(); }
      const subscribeAccount = await account.getAccountForSubscribe(token, ip);
      for (const s of subscribeAccount.server) {
        s.host = await getAddress(s.host, +resolveIp);
      }
      const baseSetting = await knex('webguiSetting').where({
        key: 'base'
      }).then(s => s[0]).then(s => JSON.parse(s.value));

      let accountInfo = subscribeAccount.account;

      //更新订阅时间
      await knex('account_plugin').update({
        lastSubscribeTime: Date.now()
      }).where({
        'id': accountInfo.id
      });
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
      //插入提示信息
      let renew = {
        flag: 1,
        method: 'chacha20',
        host: '127.0.0.1',
        shift: 2,
        v2rayPort: 80,
        comment: `备用地址：` + (config.plugins.webgui.siteback ? `${config.plugins.webgui.siteback}` : `${(config.plugins.webgui.site.split('//')[1] || config.plugins.webgui.site)}`)
      };
      subscribeAccount.server.unshift(renew);
      let insertFlow;
      let tip = {};
      if (accountInfo.type == 1) {
        insertFlow = { method: 'chacha20', host: '127.0.0.1', shift: 0, comment: '不限时不限量账号' };
        tip.admin = '不限时不限量账号';
      } else if (config.plugins.webgui.hideFlow) {
        if (accountInfo.data.flow < 100 * 1000 * 1000 * 1000) {
          insertFlow = {
            flag: 1,
            method: 'chacha20',
            host: '127.0.0.1',
            shift: 1,
            v2rayPort: 80,
            comment: '当期流量：' + flowNumber(flowInfo[0]) + '/' + flowNumber(accountInfo.data.flow + accountInfo.data.flowPack)
          };
          tip.use = flowNumber(flowInfo[0]).replace(/\s*/g, "");
          tip.sum = flowNumber(accountInfo.data.flow + accountInfo.data.flowPack).replace(/\s*/g, "");
        } else {
          if (flowInfo[0] > (accountInfo.data.flow + accountInfo.data.flowPack)) {
            insertFlow = {
              flag: 1,
              method: 'chacha20',
              host: '127.0.0.1',
              shift: 1,
              v2rayPort: 80,
              comment: '已封停，请购买流量包或联系管理员'
            };
            tip.stop = '已封停，请购买流量包或联系管理员';
          }
        }
      } else {
        if (+showFlow) {
          insertFlow = {
            flag: 1,
            method: 'chacha20',
            host: '127.0.0.1',
            shift: 1,
            v2rayPort: 80,
            comment: '当期流量：' + flowNumber(flowInfo[0]) + '/' + flowNumber(accountInfo.data.flow + accountInfo.data.flowPack)
          };
          tip.use = flowNumber(flowInfo[0]).replace(/\s*/g, "");
          tip.sum = flowNumber(accountInfo.data.flow + accountInfo.data.flowPack).replace(/\s*/g, "");
        }
      }
      let insertExpire = {
        flag: 1,
        method: 'chacha20',
        host: '127.0.0.1',
        shift: 0,
        v2rayPort: 80,
        comment: accountInfo.data.expire <= new Date() ? '已过期' : '过期时间：' + moment(accountInfo.data.expire).format("YYYY-MM-DD HH:mm:ss")
      };
      tip.time = accountInfo.data.expire <= new Date() ? '已过期' : '过期时间：' + moment(accountInfo.data.expire).format("YYYY-MM-DD HH:mm:ss")


      if (accountInfo.data.expire <= new Date()) {
        subscribeAccount.server = [insertExpire, renew]
      } else {
        if ((!app && type != 'shadowrocket') && app != 'shadowrocket') {
          subscribeAccount.server.unshift(insertFlow);
          subscribeAccount.server.unshift(insertExpire);
        }
      }

      let result = '';
      //SS 模式
      if (!accountInfo.connType || accountInfo.connType === "SS") {
        // ssd  为了兼容原来的写法
        if ((!app && type === 'ssd') || app === 'ssd') {
          let obj = {
            airport: baseSetting.title,
            port: 12580,
            encryption: 'chacha20',
            password: subscribeAccount.account.password,
            traffic_used: ((flowInfo[0] || 10) / 1000000000).toFixed(2),
            traffic_total: accountInfo.type == 1 || config.plugins.webgui.hideFlow ? 500 : ((accountInfo.data.flow + accountInfo.data.flowPack) / 1000000000).toFixed(2),
            expiry: accountInfo.type == 1 ? '2099-12-31 23:59:59' : moment(accountInfo.data.expire).format("YYYY-MM-DD HH:mm:ss")
          };
          let servers = subscribeAccount.server.map((s, index) => {
            if (s.singleMode != 'off') {
              s.comment = s.name + '[此节点只支持SSR]';
            }
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
        }
        // clash
        if ((!app && type === 'clash') || app === 'clash') {
          const yaml = require('js-yaml');
          const clashConfig = appRequire('plugins/webgui/server/clash');
          clashConfig.Proxy = subscribeAccount.server.map(server => {
            if (server.singleMode != 'off') {
              server.comment = server.name + '[此节点只支持SSR]';
            }
            return {
              cipher: server.method,
              name: server.subscribeName || server.comment || server.name,
              password: String(subscribeAccount.account.password),
              port: subscribeAccount.account.port + server.shift,
              server: server.host,
              type: 'ss'
            };
          });
          clashConfig['Proxy Group'][0] = {
            name: 'Proxy',
            type: 'select',
            proxies: subscribeAccount.server.map(server => {
              return server.subscribeName || server.comment || server.name;
            }),
          };
          return res.send(yaml.safeDump(clashConfig));
        }

        if ((!app && type === 'shadowrocket') || app === 'shadowrocket') {
          result = subscribeAccount.server.map(s => {
            if (s.singleMode != 'off' && !s.flag) {
              s.comment = s.name + '[此节点只支持SSR]';
            }
            return 'ss://' + Buffer.from(s.method + ':' + accountInfo.password + '@' + s.host + ':' + (accountInfo.port + + s.shift)).toString('base64') + '#' + encodeURIComponent((s.comment || '这里显示备注'));
          }).join('\r\n');
          let remarks = (config.plugins.webgui.site.split('//')[1] || config.plugins.webgui.site) + '(左滑更新)'
          let status = tip.admin ? tip.admin : ((tip.stop ? tip : `当期流量：${tip.use}/${tip.sum}`) + `❤${tip.time}`);
          result += `\r\nSTATUS=${status}\r\nREMARKS=${remarks}`.toString('base64')
          return res.send(Buffer.from(result).toString('base64'));
        }
        //其他方式
        result = subscribeAccount.server.map(s => {
          if (s.singleMode != 'off') {
            s.comment = s.name + '[此节点只支持SSR]';
          }
          if ((!app && type === 'quantumult') || app === 'quantumult') {
            return 'ss://' + Buffer.from(s.method + ':' + accountInfo.password + '@' + s.host + ':' + (accountInfo.port + + s.shift)).toString('base64') + '#' + encodeURIComponent((s.comment || '这里显示备注'));
          }
          if ((!app && type === 'potatso') || app === 'potatso') {
            return 'ss://' + Buffer.from(s.method + ':' + accountInfo.password + '@' + s.host + ':' + (accountInfo.port + + s.shift)).toString('base64') + '#' + (s.comment || '这里显示备注');
          }
        }).join('\r\n');
      }
      //SSR 模式
      if (accountInfo.connType === "SSR") {
        if (type === 'ssr') {
          result = subscribeAccount.server.map(s => {
            //强制单一模式
            if (accountSetting.singleMode != 'off' || s.singleMode != 'off' || +singlePort) {
              //单端口，可以是多个
              let p = s.singlePort ? s.singlePort.split(',') : [];
              if (p.length > 0) {
                let str = '';
                for (var val of p) {
                  if (val) {
                    str += 'ssr://' + urlsafeBase64(s.host + ':' + val + ':' + accountInfo.protocol + ':chacha20-ietf:' + accountInfo.obfs + ':' + urlsafeBase64('balala') + '/?obfsparam=' + (accountInfo.obfs_param ? urlsafeBase64(accountInfo.obfs_param) : '') + '&protoparam=' + urlsafeBase64(`${accountInfo.port + s.shift}:${accountInfo.password}`) + '&remarks=' + urlsafeBase64(s.comment + ' - ' + val) + '&group=' + urlsafeBase64(baseSetting.title)) + '\r\n';
                  }
                }
                return str;
              }
              return 'ssr://' + urlsafeBase64(s.host + ':' + (s.singlePort) + ':' + accountInfo.protocol + ':chacha20-ietf:' + accountInfo.obfs + ':' + urlsafeBase64('balala') + '/?obfsparam=' + (accountInfo.obfs_param ? urlsafeBase64(accountInfo.obfs_param) : '') + '&protoparam=' + urlsafeBase64(`${accountInfo.port + s.shift}:${accountInfo.password}`) + '&remarks=' + urlsafeBase64(s.comment + (s.singlePort ? (' - ' + s.singlePort) : '')) + '&group=' + urlsafeBase64(baseSetting.title));
            } else {
              return 'ssr://' + urlsafeBase64(s.host + ':' + (accountInfo.port + s.shift) + ':' + accountInfo.protocol + ':' + accountInfo.method + ':' + accountInfo.obfs + ':' + urlsafeBase64(accountInfo.password) + '/?obfsparam=' + (accountInfo.obfs_param ? urlsafeBase64(accountInfo.obfs_param) : '') + '&protoparam=&remarks=' + urlsafeBase64(s.comment) + '&group=' + urlsafeBase64(baseSetting.title));
            }
          }).join('\r\n');

          if ((!app && type === 'shadowrocket') || app === 'shadowrocket') {
            let remarks = (config.plugins.webgui.site.split('//')[1] || config.plugins.webgui.site) + '(左滑更新)'
            let status = tip.admin ? tip.admin : ((tip.stop ? tip : `当期流量：${tip.use}/${tip.sum}`) + `❤${tip.time}`);
            result += `\r\nSTATUS=${status}\r\nREMARKS=${remarks}`.toString('base64')
          }
        }
        if (type === 'v2ray') {
          if (app === 'shadowrocket') {
            result = subscribeAccount.server.map(s => {
              if (s.v2ray === 1) {
                let v = {
                  "host": "",
                  "path": "",
                  "tls": "",
                  "add": s.host,
                  "port": s.v2rayPort,
                  "aid": 0,
                  "net": "tcp",
                  "type": "none",
                  "v": "2",
                  "ps": s.comment,
                  "id": accountInfo.uuid,
                  "class": 1
                }
                return 'vmess://' + urlsafeBase64(JSON.stringify(v));
                //return 'vmess://' + urlsafeBase64(`${s.v2rayMethod}:${accountInfo.uuid}@${s.host}:${s.v2rayPort}`) + `?remarks=${encodeURIComponent(s.comment)}&obfs=none`
              }
              if (s.flag) {
                return 'vmess://' + urlsafeBase64(`aes-128-gcm:uuid${s.shift}@${s.host}:801`) + `?remarks=${encodeURIComponent(s.comment)}&obfs=none`
              }
            }).join('\r\n');
            let remarks = (config.plugins.webgui.site.split('//')[1] || config.plugins.webgui.site) + '(左滑更新)'
            let status = tip.admin ? tip.admin : ((tip.stop ? tip : `当期流量：${tip.use}/${tip.sum}`) + `❤${tip.time}`);
            result += `\r\nSTATUS=${status}\r\nREMARKS=${remarks}`.toString('base64')
          }
        }
      }

      return res.send(Buffer.from(result).toString('base64'));

      if (type === 'ssd') {
        let obj = {
          airport: baseSetting.title,
          port: 12580,
          encryption: 'chacha20',
          password: subscribeAccount.account.password,
          traffic_used: ((flowInfo[0] || 10) / 1000000000).toFixed(2),
          traffic_total: accountInfo.type == 1 || config.plugins.webgui.hideFlow ? 500 : ((accountInfo.data.flow + accountInfo.data.flowPack) / 1000000000).toFixed(2),
          expiry: accountInfo.type == 1 ? '2099-12-31 23:59:59' : moment(accountInfo.data.expire).format("YYYY-MM-DD HH:mm:ss")
        };
        if (accountInfo.connType == "SSR") {
          subscribeAccount.server = [{
            method: 'chacha20',
            host: '127.0.0.1',
            shift: 0,
            scale: 100,
            comment: 'SSR模式下不支持SSD,请使用SSR客户端'
          }];
        }
        let servers = subscribeAccount.server.map((s, index) => {
          if (s.singleMode != 'off') {
            s.comment = s.name + '[此节点不支持SS]';
          }
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
        let renew = {
          method: 'chacha20',
          host: '127.0.0.1',
          shift: 0,
          comment: `续费地址：${(config.plugins.webgui.site.split('//')[1] || config.plugins.webgui.site)}` + (config.plugins.webgui.siteback ? `(备用 ${config.plugins.webgui.siteback})` : '')
        };
        subscribeAccount.server.unshift(renew);
        if (accountInfo.type == 1) {
          const insert = { method: 'chacha20', host: '127.0.0.1', shift: 0, comment: '不限时不限量账号' };
          subscribeAccount.server.unshift(insert);
        } else if (config.plugins.webgui.hideFlow) {
          if (accountInfo.data.flow < 100 * 1000 * 1000 * 1000) {
            let insertFlow = {
              method: 'chacha20',
              host: '127.0.0.1',
              shift: 1,
              comment: '当期流量：' + flowNumber(flowInfo[0]) + '/' + flowNumber(accountInfo.data.flow + accountInfo.data.flowPack)
            };
            subscribeAccount.server.unshift(insertFlow);
          } else {
            if (flowInfo[0] > (accountInfo.data.flow + accountInfo.data.flowPack)) {
              let insertFlow = {
                method: 'chacha20',
                host: '127.0.0.1',
                shift: 1,
                comment: '已封停，请购买流量包或联系管理员'
              };
              subscribeAccount.server.unshift(insertFlow);
            }
          }
        } else {
          if (+showFlow) {
            let insertFlow = {
              method: 'chacha20',
              host: '127.0.0.1',
              shift: 1,
              comment: '当期流量：' + flowNumber(flowInfo[0]) + '/' + flowNumber(accountInfo.data.flow + accountInfo.data.flowPack)
            };
            subscribeAccount.server.unshift(insertFlow);
          }
        }
        let insertExpire = {
          method: 'chacha20',
          host: '127.0.0.1',
          shift: 0,
          comment: accountInfo.data.expire <= new Date() ? '已过期' : '过期时间：' + moment(accountInfo.data.expire).format("YYYY-MM-DD HH:mm:ss")
        };

        if (accountInfo.data.expire <= new Date()) {
          subscribeAccount.server = [insertExpire, renew]
        } else {
          subscribeAccount.server.unshift(insertExpire);
        }
        if (type === 'clash') {
          if (accountInfo.connType == "SSR") {
            subscribeAccount.server = [{
              method: 'chacha20',
              host: '127.0.0.1',
              shift: 0,
              comment: 'SSR模式下不支持clash,请使用SSR客户端'
            }];
          }
          const yaml = require('js-yaml');
          const clashConfig = appRequire('plugins/webgui/server/clash');
          clashConfig.Proxy = subscribeAccount.server.map(server => {
            if (server.singleMode != 'off') {
              server.comment = server.name + '[此节点不支持SS]';
            }
            return {
              cipher: server.method,
              name: server.subscribeName || server.comment || server.name,
              password: String(subscribeAccount.account.password),
              port: subscribeAccount.account.port + server.shift,
              server: server.host,
              type: 'ss'
            };
          });
          clashConfig['Proxy Group'][0] = {
            name: 'Proxy',
            type: 'select',
            proxies: subscribeAccount.server.map(server => {
              return server.subscribeName || server.comment || server.name;
            }),
          };
          return res.send(yaml.safeDump(clashConfig));
        }
        const method = ['aes-256-gcm', 'chacha20-ietf-poly1305', 'aes-128-gcm', 'aes-192-gcm', 'xchacha20-ietf-poly1305'];
        if (accountInfo.connType == "SSR") {
          result = subscribeAccount.server.map(s => {
            //强制单一模式
            if (accountSetting.singleMode != 'off' || s.singleMode != 'off' || +singlePort) {
              //单端口，可以是多个
              let p = s.singlePort ? s.singlePort.split(',') : [];
              if (p.length > 0) {
                let str = '';
                for (var val of p) {
                  if (val) {
                    str += 'ssr://' + urlsafeBase64(s.host + ':' + val + ':' + accountInfo.protocol + ':chacha20-ietf:' + accountInfo.obfs + ':' + urlsafeBase64('balala') + '/?obfsparam=' + (accountInfo.obfs_param ? urlsafeBase64(accountInfo.obfs_param) : '') + '&protoparam=' + urlsafeBase64(`${accountInfo.port + s.shift}:${accountInfo.password}`) + '&remarks=' + urlsafeBase64(s.comment + ' - ' + val) + '&group=' + urlsafeBase64(baseSetting.title)) + '\r\n';
                  }
                }
                return str;
              }
              return 'ssr://' + urlsafeBase64(s.host + ':' + (s.singlePort) + ':' + accountInfo.protocol + ':chacha20-ietf:' + accountInfo.obfs + ':' + urlsafeBase64('balala') + '/?obfsparam=' + (accountInfo.obfs_param ? urlsafeBase64(accountInfo.obfs_param) : '') + '&protoparam=' + urlsafeBase64(`${accountInfo.port + s.shift}:${accountInfo.password}`) + '&remarks=' + urlsafeBase64(s.comment + (s.singlePort ? (' - ' + s.singlePort) : '')) + '&group=' + urlsafeBase64(baseSetting.title));
            } else {
              return 'ssr://' + urlsafeBase64(s.host + ':' + (accountInfo.port + s.shift) + ':' + accountInfo.protocol + ':' + accountInfo.method + ':' + accountInfo.obfs + ':' + urlsafeBase64(accountInfo.password) + '/?obfsparam=' + (accountInfo.obfs_param ? urlsafeBase64(accountInfo.obfs_param) : '') + '&protoparam=&remarks=' + urlsafeBase64(s.comment) + '&group=' + urlsafeBase64(baseSetting.title));
            }
          }).join('\r\n');
        } else {
          result = subscribeAccount.server.map(s => {
            if (s.singleMode != 'off') {
              s.comment = s.name + '[此节点不支持SS]';
            }
            if (type === 'shadowrocket') {
              return 'ss://' + Buffer.from(s.method + ':' + accountInfo.password + '@' + s.host + ':' + (accountInfo.port + + s.shift)).toString('base64') + '#' + encodeURIComponent((s.comment || '这里显示备注'));
            } else if (type === 'potatso') {
              return 'ss://' + Buffer.from(s.method + ':' + accountInfo.password + '@' + s.host + ':' + (accountInfo.port + + s.shift)).toString('base64') + '#' + (s.comment || '这里显示备注');
            } else if (type === 'ssr') {
              let index = method.indexOf(s.method);
              if (index > -1) {
                s.comment = '[不支持SSR(请在网站中切换连接方式)]';
              } else if (s.singleMode != 'off') {
                s.comment = '[此节点不支持SS(请在网站中切换连接方式)]';
              }
              return 'ssr://' + urlsafeBase64(s.host + ':' + (accountInfo.port + s.shift) + ':origin:' + s.method + ':plain:' + urlsafeBase64(accountInfo.password) + '/?obfsparam=&remarks=' + urlsafeBase64(s.comment || '这里显示备注') + '&group=' + urlsafeBase64(baseSetting.title));
            }
          }).join('\r\n');
        }
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
  else if (number < 1000 * 1000 * 1000 * 1000) return (number / 1000000000).toFixed(2) + ' GB';
};
