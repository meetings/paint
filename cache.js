/*\
 *  cache.js, keep and refresh in memory data
 *
 *  2013-10-08 / Meetin.gs
\*/

var _    = require('underscore')
var http = require('request')
var util = require('util')
var zlib = require('zlib')

var HTTP_TIMEOUT = 12000

var Cache = {}

function say() {
    util.log(util.format.apply(null, arguments))
}

function isKnownURL(url) {
    return _.has(Cache, url)
}

function isInCache(url) {
    return Cache[url].fetched
}

function fillCacheWithGoodness(url, result, callback) {
    var opts = {
        uri:     url,
        timeout: HTTP_TIMEOUT,
        headers: {
            'Cache-Control': 'no-cache',
            'If-None-Match': Cache[url].etag
        }
    }

    http(opts, function(err, response, data) {
        var msg = 'OK'
        var code = 200

        if (err) {
            code = 500
            msg = 'Internal Proxy Error'
            say('Error fetching %s', url)
        }
        else if (response.statusCode === 304) {
            Cache[url].timestamp = Date.now()
        }
        else if (response.statusCode !== 200) {
            msg = 'Unknown'
            code = response.statusCode
            say('Received a response code %s from %s', code, url)
        }
        else {
            zlib.gzip(data, function(err, buffer) {
                msg = buffer

                Cache[url].data      = buffer
                Cache[url].etag      = response.headers.etag
                Cache[url].fetched   = true
                Cache[url].timestamp = Date.now()

                say('Cache update: %s', url)
            })
        }

        if (_.isFunction(callback)) {
            callback(result, code, msg)
        }
    })
}

function refreshLikeTheresNoTomorrow() {
    var purge = []
    var now = Date.now()

    for (var key in Cache) {
        if (Cache[key].start > now) {
            continue
        }

        if (Cache[key].stop < now) {
            purge.push(key)
            continue
        }

        if (Cache[key].timestamp + Cache[key].interval < now) {
            fillCacheWithGoodness(key, null, null)
        }
    }

    purge.forEach(function(key) {
        say('Deleting a cache entry: %s', key)

        delete Cache[key]
    })
}

function reply(req, result, callback) {
    var key = req.url

    if (isKnownURL(key) && isInCache(key)) {
        callback(result, 200, Cache[key].data)
        return
    }

    if (!isKnownURL(key)) {
        say('Creating a cache entry: %s', key)

        Cache[key] = {
            fetched:  false,
            etag:     'null',
            start:    req.start,
            stop:     req.stop,
            interval: req.interval
        }
    }

    fillCacheWithGoodness(key, result, callback)
}

function refresh() {
    setInterval(refreshLikeTheresNoTomorrow, 1000)
}

module.exports = {
    reply:   reply,
    refresh: refresh
}
