#!/usr/bin/env nodejs

/*\
 *  paint.js
 *
 *  2013-10-17 / Meetin.gs
\*/

var Q     = require('q')
var _     = require('underscore')
var app   = require('express')()
var util  = require('util')
var cache = require('./cache')
var pkg   = require('./package.json')

var Json = process.env.PAINT_CONF || '/etc/paint.json'
var Conf = require(Json)

function toInt(n) {
    return parseInt(n, 10)
}

function parseRequest(req) {
    var parsed = {
        messages: {
            '200': 'OK',
            '400': 'Bad Request',
            '401': 'Unauthorized',
            '408': 'Request Timeout'
        }
    }

    var url      = req.param('url')
    var auth     = req.param('auth')
    var stop     = req.param('stop')
    var start    = req.param('start')
    var gzip     = req.param('gunzip')
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

    var reply = function(cache) {
        var headers = req.gzip? {'Content-Encoding': 'gzip'}: {}

       ;['ETag', 'Date', 'Last-Modified'].forEach(function(key) {
            if (_.has(cache.headers, key.toLowerCase())) {
                headers[key] = cache.headers[key.toLowerCase()]
            }
        })

        debug("lähetetään OTSAKKEET", headers)

        result.set(headers).send(req.gzip? cache.zipped: cache.data)
    }

    if (req.code !== 200) {
        result.status(req.code).send(req.messages[req.code])
    }
    else {
        Q(req).then(cache.fetch).then(reply, err).done()
    }
}

app.get('/', paint)

app.listen(Conf.listening_port)

cache.init(pkg.name, pkg.version)

util.log(pkg.name + ' ' + pkg.version)
util.log(pkg.description + ' by Meetin.gs Ltd')
util.log('Listening on port ' + Conf.listening_port)

function debug(msg, obj) {
    console.log("DEBUG :: " + msg + " ::")
    console.log(util.inspect(obj, {showHidden: true, depth: 1, colors: true}))
}
