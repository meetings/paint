#!/usr/bin/env nodejs

/*\
 *  paint.js
 *
 *  2013-10-10 / Meetin.gs
\*/

var _     = require('underscore')
var app   = require('express')()
var util  = require('util')
var cache = require('./cache')
var pkg   = require('./package.json')

var LISTENING_PORT           = 8000
var DEFAULT_REFRESH_INTERVAL = 30 * 1000
var DEFAULT_REFRESH_DURATION = 60 * 60 * 1000
var REPLY_ENCODING           = { 'Content-Encoding': 'gzip' }

function toInt(n) {
    return parseInt(n, 10)
}

function parseRequest(req) {
    var parsed = {}

    var url      = req.param('url')
    var stop     = req.param('stop')
    var start    = req.param('start')
    var interval = req.param('interval')

    if (_.isUndefined(url)) {
        parsed.fail = true
        parsed.code = 400
        parsed.message = 'Bad Request\n'
    }

    parsed.url = url

    if (_.isUndefined(stop)) {
        parsed.stop = Date.now() + DEFAULT_REFRESH_DURATION
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
        parsed.stop = Date.now() + DEFAULT_REFRESH_DURATION
    }

    if (_.isNaN(parsed.start)) {
        parsed.start = Date.now()
    }

    if (_.isUndefined(interval)) {
        parsed.interval = DEFAULT_REFRESH_INTERVAL
    }
    else {
        parsed.interval = toInt(interval)
    }

    if (parsed.start >= parsed.stop) {
        parsed.fail = true
        parsed.code = 408
        parsed.message = 'Silly Request\n'
    }

    return parsed
}

function reply(result, code, data) {
    result.status(code).set(REPLY_ENCODING).send(data)
}

function paint(request, result) {
    var req = parseRequest(request)

    if (req.fail === true) {
        result.status(req.code).send(req.message)
    }
    else {
        cache.reply(req, result, reply)
    }
}

app.get('/', paint)

app.listen(LISTENING_PORT)

cache.refresh()

util.log(pkg.name + ' ' + pkg.version)
util.log(pkg.description + ' by Meetin.gs Ltd')
util.log('Listening on port ' + LISTENING_PORT)
