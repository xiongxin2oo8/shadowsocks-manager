const knex = appRequire('init/knex').knex;
const tableName = 'server';
const config = appRequire('services/config').all();
const manager = appRequire('services/manager');
const log4js = require('log4js');
const logger = log4js.getLogger('flowSaver');

const createTable = async () => {
  const exist = await knex.schema.hasTable(tableName);
  if (exist) {
    const hasType = await knex.schema.hasColumn(tableName, 'type');
    if (!hasType) {
      await knex.schema.table(tableName, function (table) {
        table.string('type').defaultTo('Shadowsocks');
        table.string('key');
        table.string('net');
        table.integer('wgPort');
      });
    }
    const monthflow = await knex.schema.hasColumn(tableName, 'monthflow');
    if (!monthflow) {
      await knex.schema.table(tableName, function (table) {
        table.bigInteger('monthflow').defaultTo(0);
      });
    }
    const resetday = await knex.schema.hasColumn(tableName, 'resetday');
    if (!resetday) {
      await knex.schema.table(tableName, function (table) {
        table.integer('resetday').defaultTo(1);
      });
    }
    const singleMode = await knex.schema.hasColumn(tableName, 'singleMode');
    if (!singleMode) {
      await knex.schema.table(tableName, function (table) {
        table.string('singleMode');
      });
    }
    const v2ray = await knex.schema.hasColumn(tableName, 'v2ray');
    if (!v2ray) {
      await knex.schema.table(tableName, function (table) {
        table.integer('v2ray').defaultTo(0);
      });
    }
    const v2rayMethod = await knex.schema.hasColumn(tableName, 'v2rayMethod');
    if (!v2rayMethod) {
      await knex.schema.table(tableName, function (table) {
        table.string('v2rayMethod').defaultTo('chacha20-poly1305');
      });
    }
    const v2rayPort = await knex.schema.hasColumn(tableName, 'v2rayPort');
    if (!v2rayPort) {
      await knex.schema.table(tableName, function (table) {
        table.string('v2rayPort').defaultTo(801);
      });
    }
    //AlterID
    const v2rayAID = await knex.schema.hasColumn(tableName, 'v2rayAID');
    if (!v2rayAID) {
      await knex.schema.table(tableName, function (table) {
        table.integer('v2rayAID').defaultTo(0);
      });
    }
    const v2rayTLS = await knex.schema.hasColumn(tableName, 'v2rayTLS');
    if (!v2rayTLS) {
      await knex.schema.table(tableName, function (table) {
        table.integer('v2rayTLS').defaultTo(0);
      });
    }
    const v2rayNet = await knex.schema.hasColumn(tableName, 'v2rayNet');
    if (!v2rayNet) {
      await knex.schema.table(tableName, function (table) {
        table.string('v2rayNet');
      });
    }
    const v2rayPath = await knex.schema.hasColumn(tableName, 'v2rayPath');
    if (!v2rayPath) {
      await knex.schema.table(tableName, function (table) {
        table.string('v2rayPath');
      });
    }
    const v2rayHost = await knex.schema.hasColumn(tableName, 'v2rayHost');
    if (!v2rayHost) {
      await knex.schema.table(tableName, function (table) {
        table.string('v2rayHost');
      });
    }
    const sort = await knex.schema.hasColumn(tableName, 'sort');
    if (!v2rayHost) {
      await knex.schema.table(tableName, function (table) {
        table.integer('sort').defaultTo(99);
      });
    }
  }
  else {
    await knex.schema.createTable(tableName, function (table) {
      table.increments('id');
      table.string('type').defaultTo('Shadowsocks');
      table.string('name');
      table.string('host');
      table.integer('port');
      table.string('password');
      table.float('scale').defaultTo(1);
      table.string('method').defaultTo('aes-256-cfb');
      table.string('comment').defaultTo('');
      table.integer('shift').defaultTo(0);
      table.bigInteger('monthflow').defaultTo(0);
      table.integer('resetday').defaultTo(1);
      table.string('key');
      table.string('net');
      table.integer('wgPort');
      table.string('singleMode ');
      table.integer('v2ray');
      table.string('v2rayMethod');
      table.integer('v2rayPort');
      table.integer('v2rayAID');
      table.integer('v2rayTLS');
      table.string('v2rayNet');
      table.string('v2rayPath');
      table.string('v2rayHost');
      table.integer('sort').defaultTo(99);
    });
  }
  const list = await knex('server').select(['name', 'host', 'port', 'password']);
  if (list.length === 0 && config.manager) {
    const host = config.manager.address.split(':')[0];
    const port = +config.manager.address.split(':')[1];
    const password = config.manager.password;
    // await manager.send({
    //   command: 'flow',
    //   options: {
    //     clear: false,
    //   },
    // }, {
    //   host,
    //   port,
    //   password,
    // }).catch(() => {
    //   logger.error(`connect to server ${password}@${host}:${port} fail.`);
    //   // process.exit(1);
    // });
    await knex('server').insert({
      name: 'default',
      host,
      port,
      password,
    });
  }
  return;
};

exports.createTable = createTable;
