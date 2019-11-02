const knex = appRequire('init/knex').knex;
const tableName = 'ssr_user';

const createTable = async () => {
  const exist = await knex.schema.hasTable(tableName);
  if(exist) {
    // await knex.schema.table(tableName, function(table) {
    //   table.index('id');
    //   table.index('accountId');
    // });
    const hasColumnUUID = await knex.schema.hasColumn(tableName, 'uuid');
    if(!hasColumnUUID) {
      await knex.schema.table(tableName, function(table) {
        table.string('uuid');
      });
    }
    const is_multi_user = await knex.schema.hasColumn(tableName, 'is_multi_user');
    if(!is_multi_user) {
      await knex.schema.table(tableName, function(table) {
        table.integer('is_multi_user').defaultTo(0);
      });
    }
    const node_speedlimit = await knex.schema.hasColumn(tableName, 'node_speedlimit');
    if(!node_speedlimit) {
      await knex.schema.table(tableName, function(table) {
        table.float('node_speedlimit').defaultTo(0);
      });
    }
    const forbidden_ip = await knex.schema.hasColumn(tableName, 'forbidden_ip');
    if(!forbidden_ip) {
      await knex.schema.table(tableName, function(table) {
        table.string('forbidden_ip');
      });
    }
    const forbidden_port = await knex.schema.hasColumn(tableName, 'forbidden_port');
    if(!forbidden_port) {
      await knex.schema.table(tableName, function(table) {
        table.string('forbidden_port');
      });
    }
    const disconnect_ip = await knex.schema.hasColumn(tableName, 'disconnect_ip');
    if(!disconnect_ip) {
      await knex.schema.table(tableName, function(table) {
        table.string('disconnect_ip');
      });
    }
    const hasConnector = await knex.schema.hasColumn(tableName, 'connector');
    if(!hasConnector) {
      await knex.schema.table(tableName, function(table) {
        table.integer('connector');
      });
    }
    return;
  }
  return knex.schema.createTable(tableName, function(table) {
    table.increments('id');
    table.string('passwd');
    table.bigInteger('t');
    table.bigInteger('u');
    table.bigInteger('d');
    table.bigInteger('transfer_enable');
    table.integer('accountId');
    table.integer('serverId');
    table.integer('port');
    table.integer('switch');
    table.integer('enable');
    table.string('method');
    table.string('protocol');
    table.string('protocol_param');
    table.string('obfs');
    table.string('obfs_param');
    table.string('uuid');
    table.integer('connector');//连接设备数
    table.integer('is_multi_user').defaultTo(0);//是否是单端口承载用户
    table.float('node_speedlimit').defaultTo(0);;//节点限速/Mbps
    table.string('forbidden_ip');//禁止用户访问的IP列表  127.0.0.0/8,::1/128
    table.string('forbidden_port');//禁止用户访问的端口 半角英文逗号分割，支持端口段
    table.string('disconnect_ip');//封禁的ip
    table.index(['id', 'port'], 'index');
  });
};

exports.createTable = createTable;
