// Quick server test to verify seat reservation fix
const WebSocket = require('ws');

// Test Railway server to see if our nuclear option deployed
const SERVER_URL = 'wss://metadesk-dev.up.railway.app';

console.log('🧪 Testing MetaDesk RAILWAY server connection...');
console.log(`📡 Connecting to: ${SERVER_URL}`);
console.log('⏰ Testing after NUCLEAR V3 deployment...');

const ws = new WebSocket(SERVER_URL);

ws.on('open', function() {
    console.log('✅ WebSocket connected!');
    
    // Try to join the public room directly
    const joinMessage = {
        id: 'join_public',
        method: 'joinOrCreate',
        roomName: 'MetaDeskPublic',
        options: {}
    };
    
    console.log('🎯 Attempting to join MetaDeskPublic room...');
    ws.send(JSON.stringify(joinMessage));
});

ws.on('message', function(data) {
    try {
        const message = JSON.parse(data);
        console.log('📨 Server response:', message);
        
        if (message.error) {
            console.log('❌ Error received:', message.error);
            if (message.error.includes('seat reservation')) {
                console.log('🚨 SEAT RESERVATION ERROR STILL OCCURRING!');
                console.log('❌ Railway deployment has NOT picked up our nuclear option!');
            }
        } else if (message.roomId) {
            console.log('✅ Successfully joined room:', message.roomId);
            console.log('🎉 NO SEAT RESERVATION ERRORS!');
            console.log('🚀 NUCLEAR V3 DEPLOYMENT SUCCESSFUL!');
        }
    } catch (e) {
        console.log('📋 Raw message:', data.toString());
    }
});

ws.on('error', function(error) {
    console.log('❌ WebSocket error:', error.message);
});

ws.on('close', function(code, reason) {
    console.log(`🔌 Connection closed. Code: ${code}, Reason: ${reason}`);
});

// Timeout after 15 seconds to allow more time for Railway
setTimeout(() => {
    console.log('⏰ Test timeout reached');
    ws.close();
    process.exit(0);
}, 15000);