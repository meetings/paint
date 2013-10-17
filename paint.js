#!/usr/bin/env nodejs

/*\
 *  paint.js
 *
 *  2013-10-25 / Meetin.gs
\*/

var Q           = require('q')
var _           = require('underscore')
var app         = require('express')()
var http        = require('http')
var httpRequest = require('request')
var util        = require('util')
var cache       = require('./cache')
var pkg         = require('./package.json')

var PING_TIMEOUT  = 1000
var PING_INTERVAL = 2000

var Json = process.env.PAINT_CONF || '/etc/paint.json'
var Conf = require(Json)

var PeerStatus    = 0
var PrimaryPasswd = ''

if (!_.isEmpty(Conf.auth_token_list)) {
    PrimaryPasswd = Conf.auth_token_list[0]
}

function toInt(n) {
    return parseInt(n, 10)
}

function parseRequest(req) {
    var parsed = {}

    var url      = req.param('url')
    var auth     = req.param('auth')
    var stop     = req.param('stop')
    var start    = req.param('start')
    var gzip     = req.param('gunzip')
    var peer     = req.param('peer')
    var interval = req.param('interval')

    if (_.isUndefined(url)) {
        parsed.code = 400
        return parsed
    }

    parsed.url  = url
    parsed.code = 200

    if (!_.isEmpty(Conf.auth_token_list)) {
        if (!_.contains(Conf.auth_token_list, auth)) {
            parsed.code = 401
        }
    }

    if (_.isUndefined(stop)) {
        parsed.stop = Date.now() + toInt(Conf.def_refresh_duration)
    }
    else {
        parsed.stop = Date.UTC.apply(null, stop.split('-').map(toInt))
    }

    if (_.isUndefined(start)) {
        parsed.start = Date.now()
    }
    else {
        parsed.start = Date.UTC.apply(null, start.split('-').map(toInt))
    }

    if (_.isNaN(parsed.stop)) {
        parsed.stop = Date.now() + toInt(Conf.def_refresh_duration)
    }

    if (_.isNaN(parsed.start)) {
        parsed.start = Date.now()
    }

    parsed.gzip = !_.isUndefined(gzip)

    parsed.peer = !_.isUndefined(peer)

    if (_.isUndefined(interval)) {
        parsed.interval = toInt(Conf.def_refresh_interval)
    }
    else {
        parsed.interval = toInt(interval)
    }

    if (parsed.start >= parsed.stop) {
        parsed.code = 408
    }

    return parsed
}

function paint(request, result) {
    var req = parseRequest(request)

    var err = function() {
        result.status(500).send('Internal Server Error')
    }

    var reply = function(cached) {
        var headers = req.gzip? {'Content-Encoding': 'gzip'}: {}

       ;['ETag', 'Date', 'Last-Modified'].forEach(function(key) {
            if (_.has(cached.headers, key.toLowerCase())) {
                headers[key] = cached.headers[key.toLowerCase()]
            }
        })

        util.log('Sending reply (with etag: ' + _.has(headers, 'ETag') + ')')

        result.set(headers).send(req.gzip? cached.zipped: cached.data)
    }

    if (req.code !== 200) {
        result.status(req.code).send(http.STATUS_CODES[req.code])
        return
    }

    util.log("Request received: " + req.url + ' (peer: ' + req.peer + ')')

    req.source = req.peer? req.url: util.format(
        '%s/?peer&auth=%s&url=%s',
        Conf.other_peer_url, PrimaryPasswd, encodeURIComponent(req.url)
    )

    function iterateUntilCached(retries) {
        return Q.resolve(cache.ensure(req)).then(function(entry) {
            return entry
        },
        function(err) {
            util.log('Encountered an error, retrying if possible')

            if (retries > 0) return iterateUntilCached(--retries)
            else return err
        })
    }

    iterateUntilCached(2).then(function(entry) {
        if (entry.cached) reply(entry)
        else err()
    })
}

function ping() {
    var opts = {
        uri:     Conf.other_peer_url + '/ping',
        timeout: PING_TIMEOUT
    }

    httpRequest(opts, function(err, head, body) {
        if (!err && body === 'PONG') {
            PeerStatus = (PeerStatus > 0)? PeerStatus+1: 1
        }
        else {
            PeerStatus = (PeerStatus < 0)? PeerStatus-1: -1
        }
    })
}

function pong(request, result) {
    result.send('PONG')
}

function state(request, result) {
    var buf = ''
    buf += 'Instance: ' + Conf.instance_id
    buf += '\n\nOther peer status: ' + PeerStatus
    buf += '\n\nCache:\n' + cache.toString()
    result.set({'Content-Type': 'text/plain'}).send(buf)
}

app.get('/', paint)
app.get('/ping', pong)
app.get('/status', state)

app.listen(Conf.listening_port)

cache.init(pkg.name, pkg.version, function() {return PeerStatus})

setInterval(ping, PING_INTERVAL)

util.log(pkg.name + ' ' + pkg.version)
util.log(pkg.description + ' by Meetin.gs Ltd')
util.log('Listening on port ' + Conf.listening_port)

/* function debug(msg, obj) {
    console.log("DEBUG :: " + msg + " ::")
    console.log(util.inspect(obj, {showHidden: true, depth: 1, colors: true}))
} */
