const { Model, DataTypes } = require('sequelize');
const sequelize = require('../db.cjs');

class BotDetail extends Model{}

BotDetail.init({
	id_bot_detail : { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    id_bot : DataTypes.INTEGER,
    id_point : DataTypes.INTEGER,
    mensaje : DataTypes.TEXT,
    from_me: DataTypes.BOOLEAN,
    created_at: DataTypes.TEXT
},
{
	sequelize,
	modelName: "bot_detail",
	timestamps: false
})

module.exports = BotDetail;