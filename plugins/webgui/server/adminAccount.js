const macAccount = appRequire('plugins/macAccount/index');
const account = appRequire('plugins/account/index');
const flow = appRequire('plugins/flowSaver/flow');
const flowPack = appRequire('plugins/webgui_order/flowPack');
const dns = require('dns');
const net = require('net');
const crypto = require('crypto');
const knex = appRequire('init/knex').knex;
const moment = require('moment');
const config = appRequire('services/config').all();

const formatMacAddress = mac => mac.replace(/-/g, '').replace(/:/g, '').toLowerCase();


const md5 = function (text) {
  return crypto.createHash('md5').update(text).digest('hex');
};
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

//base64
const urlsafeBase64 = str => {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};
//ssd
const ssd = (account, server, index) => {
  return {
    id: index,//这是客户端排序的顺序
    server: server.host,
    port: account.port + server.shift,
    encryption: account.method,
    ratio: server.scale,
    remarks: server.name
  }
}
const ss_clash = (account, server) => {
  return {
    cipher: account.method,
    name: server.name,
    password: String(account.password),
    port: account.port + server.shift,
    server: server.host,
    type: 'ss'
  };
}
const v2_clash = (account, server) => {
  return {
    name: server.name,
    type: 'vmess',
    server: server.host,
    port: server.v2rayPort,
    uuid: account.uuid,
    alterId: server.v2rayAID || 0,
    cipher: server.v2rayMethod || 'auto',
    udp: true,
    tls: server.v2rayTLS ? 'tls' : '',
    'skip-cert-verify': true,
    network: server.v2rayNet || '',
    'ws-path': server.v2rayPath || '',
  };
}
//小火箭
const ss_shadowrocket = (account, server) => {
  return 'ss://' + Buffer.from(account.method + ':' + account.password + '@' + server.host + ':' + (account.port + server.shift)).toString('base64') + '#' + encodeURIComponent(server.name);
}
//v2ray 默认
const v2ray = (account, server) => {
  let v = {
    host: server.v2rayHost,
    path: server.v2rayPath,
    tls: server.v2rayTLS ? 'tls' : '',
    add: server.host,
    port: server.v2rayPort,
    aid: server.v2rayAID || 0,
    net: server.v2rayNet || '',
    type: "none",
    v: "2",
    ps: server.name,
    id: account.uuid,
    class: 1
  }
  return 'vmess://' + Buffer.from(JSON.stringify(v)).toString('base64');
}
//SS 默认链接
const ss = (account, server) => {

}
//ssr 默认链接
const ssr = (account, server) => {

}

exports.getSubscribeAccountForUser = async (req, res) => {
  try {
    let type = req.query.type;
    type = type ? type.toLowerCase() : '';
    const app = req.query.app;
    const resolveIp = req.query.ip;
    const showFlow = req.query.flow || 0;
    const singlePort = req.query.port;
    const token = req.params.token;
    //const ip = req.headers['x-real-ip'] || req.connection.remoteAddress;
    //获得反向代理的真实ip
    const ips = req.headers['x-forwarded-for'];
    let ip = '';
    if (ips) {
      ip = ips.split(',')[0];
    } else {
      ip = req.headers['x-real-ip'] || req.connection.remoteAddress;
    }
    if (isMacAddress(token)) {
      subscribeAccount = await macAccount.getMacAccountForSubscribe(token, ip);
    } else {
      const accountSetting = await knex('webguiSetting').where({
        key: 'account'
      }).then(s => s[0]).then(s => JSON.parse(s.value));
      if (!accountSetting.subscribe) { return res.status(404).end(); }
      const subscribeAccount = await account.getAccountForSubscribe(token, ip);
      let accountInfo = subscribeAccount.account;

      for (const s of subscribeAccount.server) {
        if (s.singleMode === 'ssr1port' && accountInfo.connType != 'SSR') {
          s.comment = '[只支持SSR单端口]'
        } else if (s.singleMode === 'v2ray' && type != 'v2ray' && app != 'shadowrocket') {
          s.comment = '[只支持V2Ray]'
        } else {
          s.comment = '';
        }
        s.name = s.status + s.comment + s.name;
        if (s.scale != 1) {
          s.name = s.name + ' 倍率' + s.scale;
        }
        s.host = await getAddress(s.host, +resolveIp);
      }
      const baseSetting = await knex('webguiSetting').where({
        key: 'base'
      }).then(s => s[0]).then(s => JSON.parse(s.value));

      accountInfo.hideFlow = config.plugins.webgui.hideFlow ? accountInfo.data.flow > 100000000000 : false;

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
      let tip_addr = {
        flag: 1,
        method: 'chacha20',
        host: '127.0.0.1',
        shift: 2,
        v2rayPort: 80,
        name: `备用地址：` + (config.plugins.webgui.siteback ? `${config.plugins.webgui.siteback}` : `${(config.plugins.webgui.site.split('//')[1] || config.plugins.webgui.site)}`)
      };
      subscribeAccount.server.unshift(tip_addr);
      let tip_flow = {
        flag: 1,
        method: 'chacha20',
        host: '127.0.0.1',
        shift: 1,
        v2rayPort: 80
      };
      let tip = {};
      if (accountInfo.type == 1) {
        tip_flow.name = '不限时不限量账号';
        tip.admin = '不限时不限量账号';
      } else if (config.plugins.webgui.hideFlow) {
        if (accountInfo.data.flow < 100 * 1000 * 1000 * 1000) {
          tip_flow.name = '当期流量：' + flowNumber(flowInfo[0]) + '/' + flowNumber(accountInfo.data.flow + accountInfo.data.flowPack);
          tip.use = flowNumber(flowInfo[0]).replace(/\s*/g, "");
          tip.sum = flowNumber(accountInfo.data.flow + accountInfo.data.flowPack).replace(/\s*/g, "");
        } else {
          if (flowInfo[0] > (accountInfo.data.flow + accountInfo.data.flowPack)) {
            tip_flow.name = '已封停，请购买流量包或联系管理员';
            tip.stop = '已封停，请购买流量包或联系管理员';
          }
        }
      } else {
        if (+showFlow) {
          tip_flow.name = '当期流量：' + flowNumber(flowInfo[0]) + '/' + flowNumber(accountInfo.data.flow + accountInfo.data.flowPack);
          tip.use = flowNumber(flowInfo[0]).replace(/\s*/g, "");
          tip.sum = flowNumber(accountInfo.data.flow + accountInfo.data.flowPack).replace(/\s*/g, "");
        }
      }
      let tip_date = {
        flag: 1,
        method: 'chacha20',
        host: '127.0.0.1',
        shift: 0,
        v2rayPort: 80,
        name: accountInfo.data.expire <= new Date() ? '已过期' : '过期时间：' + moment(accountInfo.data.expire).format("YYYY-MM-DD HH:mm:ss")
      };
      tip.time = accountInfo.data.expire <= new Date() ? '已过期' : '过期时间：' + moment(accountInfo.data.expire).format("YYYY-MM-DD HH:mm:ss")


      if (accountInfo.data.expire <= new Date()) {
        subscribeAccount.server = [tip_date, tip_addr]
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
            password: accountInfo.password,
            traffic_used: ((flowInfo[0] || 10) / 1000000000).toFixed(2),
            traffic_total: accountInfo.type == 1 || accountInfo.hideFlow ? 500 : ((accountInfo.data.flow + accountInfo.data.flowPack) / 1000000000).toFixed(2),
            expiry: accountInfo.type == 1 ? '2099-12-31 23:59:59' : moment(accountInfo.data.expire).format("YYYY-MM-DD HH:mm:ss")
          };
          let servers = subscribeAccount.server.map((s, index) => {
            return ssd(accountInfo, s, index);
          });
          obj.servers = servers;
          result = 'ssd://' + new Buffer(JSON.stringify(obj)).toString('base64');
          return res.send(result);
        }
        // clash
        if ((!app && type === 'clash') || app === 'clash') {
          const yaml = require('js-yaml');
          const clashConfig = appRequire('plugins/webgui/server/clash');
          subscribeAccount.server.unshift(tip_date);
          clashConfig.Proxy = subscribeAccount.server.map(server => {
            return ss_clash(accountInfo, server);
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

        if ((!app && type === 'shadowrocket') || app === 'shadowrocket') {
          result = subscribeAccount.server.map(s => {
            //支持v2
            if (s.v2ray === 1 && app === 'shadowrocket') {
              return v2ray(accountInfo, s)
            } else {
              return ss_shadowrocket(accountInfo, s);
            }
          }).join('\r\n');
          let remarks = (config.plugins.webgui.site.split('//')[1] || config.plugins.webgui.site) + '(右滑更新)'
          let status = '';//tip.admin ? tip.admin : ((tip.stop ? tip.stop : `当期流量：${tip.use}/${tip.sum}`) + `❤${tip.time}`);
          if (tip.admin) status = tip.admin;
          else if (tip.stop) status = tip.stop + `❤${tip.time}`;
          else if (accountInfo.hideFlow) status = tip.time;
          else if (tip.use || tip.sum) status = `当期流量：${tip.use}/${tip.sum}❤${tip.time}`
          else status = `${tip.time}`

          result += `\r\nSTATUS=${status}\r\nREMARKS=${remarks}`.toString('base64')
          return res.send(Buffer.from(result).toString('base64'));
        }
        //其他方式
        subscribeAccount.server.unshift(tip_date);
        result = subscribeAccount.server.map(s => {
          if ((!app && type === 'quantumult') || app === 'quantumult') {
            return 'ss://' + Buffer.from(s.method + ':' + accountInfo.password + '@' + s.host + ':' + (accountInfo.port + + s.shift)).toString('base64') + '#' + encodeURIComponent(s.name);
          }
          if ((!app && type === 'potatso') || app === 'potatso') {
            return 'ss://' + Buffer.from(s.method + ':' + accountInfo.password + '@' + s.host + ':' + (accountInfo.port + + s.shift)).toString('base64') + '#' + (s.name);
          }
        }).join('\r\n');
      }
      //SSR 模式
      if (accountInfo.connType === "SSR") {
        if (!app || type === 'ssr') {
          const singlePorts = await knex('account_plugin').select().where('is_multi_user', '>', 0);
          //格式 str(row['id']) + row['passwd'] + row['method'] + row['obfs'] + row['protocol'])
          // let acc_md5 = md5(`${accountInfo.id}${accountInfo.password}${accountInfo.method}${accountInfo.obfs}${accountInfo.protocol}`).substring(0,5);
          // let obfsparam=`${acc_md5}${accountInfo.id}.catalog.update.microsoft.com`
          if ((!app && type === 'shadowrocket') || app === 'shadowrocket') {
            let remarks = (config.plugins.webgui.site.split('//')[1] || config.plugins.webgui.site) + '(右滑更新)'
            let status = '';// tip.admin ? tip.admin : ((tip.stop ? tip.stop : `当期流量：${tip.use}/${tip.sum}`) + `❤${tip.time}`);

            if (tip.admin) status = tip.admin;
            else if (tip.stop) status = tip.stop + `❤${tip.time}`;
            else if (accountInfo.hideFlow) status = tip.time;
            else if (tip.use || tip.sum) status = `当期流量：${tip.use}/${tip.sum}❤${tip.time}`
            else status = `${tip.time}`

            result += `STATUS=${status}\r\nREMARKS=${remarks}\r\n`.toString('base64')
          } else {
            //其他方式
            subscribeAccount.server.unshift(tip_date);
          }
          result += subscribeAccount.server.map(s => {
            //支持v2
            if (s.v2ray === 1 && app === 'shadowrocket') {
              return v2ray(accountInfo, s)
            }
            //强制单一模式
            if ((accountSetting.singleMode === 'ssr1port' || s.singleMode === 'ssr1port' || +singlePort) && !s.flag) {
              let str = '';
              //单端口，可以是多个
              for (let item of singlePorts) {
                if (!item.server || JSON.parse(item.server).indexOf(s.id) > -1) {
                  str += 'ssr://' + urlsafeBase64(s.host + ':' + item.port + ':' + item.protocol + ':' + item.method + ':' + item.obfs + ':' + urlsafeBase64(item.password) + '/?obfsparam=' + urlsafeBase64(item.obfs_param) + '&protoparam=' + urlsafeBase64(`${accountInfo.id}:${accountInfo.password}`) + '&remarks=' + urlsafeBase64(s.name + ' - ' + item.port) + '&group=' + urlsafeBase64(baseSetting.title)) + '\r\n';
                }
              }
              return str;
            } else {
              return 'ssr://' + urlsafeBase64(s.host + ':' + (accountInfo.port + s.shift) + ':' + accountInfo.protocol + ':' + accountInfo.method + ':' + accountInfo.obfs + ':' + urlsafeBase64(accountInfo.password) + '/?obfsparam=' + (accountInfo.obfs_param ? urlsafeBase64(accountInfo.obfs_param) : '') + '&protoparam=&remarks=' + urlsafeBase64(s.name) + '&group=' + urlsafeBase64(baseSetting.title));
            }
          }).join('\r\n');
        }
        if (type === 'v2ray') {
          if (app == 'clash') {
            const yaml = require('js-yaml');
            const clashConfig = appRequire('plugins/webgui/server/clash');
            subscribeAccount.server.unshift(tip_date);
            clashConfig.dns = { enable: true, nameserver: ['114.114.114.114', '223.5.5.5'] }
            let cs = { Proxy: [], proxies: [] };
            subscribeAccount.server.map(server => {
              if (server.v2ray) {
                cs.Proxy.push(v2_clash(accountInfo, server));
                cs.proxies.push(server.name);
              }
            });
            clashConfig.Proxy = cs.Proxy;
            clashConfig['Proxy Group'][0] = {
              name: 'Proxy',
              type: 'select',
              proxies: cs.proxies,
            };
            //return res.send(yaml.safeDump(clashConfig));
            res.setHeader('Content-Type', ' text/plain;charset=utf-8');
            res.setHeader("Content-Disposition", `attachment; filename=${encodeURIComponent(baseSetting.title)}.yaml`);
            var dataBuffer = Buffer.concat([new Buffer('\xEF\xBB\xBF', 'binary'), new Buffer(yaml.safeDump(clashConfig))]);
            return res.send(dataBuffer);
          }

          for (const s of subscribeAccount.server) {
            if (s.v2ray === 1 || s.flag) {
              result += v2ray(accountInfo, s) + '\r\n'
              //return 'vmess://' + urlsafeBase64(`${s.v2rayMethod}:${accountInfo.uuid}@${s.host}:${s.v2rayPort}`) + `?remarks=${encodeURIComponent(s.comment)}&obfs=none`
            }
          }
          if (app === 'shadowrocket') {
            let remarks = (config.plugins.webgui.site.split('//')[1] || config.plugins.webgui.site) + '(左滑更新)'
            let status = tip.admin ? tip.admin : ((tip.stop ? tip : `当期流量：${tip.use}/${tip.sum}`) + `❤${tip.time}`);
            result += `STATUS=${status}\r\nREMARKS=${remarks}`.toString('base64')
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
