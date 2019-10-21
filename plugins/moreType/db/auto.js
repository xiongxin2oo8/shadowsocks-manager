/* ? */

const knex = appRequire('init/knex').knex;
const tableName = 'auto';

const createTable = async () => {
  const exist = await knex.schema.hasTable(tableName);
  if(exist) {
  
    return;
  }
  return knex.schema.createTable(tableName, function(table) {
    table.increments('id');
    table.integer('type');
    table.string('value');
    table.string('sign');
    table.bigInteger('datetime');
  });
};

exports.createTable = createTable;
