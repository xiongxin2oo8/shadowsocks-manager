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
    table.integer('is_multi_user').defaultTo(0);
    table.index(['id', 'port'], 'index');
  });
};

exports.createTable = createTable;
