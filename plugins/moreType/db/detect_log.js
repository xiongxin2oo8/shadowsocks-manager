/* 审计记录 */

const knex = appRequire('init/knex').knex;
const tableName = 'detect_log';

const createTable = async () => {
  const exist = await knex.schema.hasTable(tableName);
  if(exist) {
  
    return;
  }
  return knex.schema.createTable(tableName, function(table) {
    table.increments('id');
    table.integer('user_id');
    table.integer('list_id');
    table.integer('node_id');
    table.bigInteger('datetime');
  });
};

exports.createTable = createTable;
