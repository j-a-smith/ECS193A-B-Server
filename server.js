const express = require('express')
const sqlite3 = require('sqlite3').verbose()

const app = express()
// const port = 59435
// const hostName = 'server162.site'
const port = 3000
const hostName = 'localhost'

const GAME_STATES = ['init', 'bases', 'game', 'end']

const DB_PATH = './sqlite.db'
const dbSchema = `
CREATE TABLE IF NOT EXISTS GameSessions (
	id integer PRIMARY KEY NOT NULL,
	game_state integer NOT NULL,
	player1_username text NOT NULL,
	player2_username text,
	player3_username text,
	player4_username text,
	player1_didPlaceBase integer NOT NULL CHECK(is_active IN(0, 1)),
	player2_didPlaceBase integer NOT NULL CHECK(is_active IN(0, 1)),
	player3_didPlaceBase integer NOT NULL CHECK(is_active IN(0, 1)),
	player4_didPlaceBase integer NOT NULL CHECK(is_active IN(0, 1)),
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

app.listen(port, hostName, () => console.log(`Listening at http://${hostName}:${port}`))

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

		DB.run(`INSERT INTO GameSessions (player1_username, game_state, is_active, player1_didPlaceBase,
				player2_didPlaceBase, player3_didPlaceBase, player4_didPlaceBase) VALUES (:0, :1, :2, :3, :4, :5, :6);`, 
				uname, 0, 1, 0, 0, 0, 0, (err) => {
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
			res.send({
				player1: row.player1_username,
				player2: row.player2_username,
				player3: row.player3_username,
				player4: row.player4_username
			})
		}
		else
			res.send({err: "Game session does not exist"})
	})
})

// Alerts server that specific game session should move to base placement.
// Params:
// 		:gameId - ID of the game session 
// 		:uname  - Username of the player making request
app.get('/start-game/:gameId/:uname', (req, res) => {
	const { gameId, uname } = req.params

	DB.run(`UPDATE GameSessions SET game_state = 1 WHERE id = :0 AND player1_username = :1;`, gameId, uname, (err) => {
		if (err) {
			res.send("Error: game session or player not found")
			return
		}

		res.send("Success")
	})
})


// Alerts server that a specific user has placed their base
// Params:
//		:gameId - ID of game session to check
//		:uname  - Player's username
app.get('/place-base/:gameId/:uname', (req, res) => {
	const { gameId, uname } = req.params
	let playerColumn = null

	DB.get(`SELECT * FROM GameSessions WHERE id = :0`, gameId, (err, row) => {
		if (err) {
			res.send({err})
			return
		}

		var numBasesPlaced = 1

		if (row) {
			const playerSlots = [row.player1_username, row.player2_username, row.player3_username, row.player4_username]
			const didPlayersSetBase = [row.player1_didPlaceBase, row.player2_didPlaceBase, row.player3_didPlaceBase, row.player4_didPlaceBase]
			
			for (let i = 0; i < playerSlots.length; i++) {
				if (playerSlots[i] == uname) 
					playerColumn = i + 1
				else
					numBasesPlaced += didPlayersSetBase[i]
			}

			if (playerColumn == null) {
				res.send({err: "Player not found"})
				return
			}
		}
		else {
			res.send({err: "Game session not found"})
			return
		}

		var gameStateNum = (numBasesPlaced == 4) ? 2 : 1

		DB.run(`UPDATE GameSessions SET player${playerColumn}_didPlaceBase = 1, game_state = :0 WHERE id = :1;`, gameStateNum, gameId, (err) => {
			if (err) 
				res.send({err})
			else
				res.send("Success")
		})
	})
})

// Reports game state of specific game session
// Params:
//		:gameId - ID of game session to check
// Returns:
//		gameState - string denoting game state
app.get('/game-state-check/:gameId', (req, res) => {
	const gameId = req.params.gameId
	DB.get(`SELECT * FROM GameSessions WHERE id = :0`, gameId, (err, row) => {
		if (err) {
			res.send({err})
			return
		}

		if (row) {
			const gameState = GAME_STATES[row.game_state]
			res.send({gameState})
		}
		else
			res.send({err: "Game session does not exist"})
	})
})


