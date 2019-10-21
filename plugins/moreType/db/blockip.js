/* ip黑名单 */

const knex = appRequire('init/knex').knex;
const tableName = 'blockip';

const createTable = async () => {
  const exist = await knex.schema.hasTable(tableName);
  if(exist) {
  
    return;
  }
  return knex.schema.createTable(tableName, function(table) {
    table.increments('id');
    table.integer('nodeid');
    table.string('ip');
    table.bigInteger('datetime');
  });
};

exports.createTable = createTable;
