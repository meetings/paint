/*\
 *  cache.js, keep and refresh in memory data
 *
 *  2013-10-07 / Meetin.gs
\*/

var _    = require('underscore')
var http = require('request')
var util = require('util')

var HTTP_TIMEOUT = 12000

var Cache = {}

function isKnownURL(url) {
    return _.has(Cache, url)
}

function isInCache(url) {
    return Cache[url].fetched
}

function reply(req, result, callback) {
    var key = req.url

    if (isKnownURL(key) && isInCache(key)) {
        callback(result, 200, Cache[key].data)
    }
    else if (isKnownURL(key)) {
        fillCacheWithGoodness(req, result, callback)
    }
    else {
        Cache[key] = { fetched: false }

        fillCacheWithGoodness(req, result, callback)
    }
}

function fillCacheWithGoodness(req, result, callback) {
    var opts = {
        uri:     req.url,
        headers: { 'Cache-Control': 'no-cache' },
        timeout: HTTP_TIMEOUT
    }

    http(opts, function(err, response, data) {
        if (!err && response.statusCode === 200) {
            Cache[req.url].data      = data
            Cache[req.url].fetched   = true
            Cache[req.url].timestamp = Date.now()
            callback(result, 200, data)
        }
        else {
            Cache[req.url].fetched = false
            callback(result, 404, '')
        }
    })
}

module.exports = {
    reply: reply
}

function debug(msg, obj) {
    console.log("DEBUG :: " + msg + " ::")
    console.log(util.inspect(obj, {showHidden: true, depth: null, colors: true}))
}
