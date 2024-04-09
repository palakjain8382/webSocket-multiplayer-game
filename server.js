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

    // ws.on('close', () => {
    //     console.log('User disconnected');
    //     removeClientFromRoom(ws);
    // });
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
            sendMessageToRoom(data.roomName, data.message, ws);
            break;
        case 'setName':
            // Handle setting the user's name
            ws.username = data.username;
            currentPlayerName = data.username;
            console.log("username: ",ws.username);
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

function joinRoom(roomName, ws) {
    if (!rooms[roomName]) {
        createRoom(roomName, ws);
    }
    if (rooms[roomName]) {
        // Add the player to the room
        // rooms[roomName].players.push(currentPlayerName);
        rooms[roomName].clients.push(ws);
        clientRooms[ws] = roomName;

        // Add the new player to the player list in the room
        rooms[roomName].players.push(currentPlayerName);

        // Send roomJoined message to the client with the player's name after a delay
        setTimeout(() => {
            ws.send(JSON.stringify({ type: 'joinedRoom', roomName, players: rooms[roomName].players, currentPlayerName }));
            console.log("players list...: ", rooms[roomName].players);

            // Send all stored messages to the newly joined client
            ws.send(JSON.stringify({ type: 'messages', data: messages[roomName] }));

            console.log('User ', currentPlayerName, ' joined room:', roomName);
            broadcastPlayerList(roomName); // Broadcast the updated player list to all clients in the room
        }, 4000); // Adjust the delay time (in milliseconds) as needed
    } else {
        console.log('Failed to join room. Room not found:', roomName);
        // Optionally, you can handle this case by notifying the client and taking appropriate action
    }
}


function sendMessageToRoom(roomName, message, ws) {
    if (rooms[roomName] && clientRooms[ws] === roomName) {
        const messageData = { sender: ws.username, message };
        messages[roomName].push(messageData);
        broadcastToRoom(roomName, { type: 'message', data: messageData });
        updateMongoDB(roomName, messageData);
        console.log('Message sent to room:', roomName);
    } else {
        console.log('Failed to send message. Room not found or unauthorized.');
    }
}

function broadcastToRoom(roomName, message) {
    rooms[roomName].clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

async function updateMongoDB(roomName, messageData) {
    const db = client.db('aws-multiplayer-game');
    const collection = db.collection('rooms');
    await collection.updateOne({ roomName }, { $push: { messages: messageData } }, { upsert: true });
}

// function removeClientFromRoom(ws) {
//     const roomName = clientRooms[ws];
//     if (rooms[roomName]) {
//         rooms[roomName].players = rooms[roomName].players.filter(player => player !== ws.username);
//         rooms[roomName].clients = rooms[roomName].clients.filter(client => client !== ws);
//         delete clientRooms[ws];
//         console.log('Client removed from room:', roomName);
//         broadcastPlayerList(roomName);
//     }
// }


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
