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
  push('主人，晚上好！');
  let begin_time = moment(new Date()).hour(0).minute(0).second(0).millisecond(0).toDate().getTime();
  let end_time = new Date().getTime();
  //当日登录用户数
  const login = await knex('user').count('id as count').whereNot({
    type: 'admin'
  }).whereBetween('lastLogin', [begin_time, end_time]).then(success => success[0].count);
  const newuser = await knex('user').count('id as count').whereNot({
    type: 'admin'
  }).whereBetween('createTime', [begin_time, end_time]).then(success => success[0].count);
  push(`今天共注册了 ${newuser} 个新用户，共有 ${login} 个人，登录了网站`);
  //总账号数，使用订阅数
  await knex('account_plugin').countDistinct('id as count').countDistinct('subscribe as sub_count').then(success => {
    push(`截止目前，总共有 ${success[0].count} 个账号使用了我们的服务，其中订阅 ${success[0].sub_count} 个`);
  });
  //当日使用端口数
  await knex('saveflow').countDistinct('id as count').whereBetween('time', [begin_time, end_time]).then(success => {
    push(`今天，总共有 ${success[0].count} 个账号在使用中`);
  });

  //各个服务器使用情况
  const server = await knex('saveflow')
    .leftJoin('server', 'saveflow.id', 'server.id')
    .countDistinct('saveflow.accountId as count')
    .sum('saveflow.flow as flow')
    .select('server.name')
    .groupBy('saveflow.id')
    .whereBetween('time', [begin_time, end_time])
    .then(success => {
      let msg = success.map(item => {
        return `${item.name} 使用账号数：${item.count} 使用流量：${flowNumber(item.flow)}`;
      }).join('\r\n')
      push(`各个服务器使用情况：\r\n${msg}`);
    });
}
cron.minute(() => {
  if (isTelegram) {
    day_push();
  }
}, 1);

exports.push = push;