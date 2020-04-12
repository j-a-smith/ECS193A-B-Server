const express = require('express')
const sqlite3 = require('sqlite3').verbose()

const app = express()
const port = 3000
const DB_PATH = './sqlite.db'

const DB = new sqlite3.Database(DB_PATH, function(err) {
	if (err) {
		console.log(err)
		return
	}
	console.log('Connected to ' + DB_PATH + ' database.')
});

app.get('/', (req, res) => res.send('Hello World!'))

app.get('/test', (req, res) => {
	DB.get(`SELECT * FROM Users WHERE id = 1`, null, (err, row) => {
		console.log(row)
	})
	res.send('Select complete')
})

app.listen(port, () => console.log(`Example app listening at http://localhost:${port}`))

dbSchema = `
CREATE TABLE IF NOT EXISTS Users (
	id integer PRIMARY KEY,
	user_name text,
	is_active integer CHECK(is_active IN(0, 1))
);`

DB.exec(dbSchema, function(err) {
	if (err) {
		console.log(err)
	}
});

DB.run(`INSERT INTO Users (user_name) VALUES ('george')`, null, (err, row) => {
	if (err) {
		console.log(err)
	}
	else {
		console.log('INPUT Succeeded')
	}
})



DB.close();
