module.exports = {
	database: {
		username: 'app',
		password: 'mikaxyn8blnok0as',
		database: 'vinapp_produccion',
	  host: 'db-postgresql-nyc1-vinapp-jul-9-backup-do-user-4130146-0.b.db.ondigitalocean.com',
	  dialect: 'postgres',
	  dialectOptions: {
			ssl: {
	      require: true,
		    rejectUnauthorized: false
	    }
		},
    logging: false,
    port: 25060
	}
}