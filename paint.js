#!/usr/bin/env nodejs

/*\
 *  paint.js
 *
 *  2013-10-07 / Meetin.gs
\*/

var _     = require('underscore')
var app   = require('express')()
var util  = require('util')
var cache = require('./cache')

var LISTENING_PORT = 8000
var DEFAULT_INTERVAL = 10000
var DEFAULT_REFRESH_TIME = 60 * 60 * 1000

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
        parsed.stop = Date.now() + DEFAULT_REFRESH_TIME
    }
    else {
        parsed.stop = Date.parse(stop)
    }

    if (_.isUndefined(start)) {
        parsed.start = Date.now()
    }
    else {
        parsed.start = Date.parse(start)
    }

    if (_.isUndefined(interval)) {
        parsed.interval = DEFAULT_INTERVAL
    }
    else {
        parsed.interval = interval
    }

    if (parsed.start >= parsed.stop) {
        parsed.fail = true
        parsed.code = 408
        parsed.message = 'Silly Request\n'
    }

    return parsed
}

function reply(result, code, data) {
    result.status(code).send(data)
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

app.post('/', paint).listen(LISTENING_PORT)

util.log('Listening port ' + LISTENING_PORT)

function debug(msg, obj) {
    console.log("DEBUG :: " + msg + " ::")
    console.log(util.inspect(obj, {showHidden: true, depth: null, colors: true}))
}
