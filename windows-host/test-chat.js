const io = require('socket.io-client');
const host = io('http://localhost:4000');
const guest = io('http://localhost:4000');

host.on('connect', () => {
  host.emit('room:create', { name: 'HostName' }, (res) => {
    console.log('Host created room:', res.code);
    guest.emit('room:join', { code: res.code, name: 'GuestName' }, (joinRes) => {
      console.log('Guest joined:', joinRes.ok);
      
      host.on('chat:message', (msg) => {
        console.log('HOST RECEIVED CHAT:', msg);
        process.exit(0);
      });

      guest.emit('chat:message', { text: 'Hi from guest' });
    });
  });
});
