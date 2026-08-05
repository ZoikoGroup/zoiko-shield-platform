import express from 'express';
const app = express();
app.get('/', (req, res) => res.send('shield-action running on port 4003'));
app.listen(4003, () => console.log('shield-action started on 4003'));
