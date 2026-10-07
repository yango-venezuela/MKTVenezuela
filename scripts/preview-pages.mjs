import express from 'express';
import path from 'node:path';

const app = express();
app.get('/', (req, res) => res.redirect('/MKTVenezuela/'));
app.use('/MKTVenezuela', express.static(path.resolve('dist-pages'), { dotfiles: 'deny', maxAge: 0 }));
const port = Number(process.env.PORT || 4174);
app.listen(port, '127.0.0.1', () => console.log(`Pages preview: http://localhost:${port}/MKTVenezuela/`));
