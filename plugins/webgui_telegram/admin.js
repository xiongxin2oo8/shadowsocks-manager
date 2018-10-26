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
  if (number < 1000) return number + ' B';
  else if (number < 1000 * 1000) return (number / 1000).toFixed(0) + ' KB';
  else if (number < 1000 * 1000 * 1000) return (number / 1000000).toFixed(1) + ' MB';
  else if (number < 1000 * 1000 * 1000 * 1000) return (number / 1000000000).toFixed(3) + ' GB';
};

//每天消息推送
const isTelegram = config.plugins.webgui_telegram && config.plugins.webgui_telegram.use;
const day_push = async () => {
  let begin_time = moment(new Date()).hour(0).minute(0).second(0).millisecond(0).toDate().getTime();
  let end_time = new Date().getTime();
  //当日登录用户数
  const login = await knex('user').count('id as count').whereNot({
    type: 'admin'
  }).whereBetween('lastLogin', [begin_time, end_time]).then(success => success[0].count);
  const newuser = await knex('user').count('id as count').whereNot({
    type: 'admin'
  }).whereBetween('createTime', [begin_time, end_time]).then(success => success[0].count);
  //总账号数，使用订阅数
  const total_info = await knex('account_plugin').countDistinct('id as count').countDistinct('subscribe as sub_count').then(success => success[0]);
  //当日使用端口数
  const today_info = await knex('saveFlow').countDistinct('id as count').whereBetween('time', [begin_time, end_time]).then(success => success[0]);

  //各个服务器使用情况
  const server_info = await knex('saveFlow')
    .leftJoin('server', 'saveFlow.id', 'server.id')
    .countDistinct('saveFlow.accountId as count')
    .sum('saveFlow.flow as flow')
    .select('server.comment')
    .groupBy('saveFlow.id')
    .orderBy('server.comment')
    .whereBetween('time', [begin_time, end_time])
    .then(success => {
      return success.map(item => {
        return `${item.comment} 使用账号数：${item.count} 使用流量：${flowNumber(item.flow)}`;
      }).join('\n')
    });
  push(`主人，晚上好！`);
  push(`今天共注册了 ${newuser} 个新用户，共有 ${login} 个人，登录了网站`);
  push(`截止目前，共有账号数 ${total_info.count} 个，其中有 ${total_info.sub_count} 个正在使用订阅`);
  push(`今天，共有 ${today_info.count} 个账号使用服务`);
  push(`各个服务器使用情况：\n${server_info}`);
}
cron.minute(() => {
  if (isTelegram) {
    day_push();
  }
}, 1);

exports.push = push;