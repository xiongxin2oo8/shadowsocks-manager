/* 在线ip */

const knex = appRequire('init/knex').knex;
const tableName = 'alive_ip';

const createTable = async () => {
  const exist = await knex.schema.hasTable(tableName);
  if(exist) {
  
    return;
  }
  return knex.schema.createTable(tableName, function(table) {
    table.increments('id');
    table.integer('nodeid');
    table.integer('userid');
    table.string('ip');
    table.bigInteger('datetime');
  });
};

exports.createTable = createTable;
