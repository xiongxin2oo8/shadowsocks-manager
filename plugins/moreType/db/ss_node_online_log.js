/* 在线用户数 */

const knex = appRequire('init/knex').knex;
const tableName = 'ss_node_online_log';

const createTable = async () => {
  const exist = await knex.schema.hasTable(tableName);
  if(exist) {
  
    return;
  }
  return knex.schema.createTable(tableName, function(table) {
    table.increments('id');
    table.integer('node_id');
    table.integer('online_user');
    table.bigInteger('log_time');
  });
};

exports.createTable = createTable;
