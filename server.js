const express = require('express')
const sqlite3 = require('sqlite3').verbose()

const app = express()
const port = 3000

const DB_PATH = './sqlite.db'
const dbSchema = `
CREATE TABLE IF NOT EXISTS GameSessions (
	id integer PRIMARY KEY NOT NULL,
	player1_username text NOT NULL,
	player2_username text,
	player3_username text,
	player4_username text,
	is_active integer NOT NULL CHECK(is_active IN(0, 1))
);`

const DB = new sqlite3.Database(DB_PATH, function(err) {
	if (err) {
		console.log('Failed to load database: ' + err)
		return
	}
	console.log('Connected to ' + DB_PATH + ' database.')

	DB.exec(dbSchema, function(err) {
		if (err) {
			console.log('Failed to run schema: ' + err)
		}
	});
});

app.listen(port, () => console.log(`Listening at http://localhost:${port}`))

app.get('/', (req, res) => res.send('Welcome to the game server for None to Mourn!'))

app.get('/host-request/:uname', (req, res) => {
	const uname = req.params.uname
	DB.run(`INSERT INTO GameSessions (player1_username, is_active) VALUES (:0, :1);`, uname, 1, (err) => {
		if (err) {
			res.send("INPUT failed")
			console.log(err)
			return
		}

		DB.get(`SELECT * FROM GameSessions ORDER BY ID DESC;`, (err, row) => {
			if (err)
				console.log(err)
			else
				res.send({gameId: row.id})
		})
	})
})

app.get('/join/:gameId/:uname', (req, res) => {
	const { gameId, uname } = req.params

	DB.get(`SELECT * FROM GameSessions WHERE id = :0`, gameId, (err, row) => {
		if (err) {
			res.send({err, didConnect: false})
			return
		}

		if (row) {
			const playerSlots = [row.player1_username, row.player2_username, row.player3_username, row.player4_username]
			let playerColumn = null
			for (let i = 0; i < playerSlots.length; i++) {
				if (playerSlots[i] == null) {
					playerColumn = `player${i}_username`
					break
				}
			}

			if (!playerColumn) {
				res.send({err: "Game session full", didConnect: false})
				return
			}

			DB.run(`INSERT INTO GameSessions (${playerColumn}) VALUES (:0) WHERE ID = :1;`, uname, gameId, (err) => {
				if (err) {
					res.send({err, didConnect: false})
					return
				}
		
				res.send({didConnect: true})
			})
		}
	})
})

// app.get('/host-check/:gameId', (req, res) => {
// 	const gameId = req.params.gameId
// 	DB.get(`SELECT * FROM Users WHERE id = :0`, gameId, (err, row) => {
// 		if (err) {
// 			res.send("SELECT failed")
// 			console.log(err)
// 		}
// 		else
// 			res.send(row)
// 	})
// })

