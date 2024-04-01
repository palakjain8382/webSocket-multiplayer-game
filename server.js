const http = require('http');
const WebSocket = require('ws');
const { MongoClient } = require('mongodb');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

let clients = [];
let messages = [];

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

    clients.push(ws);

    // Send all stored messages to the newly connected client
    ws.send(JSON.stringify({ type: 'messages', data: messages }));

    ws.on('message', async (message) => {
        console.log('Message received: ', message);
    
        try {
            // Attempt to parse the incoming message as JSON
            const data = JSON.parse(message);
            messages.push(data);
            broadcast(JSON.stringify({ type: 'message', data: messages }));
    
            // Update MongoDB with the latest message by appending it to the messages array
            const db = client.db('aws-multiplayer-game');
            const collection = db.collection('messages');
            await collection.updateOne({}, { $push: { messages: data } }, { upsert: true });
        } catch (error) {
            // If parsing as JSON fails, treat it as plain text
            console.error('Error parsing JSON:', error.message);
            messages.push(message.toString()); // Store plain text as string
            broadcast(JSON.stringify({ type: 'message', data: messages }));
    
            // Update MongoDB with the latest message by appending it to the messages array
            const db = client.db('aws-multiplayer-game');
            const collection = db.collection('messages');
            await collection.updateOne({}, { $push: { messages: message.toString() } }, { upsert: true });
        }
    });
    

    ws.on('close', () => {
        console.log('User disconnected');

        // Remove client from clients array
        clients = clients.filter((client) => client !== ws);
    });
});

function broadcast(message) {
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
