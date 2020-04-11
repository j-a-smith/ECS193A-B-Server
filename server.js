const sqlite3 = require('sqlite3').verbose()

const DB_PATH = './sqlite.db'

const DB = new sqlite3.Database(DB_PATH, function(err) {
	if (err) {
		console.log(err)
		return
	}
	console.log('Connected to ' + DB_PATH + ' database.')
});

dbSchema = `
CREATE TABLE IF NOT EXISTS Users (
	id integer NOT NULL PRIMARY KEY,
	login text NOT NULL UNIQUE,
	password text NOT NULL UNIQUE,
	email text NOT NULL UNIQUE,
	first_name text,
	last_name text
);

CREATE TABLE IF NOT EXISTS Blogs (
	id integer NOT NULL PRIMARY KEY,
	user_id integer NOT NULL UNIQUE,
	blog text,
	title text NOT NULL,
	publish_data date,
	FOREIGN KEY (user_id) REFERENCES Users (id)
);`

DB.exec(dbSchema, function(err) {
	if (err) {
		console.log(err)
	}
});

DB.close();
