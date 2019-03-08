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
  });
};

exports.createTable = createTable;
