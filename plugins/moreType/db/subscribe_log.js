/* 订阅记录 */

const knex = appRequire('init/knex').knex;
const tableName = 'subscribe_log';

const createTable = async () => {
  const exist = await knex.schema.hasTable(tableName);
  if(exist) {
  
    return;
  }
  return knex.schema.createTable(tableName, function(table) {
    table.increments('id');
    table.integer('accountId');
    table.integer('userid');
    table.string('ip');
    table.bigInteger('datetime');
  });
};

exports.createTable = createTable;
