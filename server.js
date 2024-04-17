
const http = require('http');
const WebSocket = require('ws');
const { MongoClient } = require('mongodb');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

let rooms = {}; // Object to store rooms
let clientRooms = {}; // Object to map clients to rooms
let messages = {}; // Object to store messages for each room
let currentPlayerName = '';

// MongoDB connection URI
const uri = 'mongodb://localhost:27017';
const client = new MongoClient(uri);

// Connect to MongoDB
client.connect()
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch(err => {
        console.error('Error connecting to MongoDB:', err);
    });

wss.on('connection', (ws) => {
    console.log('A user connected');

    ws.on('message', async (message) => {
        try {
            // Attempt to parse the incoming message as JSON
            const data = JSON.parse(message);
            handleMessage(data, ws); // Handle JSON message
        } catch (error) {
            // If parsing as JSON fails, treat it as plain text
            console.error('Error parsing JSON:', error.message);
        }
    });
});

function handleMessage(data, ws) {
    switch (data.type) {
        case 'createRoom':
            createRoom(data.roomName, ws); 
            break;
        case 'joinRoom':
            joinRoom(data.roomName, ws);
            break;
        case 'message':
            // Ensure that the message includes the roomName
            if (data.roomName && rooms[data.roomName]) {
                broadcastToRoom(data.roomName, { type: 'chatMessage', username: data.username, text: data.message });
                console.log('in cases: ',data.message);
                updateMongoDB(data.roomName, data.username, data.message); // Update MongoDB with the message
            } else {
                console.log('Failed to send message. Room not found or unauthorized.');
            }
            break;  
        case 'setName':
            if (!ws.username) {
                ws.username = data.username;
                currentPlayerName = data.username;
                console.log("username: ", ws.username);
            }
            break;
        case 'startGame':
            startGame(data.roomName);
            break;
        default:
            console.error('Invalid message type:', data.type);
    }
}


function createRoom(roomName, ws) {
    if (!rooms[roomName]) {
        rooms[roomName] = { players: [], clients: [ws] };
        clientRooms[ws] = roomName;
        messages[roomName] = [];
        ws.send(JSON.stringify({ type: 'roomCreated', roomName }));
        console.log('Room created:', roomName);
        broadcastPlayerList(roomName); // Broadcast the player list to all clients in the room
        printPlayersAndRooms();
    } else {
        ws.send(JSON.stringify({ type: 'roomExists', roomName }));
        console.log('Room already exists:', roomName);
    }
}

// Modify joinRoom function to prevent auto-adding users and handle reconnections
  async function joinRoom(roomName, ws) {
    if (!rooms[roomName]) {
        createRoom(roomName, ws);
    }
    if (rooms[roomName]) {
        // if (!rooms[roomName].players.includes(currentPlayerName)) { // Check if player is already in the room
            rooms[roomName].clients.push(ws);
            clientRooms[ws] = roomName;
            rooms[roomName].players.push(currentPlayerName);
            await updateMongoDBPlayer(roomName, currentPlayerName);
            setTimeout(() => {
                ws.send(JSON.stringify({ type: 'joinedRoom', roomName, players: rooms[roomName].players, currentPlayerName }));
                ws.send(JSON.stringify({ type: 'message', data: messages[roomName] }));
                console.log('User ', currentPlayerName, ' joined room:', roomName);
                broadcastPlayerList(roomName); // Broadcast the updated player list to all clients in the room
            }, 4000);
        }
        else {
            // Handle reconnection, send only room data without adding user again
            ws.send(JSON.stringify({ type: 'joinedRoom', roomName, players: rooms[roomName].players, currentPlayerName }));
            ws.send(JSON.stringify({ type: 'message', data: messages[roomName] }));
            console.log('User ', currentPlayerName, ' reconnected to room:', roomName);
        }}
//     } else {
//         console.log('Failed to join room. Room not found:', roomName);
//     }
// }

function broadcastToRoom(roomName, message) {
    rooms[roomName].clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

async function updateMongoDB(roomName, playerName, message) {
    console.log('playername in mongo func: ',playerName);
    const db = client.db('ws-aws-multiplayer-game');
    const collection = db.collection('rooms');
    await collection.updateOne(
        { roomName },
        {
            $push: { messages: { playerName, message } },
        },
        { upsert: true }
    );
}


async function updateMongoDBPlayer(roomName, playerName) {
    const db = client.db('ws-aws-multiplayer-game');
    const collection = db.collection('rooms');
    await collection.updateOne(
        { roomName },
        {
            $addToSet: { players: playerName } // Ensure unique players in the room
        },
        { upsert: true }
    );
}


function startGame(roomName) {
    if (rooms[roomName]) {
        broadcastToRoom(roomName, { type: 'gameStarted' });
        broadcastToRoom(roomName, { type: 'redirectToChat' });
        console.log('Game started in room:', roomName);
    } else {
        console.log('Failed to start game. Room not found:', roomName);
    }
}

function broadcastPlayerList(roomName) {
    const playerList = rooms[roomName].players;
    const message = JSON.stringify({ type: 'playerList', data: playerList });
    broadcastToRoom(roomName, message);
}

function printPlayersAndRooms() {
    console.log('Current rooms:');
    Object.entries(rooms).forEach(([roomName, room]) => {
        console.log(`Room: ${roomName}`);
        console.log('Players:', room.players.join(', '));
        console.log('-------------');
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
