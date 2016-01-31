var express = require('express');
var path = require('path');
var debug = require('debug')('workspace:server');
var http = require('http');

var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require('express-session')({
    secret: "secret",
    key: 'secret.sid',
    resave: true,
    saveUninitialized: true,
});

var sharedSession = require('express-socket.io-session');
var openid = require('openid');

var app = express();

var port = normalizePort(process.env.PORT || '3000');
app.set('port', port);

var server = http.Server(app);

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

function normalizePort(val) {
    var port = parseInt(val, 10);

    if (isNaN(port)) {
        return val;
    }

    if (port >= 0) {
        return port;
    }

    return false;
}

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    var bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;

    switch (error.code) {
        case 'EACCES':
        console.error(bind + ' requires elevated privileges');
        process.exit(1);
        break;
        case 'EADDRINUSE':
        console.error(bind + ' is already in use');
        process.exit(1);
        break;
        default:
        throw error;
    }
}

function onListening() {
    var addr = server.address();
    var bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;
    console.log('Listening on ' + bind);
}

var io = require('socket.io')(server);

var socketUsers = [];

io.use(sharedSession(session, {
    autoSave: true
}));

io.on('connection', function(socket) {
    socketUsers.push(socket);

    console.log('Player connected: ' + socket.id);

    socket.on('disconnect', function() {
        socketUsers.splice(socketUsers.indexOf(socket), 1);
    });

    function broadcast(key, value) {
        io.emit(key, value);
    }
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));

app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session);

function createRelyingParty(req) {
    var baseUrl = req.protocol + "://" + req.get("host");
    return new openid.RelyingParty(baseUrl + "/verify", baseUrl, true, false, []);
}

// for every request lets make the user session available to the templates
app.use(function(req, res, next) {
    res.locals.user = req.session.user;
    next();
});

app.get("/", function(req, res) {
    res.render('index', {
        title: 'Hello Title!',
        session: (typeof req.session.user !== 'undefined') ? req.session.user : ''
    });
});

app.get("/login", function(req, res) {
    createRelyingParty(req).authenticate("http://steamcommunity.com/openid", false, function(e, authUrl) {
        if (e) {
            return res.redirect("/");
        }
        res.redirect(authUrl);
    });
});

app.get("/verify", function(req, res) {
    createRelyingParty(req).verifyAssertion(req, function(e, result) {

        if (!result.authenticated) {
            return res.redirect("/");
        }

        var IDENTIFIER_REGEX = /^https?:\/\/steamcommunity\.com\/openid\/id\/([0-9]+)$/;
        var matches = IDENTIFIER_REGEX.exec(result.claimedIdentifier);

        if (matches === null) {
            return res.redirect("/");
        }

        req.session.user = matches[1]; // steam64
        return res.redirect("/");
    });

});

app.get("/logout", function(req, res) {
    req.session.destroy(function(err) {
        res.redirect("/");
    });
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});
