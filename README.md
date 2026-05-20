npm run dev

cd hardware

node serial-bridge.js /dev/ttyACM0
sudo mongod --dbpath /data/db

cd wallet_server/src
node server.js
