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

// Checks if user has associated active game session. If not, creates session row and returns ID.
// Params:
// 		:uname - username of the player requesting to host a game session
// Returns:
//		gameId - id number for new game session
app.get('/host-request/:uname', (req, res) => {
	const uname = req.params.uname

	DB.all(`SELECT * FROM GameSessions WHERE player1_username = :0 AND is_active = 1`, uname, (err, rows) => {
		if (err) {
			res.send({err})
			return
		}

		if (rows.length > 0) {
			res.send({err: "Game already in session", gameId: rows[0].id})
			return
		}

		DB.run(`INSERT INTO GameSessions (player1_username, is_active) VALUES (:0, :1);`, uname, 1, (err) => {
			if (err) {
				res.send({err})
				return
			}
	
			DB.get(`SELECT * FROM GameSessions ORDER BY ID DESC;`, (err, row) => {
				if (err)
					res.send({err})
				else
					res.send({gameId: row.id})
			})
		})
	})
})

// Allows user to join requested game session. Fails if session is full.
// Params:
// 		:gameId - ID of the game that the player is requesting to join 
// 		:uname  - Username of the player requesting to join
// Returns:
//		didConnect - Boolean reflecting whether player successfully joined or not
app.get('/join/:gameId/:uname', (req, res) => {
	const { gameId, uname } = req.params

	DB.get(`SELECT * FROM GameSessions WHERE id = :0`, gameId, (err, row) => {
		if (err) {
			res.send({err, didConnect: false})
			return
		}

		if (row) {
			const playerSlots = [row.player2_username, row.player3_username, row.player4_username]
			let playerColumn = null

			for (let i = 0; i < playerSlots.length; i++) {
				if (playerSlots[i] == null) {
					playerColumn = `player${i + 2}_username`
					break
				}
			}

			if (!playerColumn) {
				res.send({err: "Game session full", didConnect: false})
				return
			}

			DB.run(`UPDATE GameSessions SET ${playerColumn} = :0 WHERE ID = :1;`, uname, gameId, (err) => {
				if (err) {
					res.send({err, didConnect: false})
					return
				}
		
				res.send({didConnect: true})
			})
		}
	})
})

// Finds user names of players connected to a given game session
// Params:
//		:gameId - ID of game session to check
// Returns:
//		usernames - Array containing the usernames of all users in game session
app.get('/host-check/:gameId', (req, res) => {
	const gameId = req.params.gameId
	DB.get(`SELECT * FROM GameSessions WHERE id = :0`, gameId, (err, row) => {
		if (err) {
			res.send({err})
			return
		}

		if (row) {
			const usernames = [row.player1_username, row.player2_username, row.player3_username, row.player4_username]
			res.send({usernames})
		}
		else
			res.send({err: "Game session does not exist"})
	})
})

