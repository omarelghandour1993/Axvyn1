'use strict';

const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res) {
  res.sendFile(
    path.join(__dirname, 'public', 'index.html')
  );
});

app.listen(port, '0.0.0.0', function() {
  console.log(
    'Axvyn is running at http://localhost:' + port
  );
});
