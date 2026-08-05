import express from 'express';
const app = express();
app.get('/', (req, res) => res.send('shield-anchor running on port 4004'));
app.listen(4004, () => console.log('shield-anchor started on 4004'));
