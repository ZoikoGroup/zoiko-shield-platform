import express from 'express';
const app = express();
app.get('/', (req, res) => res.send('shield-ai running on port 4002'));
app.listen(4002, () => console.log('shield-ai started on 4002'));
