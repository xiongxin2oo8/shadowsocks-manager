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
  let v2 = {
    name: server.name,
    type: 'vmess',
    server: server.host,
    port: server.v2rayPort,
    uuid: account.uuid,
    alterId: server.v2rayAID || 0,
    cipher: server.v2rayMethod || 'auto',
    udp: true,
    'skip-cert-verify': true,
  };
  if (server.v2rayNet && server.v2rayNet != 'tcp') v2['network'] = server.v2rayNet;
  if (server.v2rayTLS) v2['tls'] = true;
  if (server.v2rayPath) v2['ws-path'] = server.v2rayPath;
  if (server.v2rayHost) v2['ws-headers'] = { Host: server.v2rayHost };
  return v2;
}
//小火箭
const ss_shadowrocket = (account, server) => {
  return 'ss://' + Buffer.from(account.method + ':' + account.password + '@' + server.host + ':' + (account.port + server.shift)).toString('base64') + '#' + encodeURIComponent(server.name);
}
//v2ray 默认
const v2ray = (account, server) => {
  let v = {
    host: server.v2rayHost || '',
    path: server.v2rayPath || '',
    tls: server.v2rayTLS ? 'tls' : '',
    add: server.host,
    port: server.v2rayPort,
    aid: server.v2rayAID || 0,
    net: server.v2rayNet || 'tcp',
    type: "none",
    v: "2",
    ps: server.name,
    id: account.uuid,
    class: 1
  }
  return 'vmess://' + Buffer.from(JSON.stringify(v)).toString('base64');
}
// v2 Quan
const v2_quan = (account, server, title) => {
  server.v2rayMethod = server.v2rayMethod == 'auto' ? 'chacha20-ietf-poly1305' : (server.v2rayMethod || 'none');
  return 'vmess://' + urlsafeBase64(`${server.name}=vmess,${server.host},${server.v2rayPort},${server.v2rayMethod},"${account.uuid}",group=${title},over-tls=${!!server.v2rayTLS},certificate=${server.v2rayTLS || 0},obfs=${server.v2rayNet || 'tcp'},obfs-path="${server.v2rayPath || ''}",obfs-header="Host: ${server.host}[Rr][Nn]User-Agent: Test Agent"`);
}
// v2 QuanX
const quanx_obfs = { ws: 'wss', tcp: 'over-tls' };
const v2_quanx = (account, server) => {
  server.v2rayMethod = server.v2rayMethod == 'auto' ? 'chacha20-ietf-poly1305' : (server.v2rayMethod || 'none');
  server.v2rayNet = quanx_obfs[server.v2rayNet] || 'over-tls';
  return `vmess=${server.host}:${server.v2rayPort},method=${server.v2rayMethod},password=${account.uuid},obfs=${server.v2rayNet}${server.v2rayNet == 'ws' ? ',obfs-uri=' + server.v2rayPath : ''},fast-open=false,udp-relay=false,tag=${server.name}`;
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
    const showFlow = +req.query.flow || 0;
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
      let ipv6_server = [];
      for (const s of subscribeAccount.server) {
        if (s.singleMode === 'ssr1port' && accountInfo.connType != 'SSR') {
          s['des'] = '[只支持SSR单端口]'
        } else if (s.singleMode === 'v2ray' && type != 'v2ray' && app != 'shadowrocket' && app != 'clash' && app != 'v2rayn' && app != 'v2rayng' && app != 'kitsunebi') {
          s['des'] = '[只支持V2Ray]'
        } else {
          s['des'] = '';
        }
        s.name = s.status + s.des + s.name;
        s.host = await getAddress(s.host, +resolveIp);

        if (s.ipv6) {
          let s_v6 = JSON.parse(JSON.stringify(s));
          s_v6.host = s.ipv6;
          s_v6.name = s.name + ' IPV6';
          if (s_v6.scale != 1) {
            s_v6.name = s_v6.name + ' 倍率' + s_v6.scale;
          }
          ipv6_server.push(s_v6);
        }

        if (s.scale != 1) {
          s.name = s.name + ' 倍率' + s.scale;
        }
      }
      subscribeAccount.server = subscribeAccount.server.concat(ipv6_server);

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
      if (showFlow) subscribeAccount.server.unshift(tip_addr);
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
        if (showFlow) {
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
        subscribeAccount.server = [tip_addr]
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
          clashConfig.dns = { enable: true, nameserver: ['119.29.29.29', '223.5.5.5'] }
          subscribeAccount.server.unshift(tip_date);
          let cs = { Proxy: [], proxies: [] };
          subscribeAccount.server.map(server => {
            if (server.v2ray) {
              cs.Proxy.push(v2_clash(accountInfo, server));
            } else {
              cs.Proxy.push(ss_clash(accountInfo, server));
            }
            cs.proxies.push(server.name);
          });
          clashConfig.Proxy = cs.Proxy;
          clashConfig['Proxy Group'][0] = {
            name: 'Proxy',
            type: 'select',
            proxies: cs.proxies,
          };
          // for (const key in clash_group) {
          //   if (clash_group[key].list.length > 0) {
          //     clashConfig['Proxy Group'].push({
          //       name: clash_group[key].name,
          //       type: 'select',
          //       proxies: clash_group[key].list
          //     })
          //   }
          // }
          res.setHeader('Content-Type', ' text/plain;charset=utf-8');
          res.setHeader("Content-Disposition", `attachment; filename=${encodeURIComponent(baseSetting.title)}.yaml`);
          var dataBuffer = Buffer.concat([Buffer.from('\xEF\xBB\xBF', 'binary'), Buffer.from(yaml.safeDump(clashConfig))]);
          return res.send(dataBuffer);
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
          let remarks = (!showFlow ? '国际机场' : (config.plugins.webgui.site.split('//')[1] || config.plugins.webgui.site)) + '(右滑更新)';
          let status = '';//tip.admin ? tip.admin : ((tip.stop ? tip.stop : `当期流量：${tip.use}/${tip.sum}`) + `❤${tip.time}`);
          if (tip.admin) status = tip.admin;
          else if (tip.stop) status = tip.stop + `❤${tip.time}`;
          else if (accountInfo.hideFlow) status = tip.time;
          else if ((tip.use || tip.sum) && showFlow) status = `当期流量：${tip.use}/${tip.sum}❤${tip.time}`
          else status = `${tip.time}`

          result += `\r\nSTATUS=${status}\r\nREMARKS=${remarks}`.toString('base64')
          return res.send(Buffer.from(result).toString('base64'));
        }

        //其他方式
        subscribeAccount.server.unshift(tip_date);
        if (app == 'v2rayn' || app == 'v2rayng' || app == 'kitsunebi') {
          result = subscribeAccount.server.map(s => {
            //支持v2
            if (s.v2ray === 1) {
              return v2ray(accountInfo, s)
            } else {
              return ss_shadowrocket(accountInfo, s);
            }
          }).join('\r\n');
          return res.send(Buffer.from(result).toString('base64'));
        }
        result = subscribeAccount.server.map(s => {
          return 'ss://' + Buffer.from(s.method + ':' + accountInfo.password + '@' + s.host + ':' + (accountInfo.port + + s.shift)).toString('base64') + '#' + encodeURIComponent(s.name);
        }).join('\r\n');
      }
      //SSR 模式
      if (accountInfo.connType === "SSR") {
        if (!app || type === 'ssr') {
          const singlePorts = await knex('account_plugin').select().where('is_multi_user', '>', 0);
          if ((!app && type === 'shadowrocket') || app === 'shadowrocket') {
            let remarks = (!showFlow ? '国际机场' : (config.plugins.webgui.site.split('//')[1] || config.plugins.webgui.site)) + '(右滑更新)';
            let status = '';// tip.admin ? tip.admin : ((tip.stop ? tip.stop : `当期流量：${tip.use}/${tip.sum}`) + `❤${tip.time}`);

            if (tip.admin) status = tip.admin;
            else if (tip.stop) status = tip.stop + `❤${tip.time}`;
            else if (accountInfo.hideFlow) status = tip.time;
            else if ((tip.use || tip.sum) && showFlow) status = `当期流量：${tip.use}/${tip.sum}❤${tip.time}`
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
            clashConfig.dns = { enable: true, nameserver: ['119.29.29.29', '223.5.5.5'] }
            let cs = { Proxy: [], proxies: [] };
            subscribeAccount.server.map(server => {
              if (server.v2ray || server.flag) {
                cs.Proxy.push(v2_clash(accountInfo, server));
                cs.proxies.push(server.name);
              }
            });
            clashConfig.Proxy = cs.Proxy;
            //clashConfig['Proxy Group']=[];
            clashConfig['Proxy Group'][0] = {
              name: 'Proxy',
              type: 'select',
              proxies: cs.proxies,
            };
            // for (const key in clash_group) {
            //   if (clash_group[key].list.length > 0) {
            //     clashConfig['Proxy Group'].push({
            //       name: clash_group[key].name,
            //       type: 'select',
            //       proxies: clash_group[key].list
            //     })
            //   }
            // }
            //return res.send(yaml.safeDump(clashConfig));
            res.setHeader('Content-Type', ' text/plain;charset=utf-8');
            res.setHeader("Content-Disposition", `attachment; filename=${encodeURIComponent(baseSetting.title)}.yaml`);
            //var dataBuffer = Buffer.concat([Buffer.from('\xEF\xBB\xBF', 'binary'), Buffer.from(yaml.safeDump(clashConfig))]);
            return res.send(Buffer.from(yaml.safeDump(clashConfig)));
          }
          if (app == 'v2rayng' || app == 'v2rayn' || app == 'kitsunebi') {
            subscribeAccount.server.unshift(tip_date);
          }
          for (const s of subscribeAccount.server) {
            if (s.v2ray === 1 || s.flag) {
              if (app === 'quan') {
                result += v2_quan(accountInfo, s, `${baseSetting.title}[${config.plugins.webgui.site.split('//')[1] || config.plugins.webgui.site}]`) + '\r\n';
              } else if (app === 'quanx') {
                result += v2_quanx(accountInfo, s) + '\r\n';
              } else {
                result += v2ray(accountInfo, s) + '\r\n';
              }
            }
          }
          if (app === 'quan') {
            let quan_info = {};
            if (tip.admin) quan_info.expire = 4070880000;
            else if ((tip.use || tip.sum) && showFlow) {
              quan_info.expire = accountInfo.data.expire / 1000;
              quan_info.download = flowNumber1024(flowInfo[0]);
              quan_info.total = flowNumber1024(accountInfo.data.flow + accountInfo.data.flowPack);
            } else quan_info.expire = accountInfo.data.expire / 1000;
            res.setHeader('Subscription-Userinfo', `upload=0; download=${quan_info.download || 0}; total=${quan_info.total || 0}; expire=${accountInfo.data.expire / 1000}`);
          }
          if (app === 'quanx') {
            res.setHeader('Content-Type', ' text/plain;charset=utf-8');
            res.setHeader("Content-Disposition", `attachment; filename=${encodeURIComponent(baseSetting.title)}.txt`);
            return res.send(Buffer.from(result));
          }
          if (app === 'shadowrocket') {
            let remarks = (!showFlow ? baseSetting.title : (config.plugins.webgui.site.split('//')[1] || config.plugins.webgui.site)) + '(右滑更新)';

            if (tip.admin) status = tip.admin;
            else if (tip.stop) status = tip.stop + `❤${tip.time}`;
            else if (accountInfo.hideFlow) status = tip.time;
            else if ((tip.use || tip.sum) && showFlow) status = `当期流量：${tip.use}/${tip.sum}❤${tip.time}`
            else status = `${tip.time}`

            result += `STATUS=${status}\r\nREMARKS=${remarks}`.toString('base64')
          }
        }
      }

      return res.send(Buffer.from(result).toString('base64'));
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

const flowNumber1024 = (number) => {
  if (number < 1000) return number * Math.pow(1.024, 0);
  else if (number < 1000 * 1000) return number * Math.pow(1.024, 1);
  else if (number < 1000 * 1000 * 1000) return number * Math.pow(1.024, 2);
  else if (number < 1000 * 1000 * 1000 * 1000) return number * Math.pow(1.024, 3);
};