const { Model, DataTypes } = require('sequelize');
const sequelize = require('../db.cjs');

class Bot extends Model{}

Bot.init({
	id : { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	numero : DataTypes.TEXT,
    id_company : DataTypes.TEXT,
    telefono_pedidos : DataTypes.TEXT,
    id_order : DataTypes.TEXT,
    name : DataTypes.TEXT,
    unread : DataTypes.INTEGER,
    id_point : DataTypes.INTEGER,
    attention : DataTypes.BOOLEAN,
    created_at: DataTypes.TEXT,
    updated_at: DataTypes.TEXT
},
{
	sequelize,
	modelName: "bot",
	timestamps: false
})

module.exports = Bot;