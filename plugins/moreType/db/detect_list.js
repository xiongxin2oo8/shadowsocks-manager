/* 审计规则 */

const knex = appRequire('init/knex').knex;
const tableName = 'detect_list';

const createTable = async () => {
  const exist = await knex.schema.hasTable(tableName);
  if(exist) {
  
    return;
  }
  return knex.schema.createTable(tableName, function(table) {
    table.increments('id');
    table.string('name');
    table.string('text');
    table.string('regex');
    table.integer('type');
  });
};

exports.createTable = createTable;
