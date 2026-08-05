import express from 'express';
const app = express();
app.get('/', (req, res) => res.send('shield-ingest running on port 4001'));
app.listen(4001, () => console.log('shield-ingest started on 4001'));
