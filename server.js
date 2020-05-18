const express = require('express')
const sqlite3 = require('sqlite3').verbose()
const path = require('path')
const bodyParser = require('body-parser')
const app = express()
var itemAttributes = require('./itemAttributes.json')
const port = 59435
const hostName = 'server162.site'
// const port = 3000
// const hostName = 'localhost'

const GAME_STATES = ['init', 'bases', 'game', 'end']

const DB_PATH = './sqlite.db'
const dbSchema = `
CREATE TABLE IF NOT EXISTS GameSessions (
	id integer PRIMARY KEY NOT NULL,
	game_state integer NOT NULL,
	game_name text NOT NULL,
	password text NOT NULL UNIQUE,
	player1_username text NOT NULL,
	player2_username text,
	player3_username text,
	player4_username text,
	player1_didPlaceBase integer NOT NULL CHECK(is_active IN(0, 1)),
	player2_didPlaceBase integer NOT NULL CHECK(is_active IN(0, 1)),
	player3_didPlaceBase integer NOT NULL CHECK(is_active IN(0, 1)),
	player4_didPlaceBase integer NOT NULL CHECK(is_active IN(0, 1)),
	ack_count integer NOT NULL DEFAULT 0,
	is_active integer NOT NULL CHECK(is_active IN(0, 1))
);

CREATE TABLE IF NOT EXISTS Items (
	id integer PRIMARY KEY NOT NULL,
	item_name text UNIQUE NOT NULL,
	png_name text,
	animation text,
	damage text
);

CREATE TABLE IF NOT EXISTS Inventories (
	id integer PRIMARY KEY NOT NULL,
	game_id integer NOT NULL,
	item_id integer NOT NULL,
	player_name text NOT NULL,
		FOREIGN KEY (game_id) REFERENCES GameSessions(id),
		FOREIGN KEY (item_id) REFERENCES Items(id)
);`


// Zombie stuff as global for now then move to data base
class ZombieSeed {

	constructor(id) {
		this.id = id;
		this.angle = Math.floor((Math.random() * 360));
		this.distance = Math.random() * (2.0 - 1.5) + 1.5;
		this.positionX = this.distance * Math.cos(this.angle * Math.PI / 180);
		this.positionY = -0.4;
		this.positionZ = this.distance * Math.sin(this.angle * Math.PI / 180);
		
	}

}

class Seeds {
	constructor(wave, seedArray) {
		this.waveNumber = wave;
		this.zombieWave = seedArray;
	}
}

var globalWave;

var waveDataBase = {}

const DB = new sqlite3.Database(DB_PATH, function(err) {
	if (err) {
		console.log('Failed to load database: ' + err)
		return
	}
	console.log('Connected to ' + DB_PATH + ' database.')

	DB.exec('PRAGMA foreign_keys = ON;', function(error)  {
        if (error){
            console.error("Failed to enable foreign keys")
        } else {
            console.log("Enabled foreign key enforcement")
        }
    });

	DB.exec(dbSchema, function(err) {
		if (err) {
			console.log('Failed to run schema: ' + err)
		}
	});

	for (var item_name in itemAttributes) {
		let attributes = itemAttributes[item_name]
		DB.run(`INSERT INTO Items (item_name, png_name, animation, damage)
		SELECT :0, :1, :2, :3 WHERE NOT EXISTS (SELECT * FROM Items WHERE item_name = :0);`,
		item_name, attributes["png"], attributes["animation"], attributes["damage"], (err) => {
			if (err)
				console.log('Error adding item: ', err)
		})
	}
});
//app.use(bodyParser.text());
//app.use(bodyParser.urlencoded( {extended: true}));
//app.use(bodyParser.json());
//app.use(bodyParser.raw());
app.use(bodyParser.json());
app.listen(port, hostName, () => console.log(`Listening at http://${hostName}:${port}`))

app.get('/', (req, res) => res.send('Welcome to the game server for None to Mourn!'))

// Returns all game session names and ids
// Returns:
//		gameInfo - JSON with game names mapped to game ids
app.get('/fetch-active-games', (req, res) => {
	DB.all(`SELECT * FROM GameSessions WHERE is_active = 1`, (err, rows) => {
		if (err) {
			res.send({err})
			return
		}

		var gameInfo = {}
		for (var i in rows) {
			gameInfo[rows[i].game_name] = rows[i].id
		}

		res.send(gameInfo)
	})
})


// Checks if user has associated active game session. If not, creates session row and returns ID.
// Params:
// 		:uname - username of the player requesting to host a game session
// Returns:
//		gameId - id number for new game session
app.get('/host-request/:uname/:gname/:pw', (req, res) => {
	const {uname, gname, pw} = req.params

	DB.all(`SELECT * FROM GameSessions WHERE player1_username = :0 AND is_active = 1`, uname, (err, rows) => {
		if (err) {
			res.send({err})
			return
		}

		if (rows.length > 0) {
			res.send({err: "Game already in session", gameId: rows[0].id})
			return
		}

		DB.run(`INSERT INTO GameSessions (game_name, password, player1_username, game_state, is_active, player1_didPlaceBase,
				player2_didPlaceBase, player3_didPlaceBase, player4_didPlaceBase) VALUES (:0, :1, :2, :3, :4, :5, :6, :7, :8);`, 
				gname, pw, uname, 0, 1, 0, 0, 0, 0, (err) => {
			if (err) {
				res.send({err})
				return
			}
	
			DB.get(`SELECT * FROM GameSessions ORDER BY ID DESC;`, (err, row) => {
				if (err) {
					res.send({err})
					return
				}

				let game_id = row.id

				DB.get(`SELECT id FROM Items WHERE item_name = "bullet";`, (err, row) => {
					if (err) {
						res.send({err})
						return
					}

					let item_id = row.id

					DB.run(`INSERT INTO Inventories (game_id, item_id, player_name) 
								VALUES (:0, :1, :2);`, game_id, item_id, uname, (err) => {
						if (err) {
						res.send({err})
							return
						}

						res.send({gameId: game_id})
					})
				})
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
app.get('/join/:gameId/:uname/:pw', (req, res) => {
	const { gameId, uname, pw } = req.params

	DB.get(`SELECT * FROM GameSessions WHERE id = :0`, gameId, (err, row) => {
		if (err) {
			res.send({err, didConnect: false})
			return
		}

		if (row) {

			if (row.game_state > 0) {
				res.send({err: "Game session already started"})
				return
			}

			if (row.password != pw) {
				res.send({err: "Incorrect password"})
				return
			}

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

				DB.get(`SELECT id FROM Items WHERE item_name = "bullet";`, (err, row) => {
					if (err) {
						res.send({err})
						return
					}

					let itemId = row.id
		
					DB.run(`INSERT INTO Inventories (game_id, item_id, player_name) 
								VALUES (:0, :1, :2);`, gameId, itemId, uname, (err) => {
						if (err) {
							res.send({err, didConnect: false})
							return
						}
						
						res.send({didConnect: true})
					})
				})
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

// Alerts server that specific game session should move to base placement
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
		var numPlayersJoined = 0

		if (row) {
			const playerSlots = [row.player1_username, row.player2_username, row.player3_username, row.player4_username]
			const didPlayersSetBase = [row.player1_didPlaceBase, row.player2_didPlaceBase, row.player3_didPlaceBase, row.player4_didPlaceBase]
			
			for (let i = 0; i < playerSlots.length && playerSlots[i] != null; i++) {
				if (playerSlots[i] == uname) 
					playerColumn = i + 1
				else
					numBasesPlaced += didPlayersSetBase[i]
				
				numPlayersJoined++
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

		var gameStateNum = (numBasesPlaced == numPlayersJoined) ? 2 : 1

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

// Sets game sessions to not active
// Params:
//		:gameId - ID of game session to kill
app.get('/kill-game/:gameId', (req, res) => {
	let { gameId } = req.params
	DB.run(`UPDATE GameSessions SET is_active=:0, game_state=:1 WHERE id=:2;`, 0, 3, gameId, (err) => {
		if (err) 
			res.send({err})
		else 
			res.send("Success")
	});
})

// ~~~~~~~~~~~~~~~~Zombie Stuff~~~~~~~~~~~~~~~~~


app.get('/request-wave/:gameId', (req, res) => {
	console.log('In request-wave');
	//check to see if wave exists
	const gameID = req.params.gameId;
	var waveMade = waveDataBase.hasOwnProperty(gameID)
	const numberZombies = 15;
	if (waveMade) {
		var w = waveDataBase[gameID];
		json = JSON.stringify(w);
		res.send(json);	
	} else {	

		var seedAr = {};
		for(var i = 0; i < numberZombies; i++) {
			seedAr[i.toString()] = new ZombieSeed(i);
		}
		var wave = 1;
		globalWave = new Seeds(wave, seedAr);
		waveDataBase[gameID] = globalWave
		json = JSON.stringify(globalWave);
		res.send(json);

	}
})

app.post('/update-wave/:gameId', (req, res) => {
	console.log("In update-wave!!");
	var json = req.body;
	console.log(json);
	const gameID = req.params.gameId;

	//get database object
	var seedsObj = waveDataBase[gameID];
	var waveNum = seedsObj.waveNumber;
	var waveArray = seedsObj.zombieWave;
	
	//update wave with deaths by removing
	for (var key in json) {
		var ret = waveArray[key];
		if(ret == undefined) {
			continue;
		} else {
			delete waveArray[key]; //removing form array
		}
	}

	//store updated array
	waveDataBase[gameID] = new Seeds(waveNum, waveArray);

	//send back updated array as it might contain other players stuff
	json = JSON.stringify(waveDataBase[gameID]);
	res.send(json)
});


function isEmpty(obj) {
	for(var key in obj) {
		if(obj.hasOwnProperty(key))
			return false
	}
	return true;
}

app.get('/new-wave/:waveNum/:gameId', (req, res) => {

	//Calculate number of zombies
	const zombieCap = 35;
	const waveNum = parseInt(req.params.waveNum, 10);
	const gameId = req.params.gameId;
	var numberOfZombies = 15 + (waveNum-1) * 5;
	if (numberOfZombies >= zombieCap) {
		numberOfZombies = zombieCap;
	}

	// get curretn wave
	var seedObj = waveDataBase[gameId]
	var waveArray = seedObj.zombieWave;

	//new wave for this game ID hasn't been made yet
	console.log(waveArray)
	if(isEmpty(waveArray)) {
		//reset ack count in database since jumping to received-zombie endpoint again
		DB.run(`UPDATE GameSessions SET ack_count=:0 WHERE id=:1;`, 0, gameId, (err) => {
			if (err) {
				res.send({err})
				return
			}
		});
		
		var seedAr = {};
		for(var i = 0; i < numberOfZombies; i++) {
			seedAr[i.toString()] = new ZombieSeed(i);
		}
		var wave = waveNum + 1;
		globalWave = new Seeds(wave, seedAr);
		//store in "database"
		waveDataBase[gameId] = globalWave;
		var json = JSON.stringify(globalWave);
		res.send(json);			
	} else {
		var w = waveDataBase[gameId];
		var json = JSON.stringify(w);
		res.send(json);
	}
	
});

app.get('/received-zombie/:gameId', (req, res) => {
	const { gameId } = req.params

	DB.get(`SELECT ack_count FROM GameSessions WHERE id = :0`, gameId, (err, row) => {
		if (err) {
			res.send({err})
			return
		}

		if (row) {
			const newAckCount = row.ack_count + 1

			DB.run(`UPDATE GameSessions SET ack_count=:0 WHERE id=:1;`, newAckCount, gameId, (err) => {
				if (err) res.send({ err });
				else res.send("Success")
			})
		}
		else
			res.send({err: "Game session does not exist"})
	})
})

app.get('/game-ready/:gameId', (req, res) => {
	const gameId = req.params.gameId
	DB.get(`SELECT * FROM GameSessions WHERE id = :0`, gameId, (err, row) => {
		if (err) {
			res.send({err})
			return
		}

		if (row) {
			const playerSlots = [row.player1_username, row.player2_username, row.player3_username, row.player4_username]
			
			const numPlayers = playerSlots.reduce((count, player) => {
				return (player == null) ? count : count + 1
			}, 0)

			res.send({ isReady: (numPlayers == row.ack_count) })
		}
		else
			res.send({err: "Game session does not exist"})
	})
})

///////////////////////////////
///// INVENTORY ENDPOINTS /////
///////////////////////////////

app.get('/add-to-inventory/:gameId/:uname/:item', (req, res) => {
	const { gameId, uname, item } = req.params

	DB.get(`SELECT id FROM Items WHERE item_name = :0`, item, (err, row) => {

		if (err) {
			res.send({err})
			return
		}
		else if (!row || row.length == 0) {
			res.send({err: "Item does not exist"})
		}

		let itemId = row.id

		DB.run(`INSERT INTO Inventories (game_id, item_id, player_name)
				VALUES (:0, :1, :2);`, gameId, itemId, uname, (err) => {
			if (err) 
				res.send({err})
			else
				res.send("Success")
		})
	})
})

app.get('/fetch-inventory-items/:gameId/:uname', (req, res) => {
	const { gameId, uname } = req.params
	var items = []

	DB.all(`SELECT * fROM Inventories INNER JOIN Items ON Inventories.item_id = Items.id WHERE game_id=:0 AND player_name=:1;`, [gameId, uname], (err, rows) => {
		if (err) {
			res.send({err})
			return
		}

		for (i in rows)
			items.push(rows[i].item_name)
		
		res.send({items})
	})
})

app.get('/fetch-thumbnail/:item', (req, res) => {
	const { item } = req.params

	DB.get(`SELECT png_name FROM Items WHERE item_name=:0;`, item, (err, row) => {

		if (err)
			res.send({err})
		
		if (row) {
			const png_name = row.png_name

			const options = {
				root: path.join(__dirname, 'inventoryItems')
			}

			res.sendFile(png_name, options, (err) => {
				if (err) {
					console.log("Failed to send file: " + err.message)
					res.send({err})
				}
			})
		}
	})
})
