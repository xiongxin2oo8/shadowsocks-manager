const telegram = appRequire('plugins/webgui_telegram/index').telegram;
const knex = appRequire('init/knex').knex;
const cron = appRequire('init/cron');
const moment = require('moment');
const config = appRequire('services/config').all();

const getAdmin = async () => {
  const exists = await knex('user').where({
    type: 'admin'
  }).then(success => success[0]);
  if (!exists || !exists.telegram) {
    return;
  }
  return exists.telegram;
};

const push = async (message) => {
  const telegramId = await getAdmin();
  telegramId && telegram.emit('send', +telegramId, message);
};

const flowNumber = (number) => {
  if (number < 1000) return number + 'B';
  else if (number < 1000 * 1000) return (number / 1000).toFixed(0) + 'K';
  else if (number < 1000 * 1000 * 1000) return (number / 1000000).toFixed(1) + 'M';
  else if (number < 1000 * 1000 * 1000 * 1000) return (number / 1000000000).toFixed(2) + 'G';
  else return (number / 1000000000000).toFixed(3) + 'T';
};

//每天消息推送
const isTelegram = config.plugins.webgui_telegram && config.plugins.webgui_telegram.use;
const day_push = async (flag) => {
  let begin_time = moment(new Date()).hour(0).minute(0).second(0).millisecond(0).toDate().getTime();
  let end_time = new Date().getTime();
  //提醒前一天
  if (flag === 1) {
    end_time = begin_time;
    begin_time = moment(new Date()).add(-1, 'd').hour(0).minute(0).second(0).millisecond(0).toDate().getTime();
  }
  //当日登录用户数
  const login = await knex('user').count('id as count').whereNot({
    type: 'admin'
  }).whereBetween('lastLogin', [begin_time, end_time]).then(success => success[0].count);
  const newuser = await knex('user').count('id as count').whereNot({
    type: 'admin'
  }).whereBetween('createTime', [begin_time, end_time]).then(success => success[0].count);
  //总账号数
  const total_info = await knex('account_plugin').countDistinct('id as count').then(success => success[0]);
  //当日使用端口数
  const today_info = await knex('saveFlow').countDistinct('accountId as count').whereBetween('time', [begin_time, end_time]).then(success => success[0]);
  //当日更新订阅数
  const subscribe_info = await knex('account_plugin').count('id as count').whereBetween('lastSubscribeTime', [begin_time, end_time]).then(success => success[0]);
  //总流量
  //各个服务器使用情况
  const server_info = await knex('saveFlowHour')
    .leftJoin('server', 'saveFlow.id', 'server.id')
    .countDistinct('saveFlowHour.accountId as count')
    .sum('saveFlowHour.flow as sumflow')
    .select('server.name')
    .groupBy('saveFlowHour.id')
    .whereBetween('time', [begin_time, end_time - 1])
    .orderBy('sumflow', 'desc')
    .then(success => {
      let allflow = 0;
      let list = '';
      for (let item of success) {
        allflow += item.sumflow || 0;
        list += `${item.name}  ${item.count}/${flowNumber(item.sumflow)}\n`;
      }
      return { allflow: allflow, list: list }
    });
  //订单情况
  const pay_info = await knex('alipay')
    .sum('amount as amount')
    .count('id as count')
    .whereBetween('createTime', [begin_time, end_time])
    .where('status', 'FINISH')
    .then(success => success[0]);
  let msg = `主人，${flag === 1 ? '早' : '晚'}上好！`;
  msg += `\n截止目前，共有账号数 ${total_info.count} 个`;
  msg += `\n${flag === 1 ? '昨' : '今'}天:`;
  msg += `\n共注册了 ${newuser} 个新用户`;
  msg += `\n共有 ${subscribe_info.count} 人更新订阅`
  msg += `\n共有 ${login} 个人登录了网站`;
  msg += `\n共产生 ${pay_info.count} 个订单，筹得 ${(pay_info.amount || 0).toFixed(2)} 元`;
  msg += `\n共有 ${today_info.count} 个账号使用了 ${flowNumber(server_info.allflow)} 流量`;
  msg += `\n各服务器使用情况：\n${server_info.list}`;
  await push(msg);
}
//今天(提醒当天)
cron.cron(() => {
  if (isTelegram) {
    day_push(0);
  }
}, 'day_push', '45 22 * * *', 24 * 3600);
//昨天(第二天提醒前一天)
cron.cron(() => {
  if (isTelegram) {
    day_push(1);
  }
}, 'day_push2', '00 06 * * *', 24 * 3600);

exports.push = push;
