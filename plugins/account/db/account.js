const knex = appRequire('init/knex').knex;
const tableName = 'account_plugin';

const createTable = async() => {
  const exist = await knex.schema.hasTable(tableName);
  if(exist) {
    const hasConnType = await knex.schema.hasColumn(tableName, 'connType');
    const hasMethod = await knex.schema.hasColumn(tableName, 'method');
    const hasProtocol = await knex.schema.hasColumn(tableName, 'protocol');
    const hasProtocol_param = await knex.schema.hasColumn(tableName, 'protocol_param');
    const hasObfs = await knex.schema.hasColumn(tableName, 'obfs');
    const hasObfs_param = await knex.schema.hasColumn(tableName, 'obfs_param');
    const hasLastSubTime = await knex.schema.hasColumn(tableName, 'lastSubscribeTime');
    const hasColumnUUID = await knex.schema.hasColumn(tableName, 'uuid');
    if(!hasLastSubTime) {
      await knex.schema.table(tableName, function(table) {
        table.bigInteger('lastSubscribeTime');
      });
    }
    if(!hasConnType) {
      await knex.schema.table(tableName, function(table) {
        table.string('connType');
      });
    }
    if(!hasMethod) {
      await knex.schema.table(tableName, function(table) {
        table.string('method');
      });
    }
    if(!hasProtocol) {
      await knex.schema.table(tableName, function(table) {
        table.string('protocol');
      });
    }
    if(!hasProtocol_param) {
      await knex.schema.table(tableName, function(table) {
        table.string('protocol_param');
      });
    }
    if(!hasObfs) {
      await knex.schema.table(tableName, function(table) {
        table.string('obfs');
      });
    }
    if(!hasObfs_param) {
      await knex.schema.table(tableName, function(table) {
        table.string('obfs_param');
      });
    }
    const hasKey = await knex.schema.hasColumn(tableName, 'key');
    if(!hasKey) {
      await knex.schema.table(tableName, function(table) {
        table.string('key');
      });
    }
    const results = await knex(tableName).whereNull('orderId');
    for(const result of results) {
      await knex(tableName).update({ orderId: result.type === 1 ? 0 : result.type }).where({ id: result.id });
    }    
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
    //同时在线设备数
    const hasConnector = await knex.schema.hasColumn(tableName, 'connector');
    if (!hasConnector) {
      await knex.schema.table(tableName, function (table) {
        table.integer('connector').defaultTo(2);
      });
    }
    return;
  }
  return knex.schema.createTable(tableName, function(table) {
    table.increments('id');
    table.integer('type');
    table.integer('orderId');
    table.integer('userId');
    table.string('server');
    table.integer('port').unique();
    table.string('password');
    table.string('key');
    table.string('data');
    table.string('subscribe');
    table.bigInteger('lastSubscribeTime');
    table.integer('status');
    table.integer('autoRemove').defaultTo(0);
    table.bigInteger('autoRemoveDelay').defaultTo(0);
    table.integer('multiServerFlow').defaultTo(0);
    table.integer('active').defaultTo(1);
    table.string('connType');
    table.string('method');
    table.string('protocol');
    table.string('protocol_param');
    table.string('obfs');
    table.string('obfs_param');
    table.string('uuid');
    table.string('is_multi_user').defaultTo(0);
    table.integer('connector').defaultTo(2);//同时在线设备数
  });
};

exports.createTable = createTable;
