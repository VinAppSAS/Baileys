const { Sequelize } = require('sequelize');
const { database } = require('../config.cjs');

const sequelize = new Sequelize(
	database.database,
	database.username,
	database.password,{
		host: database.host,
		port: database.port,
		dialect: database.dialect,
		dialectOptions: database.dialectOptions,
		logging: database.logging
	},
);
module.exports = sequelize;